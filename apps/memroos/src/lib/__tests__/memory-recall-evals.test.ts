// @vitest-environment node
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { initSchema } from "../db-schema";
import {
  ensureMemoryEvalTables,
  getLatestMemoryEvalRun,
  hasRequiredRecallTiming,
  loadMemoryRecallEvalCases,
  memoryEvalRunToAgentTrace,
  runMemoryRecallEvalSuite,
  scoreMemoryRecallCase,
  summarizeMemoryEvalRun,
  type MemoryEvalRun,
  type MemoryRecallEvalCase,
  type MemoryRecallTraceEvent,
  type NormalizedRecallResult,
} from "../memory/recall-evals";

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

  it("fails when latency exceeds the configured threshold", () => {
    const results: NormalizedRecallResult[] = [
      { id: "mem-1", tier: "vector", content: "MER below target", latencyMs: 9000 },
      { id: "mem-2", tier: "episodic", content: "do not scale spend", latencyMs: 9000 },
    ];
    const trace: MemoryRecallTraceEvent[] = [{ action: "memory_recall", timing: "before_plan", timestamp: "2026-05-15T00:00:00.000Z" }];

    const score = scoreMemoryRecallCase(baseCase, results, trace, 5);

    expect(score.failures).toContain("latency above threshold");
    expect(score.metrics.latencyMs).toBe(9000);
  });

  it("fails when recall timing is missing from the trace", () => {
    const results: NormalizedRecallResult[] = [
      { id: "mem-1", tier: "vector", content: "MER below target", latencyMs: 100 },
      { id: "mem-2", tier: "episodic", content: "do not scale spend", latencyMs: 100 },
    ];
    const trace: MemoryRecallTraceEvent[] = [{ action: "plan", timing: "before_plan", timestamp: "2026-05-15T00:00:00.000Z" }];

    const score = scoreMemoryRecallCase(baseCase, results, trace, 5);

    expect(score.failures).toContain("memory recall happened too late or not at all");
  });

  it("fails when expected tier coverage is incomplete", () => {
    const results: NormalizedRecallResult[] = [
      { id: "mem-1", tier: "vector", content: "MER below target", latencyMs: 100 },
      { id: "mem-2", tier: "vector", content: "do not scale spend", latencyMs: 100 },
    ];
    const trace: MemoryRecallTraceEvent[] = [{ action: "memory_recall", timing: "before_plan", timestamp: "2026-05-15T00:00:00.000Z" }];

    const score = scoreMemoryRecallCase(baseCase, results, trace, 5);

    expect(score.metrics.tierCoverage).toBe(0.5);
    expect(score.failures).toContain("missing expected tier coverage");
  });

  it("caps metadata search depth to avoid runaway nested scans", () => {
    const deep: Record<string, unknown> = { level: 0 };
    let node: Record<string, unknown> = deep;
    for (let i = 1; i <= 8; i += 1) {
      const next: Record<string, unknown> = { level: i, eval_id: i === 7 ? "mem-1" : undefined };
      node.child = next;
      node = next;
    }

    const results: NormalizedRecallResult[] = [
      {
        id: "deep",
        tier: "vector",
        content: "unrelated",
        latencyMs: 50,
        metadata: deep,
      },
    ];
    const trace: MemoryRecallTraceEvent[] = [{ action: "memory_recall", timing: "before_plan", timestamp: "2026-05-15T00:00:00.000Z" }];

    const score = scoreMemoryRecallCase({
      ...baseCase,
      expectedMemoryIds: ["mem-1"],
      expectedFacts: ["mem-1"],
      expectedTiers: ["vector"],
    }, results, trace, 5);

    expect(score.metrics.recallAtK).toBe(0);
    expect(score.failures).toContain("no expected memory found in top k");
  });

  it("uses fact-only expected count when memory ids are absent", () => {
    const results: NormalizedRecallResult[] = [
      { id: "generated", tier: "vector", content: "MER below target only", latencyMs: 50 },
    ];
    const trace: MemoryRecallTraceEvent[] = [{ action: "memory_recall", timing: "before_plan", timestamp: "2026-05-15T00:00:00.000Z" }];
    const score = scoreMemoryRecallCase({
      ...baseCase,
      expectedMemoryIds: [],
      expectedFacts: ["MER below target", "do not scale spend"],
      expectedTiers: ["vector"],
    }, results, trace, 5);

    expect(score.metrics.recallAtK).toBe(0.5);
    expect(score.failures).toContain("recallAtK below threshold");
  });
});

describe("memoryEvalRunToAgentTrace", () => {
  function makeRun(overrides: Partial<MemoryEvalRun> = {}): MemoryEvalRun {
    return {
      id: "memory-eval-test-run",
      mode: "gold",
      status: "passed",
      startedAt: "2026-05-15T00:00:00.000Z",
      completedAt: "2026-05-15T00:00:01.000Z",
      summary: {
        totalCases: 1,
        passedCases: 1,
        failedCases: 0,
        passRate: 1,
        p95LatencyMs: 120,
        tierFailures: [],
      },
      results: [
        {
          caseId: "case-1",
          agentId: "codex",
          layer: "gold",
          scenario: "scenario",
          taskPrompt: "prompt",
          passed: true,
          failures: [],
          metrics: {
            recallAtK: 0.9,
            precisionAtK: 0.8,
            mrr: 0.75,
            latencyMs: 120,
            tierCoverage: 1,
            stalenessHours: null,
            falsePositiveRate: 0.1,
          },
          tiers: [{ tier: "episodic", ok: true, count: 2 }],
          retrieved: [
            { id: "mem-1", tier: "episodic", content: "billing sync decision", latencyMs: 120 },
          ],
          trace: [{ action: "memory_recall", timing: "before_plan", timestamp: "2026-05-15T00:00:00.000Z" }],
        },
      ],
      ...overrides,
    };
  }

  it("maps a passed eval run into an AgentEvalTrace for the eval engine bridge", () => {
    const trace = memoryEvalRunToAgentTrace(makeRun());

    expect(trace.traceId).toBe("memory-eval-bridge-memory-eval-test-run");
    expect(trace.role).toBe("memory-recall");
    expect(trace.memory?.recallAtK).toBe(0.9);
    expect(trace.memory?.precisionAtK).toBe(0.8);
    expect(trace.memory?.mrr).toBe(0.75);
    expect(trace.outcome?.completed).toBe(true);
    expect(trace.outcome?.escalated).toBe(false);
    expect(trace.memory?.retrievedFacts).toContain("billing");
  });

  it("marks failed runs as escalated with conservative metric defaults for empty results", () => {
    const trace = memoryEvalRunToAgentTrace(makeRun({
      status: "failed",
      summary: {
        totalCases: 0,
        passedCases: 0,
        failedCases: 0,
        passRate: 0,
        p95LatencyMs: 0,
        tierFailures: [],
      },
      results: [],
    }));

    expect(trace.outcome?.completed).toBe(false);
    expect(trace.outcome?.escalated).toBe(true);
    expect(trace.memory?.recallAtK).toBe(0.5);
    expect(trace.expectedFacts).toEqual(["memory", "recall"]);
    expect(trace.memory?.retrievedFacts).toEqual(["memory"]);
  });
});

describe("memory eval persistence", () => {
  let db: Database.Database;
  const originalCasesPath = process.env.MEMORY_RECALL_EVAL_CASES_PATH;

  beforeEach(() => {
    db = new Database(":memory:");
    initSchema(db);
    ensureMemoryEvalTables(db);
  });

  afterEach(() => {
    db.close();
    if (originalCasesPath === undefined) {
      delete process.env.MEMORY_RECALL_EVAL_CASES_PATH;
    } else {
      process.env.MEMORY_RECALL_EVAL_CASES_PATH = originalCasesPath;
    }
  });

  it("returns null for the latest run when the table is empty", () => {
    const response = getLatestMemoryEvalRun(db);

    expect(response.ok).toBe(true);
    expect(response.run).toBeNull();
    expect(response.timestamp).toBeTruthy();
  });

  it("persists and reloads the latest eval run", async () => {
    const casesPath = path.join(os.tmpdir(), `memory-recall-persist-${Date.now()}.json`);
    const cases: MemoryRecallEvalCase[] = [
      {
        id: "persist-case",
        layer: "gold",
        scenario: "persist scenario",
        agentId: "codex",
        taskPrompt: "Recall the billing note.",
        expectedFacts: ["billing sync decision"],
        expectedTiers: ["episodic"],
        requiredTiming: "before_plan",
        fixtures: [{ id: "persist-fixture", tier: "episodic", content: "billing sync decision for April" }],
      },
    ];
    fs.writeFileSync(casesPath, JSON.stringify(cases));
    process.env.MEMORY_RECALL_EVAL_CASES_PATH = casesPath;

    const run = await runMemoryRecallEvalSuite({ mode: "gold", db });
    const latest = getLatestMemoryEvalRun(db);

    expect(run.status).toBe("passed");
    expect(latest.run?.id).toBe(run.id);
    expect(latest.run?.results).toHaveLength(1);
    expect(latest.run?.results[0]?.caseId).toBe("persist-case");
    expect(latest.run?.summary.totalCases).toBe(1);

    fs.rmSync(casesPath, { force: true });
  });

  it("filters canary and full modes from the loaded case set", async () => {
    const casesPath = path.join(os.tmpdir(), `memory-recall-modes-${Date.now()}.json`);
    const episodicCase = (id: string, layer: MemoryRecallEvalCase["layer"]): MemoryRecallEvalCase => ({
      id,
      layer,
      scenario: `${layer} scenario`,
      agentId: "codex",
      taskPrompt: "Recall billing context.",
      expectedFacts: ["billing sync decision"],
      expectedTiers: ["episodic"],
      requiredTiming: "before_plan",
      fixtures: [{ id: `${id}-fixture`, tier: "episodic", content: "billing sync decision for April" }],
    });
    fs.writeFileSync(casesPath, JSON.stringify([
      episodicCase("gold-case", "gold"),
      episodicCase("canary-case", "canary"),
      episodicCase("scenario-case", "scenario"),
    ]));
    process.env.MEMORY_RECALL_EVAL_CASES_PATH = casesPath;

    const goldRun = await runMemoryRecallEvalSuite({ mode: "gold", db });
    const canaryRun = await runMemoryRecallEvalSuite({ mode: "canary", db });
    const fullRun = await runMemoryRecallEvalSuite({ mode: "full", db });

    expect(goldRun.results.map((result) => result.caseId)).toEqual(["gold-case"]);
    expect(canaryRun.results.map((result) => result.caseId)).toEqual(["canary-case"]);
    expect(fullRun.results.map((result) => result.caseId)).toEqual(["gold-case", "canary-case", "scenario-case"]);

    fs.rmSync(casesPath, { force: true });
  });

  it("records tier search failures without aborting the suite", async () => {
    const casesPath = path.join(os.tmpdir(), `memory-recall-graph-fail-${Date.now()}.json`);
    const cases: MemoryRecallEvalCase[] = [
      {
        id: "graph-fail-case",
        layer: "gold",
        scenario: "graph tier unavailable",
        agentId: "codex",
        taskPrompt: "Recall billing context.",
        expectedFacts: ["billing sync decision"],
        expectedTiers: ["graph"],
        requiredTiming: "before_plan",
      },
    ];
    fs.writeFileSync(casesPath, JSON.stringify(cases));
    process.env.MEMORY_RECALL_EVAL_CASES_PATH = casesPath;

    const backends = await import("@/lib/memory/backends");
    vi.spyOn(backends, "queryGraphMemory").mockRejectedValue(new Error("graph offline"));

    const run = await runMemoryRecallEvalSuite({ mode: "gold", db });

    expect(run.status).toBe("failed");
    expect(run.results[0]?.failures).toContain("graph tier failed");
    expect(run.results[0]?.tiers).toEqual(expect.arrayContaining([
      expect.objectContaining({ tier: "graph", ok: false, error: "graph offline" }),
    ]));

    vi.restoreAllMocks();
    fs.rmSync(casesPath, { force: true });
  });

  it("skips hive alerting when MEMORY_EVAL_HIVE_ALERTS is disabled", async () => {
    const casesPath = path.join(os.tmpdir(), `memory-recall-no-alert-${Date.now()}.json`);
    const cases: MemoryRecallEvalCase[] = [
      {
        id: "fail-case",
        layer: "gold",
        scenario: "forced graph failure",
        agentId: "codex",
        taskPrompt: "Recall billing context.",
        expectedFacts: ["billing sync decision"],
        expectedTiers: ["graph"],
        requiredTiming: "before_plan",
      },
    ];
    fs.writeFileSync(casesPath, JSON.stringify(cases));
    process.env.MEMORY_RECALL_EVAL_CASES_PATH = casesPath;
    process.env.MEMORY_EVAL_HIVE_ALERTS = "0";

    const backends = await import("@/lib/memory/backends");
    vi.spyOn(backends, "queryGraphMemory").mockRejectedValue(new Error("graph offline"));

    const run = await runMemoryRecallEvalSuite({ mode: "gold", db });

    expect(run.status).toBe("failed");

    delete process.env.MEMORY_EVAL_HIVE_ALERTS;
    vi.restoreAllMocks();
    fs.rmSync(casesPath, { force: true });
  });

  it("records fixture seed failures without aborting the remaining case flow", async () => {
    const casesPath = path.join(os.tmpdir(), `memory-recall-vector-seed-fail-${Date.now()}.json`);
    const cases: MemoryRecallEvalCase[] = [
      {
        id: "vector-seed-fail",
        layer: "gold",
        scenario: "vector write unavailable",
        agentId: "codex",
        taskPrompt: "Recall billing context.",
        expectedFacts: ["billing sync decision"],
        expectedTiers: ["vector", "episodic"],
        requiredTiming: "before_plan",
        fixtures: [{ id: "vector-fixture", tier: "vector", content: "billing sync decision for April" }],
      },
    ];
    fs.writeFileSync(casesPath, JSON.stringify(cases));
    process.env.MEMORY_RECALL_EVAL_CASES_PATH = casesPath;
    process.env.MEMORY_EVAL_VECTOR_SETTLE_TIMEOUT_MS = "50";
    process.env.MEMORY_EVAL_VECTOR_SETTLE_POLL_MS = "10";
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("mem0 down"));

    const run = await runMemoryRecallEvalSuite({ mode: "gold", db });

    expect(run.results[0]?.tiers).toEqual(expect.arrayContaining([
      expect.objectContaining({ tier: "vector", ok: false, error: expect.stringContaining("mem0 down") }),
    ]));

    delete process.env.MEMORY_EVAL_VECTOR_SETTLE_TIMEOUT_MS;
    delete process.env.MEMORY_EVAL_VECTOR_SETTLE_POLL_MS;
    vi.restoreAllMocks();
    fs.rmSync(casesPath, { force: true });
  });

  it("normalizes graph search hits into recall results", async () => {
    const casesPath = path.join(os.tmpdir(), `memory-recall-graph-success-${Date.now()}.json`);
    const cases: MemoryRecallEvalCase[] = [
      {
        id: "graph-success",
        layer: "gold",
        scenario: "graph tier recall",
        agentId: "codex",
        taskPrompt: "Recall billing context.",
        expectedFacts: ["billing sync decision"],
        expectedTiers: ["graph"],
        requiredTiming: "before_plan",
      },
    ];
    fs.writeFileSync(casesPath, JSON.stringify(cases));
    process.env.MEMORY_RECALL_EVAL_CASES_PATH = casesPath;

    const backends = await import("@/lib/memory/backends");
    vi.spyOn(backends, "queryGraphMemory").mockResolvedValue({
      results: [{ memory: "billing sync decision from graph", id: "graph-node-1" }],
    });

    const run = await runMemoryRecallEvalSuite({ mode: "gold", db });

    expect(run.results[0]?.tiers).toEqual(expect.arrayContaining([
      expect.objectContaining({ tier: "graph", ok: true, count: 1 }),
    ]));
    expect(run.results[0]?.retrieved[0]?.content).toContain("billing sync decision");

    vi.restoreAllMocks();
    fs.rmSync(casesPath, { force: true });
  });

  it("posts hive alerts for failed runs when alerting is enabled", async () => {
    const casesPath = path.join(os.tmpdir(), `memory-recall-alert-${Date.now()}.json`);
    fs.writeFileSync(casesPath, JSON.stringify([{
      id: "alert-case",
      layer: "gold",
      scenario: "forced failure",
      agentId: "codex",
      taskPrompt: "Recall billing context.",
      expectedFacts: ["billing sync decision"],
      expectedTiers: ["graph"],
      requiredTiming: "before_plan",
    }]));
    process.env.MEMORY_RECALL_EVAL_CASES_PATH = casesPath;

    const hiveDir = path.join(os.tmpdir(), `hive-alert-${Date.now()}`);
    fs.mkdirSync(hiveDir, { recursive: true });
    const hivePost = path.join(hiveDir, "post.sh");
    fs.writeFileSync(hivePost, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
    const originalHome = process.env.HOME;
    process.env.HOME = hiveDir;
    delete process.env.MEMORY_EVAL_HIVE_ALERTS;

    const backends = await import("@/lib/memory/backends");
    vi.spyOn(backends, "queryGraphMemory").mockRejectedValue(new Error("graph offline"));

    const { runMemoryRecallEvalSuite: runSuite } = await import("../memory/recall-evals");
    const run = await runSuite({ mode: "gold", db });
    expect(run.status).toBe("failed");

    process.env.HOME = originalHome;
    vi.restoreAllMocks();
    fs.rmSync(casesPath, { force: true });
    fs.rmSync(hiveDir, { recursive: true, force: true });
  });

  it("waits for queued vector writes before scoring episodic fixtures", async () => {
    const casesPath = path.join(os.tmpdir(), `memory-recall-queued-${Date.now()}.json`);
    fs.writeFileSync(casesPath, JSON.stringify([{
      id: "queued-vector",
      layer: "gold",
      scenario: "queued vector write",
      agentId: "codex",
      taskPrompt: "Recall billing context.",
      expectedFacts: ["billing sync decision"],
      expectedTiers: ["vector"],
      requiredTiming: "before_plan",
      fixtures: [{ id: "queued-fixture", tier: "vector", content: "billing sync decision for April" }],
    }]));
    process.env.MEMORY_RECALL_EVAL_CASES_PATH = casesPath;
    process.env.MEMORY_EVAL_VECTOR_SETTLE_TIMEOUT_MS = "200";
    process.env.MEMORY_EVAL_VECTOR_SETTLE_POLL_MS = "25";

    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: "queued" }), { status: 200 }))
      .mockResolvedValue(new Response(JSON.stringify({
        results: [{ id: "queued-fixture", memory: "billing sync decision for April", metadata: { eval_id: "queued-fixture" } }],
      }), { status: 200 }));

    const run = await runMemoryRecallEvalSuite({ mode: "gold", db });
    expect(run.results[0]?.tiers).toEqual(expect.arrayContaining([
      expect.objectContaining({ tier: "vector", ok: true }),
    ]));

    delete process.env.MEMORY_EVAL_VECTOR_SETTLE_TIMEOUT_MS;
    delete process.env.MEMORY_EVAL_VECTOR_SETTLE_POLL_MS;
    vi.restoreAllMocks();
    fs.rmSync(casesPath, { force: true });
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
