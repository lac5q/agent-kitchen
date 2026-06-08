/**
 * Phase 72-02: Behavioral eval job substrate.
 *
 * Provides durable async job tracking and evidence bundle persistence for
 * SEAL behavioral proposal classes (agent_instruction_patch, skill_addition).
 *
 * All schema is additive — tables are created via initSchema() in db-schema.ts.
 */
import crypto from "crypto";
import type Database from "better-sqlite3";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EvalJobStatus = "queued" | "running" | "passed" | "failed" | "rolled_back" | "canceled";

export interface EvalJob {
  id: string;
  proposalId: string;
  proposalType: string;
  agentId: string;
  status: EvalJobStatus;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RecordedToolCall {
  toolName: string;
  inputs: Record<string, unknown>;
  denied: boolean;
  denyReason?: string;
  /** Recorded output if the tool was not denied (currently always null in sandbox) */
  output?: unknown;
}

interface PromotionMetadata {
  modelVersion?: string | null;
  promptTemplateVersion?: string | null;
  datasetSeed?: string | null;
  passRate?: number | null;
  configHash?: string | null;
}

export interface EvidenceBundle {
  jobId: string;
  proposalId: string;
  agentId: string;
  /** ID of the held-out task sample used for behavioral eval */
  taskSampleId: string | null;
  /** Transcript of all tool calls attempted during sandbox eval */
  toolCallTranscript: RecordedToolCall[];
  /** Names of verification checks that passed */
  verificationChecks: string[];
  /** Assumptions not verified during eval */
  unverifiedAssumptions: string[];
  /** Residual risks identified during eval */
  residualRisks: string[];
  /** Memory/source IDs consumed during eval */
  sourcesConsumed: string[];
  /** Opaque handle for replay of the behavioral eval */
  replayHandle: string | null;
  /** Opaque handle for rollback if behavioral eval fails */
  rollbackHandle: string | null;
  /** Eval-pinned promotion metadata (missing fields render as null) */
  promotionMetadata: PromotionMetadata | null;
  /** Baseline W before the proposal was applied */
  preApplyBaselineW: number;
  /** Post-apply W (null when eval has not yet completed) */
  postApplyW: number | null;
}

// ---------------------------------------------------------------------------
// Internal row types
// ---------------------------------------------------------------------------

type JobRow = {
  id: string;
  proposal_id: string;
  proposal_type: string;
  agent_id: string;
  status: EvalJobStatus;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

type EvidenceRow = {
  job_id: string;
  proposal_id: string;
  agent_id: string;
  task_sample_id: string | null;
  tool_call_transcript_json: string;
  verification_checks_json: string;
  unverified_assumptions_json: string;
  residual_risks_json: string;
  sources_consumed_json: string;
  replay_handle: string | null;
  rollback_handle: string | null;
  promotion_metadata_json: string | null;
  pre_apply_baseline_w: number;
  post_apply_w: number | null;
};

// ---------------------------------------------------------------------------
// Row mappers
// ---------------------------------------------------------------------------

function rowToJob(row: JobRow): EvalJob {
  return {
    id: row.id,
    proposalId: row.proposal_id,
    proposalType: row.proposal_type,
    agentId: row.agent_id,
    status: row.status,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToEvidenceBundle(row: EvidenceRow): EvidenceBundle {
  return {
    jobId: row.job_id,
    proposalId: row.proposal_id,
    agentId: row.agent_id,
    taskSampleId: row.task_sample_id,
    toolCallTranscript: JSON.parse(row.tool_call_transcript_json) as RecordedToolCall[],
    verificationChecks: JSON.parse(row.verification_checks_json) as string[],
    unverifiedAssumptions: JSON.parse(row.unverified_assumptions_json) as string[],
    residualRisks: JSON.parse(row.residual_risks_json) as string[],
    sourcesConsumed: JSON.parse(row.sources_consumed_json) as string[],
    replayHandle: row.replay_handle,
    rollbackHandle: row.rollback_handle,
    promotionMetadata: row.promotion_metadata_json
      ? (JSON.parse(row.promotion_metadata_json) as PromotionMetadata)
      : null,
    preApplyBaselineW: row.pre_apply_baseline_w,
    postApplyW: row.post_apply_w,
  };
}

// ---------------------------------------------------------------------------
// Job CRUD
// ---------------------------------------------------------------------------

export interface CreateEvalJobInput {
  proposalId: string;
  proposalType: string;
  agentId: string;
  tenantId?: string;
}

/**
 * Creates a new eval job in 'queued' status.
 * Returns the stored job record.
 */
export function createEvalJob(db: Database.Database, input: CreateEvalJobInput): EvalJob {
  const id = `sej-${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  db.prepare(
    "INSERT INTO seal_eval_jobs " +
      "(id, proposal_id, proposal_type, agent_id, status, tenant_id, created_at, updated_at) " +
      "VALUES (?, ?, ?, ?, 'queued', ?, ?, ?)"
  ).run(
    id,
    input.proposalId,
    input.proposalType,
    input.agentId,
    input.tenantId ?? "default-tenant",
    now,
    now
  );
  return getEvalJob(db, id) as EvalJob;
}

/**
 * Retrieves a job by its ID. Returns null if not found.
 */
export function getEvalJob(db: Database.Database, jobId: string): EvalJob | null {
  const row = db.prepare("SELECT * FROM seal_eval_jobs WHERE id = ?").get(jobId) as
    | JobRow
    | undefined;
  return row ? rowToJob(row) : null;
}

export interface ListEvalJobsFilter {
  proposalId?: string;
  status?: EvalJobStatus;
  limit?: number;
}

/**
 * Lists eval jobs, optionally filtered by proposalId or status.
 * Ordered by created_at DESC.
 */
export function listEvalJobs(db: Database.Database, filter: ListEvalJobsFilter = {}): EvalJob[] {
  let query = "SELECT * FROM seal_eval_jobs WHERE 1=1";
  const params: (string | number)[] = [];

  if (filter.proposalId) {
    query += " AND proposal_id = ?";
    params.push(filter.proposalId);
  }
  if (filter.status) {
    query += " AND status = ?";
    params.push(filter.status);
  }
  query += " ORDER BY created_at DESC";
  if (filter.limit) {
    query += " LIMIT ?";
    params.push(filter.limit);
  }

  const rows = db.prepare(query).all(...params) as JobRow[];
  return rows.map(rowToJob);
}

export interface TransitionOptions {
  error?: string;
}

/**
 * Transitions a job to a new status.
 * Optionally records an error message for failed/rolled_back transitions.
 */
export function transitionJobStatus(
  db: Database.Database,
  jobId: string,
  status: EvalJobStatus,
  options: TransitionOptions = {}
): void {
  const now = new Date().toISOString();
  db.prepare(
    "UPDATE seal_eval_jobs SET status = ?, error_message = ?, updated_at = ? WHERE id = ?"
  ).run(status, options.error ?? null, now, jobId);
}

// ---------------------------------------------------------------------------
// Evidence bundle persistence
// ---------------------------------------------------------------------------

/**
 * Persists an evidence bundle for a completed or failed behavioral eval job.
 * All optional fields are stored as null when missing — never fabricated.
 * Safe to call even when postApplyW and other optional fields are absent.
 */
export function persistEvidenceBundle(db: Database.Database, bundle: EvidenceBundle): void {
  db.prepare(
    "INSERT OR REPLACE INTO seal_evidence_bundles " +
      "(job_id, proposal_id, agent_id, task_sample_id, " +
      " tool_call_transcript_json, verification_checks_json, " +
      " unverified_assumptions_json, residual_risks_json, sources_consumed_json, " +
      " replay_handle, rollback_handle, promotion_metadata_json, " +
      " pre_apply_baseline_w, post_apply_w) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(
    bundle.jobId,
    bundle.proposalId,
    bundle.agentId,
    bundle.taskSampleId,
    JSON.stringify(bundle.toolCallTranscript),
    JSON.stringify(bundle.verificationChecks),
    JSON.stringify(bundle.unverifiedAssumptions),
    JSON.stringify(bundle.residualRisks),
    JSON.stringify(bundle.sourcesConsumed),
    bundle.replayHandle,
    bundle.rollbackHandle,
    bundle.promotionMetadata ? JSON.stringify(bundle.promotionMetadata) : null,
    bundle.preApplyBaselineW,
    bundle.postApplyW
  );
}

/**
 * Retrieves an evidence bundle for the given job ID.
 * Returns null if no bundle has been persisted yet.
 */
export function getEvidenceBundle(db: Database.Database, jobId: string): EvidenceBundle | null {
  const row = db
    .prepare("SELECT * FROM seal_evidence_bundles WHERE job_id = ?")
    .get(jobId) as EvidenceRow | undefined;
  return row ? rowToEvidenceBundle(row) : null;
}

// ---------------------------------------------------------------------------
// Behavioral proposal type predicate
// ---------------------------------------------------------------------------

/**
 * Proposal types that require true behavioral W-lift via async agent re-execution.
 * These enqueue a durable job and return immediately with a jobId.
 *
 * Per D-06: agent_instruction_patch and skill_addition trigger the async path.
 * All other proposal types remain on the synchronous apply path.
 */
const BEHAVIORAL_PROPOSAL_TYPES = new Set<string>([
  "agent_instruction_patch",
  "skill_addition",
]);

/**
 * Returns true if the proposal type should use the async behavioral eval path.
 */
export function isBehavioralProposalType(proposalType: string): boolean {
  return BEHAVIORAL_PROPOSAL_TYPES.has(proposalType);
}
