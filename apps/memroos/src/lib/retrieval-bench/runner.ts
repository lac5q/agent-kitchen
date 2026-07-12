/**
 * Comparative retrieval benchmark runner (VAL-RETR-001..013).
 *
 * Public API: `runBenchmark(args)` returns an AggregateReport or a typed
 * error result. The runner:
 *
 *   - Loads the chosen dataset via the appropriate adapter
 *   - Validates fixtures (refuses to score if validation fails)
 *   - Resolves the requested adapter from the registry (or fails closed)
 *   - Runs each task, capturing per-task scores + receipts
 *   - Computes per-lane aggregates (no cross-lane averaging)
 *   - Redacts raw text bodies from the report (VAL-RETR-004)
 *   - Tags the report with reproducible config + fixture + run hashes
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {
  type AdapterId,
  type AdapterResult,
  type AdapterScope,
  type AggregateReport,
  type BenchmarkLane,
  type DatasetId,
  type NormalizedTask,
  type ProviderFlag,
} from "./schema";
import {
  DATASET_TO_LANE,
  PROVIDER_FLAGS,
} from "./schema";
import {
  aggregateTaskScores,
  aggregateByLane,
  hashConfig,
  resolveLane,
  scoreTask,
} from "./metrics";
import { hashFixtures, validateFixtures } from "./validation";
import {
  buildUnavailableResult,
  registerAdapter,
  getAdapter,
  type BenchmarkAdapterInit,
} from "./adapters";
import { lexicalAdapter, lexicalAdapterEntry } from "./adapters/lexical";
import { noMemoryAdapter, noMemoryAdapterEntry } from "./adapters/no-memory";
import { liveAdapter, liveAdapterEntry } from "./adapters/live";
import {
  mem0AdapterEntry,
  qdrantAdapterEntry,
  vectorLocalAdapterEntry,
} from "./adapters/vector";
import { loadSyntheticSmoke } from "./adapters/synthetic";
import { resolveLaneForDataset, verifyLaneAssignments } from "./lanes";
import {
  classifyFailure,
  summarizeFailures,
  validateAdapterResult,
} from "./failure";
import { canonicalOutputPath, redactReport } from "./redaction";

// ============================================================================
// Default registry setup
// ============================================================================

let registryInitialized = false;

function ensureRegistry(): void {
  if (registryInitialized) return;
  registerAdapter(lexicalAdapter.id, lexicalAdapterEntry);
  registerAdapter(noMemoryAdapter.id, noMemoryAdapterEntry);
  registerAdapter(liveAdapter.id, liveAdapterEntry);
  registerAdapter("vector-local", vectorLocalAdapterEntry);
  registerAdapter("mem0", mem0AdapterEntry);
  registerAdapter("qdrant", qdrantAdapterEntry);
  registryInitialized = true;
}

// ============================================================================
// Public types
// ============================================================================

export interface RunBenchmarkArgs {
  dataset: DatasetId;
  adapter: AdapterId;
  limit?: number;
  k?: number;
  seed?: number;
  fixturesDir?: string;
  scope?: AdapterScope;
  rerankEnabled?: boolean;
  judgeEnabled?: boolean;
  providerFlags?: Partial<Record<ProviderFlag, boolean>>;
  retrievalPolicyVersion?: string;
  /** Synthetic-only smoke override: load the smoke fixture. */
  syntheticOnly?: boolean;
}

export type RunBenchmarkResult =
  | {
      ok: true;
      report: AggregateReport;
      failureSummary: ReturnType<typeof summarizeFailures>;
    }
  | {
      ok: false;
      reason: string;
      issues?: Array<{ field: string; reason: string; taskId?: string }>;
    };

// ============================================================================
// Default scope (used when caller does not provide one)
// ============================================================================

function defaultScope(adapter: AdapterId): AdapterScope {
  return {
    tenantId: "default-tenant",
    userId: null,
    agentId: null,
    spaceId: null,
    label: null,
    purpose: "memory_search",
    beliefStage: null,
    maxFreshnessSeconds: null,
  };
}

// ============================================================================
// Dataset loading dispatcher
// ============================================================================

export interface LoadDatasetResult {
  ok: boolean;
  reason?: string;
  tasks?: NormalizedTask[];
  truncated?: boolean;
  totalAvailable?: number;
}

export function loadDataset(args: {
  dataset: DatasetId;
  fixturesDir: string;
  limit?: number;
}): LoadDatasetResult {
  switch (args.dataset) {
    case "memroos_public_synthetic": {
      const r = loadSyntheticSmoke({ fixturesDir: args.fixturesDir, limit: args.limit });
      if (!r.ok) return { ok: false, reason: r.reason };
      return {
        ok: true,
        tasks: r.tasks,
        truncated: r.truncated,
        totalAvailable: r.totalAvailable,
      };
    }
    case "locomo":
      return { ok: false, reason: "locomo_source_not_provided_caller_local_required" };
    case "longmemeval":
      return { ok: false, reason: "longmemeval_source_not_provided_caller_local_required" };
    case "longmemeval_v2":
      return { ok: false, reason: "longmemeval_v2_unavailable_explicit_error" };
    default:
      return { ok: false, reason: "dataset_unsupported:" + args.dataset };
  }
}

// ============================================================================
// Public API
// ============================================================================

export async function runBenchmark(args: RunBenchmarkArgs): Promise<RunBenchmarkResult> {
  ensureRegistry();

  // 1) Verify lane assignments at startup so configuration drift is detected.
  const laneCheck = verifyLaneAssignments();
  if (!laneCheck.ok) {
    return { ok: false, reason: "lane_assignment_invalid", issues: laneCheck.mismatches.map((m) => ({ field: "lanes", reason: m })) };
  }

  // 2) Resolve the lane for the requested dataset.
  const laneMembership = resolveLaneForDataset(args.dataset);
  if (!laneMembership.ok || !laneMembership.lane) {
    return { ok: false, reason: laneMembership.reason ?? "lane_membership_unknown" };
  }
  const lane: BenchmarkLane = laneMembership.lane;

  // 3) Load + validate the dataset.
  const fixturesDir = args.fixturesDir ?? path.join(process.cwd(), "evals", "comparative-retrieval", "fixtures");
  const loaded = loadDataset({
    dataset: args.dataset,
    fixturesDir,
    limit: args.limit,
  });
  if (!loaded.ok || !loaded.tasks) {
    return { ok: false, reason: loaded.reason ?? "dataset_load_failed" };
  }
  const validation = validateFixtures(loaded.tasks);
  if (!validation.ok) {
    return {
      ok: false,
      reason: "fixture_validation_failed",
      issues: validation.issues,
    };
  }
  const tasks = loaded.tasks;

  // 4) Resolve adapter from registry.
  const adapterEntry = getAdapter(args.adapter);
  if (!adapterEntry) {
    return {
      ok: false,
      reason: "adapter_not_registered:" + args.adapter,
    };
  }
  const adapterImpl = adapterEntry.adapter;

  // 5) Build config and fixture hashes (VAL-RETR-013).
  const providerFlags: Record<string, boolean> = {};
  for (const f of PROVIDER_FLAGS) {
    providerFlags[f] = args.providerFlags?.[f] ?? false;
  }
  const configHash = hashConfig({
    dataset: args.dataset,
    adapter: args.adapter,
    k: args.k ?? 3,
    rerankEnabled: args.rerankEnabled ?? false,
    judgeEnabled: args.judgeEnabled ?? false,
    providerFlags,
    seed: args.seed ?? 0,
  });
  const fixtureHash = hashFixtures(tasks);
  const retrievalPolicyVersion = args.retrievalPolicyVersion ?? "retrieval-v1";
  const scope = args.scope ?? defaultScope(args.adapter);

  // 6) Run each task through the adapter.
  const results: AdapterResult[] = [];
  for (const task of tasks) {
    const init: BenchmarkAdapterInit = {
      task,
      scope,
      k: args.k ?? 3,
      seed: args.seed ?? 0,
      rerankEnabled: args.rerankEnabled ?? false,
      judgeEnabled: args.judgeEnabled ?? false,
      configHash,
      fixtureHash,
      retrievalPolicyVersion,
    };
    let result: AdapterResult;
    try {
      result = await adapterImpl.run(init);
    } catch (err) {
      const classification = classifyFailure(err);
      result = buildUnavailableResult({
        task,
        adapterName: args.adapter,
        status: classification.status,
        statusDetail: classification.detail,
        retrievalPolicyVersion,
        configHash,
        fixtureHash,
        latencyMs: 0,
        provider: adapterEntry.provider,
        providerVersion: adapterEntry.providerVersion,
      });
    }
    const validation = validateAdapterResult(result);
    if (!validation.ok) {
      result = buildUnavailableResult({
        task,
        adapterName: args.adapter,
        status: "provider_failed",
        statusDetail: "invalid_adapter_result:" + validation.reasons.join(","),
        retrievalPolicyVersion,
        configHash,
        fixtureHash,
        latencyMs: result.latencyMs,
        provider: adapterEntry.provider,
        providerVersion: adapterEntry.providerVersion,
      });
    }
    results.push(result);
  }

  // 7) Score each task and aggregate.
  const scores = tasks.map((task, i) => {
    const r = results[i];
    return scoreTask({
      task,
      result: r,
      k: args.k ?? 3,
      lane: resolveLane(task),
    });
  });
  const aggregate = aggregateTaskScores(scores);
  aggregate.laneMetrics = aggregateByLane(scores);

  // 8) Build the report.
  const runId = "bench-" + crypto.randomUUID();
  const report: AggregateReport = {
    runId,
    runDate: new Date().toISOString(),
    dataset: args.dataset,
    adapter: args.adapter,
    lane,
    configHash,
    fixtureHash,
    seed: args.seed ?? 0,
    k: args.k ?? 3,
    rerankEnabled: args.rerankEnabled ?? false,
    judgeEnabled: args.judgeEnabled ?? false,
    providerFlags,
    aggregate,
    taskCount: scores.length,
    tasks: scores,
  };

  const failureSummary = summarizeFailures(results);
  return {
    ok: true,
    report: redactReport(report) as AggregateReport,
    failureSummary,
  };
}

// ============================================================================
// File output helpers
// ============================================================================

export function writeReport(args: {
  report: AggregateReport;
  outputDir: string;
  extension?: "json" | "md";
}): { path: string } {
  const ext = args.extension ?? "json";
  const filePath = canonicalOutputPath({
    resultsDir: args.outputDir,
    dataset: args.report.dataset,
    adapter: args.report.adapter,
    lane: args.report.lane,
    extension: ext,
  });
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  if (ext === "json") {
    fs.writeFileSync(filePath, JSON.stringify(args.report, null, 2));
  } else {
    fs.writeFileSync(filePath, renderTextReport(args.report));
  }
  return { path: filePath };
}

export function renderTextReport(report: AggregateReport): string {
  const a = report.aggregate;
  const lines: string[] = [];
  lines.push("# MemroOS Comparative Retrieval Benchmark");
  lines.push("");
  lines.push(`Run ID:        ${report.runId}`);
  lines.push(`Run date:      ${report.runDate}`);
  lines.push(`Dataset:       ${report.dataset}`);
  lines.push(`Adapter:       ${report.adapter}`);
  lines.push(`Lane:          ${report.lane}`);
  lines.push(`k:             ${report.k}`);
  lines.push(`Rerank:        ${report.rerankEnabled}`);
  lines.push(`Judge:         ${report.judgeEnabled}`);
  lines.push(`Seed:          ${report.seed}`);
  lines.push(`Config hash:   ${report.configHash}`);
  lines.push(`Fixture hash:  ${report.fixtureHash}`);
  lines.push("");
  lines.push("## Aggregate Scores");
  lines.push("");
  lines.push(`task_count:                ${a.taskCount}`);
  lines.push(`completed_task_count:      ${a.completedTaskCount}`);
  lines.push(`failed_task_count:         ${a.failedTaskCount}`);
  lines.push(`precision@k:               ${a.precisionAtK}`);
  lines.push(`recall@k:                  ${a.recallAtK}`);
  lines.push(`MRR:                       ${a.mrr}`);
  lines.push(`false_positive_rate:       ${a.falsePositiveRate}`);
  lines.push(`answer_support_rate:       ${a.answerSupportedRate}`);
  lines.push(`p95_latency_ms:            ${a.p95LatencyMs}`);
  if (a.abstentionAccuracy !== null) {
    lines.push(`abstention_accuracy:       ${a.abstentionAccuracy} (labeled=${a.abstentionLabeledCount})`);
  }
  if (a.abstentionAnswerableFailureCount !== null) {
    lines.push(`answerable_failure_count:  ${a.abstentionAnswerableFailureCount}`);
  }
  if (a.contextPackBytes !== null) {
    lines.push(`context_pack_bytes:        ${a.contextPackBytes}`);
  }
  if (a.contextPackHash !== null) {
    lines.push(`context_pack_hash:         ${a.contextPackHash}`);
  }
  if (a.tokensRetrieval !== null) lines.push(`tokens_retrieval:          ${a.tokensRetrieval}`);
  if (a.tokensRerank !== null) lines.push(`tokens_rerank:             ${a.tokensRerank}`);
  if (a.tokensPack !== null) lines.push(`tokens_pack:               ${a.tokensPack}`);
  if (a.tokensJudge !== null) lines.push(`tokens_judge:              ${a.tokensJudge}`);
  lines.push("");
  if (Object.keys(a.laneMetrics).length > 0) {
    lines.push("## Per-Lane Aggregates");
    lines.push("");
    for (const [laneName, laneAgg] of Object.entries(a.laneMetrics)) {
      if (!laneAgg) continue;
      lines.push(`### ${laneName}`);
      lines.push(`  task_count:           ${laneAgg.taskCount}`);
      lines.push(`  precision@k:          ${laneAgg.precisionAtK}`);
      lines.push(`  recall@k:             ${laneAgg.recallAtK}`);
      lines.push(`  MRR:                  ${laneAgg.mrr}`);
      lines.push(`  false_positive_rate:  ${laneAgg.falsePositiveRate}`);
      lines.push(`  p95_latency_ms:       ${laneAgg.p95LatencyMs}`);
      lines.push("");
    }
  }
  return lines.join("\n");
}
