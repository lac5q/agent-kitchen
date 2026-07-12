#!/usr/bin/env node
/**
 * run-comparative-retrieval-evals.mjs
 *
 * MemroOS Comparative Retrieval Benchmark runner (Lane 2).
 *
 * Implements BENCH-01..03 + RETRIEVAL-01 (core): synthetic fixture smoke,
 * normalized fixture validation, dataset adapter provenance, licensed
 * data non-distribution, shared result contract, lexical/no-memory
 * controls, live retrieval authorization gating, benchmark lane
 * separation, provider/adapter failure handling, ranked-ID metrics,
 * conservative answer/abstention scoring, honest latency/token/context
 * metrics, and reproducible aggregate reports.
 *
 * The benchmark harness is implemented as a TypeScript module at
 * `apps/memroos/src/lib/retrieval-bench/`. This .mjs runner loads that
 * module via Node 22's `--experimental-strip-types` plus a small
 * `scripts/ts-loader.mjs` resolver. The legacy `lexical` / `no-memory`
 * helpers (`scoreTask`, `isExpectedAnswerSupported`) re-export the new
 * TypeScript implementation so existing tests keep working.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { register } from "node:module";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const fixturesDir = path.join(repoRoot, "evals", "comparative-retrieval", "fixtures");
const resultsDir = path.join(repoRoot, "evals", "comparative-retrieval", "results");

// Register the local TS resolver so .ts imports resolve correctly when
// the runner loads the retrieval-bench module under strip-types.
register(path.join(__dirname, "ts-loader.mjs"), pathToFileURL(__dirname));

// Load the TypeScript module via createRequire (Node 22.22+ supports
// require() of .ts files when --experimental-strip-types is enabled).
const requireFromHere = createRequire(import.meta.url);
const benchModulePath = path.join(
  repoRoot,
  "apps/memroos/src/lib/retrieval-bench/index.ts",
);
const bench = requireFromHere(benchModulePath);

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

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--dataset") args.dataset = argv[++i];
    else if (argv[i] === "--limit") args.limit = parseInt(argv[++i], 10);
    else if (argv[i] === "--adapter") args.adapter = argv[++i];
    else if (argv[i] === "--json") args.json = true;
    else if (argv[i] === "--no-write") args.noWrite = true;
    else if (argv[i] === "--scope-tenant") args.scopeTenant = argv[++i];
    else if (argv[i] === "--scope-space") args.scopeSpace = argv[++i];
    else if (argv[i] === "--scope-purpose") args.scopePurpose = argv[++i];
    else if (argv[i] === "--k") args.k = parseInt(argv[++i], 10);
    else if (argv[i] === "--seed") args.seed = parseInt(argv[++i], 10);
    else if (argv[i] === "--rerank") args.rerank = true;
    else if (argv[i] === "--judge") args.judge = true;
  }
  return args;
}

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

function renderTextReport(args, aggregate, taskScores) {
  const lines = [];
  lines.push("# MemroOS Comparative Retrieval Benchmark");
  lines.push("");
  lines.push(`Run date:   ${new Date().toISOString()}`);
  lines.push(`Dataset:    ${args.dataset}`);
  lines.push(`Adapter:    ${args.adapter}`);
  lines.push(`Tasks:      ${taskScores.length}`);
  lines.push("");
  lines.push("## Aggregate Scores");
  lines.push("");
  lines.push(`precision@k:              ${aggregate.precisionAtK}`);
  lines.push(`recall@k:                 ${aggregate.recallAtK}`);
  lines.push(`MRR:                      ${aggregate.mrr}`);
  lines.push(`false_positive_rate:      ${aggregate.falsePositiveRate}`);
  lines.push(`answer_support_rate:      ${aggregate.answerSupportedRate}`);
  lines.push(`p95_latency_ms:           ${aggregate.p95LatencyMs}`);
  if (aggregate.abstentionAccuracy !== null) {
    lines.push(`abstention_accuracy:      ${aggregate.abstentionAccuracy} (labeled=${aggregate.abstentionLabeledCount})`);
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

async function run(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const dataset = args.dataset ?? "memroos_public_synthetic";
  const adapter = args.adapter ?? "lexical";
  const limit = args.limit ?? Infinity;

  if (adapter !== "lexical" && adapter !== "no-memory") {
    console.error(
      "Adapter '" + adapter + "' requires the TypeScript retrieval-bench module.",
    );
    process.exit(2);
  }

  const tasks = loadFixturesSync(dataset, limit);
  const legacyAdapter = selectLegacyAdapter(adapter);

  const taskScores = tasks.map((task) => {
    const retrieval = legacyAdapter(task);
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
    console.log(renderTextReport(args, result.aggregate, taskScores));
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
  scoreTask,
};
