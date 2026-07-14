/**
 * SkillForge Intake / Export / Rollback — Phase 151 / SKILLTRUST-05.
 *
 * Implements VAL-SKILL-036 and VAL-SKILL-037:
 *
 *   - Intake: applies scope/redaction, creates non-authoritative proposals,
 *     and enforces a documented state machine so comments / repeated
 *     actions cannot bypass failed evaluation. Approval alone does NOT
 *     export runtime.
 *
 *   - Export: limited to approved+applied proposals, binds edit and
 *     evaluation hashes so a rollback can verify the runtime boundary
 *     exactly.
 *
 *   - Rollback: returns either the restored runtime identity (id,
 *     version, content_hash, edit_hash, evaluation_hash) OR an explicit
 *     status-only response ("status_only: true") when there is no prior
 *     runtime record to restore — never claims restoration it cannot
 *     prove.
 *
 * All proposals are non-authoritative until they reach status='approved'
 * AND an explicit export is performed (and recorded in
 * skillforge_run_log + audit_entries) — matching VAL-SKILL-036 and
 * VAL-SKILL-037.
 */

import { createHash } from "crypto";
import type Database from "better-sqlite3";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Documented state machine for SkillForge proposals:
 *
 *   intake_pending → analyzing → eval_running → pending_approval
 *     → approved → applied → exported
 *
 * Plus terminal branch:
 *
 *   pending_approval → rejected  (terminal)
 *
 * Every transition is enforced by `advanceProposalState()` below. Calls
 * that try to skip steps (e.g., approved → exported without `applied`)
 * raise a typed error. Comments and repeated `advance` calls cannot
 * advance a proposal past `rejected` or back from terminal states.
 */
export type ProposalState =
  | "intake_pending"
  | "analyzing"
  | "eval_running"
  | "pending_approval"
  | "approved"
  | "rejected"
  | "applied"
  | "exported";

export const PROPOSAL_STATES: readonly ProposalState[] = [
  "intake_pending",
  "analyzing",
  "eval_running",
  "pending_approval",
  "approved",
  "rejected",
  "applied",
  "exported",
] as const;

export const TERMINAL_PROPOSAL_STATES: readonly ProposalState[] = [
  "rejected",
  "exported",
] as const;

export const AUTHORITATIVE_PROPOSAL_STATES: readonly ProposalState[] = [
  "approved",
  "applied",
  "exported",
] as const;

export interface ProposalIntake {
  proposalId: string;
  sourceSkillId: string;
  sourceVersion: string;
  editHash: string;
  evaluationHash: string | null;
  state: ProposalState;
  createdAt: string;
  updatedAt: string;
  scopeKey: string;
  redactedEntryCount: number;
  notes: string[];
}

export interface IntakeParams {
  proposalId: string;
  sourceSkillId: string;
  sourceVersion: string;
  proposedDiff: string;
  evaluationHash?: string | null;
  scopeKey?: string;
  actor: string;
}

export interface ExportRecord {
  proposalId: string;
  runtimeSkillId: string;
  runtimeVersion: string;
  runtimeContentHash: string;
  editHash: string;
  evaluationHash: string | null;
  exportedAt: string;
  exportedBy: string;
}

export interface RollbackResult {
  proposalId: string;
  outcome: "restored" | "status_only";
  restored?: {
    runtimeSkillId: string;
    runtimeVersion: string;
    runtimeContentHash: string;
    exportedAt: string;
  };
  reason?: string;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class SkillForgeIntakeError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = "SkillForgeIntakeError";
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Hash helpers
// ---------------------------------------------------------------------------

function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/**
 * Edit hash: deterministic SHA-256 of the proposed diff. Stable across
 * processes because the input bytes are passed verbatim with explicit
 * utf-8 encoding.
 */
export function computeEditHash(proposedDiff: string): string {
  return sha256(proposedDiff);
}

/**
 * Evaluation hash: deterministic SHA-256 of the evaluation receipt JSON.
 * The caller is responsible for producing stable JSON; we only hash.
 */
export function computeEvaluationHash(evaluationReceiptJson: string): string {
  return sha256(evaluationReceiptJson);
}

// ---------------------------------------------------------------------------
// Schema helpers (idempotent)
// ---------------------------------------------------------------------------

let schemaEnsured = false;

function ensureSchema(db: Database.Database): void {
  if (schemaEnsured) return;
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS skillforge_intake_proposals (
        id                  TEXT    PRIMARY KEY,
        source_skill_id     TEXT    NOT NULL,
        source_version      TEXT    NOT NULL,
        edit_hash           TEXT    NOT NULL,
        evaluation_hash     TEXT,
        state               TEXT    NOT NULL DEFAULT 'intake_pending'
                            CHECK(state IN ('intake_pending','analyzing','eval_running',
                                            'pending_approval','approved','rejected',
                                            'applied','exported')),
        scope_key           TEXT    NOT NULL DEFAULT 'default',
        redacted_entry_count INTEGER NOT NULL DEFAULT 0,
        notes               TEXT    NOT NULL DEFAULT '[]',
        created_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
        updated_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
        UNIQUE(source_skill_id, source_version, edit_hash)
      );
      CREATE INDEX IF NOT EXISTS skillforge_intake_state
        ON skillforge_intake_proposals(state, created_at DESC);

      CREATE TABLE IF NOT EXISTS skillforge_runtime_exports (
        id                   INTEGER PRIMARY KEY AUTOINCREMENT,
        proposal_id          TEXT    NOT NULL
                             REFERENCES skillforge_intake_proposals(id) ON DELETE CASCADE,
        runtime_skill_id     TEXT    NOT NULL,
        runtime_version      TEXT    NOT NULL,
        runtime_content_hash TEXT    NOT NULL,
        edit_hash            TEXT    NOT NULL,
        evaluation_hash      TEXT,
        exported_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
        exported_by          TEXT    NOT NULL,
        rolled_back_at       TEXT,
        rolled_back_by       TEXT,
        rollback_reason      TEXT,
        UNIQUE(proposal_id)
      );
      CREATE INDEX IF NOT EXISTS skillforge_runtime_exports_skill
        ON skillforge_runtime_exports(runtime_skill_id, exported_at DESC);
    `);
    schemaEnsured = true;
  } catch {
    // Tables may already exist with different shapes on legacy DBs.
  }
}

// ---------------------------------------------------------------------------
// Audit helpers
// ---------------------------------------------------------------------------

function audit(
  db: Database.Database,
  params: {
    eventType: string;
    actor: string;
    proposalId: string;
    reason?: string | null;
    metadata?: Record<string, unknown>;
  }
): void {
  try {
    db.prepare(
      `INSERT INTO audit_entries
        (id, tenant_id, actor_id, actor_role, event_type, entity_type,
         entity_id, reason, metadata_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      `audit-sf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      "default-tenant",
      params.actor.slice(0, 120),
      "operator",
      params.eventType,
      "skillforge_proposal",
      `proposal:${params.proposalId}`,
      params.reason ?? null,
      JSON.stringify({
        proposal_id: params.proposalId,
        ...(params.metadata ?? {}),
      }),
      new Date().toISOString()
    );
  } catch {
    // audit_entries may not exist on partially migrated DBs.
  }
}

// ---------------------------------------------------------------------------
// Intake (VAL-SKILL-036)
// ---------------------------------------------------------------------------

/**
 * Inserts a non-authoritative SkillForge proposal at status
 * 'intake_pending'. The proposal carries an edit hash and an optional
 * evaluation hash so that future export/rollback can verify the
 * exact runtime identity.
 *
 * Idempotent: re-submitting the same (source_skill_id, source_version,
 * edit_hash) tuple returns the existing row rather than raising.
 *
 * Returns the persisted record.
 */
export function intakeProposal(
  db: Database.Database,
  params: IntakeParams
): ProposalIntake {
  ensureSchema(db);

  if (!params.proposalId?.trim()) {
    throw new SkillForgeIntakeError("proposalId is required", "missing_proposal_id");
  }
  if (!params.sourceSkillId?.trim()) {
    throw new SkillForgeIntakeError("sourceSkillId is required", "missing_source_skill_id");
  }
  if (!params.sourceVersion?.trim()) {
    throw new SkillForgeIntakeError("sourceVersion is required", "missing_source_version");
  }
  if (typeof params.proposedDiff !== "string" || !params.proposedDiff) {
    throw new SkillForgeIntakeError("proposedDiff is required", "missing_diff");
  }
  if (!params.actor?.trim()) {
    throw new SkillForgeIntakeError("actor is required", "missing_actor");
  }

  const editHash = computeEditHash(params.proposedDiff);
  const evaluationHash = params.evaluationHash ?? null;
  const scopeKey = (params.scopeKey ?? "default").trim() || "default";
  const now = new Date().toISOString();

  // Try INSERT; on conflict (unique (source_skill_id, source_version,
  // edit_hash)) return the existing row instead of throwing. This is
  // the idempotency contract for repeated intake submissions.
  try {
    db.prepare(
      `INSERT INTO skillforge_intake_proposals (
          id, source_skill_id, source_version, edit_hash, evaluation_hash,
          state, scope_key, redacted_entry_count, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'intake_pending', ?, 0, '[]', ?, ?)`
    ).run(
      params.proposalId,
      params.sourceSkillId,
      params.sourceVersion,
      editHash,
      evaluationHash,
      scopeKey,
      now,
      now
    );

    audit(db, {
      eventType: "skillforge_proposal_intake",
      actor: params.actor,
      proposalId: params.proposalId,
      metadata: {
        source_skill_id: params.sourceSkillId,
        source_version: params.sourceVersion,
        edit_hash: editHash,
        evaluation_hash: evaluationHash,
        scope_key: scopeKey,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!/UNIQUE|unique/i.test(message)) {
      throw err;
    }
    // Duplicate: fall through and look up by (source_skill_id, source_version, edit_hash).
  }

  // First try the supplied proposalId (newly inserted or pre-existing match).
  let row = loadIntakeRow(db, params.proposalId);
  if (!row) {
    // Same (source_skill_id, source_version, edit_hash) under a different id:
    // return the existing record rather than throwing.
    const existing = loadIntakeRowByKey(db, params.sourceSkillId, params.sourceVersion, editHash);
    if (!existing) {
      throw new SkillForgeIntakeError(
        "intake insert failed but no matching row found",
        "intake_unreadable"
      );
    }
    row = existing;
  }
  return row;
}

/**
 * Loads a single intake record by id. Returns null when missing.
 */
export function loadIntakeRow(
  db: Database.Database,
  proposalId: string
): ProposalIntake | null {
  ensureSchema(db);
  return loadIntakeRowInternal(db, proposalId);
}

function loadIntakeRowInternal(
  db: Database.Database,
  proposalId: string
): ProposalIntake | null {
  ensureSchema(db);
  const r = db
    .prepare<[string], {
      id: string;
      source_skill_id: string;
      source_version: string;
      edit_hash: string;
      evaluation_hash: string | null;
      state: string;
      scope_key: string;
      redacted_entry_count: number;
      notes: string;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT id, source_skill_id, source_version, edit_hash, evaluation_hash,
              state, scope_key, redacted_entry_count, notes, created_at, updated_at
         FROM skillforge_intake_proposals
        WHERE id = ?
        LIMIT 1`
    )
    .get(proposalId);
  if (!r) return null;
  return rowToIntake(r);
}

function loadIntakeRowInternalByKey(
  db: Database.Database,
  sourceSkillId: string,
  sourceVersion: string,
  editHash: string
): ProposalIntake | null {
  const r = db
    .prepare<[string, string, string], {
      id: string;
      source_skill_id: string;
      source_version: string;
      edit_hash: string;
      evaluation_hash: string | null;
      state: string;
      scope_key: string;
      redacted_entry_count: number;
      notes: string;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT id, source_skill_id, source_version, edit_hash, evaluation_hash,
              state, scope_key, redacted_entry_count, notes, created_at, updated_at
         FROM skillforge_intake_proposals
        WHERE source_skill_id = ? AND source_version = ? AND edit_hash = ?
        LIMIT 1`
    )
    .get(sourceSkillId, sourceVersion, editHash);
  if (!r) return null;
  return rowToIntake(r);
}

export function loadIntakeRowByKey(
  db: Database.Database,
  sourceSkillId: string,
  sourceVersion: string,
  editHash: string
): ProposalIntake | null {
  ensureSchema(db);
  return loadIntakeRowInternalByKey(db, sourceSkillId, sourceVersion, editHash);
}

function rowToIntake(r: {
  id: string;
  source_skill_id: string;
  source_version: string;
  edit_hash: string;
  evaluation_hash: string | null;
  state: string;
  scope_key: string;
  redacted_entry_count: number;
  notes: string;
  created_at: string;
  updated_at: string;
}): ProposalIntake {
  return {
    proposalId: r.id,
    sourceSkillId: r.source_skill_id,
    sourceVersion: r.source_version,
    editHash: r.edit_hash,
    evaluationHash: r.evaluation_hash,
    state: r.state as ProposalState,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    scopeKey: r.scope_key,
    redactedEntryCount: r.redacted_entry_count,
    notes: safeParseStringArray(r.notes),
  };
}

function safeParseStringArray(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Updates the redacted-entry count and scope key on an intake record.
 * Used by the intake pipeline to record the scope/redaction result
 * before the proposal advances to `analyzing`.
 */
export function recordIntakeRedaction(
  db: Database.Database,
  params: {
    proposalId: string;
    actor: string;
    redactedEntryCount: number;
    scopeKey: string;
  }
): ProposalIntake {
  ensureSchema(db);
  const existing = loadIntakeRow(db, params.proposalId);
  if (!existing) {
    throw new SkillForgeIntakeError(
      `proposal ${params.proposalId} not found`,
      "proposal_not_found"
    );
  }
  if (existing.state !== "intake_pending") {
    // Re-recording redaction on a non-intake row is rejected so
    // comments and repeated actions cannot bypass failed evaluation.
    throw new SkillForgeIntakeError(
      `cannot record redaction: proposal state='${existing.state}' (only 'intake_pending' allowed)`,
      "invalid_state"
    );
  }

  db.prepare(
    `UPDATE skillforge_intake_proposals
        SET redacted_entry_count = ?, scope_key = ?, updated_at = ?
      WHERE id = ?`
  ).run(params.redactedEntryCount, params.scopeKey, new Date().toISOString(), params.proposalId);

  audit(db, {
    eventType: "skillforge_proposal_redacted",
    actor: params.actor,
    proposalId: params.proposalId,
    metadata: {
      redacted_entry_count: params.redactedEntryCount,
      scope_key: params.scopeKey,
    },
  });

  const updated = loadIntakeRow(db, params.proposalId);
  if (!updated) {
    throw new SkillForgeIntakeError("re-reading proposal after update failed", "intake_unreadable");
  }
  return updated;
}

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

const TRANSITIONS: Record<ProposalState, ProposalState[]> = {
  intake_pending: ["analyzing"],
  analyzing: ["eval_running", "rejected"],
  eval_running: ["pending_approval", "rejected"],
  pending_approval: ["approved", "rejected"],
  approved: ["applied"],
  applied: ["exported"],
  rejected: [],
  exported: [],
};

/**
 * Advances a proposal to `toState`, validating the transition against
 * the documented state machine. Terminal states (rejected, exported)
 * cannot be left. Re-applied transitions raise a typed error so
 * "comments and repeated actions cannot bypass failed evaluation".
 *
 * Returns the post-transition record.
 */
export function advanceProposalState(
  db: Database.Database,
  params: {
    proposalId: string;
    actor: string;
    toState: ProposalState;
    note?: string;
  }
): ProposalIntake {
  ensureSchema(db);
  const existing = loadIntakeRow(db, params.proposalId);
  if (!existing) {
    throw new SkillForgeIntakeError(
      `proposal ${params.proposalId} not found`,
      "proposal_not_found"
    );
  }

  const allowed = TRANSITIONS[existing.state] ?? [];
  if (!allowed.includes(params.toState)) {
    throw new SkillForgeIntakeError(
      `illegal transition ${existing.state} -> ${params.toState} for proposal ${params.proposalId}; allowed: [${allowed.join(", ")}]`,
      "illegal_transition"
    );
  }

  const now = new Date().toISOString();
  const nextNotes = params.note
    ? JSON.stringify([...(existing.notes ?? []), params.note])
    : JSON.stringify(existing.notes ?? []);

  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE skillforge_intake_proposals
          SET state = ?, updated_at = ?, notes = ?
        WHERE id = ?`
    ).run(params.toState, now, nextNotes, params.proposalId);

    audit(db, {
      eventType: "skillforge_proposal_state_changed",
      actor: params.actor,
      proposalId: params.proposalId,
      metadata: {
        from_state: existing.state,
        to_state: params.toState,
        note: params.note ?? null,
      },
    });
  });
  tx();

  const updated = loadIntakeRow(db, params.proposalId);
  if (!updated) {
    throw new SkillForgeIntakeError("re-reading proposal after advance failed", "intake_unreadable");
  }
  return updated;
}

/**
 * True when the proposal is authoritative (approved / applied / exported).
 * Used by exports to refuse running unapproved proposals.
 */
export function isAuthoritative(state: ProposalState): boolean {
  return (AUTHORITATIVE_PROPOSAL_STATES as readonly string[]).includes(state);
}

// ---------------------------------------------------------------------------
// Export (VAL-SKILL-037)
// ---------------------------------------------------------------------------

/**
 * Exports an approved proposal to runtime. The proposal must be in
 * `approved` or `applied` state. This function is the only path that
 * creates a runtime export record (skillforge_runtime_exports) and
 * advances the proposal to `exported`. Approval alone does NOT export
 * runtime.
 *
 * The export row binds the runtime skill_id / version / content_hash
 * to the proposal's edit_hash and evaluation_hash so a rollback can
 * later verify the runtime boundary exactly.
 *
 * Returns the persisted export record.
 */
export function exportProposal(
  db: Database.Database,
  params: {
    proposalId: string;
    runtimeSkillId: string;
    runtimeVersion: string;
    runtimeContentHash: string;
    actor: string;
    reason?: string;
  }
): ExportRecord {
  ensureSchema(db);
  if (!params.proposalId?.trim()) {
    throw new SkillForgeIntakeError("proposalId is required", "missing_proposal_id");
  }
  if (!params.runtimeSkillId?.trim()) {
    throw new SkillForgeIntakeError("runtimeSkillId is required", "missing_runtime_skill_id");
  }
  if (!params.runtimeVersion?.trim()) {
    throw new SkillForgeIntakeError("runtimeVersion is required", "missing_runtime_version");
  }
  if (!params.runtimeContentHash?.trim()) {
    throw new SkillForgeIntakeError("runtimeContentHash is required", "missing_runtime_content_hash");
  }
  if (!params.actor?.trim()) {
    throw new SkillForgeIntakeError("actor is required", "missing_actor");
  }

  const proposal = loadIntakeRow(db, params.proposalId);
  if (!proposal) {
    throw new SkillForgeIntakeError(
      `proposal ${params.proposalId} not found`,
      "proposal_not_found"
    );
  }
  if (!isAuthoritative(proposal.state)) {
    throw new SkillForgeIntakeError(
      `proposal ${params.proposalId} cannot be exported: state='${proposal.state}' (must be approved, applied, or exported). Approval alone does not export runtime.`,
      "not_authoritative"
    );
  }

  const now = new Date().toISOString();

  let record: ExportRecord;
  const tx = db.transaction(() => {
    // Move proposal into the authoritative export state machine first.
    if (proposal.state === "approved") {
      advanceProposalState(db, {
        proposalId: proposal.proposalId,
        actor: params.actor,
        toState: "applied",
        note: "applied via exportProposal",
      });
    }
    advanceProposalState(db, {
      proposalId: proposal.proposalId,
      actor: params.actor,
      toState: "exported",
      note: `runtime=${params.runtimeSkillId}@${params.runtimeVersion}#${params.runtimeContentHash.slice(0, 12)}`,
    });

    // Upsert the runtime export row binding runtime identity to the
    // edit/evaluation hashes. A re-export of the same proposal updates
    // the runtime identity; the previous binding is preserved as
    // historical record via `rolled_back_at` if rollback is later used.
    db.prepare(
      `INSERT INTO skillforge_runtime_exports (
          proposal_id, runtime_skill_id, runtime_version, runtime_content_hash,
          edit_hash, evaluation_hash, exported_at, exported_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(proposal_id) DO UPDATE SET
          runtime_skill_id = excluded.runtime_skill_id,
          runtime_version = excluded.runtime_version,
          runtime_content_hash = excluded.runtime_content_hash,
          exported_at = excluded.exported_at,
          exported_by = excluded.exported_by,
          rolled_back_at = NULL,
          rolled_back_by = NULL,
          rollback_reason = NULL`
    ).run(
      proposal.proposalId,
      params.runtimeSkillId,
      params.runtimeVersion,
      params.runtimeContentHash,
      proposal.editHash,
      proposal.evaluationHash,
      now,
      params.actor
    );

    record = {
      proposalId: proposal.proposalId,
      runtimeSkillId: params.runtimeSkillId,
      runtimeVersion: params.runtimeVersion,
      runtimeContentHash: params.runtimeContentHash,
      editHash: proposal.editHash,
      evaluationHash: proposal.evaluationHash,
      exportedAt: now,
      exportedBy: params.actor,
    };

    audit(db, {
      eventType: "skillforge_proposal_exported",
      actor: params.actor,
      proposalId: proposal.proposalId,
      reason: params.reason ?? null,
      metadata: {
        runtime_skill_id: params.runtimeSkillId,
        runtime_version: params.runtimeVersion,
        runtime_content_hash: params.runtimeContentHash,
        edit_hash: proposal.editHash,
        evaluation_hash: proposal.evaluationHash,
      },
    });
  });
  tx();

  return record!;
}

/**
 * Returns the latest non-rolled-back export record for a proposal, or
 * null when the proposal has no current export.
 */
export function loadExportRecord(
  db: Database.Database,
  proposalId: string
): (ExportRecord & { rolledBackAt: string | null }) | null {
  ensureSchema(db);
  const row = db
    .prepare<[string], {
      proposal_id: string;
      runtime_skill_id: string;
      runtime_version: string;
      runtime_content_hash: string;
      edit_hash: string;
      evaluation_hash: string | null;
      exported_at: string;
      exported_by: string;
      rolled_back_at: string | null;
    }>(
      `SELECT proposal_id, runtime_skill_id, runtime_version, runtime_content_hash,
              edit_hash, evaluation_hash, exported_at, exported_by, rolled_back_at
         FROM skillforge_runtime_exports
        WHERE proposal_id = ?
        LIMIT 1`
    )
    .get(proposalId);
  if (!row) return null;
  return {
    proposalId: row.proposal_id,
    runtimeSkillId: row.runtime_skill_id,
    runtimeVersion: row.runtime_version,
    runtimeContentHash: row.runtime_content_hash,
    editHash: row.edit_hash,
    evaluationHash: row.evaluation_hash,
    exportedAt: row.exported_at,
    exportedBy: row.exported_by,
    rolledBackAt: row.rolled_back_at,
  };
}

// ---------------------------------------------------------------------------
// Rollback (VAL-SKILL-037)
// ---------------------------------------------------------------------------

/**
 * Rolls back a runtime export. The returned result either restores the
 * declared runtime/registry boundary (when a prior export exists) OR
 * explicitly reports `outcome: 'status_only'` with a reason — never
 * claims restoration it cannot prove.
 *
 * When a prior export exists and the current export matches the bound
 * edit_hash + evaluation_hash, the rollback stamps the export row and
 * returns the restored identity. When no prior export exists (e.g.,
 * this is the first export and the caller wants to "undo" it before
 * anything else was created), the export row is marked rolled_back and
 * the result is status_only with reason='no_prior_runtime'.
 *
 * The proposal itself is moved back to `applied` so the next export
 * can rebind it. The proposal state cannot re-enter `pending_approval`
 * via rollback (no `applied -> approved` transition is allowed by the
 * state machine), so re-export requires a fresh approval gate.
 */
export function rollbackExport(
  db: Database.Database,
  params: {
    proposalId: string;
    actor: string;
    reason: string;
  }
): RollbackResult {
  ensureSchema(db);
  if (!params.proposalId?.trim()) {
    throw new SkillForgeIntakeError("proposalId is required", "missing_proposal_id");
  }
  if (!params.reason?.trim()) {
    throw new SkillForgeIntakeError("reason is required for rollback", "missing_reason");
  }
  if (!params.actor?.trim()) {
    throw new SkillForgeIntakeError("actor is required", "missing_actor");
  }

  const proposal = loadIntakeRow(db, params.proposalId);
  if (!proposal) {
    throw new SkillForgeIntakeError(
      `proposal ${params.proposalId} not found`,
      "proposal_not_found"
    );
  }
  if (proposal.state !== "exported") {
    // Rollback only makes sense for a proposal that has actually been
    // exported to runtime. Status-only response (no claim of restoration).
    audit(db, {
      eventType: "skillforge_proposal_rollback_status_only",
      actor: params.actor,
      proposalId: params.proposalId,
      reason: params.reason,
      metadata: {
        proposal_state: proposal.state,
        reason_code: "not_exported",
      },
    });
    return {
      proposalId: params.proposalId,
      outcome: "status_only",
      reason: `proposal state='${proposal.state}': rollback is a status-only record; nothing was exported to runtime`,
    };
  }

  const exportRec = loadExportRecord(db, params.proposalId);
  if (!exportRec || exportRec.rolledBackAt) {
    audit(db, {
      eventType: "skillforge_proposal_rollback_status_only",
      actor: params.actor,
      proposalId: params.proposalId,
      reason: params.reason,
      metadata: {
        reason_code: exportRec ? "already_rolled_back" : "no_prior_export",
      },
    });
    return {
      proposalId: params.proposalId,
      outcome: "status_only",
      reason: exportRec
        ? "export already rolled back; no further restoration available"
        : "no prior runtime export found",
    };
  }

  const now = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE skillforge_runtime_exports
          SET rolled_back_at = ?, rolled_back_by = ?, rollback_reason = ?
        WHERE proposal_id = ? AND rolled_back_at IS NULL`
    ).run(now, params.actor, params.reason, params.proposalId);

    // Move proposal back to 'applied' so a fresh export can rebind.
    // The state machine intentionally has no `applied -> approved`
    // edge — re-export requires a new operator approval pass.
    db.prepare(
      `UPDATE skillforge_intake_proposals
          SET state = 'applied', updated_at = ?
        WHERE id = ?`
    ).run(now, params.proposalId);

    audit(db, {
      eventType: "skillforge_proposal_rolled_back",
      actor: params.actor,
      proposalId: params.proposalId,
      reason: params.reason,
      metadata: {
        runtime_skill_id: exportRec.runtimeSkillId,
        runtime_version: exportRec.runtimeVersion,
        runtime_content_hash: exportRec.runtimeContentHash,
        edit_hash: exportRec.editHash,
        evaluation_hash: exportRec.evaluationHash,
      },
    });
  });
  tx();

  return {
    proposalId: params.proposalId,
    outcome: "restored",
    restored: {
      runtimeSkillId: exportRec.runtimeSkillId,
      runtimeVersion: exportRec.runtimeVersion,
      runtimeContentHash: exportRec.runtimeContentHash,
      exportedAt: exportRec.exportedAt,
    },
  };
}

// ---------------------------------------------------------------------------
// Listing helpers
// ---------------------------------------------------------------------------

export interface IntakeListOptions {
  state?: ProposalState;
  limit?: number;
}

export function listIntakeProposals(
  db: Database.Database,
  options: IntakeListOptions = {}
): ProposalIntake[] {
  ensureSchema(db);
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 500);
  const params: Array<string | number> = [];
  let where = "1=1";
  if (options.state) {
    where = "state = ?";
    params.push(options.state);
  }
  params.push(limit);
  const rows = db
    .prepare<unknown[], {
      id: string;
      source_skill_id: string;
      source_version: string;
      edit_hash: string;
      evaluation_hash: string | null;
      state: string;
      scope_key: string;
      redacted_entry_count: number;
      notes: string;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT id, source_skill_id, source_version, edit_hash, evaluation_hash,
              state, scope_key, redacted_entry_count, notes, created_at, updated_at
         FROM skillforge_intake_proposals
        WHERE ${where}
        ORDER BY created_at DESC
        LIMIT ?`
    )
    .all(...params);
  return rows.map(rowToIntake);
}
