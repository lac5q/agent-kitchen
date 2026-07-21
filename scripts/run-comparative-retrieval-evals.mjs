#!/usr/bin/env node
/**
 * run-comparative-retrieval-evals.mjs
 *
 * MemroOS Comparative Retrieval Benchmark runner (Lane 2).
 *
 * Implements BENCH-01..03 + RETRIEVAL-01 (core):
 *   - VAL-RETR-001 synthetic fixture smoke run
 *   - VAL-RETR-002 normalized fixture validation
 *   - VAL-RETR-003 dataset adapter provenance
 *   - VAL-RETR-004 licensed data non-distribution
 *   - VAL-RETR-005 shared result contract
 *   - VAL-RETR-006 lexical/no-memory control validity
 *   - VAL-RETR-007 live retrieval authorization gating
 *   - VAL-RETR-008 benchmark lane separation
 *   - VAL-RETR-009 provider/adapter failure handling
 *   - VAL-RETR-010 ranked-ID metrics
 *   - VAL-RETR-011 conservative answer/abstention scoring
 *   - VAL-RETR-012 honest latency/token/context metrics
 *   - VAL-RETR-013 reproducible aggregate reports
 *   - VAL-RETR-014..030 deterministic improvements + receipts
 *
 * The runner delegates to the production TypeScript retrieval-bench
 * module at `apps/memroos/src/lib/retrieval-bench/index.ts`, which
 * wires every BENCH-03 stage (entity extraction, tier fanout,
 * rerank, dedupe, context packing, temporal retrieval, stage
 * reconciliation, publication gate, replay handle, isolation /
 * contamination guard) and emits audit entries to the
 * `retrieval_bench` chain domain.
 *
 * CLI flags:
 *   --dataset, --adapter, --limit, --k, --seed, --no-write,
 *   --json, --scope-tenant, --scope-user, --scope-agent, --scope-space,
 *   --scope-label-visibility, --scope-label-policy, --scope-label-domain,
 *   --scope-label-sensitivity, --scope-purpose, --scope-belief-stage,
 *   --rerank, --judge, --output-dir
 *
 * The strict parser in `modules/cli-parser.ts` rejects malformed
 * flags. The write guard refuses all filesystem writes when
 * `--no-write` is set. The report publication gate refuses
 * publication when receipts / provenance are missing.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { register } from "node:module";
import { createRequire } from "node:module";
import { hashRetrievalConfiguration, hashRetrievalWorkload } from "./runtime-bottleneck-contract.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const fixturesDir = path.join(repoRoot, "evals", "comparative-retrieval", "fixtures");
const resultsDir = path.join(repoRoot, "evals", "comparative-retrieval", "results");

// Register the local TS resolver so .ts + @/* alias imports resolve
// correctly under Node 22's --experimental-strip-types.
register(path.join(__dirname, "ts-loader.mjs"), pathToFileURL(__dirname));

// Load the TypeScript module via createRequire (Node 22.22+ supports
// require() of .ts files when --experimental-strip-types is enabled).
const requireFromHere = createRequire(import.meta.url);
const benchModulePath = path.join(
  repoRoot,
  "apps/memroos/src/lib/retrieval-bench/index.ts",
);
const bench = requireFromHere(benchModulePath);

// ===========================================================================
// Re-exports for the existing test suite
// ===========================================================================

// Legacy aliases preserved for the existing test suite
// (scripts/run-comparative-retrieval-evals.test.mjs imports these).
function isExpectedAnswerSupported(expectedAnswer, retrievedText) {
  return bench.isAnswerSupported(expectedAnswer ?? "", retrievedText ?? "");
}

function scoreTask(task, retrieval) {
  const taskShape = {
    id: task.id,
    dataset: task.dataset ?? "memroos_public_synthetic",
    task_type: task.task_type ?? "single_hop",
    corpus: task.corpus ?? [],
    question: task.question ?? "",
    expected_answer: task.expected_answer ?? "",
    evidence_spans: task.evidence_spans ?? [],
    abstention_correct: task.abstention_correct,
    license: task.license ?? "MIT",
    citation: task.citation ?? "MemroOS internal synthetic benchmark",
    provenance: task.provenance ?? {
      dataset: task.dataset ?? "memroos_public_synthetic",
      sourceCitation: task.citation ?? "MemroOS internal synthetic benchmark",
      sourceLicense: task.license ?? "MIT",
      sourceAvailability: "synthetic",
    },
  };
  const adapterResult = {
    taskId: task.id,
    adapterName: retrieval.adapterName ?? "lexical",
    status: "ok",
    retrieved: retrieval.retrieved ?? [],
    injected: retrieval.injected ?? [],
    ignored: retrieval.ignored ?? [],
    latencyMs: retrieval.latencyMs ?? 0,
    receipt: {
      adapterName: retrieval.adapterName ?? "lexical",
      adapterVersion: "0.0.0",
      status: "ok",
      latencyMs: retrieval.latencyMs ?? 0,
      authorization: { evaluated: false, allowed: true },
      provenance: {
        provider: null,
        providerVersion: null,
        retrievalPolicyVersion: "legacy-v1",
        configHash: "n/a",
        fixtureHash: "n/a",
      },
      metrics: {
        tokensRetrieval: null,
        tokensRerank: null,
        tokensPack: null,
        tokensJudge: null,
        contextPackBytes: null,
        contextPackHash: null,
      },
    },
  };
  const score = bench.scoreTask({
    task: taskShape,
    result: adapterResult,
    k: retrieval.retrieved?.length ?? 3,
    lane: "external_retrieval",
  });
  return {
    taskId: score.taskId,
    taskType: score.taskType,
    precisionAtK: score.precisionAtK,
    recallAtK: score.recallAtK,
    mrr: score.mrr,
    falsePositiveRate: score.falsePositiveRate,
    latencyMs: score.latencyMs,
    injectedCount: score.injectedCount,
    evidenceSpanCount: score.evidenceSpanCount,
    answerSupportedByRetrievedSource: score.answerSupportedByRetrievedSource,
    abstentionCorrect: score.abstentionCorrect,
    status: "ok",
    receipt: {
      retrieved: (retrieval.retrieved ?? []).map((r) => ({
        id: r.id,
        score: r.score,
        tier: r.tier ?? "lexical",
        source: r.source ?? task.source ?? "corpus",
        authorizationResult: r.authorizationResult ?? "allowed",
        whyEntered: r.score > 0 ? `term overlap score ${r.score}` : "explicit include",
      })),
      injected: retrieval.injected ?? [],
      ignored: (retrieval.ignored ?? []).map((id) => ({
        id,
        whyMissed: "below relevance threshold or zero term overlap",
      })),
      adapterName: retrieval.adapterName ?? "lexical",
    },
  };
}

// ===========================================================================
// Strict CLI parsing — uses the BENCH-03 strict parser when available
// ===========================================================================

function parseArgs(argv) {
  // Prefer the production strict parser. When unavailable (older builds)
  // we fall back to a minimal permissive parser so the smoke path stays
  // runnable.
  if (bench.parseCliArgs) {
    const r = bench.parseCliArgs(argv);
    if (!r.ok) {
      console.error("Invalid CLI args: " + r.reason);
      process.exit(2);
    }
    const c = r.command;
    return {
      dataset: c.dataset,
      adapter: c.adapter,
      limit: c.limit,
      adapterShort: c.adapter,
      json: c.json,
      noWrite: c.noWrite,
      scopeTenant: c.scopeTenant,
      scopeUser: c.scopeUser,
      scopeAgent: c.scopeAgent,
      scopeSpace: c.scopeSpace,
      scopeLabelVisibility: c.scopeLabelVisibility,
      scopeLabelPolicy: c.scopeLabelPolicy,
      scopeLabelDomain: c.scopeLabelDomain,
      scopeLabelSensitivity: c.scopeLabelSensitivity,
      scopePurpose: c.scopePurpose,
      scopeBeliefStage: c.scopeBeliefStage,
      k: c.k,
      seed: c.seed,
      rerank: c.rerank,
      judge: c.judge,
      outputDir: c.outputDir,
      strict: true,
    };
  }
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--dataset") args.dataset = argv[++i];
    else if (argv[i] === "--limit") args.limit = parseInt(argv[++i], 10);
    else if (argv[i] === "--adapter") args.adapter = argv[++i];
    else if (argv[i] === "--json") args.json = true;
    else if (argv[i] === "--no-write") args.noWrite = true;
    else if (argv[i] === "--scope-tenant") args.scopeTenant = argv[++i];
    else if (argv[i] === "--scope-user") args.scopeUser = argv[++i];
    else if (argv[i] === "--scope-agent") args.scopeAgent = argv[++i];
    else if (argv[i] === "--scope-space") args.scopeSpace = argv[++i];
    else if (argv[i] === "--scope-label-visibility") args.scopeLabelVisibility = argv[++i];
    else if (argv[i] === "--scope-label-policy") args.scopeLabelPolicy = argv[++i];
    else if (argv[i] === "--scope-label-domain") args.scopeLabelDomain = argv[++i];
    else if (argv[i] === "--scope-label-sensitivity") args.scopeLabelSensitivity = argv[++i];
    else if (argv[i] === "--scope-purpose") args.scopePurpose = argv[++i];
    else if (argv[i] === "--scope-belief-stage") args.scopeBeliefStage = argv[++i];
    else if (argv[i] === "--k") args.k = parseInt(argv[++i], 10);
    else if (argv[i] === "--seed") args.seed = parseInt(argv[++i], 10);
    else if (argv[i] === "--rerank") args.rerank = true;
    else if (argv[i] === "--judge") args.judge = true;
  }
  return { ...args, strict: false };
}

// ===========================================================================
// Legacy adapters (kept for the legacy test suite)
// ===========================================================================

function legacyLexicalAdapter(task, k = 3) {
  const start = Date.now();
  const questionTerms = new Set(
    task.question
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .split(/\s+/)
      .filter((t) => t.length > 2),
  );

  const ranked = task.corpus
    .map((entry) => {
      const entryTerms = entry.text.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/);
      const overlap = entryTerms.filter((t) => questionTerms.has(t)).length;
      return { id: entry.id, text: entry.text, score: overlap };
    })
    .filter((e) => e.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);

  const latencyMs = Date.now() - start;
  return {
    retrieved: ranked,
    injected: ranked.map((e) => e.id),
    ignored: task.corpus.filter((e) => !ranked.some((r) => r.id === e.id)).map((e) => e.id),
    latencyMs,
    adapterName: "lexical",
  };
}

function legacyNoMemoryAdapter(task) {
  return {
    retrieved: [],
    injected: [],
    ignored: task.corpus.map((e) => e.id),
    latencyMs: 0,
    adapterName: "no-memory",
  };
}

function selectLegacyAdapter(adapterName) {
  if (adapterName === "no-memory") return legacyNoMemoryAdapter;
  return legacyLexicalAdapter;
}

function loadFixturesSync(dataset, limit) {
  const datasetFileMap = {
    memroos_public_synthetic: "memroos-public-smoke.json",
  };
  const filename = datasetFileMap[dataset];
  if (!filename) {
    throw new Error(
      "Dataset '" + dataset + "' is not loadable in the legacy CLI path. " +
        "Use the TypeScript retrieval-bench module to convert caller-local data."
    );
  }
  const fixturePath = path.join(fixturesDir, filename);
  if (!fs.existsSync(fixturePath)) {
    throw new Error("Fixture file not found: " + fixturePath);
  }
  const tasks = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  return limit && Number.isFinite(limit) ? tasks.slice(0, limit) : tasks;
}

// ===========================================================================
// Text report renderer
// ===========================================================================

function validateRuntimeBottleneckReport(report, suite) {
  for (const field of ["suiteManifestHash", "fixtureHash", "retrievalWorkloadHash", "retrievalConfigurationHash", "operatorRequestMethod", "dependencyHealth"]) {
    if (typeof suite[field] !== "string" && field !== "dependencyHealth") throw new Error(`runtime suite manifest missing ${field}`);
  }
  const dependenciesHealthy = suite.dependencyHealth && typeof suite.dependencyHealth === "object" && !Array.isArray(suite.dependencyHealth) && Object.keys(suite.dependencyHealth).length > 0 && Object.values(suite.dependencyHealth).every((entry) => entry === "healthy" || (entry && typeof entry === "object" && entry.status === "healthy"));
  const aggregate = report.aggregate;
  const actual = {
    fixtureHash: report.fixtureHash,
    retrievalConfigurationHash: hashRetrievalConfiguration({
      dataset: report.dataset,
      adapter: report.adapter,
      k: report.k,
      rerankEnabled: report.rerankEnabled,
      judgeEnabled: report.judgeEnabled,
      providerFlags: report.providerFlags,
      seed: report.seed,
    }),
    retrievalWorkloadHash: hashRetrievalWorkload({ dataset: report.dataset, taskCount: report.taskCount, fixtureHash: report.fixtureHash }),
  };
  if (actual.retrievalConfigurationHash !== report.configHash) throw new Error("retrieval report configHash does not match executed arguments");
  if (report.taskCount < 25 || aggregate.completedTaskCount !== report.taskCount || aggregate.failedTaskCount !== 0) {
    throw new Error("runtime bottleneck retrieval evidence requires at least 25 completed tasks and zero failed tasks");
  }
  if (!dependenciesHealthy || suite.fixtureHash !== actual.fixtureHash || suite.retrievalWorkloadHash !== actual.retrievalWorkloadHash || suite.retrievalConfigurationHash !== actual.retrievalConfigurationHash || suite.operatorRequestMethod !== "GET" || suite.degradedMode !== false) {
    throw new Error("runtime suite manifest does not match the healthy retrieval run's executed arguments");
  }
  return actual;
}

function writeRuntimeBottleneckResult(report) {
  const runId = process.env.RUNTIME_BOTTLENECK_RUN_ID;
  if (!runId) return null;
  if (!/^run-\d\d$/.test(runId)) throw new Error("RUNTIME_BOTTLENECK_RUN_ID must use immutable run-NN form");
  const outputDir = path.join(repoRoot, "evals", "comparative-retrieval", "results", "runtime-bottleneck");
  const manifestPath = process.env.RUNTIME_BOTTLENECK_SUITE_MANIFEST || path.join(repoRoot, "reports", "operator-load", "runtime-bottleneck", "suite-manifest.json");
  const suite = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const actual = validateRuntimeBottleneckReport(report, suite);
  const aggregate = report.aggregate;
  const output = path.join(outputDir, `${runId}.json`);
  if (fs.existsSync(output)) throw new Error(`refusing to overwrite immutable evidence run: ${output}`);
  const evidence = {
    schemaVersion: "1",
    suiteManifestHash: suite.suiteManifestHash,
    fixtureHash: actual.fixtureHash,
    retrievalWorkloadHash: actual.retrievalWorkloadHash,
    retrievalConfigurationHash: actual.retrievalConfigurationHash,
    seed: report.seed,
    taskCount: report.taskCount,
    precisionAtK: aggregate.precisionAtK,
    recallAtK: aggregate.recallAtK,
    mrr: aggregate.mrr,
    falsePositiveRate: aggregate.falsePositiveRate,
    answerSupportedRate: aggregate.answerSupportedRate,
    p50LatencyMs: aggregate.p50LatencyMs,
    p95LatencyMs: aggregate.p95LatencyMs,
    completedTaskCount: aggregate.completedTaskCount,
    failedTaskCount: aggregate.failedTaskCount,
    tokenAccounting: aggregate.tokenAccounting,
    dependencyTiming: aggregate.dependencyTiming,
  };
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`, { flag: "wx" });
  return output;
}

function renderTextReport(args, result) {
  const lines = [];
  lines.push("# MemroOS Comparative Retrieval Benchmark");
  lines.push("");
  lines.push(`Run ID:        ${result.runId ?? "n/a"}`);
  lines.push(`Run date:      ${result.runDate ?? new Date().toISOString()}`);
  lines.push(`Dataset:       ${args.dataset}`);
  lines.push(`Adapter:       ${args.adapter}`);
  lines.push(`Tasks:         ${result.taskCount ?? 0}`);
  if (result.aggregate) {
    lines.push(`Lane:          ${result.lane ?? "external_retrieval"}`);
    lines.push(`Config hash:   ${result.configHash ?? "n/a"}`);
    lines.push(`Fixture hash:  ${result.fixtureHash ?? "n/a"}`);
  }
  lines.push("");
  lines.push("## Aggregate Scores");
  lines.push("");
  if (result.aggregate) {
    const a = result.aggregate;
    lines.push(`precision@k:              ${a.precisionAtK}`);
    lines.push(`recall@k:                 ${a.recallAtK}`);
    lines.push(`MRR:                      ${a.mrr}`);
    lines.push(`false_positive_rate:      ${a.falsePositiveRate}`);
    lines.push(`answer_support_rate:      ${a.answerSupportedRate}`);
    lines.push(`p50_latency_ms:           ${a.p50LatencyMs}`);
    lines.push(`p95_latency_ms:           ${a.p95LatencyMs}`);
    if (a.abstentionAccuracy !== null && a.abstentionAccuracy !== undefined) {
      lines.push(`abstention_accuracy:      ${a.abstentionAccuracy} (labeled=${a.abstentionLabeledCount})`);
    }
  }
  if (result.publicationGate) {
    lines.push("");
    lines.push("## Publication Gate");
    lines.push("");
    lines.push(`status:                  ${result.publicationGate.status}`);
    lines.push(`reason:                  ${result.publicationGate.reason}`);
    if (result.publicationGate.caveats && result.publicationGate.caveats.length > 0) {
      lines.push(`caveats:                 ${result.publicationGate.caveats.join("; ")}`);
    }
  }
  if (result.contamination) {
    lines.push("");
    lines.push("## Contamination Probe");
    lines.push("");
    lines.push(`ok:                      ${result.contamination.ok}`);
    if (!result.contamination.ok) {
      lines.push(`reason:                  ${result.contamination.reason}`);
    }
  }
  if (result.replayHandle) {
    lines.push("");
    lines.push("## Replay Handle");
    lines.push("");
    lines.push(`fingerprint:             ${result.replayHandle.fingerprint}`);
  }
  if (result.auditPersistence) {
    lines.push("");
    lines.push("## Audit Persistence");
    lines.push("");
    lines.push(`all_required_persisted: ${result.auditPersistence.allRequiredPersisted}`);
    lines.push(`any_skipped_no_write:   ${result.auditPersistence.anySkippedNoWrite}`);
    const run = result.auditPersistence.run;
    if (run) {
      lines.push(`run:                    ok=${run.ok} status=${run.status}${run.reason ? " reason=" + run.reason : ""}`);
    }
    const pub = result.auditPersistence.publication;
    if (pub) {
      lines.push(`publication:            ok=${pub.ok} status=${pub.status}${pub.reason ? " reason=" + pub.reason : ""}`);
    }
    const replay = result.auditPersistence.replay;
    if (replay) {
      lines.push(`replay:                 ok=${replay.ok} status=${replay.status}`);
    }
    const cont = result.auditPersistence.contamination;
    if (cont) {
      lines.push(`contamination:          ok=${cont.ok} status=${cont.status} reason=${cont.reason ?? ""}`);
    }
    const failed = (result.auditPersistence.receipts || []).filter((o) => !o.ok);
    lines.push(`receipts_total:         ${(result.auditPersistence.receipts || []).length}`);
    lines.push(`receipts_failed:        ${failed.length}`);
  }
  lines.push("");
  lines.push("## Midbrain Comparison Caveat");
  lines.push("");
  lines.push(
    "Midbrain SmartSearch retrieval metrics referenced in MemroOS public copy are third-party paper",
  );
  lines.push(
    "results (arXiv 2504.00553). They are NOT from this harness. Direct comparison requires:",
  );
  lines.push("  1. Midbrain API access or open dataset + model weights");
  lines.push("  2. Running both adapters against the same fixture set");
  lines.push("  3. Publishing results with the same methodology notes");
  lines.push("");
  lines.push("Until a direct rerun is complete, cite Midbrain as: '65.21/100 (public-evidence");
  lines.push("architecture score; SmartSearch retrieval metrics are third-party paper results,");
  lines.push("not independently rerun).'");
  return lines.join("\n");
}

// ===========================================================================
// Main entry — production path uses runBenchmark
// ===========================================================================

async function run(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const dataset = args.dataset ?? "memroos_public_synthetic";
  const adapter = args.adapter ?? "lexical";
  const limit = args.limit ?? null;

  // Build the optional scope from CLI flags.
  const scope = {
    tenantId: args.scopeTenant ?? "default-tenant",
    userId: args.scopeUser ?? null,
    agentId: args.scopeAgent ?? null,
    spaceId: args.scopeSpace ?? null,
    label: args.scopeLabelVisibility && args.scopeLabelPolicy
      ? {
          visibility: args.scopeLabelVisibility,
          policy: args.scopeLabelPolicy,
          domain: args.scopeLabelDomain ?? null,
          sensitivity: args.scopeLabelSensitivity ?? null,
        }
      : null,
    purpose: args.scopePurpose ?? "memory_search",
    beliefStage: args.scopeBeliefStage ?? null,
    maxFreshnessSeconds: null,
  };

  // For the synthetic dataset we invoke the production runner so every
  // BENCH-03 stage, audit call, and publication gate is exercised on the
  // live CLI path (the scrutiny-synthesis requirement).
  if (bench.runBenchmark) {
    let outcome;
    try {
      outcome = await bench.runBenchmark({
        dataset,
        adapter,
        limit: typeof limit === "number" ? limit : undefined,
        k: args.k ?? 3,
        seed: args.seed ?? 0,
        fixturesDir,
        scope,
        rerankEnabled: !!args.rerank,
        judgeEnabled: !!args.judge,
        noWrite: !!args.noWrite,
        tenantId: scope.tenantId,
        withAudit: true,
        cliCommand: {
          noWrite: !!args.noWrite,
          outputDir: args.outputDir,
          configOverrides: {},
        },
      });
    } catch (err) {
      console.error("runBenchmark failed: " + (err && err.message ? err.message : String(err)));
      process.exit(2);
    }

    if (!outcome.ok) {
      const errorResult = {
        ok: false,
        reason: outcome.reason,
        issues: outcome.issues,
      };
      console.log(JSON.stringify(errorResult, null, 2));
      process.exit(2);
      return errorResult;
    }

    const report = outcome.report;
    const result = {
      runId: report.runId,
      runDate: report.runDate,
      dataset: report.dataset,
      adapter: report.adapter,
      lane: report.lane,
      configHash: report.configHash,
      fixtureHash: report.fixtureHash,
      seed: report.seed,
      k: report.k,
      rerankEnabled: report.rerankEnabled,
      judgeEnabled: report.judgeEnabled,
      providerFlags: report.providerFlags,
      taskCount: report.taskCount,
      aggregate: {
        precisionAtK: report.aggregate.precisionAtK,
        recallAtK: report.aggregate.recallAtK,
        mrr: report.aggregate.mrr,
        falsePositiveRate: report.aggregate.falsePositiveRate,
        answerSupportedRate: report.aggregate.answerSupportedRate,
        p50LatencyMs: report.aggregate.p50LatencyMs,
        p95LatencyMs: report.aggregate.p95LatencyMs,
        abstentionAccuracy: report.aggregate.abstentionAccuracy,
        abstentionLabeledCount: report.aggregate.abstentionLabeledCount,
        failedTaskCount: report.aggregate.failedTaskCount,
      },
      publicationGate: outcome.publicationGate,
      contamination: outcome.contamination,
      replayHandle: outcome.replayHandle ? { fingerprint: outcome.replayHandle.fingerprint } : null,
      auditEmitted: outcome.auditEmitted,
      auditPersistence: outcome.auditPersistence
        ? {
            run: outcome.auditPersistence.run,
            receipts: outcome.auditPersistence.receipts,
            contamination: outcome.auditPersistence.contamination,
            publication: outcome.auditPersistence.publication,
            replay: outcome.auditPersistence.replay,
            allRequiredPersisted: outcome.auditPersistence.allRequiredPersisted,
            anySkippedNoWrite: outcome.auditPersistence.anySkippedNoWrite,
          }
        : null,
      tasks: report.tasks,
    };

    const publicationReady =
      outcome.publicationGate?.ok === true &&
      outcome.auditPersistence?.allRequiredPersisted === true;
    if (process.env.RUNTIME_BOTTLENECK_RUN_ID && (!publicationReady || args.noWrite)) {
      throw new Error("runtime bottleneck evidence requires a persisted, publication-ready retrieval run");
    }
    if (!args.noWrite && publicationReady) {
      fs.mkdirSync(resultsDir, { recursive: true });
      const outFile = path.join(resultsDir, dataset + "-" + adapter + "-latest.json");
      fs.writeFileSync(outFile, JSON.stringify(result, null, 2));
      const runtimeEvidencePath = writeRuntimeBottleneckResult(report);
      if (!args.json && runtimeEvidencePath) console.log("Wrote " + path.relative(repoRoot, runtimeEvidencePath));
      if (!args.json) {
        console.log("Wrote " + path.relative(repoRoot, outFile));
      }
    } else if (!args.json) {
      console.log(
        args.noWrite
          ? "--no-write armed: skipped result file write (write guard enforced)"
          : "publication blocked: skipped result file write (audit persistence incomplete)",
      );
    }

    if (args.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(renderTextReport(args, result));
    }

    // Publication eligibility is deliberately stricter than evaluation
    // completion. A clean --no-write evaluation has no durable audit proof,
    // so its publication gate remains blocked, but the requested local
    // evaluation completed successfully and must be usable as a smoke/control
    // command. Substantive evaluation failures still exit non-zero.
    const cleanNoWriteEvaluation =
      args.noWrite === true &&
      outcome.failureSummary?.failedTaskCount === 0 &&
      outcome.contamination?.ok === true &&
      outcome.auditPersistence?.allRequiredPersisted === false &&
      outcome.auditPersistence?.anySkippedNoWrite === true;
    if (
      outcome.publicationGate &&
      !outcome.publicationGate.ok &&
      !cleanNoWriteEvaluation
    ) {
      process.exit(3);
    }
    return result;
  }

  // Legacy fallback path (used when the TS module is unavailable).
  if (adapter !== "lexical" && adapter !== "no-memory") {
    console.error(
      "Adapter '" + adapter + "' requires the TypeScript retrieval-bench module.",
    );
    process.exit(2);
  }
  const tasks = loadFixturesSync(dataset, limit);
  const legacyAdapter = selectLegacyAdapter(adapter);
  const taskScores = tasks.map((task) => {
    const retrieval = legacyAdapter(task, args.k ?? 3);
    return scoreTask(task, retrieval);
  });
  const aggregate = bench.aggregateTaskScores(taskScores);
  const result = {
    runDate: new Date().toISOString(),
    dataset,
    adapter,
    taskCount: taskScores.length,
    aggregate: {
      n: aggregate.taskCount,
      precisionAtK: aggregate.precisionAtK,
      recallAtK: aggregate.recallAtK,
      mrr: aggregate.mrr,
      falsePositiveRate: aggregate.falsePositiveRate,
      answerSupportedRate: aggregate.answerSupportedRate,
      p95LatencyMs: aggregate.p95LatencyMs,
      abstentionAccuracy: aggregate.abstentionAccuracy,
    },
    tasks: taskScores,
  };
  if (!args.noWrite) {
    fs.mkdirSync(resultsDir, { recursive: true });
    const outFile = path.join(resultsDir, dataset + "-" + adapter + "-latest.json");
    fs.writeFileSync(outFile, JSON.stringify(result, null, 2));
    if (!args.json) {
      console.log("Wrote " + path.relative(repoRoot, outFile));
    }
  }
  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(renderTextReport(args, result));
  }
  return result;
}

if (import.meta.url === "file://" + process.argv[1]) {
  run();
}

export {
  isExpectedAnswerSupported,
  legacyLexicalAdapter as lexicalAdapter,
  loadFixturesSync as loadFixtures,
  legacyNoMemoryAdapter as noMemoryAdapter,
  run,
  scoreTask,
  validateRuntimeBottleneckReport,
  writeRuntimeBottleneckResult,
};
