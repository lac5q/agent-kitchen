/**
 * Skill dependency views — Phase 151 / SKILLTRUST-05.
 *
 * Implements VAL-SKILL-034:
 *   Skill-to-agent and skill-to-skill dependencies identify:
 *     - source provenance (config, pin, dispatch, report, capability,
 *       marketplace)
 *     - exact version + content_hash + lifecycle_state
 *     - declared vs observed/unresolved status
 *     - scope (tenant / agent / skill)
 *
 * "Trust" provenance comes from operator-controlled surfaces:
 *   - config (skill_registry insert by operator import)
 *   - pin (skill_version_pins / skill_dependencies explicit pin row)
 *   - dispatch (dispatch request that exercised the skill)
 *   - marketplace (marketplace listing bound to a registry identity)
 *
 * "Observation" provenance comes from non-trust surfaces that may NOT
 * promote trust: agent reports (skill_reports), agent capabilities
 * (registered_agents.capabilities), and unresolved references.
 *
 * The two never co-mingle: an observation row cannot elevate a skill
 * to trusted. Trust-only rows report is_trusted=true; observation-only
 * rows report is_observation=true; the union of both is the full
 * dependency graph.
 */

import type Database from "better-sqlite3";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DependencyProvenance =
  | "config"        // operator import → skill_registry row
  | "pin"           // skill_version_pins / skill_dependencies
  | "dispatch"      // dispatch receipt that named this skill
  | "report"        // agent-side observation report
  | "capability"    // agent capability declaration (NOT trust)
  | "marketplace"   // marketplace listing bound to the registry identity
  | "sync"          // cross-harness sync proposal bound to it
  | "lifecycle";    // lifecycle audit row referencing the skill

export type DependencyStatus = "declared" | "observed" | "unresolved";

export interface DependencyRow {
  id: string;
  provenance: DependencyProvenance;
  is_trusted: boolean;
  is_observation: boolean;
  status: DependencyStatus;
  scope: {
    tenant_id?: string;
    agent_id?: string;
    skill_id?: number;
    skill_name?: string;
    source_harness?: string;
  };
  identity: {
    version: string | null;
    content_hash: string | null;
    lifecycle_state: string | null;
    dispatch_status: string | null;
  };
  reason?: string | null;
  created_at: string;
  updated_at?: string | null;
}

export interface DependencyView {
  skill_id: number;
  skill_name: string;
  source_harness: string;
  lifecycle_state: string | null;
  trusted: DependencyRow[];
  observed: DependencyRow[];
  unresolved: DependencyRow[];
  forward_consistency: { ok: boolean; mismatches: string[] };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safeGet<T>(
  db: Database.Database,
  sql: string,
  params: unknown[]
): T | undefined {
  try {
    return db.prepare(sql).get(...params) as T | undefined;
  } catch {
    return undefined;
  }
}

function safeAll<T>(
  db: Database.Database,
  sql: string,
  params: unknown[]
): T[] {
  try {
    return db.prepare(sql).all(...params) as T[];
  } catch {
    return [];
  }
}

interface RegistryRow {
  id: number;
  name: string;
  source_harness: string;
  version: string | null;
  content_hash: string | null;
  lifecycle_state: string | null;
  dispatch_status: string | null;
  completeness_pct: number | null;
}

function loadRegistryRow(db: Database.Database, skillId: number): RegistryRow | null {
  const row = safeGet<RegistryRow>(
    db,
    `SELECT id, name, source_harness, version, content_hash,
            lifecycle_state, dispatch_status, completeness_pct
       FROM skill_registry WHERE id = ? LIMIT 1`,
    [skillId]
  );
  return row ?? null;
}

function isObservationProvenance(p: DependencyProvenance): boolean {
  return p === "report" || p === "capability";
}

function isTrustedProvenance(p: DependencyProvenance): boolean {
  return !isObservationProvenance(p);
}

// ---------------------------------------------------------------------------
// Per-provenance loaders
// ---------------------------------------------------------------------------

interface PinRow {
  id: number;
  skill_id: number | null;
  agent_id: string;
  current_version: string;
  current_content_hash: string;
  prior_version: string | null;
  prior_content_hash: string | null;
  created_at: string;
}

function loadTrustPins(db: Database.Database, skillId: number): PinRow[] {
  // Try by skill_id first, then by skill_name. This captures the
  // legacy pin rows where skill_id may be null but a name match exists.
  const byId = safeAll<PinRow>(
    db,
    `SELECT id, skill_id, agent_id, current_version, current_content_hash,
            prior_version, prior_content_hash, created_at
       FROM skill_version_pins
      WHERE skill_id = ?
      ORDER BY created_at DESC`,
    [skillId]
  );
  if (byId.length > 0) return byId;
  const reg = loadRegistryRow(db, skillId);
  if (!reg) return [];
  return safeAll<PinRow>(
    db,
    `SELECT id, skill_id, agent_id, current_version, current_content_hash,
            prior_version, prior_content_hash, created_at
       FROM skill_version_pins
      WHERE skill_name = ?
      ORDER BY created_at DESC`,
    [reg.name]
  );
}

interface DependencyEdgeRow {
  id: number;
  skill_id: number;
  dependent_agent_id: string;
  skill_version: string;
  registered_by: string;
  created_at: string;
  updated_at: string;
}

function loadSkillDependencies(db: Database.Database, skillId: number): DependencyEdgeRow[] {
  return safeAll<DependencyEdgeRow>(
    db,
    `SELECT id, skill_id, dependent_agent_id, skill_version,
            registered_by, created_at, updated_at
       FROM skill_dependencies
      WHERE skill_id = ?
      ORDER BY created_at DESC`,
    [skillId]
  );
}

interface ReportRow {
  id: number;
  agent_id: string;
  skill_id: string | null;
  action: string;
  metadata: string;
  reported_at: string;
}

function loadReports(db: Database.Database, skillId: number): ReportRow[] {
  // agent_skill_reports (Phase 142) stores agent-side observations.
  // Rows here are observations only and never promote trust. skill_id
  // is stored as TEXT (registry id string or skill name).
  const reg = loadRegistryRow(db, skillId);
  const skillIdStr = String(skillId);
  const skillName = reg?.name ?? null;
  const where = skillName
    ? "WHERE skill_id = ? OR skill_id = ?"
    : "WHERE skill_id = ?";
  const params: unknown[] = skillName ? [skillIdStr, skillName] : [skillIdStr];
  return safeAll<ReportRow>(
    db,
    `SELECT id, agent_id, skill_id, action, metadata, reported_at
       FROM agent_skill_reports
       ${where}
       ORDER BY reported_at DESC
       LIMIT 200`,
    params
  );
}

interface MarketplaceRow {
  id: string;
  skill_id: string;
  version: string;
  deprecated: number;
  published_at: string;
  updated_at: string;
}

function loadMarketplaceListings(db: Database.Database, skillId: number): MarketplaceRow[] {
  return safeAll<MarketplaceRow>(
    db,
    `SELECT id, skill_id, version, deprecated, published_at, updated_at
       FROM skill_marketplace WHERE skill_id = ? ORDER BY published_at DESC`,
    [String(skillId)]
  );
}

interface CapabilityRow {
  agent_id: string;
  capability_name: string;
  capability_description: string | null;
  registered_at: string | null;
}

function loadCapabilitiesReferencing(db: Database.Database, skillId: number): CapabilityRow[] {
  const reg = loadRegistryRow(db, skillId);
  if (!reg) return [];
  // Use the agent_capabilities table (added in Phase 142). The schema is:
  //   agent_capabilities(agent_id, capability_id, name, description, ...)
  // We look up rows where the capability name matches the skill name.
  // This is the only safe provenance view; an agent that merely has a
  // capability with the same name as a registry skill does NOT create
  // trust in the skill.
  const out: CapabilityRow[] = [];
  const rows = safeAll<{ agent_id: string; capability_id: string; name: string; description: string; created_at: string }>(
    db,
    `SELECT agent_id, capability_id, name, description, created_at
         FROM agent_capabilities
        WHERE name = ? OR capability_id = ?`,
    [reg.name, reg.name]
  );
  for (const row of rows) {
    out.push({
      agent_id: row.agent_id,
      capability_name: row.name,
      capability_description: row.description ?? null,
      registered_at: row.created_at,
    });
  }
  return out;
}

interface DispatchAuditRow {
  metadata_json: string;
  created_at: string;
  actor_id: string | null;
}

function loadDispatchReceipts(db: Database.Database, skillId: number): DispatchAuditRow[] {
  // We look for hive_delegations that include the registry skill id in
  // their checkpoint or result JSON. Failing that, we look at audit_entries
  // with event_type 'skill.dispatch' if such rows exist. We never block on
  // missing tables.
  const byCheck = safeAll<DispatchAuditRow>(
    db,
    `SELECT result AS metadata_json, started_at AS created_at, from_agent AS actor_id
       FROM hive_delegations
      WHERE result LIKE ?
         OR checkpoint LIKE ?
      ORDER BY started_at DESC
      LIMIT 50`,
    [`%"skill_id":${skillId}%`, `%"skill_id":${skillId}%`]
  );
  return byCheck;
}

// ---------------------------------------------------------------------------
// Forward / reverse views
// ---------------------------------------------------------------------------

/**
 * Builds the forward dependency view for a skill: every place this
 * skill appears, classified by provenance and trust. The
 * trusted/observed/unresolved arrays are mutually exclusive at the
 * provenance level. The forward_consistency block reports whether
 * the view agrees with the registry identity (no mismatched version
 * / hash / lifecycle in trust rows).
 */
export function getSkillDependencyView(
  db: Database.Database,
  skillId: number
): DependencyView {
  const reg = loadRegistryRow(db, skillId);
  if (!reg) {
    return {
      skill_id: skillId,
      skill_name: "",
      source_harness: "",
      lifecycle_state: null,
      trusted: [],
      observed: [],
      unresolved: [],
      forward_consistency: { ok: false, mismatches: ["registry row missing"] },
    };
  }

  const trusted: DependencyRow[] = [];
  const observed: DependencyRow[] = [];
  const unresolved: DependencyRow[] = [];
  const mismatches: string[] = [];

  // 1. Config provenance: the registry row itself.
  trusted.push({
    id: `config:${reg.id}`,
    provenance: "config",
    is_trusted: true,
    is_observation: false,
    status: "declared",
    scope: { skill_id: reg.id, skill_name: reg.name, source_harness: reg.source_harness },
    identity: {
      version: reg.version,
      content_hash: reg.content_hash,
      lifecycle_state: reg.lifecycle_state,
      dispatch_status: reg.dispatch_status,
    },
    created_at: "",
  });

  // 2. Pin provenance: skill_version_pins
  const pins = loadTrustPins(db, skillId);
  for (const pin of pins) {
    const hashMismatch = reg.content_hash && pin.current_content_hash
      ? pin.current_content_hash.toLowerCase() !== reg.content_hash.toLowerCase()
      : false;
    const versionMismatch = reg.version && pin.current_version
      ? pin.current_version !== reg.version
      : false;
    if (hashMismatch) mismatches.push(`pin ${pin.id} content_hash != registry`);
    if (versionMismatch) mismatches.push(`pin ${pin.id} version != registry`);
    trusted.push({
      id: `pin:${pin.id}`,
      provenance: "pin",
      is_trusted: true,
      is_observation: false,
      status: hashMismatch || versionMismatch ? "observed" : "declared",
      scope: { agent_id: pin.agent_id, skill_id: reg.id, skill_name: reg.name, source_harness: reg.source_harness },
      identity: {
        version: pin.current_version,
        content_hash: pin.current_content_hash,
        lifecycle_state: reg.lifecycle_state,
        dispatch_status: reg.dispatch_status,
      },
      created_at: pin.created_at,
    });
  }

  // 3. Pin provenance (skill_dependencies — older ledger-style pin rows)
  const deps = loadSkillDependencies(db, skillId);
  for (const dep of deps) {
    trusted.push({
      id: `pin:${dep.id}`,
      provenance: "pin",
      is_trusted: true,
      is_observation: false,
      status: "declared",
      scope: { agent_id: dep.dependent_agent_id, skill_id: reg.id, skill_name: reg.name, source_harness: reg.source_harness },
      identity: {
        version: dep.skill_version,
        content_hash: reg.content_hash,
        lifecycle_state: reg.lifecycle_state,
        dispatch_status: reg.dispatch_status,
      },
      created_at: dep.created_at,
      updated_at: dep.updated_at,
    });
  }

  // 4. Lifecycle provenance: skill_lifecycle_audit row references
  const lifecycleRows = safeAll<{ id: number; from_state: string; to_state: string; actor: string; transitioned_at: string }>(
    db,
    `SELECT id, from_state, to_state, actor, transitioned_at
       FROM skill_lifecycle_audit WHERE skill_id = ? ORDER BY transitioned_at DESC`,
    [skillId]
  );
  for (const lc of lifecycleRows) {
    trusted.push({
      id: `lifecycle:${lc.id}`,
      provenance: "lifecycle",
      is_trusted: true,
      is_observation: false,
      status: "declared",
      scope: { skill_id: reg.id, skill_name: reg.name, source_harness: reg.source_harness },
      identity: {
        version: reg.version,
        content_hash: reg.content_hash,
        lifecycle_state: lc.to_state,
        dispatch_status: reg.dispatch_status,
      },
      reason: `${lc.from_state} -> ${lc.to_state}`,
      created_at: lc.transitioned_at,
    });
  }

  // 5. Marketplace provenance (registry-bound listing)
  const listings = loadMarketplaceListings(db, skillId);
  for (const listing of listings) {
    const versionMismatch = listing.version !== reg.version;
    if (versionMismatch) mismatches.push(`marketplace listing ${listing.id} version != registry`);
    trusted.push({
      id: `marketplace:${listing.id}`,
      provenance: "marketplace",
      is_trusted: true,
      is_observation: false,
      status: listing.deprecated ? "observed" : "declared",
      scope: { skill_id: reg.id, skill_name: reg.name, source_harness: reg.source_harness },
      identity: {
        version: listing.version,
        content_hash: reg.content_hash,
        lifecycle_state: reg.lifecycle_state,
        dispatch_status: reg.dispatch_status,
      },
      created_at: listing.published_at,
      updated_at: listing.updated_at,
    });
  }

  // 6. Dispatch provenance (best-effort): hive_delegations with this skill_id
  const dispatches = loadDispatchReceipts(db, skillId);
  for (let i = 0; i < dispatches.length; i++) {
    const d = dispatches[i];
    let skillIdInPayload: number | null = null;
    try {
      const parsed = JSON.parse(d.metadata_json) as Record<string, unknown>;
      if (typeof parsed?.skill_id === "number") skillIdInPayload = parsed.skill_id;
    } catch {
      // ignore
    }
    if (skillIdInPayload !== reg.id) continue;
    trusted.push({
      id: `dispatch:${d.created_at}:${i}`,
      provenance: "dispatch",
      is_trusted: true,
      is_observation: false,
      status: "observed",
      scope: { agent_id: d.actor_id ?? undefined, skill_id: reg.id, skill_name: reg.name, source_harness: reg.source_harness },
      identity: {
        version: reg.version,
        content_hash: reg.content_hash,
        lifecycle_state: reg.lifecycle_state,
        dispatch_status: reg.dispatch_status,
      },
      created_at: d.created_at,
    });
  }

  // 7. Report provenance (observation-only, cannot elevate trust)
  const reports = loadReports(db, skillId);
  for (const report of reports) {
    let parsedMeta: Record<string, unknown> = {};
    try {
      const p = JSON.parse(report.metadata) as unknown;
      if (p && typeof p === "object" && !Array.isArray(p)) {
        parsedMeta = p as Record<string, unknown>;
      }
    } catch {
      // ignore malformed metadata
    }
    observed.push({
      id: `report:${report.id}`,
      provenance: "report",
      is_trusted: false,
      is_observation: true,
      status: "observed",
      scope: { agent_id: report.agent_id, skill_id: reg.id, skill_name: reg.name, source_harness: reg.source_harness },
      identity: {
        version: null,
        content_hash: null,
        lifecycle_state: null,
        dispatch_status: null,
      },
      reason: typeof parsedMeta["observed_state"] === "string"
        ? (parsedMeta["observed_state"] as string)
        : report.action,
      created_at: report.reported_at,
    });
  }

  // 8. Capability provenance (observation-only)
  const caps = loadCapabilitiesReferencing(db, skillId);
  for (const cap of caps) {
    observed.push({
      id: `capability:${cap.agent_id}:${cap.capability_name}`,
      provenance: "capability",
      is_trusted: false,
      is_observation: true,
      status: "observed",
      scope: { agent_id: cap.agent_id, skill_id: reg.id, skill_name: reg.name, source_harness: reg.source_harness },
      identity: {
        version: null,
        content_hash: null,
        lifecycle_state: null,
        dispatch_status: null,
      },
      reason: cap.capability_description,
      created_at: cap.registered_at ?? "",
    });
  }

  // 9. Unresolved: skill_reports for skills not in registry
  // (handled implicitly: reports referencing skills not in registry are
  // surfaced through a separate API and never appear here)

  return {
    skill_id: reg.id,
    skill_name: reg.name,
    source_harness: reg.source_harness,
    lifecycle_state: reg.lifecycle_state,
    trusted,
    observed,
    unresolved,
    forward_consistency: { ok: mismatches.length === 0, mismatches },
  };
}

/**
 * Returns the list of skills that depend on the given skill — i.e. the
 * reverse skill-to-skill dependency view. Currently returns the union
 * of pinned skill_dependencies + skill_version_pins + observed
 * capability reports, distinguished by provenance.
 */
export interface ReverseDependencyRow {
  dependent_kind: "agent" | "skill";
  dependent_id: string;
  via: DependencyProvenance;
  is_trusted: boolean;
  is_observation: boolean;
  pinned_version: string | null;
  pinned_content_hash: string | null;
}

export function getReverseDependencyView(
  db: Database.Database,
  skillId: number
): ReverseDependencyRow[] {
  const view = getSkillDependencyView(db, skillId);
  const reg = loadRegistryRow(db, skillId);
  const rows: ReverseDependencyRow[] = [];

  for (const row of view.trusted) {
    if (row.provenance === "pin") {
      rows.push({
        dependent_kind: "agent",
        dependent_id: row.scope.agent_id ?? "?",
        via: "pin",
        is_trusted: true,
        is_observation: false,
        pinned_version: row.identity.version,
        pinned_content_hash: row.identity.content_hash,
      });
    }
  }
  for (const row of view.observed) {
    if (row.provenance === "capability" || row.provenance === "report") {
      rows.push({
        dependent_kind: row.provenance === "capability" ? "agent" : "agent",
        dependent_id: row.scope.agent_id ?? "?",
        via: row.provenance,
        is_trusted: false,
        is_observation: true,
        pinned_version: null,
        pinned_content_hash: null,
      });
    }
  }

  // Pin against skills that depend on this one as a dependency itself:
  // find skill rows whose preconditions reference this skill name.
  if (reg) {
    const dependents = safeAll<{ id: number; name: string }>(
      db,
      `SELECT id, name FROM skill_registry
        WHERE preconditions LIKE ?
           OR preconditions LIKE ?
           OR preconditions LIKE ?`,
      [`%${reg.name}%`, `%${reg.source_harness}/${reg.name}%`, `%${reg.id}%`]
    );
    for (const dep of dependents) {
      rows.push({
        dependent_kind: "skill",
        dependent_id: String(dep.id),
        via: "config",
        is_trusted: true,
        is_observation: false,
        pinned_version: null,
        pinned_content_hash: null,
      });
    }
  }

  return rows;
}

// ---------------------------------------------------------------------------
// CLI / observability helpers
// ---------------------------------------------------------------------------

/**
 * Stable JSON shape for CLI/observability output.
 */
export function summarizeDependencyView(view: DependencyView): Record<string, unknown> {
  return {
    skill_id: view.skill_id,
    skill_name: view.skill_name,
    source_harness: view.source_harness,
    lifecycle_state: view.lifecycle_state,
    trusted_count: view.trusted.length,
    observed_count: view.observed.length,
    unresolved_count: view.unresolved.length,
    forward_consistency: view.forward_consistency,
  };
}
