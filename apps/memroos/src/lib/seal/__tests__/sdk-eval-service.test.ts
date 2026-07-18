// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

import { createEvalServiceForSeal, SdkBackedEvalService } from "../sdk-eval-service";
import type { EvalRunResult } from "@/lib/evals/types";

function baselineRun(): EvalRunResult {
  return {
    id: "run-low",
    traceId: "trace-low",
    agentId: "agent-1",
    role: "ops",
    compositeW: 0.42,
    trusted: true,
    layers: {
      l1: { score: 0.4, weight: 0.25, scorers: [] },
      l2: { score: 0.42, weight: 0.5, scorers: [] },
      l3: { score: 0.45, weight: 0.25, scorers: [] },
    },
    scorerResults: [],
    judge: {
      score: 0.42,
      rubricScores: { faithful: 0.4, useful: 0.42, policy: 0.45 },
      model: "judge",
      provider: "local",
      modelFamily: "local",
      promptTemplateVersion: "v1",
      promptHash: "hash",
      positionBiasMitigation: { swapAugmentation: true, orderAgreement: true },
    },
    driftGuard: {
      status: "passed",
      agreement: 1,
      floor: 0.85,
      goldenSetVersion: "golden",
      examples: [],
    },
    configHash: "config",
    goldenSetPath: "./golden-sets/ops-50.jsonl",
    startedAt: "2026-05-15T00:00:00.000Z",
    completedAt: "2026-05-15T00:00:01.000Z",
  };
}

describe("SdkBackedEvalService", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requires an explicit internal API key in production", () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousInternalKey = process.env.MEMROOS_INTERNAL_API_KEY;
    process.env.NODE_ENV = "production";
    delete process.env.MEMROOS_INTERNAL_API_KEY;

    expect(() => new SdkBackedEvalService()).toThrow(/MEMROOS_INTERNAL_API_KEY/);

    process.env.NODE_ENV = previousNodeEnv;
    if (previousInternalKey === undefined) {
      delete process.env.MEMROOS_INTERNAL_API_KEY;
    } else {
      process.env.MEMROOS_INTERNAL_API_KEY = previousInternalKey;
    }
  });

  it("persists modeled proposal re-scores through the public trace API", async () => {
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const href = String(url);
      if (href.endsWith("/api/public/v1/runs/run-low")) {
        return Response.json({ run: baselineRun() });
      }
      if (href.endsWith("/api/public/v1/traces") && init?.method === "POST") {
        return Response.json({ runId: "eval-run-persisted", w: 0.43, layers: {} });
      }
      return Response.json({ error: "unexpected request" }, { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const service = new SdkBackedEvalService({
      baseUrl: "https://memroos.example",
      apiKey: "explicit-key",
    });
    const result = await service.rescoreForProposal({
      traceId: "trace-low",
      agentId: "agent-1",
      baselineRunId: "run-low",
      proposalType: "salience_update",
      diff: { kind: "salience_update", marker: "sdk-persist" },
      forecastWDelta: 0.08,
    });

    expect(result.id).toBe("eval-run-persisted");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://memroos.example/api/public/v1/traces",
      expect.objectContaining({ method: "POST" })
    );
    const traceBody = JSON.parse((fetchMock.mock.calls[1]?.[1] as RequestInit).body as string) as {
      metadata?: Record<string, unknown>;
    };
    expect(traceBody.metadata?.sealModeledRescore).toBe(true);
  });

  it("runForTrace posts a synthetic trace and fetches the resulting run", async () => {
    const run = { ...baselineRun(), id: "run-rerun", agentId: "agent-rerun" };
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const href = String(url);
      if (href.endsWith("/api/public/v1/traces") && init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as { traceId: string; agentId: string };
        expect(body.traceId).toMatch(/^trace-1-rerun-/);
        expect(body.agentId).toBe("agent-rerun");
        return Response.json({ runId: "run-rerun" });
      }
      if (href.endsWith("/api/public/v1/runs/run-rerun") && init?.method === "GET") {
        return Response.json({ run });
      }
      return Response.json({ error: "unexpected request" }, { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const service = new SdkBackedEvalService({
      baseUrl: "https://memroos.example/",
      apiKey: "explicit-key",
    });
    await expect(service.runForTrace("trace-1", "agent-rerun")).resolves.toMatchObject({
      id: "run-rerun",
      agentId: "agent-rerun",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://memroos.example/api/public/v1/traces",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("surfaces public API errors from POST and GET calls", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ error: "trace denied" }, { status: 403 }))
    );
    const service = new SdkBackedEvalService({
      baseUrl: "https://memroos.example",
      apiKey: "explicit-key",
    });
    await expect(service.runForTrace("trace-denied")).rejects.toThrow();

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL, init?: RequestInit) => {
        if (String(url).endsWith("/api/public/v1/traces") && init?.method === "POST") {
          return Response.json({ runId: "run-missing" });
        }
        return new Response("not json", { status: 502, statusText: "Bad Gateway" });
      })
    );
    await expect(service.runForTrace("trace-get-fails")).rejects.toThrow();
  });

  it("rejects proposal re-scores when the baseline run belongs to another agent", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ run: { ...baselineRun(), agentId: "agent-other" } }))
    );

    const service = new SdkBackedEvalService({
      baseUrl: "https://memroos.example",
      apiKey: "explicit-key",
    });
    await expect(
      service.rescoreForProposal({
        traceId: "trace-low",
        agentId: "agent-1",
        baselineRunId: "run-low",
        proposalType: "salience_update",
        diff: { kind: "salience_update" },
        forecastWDelta: 0.08,
      })
    ).rejects.toThrow();
  });

  it("returns direct modeled result ids when no modeled W lift is persisted", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ run: baselineRun() }))
    );

    const service = new SdkBackedEvalService({
      baseUrl: "https://memroos.example",
      apiKey: "explicit-key",
    });
    const result = await service.rescoreForProposal({
      traceId: "trace-low",
      agentId: "agent-1",
      baselineRunId: "run-low",
      proposalType: "agent_instruction_patch",
      diff: { kind: "salience_update", marker: "no-lift" },
      forecastWDelta: 0,
    });
    expect(result.id).toBe("run-low");
  });

  it("factory returns SDK service only in production and getRunById is unused", () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousInternalKey = process.env.MEMROOS_INTERNAL_API_KEY;
    try {
      process.env.NODE_ENV = "test";
      expect(createEvalServiceForSeal({ apiKey: "explicit-key" })).toBeNull();

      process.env.NODE_ENV = "production";
      const service = createEvalServiceForSeal({
        baseUrl: "https://memroos.example",
        apiKey: "explicit-key",
      });
      expect(service).toBeInstanceOf(SdkBackedEvalService);
      expect(service?.getRunById()).toBeNull();
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
      if (previousInternalKey === undefined) {
        delete process.env.MEMROOS_INTERNAL_API_KEY;
      } else {
        process.env.MEMROOS_INTERNAL_API_KEY = previousInternalKey;
      }
    }
  });
});
