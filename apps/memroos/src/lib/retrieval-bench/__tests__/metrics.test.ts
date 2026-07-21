/**
 * Ranked-ID metrics, abstention/answer scoring, and aggregate tests
 * (VAL-RETR-010, VAL-RETR-011, VAL-RETR-012, VAL-RETR-013).
 */
import { describe, expect, it } from "vitest";
import {
  aggregateByLane,
  aggregateTaskScores,
  hashConfig,
  isAnswerSupported,
  isLatencyAttributionReconciled,
  measured,
  normalizeForAnswerCheck,
  resolveLane,
  scoreTask,
} from "../metrics";
import type { AdapterResult, NormalizedTask } from "../schema";

function makeTask(overrides: Partial<NormalizedTask> = {}): NormalizedTask {
  return {
    id: "task-1",
    dataset: "memroos_public_synthetic",
    task_type: "single_hop",
    corpus: [
      { id: "mem-1", text: "On 2026-03-15 the team chose Qdrant Cloud." },
      { id: "mem-2", text: "Local Qdrant was not added." },
    ],
    question: "Which vector store was chosen?",
    expected_answer: "Qdrant Cloud",
    evidence_spans: ["mem-1"],
    license: "MIT",
    citation: "MemroOS internal synthetic benchmark",
    provenance: {
      dataset: "memroos_public_synthetic",
      sourceCitation: "MemroOS internal synthetic benchmark",
      sourceLicense: "MIT",
      sourceAvailability: "synthetic",
    },
    ...overrides,
  };
}

function makeResult(overrides: Partial<AdapterResult> = {}): AdapterResult {
  return {
    taskId: "task-1",
    adapterName: "lexical",
    status: "ok",
    retrieved: [],
    injected: [],
    ignored: [],
    latencyMs: 0,
    receipt: {
      adapterName: "lexical",
      adapterVersion: "v1",
      status: "ok",
      latencyMs: 0,
      authorization: { evaluated: false, allowed: true },
      provenance: {
        provider: null,
        providerVersion: null,
        retrievalPolicyVersion: "v1",
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
    ...overrides,
  };
}

describe("retrieval-bench metrics (VAL-RETR-010)", () => {
  it("scores perfect recall, precision, MRR when injected == evidence_spans", () => {
    const task = makeTask();
    const result = makeResult({
      injected: ["mem-1"],
      retrieved: [{ id: "mem-1", score: 1, text: task.corpus[0].text, tier: "lexical", source: "corpus", authorizationResult: "allowed", whyEntered: "ok", rankPosition: 1 }],
    });
    const score = scoreTask({ task, result, k: 1, lane: "external_retrieval" });
    expect(score.precisionAtK).toBe(1);
    expect(score.recallAtK).toBe(1);
    expect(score.mrr).toBe(1);
    expect(score.falsePositiveRate).toBe(0);
  });

  it("scores MRR correctly when first result is irrelevant", () => {
    const task = makeTask();
    const result = makeResult({
      injected: ["mem-1"],
      retrieved: [
        { id: "mem-2", score: 1, text: task.corpus[1].text, tier: "lexical", source: "corpus", authorizationResult: "allowed", whyEntered: "ok", rankPosition: 1 },
        { id: "mem-1", score: 1, text: task.corpus[0].text, tier: "lexical", source: "corpus", authorizationResult: "allowed", whyEntered: "ok", rankPosition: 2 },
      ],
    });
    const score = scoreTask({ task, result, k: 2, lane: "external_retrieval" });
    expect(score.mrr).toBe(0.5);
  });

  it("handles multi-hop evidence (multiple evidence spans)", () => {
    const task = makeTask({
      evidence_spans: ["mem-1", "mem-2"],
    });
    const result = makeResult({
      injected: ["mem-1", "mem-2"],
      retrieved: [
        { id: "mem-1", score: 1, text: "a", tier: "lexical", source: "corpus", authorizationResult: "allowed", whyEntered: "ok", rankPosition: 1 },
        { id: "mem-2", score: 1, text: "b", tier: "lexical", source: "corpus", authorizationResult: "allowed", whyEntered: "ok", rankPosition: 2 },
      ],
    });
    const score = scoreTask({ task, result, k: 2, lane: "external_retrieval" });
    expect(score.recallAtK).toBe(1);
    expect(score.precisionAtK).toBe(1);
  });

  it("counts duplicate relevant and irrelevant injected IDs once", () => {
    const task = makeTask();
    const result = makeResult({
      injected: ["mem-1", "mem-1", "mem-2", "mem-2"],
    });
    const score = scoreTask({ task, result, k: 4, lane: "external_retrieval" });

    expect(score.injectedCount).toBe(2);
    expect(score.evidenceSpanCount).toBe(1);
    expect(score.precisionAtK).toBe(0.5);
    expect(score.recallAtK).toBe(1);
    expect(score.falsePositiveRate).toBe(0.5);
  });

  it("counts duplicate evidence IDs once at the scorer boundary", () => {
    const task = makeTask({
      evidence_spans: ["mem-1", "mem-1", "mem-2", "mem-2"],
    });
    const result = makeResult({
      injected: ["mem-1", "mem-1"],
    });
    const score = scoreTask({ task, result, k: 2, lane: "external_retrieval" });

    expect(score.injectedCount).toBe(1);
    expect(score.evidenceSpanCount).toBe(2);
    expect(score.precisionAtK).toBe(1);
    expect(score.recallAtK).toBe(0.5);
    expect(score.falsePositiveRate).toBe(0);
  });

  it("uses first-occurrence unique retrieved IDs to calculate MRR", () => {
    const task = makeTask();
    const result = makeResult({
      injected: ["mem-1"],
      retrieved: [
        { id: "mem-2", score: 1, text: task.corpus[1].text, tier: "lexical", source: "corpus", authorizationResult: "allowed", whyEntered: "ok", rankPosition: 1 },
        { id: "mem-2", score: 0.9, text: task.corpus[1].text, tier: "lexical", source: "corpus", authorizationResult: "allowed", whyEntered: "duplicate", rankPosition: 2 },
        { id: "mem-1", score: 0.8, text: task.corpus[0].text, tier: "lexical", source: "corpus", authorizationResult: "allowed", whyEntered: "ok", rankPosition: 3 },
        { id: "mem-1", score: 0.7, text: task.corpus[0].text, tier: "lexical", source: "corpus", authorizationResult: "allowed", whyEntered: "duplicate", rankPosition: 4 },
      ],
    });
    const score = scoreTask({ task, result, k: 4, lane: "external_retrieval" });

    expect(score.mrr).toBe(0.5);
  });

  it("bounds task and aggregate ranked metrics despite duplicate scorer inputs", () => {
    const duplicateScore = scoreTask({
      task: makeTask({ evidence_spans: ["mem-1", "mem-1"] }),
      result: makeResult({ injected: ["mem-1", "mem-1", "mem-2", "mem-2"] }),
      k: 4,
      lane: "external_retrieval",
    });
    const emptyScore = scoreTask({
      task: makeTask({ id: "task-empty", evidence_spans: [] }),
      result: makeResult({ taskId: "task-empty", injected: ["mem-2", "mem-2"] }),
      k: 2,
      lane: "external_retrieval",
    });
    const aggregate = aggregateTaskScores([duplicateScore, emptyScore]);

    for (const score of [duplicateScore, emptyScore]) {
      for (const metric of [
        score.precisionAtK,
        score.recallAtK,
        score.mrr,
        score.falsePositiveRate,
      ]) {
        expect(metric).toBeGreaterThanOrEqual(0);
        expect(metric).toBeLessThanOrEqual(1);
      }
    }
    for (const metric of [
      aggregate.precisionAtK,
      aggregate.recallAtK,
      aggregate.mrr,
      aggregate.falsePositiveRate,
    ]) {
      expect(metric).toBeGreaterThanOrEqual(0);
      expect(metric).toBeLessThanOrEqual(1);
    }
  });

  it("treats empty evidence_spans + empty injection as recall=1 (vacuous)", () => {
    const task = makeTask({ evidence_spans: [] });
    const result = makeResult({ injected: [] });
    const score = scoreTask({ task, result, k: 1, lane: "external_retrieval" });
    expect(score.recallAtK).toBe(1);
  });

  it("treats empty evidence_spans + non-empty injection as recall=0 (false positives)", () => {
    const task = makeTask({ evidence_spans: [] });
    const result = makeResult({ injected: ["mem-1"] });
    const score = scoreTask({ task, result, k: 1, lane: "external_retrieval" });
    expect(score.recallAtK).toBe(0);
    expect(score.falsePositiveRate).toBe(1);
  });

  it("never counts an empty expected answer as supported (VAL-RETR-011)", () => {
    expect(isAnswerSupported("", "anything")).toBe(false);
    expect(isAnswerSupported(null, "anything")).toBe(false);
    expect(isAnswerSupported(undefined, "anything")).toBe(false);
  });

  it("answer support requires full normalized containment", () => {
    expect(isAnswerSupported("Qdrant Cloud", "We chose Qdrant Cloud today.")).toBe(true);
    expect(isAnswerSupported("Qdrant Cloud", "We chose Qdrant.")).toBe(false);
  });

  it("abstention_correct task is never scored as answerSupported", () => {
    const task = makeTask({
      abstention_correct: true,
      evidence_spans: [],
      expected_answer: "Should not say the API key value.",
    });
    const result = makeResult({
      injected: ["mem-1"],
      retrieved: [
        { id: "mem-1", score: 1, text: "API key is in env.", tier: "lexical", source: "corpus", authorizationResult: "allowed", whyEntered: "ok", rankPosition: 1 },
      ],
    });
    const score = scoreTask({ task, result, k: 1, lane: "external_retrieval" });
    expect(score.answerSupportedByRetrievedSource).toBe(false);
  });

  it("abstention_correct is null when task is not labeled", () => {
    const task = makeTask();
    const result = makeResult({ injected: ["mem-1"], retrieved: [] });
    const score = scoreTask({ task, result, k: 1, lane: "external_retrieval" });
    expect(score.abstentionCorrect).toBeNull();
  });

  it("abstention_correct is true only when labeled task has zero injection", () => {
    const task = makeTask({ abstention_correct: true, evidence_spans: [] });
    const okResult = makeResult({ injected: [] });
    const score = scoreTask({ task, result: okResult, k: 1, lane: "external_retrieval" });
    expect(score.abstentionCorrect).toBe(true);
  });

  it("p95 latency uses task retrieval latencies only (VAL-RETR-012)", () => {
    const tasks = Array.from({ length: 20 }, (_, i) => makeTask({ id: `task-${i}` }));
    const scores = tasks.map((t, i) =>
      scoreTask({
        task: t,
        result: makeResult({ latencyMs: i, injected: ["mem-1"], retrieved: [] }),
        k: 1,
        lane: "external_retrieval",
      }),
    );
    const agg = aggregateTaskScores(scores);
    // 95th percentile of 0..19 sorted ascending (length 20): p95Index = ceil(20*0.95)-1 = 18, latencies[18] = 18
    expect(agg.p95LatencyMs).toBe(18);
    expect(agg.p50LatencyMs).toBe(9);
  });

  it("token spend is null when any task omits it (VAL-RETR-012 honest)", () => {
    const tasks = Array.from({ length: 3 }, (_, i) => makeTask({ id: `task-${i}` }));
    const scores = tasks.map((t, i) => {
      const r = makeResult({ injected: ["mem-1"], retrieved: [], latencyMs: 1 });
      r.receipt.metrics.tokensRetrieval = i === 0 ? 100 : null;
      return scoreTask({ task: t, result: r, k: 1, lane: "external_retrieval" });
    });
    const agg = aggregateTaskScores(scores);
    expect(agg.tokensRetrieval).toBeNull();
    expect(agg.tokenAccounting.retrieval).toEqual({
      status: "unavailable",
      value: null,
      reason: "tokensRetrieval was not reported by every completed task",
    });
  });

  it("token spend is summed when all tasks report it", () => {
    const tasks = Array.from({ length: 3 }, (_, i) => makeTask({ id: `task-${i}` }));
    const scores = tasks.map((t, i) => {
      const r = makeResult({ injected: ["mem-1"], retrieved: [], latencyMs: 1 });
      r.receipt.metrics.tokensRetrieval = 10 + i;
      return scoreTask({ task: t, result: r, k: 1, lane: "external_retrieval" });
    });
    const agg = aggregateTaskScores(scores);
    expect(agg.tokensRetrieval).toBe(33);
  });

  it("exports measured dependency timing only when every task reports it", () => {
    const scores = Array.from({ length: 2 }, (_, i) => {
      const result = makeResult({ injected: ["mem-1"], latencyMs: 1 });
      result.receipt.metrics.dependencyTimingMs = {
        qdrantMs: measured(0), neo4jMs: measured(0), ollamaMs: measured(0), llmMs: measured(0),
        sqliteQueueMs: measured(2 + i), applicationCpuMs: measured(3), applicationHeapMs: measured(0), unknownMs: measured(1),
      };
      return scoreTask({ task: makeTask({ id: `dependency-${i}` }), result, k: 1, lane: "external_retrieval" });
    });
    const aggregate = aggregateTaskScores(scores);
    expect(aggregate.dependencyTiming.sqliteQueueMs).toEqual({ status: "measured", value: 5, reason: null });
    expect(aggregate.dependencyTiming.qdrantMs).toEqual({ status: "measured", value: 0, reason: null });
  });

  it("reconciles attribution with the larger of five milliseconds or ten percent", () => {
    expect(isLatencyAttributionReconciled({
      endToEndMs: 100,
      componentTimes: { applicationCpuMs: measured(60), sqliteQueueMs: measured(30), unknownMs: measured(5) },
    })).toBe(true);
    expect(isLatencyAttributionReconciled({
      endToEndMs: 100,
      componentTimes: { applicationCpuMs: measured(60), sqliteQueueMs: measured(20), unknownMs: measured(5) },
    })).toBe(false);
  });

  it("incomplete tasks do not pollute ranked-ID aggregates", () => {
    const tasks = Array.from({ length: 3 }, (_, i) => makeTask({ id: `task-${i}` }));
    const scores = tasks.map((t, i) => {
      const status = i === 0 ? "ok" : "provider_failed";
      return scoreTask({
        task: t,
        result: makeResult({
          status: status as "ok" | "provider_failed",
          injected: ["mem-1"],
          retrieved: [
            { id: "mem-1", score: 1, text: "x", tier: "lexical", source: "corpus", authorizationResult: "allowed", whyEntered: "ok", rankPosition: 1 },
          ],
        }),
        k: 1,
        lane: "external_retrieval",
      });
    });
    const agg = aggregateTaskScores(scores);
    expect(agg.completedTaskCount).toBe(1);
    expect(agg.failedTaskCount).toBe(2);
    expect(agg.precisionAtK).toBe(1);
    expect(agg.recallAtK).toBe(1);
  });

  it("hashConfig is stable for equivalent inputs", () => {
    const a = hashConfig({ dataset: "locomo", adapter: "lexical", k: 3, rerankEnabled: false, judgeEnabled: false, providerFlags: { embedding: false }, seed: 0 });
    const b = hashConfig({ dataset: "locomo", adapter: "lexical", k: 3, rerankEnabled: false, judgeEnabled: false, providerFlags: { embedding: false }, seed: 0 });
    expect(a).toBe(b);
  });

  it("aggregateByLane partitions correctly", () => {
    const tasks = Array.from({ length: 3 }, (_, i) => makeTask({ id: `task-${i}` }));
    const scores = tasks.map((t, i) =>
      scoreTask({
        task: t,
        result: makeResult({ injected: ["mem-1"], latencyMs: 1 }),
        k: 1,
        lane: i === 0 ? "external_retrieval" : "operational_workflow",
      }),
    );
    const byLane = aggregateByLane(scores);
    expect(byLane.external_retrieval?.taskCount).toBe(1);
    expect(byLane.operational_workflow?.taskCount).toBe(2);
  });

  it("resolveLane maps dataset -> lane", () => {
    expect(resolveLane(makeTask({ dataset: "locomo" }))).toBe("external_retrieval");
    expect(resolveLane(makeTask({ dataset: "memroos_public_synthetic" }))).toBe("external_retrieval");
  });

  it("normalizeForAnswerCheck strips trailing punctuation", () => {
    expect(normalizeForAnswerCheck("Qdrant Cloud.")).toBe("qdrant cloud");
    expect(normalizeForAnswerCheck("  Qdrant   Cloud  !! ")).toBe("qdrant cloud");
  });
});
