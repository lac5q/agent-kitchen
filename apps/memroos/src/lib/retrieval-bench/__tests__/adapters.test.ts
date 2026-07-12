/**
 * Adapter behavior tests (VAL-RETR-005, VAL-RETR-006, VAL-RETR-007).
 */
import { describe, expect, it } from "vitest";
import { lexicalAdapter, lexicalRank } from "../adapters/lexical";
import { noMemoryAdapter } from "../adapters/no-memory";
import { evaluateLivePolicy, liveAdapter } from "../adapters/live";
import {
  mem0AdapterEntry,
  qdrantAdapterEntry,
  vectorLocalAdapterEntry,
} from "../adapters/vector";
import { registerAdapter, getAdapter, listAdapters, resetAdapterRegistry } from "../adapters";
import type { AdapterScope, NormalizedTask } from "../schema";

function makeTask(overrides: Partial<NormalizedTask> = {}): NormalizedTask {
  return {
    id: "task-1",
    dataset: "memroos_public_synthetic",
    task_type: "single_hop",
    corpus: [
      { id: "mem-1", text: "The team decided to use Qdrant Cloud for vector search." },
      { id: "mem-2", text: "Local Qdrant is not added to docker compose." },
    ],
    question: "Which vector store did the team choose?",
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

function defaultScope(overrides: Partial<AdapterScope> = {}): AdapterScope {
  return {
    tenantId: "default-tenant",
    userId: null,
    agentId: null,
    spaceId: null,
    label: null,
    purpose: "memory_search",
    beliefStage: null,
    maxFreshnessSeconds: null,
    ...overrides,
  };
}

describe("lexical adapter (VAL-RETR-006)", () => {
  it("is a baseline control and runs without services", () => {
    expect(lexicalAdapter.isBaselineControl).toBe(true);
  });

  it("returns ranked retrieval with text, score, and rank position", () => {
    const task = makeTask();
    const ranked = lexicalRank(task, 3);
    expect(ranked.length).toBeGreaterThan(0);
    expect(ranked[0].id).toBe("mem-1");
    expect(ranked[0].tier).toBe("lexical");
    expect(ranked[0].rankPosition).toBe(1);
    expect(ranked[0].score).toBeGreaterThan(0);
  });

  it("returns full AdapterResult with receipt even on zero matches", () => {
    const task = makeTask({ question: "no overlap at all xyzzy" });
    const result = lexicalRank(task, 3);
    expect(result.length).toBe(0);
  });

  it("populates the shared result contract fields (VAL-RETR-005)", async () => {
    const task = makeTask();
    const result = await lexicalAdapter.run({
      task,
      scope: defaultScope(),
      k: 3,
      seed: 0,
      rerankEnabled: false,
      judgeEnabled: false,
      configHash: "cfg",
      fixtureHash: "fix",
      retrievalPolicyVersion: "v1",
    });
    expect(result.taskId).toBe(task.id);
    expect(result.adapterName).toBe("lexical");
    expect(result.status).toBe("ok");
    expect(result.retrieved.length).toBeGreaterThan(0);
    expect(result.injected.length).toBeGreaterThan(0);
    expect(Array.isArray(result.ignored)).toBe(true);
    expect(typeof result.latencyMs).toBe("number");
    expect(result.receipt.adapterName).toBe("lexical");
    expect(result.receipt.provenance.configHash).toBe("cfg");
  });
});

describe("no-memory adapter (VAL-RETR-006)", () => {
  it("is a baseline control", () => {
    expect(noMemoryAdapter.isBaselineControl).toBe(true);
  });

  it("injects nothing and marks every corpus ID as ignored", async () => {
    const task = makeTask();
    const result = await noMemoryAdapter.run({
      task,
      scope: defaultScope(),
      k: 3,
      seed: 0,
      rerankEnabled: false,
      judgeEnabled: false,
      configHash: "cfg",
      fixtureHash: "fix",
      retrievalPolicyVersion: "v1",
    });
    expect(result.injected.length).toBe(0);
    expect(result.retrieved.length).toBe(0);
    expect(result.ignored.length).toBe(task.corpus.length);
    expect(result.ignored.every((i) => i.reasonCode === "baseline_control_no_injection")).toBe(true);
  });
});

describe("live adapter (VAL-RETR-007)", () => {
  it("denies all candidates when scope.tenantId is missing", () => {
    const task = makeTask();
    const decision = evaluateLivePolicy({
      task,
      scope: defaultScope({ tenantId: "" }),
      candidate: { id: "mem-1" },
    });
    expect(decision.kind).toBe("deny");
  });

  it("denies injection on abstention tasks", () => {
    const task = makeTask({ abstention_correct: true });
    const decision = evaluateLivePolicy({
      task,
      scope: defaultScope(),
      candidate: { id: "mem-1" },
    });
    expect(decision.kind).toBe("deny");
  });

  it("marks candidates stale when beyond maxFreshnessSeconds", () => {
    const task = makeTask();
    const old = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const decision = evaluateLivePolicy({
      task,
      scope: defaultScope({ maxFreshnessSeconds: 60 }),
      candidate: { id: "mem-1", timestamp_iso: old },
    });
    expect(decision.kind).toBe("stale");
  });

  it("records allowed retrieval with a scopeHash on the receipt", async () => {
    const task = makeTask();
    const result = await liveAdapter.run({
      task,
      scope: defaultScope({ tenantId: "tenant-x", spaceId: "space-y" }),
      k: 3,
      seed: 0,
      rerankEnabled: false,
      judgeEnabled: false,
      configHash: "cfg",
      fixtureHash: "fix",
      retrievalPolicyVersion: "v1",
    });
    expect(result.status).toBe("ok");
    expect(result.receipt.authorization.evaluated).toBe(true);
    expect(result.receipt.authorization.scopeHash).toContain("tenant-x");
  });
});

describe("vector/mem0/qdrant adapter stubs (VAL-RETR-005, VAL-RETR-009)", () => {
  it("return typed unavailability instead of silent zero", async () => {
    for (const entry of [vectorLocalAdapterEntry, mem0AdapterEntry, qdrantAdapterEntry]) {
      const task = makeTask();
      const result = await entry.adapter.run({
        task,
        scope: defaultScope(),
        k: 3,
        seed: 0,
        rerankEnabled: false,
        judgeEnabled: false,
        configHash: "cfg",
        fixtureHash: "fix",
        retrievalPolicyVersion: "v1",
      });
      expect(result.status).toBe("unavailable");
      expect(result.injected.length).toBe(0);
      expect(result.receipt.adapterName).toBe(entry.adapter.id);
      expect(result.receipt.status).toBe("unavailable");
    }
  });
});

describe("adapter registry", () => {
  it("registers and lists adapters", () => {
    resetAdapterRegistry();
    registerAdapter("lexical", lexicalAdapter as never);
    expect(getAdapter("lexical")).toBeDefined();
    expect(listAdapters()).toContain("lexical");
  });

  it("returns undefined for unknown adapters", () => {
    resetAdapterRegistry();
    expect(getAdapter("lexical")).toBeUndefined();
  });
});
