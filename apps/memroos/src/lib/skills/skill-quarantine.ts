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
 */

import type Database from "better-sqlite3";

import { scanContent, type ScanResult } from "@/lib/content-scanner";

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
// SQL helpers
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
 * Inserts a fresh quarantine row for a skill_id. Throws when a row
 * already exists (callers should call `upsertQuarantineRecord` or
 * `updateQuarantineRecord` instead for transitions on existing rows).
 */
export function insertQuarantineRecord(
  db: Database.Database,
  params: InsertParams
): QuarantineRecord {
  const now = new Date().toISOString();
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

  const row = loadRowBySkillId(db, params.skillId);
  if (!row) {
    throw new Error(
      `insertQuarantineRecord: failed to read back inserted row for skill_id=${params.skillId}`
    );
  }
  // Use the lastInsertRowid if the readback returns an unexpected id (paranoia).
  if (row.id !== Number(result.lastInsertRowid)) {
    return rowToRecord({ ...row, id: Number(result.lastInsertRowid) });
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
}

/**
 * Updates an existing quarantine row with the supplied fields. Only
 * fields present on the params object are written (undefined = leave
 * unchanged). Returns the refreshed record, or null when no row exists.
 */
export function updateQuarantineRecord(
  db: Database.Database,
  skillId: number,
  params: UpdateParams
): QuarantineRecord {
  const now = new Date().toISOString();
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

/**
 * Result returned by `runQuarantinePipeline`. `advancedTo` reports the
 * final stage so callers can show "scanning → eval_sandbox → rejected"
 * in the operator UI. `blocked` is true when the pipeline ended in
 * 'rejected' (no further stage transitions are possible).
 */
export interface PipelineResult {
  record: QuarantineRecord;
  advancedTo: QuarantineStage;
  blocked: boolean;
  reason?: string;
}

/**
 * Threshold below which the eval score triggers an automatic rejection.
 * Exported for visibility and to allow operators to tune via env var.
 */
export const EVAL_PASS_THRESHOLD = 0.5;

/**
 * Resolves the eval pass threshold with optional env override. The
 * default keeps the existing 0.5 baseline; operators can tune via
 * `MEMROOS_QUARANTINE_EVAL_THRESHOLD` (0..1).
 */
export function resolveEvalThreshold(): number {
  const raw = process.env["MEMROOS_QUARANTINE_EVAL_THRESHOLD"];
  if (typeof raw !== "string") return EVAL_PASS_THRESHOLD;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return EVAL_PASS_THRESHOLD;
  return Math.min(1, Math.max(0, parsed));
}

/**
 * Deterministic eval score: how well does the raw_body satisfy the
 * declared verification_checks? Returns a number in [0, 1]. Each
 * non-empty verification line contributes one check; a check passes
 * when at least one substantive keyword from the line appears in the
 * raw_body. The final score is `passed_checks / total_checks` (or 1.0
 * when no checks are declared, since there is nothing to fail).
 *
 * This scorer is intentionally simple so it runs offline, has no
 * side-effects, and produces reproducible results across runs. The
 * quarantine pipeline never invokes an LLM at this step.
 */
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
    // Pull the keywords (length >= 4, alphanumeric) from the check and
    // require at least one to appear in the body. Numbers and stopwords
    // are skipped to avoid false positives on trivially common tokens.
    const tokens = line
      .toLowerCase()
      .split(/[^a-z0-9]+/g)
      .filter((t) => t.length >= 4);
    const matchable = tokens.filter(
      (t) => !["must", "should", "have", "with", "that", "this", "from", "into"].includes(t)
    );
    const tokensToCheck = matchable.length > 0 ? matchable : tokens;
    if (tokensToCheck.length === 0) {
      // Degenerate check (e.g. "---" or "ok") — count it as passed so it
      // does not unfairly gate the skill.
      passed += 1;
      continue;
    }
    if (tokensToCheck.some((t) => haystack.includes(t))) {
      passed += 1;
    }
  }

  return passed / lines.length;
}

/**
 * Runs the full quarantine pipeline from `imported` through
 * `pending_approval`. The pipeline is deterministic and side-effect-free:
 *   - Step 1: scanContent() on the raw_body. HIGH severity -> rejected.
 *   - Step 2: deterministic eval against verification_checks; score below
 *     threshold -> rejected. Otherwise eval_score is recorded.
 *   - Step 3: stage transitions to 'pending_approval'. Operator approval
 *     is a separate API call (see approveQuarantine / rejectQuarantine).
 *
 * The pipeline is idempotent: calling it twice from the same starting
 * state produces the same final record. If the existing record is
 * already past 'imported', the pipeline resumes from the current stage
 * (re-running scanning and eval if the row has not yet completed them).
 *
 * Returns the final QuarantineRecord plus the advancedTo stage and a
 * `blocked` flag (true when the pipeline ended in 'rejected').
 */
export function runQuarantinePipeline(
  db: Database.Database,
  skillId: number,
  rawBody: string,
  verificationChecks: string | null,
  options?: { evalThreshold?: number }
): PipelineResult {
  // Ensure a row exists for the skill_id (idempotent bootstrap).
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

  // Step 1: scanning — re-run unless we already have a recorded result.
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

  // Step 2: eval_sandbox — re-run if we have not yet recorded a score.
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

  // Step 3: pending_approval — only transition if not already past.
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

/**
 * Approves a quarantined skill: transitions stage -> 'enabled', sets
 * approval_status -> 'approved', records approved_by / approved_at, and
 * flips `skill_registry.dispatch_status` from 'quarantined' to 'enabled'.
 *
 * Throws QuarantineTransitionError when:
 *   - no quarantine row exists for the skill_id,
 *   - the skill is not in 'pending_approval' (already enabled / rejected
 *     / still scanning / etc.),
 *   - the operator identity is empty.
 */
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

  // Update quarantine record first so the audit trail is consistent even
  // if the skill_registry update below fails (which would throw and the
  // caller can retry from pending_approval).
  const updated = updateQuarantineRecord(db, skillId, {
    stage: "enabled",
    approvalStatus: "approved",
    approvedBy: operator.trim(),
    approvedAt: now,
  });

  // Flip the registry to dispatchable. The completeness gate still applies:
  // a skill with completeness_pct < 100 stays dispatchable=true but is
  // denied by the SQL filter in lookupSkillContract (fail-closed).
  // Phase 150 / SKILLTRUST-05: approval also promotes lifecycle_state
  // to 'enabled' so the v14 SQL gate
  // (lifecycle_state IS NULL OR lifecycle_state = 'enabled') lets the
  // skill through. Without this, a freshly approved skill stays in
  // draft lifecycle and the dispatcher refuses to invoke it.
  db.prepare(
    `UPDATE skill_registry
        SET dispatch_status = 'enabled',
            lifecycle_state = 'enabled'
      WHERE id = ?`
  ).run(skillId);

  return updated;
}

/**
 * Rejects a quarantined skill: transitions stage -> 'rejected', sets
 * approval_status -> 'rejected', records approved_by / approved_at (the
 * rejecting operator), and rejection_reason. The skill_registry row is
 * left in 'quarantined' so lookupSkillContract continues to deny it.
 *
 * Throws QuarantineTransitionError when:
 *   - no quarantine row exists for the skill_id,
 *   - the skill is already in 'enabled' (cannot retroactively reject
 *     a skill that has already been approved and is dispatchable),
 *   - rejection reason is empty,
 *   - the operator identity is empty.
 */
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
    return record; // Idempotent: already rejected, return as-is.
  }

  const now = new Date().toISOString();
  const updated = updateQuarantineRecord(db, skillId, {
    stage: "rejected",
    approvalStatus: "rejected",
    approvedBy: operator.trim(),
    approvedAt: now,
    rejectionReason: reason.trim(),
  });

  // Defensive: the registry row stays 'quarantined' (or whichever
  // non-enabled status it had before). We do not flip it to 'rejected'
  // because dispatch_status is a small fixed enum and the SQL gate
  // already denies quarantined rows. Re-stamping it to 'quarantined'
  // here would be a no-op anyway but we keep the comment explicit so a
  // future change does not silently flip status.

  return updated;
}
