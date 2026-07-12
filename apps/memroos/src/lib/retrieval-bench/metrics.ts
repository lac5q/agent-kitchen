/**
 * Retrieval benchmark metrics (VAL-RETR-010, VAL-RETR-011, VAL-RETR-012).
 *
 *   - VAL-RETR-010: ranked-ID metrics (precision@k, recall@k, MRR,
 *     false-positive rate) computed over injected/evidence IDs, including
 *     multi-hop evidence and empty cases. Hand-calculation-friendly.
 *   - VAL-RETR-011: answer/abstention scoring is conservative. Limited
 *     case/whitespace normalization; empty expected answers are NOT
 *     treated as exact success; semantic judge is separate and labeled;
 *     abstention accuracy uses only labeled tasks and distinguishes
 *     failure on answerable tasks.
 *   - VAL-RETR-012: latency/token/context metrics are honest. p95 uses
 *     task retrieval latencies; token spend separates retrieval / rerank /
 *     pack / judge; unavailable components are reported as null.
 *   - VAL-RETR-013: aggregate reports reproducible. Aggregates use
 *     selected tasks only with documented rounding; JSON/text derive
 *     from the same result object.
 */

import crypto from "node:crypto";

import type {
  AdapterReceipt,
  AdapterResult,
  AggregateMetrics,
  BenchmarkLane,
  NormalizedTask,
  TaskScore,
  TaskType,
} from "./schema";
import { DATASET_TO_LANE } from "./schema";
import { hashCorpus, hashTaskIdentity } from "./validation";

// ============================================================================
// Round helper
// ============================================================================

const ROUND_PLACES = 4;

export function round(value: number, places = ROUND_PLACES): number {
  if (!Number.isFinite(value)) return value;
  const factor = 10 ** places;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

// ============================================================================
// Text normalization (VAL-RETR-011)
// ============================================================================

/**
 * Conservative normalization for answer support checks. Case-folded,
 * whitespace-collapsed, and stripped of trailing punctuation. This is
 * intentionally limited to avoid semantic drift — semantic equivalence
 * requires a separately-labeled LLM judge.
 */
export function normalizeForAnswerCheck(text: string | null | undefined): string {
  if (text === null || text === undefined) return "";
  return String(text)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[\s.,;:!?]+$/g, "")
    .trim();
}

/**
 * True if `retrieved` text contains the full normalized expected answer.
 * Empty expected answers are NEVER treated as supported (VAL-RETR-011).
 */
export function isAnswerSupported(expectedAnswer: string, retrievedText: string): boolean {
  const expected = normalizeForAnswerCheck(expectedAnswer);
  if (expected.length === 0) return false;
  const retrieved = normalizeForAnswerCheck(retrievedText);
  if (retrieved.length === 0) return false;
  return retrieved.includes(expected);
}

// ============================================================================
// Per-task scoring (VAL-RETR-010)
// ============================================================================

export interface ScoreTaskInput {
  task: NormalizedTask;
  result: AdapterResult;
  k: number;
  lane: BenchmarkLane;
}

export function scoreTask(input: ScoreTaskInput): TaskScore {
  const { task, result } = input;
  const evidenceSet = new Set(task.evidence_spans ?? []);
  const injectedSet = new Set(result.injected);

  // precision@k: fraction of injected that are in evidence_spans
  const truePositives = result.injected.filter((id) => evidenceSet.has(id)).length;
  const injectedCount = result.injected.length;
  const evidenceSpanCount = (task.evidence_spans ?? []).length;
  const precisionAtK = injectedCount > 0 ? truePositives / injectedCount : 0;

  // recall@k: fraction of evidence_spans found in injected
  // Empty evidence_spans with zero injection => recall = 1 (vacuously true).
  // Empty evidence_spans with non-zero injection => recall = 0 (false positives).
  let recallAtK: number;
  if (evidenceSpanCount === 0) {
    recallAtK = injectedCount === 0 ? 1 : 0;
  } else {
    recallAtK = truePositives / evidenceSpanCount;
  }

  // MRR: reciprocal rank of first relevant result in `retrieved`
  let mrr = 0;
  for (let i = 0; i < result.retrieved.length; i++) {
    if (evidenceSet.has(result.retrieved[i].id)) {
      mrr = 1 / (i + 1);
      break;
    }
  }

  // false_positive_rate: injected but not in evidence_spans / injected
  const falsePositives = result.injected.filter((id) => !evidenceSet.has(id)).length;
  const falsePositiveRate = injectedCount > 0 ? falsePositives / injectedCount : 0;

  // answer support: does any retrieved text contain the expected answer
  let answerSupported = false;
  if (task.abstention_correct === true) {
    answerSupported = false; // abstention tasks never claim answer support
  } else if (task.expected_answer.length > 0) {
    answerSupported = result.retrieved.some((r) => isAnswerSupported(task.expected_answer, r.text));
  }

  // abstention correctness: only meaningful when task is labeled
  let abstentionCorrect: boolean | null = null;
  if (task.abstention_correct === true) {
    abstentionCorrect = injectedCount === 0;
  }

  return {
    taskId: task.id,
    taskType: task.task_type,
    lane: input.lane,
    adapterName: result.adapterName,
    status: result.status,
    precisionAtK: round(precisionAtK),
    recallAtK: round(recallAtK),
    mrr: round(mrr),
    falsePositiveRate: round(falsePositiveRate),
    latencyMs: result.latencyMs,
    injectedCount,
    evidenceSpanCount,
    answerSupportedByRetrievedSource: answerSupported,
    abstentionCorrect,
    receipt: result.receipt,
    corpusHash: hashCorpus(task.corpus),
    taskHash: hashTaskIdentity(task),
  };
}

// ============================================================================
// Aggregate metrics (VAL-RETR-010, VAL-RETR-011, VAL-RETR-012, VAL-RETR-013)
// ============================================================================

const PERCENTILE = 0.95;

export function aggregateTaskScores(scores: TaskScore[]): AggregateMetrics {
  // Only completed tasks contribute to ranked-ID metrics.
  const completed = scores.filter((s) => s.status === "ok");
  const failed = scores.filter((s) => s.status !== "ok");
  const n = scores.length;
  const cn = completed.length;
  if (cn === 0) {
    return {
      taskCount: n,
      completedTaskCount: 0,
      failedTaskCount: failed.length,
      incompleteTaskCount: failed.length,
      precisionAtK: 0,
      recallAtK: 0,
      mrr: 0,
      falsePositiveRate: 0,
      answerSupportedRate: 0,
      p95LatencyMs: 0,
      abstentionAccuracy: null,
      abstentionDenominator: null,
      abstentionLabeledCount: 0,
      abstentionAnswerableFailureCount: null,
      contextPackBytes: null,
      contextPackHash: null,
      tokensRetrieval: null,
      tokensRerank: null,
      tokensPack: null,
      tokensJudge: null,
      components: { retrieval: null, rerank: null, pack: null, judge: null },
      laneMetrics: {},
    };
  }

  const sum = (key: keyof Pick<TaskScore, "precisionAtK" | "recallAtK" | "mrr" | "falsePositiveRate">) =>
    completed.reduce((acc, t) => acc + (t[key] ?? 0), 0);

  const precisionAtK = round(sum("precisionAtK") / cn);
  const recallAtK = round(sum("recallAtK") / cn);
  const mrr = round(sum("mrr") / cn);
  const falsePositiveRate = round(sum("falsePositiveRate") / cn);
  const answerSupportedRate = round(
    completed.filter((t) => t.answerSupportedByRetrievedSource).length / cn,
  );

  // p95 retrieval latency (VAL-RETR-012): honest — uses task retrieval latencies only
  const latencies = completed.map((t) => t.latencyMs).sort((a, b) => a - b);
  const p95Index = Math.ceil(latencies.length * PERCENTILE) - 1;
  const p95LatencyMs = latencies[Math.max(0, p95Index)] ?? 0;

  // Abstention accuracy (VAL-RETR-011): only labeled tasks count.
  const abstentionTasks = completed.filter((t) => t.abstentionCorrect !== null);
  const abstentionLabeledCount = abstentionTasks.length;
  const abstentionAccuracy = abstentionLabeledCount > 0
    ? round(abstentionTasks.filter((t) => t.abstentionCorrect === true).length / abstentionLabeledCount)
    : null;
  const abstentionDenominator = abstentionLabeledCount > 0 ? abstentionLabeledCount : null;
  // Failures on answerable tasks (i.e., non-abstention tasks where
  // recall@K === 0) are tracked separately so that abstention failure
  // rates cannot be conflated with answerable failure rates.
  const answerableTasks = completed.filter((t) => t.abstentionCorrect === null);
  const answerableFailures = answerableTasks.filter((t) => t.recallAtK === 0).length;
  const abstentionAnswerableFailureCount = answerableTasks.length > 0 ? answerableFailures : null;

  // Token spend — null if any adapter does not report it (VAL-RETR-012).
  type MetricsLookup = number | string | null;
  const safeMetric = (s: TaskScore, k: string): MetricsLookup => {
    const metrics = s?.receipt?.metrics as unknown as Record<string, MetricsLookup> | undefined;
    return metrics?.[k] ?? null;
  };
  const tokensRetrieval = sumTokens(completed.map((s) => safeMetric(s, "tokensRetrieval")));
  const tokensRerank = sumTokens(completed.map((s) => safeMetric(s, "tokensRerank")));
  const tokensPack = sumTokens(completed.map((s) => safeMetric(s, "tokensPack")));
  const tokensJudge = sumTokens(completed.map((s) => safeMetric(s, "tokensJudge")));

  // Context pack bytes: canonical pack size (first non-null wins, all must agree)
  const contextPackBytes = firstNonNull(completed.map((s) => safeMetric(s, "contextPackBytes") as number | null));
  const contextPackHash = firstNonNullString(completed.map((s) => safeMetric(s, "contextPackHash") as string | null));

  return {
    taskCount: n,
    completedTaskCount: cn,
    failedTaskCount: failed.length,
    incompleteTaskCount: failed.length,
    precisionAtK,
    recallAtK,
    mrr,
    falsePositiveRate,
    answerSupportedRate,
    p95LatencyMs,
    abstentionAccuracy,
    abstentionDenominator,
    abstentionLabeledCount,
    abstentionAnswerableFailureCount,
    contextPackBytes,
    contextPackHash,
    tokensRetrieval,
    tokensRerank,
    tokensPack,
    tokensJudge,
    components: {
      retrieval: tokensRetrieval,
      rerank: tokensRerank,
      pack: tokensPack,
      judge: tokensJudge,
    },
    laneMetrics: {}, // populated by the runner per-lane
  };
}

function sumTokens(values: Array<number | string | null>): number | null {
  let total = 0;
  let sawNull = false;
  for (const v of values) {
    if (v === null || v === undefined) {
      sawNull = true;
      continue;
    }
    if (typeof v !== "number") {
      sawNull = true;
      continue;
    }
    total += v;
  }
  return sawNull ? null : total;
}

function firstNonNull(values: Array<number | null>): number | null {
  for (const v of values) {
    if (v !== null && v !== undefined) return v;
  }
  return null;
}

function firstNonNullString(values: Array<string | null>): string | null {
  for (const v of values) {
    if (v !== null && v !== undefined) return v;
  }
  return null;
}

// ============================================================================
// Per-lane aggregates (VAL-RETR-008)
// ============================================================================

export function aggregateByLane(scores: TaskScore[]): Record<string, AggregateMetrics | null> {
  const out: Record<string, AggregateMetrics | null> = {};
  const lanes = new Set(scores.map((s) => s.lane));
  for (const lane of lanes) {
    const laneScores = scores.filter((s) => s.lane === lane);
    out[lane] = laneScores.length === 0 ? null : aggregateTaskScores(laneScores);
  }
  return out;
}

// ============================================================================
// Default task -> lane resolution
// ============================================================================

export function resolveLane(task: NormalizedTask): BenchmarkLane {
  return DATASET_TO_LANE[task.dataset];
}

// ============================================================================
// Stable report identity hashes (VAL-RETR-013)
// ============================================================================

export function hashConfig(input: {
  dataset: string;
  adapter: string;
  k: number;
  rerankEnabled: boolean;
  judgeEnabled: boolean;
  providerFlags: Record<string, boolean>;
  seed: number;
}): string {
  const canonical = JSON.stringify({
    dataset: input.dataset,
    adapter: input.adapter,
    k: input.k,
    rerankEnabled: input.rerankEnabled,
    judgeEnabled: input.judgeEnabled,
    providerFlags: sortObject(input.providerFlags),
    seed: input.seed,
  });
  return "sha256:" + crypto.createHash("sha256").update(canonical).digest("hex");
}

function sortObject(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).sort(([a], [b]) => a.localeCompare(b)),
  );
}

// ============================================================================
// Re-export of types
// ============================================================================

export type { TaskScore, AggregateMetrics, NormalizedTask, AdapterReceipt, TaskType };
