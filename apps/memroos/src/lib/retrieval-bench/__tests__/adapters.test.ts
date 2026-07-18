/**
 * Adapter behavior tests (VAL-RETR-005, VAL-RETR-006, VAL-RETR-007).
 */
import { describe, expect, it } from "vitest";
import { buildLexicalUnavailable, lexicalAdapter, lexicalRank } from "../adapters/lexical";
import { buildNoMemoryUnavailable, noMemoryAdapter } from "../adapters/no-memory";
import { evaluateLivePolicy, liveAdapter } from "../adapters/live";
import {
  mem0AdapterEntry,
  qdrantAdapterEntry,
  vectorLocalAdapterEntry,
} from "../adapters/vector";
import { registerAdapter, getAdapter, listAdapters, resetAdapterRegistry } from "../adapters";
import type { AdapterScope, NormalizedTask } from "../schema";

const MATCHING_SCOPE = {
  tenantId: "benchmark-tenant",
  userId: "benchmark-user",
  agentId: "benchmark-agent",
  spaceId: "benchmark-space",
  label: {
    visibility: "internal" as const,
    policy: "agent_visible" as const,
    domain: "benchmark",
    sensitivity: null,
  },
  purpose: "memory_search" as const,
  beliefStage: "silver_candidate_claim" as const,
};

function makeTask(overrides: Partial<NormalizedTask> = {}): NormalizedTask {
  return {
    id: "task-1",
    dataset: "memroos_public_synthetic",
    task_type: "single_hop",
    corpus: [
      { id: "mem-1", text: "The team decided to use Qdrant Cloud for vector search.", scope: MATCHING_SCOPE },
      { id: "mem-2", text: "Local Qdrant is not added to docker compose.", scope: MATCHING_SCOPE },
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
    ...MATCHING_SCOPE,
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

  it("orders equal lexical scores by id and exposes unavailable fallback", () => {
    const task = makeTask({
      corpus: [
        { id: "mem-b", text: "alpha beta", scope: MATCHING_SCOPE },
        { id: "mem-a", text: "alpha beta", scope: MATCHING_SCOPE },
      ],
      question: "alpha beta",
    });

    expect(lexicalRank(task, 2).map((item) => item.id)).toEqual(["mem-a", "mem-b"]);
    expect(buildLexicalUnavailable(task, "v1", "cfg", "fix")).toMatchObject({
      adapterName: "lexical",
      status: "unavailable",
      statusDetail: "lexical_adapter_not_registered",
    });
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

  it("builds an explicit unavailable result when no-memory adapter is absent", () => {
    const result = buildNoMemoryUnavailable(makeTask(), "v1", "cfg", "fix");

    expect(result).toMatchObject({
      adapterName: "no-memory",
      status: "unavailable",
      statusDetail: "no_memory_adapter_not_registered",
    });
  });
});

describe("live adapter (VAL-RETR-007)", () => {
  it("denies all candidates when requester scope is incomplete", async () => {
    const task = makeTask();
    const result = await liveAdapter.run({
      task,
      scope: defaultScope({ tenantId: "" }),
      k: 3,
      seed: 0,
      rerankEnabled: false,
      judgeEnabled: false,
      configHash: "cfg",
      fixtureHash: "fix",
      retrievalPolicyVersion: "v1",
    });
    expect(result.retrieved).toEqual([]);
    expect(result.injected).toEqual([]);
    expect(result.ignored.every((item) => item.reasonCode === "incomplete_scope")).toBe(true);
    expect(result.receipt.authorization.denialReason).toBe("incomplete_scope");
  });

  it("fails closed with invalid_purpose without retrieving candidates", async () => {
    const task = makeTask();
    const result = await liveAdapter.run({
      task,
      scope: defaultScope({ purpose: "not-allowlisted" as AdapterScope["purpose"] }),
      k: 3,
      seed: 0,
      rerankEnabled: false,
      judgeEnabled: false,
      configHash: "cfg",
      fixtureHash: "fix",
      retrievalPolicyVersion: "v1",
    });
    expect(result.retrieved).toEqual([]);
    expect(result.injected).toEqual([]);
    expect(result.ignored.every((item) => item.reasonCode === "invalid_purpose")).toBe(true);
  });

  it("denies injection on abstention tasks", () => {
    const task = makeTask({ abstention_correct: true });
    const decision = evaluateLivePolicy({
      task,
      scope: defaultScope(),
      candidate: task.corpus[0],
    });
    expect(decision.kind).toBe("deny");
  });

  it("marks candidates stale when beyond maxFreshnessSeconds", () => {
    const task = makeTask();
    const old = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const decision = evaluateLivePolicy({
      task,
      scope: defaultScope({ maxFreshnessSeconds: 60 }),
      candidate: { ...task.corpus[0], timestamp_iso: old },
    });
    expect(decision.kind).toBe("stale");
  });

  it("requires complete matching candidate scope metadata", () => {
    const task = makeTask();
    const cases = [
      ["tenant_mismatch", { tenantId: "foreign-tenant" }],
      ["user_mismatch", { userId: "foreign-user" }],
      ["agent_mismatch", { agentId: "foreign-agent" }],
      ["space_mismatch", { spaceId: "foreign-space" }],
      ["label_mismatch", { label: { ...MATCHING_SCOPE.label, policy: "sealed" as const } }],
      ["purpose_mismatch", { purpose: "recall" as const }],
      ["belief_stage_mismatch", { beliefStage: "gold_claim" as const }],
    ] as const;
    for (const [reason, override] of cases) {
      const decision = evaluateLivePolicy({
        task,
        scope: defaultScope(),
        candidate: { ...task.corpus[0], scope: { ...MATCHING_SCOPE, ...override } },
      });
      expect(decision).toEqual({ kind: "deny", reason });
    }
    expect(evaluateLivePolicy({
      task,
      scope: defaultScope(),
      candidate: { id: "missing-scope" },
    })).toEqual({ kind: "deny", reason: "candidate_scope_missing" });
    expect(evaluateLivePolicy({
      task,
      scope: defaultScope(),
      candidate: {
        ...task.corpus[0],
        scope: { ...MATCHING_SCOPE, label: { ...MATCHING_SCOPE.label, visibility: "not-a-label" } },
      },
    })).toEqual({ kind: "deny", reason: "candidate_scope_malformed" });
  });

  it("records a nonreversible scope hash and matching authorization", async () => {
    const task = makeTask();
    const result = await liveAdapter.run({
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
    expect(result.status).toBe("ok");
    expect(result.receipt.authorization.evaluated).toBe(true);
    expect(result.receipt.authorization.scopeHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(result.receipt.authorization.scopeHash).not.toContain(MATCHING_SCOPE.tenantId);
    expect(result.retrieved.length).toBeGreaterThan(0);
    expect(result.retrieved.every((item) => item.scopeHash === result.receipt.authorization.scopeHash)).toBe(true);
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
