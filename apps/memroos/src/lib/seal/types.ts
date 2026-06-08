import type { EvalLayerBreakdown, EvalRunResult } from "@/lib/evals/types";
import type { ProposalType } from "./proposal-types";

export type ProposalStatus = "pending" | "approved" | "rejected" | "applied" | "rolled_back";
export type ProposalDecisionAction = "approved" | "rejected" | "applied" | "rolled_back";
export type ProposalCommandAction = "approve" | "reject" | "apply";
type SealAuditEvent =
  | "proposed"
  | "approved"
  | "rejected"
  | "apply_started"
  | "apply_succeeded"
  | "apply_failed"
  | "rolled_back";

export interface ProposalDraft {
  traceId: string;
  runId: string;
  agentId: string;
  proposalType: ProposalType;
  diff: Record<string, unknown>;
  rationale: string;
  forecastWDelta: number;
  baselineW: number;
  baselineRunId: string;
  baselineLayers: EvalRunResult["layers"];
}

export interface SealProposal extends ProposalDraft {
  id: string;
  status: ProposalStatus;
  createdAt: string;
  updatedAt: string;
  /** ID of the latest behavioral eval job for this proposal, if any. */
  latestJobId?: string | null;
  /** Status of the latest behavioral eval job, if any. */
  latestJobStatus?: import("./behavioral-jobs").EvalJobStatus | null;
}

export interface SealDecision {
  id: string;
  proposalId: string;
  action: ProposalDecisionAction;
  operator: string;
  reasoning?: string | null;
  decidedAt: string;
}

export interface SealAuditEntry {
  id?: string;
  proposalId: string;
  event: SealAuditEvent;
  baselineW?: number | null;
  postApplyW?: number | null;
  deltaL1?: number | null;
  deltaL2?: number | null;
  deltaL3?: number | null;
  deltaComposite?: number | null;
  detail?: Record<string, unknown>;
  timestamp?: string;
}

export interface StoredSealAuditEntry extends Required<Omit<SealAuditEntry, "detail">> {
  detail: Record<string, unknown>;
}

export interface AuditFilter {
  proposalId?: string;
  limit?: number;
}

/**
 * Synchronous apply result — returned for legacy/non-behavioral proposal types
 * (memory_rewrite, query_hint, salience_update, tier_route, noop_test, etc.)
 */
export interface SyncApplyResult {
  kind: "sync";
  proposalId: string;
  kept: boolean;
  baselineW: number;
  postApplyW: number | null;
  deltaComposite: number | null;
  status: ProposalStatus;
  evalRunId?: string;
  error?: string;
}

/**
 * Async job apply result — returned for behavioral proposal types
 * (agent_instruction_patch, skill_addition) that require true agent re-execution.
 * The caller should poll GET /api/seal/jobs/:jobId for job status.
 */
export interface JobApplyResult {
  kind: "job";
  proposalId: string;
  jobId: string;
  status: "queued";
}

/**
 * Discriminated union of apply result variants.
 * Use `result.kind` to distinguish sync from async job results.
 */
export type ApplyResult = SyncApplyResult | JobApplyResult;

export interface WLayerDelta {
  l1: number;
  l2: number;
  l3: number;
  composite: number;
}

export function layerScore(layers: EvalRunResult["layers"], layer: keyof EvalRunResult["layers"]): number {
  return (layers[layer] as EvalLayerBreakdown).score;
}
