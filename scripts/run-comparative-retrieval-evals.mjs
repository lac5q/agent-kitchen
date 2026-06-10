#!/usr/bin/env node
/**
 * run-comparative-retrieval-evals.mjs
 *
 * MemroOS Comparative Retrieval Benchmark runner (Lane 2).
 *
 * Runs the MemroOS in-process adapter (lexical BM25 baseline) against the normalized
 * task fixtures in evals/comparative-retrieval/fixtures/. Full adapter integration
 * against live MemroOS recall/context-pack APIs requires a running MemroOS server
 * and is gated behind --adapter=memroos-live.
 *
 * Usage:
 *   node scripts/run-comparative-retrieval-evals.mjs
 *   node scripts/run-comparative-retrieval-evals.mjs --dataset memroos_public_synthetic
 *   node scripts/run-comparative-retrieval-evals.mjs --limit 25
 *   node scripts/run-comparative-retrieval-evals.mjs --adapter lexical
 *   node scripts/run-comparative-retrieval-evals.mjs --json
 *
 * Adapter options:
 *   lexical (default)     — BM25-style keyword overlap baseline (no server required)
 *   vector-only           — Stub: requires MemroOS vector recall API (not implemented yet)
 *   memroos-live          — Full MemroOS recall + context-pack path (not implemented yet)
 *   no-memory             — Answers without any retrieved context (baseline)
 *
 * Status: Lane 2 harness shape is proven. Dataset loaders for LoCoMo and LongMemEval
 * are stub paths pending data acquisition (see evals/comparative-retrieval/fixtures/README.md).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const fixturesDir = path.join(repoRoot, "evals", "comparative-retrieval", "fixtures");
const resultsDir = path.join(repoRoot, "evals", "comparative-retrieval", "results");

function round(value, places = 4) {
  const factor = 10 ** places;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--dataset") args.dataset = argv[++i];
    else if (argv[i] === "--limit") args.limit = parseInt(argv[++i], 10);
    else if (argv[i] === "--adapter") args.adapter = argv[++i];
    else if (argv[i] === "--json") args.json = true;
    else if (argv[i] === "--no-write") args.noWrite = true;
  }
  return {
    dataset: args.dataset ?? "memroos_public_synthetic",
    limit: args.limit ?? Infinity,
    adapter: args.adapter ?? "lexical",
    json: args.json ?? false,
    noWrite: args.noWrite ?? false,
  };
}

/**
 * Load fixtures from the fixtures directory for a given dataset.
 * Returns an array of normalized tasks matching evals/comparative-retrieval/schema.json.
 */
function loadFixtures(dataset, limit) {
  const datasetFileMap = {
    memroos_public_synthetic: "memroos-public-smoke.json",
    locomo: null, // Pending dataset acquisition — see fixtures/README.md
    longmemeval: null,
    longmemeval_v2: null,
  };

  const filename = datasetFileMap[dataset];
  if (!filename) {
    const msg = dataset === "locomo" || dataset === "longmemeval" || dataset === "longmemeval_v2"
      ? `Dataset '${dataset}' requires manual acquisition. See evals/comparative-retrieval/fixtures/README.md for sourcing rules.`
      : `Unknown dataset: '${dataset}'. Valid options: memroos_public_synthetic, locomo, longmemeval, longmemeval_v2`;
    throw new Error(msg);
  }

  const fixturePath = path.join(fixturesDir, filename);
  if (!fs.existsSync(fixturePath)) {
    throw new Error(`Fixture file not found: ${fixturePath}`);
  }

  const tasks = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  return limit < Infinity ? tasks.slice(0, limit) : tasks;
}

/**
 * Lexical baseline adapter: BM25-style keyword overlap retrieval.
 * Returns top-k corpus entries ranked by term overlap with the question.
 */
function lexicalAdapter(task, k = 3) {
  const start = Date.now();
  const questionTerms = new Set(
    task.question.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter((t) => t.length > 2)
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

/**
 * No-memory baseline: returns no retrieved context.
 */
function noMemoryAdapter(task) {
  return {
    retrieved: [],
    injected: [],
    ignored: task.corpus.map((e) => e.id),
    latencyMs: 0,
    adapterName: "no-memory",
  };
}

function selectAdapter(adapterName) {
  if (adapterName === "no-memory") return noMemoryAdapter;
  if (adapterName === "lexical") return lexicalAdapter;
  if (adapterName === "vector-only" || adapterName === "memroos-live") {
    throw new Error(
      `Adapter '${adapterName}' requires a running MemroOS server and is not yet implemented in the harness. ` +
        "Run the server and implement the adapter contract in evals/comparative-retrieval/adapters/."
    );
  }
  throw new Error(`Unknown adapter: '${adapterName}'`);
}

/**
 * Score a single task result.
 * Uses exact string containment for expected_answer in retrieved text.
 * Full judge-assisted semantic equivalence requires an LLM judge (not implemented here).
 */
function scoreTask(task, retrieval) {
  const evidenceSpans = new Set(task.evidence_spans ?? []);
  const injectedSet = new Set(retrieval.injected);

  // precision@k: fraction of injected that are in evidence_spans
  const truePositives = retrieval.injected.filter((id) => evidenceSpans.has(id)).length;
  const precisionAtK = retrieval.injected.length > 0 ? truePositives / retrieval.injected.length : 0;

  // recall@k: fraction of evidence_spans found in injected
  const recallAtK = evidenceSpans.size > 0 ? truePositives / evidenceSpans.size : (retrieval.injected.length === 0 ? 1 : 0);

  // MRR: reciprocal rank of first relevant result
  let mrr = 0;
  for (let i = 0; i < retrieval.retrieved.length; i++) {
    if (evidenceSpans.has(retrieval.retrieved[i].id)) {
      mrr = 1 / (i + 1);
      break;
    }
  }

  // false_positive_rate: injected but not in evidence_spans / total injected
  const falsePositives = retrieval.injected.filter((id) => !evidenceSpans.has(id)).length;
  const falsePositiveRate = retrieval.injected.length > 0 ? falsePositives / retrieval.injected.length : 0;

  // abstention correctness
  let abstentionCorrect = null;
  if (task.abstention_correct === true) {
    abstentionCorrect = retrieval.injected.length === 0;
  }

  // answer support: does any retrieved text contain the expected answer (exact match heuristic)?
  const answerLower = (task.expected_answer ?? "").toLowerCase();
  const answerSupported = retrieval.retrieved.some((r) =>
    r.text.toLowerCase().includes(answerLower.slice(0, 40))
  );

  return {
    taskId: task.id,
    taskType: task.task_type,
    precisionAtK: round(precisionAtK, 4),
    recallAtK: round(recallAtK, 4),
    mrr: round(mrr, 4),
    falsePositiveRate: round(falsePositiveRate, 4),
    latencyMs: retrieval.latencyMs,
    injectedCount: retrieval.injected.length,
    evidenceSpanCount: evidenceSpans.size,
    answerSupportedByRetrievedSource: answerSupported,
    abstentionCorrect,
    receipt: {
      retrieved: retrieval.retrieved.map((r) => r.id),
      injected: retrieval.injected,
      ignored: retrieval.ignored,
      adapterName: retrieval.adapterName,
    },
  };
}

function aggregateScores(taskScores) {
  const n = taskScores.length;
  if (n === 0) return null;

  const sum = (key) => taskScores.reduce((acc, t) => acc + (t[key] ?? 0), 0);

  const abstentionTasks = taskScores.filter((t) => t.abstentionCorrect !== null);
  const abstentionAccuracy =
    abstentionTasks.length > 0
      ? abstentionTasks.filter((t) => t.abstentionCorrect === true).length / abstentionTasks.length
      : null;

  const latencies = taskScores.map((t) => t.latencyMs).sort((a, b) => a - b);
  const p95Index = Math.ceil(latencies.length * 0.95) - 1;

  return {
    n,
    precisionAtK: round(sum("precisionAtK") / n, 4),
    recallAtK: round(sum("recallAtK") / n, 4),
    mrr: round(sum("mrr") / n, 4),
    falsePositiveRate: round(sum("falsePositiveRate") / n, 4),
    answerSupportedRate: round(taskScores.filter((t) => t.answerSupportedByRetrievedSource).length / n, 4),
    p95LatencyMs: latencies[Math.max(0, p95Index)] ?? 0,
    abstentionAccuracy,
  };
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
    lines.push(`abstention_accuracy:      ${aggregate.abstentionAccuracy}`);
  }
  lines.push("");
  lines.push("## Midbrain Comparison Caveat");
  lines.push("");
  lines.push(
    "Midbrain SmartSearch retrieval metrics referenced in MemroOS public copy are third-party paper"
  );
  lines.push(
    "results (arXiv 2504.00553). They are NOT from this harness. Direct comparison requires:"
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

function run(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const adapter = selectAdapter(args.adapter);
  const tasks = loadFixtures(args.dataset, args.limit);

  const taskScores = tasks.map((task) => {
    const retrieval = adapter(task);
    return scoreTask(task, retrieval);
  });

  const aggregate = aggregateScores(taskScores);

  const result = {
    runDate: new Date().toISOString(),
    dataset: args.dataset,
    adapter: args.adapter,
    taskCount: taskScores.length,
    aggregate,
    tasks: taskScores,
  };

  if (!args.noWrite) {
    fs.mkdirSync(resultsDir, { recursive: true });
    const outFile = path.join(resultsDir, `${args.dataset}-${args.adapter}-latest.json`);
    fs.writeFileSync(outFile, `${JSON.stringify(result, null, 2)}\n`);
    if (!args.json) {
      console.log(`Wrote ${path.relative(repoRoot, outFile)}`);
    }
  }

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(renderTextReport(args, aggregate, taskScores));
  }

  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run();
}

export { loadFixtures, lexicalAdapter, noMemoryAdapter, scoreTask, aggregateScores };
