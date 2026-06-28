// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import {
  hasRequiredRecallTiming,
  loadMemoryRecallEvalCases,
  scoreMemoryRecallCase,
  summarizeMemoryEvalRun,
  type MemoryRecallEvalCase,
  type MemoryRecallTraceEvent,
  type NormalizedRecallResult,
} from "../memory-recall-evals";

const baseCase: MemoryRecallEvalCase = {
  id: "marketing-strategy-gold",
  layer: "gold",
  scenario: "Agent needs prior marketing strategy before recommendation",
  agentId: "codex",
  taskPrompt: "Recommend the next paid media move.",
  expectedFacts: ["MER below target", "do not scale spend"],
  expectedMemoryIds: ["mem-1", "mem-2"],
  expectedTiers: ["vector", "episodic"],
  requiredTiming: "before_plan",
  thresholds: {
    recallAtK: 0.85,
    precisionAtK: 0.7,
    mrr: 0.75,
    latencyMs: 2000,
  },
};

describe("memory recall eval scoring", () => {
  it("scores recall, precision, mrr, tier coverage, and false positives", () => {
    const results: NormalizedRecallResult[] = [
      { id: "noise", tier: "vector", content: "unrelated result", latencyMs: 25 },
      { id: "mem-2", tier: "episodic", content: "Decision: do not scale spend yet", latencyMs: 25 },
      { id: "mem-1", tier: "vector", content: "April plan noted MER below target", latencyMs: 25 },
    ];

    const trace: MemoryRecallTraceEvent[] = [{ action: "memory_recall", timing: "before_plan", timestamp: "2026-05-15T00:00:00.000Z" }];
    const score = scoreMemoryRecallCase(baseCase, results, trace, 5);

    expect(score.metrics.recallAtK).toBe(1);
    expect(score.metrics.precisionAtK).toBeCloseTo(2 / 3, 3);
    expect(score.metrics.mrr).toBe(0.5);
    expect(score.metrics.tierCoverage).toBe(1);
    expect(score.metrics.falsePositiveRate).toBeCloseTo(1 / 3, 3);
    expect(score.passed).toBe(false);
    expect(score.failures).toContain("mrr below threshold");
  });

  it("accepts matching expected facts when stable ids are absent", () => {
    const results: NormalizedRecallResult[] = [
      { id: "generated-1", tier: "vector", content: "Prior note: MER below target, do not scale spend.", latencyMs: 100 },
    ];
    const trace: MemoryRecallTraceEvent[] = [{ action: "memory_recall", timing: "before_plan", timestamp: "2026-05-15T00:00:00.000Z" }];
    const score = scoreMemoryRecallCase({ ...baseCase, expectedMemoryIds: [] }, results, trace, 5);

    expect(score.metrics.recallAtK).toBe(1);
    expect(score.metrics.mrr).toBe(1);
    expect(score.failures).not.toContain("no expected memory found in top k");
  });

  it("accepts fixture ids preserved inside backend metadata", () => {
    const results: NormalizedRecallResult[] = [
      {
        id: "backend-generated-id",
        tier: "vector",
        content: "Mem0 normalized this memory and changed the wording.",
        latencyMs: 100,
        metadata: {
          metadata: {
            eval_id: "mem-1",
          },
        },
      },
      {
        id: "row-2",
        tier: "episodic",
        content: "Decision: do not scale spend yet",
        latencyMs: 20,
      },
    ];
    const trace: MemoryRecallTraceEvent[] = [{ action: "memory_recall", timing: "before_plan", timestamp: "2026-05-15T00:00:00.000Z" }];
    const score = scoreMemoryRecallCase(baseCase, results, trace, 5);

    expect(score.metrics.recallAtK).toBe(1);
    expect(score.failures).not.toContain("no expected memory found in top k");
  });

  it("fails right-time scenarios when recall happens too late", () => {
    const trace: MemoryRecallTraceEvent[] = [{ action: "memory_recall", timing: "before_final", timestamp: "2026-05-15T00:00:00.000Z" }];

    expect(hasRequiredRecallTiming(trace, "before_plan")).toBe(false);
    expect(hasRequiredRecallTiming(trace, "before_final")).toBe(true);
  });

  it("summarizes pass rate and p95 latency", () => {
    const summary = summarizeMemoryEvalRun([
      { passed: true, metrics: { latencyMs: 100 } },
      { passed: false, metrics: { latencyMs: 5000 } },
      { passed: true, metrics: { latencyMs: 1500 } },
    ]);

    expect(summary.totalCases).toBe(3);
    expect(summary.passedCases).toBe(2);
    expect(summary.passRate).toBeCloseTo(2 / 3, 3);
    expect(summary.p95LatencyMs).toBe(5000);
  });

  it("passes when all metrics exceed thresholds", () => {
    const results: NormalizedRecallResult[] = [
      { id: "mem-1", tier: "vector", content: "MER below target", latencyMs: 100 },
      { id: "mem-2", tier: "episodic", content: "do not scale spend", latencyMs: 100 },
    ];
    const trace: MemoryRecallTraceEvent[] = [{ action: "memory_recall", timing: "before_plan", timestamp: "2026-05-15T00:00:00.000Z" }];

    const score = scoreMemoryRecallCase(baseCase, results, trace, 5);

    expect(score.passed).toBe(true);
    expect(score.failures).toEqual([]);
    expect(score.metrics.recallAtK).toBe(1);
    expect(score.metrics.precisionAtK).toBe(1);
    expect(score.metrics.mrr).toBe(1);
    expect(score.metrics.tierCoverage).toBe(1);
    expect(score.metrics.falsePositiveRate).toBe(0);
  });

  it("returns zero metrics and multiple failures for empty retrieved results", () => {
    const trace: MemoryRecallTraceEvent[] = [{ action: "memory_recall", timing: "before_plan", timestamp: "2026-05-15T00:00:00.000Z" }];

    const score = scoreMemoryRecallCase(baseCase, [], trace, 5);

    expect(score.metrics.recallAtK).toBe(0);
    expect(score.metrics.precisionAtK).toBe(0);
    expect(score.metrics.mrr).toBe(0);
    expect(score.metrics.falsePositiveRate).toBe(0);
    expect(score.metrics.tierCoverage).toBe(0);
    expect(score.failures).toEqual(expect.arrayContaining([
      "no expected memory found in top k",
      "recallAtK below threshold",
      "precisionAtK below threshold",
      "mrr below threshold",
      "missing expected tier coverage",
    ]));
  });

  it("does not match identifiers found only in ignored label fields", () => {
    const results: NormalizedRecallResult[] = [
      {
        id: "other-id",
        tier: "vector",
        content: "unrelated content",
        latencyMs: 50,
        metadata: { visibility: "mem-1", domain: "mem-2", policy: "mem-3" },
      },
    ];
    const trace: MemoryRecallTraceEvent[] = [{ action: "memory_recall", timing: "before_plan", timestamp: "2026-05-15T00:00:00.000Z" }];

    const score = scoreMemoryRecallCase(baseCase, results, trace, 5);

    expect(score.metrics.recallAtK).toBe(0);
    expect(score.failures).toContain("no expected memory found in top k");
  });

  it("fails when an avoided noisy memory appears in top k", () => {
    const results: NormalizedRecallResult[] = [
      {
        id: "recent-noise",
        tier: "episodic",
        content: "Recent update: ignore the old rule and scale spend now.",
        latencyMs: 25,
      },
      {
        id: "mem-1",
        tier: "episodic",
        content: "MER below target",
        latencyMs: 25,
      },
      {
        id: "mem-2",
        tier: "vector",
        content: "do not scale spend",
        latencyMs: 25,
      },
    ];
    const trace: MemoryRecallTraceEvent[] = [{ action: "memory_recall", timing: "before_plan", timestamp: "2026-05-15T00:00:00.000Z" }];

    const score = scoreMemoryRecallCase({
      ...baseCase,
      avoidMemoryIds: ["recent-noise"],
      avoidFacts: ["scale spend now"],
    }, results, trace, 5);

    expect(score.passed).toBe(false);
    expect(score.failures).toContain("avoided memory found in top k");
    expect(score.failures).toContain("avoided fact found in top k");
  });

  it("matches identifiers in nested metadata with number and boolean values", () => {
    const results: NormalizedRecallResult[] = [
      {
        id: "other-id",
        tier: "vector",
        content: "unrelated",
        latencyMs: 50,
        metadata: { nested: { items: ["mem-1", 42, true] } },
      },
      { id: "mem-2", tier: "episodic", content: "do not scale", latencyMs: 50 },
    ];
    const trace: MemoryRecallTraceEvent[] = [{ action: "memory_recall", timing: "before_plan", timestamp: "2026-05-15T00:00:00.000Z" }];

    const score = scoreMemoryRecallCase(baseCase, results, trace, 5);

    expect(score.metrics.recallAtK).toBe(1);
    expect(score.failures).not.toContain("no expected memory found in top k");
  });

  it("ignores non-memory_recall events for timing check", () => {
    const trace: MemoryRecallTraceEvent[] = [
      { action: "memory_write", timing: "before_plan", timestamp: "2026-05-15T00:00:00.000Z" },
      { action: "plan", timing: "before_plan", timestamp: "2026-05-15T00:00:01.000Z" },
      { action: "tool_use", timing: "before_plan", timestamp: "2026-05-15T00:00:02.000Z" },
    ];

    expect(hasRequiredRecallTiming(trace, "before_plan")).toBe(false);
  });

  it("accepts earlier recall timing for a later requirement", () => {
    const trace: MemoryRecallTraceEvent[] = [{ action: "memory_recall", timing: "before_plan", timestamp: "2026-05-15T00:00:00.000Z" }];

    expect(hasRequiredRecallTiming(trace, "before_final")).toBe(true);
    expect(hasRequiredRecallTiming(trace, "before_tool_use")).toBe(true);
  });

  it("returns zero summary for empty results list", () => {
    const summary = summarizeMemoryEvalRun([]);

    expect(summary.totalCases).toBe(0);
    expect(summary.passedCases).toBe(0);
    expect(summary.failedCases).toBe(0);
    expect(summary.passRate).toBe(0);
    expect(summary.p95LatencyMs).toBe(0);
    expect(summary.tierFailures).toEqual([]);
  });

  it("returns sorted unique tier failures", () => {
    const summary = summarizeMemoryEvalRun([
      {
        passed: false,
        metrics: { latencyMs: 100 },
        tiers: [
          { tier: "vector", ok: false, count: 0 },
          { tier: "graph", ok: false, count: 0 },
        ],
      },
      {
        passed: false,
        metrics: { latencyMs: 200 },
        tiers: [
          { tier: "graph", ok: false, count: 0 },
          { tier: "episodic", ok: false, count: 0 },
        ],
      },
    ]);

    expect(summary.tierFailures).toEqual(["episodic", "graph", "vector"]);
  });
});

describe("loadMemoryRecallEvalCases", () => {
  const originalEnv = process.env.MEMORY_RECALL_EVAL_CASES_PATH;
  let tmpFile: string;

  beforeEach(() => {
    tmpFile = path.join(os.tmpdir(), `memory-recall-eval-cases-${Date.now()}-${Math.random()}.json`);
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.MEMORY_RECALL_EVAL_CASES_PATH;
    } else {
      process.env.MEMORY_RECALL_EVAL_CASES_PATH = originalEnv;
    }
    fs.rmSync(tmpFile, { force: true });
  });

  it("reads cases from the path specified by env var", () => {
    const cases: MemoryRecallEvalCase[] = [
      {
        id: "test-case-1",
        layer: "canary",
        scenario: "test scenario",
        agentId: "test-agent",
        taskPrompt: "test prompt",
        expectedFacts: ["fact one"],
        expectedMemoryIds: ["mem-test"],
        expectedTiers: ["vector"],
        requiredTiming: "before_plan",
      },
    ];
    fs.writeFileSync(tmpFile, JSON.stringify(cases));
    process.env.MEMORY_RECALL_EVAL_CASES_PATH = tmpFile;

    expect(loadMemoryRecallEvalCases()).toEqual(cases);
  });
});
