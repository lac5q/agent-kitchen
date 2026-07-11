/**
 * Cross-harness skill registry: SKILL.md parser, completeness scorer, and
 * registry entry normalizer.
 *
 * Security contract: All imported SKILL.md content is treated as DATA ONLY.
 * The parser never evaluates, runs, or re-emits parsed text as instructions.
 * Injection-flavored content is stored verbatim for audit purposes.
 *
 * Plan: 72-05 (SKILL-01, SKILL-02)
 * Phase 148: SKILLTRUST-01 (evidence_examples + completeness gate extension)
 *
 * SKILLTRUST-01 contract:
 *   - evidence_examples is a `string | null` extracted from a `## Evidence
 *     Examples` markdown section. The raw section text (trimmed) is preserved
 *     for audit purposes but is NEVER exposed in SkillContractSummary,
 *     SkillGovernanceEvidence, or any operator-facing evidence block because
 *     the content is untrusted imported skill data.
 *   - Empty, whitespace-only, null, or undefined evidence_examples are all
 *     treated as missing during completeness scoring.
 */

import { createHash, createHmac, timingSafeEqual } from "crypto";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TrustLevel = "unsigned" | "signed" | "verified";

export interface SkillMdParsed {
  name: string | null;
  description: string | null;
  owner: string | null;
  source_harness: string | null;
  risk_tier: string | null;
  dispatch_status: string | null;
  version: string | null;
  preconditions: string | null;
  allowed_tools: string | null;
  verification_checks: string | null;
  rollback_behavior: string | null;
  evidence_examples: string | null;
  raw_body: string;
}

export interface CompletenessScore {
  percent: number;
  missing_fields: string[];
  fields: Record<string, boolean>;
}

export interface SkillRegistryEntry {
  name: string | null;
  description: string | null;
  owner: string | null;
  source_harness: string;
  risk_tier: string | null;
  dispatch_status: string;
  version: string | null;
  preconditions: string | null;
  allowed_tools: string | null;
  verification_checks: string | null;
  rollback_behavior: string | null;
  evidence_examples: string | null;
  raw_body: string;
  completeness_pct: number;
  missing_fields: string[];
  imported_by: string;
  imported_at: string;
  content_hash: string | null;
  signature: string | null;
  signed_by: string | null;
  trust_level: TrustLevel;
}

// ---------------------------------------------------------------------------
// Contract field definitions
// ---------------------------------------------------------------------------

export const REQUIRED_CONTRACT_FIELDS: readonly string[] = [
  "name",
  "owner",
  "source_harness",
  "risk_tier",
] as const;

export const CONTRACT_COMPLETENESS_FIELDS: readonly string[] = [
  "name",
  "description",
  "owner",
  "source_harness",
  "risk_tier",
  "dispatch_status",
  "preconditions",
  "allowed_tools",
  "verification_checks",
  "rollback_behavior",
  "evidence_examples",
] as const;

// ---------------------------------------------------------------------------
// SKILL.md parser internals
// ---------------------------------------------------------------------------

function splitFrontmatterAndBody(raw: string): {
  frontmatter: string | null;
  body: string;
} {
  const trimmed = raw.trimStart();
  if (!trimmed.startsWith("---")) {
    return { frontmatter: null, body: raw };
  }
  const closeIdx = trimmed.indexOf("\n---", 3);
  if (closeIdx === -1) {
    return { frontmatter: null, body: raw };
  }
  const frontmatter = trimmed.slice(3, closeIdx).trim();
  const body = trimmed.slice(closeIdx + 4).trim();
  return { frontmatter, body };
}

function parseFrontmatterFields(fm: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of fm.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();
    if (key) {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Extracts a `## <name>` markdown section from the body. Used uniformly for
 * preconditions / allowed_tools / verification_checks / rollback_behavior /
 * evidence_examples. Returns null when the section is absent.
 */
function extractSection(body: string, sectionName: string): string | null {
  const escaped = sectionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^##\\s+${escaped}\\s*$`, "im");
  const match = pattern.exec(body);
  if (!match) return null;
  const start = match.index + match[0].length;
  const nextHeader = body.indexOf("\n##", start);
  const section = nextHeader === -1 ? body.slice(start) : body.slice(start, nextHeader);
  return section.trim() || null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parses a SKILL.md string. ALL content is treated as inert data — never
 * as instruction. Returns null for any missing field.
 *
 * SKILLTRUST-01: evidence_examples is parsed from the `## Evidence Examples`
 * markdown section (mirroring preconditions / allowed_tools / etc.). The
 * trimmed section body is stored verbatim — never evaluated as instructions.
 */
export function parseSkillMd(raw: string): SkillMdParsed {
  if (!raw || raw.trim() === "") {
    return {
      name: null,
      description: null,
      owner: null,
      source_harness: null,
      risk_tier: null,
      dispatch_status: null,
      version: null,
      preconditions: null,
      allowed_tools: null,
      verification_checks: null,
      rollback_behavior: null,
      evidence_examples: null,
      raw_body: "",
    };
  }

  const { frontmatter, body } = splitFrontmatterAndBody(raw);
  const fm = frontmatter ? parseFrontmatterFields(frontmatter) : {};

  return {
    name: fm["name"] ?? null,
    description: fm["description"] ?? null,
    owner: fm["owner"] ?? null,
    source_harness: fm["source_harness"] ?? null,
    risk_tier: fm["risk_tier"] ?? null,
    dispatch_status: fm["dispatch_status"] ?? null,
    version: fm["version"] ?? null,
    preconditions: extractSection(body, "Preconditions"),
    allowed_tools: extractSection(body, "Allowed Tools"),
    verification_checks: extractSection(body, "Verification Checks"),
    rollback_behavior: extractSection(body, "Rollback"),
    evidence_examples: extractSection(body, "Evidence Examples"),
    raw_body: body,
  };
}

/**
 * Computes a deterministic completeness score for a parsed skill entry.
 *
 * SKILLTRUST-01: `evidence_examples` is treated as a `string | null`. Empty,
 * whitespace-only, null, and undefined values all count as missing — so a
 * skill with `## Evidence Examples` containing only whitespace scores below
 * 100% and is denied by the dispatch gate.
 */
export function computeCompleteness(parsed: SkillMdParsed): CompletenessScore {
  if (!parsed) {
    const fields: Record<string, boolean> = {};
    for (const f of CONTRACT_COMPLETENESS_FIELDS) {
      fields[f] = false;
    }
    return {
      percent: 0,
      missing_fields: [...CONTRACT_COMPLETENESS_FIELDS],
      fields,
    };
  }

  const fields: Record<string, boolean> = {};
  const missing_fields: string[] = [];

  for (const f of CONTRACT_COMPLETENESS_FIELDS) {
    const val = (parsed as unknown as Record<string, unknown>)[f];
    // All contract fields are `string | null` — treat null/undefined/empty/whitespace-only
    // as missing. The original branch for `evidence_examples` as `string[]` was
    // superseded by the SKILLTRUST-01 design where evidence_examples is the
    // trimmed body of the `## Evidence Examples` markdown section.
    const present =
      typeof val === "string" ? val.trim().length > 0 : val !== null && val !== undefined;
    fields[f] = present;
    if (!present) missing_fields.push(f);
  }

  const percent = Math.round(
    ((CONTRACT_COMPLETENESS_FIELDS.length - missing_fields.length) /
      CONTRACT_COMPLETENESS_FIELDS.length) *
      100
  );

  return { percent, missing_fields, fields };
}

const VALID_DISPATCH_STATUSES = new Set(["enabled", "disabled", "incomplete", "review"]);

// ---------------------------------------------------------------------------
// Content hashing + signing (SKILLTRUST-02)
// ---------------------------------------------------------------------------

/**
 * Computes the SHA-256 hex digest of a skill's raw_body.
 * This is the content hash stored in skill_registry.content_hash.
 */
export function computeContentHash(rawBody: string): string {
  return createHash("sha256").update(rawBody, "utf8").digest("hex");
}

/**
 * Resolves the signing key from environment variables.
 * Falls back to MEMROOS_OPERATOR_API_KEY if MEMROOS_SKILL_SIGNING_KEY is unset.
 * Returns null if no key is configured (skill remains unsigned).
 */
export function resolveSigningKey(): string | null {
  return (
    process.env["MEMROOS_SKILL_SIGNING_KEY"] ??
    process.env["MEMROOS_OPERATOR_API_KEY"] ??
    null
  );
}

/**
 * Signs a content hash with the given signing key using HMAC-SHA256.
 * Returns the hex signature and the signer identifier.
 * The signer is 'operator' by default; override via MEMROOS_SKILL_SIGNER_ID env var.
 */
export function signSkill(
  contentHash: string,
  signingKey: string
): { signature: string; signedBy: string } {
  if (!signingKey) {
    throw new Error("Signing key is required to sign a skill");
  }
  const signature = createHmac("sha256", signingKey)
    .update(contentHash, "utf8")
    .digest("hex");
  const signedBy = process.env["MEMROOS_SKILL_SIGNER_ID"] ?? "operator";
  return { signature, signedBy };
}

/**
 * Verifies a skill signature against a content hash using constant-time
 * comparison to prevent timing attacks.
 */
export function verifySkillSignature(
  contentHash: string,
  signature: string,
  signingKey: string
): boolean {
  if (!signingKey || !signature) return false;
  const expected = createHmac("sha256", signingKey)
    .update(contentHash, "utf8")
    .digest("hex");
  if (expected.length !== signature.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(signature, "utf8"));
  } catch {
    return false;
  }
}

/**
 * Converts a SkillMdParsed into a SkillRegistryEntry for DB storage.
 * Dispatch fail-closed: incomplete/missing-required-fields → 'incomplete'.
 * Only a fully complete skill with explicit frontmatter 'enabled' may be enabled.
 *
 * Phase 148: computes content_hash automatically on every import.
 * trust_level defaults to 'unsigned'; signing is a separate operation.
 */
export function normalizeRegistryEntry(
  parsed: SkillMdParsed,
  source_harness: string,
  imported_by: string
): SkillRegistryEntry {
  const completeness = computeCompleteness(parsed);

  const missingRequired = REQUIRED_CONTRACT_FIELDS.filter(
    f => completeness.fields[f] === false
  );
  const hasAllRequired = missingRequired.length === 0;

  let dispatch_status: string;
  if (!hasAllRequired || completeness.percent < 100) {
    const fmStatus = parsed.dispatch_status;
    if (fmStatus === "disabled" || fmStatus === "review") {
      dispatch_status = fmStatus;
    } else {
      dispatch_status = "incomplete";
    }
  } else {
    const fmStatus = parsed.dispatch_status;
    if (fmStatus && VALID_DISPATCH_STATUSES.has(fmStatus)) {
      dispatch_status = fmStatus;
    } else {
      dispatch_status = "review";
    }
  }

  const content_hash = computeContentHash(parsed.raw_body);

  return {
    name: parsed.name,
    description: parsed.description,
    owner: parsed.owner,
    source_harness,
    risk_tier: parsed.risk_tier,
    dispatch_status,
    version: parsed.version,
    preconditions: parsed.preconditions,
    allowed_tools: parsed.allowed_tools,
    verification_checks: parsed.verification_checks,
    rollback_behavior: parsed.rollback_behavior,
    evidence_examples: parsed.evidence_examples,
    raw_body: parsed.raw_body,
    completeness_pct: completeness.percent,
    missing_fields: completeness.missing_fields,
    imported_by,
    imported_at: new Date().toISOString(),
    content_hash,
    signature: null,
    signed_by: null,
    trust_level: "unsigned",
  };
}
