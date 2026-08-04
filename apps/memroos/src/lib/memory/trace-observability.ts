import crypto from "crypto";
import { recordEfficiencyEvent, type RetrievalTracePayload } from "@/lib/efficiency-telemetry";
import type { getDb } from "@/lib/db";
import type { MemoryRecallTier, MemoryRecallTiming } from "@/lib/memory/recall-evals";
import type {
  BeliefStage,
  IgnoredRecollectionCandidate,
  RecollectionDecisionKind,
  RecollectionReason,
  RecollectionReliance,
} from "@/lib/memory/recollection";
import {
  memoryTraceGovernance,
  readMemoryTrace,
  writeMemoryTrace,
} from "@/lib/store/memory";

type SqliteDatabase = ReturnType<typeof getDb>;

export type FailureClassification =
  | "retrieval_miss"
  | "bad_ranking"
  | "stale_memory"
  | "corrupted_memory"
  | "policy_redaction"
  | "consolidation_error"
  | "benchmark_error"
  | "model_misuse";

export interface RecollectionTraceReceipt {
  decision: RecollectionDecisionKind;
  timing: MemoryRecallTiming;
  reasons: RecollectionReason[];
  skipReason: string | null;
  injected: Array<{
    id: string;
    tier: MemoryRecallTier;
    beliefStage: BeliefStage;
    reliance: RecollectionReliance;
    score: number;
    /** ONTO-06: typed ontology coordinates when known. */
    ontologyType?: string;
    aboutType?: string;
  }>;
  ignored: Array<{
    id: string;
    reason: IgnoredRecollectionCandidate["reason"];
    score: number;
  }>;
  /** Pointer-only probe receipts; never include candidate text or payloads. */
  tiersSearched?: string[];
  tierStatuses?: Record<string, {
    status: "ok" | "empty" | "degraded" | "unavailable" | "blocked";
    count?: number;
  }>;
  truncated?: boolean;
  reasonCode?: string;
  ontology?: {
    ontologyId: string;
    ontologyVersion: string;
    ontologyContentHash: string;
    namespace: string;
    canonicalId: string;
    aliasMigrationPath: unknown[];
    ontologyType?: string;
    aboutType?: string;
    beliefStage?: string;
  };
}

export interface MemoryTraceInput {
  tenantId?: string;
  taskId?: string | null;
  agentId?: string | null;
  runId: string;
  causalPath: {
    contextAssembly: string;
    retrievalQuery: string;
    retrievedCandidates: Array<{ id: string; content: string; score: number }>;
    policyFilters: Array<{ id: string; decision: "allow" | "deny" | "redact"; reason: string }>;
    consolidationSteps?: string[];
    checkpointRefs?: string[];
    retrievalTokensUsed?: number;
    timingGate?: "before_plan" | "before_tool" | "before_final";
    promptInclusion: boolean;
    answerCitation?: string;
    verificationResult?: string;
    recollection?: RecollectionTraceReceipt;
  };
  failureClassification?: FailureClassification | null;
  rootCause?: string | null;
  replayHandle?: string | null;
  proposedRepair?: string | null;
}

export interface MemoryTrace {
  id: string;
  tenantId: string;
  taskId: string | null;
  agentId: string | null;
  runId: string;
  causalPath: MemoryTraceInput["causalPath"];
  failureClassification: FailureClassification | null;
  rootCause: string | null;
  replayHandle: string | null;
  proposedRepair: string | null;
  createdAt: string;
}

function stableJson(value: unknown): string {
  return JSON.stringify(value);
}

function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

function emptyBeliefStageCounts(): Record<BeliefStage, number> {
  return {
    bronze_raw_source: 0,
    silver_candidate_claim: 0,
    gold_operational_truth: 0,
  };
}

function beliefStageCounts(receipt: RecollectionTraceReceipt | undefined): Record<BeliefStage, number> {
  const counts = emptyBeliefStageCounts();
  for (const item of receipt?.injected ?? []) {
    counts[item.beliefStage] += 1;
  }
  return counts;
}

function recollectionPayload(receipt: RecollectionTraceReceipt | undefined): Partial<RetrievalTracePayload> {
  if (!receipt) return {};

  return {
    recollectionDecision: receipt.decision,
    recollectionReasons: receipt.reasons,
    recollectionSkipReason: receipt.skipReason,
    recollectionInjected: receipt.injected.map((item) => ({
      id: item.id,
      tier: item.tier,
      beliefStage: item.beliefStage,
      reliance: item.reliance,
      score: item.score,
    })),
    recollectionIgnored: receipt.ignored.map((item) => ({
      id: item.id,
      reason: item.reason,
      score: item.score,
    })),
    beliefStageCounts: beliefStageCounts(receipt),
    recollectionTiming: receipt.timing,
    recollectionTiersSearched: receipt.tiersSearched,
    recollectionTierStatuses: receipt.tierStatuses,
    recollectionTruncated: receipt.truncated,
    recollectionReasonCode: receipt.reasonCode,
    recollectionReceipt: {
      decision: receipt.decision,
      timing: receipt.timing,
      reasons: receipt.reasons,
      skipReason: receipt.skipReason,
      injected: receipt.injected,
      ignored: receipt.ignored,
      tiersSearched: receipt.tiersSearched,
      tierStatuses: receipt.tierStatuses,
      truncated: receipt.truncated,
      reasonCode: receipt.reasonCode,
    },
    ontology: receipt.ontology,
  };
}

export function recordMemoryTrace(
  db: SqliteDatabase,
  input: MemoryTraceInput
): MemoryTrace {
  if (!input.runId?.trim()) throw new Error("runId is required");
  if (!input.causalPath) throw new Error("causalPath is required");

  const id = crypto.randomUUID();
  const tenantId = input.tenantId ?? "default-tenant";
  const taskId = input.taskId ?? null;
  const agentId = input.agentId ?? null;
  const causalPathJson = stableJson(input.causalPath);
  const failureClassification = input.failureClassification ?? null;
  const rootCause = input.rootCause ?? null;
  const replayHandle = input.replayHandle ?? null;
  const proposedRepair = input.proposedRepair ?? null;
  const createdAt = nowIso();

  writeMemoryTrace(
    db,
    {
      id,
      tenantId,
      taskId,
      agentId,
      runId: input.runId,
      causalPathJson,
      failureClassification,
      rootCause,
      replayHandle,
      proposedRepair,
      createdAt,
    },
    memoryTraceGovernance({ runId: input.runId, agentId }),
  );

  const retrievalTracePayload: RetrievalTracePayload = {
    query: input.causalPath.retrievalQuery,
    sources: input.causalPath.retrievedCandidates.map((candidate) => candidate.id),
    tokensUsed: input.causalPath.retrievalTokensUsed ?? 0,
    usedInFirstResponse: input.causalPath.promptInclusion && input.causalPath.retrievedCandidates.length > 0,
    timingGate: input.causalPath.timingGate ?? "before_plan",
    ...recollectionPayload(input.causalPath.recollection),
  };

  recordEfficiencyEvent(db, {
    tenantId,
    taskId,
    agentId,
    eventType: "retrieval_trace",
    payload: retrievalTracePayload,
    createdAt,
  });

  return {
    id,
    tenantId,
    taskId,
    agentId,
    runId: input.runId,
    causalPath: input.causalPath,
    failureClassification,
    rootCause,
    replayHandle,
    proposedRepair,
    createdAt,
  };
}

export function getMemoryTrace(
  db: SqliteDatabase,
  tenantId: string,
  runId: string
): MemoryTrace | null {
  const row = readMemoryTrace(db, tenantId, runId);

  if (!row) return null;

  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    taskId: row.task_id ? String(row.task_id) : null,
    agentId: row.agent_id ? String(row.agent_id) : null,
    runId: String(row.run_id),
    causalPath: JSON.parse(String(row.causal_path_json)),
    failureClassification: row.failure_classification ? (String(row.failure_classification) as FailureClassification) : null,
    rootCause: row.root_cause ? String(row.root_cause) : null,
    replayHandle: row.replay_handle ? String(row.replay_handle) : null,
    proposedRepair: row.proposed_repair ? String(row.proposed_repair) : null,
    createdAt: String(row.created_at),
  };
}

export function getMemoryTraceTimeline(trace: MemoryTrace): string[] {
  const path = trace.causalPath;
  const timeline: string[] = [];

  timeline.push(`[Context Assembly] ${path.contextAssembly}`);
  if (path.recollection) {
    const reasons = path.recollection.reasons.length > 0 ? path.recollection.reasons.join(", ") : "no_reasons";
    timeline.push(`[Recollection Decision] ${path.recollection.decision.toUpperCase()} ${path.recollection.timing} (${reasons})`);
    if (path.recollection.skipReason) {
      timeline.push(`[Recollection Skip] ${path.recollection.skipReason}`);
    }
  }
  timeline.push(`[Retrieval Query] "${path.retrievalQuery}"`);
  timeline.push(`[Retrieved Candidates] Fetched ${path.retrievedCandidates.length} potential memories.`);

  for (const filter of path.policyFilters) {
    timeline.push(`[Policy Decision] Memory ${filter.id}: ${filter.decision.toUpperCase()} (${filter.reason})`);
  }

  if (path.consolidationSteps && path.consolidationSteps.length > 0) {
    for (const step of path.consolidationSteps) {
      timeline.push(`[Consolidation] ${step}`);
    }
  }

  if (path.checkpointRefs && path.checkpointRefs.length > 0) {
    timeline.push(`[Checkpoints] References rehydrated: ${path.checkpointRefs.join(", ")}`);
  }

  timeline.push(`[Prompt Inclusion] Context was ${path.promptInclusion ? "successfully inlined" : "excluded"} in prompt.`);

  if (path.answerCitation) {
    timeline.push(`[Answer Citation] Inlined citation: "${path.answerCitation}"`);
  }

  if (path.verificationResult) {
    timeline.push(`[Verification] ${path.verificationResult}`);
  }

  return timeline;
}
