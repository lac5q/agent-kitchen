/**
 * Skill Lifecycle Manager — Phase 150 / SKILLTRUST-05.
 *
 * Typed lifecycle states for skills with audit trail, dependency
 * tracking, and deprecation notifications. The migration in db-schema.ts
 * (v14) adds a `lifecycle_state` column on skill_registry together with
 * two new tables:
 *
 *   - skill_dependencies  -- per-agent dependency rows
 *   - skill_lifecycle_audit -- append-only state transition log
 *
 * State machine:
 *
 *   draft   --(quarantine passed)-->   enabled
 *   enabled --(reason)-->              deprecated
 *   deprecated --(no dependents)-->    retired  (terminal)
 *
 * Rules:
 *   - draft -> enabled  requires a passed quarantine record on the skill.
 *                    The pipeline must have advanced to 'pending_approval'
 *                    or 'enabled' (i.e. it survived scanning and eval).
 *   - enabled -> deprecated requires a non-empty `reason` parameter.
 *                    Every dependent receives a notification via the
 *                    audit_entries log (event_type
 *                    'skill_lifecycle_deprecated').
 *   - deprecated -> retired is blocked when skill_dependencies has any
 *                    active rows; the error message lists the dependent
 *                    agent IDs.
 *   - retired is terminal: every transition out of retired is rejected.
 *   - On every successful transition an audit row is written to
 *     skill_lifecycle_audit AND a paired skill_lifecycle_transitioned
 *     row is written to audit_entries so existing audit queries surface
 *     lifecycle events consistently.
 *
 * Security contract:
 *   - All imported SKILL.md content remains DATA ONLY. Lifecycle state,
 *     reasons, and dependency metadata may not include untrusted skill
 *     body text.
 *   - Private signing keys, raw_artifacts, and any sensitive payload are
 *     never written to lifecycle audit rows.
 *   - Fail-closed: an unknown state, an unrecognized transition, or a
 *     missing quarantine record throws LifecycleTransitionError.
 */

import { randomUUID } from "crypto";
import type Database from "better-sqlite3";
import { buildSkillAuditEntry } from "@/lib/audit/skill-chain";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Canonical lifecycle states. The same set is enforced by the
 * `skill_registry.lifecycle_state` CHECK constraint added in migration
 * v14.
 */
export const SKILL_LIFECYCLE_STATES = [
  "draft",
  "enabled",
  "deprecated",
  "retired",
] as const;

export type SkillLifecycleState = (typeof SKILL_LIFECYCLE_STATES)[number];

export interface LifecycleDependencyRow {
  id: number;
  skill_id: number;
  dependent_agent_id: string;
  skill_version: string;
  registered_by: string;
  created_at: string;
  updated_at: string;
}

export interface AddSkillDependencyParams {
  skillId: number;
  dependentAgentId: string;
  skillVersion: string;
  registeredBy: string;
}

export interface LifecycleAuditRow {
  id: number;
  skill_id: number;
  from_state: SkillLifecycleState;
  to_state: SkillLifecycleState;
  actor: string;
  reason: string;
  transitioned_at: string;
}

export interface LifecycleTransitionResult {
  skill_id: number;
  previous_state: SkillLifecycleState;
  lifecycle_state: SkillLifecycleState;
  audit: LifecycleAuditRow;
  notifications: number;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * Raised when a lifecycle transition is rejected (missing quarantine
 * pass, empty reason, active dependents, terminal state, unknown
 * source / target, or unknown skill). All `transitionLifecycleState()`
 * failures throw this so callers can surface a deterministic 409.
 */
export class LifecycleTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LifecycleTransitionError";
  }
}

// ---------------------------------------------------------------------------
// Quarantine stage inspection
// ---------------------------------------------------------------------------

function loadQuarantineStage(
  db: Database.Database,
  skillId: number
): string | null {
  try {
    const row = db
      .prepare<[number], { stage: string }>(
        `SELECT stage FROM skill_quarantine WHERE skill_id = ? LIMIT 1`
      )
      .get(skillId);
    return row?.stage ?? null;
  } catch {
    // skill_quarantine may not exist on legacy test DBs — treat as no record.
    return null;
  }
}

function isQuarantinePassed(stage: string | null): boolean {
  // The pipeline reaches 'pending_approval' after surviving scanning and
  // eval; the operator approval gate then transitions stage -> 'enabled'
  // and flips skill_registry.dispatch_status to 'enabled'.
  // Either stage counts as "quarantine passed" for draft -> enabled.
  return stage === "pending_approval" || stage === "enabled";
}

// ---------------------------------------------------------------------------
// Dependency management
// ---------------------------------------------------------------------------

function loadDependencyRows(
  db: Database.Database,
  skillId: number
): LifecycleDependencyRow[] {
  return db
    .prepare<[number], LifecycleDependencyRow>(
      `SELECT id, skill_id, dependent_agent_id, skill_version,
              registered_by, created_at, updated_at
         FROM skill_dependencies
        WHERE skill_id = ?
        ORDER BY created_at ASC`
    )
    .all(skillId);
}

/**
 * Records a single (skill_id, dependent_agent_id) dependency on a
 * particular skill_version. Idempotent: re-registering the same agent
 * updates `skill_version`, `registered_by`, and `updated_at` instead of
 * duplicating the row.
 *
 * Returns the persisted row.
 */
export function addSkillDependency(
  db: Database.Database,
  params: AddSkillDependencyParams
): LifecycleDependencyRow {
  if (!Number.isInteger(params.skillId) || params.skillId <= 0) {
    throw new LifecycleTransitionError(
      `addSkillDependency: skillId must be a positive integer`
    );
  }
  if (!params.dependentAgentId || !params.dependentAgentId.trim()) {
    throw new LifecycleTransitionError(
      `addSkillDependency: dependentAgentId must be a non-empty string`
    );
  }
  if (!params.skillVersion || !params.skillVersion.trim()) {
    throw new LifecycleTransitionError(
      `addSkillDependency: skillVersion must be a non-empty string`
    );
  }
  if (!params.registeredBy || !params.registeredBy.trim()) {
    throw new LifecycleTransitionError(
      `addSkillDependency: registeredBy must be a non-empty string`
    );
  }

  const agentId = params.dependentAgentId.trim();
  const version = params.skillVersion.trim();
  const registeredBy = params.registeredBy.trim();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO skill_dependencies (
        skill_id, dependent_agent_id, skill_version, registered_by,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(skill_id, dependent_agent_id)
        DO UPDATE SET
          skill_version = excluded.skill_version,
          registered_by = excluded.registered_by,
          updated_at = excluded.updated_at`
  ).run(params.skillId, agentId, version, registeredBy, now, now);

  const rows = db
    .prepare<[number, string], LifecycleDependencyRow>(
      `SELECT id, skill_id, dependent_agent_id, skill_version,
              registered_by, created_at, updated_at
         FROM skill_dependencies
        WHERE skill_id = ? AND dependent_agent_id = ?
        LIMIT 1`
    )
    .all(params.skillId, agentId);
  return rows[0]!;
}

/**
 * Removes a dependency row. Returns true when the row existed and was
 * deleted; false when no row matched.
 */
export function removeSkillDependency(
  db: Database.Database,
  skillId: number,
  dependentAgentId: string
): boolean {
  if (!Number.isInteger(skillId) || skillId <= 0) return false;
  if (!dependentAgentId) return false;
  const result = db
    .prepare(
      `DELETE FROM skill_dependencies WHERE skill_id = ? AND dependent_agent_id = ?`
    )
    .run(skillId, dependentAgentId.trim());
  return result.changes > 0;
}

/**
 * Returns all dependent rows for a given skill. Each row carries the
 * agent ID and the skill_version the agent was last registered against.
 * The list is sorted oldest-first so audit displays and deprecation
 * notifications preserve registration order.
 */
export function getDependents(
  db: Database.Database,
  skillId: number
): LifecycleDependencyRow[] {
  if (!Number.isInteger(skillId) || skillId <= 0) return [];
  return loadDependencyRows(db, skillId);
}

// ---------------------------------------------------------------------------
// Audit + notifications
// ---------------------------------------------------------------------------

function appendLifecycleAudit(
  db: Database.Database,
  params: {
    skillId: number;
    fromState: SkillLifecycleState;
    toState: SkillLifecycleState;
    actor: string;
    reason: string;
  }
): LifecycleAuditRow {
  const now = new Date().toISOString();
  const result = db
    .prepare(
      `INSERT INTO skill_lifecycle_audit (
        skill_id, from_state, to_state, actor, reason, transitioned_at
      ) VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      params.skillId,
      params.fromState,
      params.toState,
      params.actor,
      params.reason,
      now
    );
  const id = Number(result.lastInsertRowid);
  return {
    id,
    skill_id: params.skillId,
    from_state: params.fromState,
    to_state: params.toState,
    actor: params.actor,
    reason: params.reason,
    transitioned_at: now,
  };
}

function appendUnifiedAuditEntry(
  db: Database.Database,
  params: {
    skillId: number;
    eventType: string;
    actor: string;
    reason: string | null;
    metadata: Record<string, unknown>;
  }
): void {
  try {
    const built = buildSkillAuditEntry(db, {
      tenantId: "default-tenant",
      actorId: params.actor,
      actorRole: "operator",
      eventType: params.eventType,
      entityType: "skill",
      entityId: `skill:${params.skillId}`,
      reason: params.reason,
      metadata: params.metadata,
    });
    db.prepare(
      `INSERT INTO audit_entries
        (id, tenant_id, actor_id, actor_role, event_type, entity_type, entity_id, reason, metadata_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      built.id,
      built.tenantId,
      built.actorId,
      built.actorRole,
      built.eventType,
      built.entityType,
      built.entityId,
      built.reason,
      built.metadata_json,
      built.created_at
    );
  } catch (e) {
    // On partial test DBs audit_entries may not exist — allow primary mutation.
    // When table exists, rethrow to enforce audit-atomicity.
    try {
      const exists = db
        .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='audit_entries'`)
        .get() as { name: string } | undefined;
      if (!exists) return;
    } catch {
      return;
    }
    // If the error is from missing entryHash validation, still enforce if table exists
    throw e;
  }
}

/**
 * Writes a paired notification row in audit_entries for each dependent
 * agent. Returns the number of notifications emitted.
 */
function notifyDependents(
  db: Database.Database,
  params: {
    skillId: number;
    deps: LifecycleDependencyRow[];
    actor: string;
    reason: string;
  }
): number {
  if (params.deps.length === 0) return 0;
  let written = 0;
  for (const dep of params.deps) {
    appendUnifiedAuditEntry(db, {
      skillId: params.skillId,
      eventType: "skill_lifecycle_deprecated",
      actor: params.actor,
      reason: params.reason,
      metadata: {
        skill_id: params.skillId,
        dependent_agent_id: dep.dependent_agent_id,
        skill_version: dep.skill_version,
        new_state: "deprecated",
        reason: params.reason,
      },
    });
    written += 1;
  }
  return written;
}

// ---------------------------------------------------------------------------
// Lifecycle state queries
// ---------------------------------------------------------------------------

function loadLifecycleState(
  db: Database.Database,
  skillId: number
): SkillLifecycleState | null {
  const row = db
    .prepare<[number], { lifecycle_state: string }>(
      `SELECT lifecycle_state FROM skill_registry WHERE id = ? LIMIT 1`
    )
    .get(skillId);
  if (!row) return null;
  if ((SKILL_LIFECYCLE_STATES as readonly string[]).includes(row.lifecycle_state)) {
    return row.lifecycle_state as SkillLifecycleState;
  }
  return null;
}

/**
 * Returns the audit trail for a single skill, sorted most-recent-first.
 * Used by the lifecycle history UI / API. Empty array when no
 * transitions have been recorded.
 */
export function getLifecycleAuditTrail(
  db: Database.Database,
  options: { skillId: number; limit?: number }
): LifecycleAuditRow[] {
  if (!Number.isInteger(options.skillId) || options.skillId <= 0) return [];
  const limit =
    options.limit && Number.isFinite(options.limit) && options.limit > 0
      ? Math.min(options.limit, 200)
      : 100;
  return db
    .prepare<[number, number], LifecycleAuditRow>(
      `SELECT id, skill_id, from_state, to_state, actor, reason, transitioned_at
         FROM skill_lifecycle_audit
        WHERE skill_id = ?
        ORDER BY transitioned_at DESC, id DESC
        LIMIT ?`
    )
    .all(options.skillId, limit);
}

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

function isValidTransition(
  from: SkillLifecycleState,
  to: SkillLifecycleState
): boolean {
  if (from === "draft") {
    return to === "enabled";
  }
  if (from === "enabled") {
    return to === "deprecated";
  }
  if (from === "deprecated") {
    return to === "retired";
  }
  // retired is terminal.
  return false;
}

/**
 * Applies a lifecycle transition to a skill. Enforces the documented
 * state-machine rules:
 *
 *   - draft -> enabled requires the skill_quarantine row for this skill
 *     to exist in 'pending_approval' or 'enabled' stage.
 *   - enabled -> deprecated requires `reason` to be a non-empty trimmed
 *     string.
 *   - deprecated -> retired requires skill_dependencies to have zero
 *     rows for this skill; otherwise the transition is rejected and the
 *     error message lists every dependent agent ID.
 *   - retired is terminal: every outbound transition throws.
 *
 * On a successful transition the function:
 *   1. UPDATE skill_registry.lifecycle_state
 *   2. INSERT a skill_lifecycle_audit row
 *   3. INSERT a paired skill_lifecycle_transitioned audit_entries row
 *   4. When the new state is 'deprecated', INSERT one
 *      skill_lifecycle_deprecated audit_entries row per dependent
 *      agent so downstream tooling can fan out notifications.
 *
 * Throws LifecycleTransitionError on any rule violation so the API
 * layer can return a deterministic 409 with the error message.
 */
export function transitionLifecycleState(
  db: Database.Database,
  skillId: number,
  toState: SkillLifecycleState,
  actor: string,
  reason: string
): LifecycleTransitionResult {
  if (!Number.isInteger(skillId) || skillId <= 0) {
    throw new LifecycleTransitionError(
      `transitionLifecycleState: skillId must be a positive integer (got ${skillId})`
    );
  }
  if (!actor || !actor.trim()) {
    throw new LifecycleTransitionError(
      `transitionLifecycleState: actor must be a non-empty string`
    );
  }
  const cleanActor = actor.trim();
  const cleanReason = (reason ?? "").trim();

  const fromState = loadLifecycleState(db, skillId);
  if (fromState === null) {
    throw new LifecycleTransitionError(
      `Skill id=${skillId} not found in skill_registry (or lifecycle_state invalid)`
    );
  }

  if (!isValidTransition(fromState, toState)) {
    throw new LifecycleTransitionError(
      `Transition '${fromState} -> ${toState}' is not allowed for skill id=${skillId}`
    );
  }

  // Rule 1: draft -> enabled requires a passed quarantine record.
  if (fromState === "draft" && toState === "enabled") {
    const stage = loadQuarantineStage(db, skillId);
    if (!isQuarantinePassed(stage)) {
      throw new LifecycleTransitionError(
        stage === null
          ? `draft -> enabled requires the skill to have a quarantine pass record (none found for skill id=${skillId})`
          : `draft -> enabled requires the skill to have passed quarantine (current stage='${stage}' for skill id=${skillId})`
      );
    }
  }

  // Rule 2: enabled -> deprecated requires non-empty reason.
  if (fromState === "enabled" && toState === "deprecated") {
    if (!cleanReason) {
      throw new LifecycleTransitionError(
        `enabled -> deprecated requires a non-empty reason`
      );
    }
  }

  const deps = loadDependencyRows(db, skillId);

  // Rule 3: deprecated -> retired requires zero active dependents.
  if (fromState === "deprecated" && toState === "retired") {
    if (deps.length > 0) {
      const agentIds = deps.map((d) => d.dependent_agent_id).join(", ");
      throw new LifecycleTransitionError(
        `deprecated -> retired blocked by ${deps.length} active dependent(s) for skill id=${skillId}: ${agentIds}`
      );
    }
  }

  const now = new Date().toISOString();

  // Apply the state change in one transaction together with the audit
  // row so the SQL gate and the audit trail stay consistent even if a
  // process crashes between the two writes.
  let auditRow: LifecycleAuditRow;
  let notifications = 0;
  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE skill_registry
          SET lifecycle_state = ?
        WHERE id = ?
          AND lifecycle_state = ?`
    ).run(toState, skillId, fromState);

    auditRow = appendLifecycleAudit(db, {
      skillId,
      fromState,
      toState,
      actor: cleanActor,
      reason: cleanReason,
    });

    appendUnifiedAuditEntry(db, {
      skillId,
      eventType: "skill_lifecycle_transitioned",
      actor: cleanActor,
      reason: cleanReason || null,
      metadata: {
        skill_id: skillId,
        from_state: fromState,
        to_state: toState,
        actor: cleanActor,
        reason: cleanReason,
        transitioned_at: now,
      },
    });

    if (toState === "deprecated") {
      notifications = notifyDependents(db, {
        skillId,
        deps,
        actor: cleanActor,
        reason: cleanReason,
      });
    }
  });
  tx();

  return {
    skill_id: skillId,
    previous_state: fromState,
    lifecycle_state: toState,
    audit: auditRow!,
    notifications,
  };
}

// ---------------------------------------------------------------------------
// NOC surface
// ---------------------------------------------------------------------------

export interface DeprecatedSkillNocEntry {
  skill_id: number;
  name: string | null;
  source_harness: string;
  version: string | null;
  risk_tier: string | null;
  dependent_count: number;
  warning_level: "info" | "warning" | "critical";
  deprecated_at: string | null;
  deprecated_by: string | null;
  deprecation_reason: string | null;
}

/**
 * Returns one row per `deprecated` skill with a dependent count and a
 * derived warning level. The NOC endpoint reads this list to surface a
 * "deprecated skills" panel so operators see what needs migration.
 *
 * Warning levels are derived deterministically:
 *   - 0 dependents: "info" (deprecated with no dependents)
 *   - 1+ dependents: "warning"
 *   - 5+ dependents: "critical"
 */
export function listDeprecatedSkills(
  db: Database.Database,
  options: { limit?: number } = {}
): DeprecatedSkillNocEntry[] {
  const limit =
    options.limit && Number.isFinite(options.limit) && options.limit > 0
      ? Math.min(options.limit, 200)
      : 100;
  const rows = db
    .prepare<[number], {
      id: number;
      name: string | null;
      source_harness: string;
      version: string | null;
      risk_tier: string | null;
      dependent_count: number;
      deprecated_at: string | null;
      deprecated_by: string | null;
      deprecation_reason: string | null;
    }>(
      `SELECT
          sr.id                                  AS id,
          sr.name                                AS name,
          sr.source_harness                      AS source_harness,
          sr.version                             AS version,
          sr.risk_tier                           AS risk_tier,
          (SELECT COUNT(*) FROM skill_dependencies d
            WHERE d.skill_id = sr.id)            AS dependent_count,
          (SELECT transitioned_at FROM skill_lifecycle_audit a
            WHERE a.skill_id = sr.id AND a.to_state = 'deprecated'
            ORDER BY a.transitioned_at DESC LIMIT 1) AS deprecated_at,
          (SELECT actor FROM skill_lifecycle_audit a
            WHERE a.skill_id = sr.id AND a.to_state = 'deprecated'
            ORDER BY a.transitioned_at DESC LIMIT 1) AS deprecated_by,
          (SELECT reason FROM skill_lifecycle_audit a
            WHERE a.skill_id = sr.id AND a.to_state = 'deprecated'
            ORDER BY a.transitioned_at DESC LIMIT 1) AS deprecation_reason
        FROM skill_registry sr
        WHERE sr.lifecycle_state = 'deprecated'
        ORDER BY sr.id DESC
        LIMIT ?`
    )
    .all(limit);

  return rows.map((row) => {
    const deps = row.dependent_count;
    const warningLevel: DeprecatedSkillNocEntry["warning_level"] =
      deps >= 5 ? "critical" : deps >= 1 ? "warning" : "info";
    return {
      skill_id: row.id,
      name: row.name,
      source_harness: row.source_harness,
      version: row.version,
      risk_tier: row.risk_tier,
      dependent_count: deps,
      warning_level: warningLevel,
      deprecated_at: row.deprecated_at,
      deprecated_by: row.deprecated_by,
      deprecation_reason: row.deprecation_reason,
    };
  });
}
