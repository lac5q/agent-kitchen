/**
 * Skill registry lookup for the A2A dispatcher (Plan 72-06, SKILL-03).
 *
 * Security contract:
 *   - Returned evidence MUST NOT include raw_body, preconditions, allowed_tools,
 *     verification_checks, or rollback_behavior, evidence_examples, signature,
 *     or public_key_fingerprint because these are untrusted imported content.
 *   - Only safe identifying fields (id, name, source_harness, risk_tier,
 *     completeness_pct, dispatch_status, trust_level, content_hash) appear in
 *     evidence. Skill names are not secrets, but body text and example text are.
 *   - The enabled+complete filter is performed in SQL WHERE (not JS post-filter)
 *     so that no disabled/incomplete row can slip through a future code path.
 *   - Phase 148 SKILLTRUST-02: when minTrustLevel is supplied, the lookup
 *     fail-closes on skills below that trust rank (unsigned < signed < verified).
 *
 * SKILLTRUST-01 (continued) / VAL-SKILL-017 / VAL-SKILL-018 / VAL-SKILL-019:
 *   - When source_harness is supplied the lookup is constrained to a single
 *     harness identity, so the named request can never silently select
 *     another harness or version.
 *   - When source_harness is omitted and multiple harnesses share the
 *     skill_name, the lookup returns an ambiguous result instead of picking
 *     an arbitrary row.
 *   - The result of a fallback (no skill_name) is null so the dispatcher
 *     can produce mode=fallback evidence without performing any
 *     registry lookup at all.
 *
 * Performance: lookup uses the (dispatch_status, imported_at DESC) index from
 * the skill_registry schema. A search by name alone hits the table primary scan
 * but the table is small and name is stored as TEXT (B-tree lookup).
 * All access paths avoid full-table scans.
 */
import type Database from "better-sqlite3";

import {
  computeContentHash,
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
  /** SKILLTRUST-01 (continued): safe version field for explicit version
   *  binding (VAL-SKILL-017). Surface in evidence so operators can verify
   *  which version was selected without exposing raw_body. */
  version: string | null;
  risk_tier: string | null;
  dispatch_status: string;
  completeness_pct: number;
  /** SKILLTRUST-02: trust tier as persisted on the row. */
  trust_level: TrustLevel;
  /** SKILLTRUST-02: signature blob (Ed25519 base64 or HMAC hex). null for
   *  unsigned rows. Surfaced in evidence so callers can verify which rows
   *  carry a signature without exposing the underlying skill body. */
  signature: string | null;
  /** Safe content hash surfaced for binding verification. */
  content_hash: string | null;
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
      source_harness?: string | null;
    }
  | {
      kind: "ambiguous";
      skill_name: string;
      candidate_harnesses: string[];
      reason: string;
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
  version: string | null;
  content_hash: string | null;
  raw_body?: string | null;
  // SKILLTRUST-05: lifecycle_state column (v14 migration). Optional in the
  // type because better-sqlite3 returns the row as a property bag -- legacy
  // DBs that pre-date v14 simply omit this key entirely.
  lifecycle_state?: string | null;
}

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

export interface SkillLookupOptions {
  /** Minimum trust rank the selected row must satisfy. */
  minTrustLevel?: TrustLevel | null;
  /** Restrict to a single source harness identity (VAL-SKILL-018). */
  sourceHarness?: string | null;
  /** Restrict to a specific version string (VAL-SKILL-017). */
  version?: string | null;
  /** Require the row to carry a signature. */
  requireSigned?: boolean;
  /**
   * SKILLTRUST-04 / VAL-SKILL-031: explicit version pin override.
   * When supplied, the lookup uses the pinned (source_harness,
   * version, content_hash) tuple instead of "latest enabled+complete"
   * and refuses to select a registry row whose content_hash differs
   * from the pinned hash (the pin describes a specific contract, and
   * any drift between pin and registry must fail closed). The pin
   * wins over the unpinned latest row, but every other governance
   * gate (completeness, trust, lifecycle, etc.) still applies.
   */
  pinned?: {
    agent_id: string;
    source_harness: string;
    current_version: string;
    current_content_hash: string;
    skill_id?: number | null;
  } | null;
}

/**
 * A governed signed or pinned artifact must still bind to its persisted body
 * at dispatch time. This intentionally happens after SQL eligibility but
 * before a hit is returned, and only returns a typed denial, never the body
 * or either digest. Legacy unsigned rows retain their explicit policy mode,
 * while any signed/verified or pinned selection fails closed on missing or
 * mismatched body provenance.
 */
function hasIntactArtifactBody(row: SkillRow, required: boolean): boolean {
  if (!required) return true;
  // Legacy migrations and isolated schema fixtures do not expose raw_body.
  // They cannot be body-reverified, but do not become a false tamper finding.
  // Current schema rows always select this column and therefore fail closed.
  if (row.raw_body === undefined) return true;
  if (typeof row.raw_body !== "string" || !row.content_hash) return false;
  return computeContentHash(row.raw_body) === row.content_hash;
}

/**
 * Looks up a skill by name in the governed registry.
 *
 * Returns:
 *   - null if no skill_name provided (normal dispatch proceeds, no governance check)
 *   - { kind: 'hit', skill } if an enabled+complete contract is found
 *   - { kind: 'denied', ... } for disabled/incomplete/review/not-found contracts
 *   - { kind: 'ambiguous', ... } when multiple harnesses share the skill_name
 *     and no explicit source_harness binding was supplied.
 *
 * The enabled+complete predicate is applied in SQL to guarantee fail-closed behavior.
 *
 * SKILLTRUST-01 (continued):
 *   - When sourceHarness is supplied, the SQL gate is constrained to that
 *     exact (name, source_harness) tuple, so the result is deterministic.
 *   - When sourceHarness is omitted and multiple rows share the skill name
 *     the result is 'ambiguous' so the dispatcher can refuse to silently pick
 *     a harness.
 */
export function lookupSkillContract(
  db: Database.Database,
  skillName: string | null | undefined,
  secondArg?: TrustLevel | SkillLookupOptions | null,
  thirdArg?: { requireSigned?: boolean } | SkillLookupOptions | null
): SkillLookupResult | null {
  if (!skillName || skillName.trim() === "") {
    return null;
  }

  const name = skillName.trim();

  // Backwards compat: supports (db, name, minTrustLevel, options) legacy signature
  // used by Phase 148 tests, and (db, name, options) new signature.
  let options: SkillLookupOptions = {};
  let legacyMinTrust: TrustLevel | null = null;

  if (secondArg === null || secondArg === undefined) {
    // secondArg is null/undefined -> treat as no minTrust, thirdArg may be options
    if (thirdArg && typeof thirdArg === 'object') {
      options = thirdArg as SkillLookupOptions;
    }
  } else if (typeof secondArg === 'string') {
    // legacy: secondArg is TrustLevel string
    legacyMinTrust = secondArg as TrustLevel;
    if (thirdArg && typeof thirdArg === 'object') {
      options = thirdArg as SkillLookupOptions;
    }
  } else if (typeof secondArg === 'object') {
    // new style: secondArg is options object
    options = secondArg as SkillLookupOptions;
    // thirdArg ignored if present (should not happen)
  }

  // Merge legacy minTrust into options if not already set
  const minTrustLevel = options.minTrustLevel ?? legacyMinTrust ?? null;
  const requireSigned = Boolean(options.requireSigned);
  const sourceHarness = options.sourceHarness?.trim()
    ? options.sourceHarness.trim()
    : null;
  const version = options.version?.trim() ? options.version.trim() : null;
  const pinned = options.pinned ?? null;

  // Step 0 (pinned dispatch): SKILLTRUST-04 / VAL-SKILL-031.
  //
  // When the caller supplies a pinned (agent, source_harness, version,
  // content_hash), the pinned contract wins over the unpinned latest
  // row. The registry row at the pinned source_harness must:
  //   - exist,
  //   - match the pinned version and content_hash (drift between pin and
  //     registry fails closed, including a same-body reimport under a new
  //     version, because the pin names a specific immutable contract),
  //   - pass every other governance gate (enabled, complete, lifecycle,
  //     trust).
  //
  // This branch runs BEFORE the ambiguity check so the pinned harness
  // binding eliminates any same-name ambiguity that would otherwise
  // surface.
  if (pinned && pinned.source_harness) {
    const pinnedRow = db
      .prepare<[string, string], SkillRow>(
        `SELECT id, name, source_harness, risk_tier, dispatch_status,
                completeness_pct, trust_level, signature, version,
                content_hash, raw_body, lifecycle_state
           FROM skill_registry
          WHERE name = ? AND source_harness = ?
          LIMIT 1`
      )
      .get(name, pinned.source_harness);
    if (!pinnedRow) {
      return {
        kind: "denied",
        skill_name: name,
        source_harness: pinned.source_harness,
        reason: `Pinned skill '${name}' for agent '${pinned.agent_id}' has no registry row in harness '${pinned.source_harness}'`,
        dispatch_status: null,
        trust_level: null,
      };
    }
    if (pinnedRow.version !== pinned.current_version) {
      return {
        kind: "denied",
        skill_name: name,
        source_harness: pinned.source_harness,
        reason: `Pinned version mismatch for agent '${pinned.agent_id}'`,
        dispatch_status: pinnedRow.dispatch_status,
        trust_level: (pinnedRow.trust_level ?? null) as TrustLevel | null,
      };
    }
    const registryHash = (pinnedRow.content_hash ?? "").toLowerCase();
    if (registryHash !== pinned.current_content_hash.toLowerCase()) {
      return {
        kind: "denied",
        skill_name: name,
        source_harness: pinned.source_harness,
        reason: `Pinned hash mismatch for agent '${pinned.agent_id}': pin=${pinned.current_content_hash}, registry=${registryHash || "∅"}`,
        dispatch_status: pinnedRow.dispatch_status,
        trust_level: (pinnedRow.trust_level ?? null) as TrustLevel | null,
      };
    }
    // Pinned row must still satisfy all other governance gates.
    const pinnedLifecycle = (pinnedRow.lifecycle_state ?? null) as string | null;
    if (pinnedRow.completeness_pct < 100) {
      return {
        kind: "denied",
        skill_name: name,
        source_harness: pinned.source_harness,
        reason: `Pinned skill '${name}' is incomplete (${pinnedRow.completeness_pct}%) and cannot be used for governed dispatch`,
        dispatch_status: pinnedRow.dispatch_status,
        trust_level: (pinnedRow.trust_level ?? null) as TrustLevel | null,
      };
    }
    if (pinnedRow.dispatch_status !== "enabled") {
      return {
        kind: "denied",
        skill_name: name,
        source_harness: pinned.source_harness,
        reason: `Pinned skill '${name}' has dispatch_status='${pinnedRow.dispatch_status}' and cannot be used for governed dispatch`,
        dispatch_status: pinnedRow.dispatch_status,
        trust_level: (pinnedRow.trust_level ?? null) as TrustLevel | null,
      };
    }
    if (pinnedLifecycle && pinnedLifecycle !== "enabled") {
      return {
        kind: "denied",
        skill_name: name,
        source_harness: pinned.source_harness,
        reason: `Pinned skill '${name}' has lifecycle_state='${pinnedLifecycle}' and cannot be used for governed dispatch`,
        dispatch_status: pinnedRow.dispatch_status,
        trust_level: (pinnedRow.trust_level ?? null) as TrustLevel | null,
      };
    }
    const pinnedRowTrust = (pinnedRow.trust_level ?? "unsigned") as TrustLevel;
    if (minTrustLevel && trustLevelRank(pinnedRowTrust) < trustLevelRank(minTrustLevel)) {
      return {
        kind: "denied",
        skill_name: name,
        source_harness: pinned.source_harness,
        reason: `Pinned skill trust level '${pinnedRowTrust}' is below required minimum '${minTrustLevel}'`,
        dispatch_status: pinnedRow.dispatch_status,
        trust_level: pinnedRowTrust,
      };
    }
    if (requireSigned && !pinnedRow.signature) {
      return {
        kind: "denied",
        skill_name: name,
        source_harness: pinned.source_harness,
        reason: "Pinned skill is unsigned and dispatch policy require_signed_skills=true",
        dispatch_status: pinnedRow.dispatch_status,
        trust_level: pinnedRowTrust,
      };
    }
    if (!hasIntactArtifactBody(pinnedRow, true)) {
      return {
        kind: "denied",
        skill_name: name,
        source_harness: pinned.source_harness,
        reason: "Pinned skill artifact integrity verification failed",
        dispatch_status: pinnedRow.dispatch_status,
        trust_level: pinnedRowTrust,
      };
    }
    // Pinned hit. The summary carries the pinned identity so the
    // evidence is identical to a non-pinned hit — only the selection
    // path differs.
    const summary: SkillContractSummary = {
      id: pinnedRow.id,
      name: pinnedRow.name,
      source_harness: pinnedRow.source_harness,
      version: pinnedRow.version ?? pinned.current_version,
      risk_tier: pinnedRow.risk_tier,
      dispatch_status: pinnedRow.dispatch_status,
      completeness_pct: pinnedRow.completeness_pct,
      trust_level: pinnedRowTrust,
      signature: pinnedRow.signature,
      content_hash: pinnedRow.content_hash ?? null,
    };
    return { kind: "hit", skill: summary };
  }

  // Step 1: ambiguity check (VAL-SKILL-018). When the caller did not bind
  // a specific harness AND the skill_name exists in two or more harnesses,
  // we must refuse to silently select one -- the result is 'ambiguous'.
  // This runs before the enabled+complete lookup so the operator-facing
  // reason is clear (multiple harnesses) rather than masked behind an
  // incomplete-or-disabled denial.
  if (!sourceHarness) {
    const distinctHarnesses = db
      .prepare<[string], { source_harness: string }>(
        `SELECT DISTINCT source_harness
            FROM skill_registry
           WHERE name = ?`
      )
      .all(name);

    if (distinctHarnesses.length > 1) {
      const sortedHarnesses = distinctHarnesses
        .map((row) => row.source_harness)
        .sort((a, b) => a.localeCompare(b));
      return {
        kind: "ambiguous",
        skill_name: name,
        candidate_harnesses: sortedHarnesses,
        reason:
          `Skill name '${name}' exists in multiple harnesses (${sortedHarnesses.join(", ")}); supply an explicit source_harness to dispatch`,
      };
    }
  }

  // Step 2: attempt an enabled+complete lookup in SQL.
  // The fail-closed filter lives in WHERE, not in JS, so no disabled row
  // can slip through, even when multiple harnesses share the same skill name.
  // (skill_registry has UNIQUE(name, source_harness); same name may appear in
  //  multiple harnesses with different statuses.)
  const requireSignedPredicate = requireSigned ? " AND signature IS NOT NULL" : "";
  const sourceHarnessPredicate = sourceHarness ? " AND source_harness = ?" : "";
  // SKILLTRUST-05 / VAL-LIFE-010: extend the fail-closed SQL gate to also
  // require lifecycle_state = 'enabled'. A skill with dispatch_status='enabled'
  // but lifecycle_state in (draft|deprecated|retired) is never dispatchable.
  const lifecyclePredicate =
    " AND (lifecycle_state IS NULL OR lifecycle_state = 'enabled')";
  const buildEnabledSql = (includeVersion: boolean, includeLifecycle: boolean) => {
    const versionExtra = includeVersion ? ", version, content_hash, raw_body, lifecycle_state" : "";
    const lifecycleExtra = includeLifecycle ? ", lifecycle_state" : "";
    const lifecycleWhere = includeLifecycle ? lifecyclePredicate : "";
    return `SELECT id, name, source_harness, risk_tier, dispatch_status,
              completeness_pct, trust_level, signature${versionExtra}${lifecycleExtra}
         FROM skill_registry
        WHERE name = ?
          AND dispatch_status = 'enabled'
          AND completeness_pct = 100${lifecycleWhere}${requireSignedPredicate}${sourceHarnessPredicate}
        ORDER BY imported_at DESC
        LIMIT 1`;
  };
  let enabledRow: SkillRow | null = null;
  // tryFetchEnabled runs the supplied SQL and returns the row, or null
  // when no row matched. "no such column" errors (which indicate a
  // legacy DB without lifecycle_state / version) are rethrown so the
  // outer try/catch can run the legacy fallback below. Non-legacy
  // "no row matched" results stay null and are honored -- a deprecated
  // / draft / retired skill with dispatch_status='enabled' must surface
  // as denied, not silently succeed via the legacy fallback.
  const tryFetchEnabled = (sql: string): SkillRow | null => {
    if (sourceHarness) {
      return (db.prepare<[string, string], SkillRow>(sql).get(name, sourceHarness) ?? null) as SkillRow | null;
    }
    return (db.prepare<[string], SkillRow>(sql).get(name) ?? null) as SkillRow | null;
  };
  // Try full query first. The lifecycle_state filter is mandatory for
  // v14+ databases so a deprecated / draft / retired skill with
  // dispatch_status='enabled' is correctly denied. The fallback to the
  // minimal query (no lifecycle_state / version columns) is reserved
  // for legacy test DBs that pre-date the v14 migration. The fallback
  // runs only when the FULL query throws (typically "no such column"),
  // NOT when it simply returns no row.
  try {
    enabledRow = tryFetchEnabled(buildEnabledSql(true, true));
  } catch {
    // Legacy DB without lifecycle_state / version columns -- fall back
    // to the minimal query so older fixtures and pre-migration test
    // DBs still produce a hit.
    const minimalSql = buildEnabledSql(false, false);
    try {
      if (sourceHarness) {
        enabledRow = (db.prepare<[string, string], SkillRow>(minimalSql).get(name, sourceHarness) ?? null) as SkillRow | null;
      } else {
        enabledRow = (db.prepare<[string], SkillRow>(minimalSql).get(name) ?? null) as SkillRow | null;
      }
    } catch {
      enabledRow = null;
    }
  }

  if (enabledRow) {
    // VAL-SKILL-017: explicit version binding is honored. A mismatched
    // version is denied rather than silently falling back to a different row.
    if (version && enabledRow.version && enabledRow.version !== version) {
      return {
        kind: "denied",
        skill_name: name,
        source_harness: enabledRow.source_harness,
        reason: `Skill version mismatch: requested '${version}' but registry row is '${enabledRow.version}'`,
        dispatch_status: enabledRow.dispatch_status,
        trust_level: (enabledRow.trust_level ?? "unsigned") as TrustLevel,
      };
    }
    // A valid, enabled, complete contract found -- return safe summary only
    const rowTrust = (enabledRow.trust_level ?? "unsigned") as TrustLevel;
    if (!hasIntactArtifactBody(enabledRow, Boolean(enabledRow.signature) || rowTrust !== "unsigned")) {
      return {
        kind: "denied",
        skill_name: name,
        source_harness: enabledRow.source_harness,
        reason: "Skill artifact integrity verification failed",
        dispatch_status: enabledRow.dispatch_status,
        trust_level: rowTrust,
      };
    }
    if (minTrustLevel && trustLevelRank(rowTrust) < trustLevelRank(minTrustLevel)) {
      // Enabled+complete but trust tier too low -- fail-closed denial.
      return {
        kind: "denied",
        skill_name: name,
        source_harness: enabledRow.source_harness,
        reason: `Skill trust level '${rowTrust}' is below required minimum '${minTrustLevel}'`,
        dispatch_status: enabledRow.dispatch_status,
        trust_level: rowTrust,
      };
    }
    const summary: SkillContractSummary = {
      id: enabledRow.id,
      name: enabledRow.name,
      source_harness: enabledRow.source_harness,
      version: enabledRow.version ?? null,
      risk_tier: enabledRow.risk_tier,
      dispatch_status: enabledRow.dispatch_status,
      completeness_pct: enabledRow.completeness_pct,
      trust_level: rowTrust,
      signature: enabledRow.signature,
      content_hash: enabledRow.content_hash ?? null,
    };
    return { kind: "hit", skill: summary };
  }

  // Step 3: no enabled+complete row in the constrained search. Check
  // whether any contract exists at all so we can produce an informative
  // denial (vs. not-found).
  const buildAnySql = (includeVersion: boolean, includeLifecycle: boolean) => {
    const versionExtra = includeVersion ? ", version, content_hash, lifecycle_state" : "";
    const lifecycleExtra = includeLifecycle ? ", lifecycle_state" : "";
    return `SELECT id, name, source_harness, risk_tier, dispatch_status,
              completeness_pct, trust_level, signature${versionExtra}${lifecycleExtra}
         FROM skill_registry
        WHERE name = ?
          ${sourceHarnessPredicate}
        ORDER BY imported_at DESC
        LIMIT 1`;
  };
  let anyRow: SkillRow | null = null;
  // Try full first, fall back to minimal for legacy test DBs (legacy
  // databases may be missing the lifecycle_state column added in v14).
  try {
    const fullAnySql = buildAnySql(true, true);
    anyRow = sourceHarness
      ? (db.prepare<[string, string], SkillRow>(fullAnySql).get(name, sourceHarness) ?? null) as SkillRow | null
      : (db.prepare<[string], SkillRow>(fullAnySql).get(name) ?? null) as SkillRow | null;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes("no such column")) throw e;
    // retry without the lifecycle_state column or predicate
    const minimalAnySql = buildAnySql(false, false);
    try {
      anyRow = sourceHarness
        ? (db.prepare<[string, string], SkillRow>(minimalAnySql).get(name, sourceHarness) ?? null) as SkillRow | null
        : (db.prepare<[string], SkillRow>(minimalAnySql).get(name) ?? null) as SkillRow | null;
    } catch {
      anyRow = null;
    }
  }
  // No-op: anyRow / enabledRow are typed SkillRow | null already. The
  // legacy fallback path returns rows without lifecycle_state, but
  // downstream consumers treat missing/null uniformly.

  if (!anyRow) {
    return {
      kind: "denied",
      skill_name: name,
      source_harness: sourceHarness,
      reason: sourceHarness
        ? `Skill contract not found in registry for harness '${sourceHarness}'`
        : `Skill contract not found in registry`,
      dispatch_status: null,
      trust_level: null,
    };
  }

  // Step 4: when require_signed_skills=true and the row exists but has
  // no signature, surface an explicit denial so the operator audit row
  // captures the precise reason.
  if (requireSigned && !anyRow.signature) {
    return {
      kind: "denied",
      skill_name: name,
      source_harness: anyRow.source_harness,
      reason: "Skill is unsigned and dispatch policy require_signed_skills=true",
      dispatch_status: anyRow.dispatch_status,
      trust_level: (anyRow.trust_level ?? null) as TrustLevel | null,
    };
  }

  // Step 5: contract exists but is not enabled+complete -- deny with informative reason.
  // Priority order: dispatch_status takes precedence over lifecycle_state
  // for the user-facing reason because dispatch_status is the
  // supply-chain gate (quarantined, review, etc.) while lifecycle_state
  // describes a different orthogonal concern (draft, deprecated,
  // retired). A skill with dispatch_status='quarantined' must surface
  // the quarantine reason so operators see the actual blocker; a skill
  // with dispatch_status='enabled' but lifecycle_state in (draft,
  // deprecated, retired) is blocked by lifecycle_state.
  let statusLabel: string;
  const lifecycle = (anyRow.lifecycle_state ?? null) as string | null;
  if (anyRow.completeness_pct < 100) {
    statusLabel = "incomplete";
  } else if (anyRow.dispatch_status === "disabled") {
    statusLabel = "disabled";
  } else if (anyRow.dispatch_status === "incomplete") {
    statusLabel = "incomplete";
  } else if (anyRow.dispatch_status === "review") {
    statusLabel = "under review";
  } else if (anyRow.dispatch_status === "quarantined") {
    // VAL-SKILL-022 / VAL-QUAR-009: quarantined is the mandatory
    // supply-chain gate label. Operators must see this exact word so
    // the quarantine pipeline is the first thing surfaced.
    statusLabel = "quarantined";
  } else if (lifecycle && lifecycle !== "enabled") {
    statusLabel = lifecycle === "draft"
      ? "in draft lifecycle (not yet enabled)"
      : lifecycle === "deprecated"
        ? "deprecated"
        : lifecycle;
  } else {
    statusLabel = anyRow.dispatch_status ?? "unknown";
  }
  const anyRowTrust = (anyRow.trust_level ?? null) as TrustLevel | null;
  return {
    kind: "denied",
    skill_name: name,
    source_harness: anyRow.source_harness,
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
 * Phase 148 SKILLTRUST-02: when minTrustLevel is provided, the returned
 * evidence carries a required_trust_level field so the operator audit row
 * records the configured threshold alongside any denial reason.
 *
 * Phase 149 SKILLTRUST-01 (continued) / VAL-SKILL-019: when the result is
 * ambiguous the evidence surfaces the candidate harnesses so the operator can
 * see the conflict and choose one explicitly.
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

  if (result.kind === "ambiguous") {
    return {
      skill_governance: {
        mode: "governed",
        denial_reason: result.reason,
        denied_skill: result.skill_name,
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
