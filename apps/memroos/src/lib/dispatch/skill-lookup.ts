/**
 * Skill registry lookup for the A2A dispatcher (Plan 72-06, SKILL-03).
 *
 * Security contract:
 *   - Returned evidence MUST NOT include raw_body, preconditions, allowed_tools,
 *     verification_checks, or rollback_behavior, evidence_examples, signature,
 *     or public_key_fingerprint because these are untrusted imported content.
 *   - Only safe identifying fields (id, name, source_harness, risk_tier,
 *     completeness_pct, dispatch_status, trust_level) appear in evidence.
 *   - The enabled+complete filter is performed in SQL WHERE (not JS post-filter)
 *     so that no disabled/incomplete row can slip through a future code path.
 *   - Phase 148 SKILLTRUST-02: when `minTrustLevel` is supplied, the lookup
 *     fail-closes on skills below that trust rank (unsigned < signed < verified).
 *
 * Performance: lookup uses the (dispatch_status, imported_at DESC) index from
 * the skill_registry schema. A search by name alone hits the table primary scan
 * but the table is small and name is stored as TEXT (B-tree lookup).
 * All access paths avoid full-table scans.
 */
import type Database from "better-sqlite3";

import {
  TRUST_LEVEL_ORDER,
  trustLevelRank,
  type TrustLevel,
} from "@/lib/skills/registry";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Safe subset of skill_registry exposed in evidence, no untrusted body text. */
export interface SkillContractSummary {
  id: number;
  name: string;
  source_harness: string;
  risk_tier: string | null;
  dispatch_status: string;
  completeness_pct: number;
  /** SKILLTRUST-02: trust tier as persisted on the row. */
  trust_level: TrustLevel;
  /** SKILLTRUST-02: signature blob (Ed25519 base64 or HMAC hex). null for
   *  unsigned rows. Surfaced in evidence so callers can verify which rows
   *  carry a signature without exposing the underlying skill body. */
  signature: string | null;
}

/** Discriminated union returned by lookupSkillContract. */
export type SkillLookupResult =
  | { kind: "hit"; skill: SkillContractSummary }
  | {
      kind: "denied";
      skill_name: string;
      reason: string;
      dispatch_status: string | null;
      trust_level?: TrustLevel | null;
    };

/** Evidence block appended to DispatchResult.evidence. */
export interface SkillGovernanceEvidence {
  skill_governance: {
    mode: "governed" | "fallback";
    selected_skill?: SkillContractSummary;
    denial_reason?: string;
    denied_skill?: string;
    denied_dispatch_status?: string | null;
    denied_trust_level?: TrustLevel | null;
    required_trust_level?: TrustLevel;
  };
}

/**
 * Parsed minimum trust level for dispatch. Accepts the canonical values
 * 'unsigned' | 'signed' | 'verified' (case-insensitive). Returns null for
 * unset/unknown values so the caller can treat absence as 'no threshold'.
 */
export function parseTrustLevel(value: string | null | undefined): TrustLevel | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (TRUST_LEVEL_ORDER.includes(normalized as TrustLevel)) {
    return normalized as TrustLevel;
  }
  return null;
}

// ---------------------------------------------------------------------------
// SQL row type (internal)
// ---------------------------------------------------------------------------

interface SkillRow {
  id: number;
  name: string;
  source_harness: string;
  risk_tier: string | null;
  dispatch_status: string;
  completeness_pct: number;
  trust_level: string | null;
  signature: string | null;
}

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

/**
 * Looks up a skill by name in the governed registry.
 *
 * Returns:
 *   - null if no skill_name provided (normal dispatch proceeds, no governance check)
 *   - { kind: 'hit', skill } if an enabled+complete contract is found
 *   - { kind: 'denied', ... } for disabled/incomplete/review/not-found contracts
 *
 * The enabled+complete predicate is applied in SQL to guarantee fail-closed behavior.
 */
export function lookupSkillContract(
  db: Database.Database,
  skillName: string | null | undefined,
  minTrustLevel?: TrustLevel | null,
  options?: { requireSigned?: boolean }
): SkillLookupResult | null {
  if (!skillName || skillName.trim() === "") {
    // No skill name — fall through to normal per-agent dispatch
    return null;
  }

  const name = skillName.trim();
  const requireSigned = Boolean(options?.requireSigned);

  // Step 1: attempt an enabled+complete lookup in SQL.
  // The fail-closed filter lives in WHERE, not in JS, so no disabled row
  // can slip through, even when multiple harnesses share the same skill name.
  // (skill_registry has UNIQUE(name, source_harness); same name may appear in
  //  multiple harnesses with different statuses.)
  //
  // Phase 148 SKILLTRUST-02: when the operator enables
  // `require_signed_skills` (via MEMROOS_REQUIRE_SIGNED_SKILLS=true) the SQL
  // gate additionally requires `signature IS NOT NULL`, so unsigned rows are
  // denied at the SQL layer instead of via JS post-filter.
  const requireSignedPredicate = requireSigned ? " AND signature IS NOT NULL" : "";
  const enabledRow = db
    .prepare<[string], SkillRow>(
      `SELECT id, name, source_harness, risk_tier, dispatch_status,
              completeness_pct, trust_level, signature
         FROM skill_registry
        WHERE name = ?
          AND dispatch_status = 'enabled'
          AND completeness_pct = 100
          ${requireSignedPredicate}
        ORDER BY imported_at DESC
        LIMIT 1`
    )
    .get(name);

  if (enabledRow) {
    // A valid, enabled, complete contract found — return safe summary only
    const rowTrust = (enabledRow.trust_level ?? "unsigned") as TrustLevel;
    if (minTrustLevel && trustLevelRank(rowTrust) < trustLevelRank(minTrustLevel)) {
      // Enabled+complete but trust tier too low — fail-closed denial.
      return {
        kind: "denied",
        skill_name: name,
        reason: `Skill trust level '${rowTrust}' is below required minimum '${minTrustLevel}'`,
        dispatch_status: enabledRow.dispatch_status,
        trust_level: rowTrust,
      };
    }
    const summary: SkillContractSummary = {
      id: enabledRow.id,
      name: enabledRow.name,
      source_harness: enabledRow.source_harness,
      risk_tier: enabledRow.risk_tier,
      dispatch_status: enabledRow.dispatch_status,
      completeness_pct: enabledRow.completeness_pct,
      trust_level: rowTrust,
      signature: enabledRow.signature,
    };
    return { kind: "hit", skill: summary };
  }

  // Step 2: no enabled+complete row. Check whether any contract exists at all
  // so we can produce an informative denial (vs. not-found).
  const anyRow = db
    .prepare<[string], SkillRow>(
      `SELECT id, name, source_harness, risk_tier, dispatch_status,
              completeness_pct, trust_level, signature
         FROM skill_registry
        WHERE name = ?
        ORDER BY imported_at DESC
        LIMIT 1`
    )
    .get(name);

  if (!anyRow) {
    return {
      kind: "denied",
      skill_name: name,
      reason: `Skill contract not found in registry`,
      dispatch_status: null,
      trust_level: null,
    };
  }

  // Step 2.5: when require_signed_skills=true and the row exists but has
  // no signature, surface an explicit denial so the operator audit row
  // captures the precise reason. This branch is unreachable when the
  // SQL gate already filtered out unsigned rows, but kept as a defensive
  // check for callers that pass requireSigned alongside a custom DB view.
  if (requireSigned && !anyRow.signature) {
    return {
      kind: "denied",
      skill_name: name,
      reason: "Skill is unsigned and dispatch policy require_signed_skills=true",
      dispatch_status: anyRow.dispatch_status,
      trust_level: (anyRow.trust_level ?? null) as TrustLevel | null,
    };
  }

  // Contract exists but is not enabled+complete — deny with informative reason.
  //
  // SKILLTRUST-01 (Phase 148): a row with dispatch_status='enabled' but
  // completeness_pct < 100 is denied with the more accurate 'incomplete'
  // label, not the misleading 'enabled'. The Step 1 SQL gate
  // (dispatch_status='enabled' AND completeness_pct=100) is the source of
  // truth for fail-closed dispatch; this label is purely operator-facing.
  let statusLabel: string;
  if (anyRow.completeness_pct < 100) {
    statusLabel = "incomplete";
  } else if (anyRow.dispatch_status === "disabled") {
    statusLabel = "disabled";
  } else if (anyRow.dispatch_status === "incomplete") {
    statusLabel = "incomplete";
  } else if (anyRow.dispatch_status === "review") {
    statusLabel = "under review";
  } else {
    statusLabel = anyRow.dispatch_status ?? "unknown";
  }
  const anyRowTrust = (anyRow.trust_level ?? null) as TrustLevel | null;
  return {
    kind: "denied",
    skill_name: name,
    reason: `Skill contract is ${statusLabel} and cannot be used for governed dispatch`,
    dispatch_status: anyRow.dispatch_status,
    trust_level: anyRowTrust,
  };
}

// ---------------------------------------------------------------------------
// Evidence builder
// ---------------------------------------------------------------------------

/**
 * Converts a SkillLookupResult (or null for fallback) into a SkillGovernanceEvidence
 * block suitable for merging into DispatchResult.evidence.
 *
 * Phase 148 SKILLTRUST-02: when `minTrustLevel` is provided, the returned
 * evidence carries a `required_trust_level` field so the operator audit row
 * records the configured threshold alongside any denial reason.
 */
export function buildSkillEvidence(
  result: SkillLookupResult | null,
  minTrustLevel?: TrustLevel | null
): SkillGovernanceEvidence {
  if (result === null) {
    return {
      skill_governance: {
        mode: "fallback",
        ...(minTrustLevel ? { required_trust_level: minTrustLevel } : {}),
      },
    };
  }

  if (result.kind === "hit") {
    return {
      skill_governance: {
        mode: "governed",
        selected_skill: result.skill,
        ...(minTrustLevel ? { required_trust_level: minTrustLevel } : {}),
      },
    };
  }

  // denied
  return {
    skill_governance: {
      mode: "governed",
      denial_reason: result.reason,
      denied_skill: result.skill_name,
      denied_dispatch_status: result.dispatch_status,
      denied_trust_level: result.trust_level ?? null,
      ...(minTrustLevel ? { required_trust_level: minTrustLevel } : {}),
    },
  };
}
