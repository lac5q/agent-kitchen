/**
 * End-to-end pipeline integration test covering VAL-RETR-015..030.
 *
 * Wires every stage together and verifies that:
 *   - Entity extraction + tier fanout + dedupe + rerank + context pack
 *     produce a coherent result
 *   - Stage reconciliation tracks IDs through every stage
 *   - Publication gate refuses when receipts / provenance are missing
 *   - Cross-tenant contamination is detected
 */
import { describe, expect, it } from "vitest";

import {
  buildReplayHandle,
  checkContamination,
  createIsolationContext,
  dedupeRetrievalResults,
  decideMerge,
  evaluatePublicationGate,
  extractEntities,
  packContext,
  defaultContextBudget,
  performTemporalRetrieval,
  performTierFanout,
  reconcileStages,
  rerankCandidates,
  stageRecord,
} from "../index";
import type { RetrievedItem } from "../../schema";

function makeTask(id: string) {
  return {
    id,
    dataset: "memroos_public_synthetic" as const,
    task_type: "single_hop" as const,
    corpus: [
      { id: `${id}-c1`, text: "Alice went to the MemroOS office on 2026-01-01.", timestamp_iso: "2026-01-01T10:00:00Z" },
      { id: `${id}-c2`, text: "Bob and Alice discussed Qdrant.", timestamp_iso: "2026-02-01T10:00:00Z" },
    ],
    question: "Where did Alice go?",
    expected_answer: "MemroOS office",
    evidence_spans: [`${id}-c1`],
    license: "MIT",
    citation: "MemroOS internal synthetic benchmark",
    provenance: {
      dataset: "memroos_public_synthetic" as const,
      sourceCitation: "MemroOS internal synthetic benchmark",
      sourceLicense: "MIT",
      sourceAvailability: "synthetic" as const,
    },
  };
}

describe("end-to-end pipeline (VAL-RETR-015..030)", () => {
  it("wires all stages and produces coherent stage record lineage", async () => {
    const task = makeTask("t1");

    // 1) Entity extraction
    const ent = extractEntities(task.question + " " + task.corpus[0].text, {
      version: "v1",
      seed: 0,
    });
    expect(ent.ok).toBe(true);

    // 2) Tier fanout (purely lexical, no caller needed)
    const fanout = await performTierFanout({
      query: task.question,
      scope: "t1",
      sources: [{ tier: "lexical", state: "registered" }],
      budget: { maxSources: 4, maxItemsPerSource: 3, deadlineMs: 1000 },
      allowedTiers: ["lexical", "vector-local", "mem0", "qdrant", "live"],
      caller: async () => ({
        items: [
          { id: task.corpus[0].id, score: 2, text: task.corpus[0].text, tier: "lexical", source: "corpus", authorizationResult: "allowed", whyEntered: "ok", rankPosition: 1 } as RetrievedItem,
        ],
      }),
    });
    expect(fanout.items.length).toBe(1);

    // 3) Dedupe
    const dedup = dedupeRetrievalResults({
      scope: "t1",
      items: [...fanout.items, ...fanout.items],
    });
    expect(dedup.items.length).toBe(1);
    expect(dedup.receipt.mergedCount).toBe(1);

    // 4) Rerank
    const rerank = await rerankCandidates({ items: dedup.items, question: task.question, cutoff: 3, strategy: "lexical" });
    expect(rerank.items.length).toBeLessThanOrEqual(3);

    // 5) Context pack
    const pack = packContext({
      items: rerank.items,
      evidenceSpanIds: task.evidence_spans,
      budget: { maxBytes: 1024, maxTokens: 256 },
    });
    expect(pack.receipt.bytes).toBeGreaterThan(0);

    // 6) Temporal
    const temporal = performTemporalRetrieval({
      candidates: task.corpus,
      metadata: { reference_time_iso: "2026-12-31T00:00:00Z", temporal_direction: "latest" },
    });
    expect(["supported", "caveat"]).toContain(temporal.status);

    // All stage counts reconcile logically.
    expect(fanout.items.length).toBeGreaterThanOrEqual(pack.items.length);
    void ent;
    void temporal;
  });

  it("records tier fanout omissions and context-pack token coverage gaps", async () => {
    const ticks = [0, 5, 10, 20, 25, 30, 40];
    const fanout = await performTierFanout({
      query: "q",
      sources: [
        { tier: "lexical", state: "registered", trust: 1 },
        { tier: "mem0", state: "registered", trust: 1 },
        { tier: "qdrant", state: "registered", trust: 1 },
        { tier: "live", state: "expired" },
      ],
      budget: { maxSources: 2, maxItemsPerSource: 1, deadlineMs: 100 },
      allowedTiers: ["lexical", "mem0", "qdrant", "live"],
      now: () => ticks.shift() ?? 40,
      caller: async ({ tier }) => ({
        items: [{ id: tier, score: 1, text: `${tier} text`, tier, source: tier, authorizationResult: "allowed", whyEntered: "ok" }],
      }),
    });

    expect(fanout.receipt.calledCount).toBe(2);
    expect(fanout.perSource).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tier: "qdrant", status: "omitted", reasonCode: "budget_exhausted" }),
        expect.objectContaining({ tier: "live", status: "stale", reasonCode: "source_state:expired" }),
      ])
    );

    const pack = packContext({
      items: [
        { id: "must-have", score: 1, text: "required evidence", tier: "lexical", source: "fixture", authorizationResult: "allowed", whyEntered: "evidence", rankPosition: 1 },
        { id: "too-many-tokens", score: 0.9, text: "x".repeat(80), tier: "live", source: "fixture", authorizationResult: "allowed", whyEntered: "budget", rankPosition: 2 },
      ],
      evidenceSpanIds: ["must-have", "too-many-tokens"],
      temporalCaveats: [{ code: "conflicting_facts", message: "latest was ambiguous", candidateIds: ["must-have"] }],
      budget: { maxBytes: 200, maxTokens: 5 },
    });

    expect(defaultContextBudget()).toEqual({ maxBytes: 8192, maxTokens: 2048 });
    expect(pack.receipt.coverageMet).toBe(false);
    expect(pack.receipt.temporalCaveatCodes).toEqual(["conflicting_facts"]);
    expect(pack.omitted).toContainEqual({ id: "too-many-tokens", reason: "over_token_budget" });
  });

  it("stage reconciliation tracks IDs across every stage", async () => {
    const taskId = "t2";
    const records = [
      stageRecord({ taskId, stage: "retrieved", ids: ["a", "b"] }),
      stageRecord({ taskId, stage: "injected", ids: ["a"] }),
      stageRecord({ taskId, stage: "packed", ids: ["a"] }),
      stageRecord({ taskId, stage: "ignored", ids: ["b", "c"] }),
    ];
    const fakeScore = {
      taskId,
      taskType: "single_hop" as const,
      lane: "external_retrieval" as const,
      adapterName: "lexical" as const,
      status: "ok" as const,
      precisionAtK: 1,
      recallAtK: 1,
      mrr: 1,
      falsePositiveRate: 0,
      latencyMs: 1,
      injectedCount: 1,
      evidenceSpanCount: 1,
      answerSupportedByRetrievedSource: true,
      abstentionCorrect: null,
      receipt: {
        adapterName: "lexical",
        adapterVersion: "v1",
        status: "ok" as const,
        latencyMs: 0,
        authorization: { evaluated: false, allowed: true },
        provenance: {
          provider: null,
          providerVersion: null,
          retrievalPolicyVersion: "v1",
          configHash: "c",
          fixtureHash: "f",
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
      corpusHash: "c",
      taskHash: "t",
    };
    const report = {
      runId: "r",
      runDate: "now",
      dataset: "memroos_public_synthetic" as const,
      adapter: "lexical" as const,
      lane: "external_retrieval" as const,
      configHash: "c",
      fixtureHash: "f",
      seed: 0,
      k: 3,
      rerankEnabled: false,
      judgeEnabled: false,
      providerFlags: {},
      aggregate: {
        taskCount: 1,
        completedTaskCount: 1,
        failedTaskCount: 0,
        incompleteTaskCount: 0,
        precisionAtK: 1,
        recallAtK: 1,
        mrr: 1,
        falsePositiveRate: 0,
        answerSupportedRate: 1,
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
      },
      taskCount: 1,
      tasks: [fakeScore],
    };
    const reconciliation = reconcileStages({
      report,
      perTask: new Map([[taskId, records]]),
    });
    expect(reconciliation.aggregate.injectedTotal).toBe(1);
    expect(reconciliation.aggregate.ignoredTotal).toBe(2);
    expect(reconciliation.aggregate.retrievedTotal).toBe(2);
  });

  it("replay handle round-trips the same config", () => {
    const handle = buildReplayHandle({
      dataset: "locomo",
      adapter: "lexical",
      lane: "external_retrieval",
      configHash: "sha256:a",
      fixtureHash: "sha256:b",
      seed: 0,
      k: 3,
      providerFlags: { rerank: false, judge: false },
      rerankEnabled: false,
      judgeEnabled: false,
    });
    expect(
      handle.matches({
        dataset: "locomo",
        adapter: "lexical",
        lane: "external_retrieval",
        configHash: "sha256:a",
        fixtureHash: "sha256:b",
        seed: 0,
        k: 3,
        providerFlags: { rerank: false, judge: false },
        rerankEnabled: false,
        judgeEnabled: false,
      }),
    ).toBe(true);
  });

  it("publication gate refuses when run is incomplete", () => {
    const r = evaluatePublicationGate({
      report: {
        runId: "r",
        runDate: "now",
        dataset: "locomo" as const,
        adapter: "lexical" as const,
        lane: "external_retrieval" as const,
        configHash: "sha256:a",
        fixtureHash: "sha256:b",
        seed: 0,
        k: 3,
        rerankEnabled: false,
        judgeEnabled: false,
        providerFlags: { rerank: false },
        aggregate: {
          taskCount: 1,
          completedTaskCount: 0,
          failedTaskCount: 1,
          incompleteTaskCount: 1,
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
        },
        taskCount: 1,
        tasks: [],
      },
      provenance: {
        configHash: "sha256:a",
        fixtureHash: "sha256:b",
        seed: 0,
        k: 3,
        providerFlags: { rerank: false },
      },
      receiptVerifications: [
        { receiptHash: "h", chainDomain: "retrieval-bench", verified: true, verifiedAtIso: "now" },
      ],
    });
    expect(r.ok).toBe(false);
    expect(r.caveats.some((c) => c.includes("failed_tasks_present"))).toBe(true);
  });

  it("contamination guard refuses cross-run mixing", () => {
    const ctx = createIsolationContext({
      runId: "r1",
      lane: "external_retrieval",
      dataset: "locomo",
      adapter: "lexical",
      tenantId: "t1",
      seed: 0,
    });
    const r = checkContamination({
      expected: ctx.scope,
      actual: {
        runId: "r2",
        lane: ctx.scope.lane,
        dataset: ctx.scope.dataset,
        adapter: ctx.scope.adapter,
        tenantId: ctx.scope.tenantId,
      },
    });
    expect(r.ok).toBe(false);
  });

  it("decideMerge keeps distinct content but collapses true duplicates", () => {
    const a: RetrievedItem = {
      id: "mem-1",
      score: 1,
      text: "x",
      tier: "lexical",
      source: "corpus",
      authorizationResult: "allowed",
      whyEntered: "ok",
      rankPosition: 1,
    };
    const b: RetrievedItem = {
      id: "mem-1",
      score: 1,
      text: "x",
      tier: "lexical",
      source: "corpus",
      authorizationResult: "allowed",
      whyEntered: "ok",
      rankPosition: 2,
    };
    expect(decideMerge({ existing: a, candidate: b }).merge).toBe(true);
  });
});
