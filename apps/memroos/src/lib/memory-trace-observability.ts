import crypto from "crypto";
import type Database from "better-sqlite3";

export type FailureClassification =
  | "retrieval_miss"
  | "bad_ranking"
  | "stale_memory"
  | "corrupted_memory"
  | "policy_redaction"
  | "consolidation_error"
  | "benchmark_error"
  | "model_misuse";

export interface MemoryTraceInput {
  tenantId?: string;
  taskId?: string | null;
  runId: string;
  causalPath: {
    contextAssembly: string;
    retrievalQuery: string;
    retrievedCandidates: Array<{ id: string; content: string; score: number }>;
    policyFilters: Array<{ id: string; decision: "allow" | "deny" | "redact"; reason: string }>;
    consolidationSteps?: string[];
    checkpointRefs?: string[];
    promptInclusion: boolean;
    answerCitation?: string;
    verificationResult?: string;
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
  return new Date().toISOString();
}

export function recordMemoryTrace(
  db: Database.Database,
  input: MemoryTraceInput
): MemoryTrace {
  if (!input.runId?.trim()) throw new Error("runId is required");
  if (!input.causalPath) throw new Error("causalPath is required");

  const id = crypto.randomUUID();
  const tenantId = input.tenantId ?? "default-tenant";
  const taskId = input.taskId ?? null;
  const causalPathJson = stableJson(input.causalPath);
  const failureClassification = input.failureClassification ?? null;
  const rootCause = input.rootCause ?? null;
  const replayHandle = input.replayHandle ?? null;
  const proposedRepair = input.proposedRepair ?? null;
  const createdAt = nowIso();

  db.prepare(
    `INSERT INTO agent_memory_traces (
       id, tenant_id, task_id, run_id, causal_path_json,
       failure_classification, root_cause, replay_handle, proposed_repair, created_at
     ) VALUES (
       ?, ?, ?, ?, ?,
       ?, ?, ?, ?, ?
     )`
  ).run(
    id,
    tenantId,
    taskId,
    input.runId,
    causalPathJson,
    failureClassification,
    rootCause,
    replayHandle,
    proposedRepair,
    createdAt
  );

  return {
    id,
    tenantId,
    taskId,
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
  db: Database.Database,
  tenantId: string,
  runId: string
): MemoryTrace | null {
  const row = db
    .prepare(
      `SELECT * FROM agent_memory_traces
       WHERE tenant_id = ? AND run_id = ?
       ORDER BY created_at DESC LIMIT 1`
    )
    .get(tenantId, runId) as Record<string, unknown> | undefined;

  if (!row) return null;

  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    taskId: row.task_id ? String(row.task_id) : null,
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
