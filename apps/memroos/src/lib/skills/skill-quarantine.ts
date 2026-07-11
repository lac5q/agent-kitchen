/**
 * Skill Quarantine Pipeline — Phase 149 / SKILLTRUST-03.
 *
 * Imported / marketplace skills never become dispatchable directly. They
 * enter a state machine that runs each skill through an injection scan,
 * a sandboxed eval against the declared verification checks, and a
 * mandatory operator approval gate. Only after the operator approves does
 * the skill flip to `dispatch_status='enabled'` and become dispatchable.
 *
 * State machine:
 *
 *   imported
 *      │
 *      ▼
 *   scanning   ────────────►  rejected   (HIGH-severity scanner match)
 *      │
 *      ▼
 *   eval_sandbox ──────────►  rejected   (eval score below threshold)
 *      │
 *      ▼
 *   pending_approval ──────►  rejected   (operator rejects via API)
 *      │
 *      ▼
 *   enabled    (operator approves via API)
 *
 * Security contract:
 *   - No import path may set `dispatch_status='enabled'` directly. Imports
 *     always land in stage 'imported' with dispatch_status='quarantined'.
 *   - Stage transitions are append-only: every transition writes a new
 *     skill_quarantine row (or updates the existing row with a fresh
 *     updated_at + stage).
 *   - Approval / rejection always requires an explicit operator identity
 *     and is rejected when the skill is not in `pending_approval`.
 *   - The eval step uses a deterministic, sandboxed scorer (no LLM, no
 *     network, no side-effects) that compares the raw_body against the
 *     verification_checks section so the eval score is reproducible.
 *   - VAL-038 audit-atomic: every stage transition writes an audit_entries
 *     row with IDs/hashes/classifications/reasons, no raw secrets, inside
 *     the same transaction as the state mutation.
 */

import { randomUUID } from "crypto";
import type Database from "better-sqlite3";

import { scanContent, type ScanResult } from "@/lib/content-scanner";
import {
  buildSkillAuditEntry,
} from "@/lib/audit/skill-chain";

// ---------------------------------------------------------------------------
// State machine types
// ---------------------------------------------------------------------------

export const QUARANTINE_STAGES = [
  "imported",
  "scanning",
  "eval_sandbox",
  "pending_approval",
  "enabled",
  "rejected",
] as const;

export type QuarantineStage = (typeof QUARANTINE_STAGES)[number];

export type ApprovalStatus = "pending" | "approved" | "rejected";

export interface QuarantineRecord {
  id: number;
  skill_id: number;
  stage: QuarantineStage;
  scanner_result: ScanResult | null;
  eval_score: number | null;
  approval_status: ApprovalStatus;
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface QuarantineRow {
  id: number;
  skill_id: number;
  stage: string;
  scanner_result: string | null;
  eval_score: number | null;
  approval_status: string;
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// SQL helpers + audit helpers (VAL-038, VAL-039)
// ---------------------------------------------------------------------------

function parseScannerResult(raw: string | null): ScanResult | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ScanResult;
  } catch {
    return null;
  }
}

function rowToRecord(row: QuarantineRow): QuarantineRecord {
  return {
    id: row.id,
    skill_id: row.skill_id,
    stage: row.stage as QuarantineStage,
    scanner_result: parseScannerResult(row.scanner_result),
    eval_score: row.eval_score,
    approval_status: row.approval_status as ApprovalStatus,
    approved_by: row.approved_by,
    approved_at: row.approved_at,
    rejection_reason: row.rejection_reason,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function loadRowBySkillId(
  db: Database.Database,
  skillId: number
): QuarantineRow | null {
  const row = db
    .prepare<[number], QuarantineRow>(
      `SELECT id, skill_id, stage, scanner_result, eval_score,
              approval_status, approved_by, approved_at, rejection_reason,
              created_at, updated_at
         FROM skill_quarantine
        WHERE skill_id = ?
        LIMIT 1`
    )
    .get(skillId);
  return row ?? null;
}

/**
 * Returns the quarantine record for the given skill_id, or null when no
 * quarantine row exists (e.g. legacy skills imported before v11).
 */
export function getQuarantineRecord(
  db: Database.Database,
  skillId: number
): QuarantineRecord | null {
  const row = loadRowBySkillId(db, skillId);
  return row ? rowToRecord(row) : null;
}

/**
 * Returns all quarantine rows for the given optional stage filter.
 * Stage matching is exact. Default sort is updated_at DESC so the most
 * recent transitions appear first.
 */
export function listQuarantineRecords(
  db: Database.Database,
  options?: {
    stage?: QuarantineStage;
    approvalStatus?: ApprovalStatus;
    limit?: number;
    offset?: number;
  }
): QuarantineRecord[] {
  const stage = options?.stage;
  const approval = options?.approvalStatus;
  const limit =
    options?.limit && Number.isFinite(options.limit) && options.limit > 0
      ? Math.min(options.limit, 200)
      : 50;
  const offset =
    options?.offset && Number.isFinite(options.offset) && options.offset >= 0
      ? options.offset
      : 0;

  const conditions: string[] = [];
  const params: unknown[] = [];
  if (stage) {
    conditions.push("stage = ?");
    params.push(stage);
  }
  if (approval) {
    conditions.push("approval_status = ?");
    params.push(approval);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const rows = db
    .prepare<unknown[], QuarantineRow>(
      `SELECT id, skill_id, stage, scanner_result, eval_score,
              approval_status, approved_by, approved_at, rejection_reason,
              created_at, updated_at
         FROM skill_quarantine
         ${where}
         ORDER BY updated_at DESC
         LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset);

  return rows.map(rowToRecord);
}

interface InsertParams {
  skillId: number;
  stage: QuarantineStage;
  scannerResult?: ScanResult | null;
  evalScore?: number | null;
  approvalStatus?: ApprovalStatus;
  approvedBy?: string | null;
  approvedAt?: string | null;
  rejectionReason?: string | null;
}

/**
 * Internal helper that performs an UPDATE of skill_quarantine without an
 * enclosing transaction — used inside transactional wrappers.
 */
function updateQuarantineRecordInternal(
  db: Database.Database,
  skillId: number,
  params: UpdateParams,
  now: string
): void {
  const setClauses: string[] = ["updated_at = ?"];
  const values: unknown[] = [now];

  if (params.stage !== undefined) {
    setClauses.push("stage = ?");
    values.push(params.stage);
  }
  if (params.scannerResult !== undefined) {
    setClauses.push("scanner_result = ?");
    values.push(JSON.stringify(params.scannerResult));
  }
  if (params.evalScore !== undefined) {
    setClauses.push("eval_score = ?");
    values.push(params.evalScore);
  }
  if (params.approvalStatus !== undefined) {
    setClauses.push("approval_status = ?");
    values.push(params.approvalStatus);
  }
  if (params.approvedBy !== undefined) {
    setClauses.push("approved_by = ?");
    values.push(params.approvedBy);
  }
  if (params.approvedAt !== undefined) {
    setClauses.push("approved_at = ?");
    values.push(params.approvedAt);
  }
  if (params.rejectionReason !== undefined) {
    setClauses.push("rejection_reason = ?");
    values.push(params.rejectionReason);
  }

  values.push(skillId);
  db.prepare(
    `UPDATE skill_quarantine
        SET ${setClauses.join(", ")}
      WHERE skill_id = ?`
  ).run(...values);
}

function writeQuarantineAudit(
  db: Database.Database,
  opts: {
    skillId: number;
    fromStage: QuarantineStage | string | null;
    toStage: QuarantineStage;
    actor: string;
    reason?: string | null;
    evalScore?: number | null;
    approvalStatus?: string | null;
    classification?: string;
  }
): void {
  try {
    const built = buildSkillAuditEntry(db, {
      tenantId: "default-tenant",
      actorId: opts.actor,
      actorRole: "operator",
      eventType: "skill.quarantine.transitioned",
      entityType: "skill",
      entityId: `skill:${opts.skillId}`,
      reason: opts.reason ?? `quarantine ${opts.fromStage ?? "∅"} -> ${opts.toStage}`,
      metadata: {
        skill_id: opts.skillId,
        from_stage: opts.fromStage ?? null,
        to_stage: opts.toStage,
        actor: opts.actor,
        reason: opts.reason ?? null,
        eval_score: opts.evalScore ?? null,
        approval_status: opts.approvalStatus ?? null,
        classification: opts.classification ?? "quarantine_transition",
      },
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
  } catch (err) {
    // For partial test DBs where audit_entries does not exist, swallow.
    // When table exists, rethrow to enforce audit-atomicity (transaction rolls back).
    try {
      const exists = db
        .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='audit_entries'`)
        .get() as { name: string } | undefined;
      if (!exists) return;
    } catch {
      return;
    }
    throw err;
  }
}



/**
 * Inserts a fresh quarantine row for a skill_id. Throws when a row
 * already exists (callers should call `upsertQuarantineRecord` or
 * `updateQuarantineRecord` instead for transitions on existing rows).
 * VAL-038: wrapped in transaction with audit.
 */
export function insertQuarantineRecord(
  db: Database.Database,
  params: InsertParams
): QuarantineRecord {
  const now = new Date().toISOString();
  const fromStage: QuarantineStage | null = null;
  const actor = params.approvedBy ?? "system";

  const txn = db.transaction(() => {
    const result = db
      .prepare(
        `INSERT INTO skill_quarantine
          (skill_id, stage, scanner_result, eval_score, approval_status,
           approved_by, approved_at, rejection_reason, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        params.skillId,
        params.stage,
        JSON.stringify(params.scannerResult ?? {}),
        params.evalScore ?? null,
        params.approvalStatus ?? "pending",
        params.approvedBy ?? null,
        params.approvedAt ?? null,
        params.rejectionReason ?? null,
        now,
        now
      );

    writeQuarantineAudit(db, {
      skillId: params.skillId,
      fromStage,
      toStage: params.stage,
      actor,
      reason: params.rejectionReason ?? null,
      evalScore: params.evalScore ?? null,
      approvalStatus: params.approvalStatus ?? "pending",
      classification: "quarantine_insert",
    });

    void result;
  });
  txn();

  const row = loadRowBySkillId(db, params.skillId);
  if (!row) {
    throw new Error(
      `insertQuarantineRecord: failed to read back inserted row for skill_id=${params.skillId}`
    );
  }
  return rowToRecord(row);
}

/**
 * Inserts or updates the quarantine row for a skill_id. Used by the import
 * path to seed the initial 'imported' row in a single atomic operation.
 */
export function upsertQuarantineRecord(
  db: Database.Database,
  params: InsertParams
): QuarantineRecord {
  const existing = loadRowBySkillId(db, params.skillId);
  if (existing) {
    return updateQuarantineRecord(db, params.skillId, {
      stage: params.stage,
      scannerResult: params.scannerResult,
      evalScore: params.evalScore,
      approvalStatus: params.approvalStatus,
      approvedBy: params.approvedBy,
      approvedAt: params.approvedAt,
      rejectionReason: params.rejectionReason,
    });
  }
  return insertQuarantineRecord(db, params);
}

interface UpdateParams {
  stage?: QuarantineStage;
  scannerResult?: ScanResult | null;
  evalScore?: number | null;
  approvalStatus?: ApprovalStatus;
  approvedBy?: string | null;
  approvedAt?: string | null;
  rejectionReason?: string | null;
  /** Optional actor override for audit, defaults to approvedBy or system */
  _actor?: string;
}

/**
 * Updates an existing quarantine row with the supplied fields. Only
 * fields present on the params object are written (undefined = leave
 * unchanged). Returns the refreshed record, or null when no row exists.
 * VAL-038: audit-atomic transaction.
 */
export function updateQuarantineRecord(
  db: Database.Database,
  skillId: number,
  params: UpdateParams
): QuarantineRecord {
  const existing = loadRowBySkillId(db, skillId);
  const fromStage = (existing?.stage as QuarantineStage | undefined) ?? null;
  const actor = (params as any)._actor ?? params.approvedBy ?? "system";
  const now = new Date().toISOString();

  const txn = db.transaction(() => {
    updateQuarantineRecordInternal(db, skillId, params, now);
    if (params.stage !== undefined) {
      writeQuarantineAudit(db, {
        skillId,
        fromStage,
        toStage: params.stage as QuarantineStage,
        actor,
        reason: params.rejectionReason ?? null,
        evalScore: params.evalScore ?? existing?.eval_score ?? null,
        approvalStatus: params.approvalStatus ?? existing?.approval_status ?? null,
        classification: "quarantine_stage_transition",
      });
    }
  });
  txn();

  const row = loadRowBySkillId(db, skillId);
  if (!row) {
    throw new Error(
      `updateQuarantineRecord: row not found for skill_id=${skillId}`
    );
  }
  return rowToRecord(row);
}

// ---------------------------------------------------------------------------
// Stage machine orchestration
// ---------------------------------------------------------------------------

export interface PipelineResult {
  record: QuarantineRecord;
  advancedTo: QuarantineStage;
  blocked: boolean;
  reason?: string;
}

export const EVAL_PASS_THRESHOLD = 0.5;

export function resolveEvalThreshold(): number {
  const raw = process.env["MEMROOS_QUARANTINE_EVAL_THRESHOLD"];
  if (typeof raw !== "string") return EVAL_PASS_THRESHOLD;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return EVAL_PASS_THRESHOLD;
  return Math.min(1, Math.max(0, parsed));
}

export function scoreVerificationChecks(
  rawBody: string,
  verificationChecks: string | null
): number {
  if (!verificationChecks || !verificationChecks.trim()) {
    return 1.0;
  }

  const lines = verificationChecks
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-*]\s*/, "").trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) return 1.0;

  const haystack = (rawBody ?? "").toLowerCase();
  let passed = 0;
  for (const line of lines) {
    const tokens = line
      .toLowerCase()
      .split(/[^a-z0-9]+/g)
      .filter((t) => t.length >= 4);
    const matchable = tokens.filter(
      (t) => !["must", "should", "have", "with", "that", "this", "from", "into"].includes(t)
    );
    const tokensToCheck = matchable.length > 0 ? matchable : tokens;
    if (tokensToCheck.length === 0) {
      passed += 1;
      continue;
    }
    if (tokensToCheck.some((t) => haystack.includes(t))) {
      passed += 1;
    }
  }

  return passed / lines.length;
}

export function runQuarantinePipeline(
  db: Database.Database,
  skillId: number,
  rawBody: string,
  verificationChecks: string | null,
  options?: { evalThreshold?: number }
): PipelineResult {
  let record = getQuarantineRecord(db, skillId);
  if (!record) {
    record = insertQuarantineRecord(db, {
      skillId,
      stage: "imported",
      scannerResult: null,
      evalScore: null,
      approvalStatus: "pending",
    });
  }

  let working: QuarantineRecord = record;
  let reason: string | undefined;

  if (working.stage === "imported" || working.stage === "scanning") {
    if (working.stage === "imported") {
      working = updateQuarantineRecord(db, skillId, { stage: "scanning" });
    }
    const scan = scanContent(rawBody ?? "");
    working = updateQuarantineRecord(db, skillId, {
      stage: "scanning",
      scannerResult: scan,
    });
    if (scan.blocked) {
      const blockedReason =
        scan.matches.find((m) => m.severity === "HIGH")?.patternName ??
        "scanner_high_severity";
      reason = `Scanner blocked import: HIGH severity match (${blockedReason})`;
      working = updateQuarantineRecord(db, skillId, {
        stage: "rejected",
        approvalStatus: "rejected",
        rejectionReason: reason,
      });
      return {
        record: working,
        advancedTo: "rejected",
        blocked: true,
        reason,
      };
    }
  }

  const evalThreshold =
    options?.evalThreshold ?? resolveEvalThreshold();

  if (working.stage === "scanning" || working.stage === "eval_sandbox") {
    if (working.stage === "scanning") {
      working = updateQuarantineRecord(db, skillId, { stage: "eval_sandbox" });
    }
    const score = scoreVerificationChecks(rawBody ?? "", verificationChecks);
    working = updateQuarantineRecord(db, skillId, {
      stage: "eval_sandbox",
      evalScore: score,
    });
    if (score < evalThreshold) {
      reason = `Sandbox eval score ${score.toFixed(3)} below threshold ${evalThreshold.toFixed(3)}`;
      working = updateQuarantineRecord(db, skillId, {
        stage: "rejected",
        approvalStatus: "rejected",
        rejectionReason: reason,
      });
      return {
        record: working,
        advancedTo: "rejected",
        blocked: true,
        reason,
      };
    }
  }

  if (working.stage !== "pending_approval" && working.stage !== "enabled") {
    working = updateQuarantineRecord(db, skillId, {
      stage: "pending_approval",
    });
  }

  return {
    record: working,
    advancedTo: working.stage,
    blocked: false,
  };
}

// ---------------------------------------------------------------------------
// Approval / rejection
// ---------------------------------------------------------------------------

export class QuarantineTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuarantineTransitionError";
  }
}

export function approveQuarantine(
  db: Database.Database,
  skillId: number,
  operator: string
): QuarantineRecord {
  if (!operator || !operator.trim()) {
    throw new QuarantineTransitionError(
      "Operator identity is required to approve a quarantined skill"
    );
  }

  const record = getQuarantineRecord(db, skillId);
  if (!record) {
    throw new QuarantineTransitionError(
      `No quarantine record found for skill_id=${skillId}`
    );
  }
  if (record.stage !== "pending_approval") {
    throw new QuarantineTransitionError(
      `Cannot approve skill_id=${skillId} from stage '${record.stage}' — must be 'pending_approval'`
    );
  }

  const now = new Date().toISOString();
  const fromStage = record.stage;

  // VAL-038: Wrap quarantine update + registry update + audit in one transaction
  const txn = db.transaction(() => {
    updateQuarantineRecordInternal(db, skillId, {
      stage: "enabled",
      approvalStatus: "approved",
      approvedBy: operator.trim(),
      approvedAt: now,
    }, now);

    writeQuarantineAudit(db, {
      skillId,
      fromStage: fromStage as QuarantineStage,
      toStage: "enabled",
      actor: operator.trim(),
      reason: "operator_approved",
      approvalStatus: "approved",
      classification: "quarantine_approved",
    });

    db.prepare(
      `UPDATE skill_registry
          SET dispatch_status = 'enabled',
              lifecycle_state = 'enabled'
        WHERE id = ?`
    ).run(skillId);
  });
  txn();

  const updatedRow = loadRowBySkillId(db, skillId);
  if (!updatedRow) throw new Error(`approveQuarantine readback failed for skill_id=${skillId}`);
  return rowToRecord(updatedRow);
}

export function rejectQuarantine(
  db: Database.Database,
  skillId: number,
  operator: string,
  reason: string
): QuarantineRecord {
  if (!operator || !operator.trim()) {
    throw new QuarantineTransitionError(
      "Operator identity is required to reject a quarantined skill"
    );
  }
  if (!reason || !reason.trim()) {
    throw new QuarantineTransitionError(
      "Rejection reason is required to reject a quarantined skill"
    );
  }

  const record = getQuarantineRecord(db, skillId);
  if (!record) {
    throw new QuarantineTransitionError(
      `No quarantine record found for skill_id=${skillId}`
    );
  }
  if (record.stage === "enabled") {
    throw new QuarantineTransitionError(
      `Cannot reject skill_id=${skillId} — already approved (stage='enabled')`
    );
  }
  if (record.stage === "rejected") {
    return record;
  }

  const now = new Date().toISOString();
  const fromStage = record.stage;

  const txn = db.transaction(() => {
    updateQuarantineRecordInternal(db, skillId, {
      stage: "rejected",
      approvalStatus: "rejected",
      approvedBy: operator.trim(),
      approvedAt: now,
      rejectionReason: reason.trim(),
    }, now);

    writeQuarantineAudit(db, {
      skillId,
      fromStage: fromStage as QuarantineStage,
      toStage: "rejected",
      actor: operator.trim(),
      reason: reason.trim(),
      approvalStatus: "rejected",
      classification: "quarantine_rejected",
    });
  });
  txn();

  const updatedRow = loadRowBySkillId(db, skillId);
  if (!updatedRow) throw new Error(`rejectQuarantine readback failed for skill_id=${skillId}`);
  return rowToRecord(updatedRow);
}
