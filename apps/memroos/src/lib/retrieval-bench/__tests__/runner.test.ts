/**
 * End-to-end runner tests (VAL-RETR-001, VAL-RETR-005, VAL-RETR-008, VAL-RETR-013).
 */
import { describe, expect, it } from "vitest";
import path from "node:path";
import {
  runBenchmark,
  writeReport,
  renderTextReport,
  loadDataset,
} from "../runner";
import { canonicalOutputPath } from "../redaction";

const FIXTURES_DIR = path.resolve(
  "/Users/lcalderon/github/memroos/evals/comparative-retrieval/fixtures",
);

describe("runBenchmark smoke (VAL-RETR-001)", () => {
  it("loads exactly 25 synthetic tasks with the lexical adapter", async () => {
    const r = await runBenchmark({
      dataset: "memroos_public_synthetic",
      adapter: "lexical",
      limit: 25,
      k: 3,
      seed: 0,
      fixturesDir: FIXTURES_DIR,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.report.taskCount).toBe(25);
    expect(r.report.dataset).toBe("memroos_public_synthetic");
    expect(r.report.adapter).toBe("lexical");
    expect(r.report.aggregate.precisionAtK).toBeGreaterThan(0);
    expect(r.report.aggregate.recallAtK).toBeGreaterThan(0);
    expect(r.report.aggregate.mrr).toBeGreaterThan(0);
    expect(r.report.fixtureHash.startsWith("sha256:")).toBe(true);
    expect(r.report.configHash.startsWith("sha256:")).toBe(true);
  });

  it("produces reproducible config + fixture hashes across runs", async () => {
    const a = await runBenchmark({
      dataset: "memroos_public_synthetic",
      adapter: "lexical",
      limit: 5,
      k: 3,
      seed: 0,
      fixturesDir: FIXTURES_DIR,
    });
    const b = await runBenchmark({
      dataset: "memroos_public_synthetic",
      adapter: "lexical",
      limit: 5,
      k: 3,
      seed: 0,
      fixturesDir: FIXTURES_DIR,
    });
    if (!a.ok || !b.ok) throw new Error("runs failed");
    expect(a.report.configHash).toBe(b.report.configHash);
    expect(a.report.fixtureHash).toBe(b.report.fixtureHash);
  });

  it("marks no-memory adapter as having zero injection", async () => {
    const r = await runBenchmark({
      dataset: "memroos_public_synthetic",
      adapter: "no-memory",
      limit: 5,
      k: 3,
      seed: 0,
      fixturesDir: FIXTURES_DIR,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.report.tasks.every((t) => t.injectedCount === 0)).toBe(true);
  });

  it("marks vector/mem0/qdrant adapters as unavailable (typed, never silent zero)", async () => {
    const r = await runBenchmark({
      dataset: "memroos_public_synthetic",
      adapter: "vector-local",
      limit: 5,
      k: 3,
      seed: 0,
      fixturesDir: FIXTURES_DIR,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.report.tasks.every((t) => t.status === "unavailable")).toBe(true);
    expect(r.report.aggregate.failedTaskCount).toBe(5);
  });

  it("live adapter applies authorization scope (VAL-RETR-007)", async () => {
    const r = await runBenchmark({
      dataset: "memroos_public_synthetic",
      adapter: "live",
      limit: 5,
      k: 3,
      seed: 0,
      fixturesDir: FIXTURES_DIR,
      scope: {
        tenantId: "tenant-x",
        userId: null,
        agentId: null,
        spaceId: null,
        label: null,
        purpose: "memory_search",
        beliefStage: null,
        maxFreshnessSeconds: null,
      },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    for (const t of r.report.tasks) {
      expect(t.receipt.authorization.evaluated).toBe(true);
    }
  });

  it("reports an explicit error for unknown adapters", async () => {
    const r = await runBenchmark({
      dataset: "memroos_public_synthetic",
      adapter: "unicorn-adapter" as never,
      fixturesDir: FIXTURES_DIR,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toContain("adapter_not_registered");
    }
  });

  it("rejects unsupported datasets with a typed reason", async () => {
    const r = await runBenchmark({
      dataset: "longmemeval_v2",
      adapter: "lexical",
      fixturesDir: FIXTURES_DIR,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toContain("longmemeval_v2_unavailable");
    }
  });

  it("reproduces reports across runs (VAL-RETR-013)", async () => {
    const a = await runBenchmark({
      dataset: "memroos_public_synthetic",
      adapter: "lexical",
      limit: 10,
      k: 3,
      seed: 0,
      fixturesDir: FIXTURES_DIR,
    });
    const b = await runBenchmark({
      dataset: "memroos_public_synthetic",
      adapter: "lexical",
      limit: 10,
      k: 3,
      seed: 0,
      fixturesDir: FIXTURES_DIR,
    });
    if (!a.ok || !b.ok) throw new Error("runs failed");
    expect(a.report.aggregate.precisionAtK).toBe(b.report.aggregate.precisionAtK);
    expect(a.report.aggregate.recallAtK).toBe(b.report.aggregate.recallAtK);
    expect(a.report.aggregate.mrr).toBe(b.report.aggregate.mrr);
    expect(a.report.tasks.map((t) => t.precisionAtK)).toEqual(
      b.report.tasks.map((t) => t.precisionAtK),
    );
  });

  it("partitions per-lane aggregates (VAL-RETR-008)", async () => {
    const r = await runBenchmark({
      dataset: "memroos_public_synthetic",
      adapter: "lexical",
      limit: 5,
      k: 3,
      seed: 0,
      fixturesDir: FIXTURES_DIR,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(Object.keys(r.report.aggregate.laneMetrics)).toContain("external_retrieval");
    expect(r.report.aggregate.laneMetrics.external_retrieval?.taskCount).toBe(5);
  });
});

describe("writeReport + renderTextReport", () => {
  it("writes JSON output to the canonical path", async () => {
    const r = await runBenchmark({
      dataset: "memroos_public_synthetic",
      adapter: "lexical",
      limit: 3,
      k: 3,
      seed: 0,
      fixturesDir: FIXTURES_DIR,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const tmpDir = "/tmp/bench-output-" + Date.now();
    const w = writeReport({ report: r.report, outputDir: tmpDir });
    expect(w.path).toBe(
      canonicalOutputPath({ resultsDir: tmpDir, dataset: r.report.dataset, adapter: r.report.adapter, lane: r.report.lane }),
    );
    const fs = await import("node:fs");
    expect(fs.existsSync(w.path)).toBe(true);
  });

  it("renders a text report that includes aggregate metrics and lane data", async () => {
    const r = await runBenchmark({
      dataset: "memroos_public_synthetic",
      adapter: "lexical",
      limit: 3,
      k: 3,
      seed: 0,
      fixturesDir: FIXTURES_DIR,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const text = renderTextReport(r.report);
    expect(text).toContain("precision@k");
    expect(text).toContain("recall@k");
    expect(text).toContain("Lane:");
  });
});

describe("loadDataset explicit errors", () => {
  it("refuses locomo without caller-local source", () => {
    const r = loadDataset({ dataset: "locomo", fixturesDir: FIXTURES_DIR });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toContain("locomo_source_not_provided");
    }
  });

  it("refuses longmemeval without caller-local source", () => {
    const r = loadDataset({ dataset: "longmemeval", fixturesDir: FIXTURES_DIR });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toContain("longmemeval_source_not_provided");
    }
  });

  it("refuses longmemeval_v2 with an explicit unavailable reason", () => {
    const r = loadDataset({ dataset: "longmemeval_v2", fixturesDir: FIXTURES_DIR });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toContain("longmemeval_v2_unavailable");
    }
  });
});
