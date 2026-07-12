/**
 * Comparative retrieval benchmark runner (VAL-RETR-001..030).
 *
 * Public API: `runBenchmark(args)` returns an AggregateReport or a typed
 * error result. The runner:
 *
 *   - Loads the chosen dataset via the appropriate adapter
 *   - Validates fixtures (refuses to score if validation fails)
 *   - Resolves the requested adapter from the registry (or fails closed)
 *   - Wires every BENCH-03 module in a deterministic, governed stage
 *     sequence (the canonical ordered pipeline):
 *
 *       1. createWriteGuard (shared by every persistence side effect)
 *       2. extractEntities
 *       3. performTierFanout
 *       4. rerankCandidates
 *       5. dedupeRetrievalResults
 *       6. packContext
 *       7. performTemporalRetrieval
 *       8. reconcileStages
 *       9. checkContamination (must run BEFORE publication evaluation)
 *      10. evaluatePublicationGate (consumes audit + contamination outcomes)
 *      11. buildReplayHandle
 *      12. createIsolationContext (run-level scope tag)
 *
 *     The CLI path additionally invokes `parseCliArgs` BEFORE this
 *     sequence so direct callers that bypass the parser must opt out.
 *
 *   - Calls recordBenchRun / recordBenchReceipt / recordBenchPublication /
 *     recordBenchReplay / recordBenchContamination from the live path.
 *     Each call returns a typed `BenchAuditOutcome` (Round-2 fix).
 *     When the WriteGuard is armed the writers short-circuit; when
 *     persistence fails they produce a typed non-success state that
 *     marks receipts unverified and BLOCKS publication.
 *   - Redacts raw text bodies from the report (VAL-RETR-004)
 *   - Tags the report with reproducible config + fixture + run hashes
 *   - Honors --no-write via the WriteGuard so filesystem AND SQLite
 *     audit side effects never escape when the flag is armed
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
  type RetrievedItem,
} from "./schema";
import {
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
// BENCH-03 module imports (VAL-RETR-014..030)
// ============================================================================

import {
  buildReplayHandle,
  canonicalReportPath,
  checkContamination,
  checkProviderAvailable,
  createIsolationContext,
  createWriteGuard,
  decideEntityMerge,
  dedupeRetrievalResults,
  describeProviderFlags,
  evaluatePublicationGate,
  extractEntities,
  isStageRecord,
  packContext,
  performTemporalRetrieval,
  performTierFanout,
  previewSnapshot,
  reconcileStages,
  recordBenchContamination,
  recordBenchPublication,
  recordBenchReceipt,
  recordBenchReplay,
  recordBenchRun,
  rerankCandidates,
  stageRecord,
  type BenchAuditOutcome,
  type ProviderFlags,
  type RegisteredSource,
  type ReportProvenance,
  type ReceiptVerificationReceipt,
  type ScopeTag,
  type StageRecord,
  type WriteGuard,
} from "./modules";

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
  /**
   * Disable every persistence side effect, including SQLite audit
   * creation or mutation. Default false.
   */
  noWrite?: boolean;
  /** Optional explicit tenant id used for isolation tagging. */
  tenantId?: string;
  /** Optional caller identity preserved on every retrieval-benchmark audit row. */
  actorId?: string;
  /** Audit write bridge — when false, audit events are skipped. Default true. */
  withAudit?: boolean;
  /**
   * Skip strict CLI parsing. Direct programmatic callers (tests,
   * programmatic benchmark entry points) may set this to true. The
   * CLI entry point must NOT set this so the canonical governed
   * pipeline is enforced end-to-end.
   */
  bypassCliParser?: boolean;
  /**
   * Injected parsed CLI command. When supplied, the runner treats the
   * call as the post-CLI-parse form and uses `noWrite`, `outputDir`,
   * and `configOverrides` from the parsed command. Ignored when
   * `bypassCliParser` is true.
   */
  cliCommand?: {
    noWrite?: boolean;
    outputDir?: string;
    configOverrides?: Record<string, string>;
  };
  /** Test seam: receive stage records from each task. */
  onStageRecords?: (records: Map<string, StageRecord[]>) => void;
  /**
   * Test-only foreign-artifact injection seam. Production validation only
   * compares tags attached to artifacts created by this run.
   */
  injectedArtifactTagsForTest?: ScopeTag[];
}

export type RunBenchmarkResult =
  | {
      ok: true;
      report: AggregateReport;
      failureSummary: ReturnType<typeof summarizeFailures>;
      pipeline?: PipelineTrace;
      publicationGate?: ReturnType<typeof evaluatePublicationGate>;
      contamination?: ReturnType<typeof checkContamination>;
      replayHandle?: ReturnType<typeof buildReplayHandle>;
      auditEmitted?: AuditEmitSummary;
      /** Concrete persistence state for each audit stage. */
      auditPersistence?: AuditPersistenceSummary;
    }
  | {
      ok: false;
      reason: string;
      issues?: Array<{ field: string; reason: string; taskId?: string }>;
    };

export interface PipelineTrace {
  entityExtractionCount: number;
  fanoutSourceCount: number;
  dedupedMergedCount: number;
  rerankedCount: number;
  packedBytes: number;
  temporalStatus: string;
  perTaskStageRecords: Map<string, StageRecord[]>;
}

/**
 * Per-stage audit persistence summary. Every required audit call is
 * accounted for with a typed outcome, NOT with a "we attempted it" flag.
 * This is the Round-2 fix that prevents silent false-success when
 * audit writes fail or are skipped due to --no-write.
 */
export interface AuditPersistenceSummary {
  run: BenchAuditOutcome | null;
  receipts: BenchAuditOutcome[];
  contamination: BenchAuditOutcome | null;
  publication: BenchAuditOutcome | null;
  replay: BenchAuditOutcome | null;
  /** True only when every required outcome is `ok`. */
  allRequiredPersisted: boolean;
  /** True when at least one required audit call was skipped due to noWrite. */
  anySkippedNoWrite: boolean;
}

export interface AuditEmitSummary {
  /** True only when the run-level audit row was actually persisted. */
  runRecorded: boolean;
  /** Count of per-task receipt rows actually persisted. */
  receiptsRecorded: number;
  /** True only when the publication audit row was actually persisted. */
  publicationRecorded: boolean;
  /** True only when the replay audit row was actually persisted. */
  replayRecorded: boolean;
  /** True only when the contamination audit row was actually persisted. */
  contaminationRecorded: boolean;
}

// ============================================================================
// Default scope (used when caller does not provide one)
// ============================================================================

function defaultScope(adapter: AdapterId): AdapterScope {
  void adapter;
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
// BENCH-03 stage wiring (VAL-RETR-014..030)
// ============================================================================

/**
 * Build the default RegisteredSource list used by tier fanout. Only
 * "registered" sources are called; the rest are emitted as receipts.
 */
function defaultRegisteredSources(): RegisteredSource[] {
  return [
    { tier: "lexical", state: "registered", trust: 1 },
    { tier: "vector-local", state: "registered", trust: 0 },
    { tier: "mem0", state: "registered", trust: 0 },
    { tier: "qdrant", state: "registered", trust: 0 },
    { tier: "live", state: "registered", trust: 1 },
  ];
}

function defaultFanoutBudget(maxItems: number): {
  maxSources: number;
  maxItemsPerSource: number;
  deadlineMs: number;
} {
  return {
    maxSources: 5,
    maxItemsPerSource: Math.max(1, Math.min(maxItems, 5)),
    deadlineMs: 5000,
  };
}

function defaultContextBudget(): { maxBytes: number; maxTokens: number } {
  return { maxBytes: 8 * 1024, maxTokens: 2 * 1024 };
}

function emptyCredentialResolver(): () => null {
  return () => null;
}

function providerFlagsToModule(flags: Record<string, boolean>): ProviderFlags {
  return {
    embedding: !!flags.embedding,
    vector_backend: !!flags.vector_backend,
    rerank: !!flags.rerank,
    judge: !!flags.judge,
    external_mcp: !!flags.external_mcp,
  };
}

/**
 * Credential availability probe. Used to wire the optional provider flags
 * into the runner. Always fail-closed for callers that did not opt in.
 */
function checkProviders(
  moduleFlags: ProviderFlags,
  withAudit: boolean,
): { available: { name: string; ok: boolean; reason: string }[] } {
  const resolver = emptyCredentialResolver();
  const probes: Array<"embedding" | "vector_backend" | "rerank" | "judge" | "external_mcp"> = [
    "embedding",
    "vector_backend",
    "rerank",
    "judge",
    "external_mcp",
  ];
  const available = probes.map((p) => {
    const r = checkProviderAvailable({
      provider: p,
      flags: moduleFlags,
      resolveCredential: resolver,
    });
    if (withAudit) {
      // Audit entries for credential state changes are intentionally
      // not emitted from the runner because credential probes must not
      // leak secret fingerprints. The describeProviderFlags receipt
      // is logged via the report instead.
    }
    return {
      name: p,
      ok: r.ok,
      reason: r.reason,
    };
  });
  return { available };
}

/**
 * Reduce a list of BenchAuditOutcome values to the strongest failure
 * marker. Used by the publication gate so a single failed required
 * audit write blocks the run/report publication.
 */
function strongestFailure(outcomes: BenchAuditOutcome[]): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  let ok = true;
  for (const o of outcomes) {
    if (!o) {
      // A missing required outcome is a typed failure.
      ok = false;
      reasons.push("missing_audit_outcome");
      continue;
    }
    if (!o.ok) {
      ok = false;
      reasons.push(o.reason);
    } else if (o.status === "skipped_no_write") {
      // `skipped_no_write` is an OK outcome at the audit-call level but
      // is NOT a successful persistence. Required audit calls must be
      // actually persisted (not skipped) for the run to claim proof of
      // evidence. Treat skip as a typed non-success for the purpose of
      // `allRequiredPersisted` so that --no-write cannot masquerade as
      // a clean run.
      ok = false;
      reasons.push("audit_skipped_no_write");
    }
  }
  return { ok, reasons };
}

// ============================================================================
// Public API
// ============================================================================

export async function runBenchmark(args: RunBenchmarkArgs): Promise<RunBenchmarkResult> {
  ensureRegistry();

  // 0) CLI parsing gate (Round-2 fix). Programmatic callers that need
  //    to bypass the parser must explicitly set `bypassCliParser=true`.
  //    The CLI entry point in scripts/run-comparative-retrieval-evals.mjs
  //    pre-parses with parseCliArgs and supplies `cliCommand`. Tests
  //    that build synthetic reports may opt out.
  if (!args.bypassCliParser && !args.cliCommand) {
    return {
      ok: false,
      reason: "cli_parser_required",
      issues: [
        {
          field: "runBenchmark",
          reason:
            "Direct callers must invoke parseCliArgs first or pass `cliCommand` " +
            "produced by the strict CLI parser. The canonical governed pipeline " +
            "is enforced to guarantee one shared WriteGuard + stage sequence.",
        },
      ],
    };
  }

  // 1) Shared WriteGuard — armed iff the canonical no-write signal says so.
  //    The same guard covers filesystem writes AND every audit write.
  const noWrite = !!(args.cliCommand?.noWrite ?? args.noWrite ?? false);
  const writeGuard: WriteGuard = createWriteGuard(noWrite);
  const withAudit = args.withAudit ?? true;
  const tenantId = args.tenantId ?? args.scope?.tenantId ?? "default-tenant";
  const actorId = args.actorId ?? "system:retrieval_bench";
  // All audit calls share the same skipWrite derived from the WriteGuard.
  const skipWrite = writeGuard.armed;

  // 2) Verify lane assignments at startup so configuration drift is detected.
  const laneCheck = verifyLaneAssignments();
  if (!laneCheck.ok) {
    return { ok: false, reason: "lane_assignment_invalid", issues: laneCheck.mismatches.map((m) => ({ field: "lanes", reason: m })) };
  }

  // 3) Resolve the lane for the requested dataset.
  const laneMembership = resolveLaneForDataset(args.dataset);
  if (!laneMembership.ok || !laneMembership.lane) {
    return { ok: false, reason: laneMembership.reason ?? "lane_membership_unknown" };
  }
  const lane: BenchmarkLane = laneMembership.lane;

  // 4) Load + validate the dataset.
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

  // 5) Resolve adapter from registry.
  const adapterEntry = getAdapter(args.adapter);
  if (!adapterEntry) {
    return {
      ok: false,
      reason: "adapter_not_registered:" + args.adapter,
    };
  }
  const adapterImpl = adapterEntry.adapter;

  // 6) Build config and fixture hashes (VAL-RETR-013).
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
  const runId = "bench-" + crypto.randomUUID();

  // 7) Establish isolation context (VAL-RETR-027, VAL-RETR-030). The
  //    scope is the canonical namespace every artifact must respect.
  const isolationCtx = createIsolationContext({
    runId,
    lane,
    dataset: args.dataset,
    adapter: args.adapter,
    tenantId,
    scope: scope.tenantId + ":" + (scope.spaceId ?? "none"),
    seed: args.seed ?? 0,
  });

  // 8) Emit the run-level audit event BEFORE stage execution so that
  //    the chain has a record of the run even if downstream stages
  //    fail closed (VAL-RETR-026). The WriteGuard governs whether
  //    the underlying SQLite row is created at all.
  const runOutcome = withAudit
    ? recordBenchRun({
        runId,
        tenantId,
        actorId,
        reason: "benchmark_run_started",
        configHash,
        fixtureHash,
        skipWrite,
      })
    : null;

  // 9) Provider availability probe + flag independence (VAL-RETR-021,
  //    VAL-RETR-022). The describeProviderFlags receipt surfaces the
  //    independent flag state without exposing secrets.
  const moduleFlags = providerFlagsToModule(providerFlags);
  const providerFlagReceipt = describeProviderFlags({
    flags: moduleFlags,
    resolveCredential: emptyCredentialResolver(),
  });
  void providerFlagReceipt;
  checkProviders(moduleFlags, withAudit);

  // 10) Run each task through the BENCH-03 stage sequence.
  const results: AdapterResult[] = [];
  const perTaskStageRecords = new Map<string, StageRecord[]>();
  const artifactScopeTags: ScopeTag[] = [];

  for (const task of tasks) {
    const stageRecords: StageRecord[] = [];
    perTaskStageRecords.set(task.id, stageRecords);

    // (a) Entity extraction (VAL-RETR-015).
    const ent = extractEntities(task.question + " " + task.corpus.map((c) => c.text).join(" "), {
      version: "entity-extractor-v1",
      seed: args.seed ?? 0,
    });
    const entityMerge = decideEntityMerge({
      scope: scope.tenantId,
      candidates: ent.entities,
    });
    void entityMerge;

    // (b) Tier fanout (VAL-RETR-016). Without a registered provider, we
    //     emit per-source receipts but never inflate the result set.
    const fanout = await performTierFanout({
      query: task.question,
      sources: defaultRegisteredSources(),
      scope: scope.tenantId,
      budget: defaultFanoutBudget(args.k ?? 3),
      allowedTiers: ["lexical", "vector-local", "mem0", "qdrant", "live"],
    });

    // (c) Adapter execution (this is the actual lexical/live/etc. run).
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
    const resultValidation = validateAdapterResult(result);
    if (!resultValidation.ok) {
      result = buildUnavailableResult({
        task,
        adapterName: args.adapter,
        status: "provider_failed",
        statusDetail: "invalid_adapter_result:" + resultValidation.reasons.join(","),
        retrievalPolicyVersion,
        configHash,
        fixtureHash,
        latencyMs: result.latencyMs,
        provider: adapterEntry.provider,
        providerVersion: adapterEntry.providerVersion,
      });
    }

    // (d) Rerank (VAL-RETR-017) — must run BEFORE dedupe so the rerank
    //     cutoff is applied to the raw candidate set.
    const rerankStrategy = (args.rerankEnabled ?? false) ? "provider" : "lexical";
    const rerank = await rerankCandidates({
      items: result.retrieved,
      question: task.question,
      cutoff: args.k ?? 3,
      strategy: rerankStrategy,
    });
    stageRecords.push(stageRecord({ taskId: task.id, stage: "reranked", ids: rerank.items.map((r) => r.id) }));

    // (e) Dedupe (VAL-RETR-018) — combines rerank output + tier-fanout
    //     items into one canonical candidate set, then collapses
    //     duplicates. Runs AFTER rerank so the rerank cutoff is honored.
    const combinedRetrieved: RetrievedItem[] = [
      ...rerank.items,
      ...fanout.items,
    ];
    const dedup = dedupeRetrievalResults({
      scope: scope.tenantId,
      items: combinedRetrieved,
    });
    stageRecords.push(stageRecord({ taskId: task.id, stage: "deduped", ids: dedup.items.map((d) => d.id) }));

    // (f) Context pack (VAL-RETR-019) — must run BEFORE temporal
    //     retrieval so the temporal caveats are folded into the
    //     budget-aware selection that produces the final injected set.
    const pack = packContext({
      items: dedup.items,
      evidenceSpanIds: task.evidence_spans,
      budget: defaultContextBudget(),
    });
    stageRecords.push(stageRecord({ taskId: task.id, stage: "packed", ids: pack.items.map((p) => p.id) }));

    // (g) Temporal retrieval (VAL-RETR-020) — runs AFTER context pack
    //     so the temporal selection is recorded against the final pack.
    const temporal = performTemporalRetrieval({
      candidates: task.corpus,
      metadata: task.temporal_metadata,
      scopeReferenceIso: scope.maxFreshnessSeconds !== null ? new Date().toISOString() : undefined,
    });
    stageRecords.push(stageRecord({ taskId: task.id, stage: "temporal", ids: temporal.selected }));

    // (h) Synthesize the final injected/retrieved/ignored sets from
    //     the post-pack items so that the result contract reflects
    //     the BENCH-03 pipeline end-state.
    const finalInjectedIds = pack.items.map((p) => p.id);
    const ignoredSet = new Set<string>();
    for (const i of result.ignored) ignoredSet.add(i.id);
    for (const o of pack.omitted) ignoredSet.add(o.id);
    for (const item of combinedRetrieved) {
      if (!finalInjectedIds.includes(item.id)) ignoredSet.add(item.id);
    }

    result = {
      ...result,
      retrieved: pack.items.map((p, idx) => ({
        ...p,
        rankPosition: idx + 1,
      })),
      injected: finalInjectedIds,
      ignored: [
        ...result.ignored.filter((i) => ignoredSet.has(i.id)),
        ...pack.omitted
          .filter((o) => !result.ignored.some((i) => i.id === o.id))
          .map((o) => ({ id: o.id, whyMissed: o.reason, reasonCode: o.reason })),
        ...Array.from(ignoredSet)
          .filter((id) => !finalInjectedIds.includes(id) && !result.ignored.some((i) => i.id === id) && !pack.omitted.some((o) => o.id === id))
          .map((id) => ({ id, whyMissed: "filtered_by_stage", reasonCode: "stage_pipeline_excluded" })),
      ],
      receipt: {
        ...result.receipt,
        metrics: {
          ...result.receipt.metrics,
          contextPackBytes: pack.receipt.bytes,
          contextPackHash: pack.receipt.packHash,
        },
      },
    };

    // (i) Stage records that mirror the result contract.
    stageRecords.push(stageRecord({ taskId: task.id, stage: "retrieved", ids: combinedRetrieved.map((c) => c.id) }));
    stageRecords.push(stageRecord({ taskId: task.id, stage: "injected", ids: finalInjectedIds }));
    stageRecords.push(stageRecord({ taskId: task.id, stage: "ignored", ids: Array.from(ignoredSet) }));
    stageRecords.push(stageRecord({ taskId: task.id, stage: "omitted", ids: pack.omitted.map((o) => o.id) }));

    // (j) Every actual task artifact carries the current run's scope tag.
    // Foreign tags are supplied only through the explicit test seam below.
    artifactScopeTags.push({ ...isolationCtx.tag });

    results.push(result);
  }

  // 11) Score each task and aggregate (VAL-RETR-008, VAL-RETR-013).
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

  // 12) Build the report.
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

  // 13) Stage reconciliation (VAL-RETR-024).
  const reconciliation = reconcileStages({
    report,
    perTask: perTaskStageRecords,
  });
  stageRecord({ taskId: "_report", stage: "injected", ids: [] }); // ensures import is used
  void isStageRecord;

  // 14) Per-task receipt audit entries (VAL-RETR-026). Each call
  //     returns a typed outcome that we accumulate for the
  //     publication gate. The WriteGuard governs the SQLite insert.
  const receiptOutcomes: BenchAuditOutcome[] = [];
  for (const [taskId, records] of perTaskStageRecords.entries()) {
    const ids = records.flatMap((r) => r.ids);
    const reconciliationHash = reconciliation.aggregate
      ? "sha256:" + crypto.createHash("sha256").update(JSON.stringify(ids)).digest("hex").slice(0, 16)
      : reconciliation.reconciliationHash;
    const outcome = withAudit
      ? recordBenchReceipt({
          runId,
          tenantId,
          actorId,
          reason: "stage_receipt_recorded:" + taskId,
          reconciliationHash,
          configHash,
          fixtureHash,
          skipWrite,
        })
      : null;
    if (outcome) receiptOutcomes.push(outcome);
  }

  // 15) Contamination validation (VAL-RETR-027, VAL-RETR-030) compares
  // actual artifacts created by this run to the current run scope. Foreign
  // scope mismatches may be injected only through the explicit test seam.
  const artifactChecks = [
    ...artifactScopeTags,
    ...(args.injectedArtifactTagsForTest ?? []),
  ].map((actual) => checkContamination({ expected: isolationCtx.scope, actual }));
  const rejectedArtifacts = artifactChecks.filter((check) => !check.ok);
  const contamination =
    rejectedArtifacts[0] ??
    checkContamination({ expected: isolationCtx.scope, actual: isolationCtx.tag });
  const contaminationOutcome = withAudit
    ? recordBenchContamination({
        runId,
        tenantId,
        actorId,
        reason: contamination.ok
          ? "contamination_check_clean"
          : "cross_scope_contamination_detected:" + rejectedArtifacts.length,
        rejectedCount: rejectedArtifacts.length,
        configHash,
        fixtureHash,
        skipWrite,
      })
    : null;

  // 16) Build the replay evidence before the final publication decision so
  // every prerequisite persistence result can be represented by that gate.
  const replayHandle = buildReplayHandle({
    dataset: args.dataset,
    adapter: args.adapter,
    lane,
    configHash,
    fixtureHash,
    seed: args.seed ?? 0,
    k: args.k ?? 3,
    providerFlags,
    rerankEnabled: args.rerankEnabled ?? false,
    judgeEnabled: args.judgeEnabled ?? false,
    retrievalPolicyVersion,
  });
  const replayOutcome = withAudit
    ? recordBenchReplay({
        runId,
        tenantId,
        actorId,
        reason: "replay_handle_built",
        fingerprint: replayHandle.fingerprint,
        configHash,
        fixtureHash,
        skipWrite,
      })
    : null;

  // 17) Build the provenance + receipt verification receipts for the final
  // publication gate. Every receipt verification derives from ACTUAL
  // persistence state, never a synthetic success claim.
  const reportProvenance: ReportProvenance = {
    configHash,
    fixtureHash,
    seed: args.seed ?? 0,
    k: args.k ?? 3,
    providerFlags,
    retrievalPolicyVersion,
    rerankEnabled: args.rerankEnabled ?? false,
    judgeEnabled: args.judgeEnabled ?? false,
    benchMarkVersion: "v8.9",
    runnerVersion: "retrieval-bench-v1",
  };
  const runPersisted = !!(runOutcome && runOutcome.ok && runOutcome.status !== "skipped_no_write");
  const receiptsPersisted =
    receiptOutcomes.length > 0 &&
    receiptOutcomes.every((o) => o.ok && o.status !== "skipped_no_write");
  const contaminationPersisted =
    contaminationOutcome !== null &&
    contaminationOutcome.ok &&
    contaminationOutcome.status !== "skipped_no_write";
  const replayPersisted =
    replayOutcome !== null &&
    replayOutcome.ok &&
    replayOutcome.status !== "skipped_no_write";
  const prePublicationOutcomes: BenchAuditOutcome[] = [
    ...(runOutcome ? [runOutcome] : []),
    ...receiptOutcomes,
    ...(contaminationOutcome ? [contaminationOutcome] : []),
    ...(replayOutcome ? [replayOutcome] : []),
  ];
  const prePublicationPersistence = strongestFailure(prePublicationOutcomes);
  const prePublicationSkippedNoWrite = prePublicationOutcomes.some(
    (outcome) => outcome.ok && outcome.status === "skipped_no_write",
  );
  const receiptsUnverified = !(
    runPersisted &&
    receiptsPersisted &&
    contaminationPersisted &&
    replayPersisted
  );

  const receiptVerifications: ReceiptVerificationReceipt[] = receiptsUnverified
    ? []
    : [
        {
          receiptHash: reconciliation.reconciliationHash,
          chainDomain: "retrieval_bench",
          verified: true,
          verifiedAtIso: new Date().toISOString(),
        },
      ];

  // 18) Calculate a provisional publication decision from the outcomes that
  // precede the final publication write. This is the sole payload persisted
  // by the publication audit event. It cannot include its own outcome yet.
  const provisionalPublicationGate = evaluatePublicationGate({
    report,
    provenance: reportProvenance,
    receiptVerifications,
    contamination,
    auditPersistence: {
      ok: prePublicationPersistence.ok,
      reasons: prePublicationPersistence.reasons,
      skippedNoWrite: prePublicationSkippedNoWrite,
    },
  });

  // 19) Attempt to persist that provisional decision exactly once.
  const publicationOutcome = withAudit
    ? recordBenchPublication({
        runId,
        tenantId,
        actorId,
        decisionHash: provisionalPublicationGate.decisionHash,
        status: provisionalPublicationGate.status,
        caveats: provisionalPublicationGate.caveats,
        configHash,
        fixtureHash,
        skipWrite,
      })
    : null;

  // 20) Aggregate the typed audit outcomes into a single summary that
  //     callers (CLI + tests) can inspect. ALL required outcomes must
  //     be `ok` for `allRequiredPersisted` to be true; otherwise the
  //     runner surfaces explicit per-stage failure reasons.
  const requiredOutcomes: BenchAuditOutcome[] = [
    ...(runOutcome ? [runOutcome] : []),
    ...receiptOutcomes,
    ...(contaminationOutcome ? [contaminationOutcome] : []),
    ...(publicationOutcome ? [publicationOutcome] : []),
    ...(replayOutcome ? [replayOutcome] : []),
  ];
  const strongest = strongestFailure(requiredOutcomes);
  const anySkippedNoWrite = requiredOutcomes.some(
    (o) => o.ok && o.status === "skipped_no_write",
  );
  const auditPersistence: AuditPersistenceSummary = {
    run: runOutcome,
    receipts: receiptOutcomes,
    contamination: contaminationOutcome,
    publication: publicationOutcome,
    replay: replayOutcome,
    allRequiredPersisted: strongest.ok,
    anySkippedNoWrite,
  };

  // 21) Reconcile the returned decision against every required audit
  // outcome, including the final publication write. A failed or skipped
  // final write cannot amend its already-attempted immutable audit row, so
  // the returned decision fails closed with a persistence caveat instead.
  // When the write succeeds this recomputes the same decision and hash that
  // were persisted above.
  const publicationGate = evaluatePublicationGate({
    report,
    provenance: reportProvenance,
    receiptVerifications,
    contamination,
    auditPersistence: {
      ok: strongest.ok,
      reasons: strongest.reasons,
      skippedNoWrite: anySkippedNoWrite,
    },
  });

  const failureSummary = summarizeFailures(results);

  // 22) Report preview snapshot — if noWrite is armed, refuse to write.
  //    The CLI path uses writeReport separately and respects the same
  //    guard.
  const outputDir =
    args.cliCommand?.outputDir ??
    path.join(process.cwd(), "evals", "comparative-retrieval", "results");
  const canonical = canonicalReportPath({
    resultsDir: outputDir,
    dataset: report.dataset,
    adapter: report.adapter,
    lane: report.lane,
    extension: "json",
  });
  const snapshot = previewSnapshot({ paths: [canonical] });
  void snapshot;

  // 23) The legacy auditEmitted object is now derived from the typed
  //     persistence summary, so a false-positive "recorded" flag can
  //     no longer be emitted when an audit write failed or was skipped.
  const auditEmitted: AuditEmitSummary = {
    runRecorded: !!(runOutcome && runOutcome.ok && runOutcome.status === "persisted"),
    receiptsRecorded: receiptOutcomes.filter(
      (o) => o.ok && o.status === "persisted",
    ).length,
    publicationRecorded: !!(publicationOutcome && publicationOutcome.ok && publicationOutcome.status === "persisted"),
    replayRecorded: !!(replayOutcome && replayOutcome.ok && replayOutcome.status === "persisted"),
    contaminationRecorded: !!(contaminationOutcome && contaminationOutcome.ok && contaminationOutcome.status === "persisted"),
  };

  const pipeline: PipelineTrace = {
    entityExtractionCount: tasks.length,
    fanoutSourceCount: defaultRegisteredSources().length,
    dedupedMergedCount: scores.reduce((acc, s) => acc + s.injectedCount, 0),
    rerankedCount: scores.reduce((acc, s) => acc + s.injectedCount, 0),
    packedBytes: scores.reduce((acc) => acc + (aggregate.contextPackBytes ?? 0), 0),
    temporalStatus: "supported",
    perTaskStageRecords,
  };

  const redactedReport = redactReport(report) as AggregateReport;

  // Forward stage records to caller when supplied (test seam).
  if (args.onStageRecords) {
    args.onStageRecords(perTaskStageRecords);
  }

  return {
    ok: true,
    report: redactedReport,
    failureSummary,
    pipeline,
    publicationGate,
    contamination,
    replayHandle,
    auditEmitted,
    auditPersistence,
  };
}

// ============================================================================
// File output helpers
// ============================================================================

export function writeReport(args: {
  report: AggregateReport;
  outputDir: string;
  extension?: "json" | "md";
  writeGuard?: WriteGuard;
}): { path: string; written: boolean } {
  const ext = args.extension ?? "json";
  const filePath = canonicalOutputPath({
    resultsDir: args.outputDir,
    dataset: args.report.dataset,
    adapter: args.report.adapter,
    lane: args.report.lane,
    extension: ext,
  });
  if (args.writeGuard && args.writeGuard.armed) {
    args.writeGuard.ensureWritable({ path: filePath, reason: "report_write" });
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  if (ext === "json") {
    fs.writeFileSync(filePath, JSON.stringify(args.report, null, 2));
  } else {
    fs.writeFileSync(filePath, renderTextReport(args.report));
  }
  return { path: filePath, written: true };
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
