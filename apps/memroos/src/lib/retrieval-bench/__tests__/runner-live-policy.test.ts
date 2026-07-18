// @vitest-environment node
import { describe, expect, it } from "vitest";
import { hashScopeIdentity, normalizeScopeIdentity } from "@/lib/msiq/scope-identity";
import { resolveFromRepoRoot } from "@/lib/paths";

const FIXTURES_DIR = resolveFromRepoRoot("evals", "comparative-retrieval", "fixtures");

const LIVE_SCOPE = {
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
  maxFreshnessSeconds: null,
};

describe("runBenchmark live policy filter branches", () => {
  it("records stale and denied live candidates when validation admits policy states", async () => {
    const { runBenchmark } = await import("../runner");
    const { registerAdapter } = await import("../adapters");
    const { liveAdapterEntry } = await import("../adapters/live");
    const normalized = normalizeScopeIdentity(LIVE_SCOPE);
    if (!normalized) throw new Error("expected complete live test scope");
    const scopeHash = hashScopeIdentity(normalized);

    await runBenchmark({
      dataset: "memroos_public_synthetic",
      adapter: "no-memory",
      limit: 1,
      bypassCliParser: true,
      fixturesDir: FIXTURES_DIR,
    });

    registerAdapter("live", {
      provider: null,
      providerVersion: null,
      adapter: {
        id: "live",
        version: "test-live-policy-filter",
        isBaselineControl: false,
        async run(init) {
          const item = (id: string, authorizationResult: "allowed" | "denied" | "stale", score: number) => ({
            id,
            score,
            text: `${id} evidence`,
            tier: "live" as const,
            source: "custom-live",
            authorizationResult,
            whyEntered: "test",
            scopeHash,
            rankPosition: 1,
          });
          const mutablePolicyItem = (
            id: string,
            finalAuthorizationResult: "denied" | "stale",
            score: number
          ) => {
            let reads = 0;
            const candidate = {
              id,
              score,
              text: `${id} evidence`,
              tier: "live" as const,
              source: "custom-live",
              whyEntered: "test",
              scopeHash,
              rankPosition: 1,
            } as Record<string, unknown>;
            Object.defineProperty(candidate, "authorizationResult", {
              enumerable: true,
              get() {
                reads += 1;
                return reads === 1 ? "allowed" : finalAuthorizationResult;
              },
            });
            return candidate as ReturnType<typeof item>;
          };
          return {
            taskId: init.task.id,
            adapterName: "live",
            status: "ok",
            statusDetail: "custom",
            retrieved: [
              item("allowed-live", "allowed", 100),
              mutablePolicyItem("stale-live", "stale", 99),
              mutablePolicyItem("denied-live", "denied", 98),
            ],
            injected: ["allowed-live"],
            ignored: [],
            latencyMs: 1,
            receipt: {
              adapterName: "live",
              adapterVersion: "test-live-policy-filter",
              status: "ok",
              statusDetail: "custom",
              latencyMs: 1,
              authorization: { evaluated: true, allowed: true, scopeHash },
              provenance: {
                provider: null,
                providerVersion: null,
                retrievalPolicyVersion: init.retrievalPolicyVersion,
                configHash: init.configHash,
                fixtureHash: init.fixtureHash,
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
        },
      },
    });

    try {
      const result = await runBenchmark({
        dataset: "memroos_public_synthetic",
        adapter: "live",
        limit: 1,
        k: 3,
        seed: 0,
        bypassCliParser: true,
        fixturesDir: FIXTURES_DIR,
        scope: LIVE_SCOPE,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const task = result.report.tasks[0];
      const records = result.pipeline?.perTaskStageRecords.get(task.taskId) ?? [];
      expect(records.find((record) => record.stage === "stale")?.ids).toContain("stale-live");
      expect(records.find((record) => record.stage === "denied")?.ids).toContain("denied-live");
      expect(records.find((record) => record.stage === "ignored")?.ids).toEqual(
        expect.arrayContaining(["stale-live", "denied-live"])
      );
    } finally {
      registerAdapter("live", liveAdapterEntry);
    }
  });
});
