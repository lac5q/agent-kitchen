/**
 * Lane separation, redaction, and failure-handling tests.
 */
import { describe, expect, it } from "vitest";
import {
  LANE_METADATA,
  partitionScoresByLane,
  resolveLaneForDataset,
  verifyLaneAssignments,
} from "../lanes";
import { canonicalOutputPath, redactReport, scanForForbiddenContent } from "../redaction";
import {
  checkProviderConfig,
  classifyFailure,
  downgradeToFailure,
  summarizeFailures,
  validateAdapterResult,
} from "../failure";
import type { AdapterResult, NormalizedTask, TaskScore } from "../schema";

function fakeResult(): AdapterResult {
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
  };
}

describe("lane separation (VAL-RETR-008)", () => {
  it("resolves external retrieval lane for known datasets", () => {
    expect(resolveLaneForDataset("locomo").ok).toBe(true);
    expect(resolveLaneForDataset("longmemeval").ok).toBe(true);
    expect(resolveLaneForDataset("memroos_public_synthetic").ok).toBe(true);
  });

  it("verifyLaneAssignments passes for the current config", () => {
    expect(verifyLaneAssignments().ok).toBe(true);
  });

  it("LANE_METADATA uses distinct aggregate ids per lane", () => {
    const ids = new Set(Object.values(LANE_METADATA).map((l) => l.aggregateId));
    expect(ids.size).toBe(Object.keys(LANE_METADATA).length);
  });

  it("partitionScoresByLane groups scores by lane without cross-lane averaging", () => {
    const scores: TaskScore[] = [
      { taskId: "a", taskType: "single_hop", lane: "external_retrieval", adapterName: "lexical", status: "ok", precisionAtK: 1, recallAtK: 1, mrr: 1, falsePositiveRate: 0, latencyMs: 1, injectedCount: 1, evidenceSpanCount: 1, answerSupportedByRetrievedSource: false, abstentionCorrect: null, receipt: fakeResult().receipt, corpusHash: "x", taskHash: "x" },
      { taskId: "b", taskType: "single_hop", lane: "operational_workflow", adapterName: "lexical", status: "ok", precisionAtK: 0, recallAtK: 0, mrr: 0, falsePositiveRate: 1, latencyMs: 1, injectedCount: 1, evidenceSpanCount: 1, answerSupportedByRetrievedSource: false, abstentionCorrect: null, receipt: fakeResult().receipt, corpusHash: "x", taskHash: "x" },
    ];
    const out = partitionScoresByLane(scores);
    expect(out.external_retrieval.length).toBe(1);
    expect(out.operational_workflow.length).toBe(1);
    expect(out.architecture_evidence.length).toBe(0);
  });
});

describe("redaction (VAL-RETR-004)", () => {
  it("detects forbidden keys", () => {
    const r = scanForForbiddenContent({ text: "x", password: "secret", corpus: [] });
    expect(r.ok).toBe(false);
  });

  it("detects sentinel substrings in string values", () => {
    const r = scanForForbiddenContent({ marker: "[locomo-raw] this is forbidden content" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.violations.some((v) => v.reason === "locomo_raw_marker")).toBe(true);
    }
  });

  it("redactReport strips raw text bodies", () => {
    const r = redactReport({ corpus: [{ id: "1", text: "raw conversation" }], text: "answer text" });
    expect(JSON.stringify(r)).not.toContain("raw conversation");
    expect(JSON.stringify(r)).not.toContain("answer text");
  });

  it("canonicalOutputPath produces deterministic paths", () => {
    const p1 = canonicalOutputPath({ resultsDir: "/tmp/results", dataset: "locomo", adapter: "lexical", lane: "external_retrieval" });
    const p2 = canonicalOutputPath({ resultsDir: "/tmp/results/", dataset: "locomo", adapter: "lexical", lane: "external_retrieval" });
    expect(p1).toBe(p2);
    expect(p1).toBe("/tmp/results/locomo-lexical-external_retrieval-latest.json");
  });
});

describe("failure handling (VAL-RETR-009, VAL-RETR-022)", () => {
  it("classifies timeouts as provider_timeout", () => {
    const c = classifyFailure(new Error("ETIMEDOUT calling provider"));
    expect(c.status).toBe("provider_timeout");
  });

  it("classifies malformed responses as malformed_response", () => {
    const c = classifyFailure(new Error("malformed JSON"));
    expect(c.status).toBe("malformed_response");
  });

  it("checkProviderConfig returns credential_missing for empty env", () => {
    const c = checkProviderConfig({ provider: "mem0", envValue: "" });
    expect(c.ok).toBe(false);
    expect(c.status).toBe("credential_missing");
  });

  it("checkProviderConfig returns ok when credential is present", () => {
    const c = checkProviderConfig({ provider: "mem0", envValue: "key" });
    expect(c.ok).toBe(true);
    expect(c.status).toBe("ok");
  });

  it("validateAdapterResult rejects non-ok status with injections", () => {
    const r = fakeResult();
    r.status = "provider_failed";
    r.injected = ["mem-1"];
    const v = validateAdapterResult(r);
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.reasons).toContain("non_ok_status_with_injections");
    }
  });

  it("rejects live results that inject without an authorized scoped retrieval", () => {
    const r = fakeResult();
    r.adapterName = "live";
    r.receipt.adapterName = "live";
    r.injected = ["mem-1"];
    const v = validateAdapterResult(r);
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.reasons).toContain("live_injected_id_not_retrieved");
    }
  });

  it("summarizeFailures counts failures by status", () => {
    const r1 = fakeResult();
    r1.status = "provider_timeout";
    const r2 = fakeResult();
    r2.taskId = "task-2";
    r2.status = "malformed_response";
    const ok = fakeResult();
    const s = summarizeFailures([r1, r2, ok]);
    expect(s.failedTaskCount).toBe(2);
    expect(s.byStatus.provider_timeout).toBe(1);
    expect(s.byStatus.malformed_response).toBe(1);
  });

  it("downgradeToFailure moves partial injections to ignored", () => {
    const task = makeFakeTask();
    const partial = fakeResult();
    partial.injected = ["mem-1"];
    partial.ignored = [{ id: "mem-2", whyMissed: "low score", reasonCode: "low_score" }];
    const out = downgradeToFailure({
      task,
      partial,
      classification: { status: "provider_failed", reasonCode: "timeout", detail: "timed out" },
    });
    expect(out.status).toBe("provider_failed");
    expect(out.injected.length).toBe(0);
    expect(out.ignored.find((i) => i.id === "mem-1")).toBeDefined();
  });
});

function makeFakeTask(): NormalizedTask {
  return {
    id: "task-1",
    dataset: "memroos_public_synthetic",
    task_type: "single_hop",
    corpus: [{ id: "mem-1", text: "x" }, { id: "mem-2", text: "y" }],
    question: "q",
    expected_answer: "a",
    evidence_spans: ["mem-1"],
    license: "MIT",
    citation: "c",
    provenance: {
      dataset: "memroos_public_synthetic",
      sourceCitation: "c",
      sourceLicense: "MIT",
      sourceAvailability: "synthetic",
    },
  };
}
