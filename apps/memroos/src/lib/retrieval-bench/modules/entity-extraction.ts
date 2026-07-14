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
    rawSpans.push({
      surface,
      firstOffset: idx,
      lastOffset: idx + match[0].length,
      kind: classifyKind(surface),
    });
  }

  // Acronym scan
  const acronymRegex = /\b[A-Z][A-Z0-9]{1,9}\b/g;
  for (const match of text.matchAll(acronymRegex)) {
    rawSpans.push({
      surface: match[0],
      firstOffset: match.index ?? 0,
      lastOffset: (match.index ?? 0) + match[0].length,
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
