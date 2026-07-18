// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  LANE_METADATA,
  partitionScoresByLane,
  resolveLaneForDataset,
  verifyLaneAssignments,
} from "../lanes";
import {
  applyProviderGovernanceGate,
  checkProviderAvailable,
  DEFAULT_PROVIDER_FLAGS,
  describeProviderFlags,
} from "../modules/provider-credentials";
import { rerankCandidates } from "../modules/rerank";
import {
  convertLongMemEvalSamples,
  hashLongMemEvalSource,
  type LongMemEvalRawSample,
} from "../adapters/longmemeval";
import type { RetrievedItem, TaskScore } from "../schema";

function item(overrides: Partial<RetrievedItem> = {}): RetrievedItem {
  return {
    id: "mem-1",
    score: 0.5,
    text: "Alice remembers Qdrant",
    tier: "lexical",
    source: "fixture",
    authorizationResult: "allowed",
    whyEntered: "test",
    rankPosition: 1,
    ...overrides,
  };
}

describe("retrieval bench long-tail coverage", () => {
  it("detects unassigned, duplicate, and mismatched lane metadata", () => {
    expect(resolveLaneForDataset("locomo")).toEqual({
      ok: true,
      lane: "external_retrieval",
    });
    expect(resolveLaneForDataset("memroos_public_synthetic")).toEqual({
      ok: true,
      lane: "external_retrieval",
    });

    LANE_METADATA.architecture_evidence.datasets.push("locomo");
    expect(resolveLaneForDataset("locomo")).toMatchObject({
      ok: false,
      reason: "dataset_belongs_to_multiple_lanes:locomo",
    });
    LANE_METADATA.architecture_evidence.datasets.pop();

    const removed = LANE_METADATA.external_retrieval.datasets.pop();
    expect(verifyLaneAssignments().mismatches).toContain(
      "dataset_memroos_public_synthetic_missing_from_lane:external_retrieval"
    );
    if (removed) LANE_METADATA.external_retrieval.datasets.push(removed);
  });

  it("partitions scores by lane without cross-averaging", () => {
    const base = {
      taskId: "task-1",
      taskType: "single_hop",
      adapterName: "lexical",
      status: "ok",
      precisionAtK: 1,
      recallAtK: 1,
      mrr: 1,
      falsePositiveRate: 0,
      latencyMs: 1,
      injectedCount: 1,
      evidenceSpanCount: 1,
      answerSupportedByRetrievedSource: true,
      abstentionCorrect: null,
      receipt: {} as TaskScore["receipt"],
      corpusHash: "sha256:corpus",
      taskHash: "sha256:task",
    } satisfies Omit<TaskScore, "lane">;

    const byLane = partitionScoresByLane([
      { ...base, lane: "architecture_evidence" },
      { ...base, taskId: "task-2", lane: "operational_workflow" },
    ]);

    expect(byLane.architecture_evidence).toHaveLength(1);
    expect(byLane.external_retrieval).toHaveLength(0);
    expect(byLane.operational_workflow).toHaveLength(1);
  });

  it("returns explicit LongMemEval errors and stable source hashes", () => {
    expect(convertLongMemEvalSamples({ rawSamples: [], variant: "longmemeval" })).toEqual({
      ok: false,
      reason: "raw_samples_empty",
    });
    expect(
      convertLongMemEvalSamples({
        rawSamples: [{ sample_id: "bad" } as LongMemEvalRawSample],
        variant: "longmemeval",
      })
    ).toEqual({ ok: false, reason: "sample_malformed:bad" });

    const raw: LongMemEvalRawSample[] = [
      {
        sample_id: "s1",
        history_sessions: [
          {
            session_id: "session-a",
            turns: [{ role: "user", text: "Alice chose Qdrant", timestamp_iso: "2026-01-01T00:00:00Z" }],
          },
        ],
        questions: [
          {
            qid: "q1",
            question: "What did Alice choose?",
            answer: "Qdrant",
            category: "temporal",
            evidence_session_ids: ["session-a"],
            abstention: true,
          },
        ],
      },
    ];
    const converted = convertLongMemEvalSamples({ rawSamples: raw, variant: "longmemeval" });
    expect(converted.ok).toBe(true);
    if (converted.ok) {
      expect(converted.tasks[0]).toMatchObject({
        task_type: "temporal_reasoning",
        evidence_spans: ["s1-session-a-turn-0"],
        abstention_correct: true,
      });
    }
    expect(hashLongMemEvalSource(raw)).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("records rerank provider success, unavailable, timeout, and failure receipts", async () => {
    const items = [item({ id: "b", score: 0.1 }), item({ id: "a", score: 0.2 })];
    await expect(
      rerankCandidates({
        items,
        question: "Alice Qdrant",
        cutoff: 1,
        strategy: "provider",
        providerHook: async () => ({ items: [...items].reverse(), modelVersion: "rerank-v1" }),
        now: () => 10,
      })
    ).resolves.toMatchObject({ receipt: { status: "ok", modelVersion: "rerank-v1" }, items: [{ id: "a" }] });

    await expect(
      rerankCandidates({
        items,
        question: "Alice Qdrant",
        cutoff: 2,
        strategy: "provider",
        providerHook: async () => null,
      })
    ).resolves.toMatchObject({ receipt: { status: "unavailable" } });

    await expect(
      rerankCandidates({
        items,
        question: "Alice Qdrant",
        cutoff: 2,
        strategy: "provider",
        providerHook: async () => {
          throw new Error("provider timeout");
        },
      })
    ).resolves.toMatchObject({ receipt: { status: "provider_timeout" } });

    await expect(
      rerankCandidates({
        items,
        question: "Alice Qdrant",
        cutoff: 2,
        strategy: "provider",
        providerHook: async () => {
          throw new Error("provider failed");
        },
      })
    ).resolves.toMatchObject({ receipt: { status: "provider_failed" } });
  });

  it("describes provider credentials and gates malformed provider outputs", () => {
    const flags = { ...DEFAULT_PROVIDER_FLAGS, embedding: true, rerank: true };
    expect(checkProviderAvailable({
      provider: "embedding",
      flags,
      resolveCredential: () => "secret",
    })).toMatchObject({ ok: true, status: "ok", credentialFingerprint: expect.stringMatching(/^sha256:/) });
    expect(checkProviderAvailable({
      provider: "rerank",
      flags,
      resolveCredential: () => "",
    })).toMatchObject({ ok: false, status: "credential_missing" });
    expect(describeProviderFlags({ flags, resolveCredential: (name) => (name === "embedding" ? "secret" : null) })).toMatchObject({
      independent: true,
      flags: expect.arrayContaining([
        expect.objectContaining({ flag: "embedding", status: "ok" }),
        expect.objectContaining({ flag: "rerank", status: "credential_missing" }),
      ]),
    });

    const gated = applyProviderGovernanceGate({
      scope: { tenantId: "tenant-a", label: "internal", maxFreshnessSeconds: 60, nowIso: "2026-01-01T00:01:00.000Z" },
      providerTrustFloor: 0.5,
      items: [
        { id: "cross", text: "cross tenant", score: 1, tier: "live", tenantId: "tenant-b" },
        { id: "label", text: "wrong label", score: 1, tier: "live", tenantId: "tenant-a", label: "secret" },
        { id: "bad-ts", text: "bad time", score: 1, tier: "live", tenantId: "tenant-a", label: "internal", timestamp_iso: "bad" },
        { id: "low", text: "low trust", score: 1, tier: "live", tenantId: "tenant-a", label: "internal", providerTrust: 0.1 },
        { id: "ok", text: "allowed", score: 1, tier: "live", tenantId: "tenant-a", label: "internal", providerTrust: 1 },
      ],
    });

    expect(gated.items.map((entry) => entry.id)).toEqual(["ok"]);
    expect(gated.receipt.denialReasons).toMatchObject({
      cross_tenant: 1,
      cross_label: 1,
      malformed: 1,
      sub_floor_trust: 1,
    });
  });
});
