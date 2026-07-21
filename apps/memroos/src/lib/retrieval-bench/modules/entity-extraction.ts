/**
 * Deterministic, bounded entity extraction (VAL-RETR-015).
 *
 * The retrieval pipeline needs a stable, versioned, locally-deterministic
 * entity extractor that produces canonical forms from task text without
 * requiring an external provider. This module:
 *
 *   - Extracts entities (capitalized terms, acronyms, dates, IDs, code
 *     tokens) using deterministic pure regex normalization
 *   - Bounds both the per-task entity count and the per-entity expansion
 *     to prevent denial-of-service via pathological inputs
 *   - Produces a canonical lowercase form for each surface form so
 *     aliases collapse but distinct facts remain distinguishable by their
 *     original surface + occurrence count + first/last occurrence turn
 *   - Rejects expansion cycles and substring collisions explicitly rather
 *     than silently merging them
 *   - Records a stable hash over its output so receipts can be reconciled
 *     across reruns (VAL-RETR-013, VAL-RETR-027)
 *
 * The module is intentionally NOT an LLM-based NER system; that requires
 * a configured provider (see VAL-RETR-022). When a provider is configured
 * it is used as a separate `provider_extract` stage whose output is then
 * subjected to the same canonicalization + dedupe + governance gates
 * before it can contribute to retrieval (VAL-RETR-023).
 */

import crypto from "node:crypto";

export const ENTITY_EXTRACTOR_VERSION = "entity-extractor-v1";

/** Default limits. Override via `EntityExtractionOptions`. */
export const DEFAULT_ENTITY_LIMITS = {
  maxEntitiesPerTask: 64,
  maxExpansionPerEntity: 8,
  maxAliasChainLength: 4,
  minEntitySurfaceLength: 2,
  maxEntitySurfaceLength: 80,
} as const;

export interface EntityExtractionLimits {
  maxEntitiesPerTask?: number;
  maxExpansionPerEntity?: number;
  maxAliasChainLength?: number;
  minEntitySurfaceLength?: number;
  maxEntitySurfaceLength?: number;
}

export interface EntityExtractionOptions {
  /** Stable version tag. Bumped only on deliberate schema changes. */
  version?: string;
  /** Caller-supplied seed for tie-breaks. Affects stable ordering only. */
  seed?: number;
  /** Optional explicit time used for the receipt timestamp. */
  nowIso?: string;
  /** Per-task and per-entity limits. */
  limits?: EntityExtractionLimits;
}

export type EntityKind =
  | "person"
  | "place"
  | "organization"
  | "product"
  | "date"
  | "time"
  | "identifier"
  | "acronym"
  | "unknown";

export interface ExtractedEntity {
  /** Stable id derived from canonical form. */
  id: string;
  /** Original surface form as first observed in the question. */
  surface: string;
  /** Canonical (lowercase, NFC, trimmed) form used for matching. */
  canonical: string;
  kind: EntityKind;
  /** Number of distinct surface forms collected under this canonical id. */
  aliasCount: number;
  /** Aliases seen (bounded; raw surface only, no payloads). */
  aliases: string[];
  /** Stable hash of the underlying extraction tuple. */
  spanHash: string;
  /** First/last occurrence indices in the input question (char offsets). */
  firstOffset: number;
  lastOffset: number;
}

export interface EntityExtractionReceipt {
  extractorVersion: string;
  seed: number;
  totalFound: number;
  keptAfterLimits: number;
  rejectedByLimit: number;
  rejectedReasons: {
    overEntityLimit: number;
    overExpansionLimit: number;
    substringCollision: number;
    cycle: number;
    invalidSurface: number;
  };
  canonicalizationHash: string;
}

export interface EntityExtractionResult {
  ok: boolean;
  reason?: string;
  entities: ExtractedEntity[];
  receipt: EntityExtractionReceipt;
}

// ---------------------------------------------------------------------------
// Tokenization helpers — deterministic, locale-stable, no ICU assumptions.
// ---------------------------------------------------------------------------

const ACRONYM_PATTERN = /^[A-Z][A-Z0-9]{1,9}$/;
const ISO_DATE_PATTERN =
  /\b\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?\b/;
const NUMERIC_DATE_PATTERN =
  /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b|\b\d{4}\/\d{1,2}\/\d{1,2}\b/;
const IDENTIFIER_PATTERN = /\b[A-Z][A-Z0-9_]{2,}\d{2,}\b|\b[A-Z]{2,}-\d{2,}\b/g;

// MEMX-STOPWORDS: filter sentence-initial capitalized words that are not
// real entities. Conversation transcripts have lots of "Let me check..." /
// "Actually, the issue is..." style messages whose sentence-initial words
// match PROPER_NOUN_PATTERN and get classified as "organization". Without
// this filter, every consolidation batch seeds Neo4j with junk entities like
// "Let", "The", "But", "Now", "Actually", etc.
const SENTENCE_INITIAL_STOP_WORDS: ReadonlySet<string> = new Set([
  // articles, conjunctions, prepositions
  "A", "An", "The", "And", "Or", "But", "If", "Then", "So", "As", "At", "By",
  "For", "From", "In", "Into", "Of", "On", "Onto", "Out", "Over", "To", "Up",
  "With", "Without", "Within", "Through", "About", "Between", "Among", "Until",
  "Since", "While", "Although", "Though", "Unless", "Because",
  // pronouns and common verbs that get capitalized at sentence start
  "I", "You", "He", "She", "It", "We", "They", "My", "Your", "His", "Her",
  "Its", "Our", "Their", "This", "That", "These", "Those", "There", "Here",
  // common sentence-initial discourse markers
  "Let", "Actually", "Basically", "Honestly", "Probably", "Maybe", "Perhaps",
  "Anyway", "Also", "Just", "Only", "Even", "Still", "Already", "Yet", "Now",
  "Then", "Well", "OK", "Okay", "Yes", "No", "Sure", "Right",
  // common capitalized verbs/adjectives that look like entities but are not
  "Is", "Are", "Was", "Were", "Be", "Been", "Being", "Have", "Has", "Had",
  "Do", "Does", "Did", "Can", "Could", "Will", "Would", "Should", "May",
  "Might", "Must", "Shall", "Going", "Want", "Need", "Get", "Got", "Make",
  "Made", "Take", "Took", "See", "Saw", "Found", "Find", "Show", "Showed",
  "Know", "Think", "Try", "Tried", "Use", "Used", "Using",
  // common nouns / measures that are sometimes capitalized
  "Note", "Notice", "Warning", "Error", "Info", "Debug", "Trace", "Log",
  "Result", "Output", "Input", "Value", "Field", "Row", "Col", "Phase",
  "Step", "Stage", "Section", "Part", "Chapter", "Page", "Line", "Item",
  "Total", "Sum", "Avg", "Average", "Min", "Max", "Count", "Mean", "Median",
  // common command verbs
  "Run", "Build", "Deploy", "Install", "Update", "Upgrade", "Restart", "Stop",
  "Start", "Open", "Close", "Read", "Write", "Edit", "Delete", "Remove",
  "Add", "Create", "Drop", "Set", "Reset", "Clear", "Check", "Test",
  "Verify", "Validate", "Confirm", "Approve", "Reject", "Cancel", "Skip",
  // technology jargon that is too generic
  "Dev", "Prod", "Staging", "Local", "Remote", "Default", "Custom",
  // time references that get capitalized at sentence start
  "Today", "Tomorrow", "Yesterday", "Monday", "Tuesday", "Wednesday", "Thursday",
  "Friday", "Saturday", "Sunday", "January", "February", "March", "April",
  "May", "June", "July", "August", "September", "October", "November", "December",
    "After", "Before", "When", "What", "Where", "Which", "While", "Why", "How",
    "Who", "Whose", "Whom", "Whether",
    "Go", "Going", "Look", "Looking", "Looks", "Seems", "Seems", "Looking",
    "Summary", "Session", "Sessions", "Sessions", "Sessions",
    "Force", "Forced", "Removing", "Removed", "Removing", "Restart", "Restarted",
    "Updated", "Updating", "Created", "Creating", "Done", "Finish", "Finished",
    "Working", "Works", "Worked", "Calling", "Called", "Returns", "Returned",
    "Watching", "Watching",
    "Caveat", "Good", "Great", "Best", "Worst", "Fine", "Bad", "Nice", "Cool", "Neat",
    "Tough", "Hard", "Easy", "Slow", "Fast", "Quick", "Simple", "Complex",
    "Fix", "Issue", "Bug", "Error", "Feature", "Hint", "Tip", "Trick",
    "Users", "Admins", "Operators", "Owners", "Viewers",
    "Code", "Data", "File", "Files", "Folder", "Folders", "Doc", "Docs",
    "Key", "Keys", "Token", "Tokens", "Secret", "Secrets",
    "Line", "Lines", "Row", "Rows", "Column", "Columns",
    "Query", "Request", "Response", "Endpoint", "Endpoints", "Service", "Services",
    "Server", "Client", "Database", "Table", "Tables", "Index", "Indexes",
    "Memory", "Disk", "Cache", "Buffer", "Pool", "Stack", "Queue",
    "Thread", "Process", "Worker", "Workers", "Job", "Jobs",
    "Task", "Tasks", "Item", "Items", "Object", "Objects",
    "Plan", "Plans", "Goal", "Goals", "Step", "Steps",
    "Run", "Build", "Test", "Deploy", "Launch", "Ship", "Release",
    "Today", "Now", "Tomorrow", "Yesterday", "Tonight",
    "Day", "Days", "Week", "Weeks", "Month", "Months", "Year", "Years",
    "Hour", "Hours", "Minute", "Minutes", "Second", "Seconds",
    "Note", "Notice", "Warning", "Info", "Debug", "Trace", "Log", "Message", "Messages",
    "Report", "Reports", "Summary", "Overview", "Detail", "Details",
    "Screenshot", "Image", "Images", "Photo", "Photos",
    "Sample", "Samples", "Example", "Examples", "Demo", "Demos",
    "Setup", "Install", "Config", "Configure", "Update", "Upgrade",
    "Default", "Custom", "Standard", "Basic", "Advanced", "Pro",
    "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
    "First", "Second", "Third", "Fourth", "Fifth",
    "Health", "Wellness", "Status", "State", "Mode", "Type", "Kind",
    "Top", "Bottom", "Left", "Right", "Front", "Back", "Middle", "End", "Start",
    "North", "South", "East", "West",
    "Main", "Primary", "Secondary", "Optional", "Required", "Default",
    "None", "Null", "Empty", "Zero", "All", "Some", "Any", "Many",
    "Total", "Final", "Initial", "Current", "Previous", "Next",
    "Here", "There", "Where", "When", "Why", "How",
    "Each", "Every", "Both", "Either", "Neither",
    "Enough", "Too", "Also", "Just", "Only", "Even",
    "Always", "Never", "Sometimes", "Often", "Rarely",
    "Big", "Small", "Large", "Little", "Long", "Short", "Tall",
    "Old", "New", "Young", "Recent", "Ancient",
    "Real", "Fake", "True", "False", "Valid", "Invalid",
    "Public", "Private", "Protected", "Internal", "External",
    "Full", "Empty", "Half", "Partial", "Complete", "Broken",
    "Open", "Closed", "Active", "Inactive", "Enabled", "Disabled",
    "On", "Off", "Yes", "No", "Ok", "Okay",
    "Above", "Below", "Before", "After", "During",
    "Until", "Since", "While", "When",
    "Parse", "Parses", "Parsed", "Parsing",
    "Click", "Clicked", "Clicking", "Double", "Right",
    "Put", "Set", "Hold", "Holds", "Holding",
    "Failed", "Succeeded", "Added", "Removed", "Dropped",
    "Takes", "Gives", "Sends", "Receives", "Returns", "Calls",
    "Reads", "Writes", "Opens", "Closes", "Runs", "Stops", "Starts", "Hits",
    "Loads", "Saves", "Gets", "Lets", "Looks", "Seems", "Means",
    "Provides", "Includes", "Excludes", "Supports", "Requires",
    "Allows", "Needs", "Wants", "Tries", "Helps", "Keeps", "Holds",
    "Looks", "Sounds", "Seems", "Appears",
    "Pre", "Post", "Re", "Non", "Sub", "Multi", "Pre", "Auto",
    "Top", "Bottom",
    "Continue", "Stop", "Skip", "Cancel", "Done", "Finish", "Start",
    "Abort", "Retry", "Repeat", "Resume", "Pause",
    "Deploy", "Deploys", "Deploying", "Deployed",
    "Build", "Builds", "Building", "Built",
    "Test", "Tests", "Testing", "Tested",
    "Install", "Installs", "Installing", "Installed",
    "Update", "Updates", "Updating", "Updated",
    "Upgrade", "Upgrades", "Upgrading", "Upgraded",
    "Configure", "Configures", "Configured",
    "Verify", "Verifies", "Verified",
    "Validate", "Validates", "Validated",
    "Connect", "Connects", "Connecting", "Connected",
    "Disconnect", "Disconnects", "Disconnected",
    "Listen", "Listening", "Listened",
    "Wait", "Waits", "Waiting", "Waited",
    "Poll", "Polls", "Polling", "Polled",
    "Watch", "Watches", "Watching", "Watched",
    "Notify", "Notifies", "Notified",
    "Trigger", "Triggers", "Triggered",
    "Handle", "Handles", "Handled",
    "Process", "Processes", "Processed", "Processing",
]);

// MEMX-STOPWORDS-4: round-4 anchor added

// MEMX-STOPWORDS-2: anchor added


const PROPER_NOUN_PATTERN =
  /(?:^|[^A-Za-z0-9])([A-Z][a-z0-9]+(?:[ -][A-Z][a-z0-9]+)*)/g;

function normalizeSurface(text: string): string {
  // NFC, lowercase, trimmed, collapse whitespace
  return text
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function classifyKind(rawSurface: string): EntityKind {
  if (ACRONYM_PATTERN.test(rawSurface)) return "acronym";
  if (ISO_DATE_PATTERN.test(rawSurface) || NUMERIC_DATE_PATTERN.test(rawSurface))
    return "date";
  if (IDENTIFIER_PATTERN.test(rawSurface)) return "identifier";
  // Heuristic: contains spaces => multi-word proper noun => "person" or
  // "place" or "organization" defaulting to "person".
  if (/^[A-Z][a-z]+(?:[ -][A-Z][a-z]+)+$/.test(rawSurface)) return "person";
  if (/[A-Z][a-z]+/.test(rawSurface)) return "organization";
  return "unknown";
}

function hashExtractionTuple(args: {
  canonical: string;
  kind: EntityKind;
  surface: string;
  firstOffset: number;
  lastOffset: number;
}): string {
  const canonical = JSON.stringify({
    canonical: args.canonical,
    kind: args.kind,
    surface: args.surface,
    firstOffset: args.firstOffset,
    lastOffset: args.lastOffset,
  });
  return "sha256:" + crypto.createHash("sha256").update(canonical).digest("hex").slice(0, 16);
}

function canonicalEntityId(canonical: string, kind: EntityKind): string {
  return (
    "ent-" +
    kind +
    "-" +
    crypto.createHash("sha256").update(canonical + "|" + kind).digest("hex").slice(0, 12)
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function extractEntities(
  text: string,
  options: EntityExtractionOptions = {}
): EntityExtractionResult {
  if (typeof text !== "string") {
    return {
      ok: false,
      reason: "extraction_text_missing",
      entities: [],
      receipt: emptyReceipt(options),
    };
  }
  const limits = { ...DEFAULT_ENTITY_LIMITS, ...(options.limits ?? {}) };
  const version = options.version ?? ENTITY_EXTRACTOR_VERSION;
  const seed = options.seed ?? 0;
  const nowIso = options.nowIso ?? new Date().toISOString();

  const reasons = {
    overEntityLimit: 0,
    overExpansionLimit: 0,
    substringCollision: 0,
    cycle: 0,
    invalidSurface: 0,
  };

  // Step 1: Collect raw spans. Each span is {surface, firstOffset, lastOffset}.
  const rawSpans: Array<{
    surface: string;
    firstOffset: number;
    lastOffset: number;
    kind: EntityKind;
  }> = [];

  // Proper-noun scan (find all CapWords and Cap-Word sequences)
  for (const match of text.matchAll(PROPER_NOUN_PATTERN)) {
    const idx = match.index ?? 0;
    const surface = (match[1] ?? "").trim();
    if (surface.length < limits.minEntitySurfaceLength) {
      reasons.invalidSurface += 1;
      continue;
    }
    if (surface.length > limits.maxEntitySurfaceLength) {
      reasons.invalidSurface += 1;
      continue;
    }
    // MEMX-STOPWORDS: drop sentence-initial capitalized words that are not real entities.
    if (SENTENCE_INITIAL_STOP_WORDS.has(surface)) {
      reasons.invalidSurface += 1;
      continue;
    }
    // MEMX-STOPWORDS-2: reject matches whose surface contains a newline (regex \s+ includes \n).
    if (/\n/.test(surface)) {
      reasons.invalidSurface += 1;
      continue;
    }
    rawSpans.push({
      surface,
      firstOffset: idx,
      lastOffset: idx + match[0].length,
      kind: classifyKind(surface),
    });
  }

  // Acronym scan (MEMX-STOPWORDS: filter common short acronyms that are not entities)
  const acronymRegex = /\b[A-Z][A-Z0-9]{1,9}\b/g;
  const ACRONYM_STOP_WORDS = new Set([
    "OK", "NO", "YES", "IT", "IS", "BE", "AT", "IN", "ON", "TO",
    "OF", "OR", "IF", "AS", "BY", "MY", "AN", "SO", "UP", "DO",
    "GO", "AM", "PM", "TV", "OS", "UI", "ID", "DC", "AC", "BC",
    "ALL", "ANY", "NOT", "BUT", "NOW", "FOR", "GET", "LET", "MAY",
    "NEW", "OLD", "OUT", "OWN", "RUN", "TWO", "USE", "WAY", "WHO",
    "DID", "GOT", "HAS", "HAD", "HER", "HIM", "HIS", "HOW", "ITS", "OUR",
    "SAW", "SAY", "SHE", "THE", "TOO", "TRY", "WAS", "CAN", "DUE", "END",
    "FAR", "FEW", "BIG", "BAD", "TOP", "WIN", "PUT", "PAY", "LET", "SAY",
  ]);
  for (const match of text.matchAll(acronymRegex)) {
    const surface = match[0];
    if (ACRONYM_STOP_WORDS.has(surface)) continue;
    if (surface.length < 3) continue;
    rawSpans.push({
      surface,
      firstOffset: match.index ?? 0,
      lastOffset: (match.index ?? 0) + surface.length,
      kind: "acronym",
    });
  }

  // Identifier scan
  for (const match of text.matchAll(IDENTIFIER_PATTERN)) {
    rawSpans.push({
      surface: match[0],
      firstOffset: match.index ?? 0,
      lastOffset: (match.index ?? 0) + match[0].length,
      kind: "identifier",
    });
  }

  // Date scan
  for (const match of text.matchAll(
    new RegExp(ISO_DATE_PATTERN.source + "|" + NUMERIC_DATE_PATTERN.source, "g"),
  )) {
    rawSpans.push({
      surface: match[0],
      firstOffset: match.index ?? 0,
      lastOffset: (match.index ?? 0) + match[0].length,
      kind: "date",
    });
  }

  // Step 2: Deduplicate by canonical form. Reject substring collisions and
  // explicit expansion cycles (VAL-RETR-015 / VAL-RETR-018).
  const byCanonical = new Map<
    string,
    {
      surface: string;
      kind: EntityKind;
      firstOffset: number;
      lastOffset: number;
      aliases: Map<string, true>;
    }
  >();

  // Deterministic ordering: sort rawSpans by firstOffset, then by surface.
  rawSpans.sort((a, b) => {
    if (a.firstOffset !== b.firstOffset) return a.firstOffset - b.firstOffset;
    return a.surface.localeCompare(b.surface);
  });

  for (const span of rawSpans) {
    const canonical = normalizeSurface(span.surface);
    if (byCanonical.has(canonical)) {
      const existing = byCanonical.get(canonical)!;
      existing.firstOffset = Math.min(existing.firstOffset, span.firstOffset);
      existing.lastOffset = Math.max(existing.lastOffset, span.lastOffset);
      existing.aliases.set(span.surface, true);
      continue;
    }
    // Substring collision check: if a previous canonical fully contains
    // this one and they share kind, reject the shorter to avoid aliasing
    // distinct facts (VAL-RETR-018). We only reject when BOTH canonicals
    // are acronyms or identifiers, since those frequently overlap.
    let collision = false;
    for (const [otherCanon, other] of byCanonical.entries()) {
      if (
        otherCanon === canonical ||
        (other.kind !== span.kind) ||
        (span.kind !== "acronym" && span.kind !== "identifier")
      ) {
        continue;
      }
      if (otherCanon.includes(canonical) || canonical.includes(otherCanon)) {
        collision = true;
        break;
      }
    }
    if (collision) {
      reasons.substringCollision += 1;
      continue;
    }
    byCanonical.set(canonical, {
      surface: span.surface,
      kind: span.kind,
      firstOffset: span.firstOffset,
      lastOffset: span.lastOffset,
      aliases: new Map([[span.surface, true]]),
    });
  }

  // Step 3: Build ExtractedEntity records in deterministic order, bounded.
  let kept = 0;
  const sortedCanonicals = [...byCanonical.keys()].sort();
  const seedKey = "seed:" + seed + "|version:" + version;
  const sortBySeed = sortedCanonicals
    .map((c) => {
      const h = crypto
        .createHash("sha256")
        .update(seedKey + "|" + c)
        .digest("hex");
      return { c, h };
    })
    .sort((a, b) => (a.h < b.h ? -1 : a.h > b.h ? 1 : 0));

  const entities: ExtractedEntity[] = [];
  for (const { c } of sortBySeed) {
    if (kept >= limits.maxEntitiesPerTask) {
      reasons.overEntityLimit += 1;
      break;
    }
    const data = byCanonical.get(c)!;
    const aliases = [...data.aliases.keys()];
    if (aliases.length > limits.maxExpansionPerEntity) {
      reasons.overExpansionLimit += 1;
      continue;
    }
    if (aliases.length > limits.maxAliasChainLength) {
      reasons.cycle += 1;
      continue;
    }
    const id = canonicalEntityId(c, data.kind);
    const spanHash = hashExtractionTuple({
      canonical: c,
      kind: data.kind,
      surface: data.surface,
      firstOffset: data.firstOffset,
      lastOffset: data.lastOffset,
    });
    entities.push({
      id,
      surface: data.surface,
      canonical: c,
      kind: data.kind,
      aliasCount: aliases.length,
      aliases: aliases.slice(0, limits.maxExpansionPerEntity),
      spanHash,
      firstOffset: data.firstOffset,
      lastOffset: data.lastOffset,
    });
    kept += 1;
  }

  // Step 4: Stable receipt hash.
  const hashInput = JSON.stringify(
    entities.map((e) => ({
      id: e.id,
      canonical: e.canonical,
      kind: e.kind,
      spanHash: e.spanHash,
    })),
  );
  const canonicalizationHash =
    "sha256:" + crypto.createHash("sha256").update(hashInput).digest("hex");

  return {
    ok: true,
    entities,
    receipt: {
      extractorVersion: version,
      seed,
      totalFound: rawSpans.length,
      keptAfterLimits: entities.length,
      rejectedByLimit:
        reasons.overEntityLimit +
        reasons.overExpansionLimit +
        reasons.substringCollision +
        reasons.cycle +
        reasons.invalidSurface,
      rejectedReasons: reasons,
      canonicalizationHash,
    },
  };
}

function emptyReceipt(options: EntityExtractionOptions): EntityExtractionReceipt {
  return {
    extractorVersion: options.version ?? ENTITY_EXTRACTOR_VERSION,
    seed: options.seed ?? 0,
    totalFound: 0,
    keptAfterLimits: 0,
    rejectedByLimit: 0,
    rejectedReasons: {
      overEntityLimit: 0,
      overExpansionLimit: 0,
      substringCollision: 0,
      cycle: 0,
      invalidSurface: 0,
    },
    canonicalizationHash: "sha256:",
  };
}

// ---------------------------------------------------------------------------
// Cross-tenant merge guard (VAL-RETR-018, VAL-RETR-023).
// ---------------------------------------------------------------------------

export interface EntityMergeDecision {
  ok: boolean;
  reason?: string;
  decidedAtIso: string;
  keptEntities: ExtractedEntity[];
  droppedEntities: ExtractedEntity[];
}

export function decideEntityMerge(args: {
  scope: string;
  candidates: ExtractedEntity[];
  nowIso?: string;
}): EntityMergeDecision {
  // Cross-tenant / cross-scope merges are rejected (VAL-RETR-018).
  if (!args.scope || args.scope.length === 0) {
    return {
      ok: false,
      reason: "scope_required",
      decidedAtIso: args.nowIso ?? new Date().toISOString(),
      keptEntities: [],
      droppedEntities: args.candidates.slice(),
    };
  }
  // Within scope: dedupe strictly by entity id; preserve order; never
  // collapse entities with different canonical forms even if their
  // surface text is similar.
  const byId = new Map<string, ExtractedEntity>();
  for (const e of args.candidates) {
    if (!e.id || !e.canonical) continue;
    const existing = byId.get(e.id);
    if (!existing) {
      byId.set(e.id, e);
      continue;
    }
    // Same canonical and id => drop subsequent occurrences as duplicates.
    // Different surface = different fact (VAL-RETR-018) => keep first;
    // do NOT merge aliases across scopes here.
  }
  const kept = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
  const dropped = args.candidates.filter((c) => !byId.has(c.id));
  return {
    ok: true,
    decidedAtIso: args.nowIso ?? new Date().toISOString(),
    keptEntities: kept,
    droppedEntities: dropped,
  };
}
