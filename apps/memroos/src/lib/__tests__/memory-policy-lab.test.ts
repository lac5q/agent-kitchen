// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  rankMemoryPolicies,
  type MemoryPolicyVariant,
  type PolicyEvaluator,
} from "../memory/policy-lab";
import type { EvalRunResult } from "../evals/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Builds a minimal EvalRunResult with a given compositeW for test assertions. */
function makeRun(compositeW: number, id = `run-${compositeW}`): EvalRunResult {
  const layerBreakdown = { score: compositeW, weight: 0.33, scorers: [] };
  return {
    id,
    traceId: `trace-${id}`,
    agentId: "test-agent",
    role: "memory-recall",
    compositeW,
    trusted: true,
    layers: { l1: layerBreakdown, l2: layerBreakdown, l3: layerBreakdown },
    scorerResults: [],
    judge: {
      score: compositeW,
      rubricScores: { faithful: compositeW, useful: compositeW, policy: compositeW },
      model: "test-model",
      provider: "test",
      modelFamily: "test",
      promptTemplateVersion: "v1",
      promptHash: "testhash",
      positionBiasMitigation: { swapAugmentation: false, orderAgreement: false },
    },
    driftGuard: {
      status: "passed",
      agreement: 1,
      floor: 0.85,
      goldenSetVersion: "test",
      examples: [],
    },
    configHash: "test",
    goldenSetPath: "./golden-sets/test.jsonl",
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
  };
}

/** A deterministic evaluator that returns a fixed W per variant name. */
function makeFixedEvaluator(wByName: Record<string, number>): PolicyEvaluator {
  return (variant) => {
    const w = wByName[variant.name];
    if (w === undefined) throw new Error(`Unknown variant in test: ${variant.name}`);
    return makeRun(w, `run-${variant.name}`);
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("rankMemoryPolicies", () => {
  it("returns results sorted by compositeW descending", async () => {
    const variants: MemoryPolicyVariant[] = [
      { name: "low", config: { k: 3 } },
      { name: "high", config: { k: 10 } },
      { name: "mid", config: { k: 5 } },
    ];
    const evaluator = makeFixedEvaluator({ low: 0.4, high: 0.9, mid: 0.6 });

    const results = await rankMemoryPolicies(variants, "./test.jsonl", evaluator);

    expect(results).toHaveLength(3);
    expect(results[0].name).toBe("high");
    expect(results[0].compositeW).toBe(0.9);
    expect(results[0].rank).toBe(1);

    expect(results[1].name).toBe("mid");
    expect(results[1].compositeW).toBe(0.6);
    expect(results[1].rank).toBe(2);

    expect(results[2].name).toBe("low");
    expect(results[2].compositeW).toBe(0.4);
    expect(results[2].rank).toBe(3);
  });

  it("returns deterministic results — same inputs produce same ranking", async () => {
    const variants: MemoryPolicyVariant[] = [
      { name: "alpha", config: { k: 5, tier: "vector" } },
      { name: "beta", config: { k: 7, tier: "episodic" } },
      { name: "gamma", config: { k: 3, tier: "graph" } },
    ];
    const evaluator = makeFixedEvaluator({ alpha: 0.72, beta: 0.88, gamma: 0.55 });

    const run1 = await rankMemoryPolicies(variants, "./test.jsonl", evaluator);
    const run2 = await rankMemoryPolicies(variants, "./test.jsonl", evaluator);

    expect(run1.map((r) => r.name)).toEqual(run2.map((r) => r.name));
    expect(run1.map((r) => r.compositeW)).toEqual(run2.map((r) => r.compositeW));
    expect(run1.map((r) => r.rank)).toEqual(run2.map((r) => r.rank));
  });

  it("returns an empty array for an empty variants list", async () => {
    const evaluator = makeFixedEvaluator({});
    const results = await rankMemoryPolicies([], "./test.jsonl", evaluator);
    expect(results).toEqual([]);
  });

  it("returns a single-element array when one variant is passed", async () => {
    const variants: MemoryPolicyVariant[] = [
      { name: "solo", config: { k: 5 } },
    ];
    const evaluator = makeFixedEvaluator({ solo: 0.75 });
    const results = await rankMemoryPolicies(variants, "./test.jsonl", evaluator);
    expect(results).toHaveLength(1);
    expect(results[0].rank).toBe(1);
    expect(results[0].compositeW).toBe(0.75);
  });

  it("includes variantConfig and evalRunId in each result", async () => {
    const variants: MemoryPolicyVariant[] = [
      { name: "x", config: { foo: "bar", num: 42 } },
    ];
    const evaluator = makeFixedEvaluator({ x: 0.8 });
    const results = await rankMemoryPolicies(variants, "./test.jsonl", evaluator);
    expect(results[0].variantConfig).toEqual({ foo: "bar", num: 42 });
    expect(typeof results[0].evalRunId).toBe("string");
    expect(results[0].evalRunId.length).toBeGreaterThan(0);
  });

  it("preserves insertion order for tied W values (stable sort)", async () => {
    const variants: MemoryPolicyVariant[] = [
      { name: "first-tied", config: { a: 1 } },
      { name: "second-tied", config: { a: 2 } },
      { name: "winner", config: { a: 3 } },
    ];
    // first-tied and second-tied both get W=0.5, winner gets W=0.9
    const evaluator = makeFixedEvaluator({
      "first-tied": 0.5,
      "second-tied": 0.5,
      winner: 0.9,
    });

    const results = await rankMemoryPolicies(variants, "./test.jsonl", evaluator);
    expect(results[0].name).toBe("winner");
    // Tied variants appear in their original insertion order
    expect(results[1].name).toBe("first-tied");
    expect(results[2].name).toBe("second-tied");
  });

  it("exposes layer scores for each result", async () => {
    const variants: MemoryPolicyVariant[] = [
      { name: "layered", config: { k: 5 } },
    ];
    const evaluator = makeFixedEvaluator({ layered: 0.65 });
    const results = await rankMemoryPolicies(variants, "./test.jsonl", evaluator);
    expect(typeof results[0].layerScores.l1).toBe("number");
    expect(typeof results[0].layerScores.l2).toBe("number");
    expect(typeof results[0].layerScores.l3).toBe("number");
  });
});

describe("rankMemoryPolicies default evaluator", () => {
  it("scores variants deterministically against a golden set path", async () => {
    const variants: MemoryPolicyVariant[] = [
      { name: "k=3 vector-first", config: { k: 3, tier: "vector" } },
      { name: "k=10 episodic", config: { k: 10, tier: "episodic" } },
    ];

    const results = await rankMemoryPolicies(variants, "./golden-sets/business-ops-50.jsonl");

    expect(results).toHaveLength(2);
    expect(results[0].compositeW).toBeGreaterThan(0);
    expect(results[1].compositeW).toBeGreaterThan(0);
    expect(results[0].evalRunId).toBeTruthy();
    expect(results[0].layerScores.l1).toBeGreaterThan(0);

    const rerun = await rankMemoryPolicies(variants, "./golden-sets/business-ops-50.jsonl");
    expect(rerun.map((row) => row.compositeW)).toEqual(results.map((row) => row.compositeW));
    expect(rerun.map((row) => row.name)).toEqual(results.map((row) => row.name));
  });

  it("differentiates variants with different configs via the built-in scorer", async () => {
    const variants: MemoryPolicyVariant[] = [
      { name: "alpha", config: { k: 1, decay: 0.1 } },
      { name: "beta", config: { k: 9, decay: 0.9, routing: "graph-first" } },
    ];

    const results = await rankMemoryPolicies(variants, "./golden-sets/business-ops-50.jsonl");

    const scores = results.map((row) => row.compositeW);
    expect(new Set(scores).size).toBe(2);
    expect(results[0].rank).toBe(1);
    expect(results[1].rank).toBe(2);
  });

  it("resolves role keys through eval config golden set mapping", async () => {
    const variants: MemoryPolicyVariant[] = [
      { name: "sales-policy", config: { k: 5 } },
    ];
    let resolvedPath = "";
    const capturePath: PolicyEvaluator = (variant, goldenSetPath) => {
      resolvedPath = goldenSetPath;
      return makeRun(0.7, `run-${variant.name}`);
    };

    await rankMemoryPolicies(variants, "sales", capturePath);

    expect(resolvedPath).toBe("./golden-sets/sales-50.jsonl");
  });

  it("falls back to the default golden set for unknown role keys", async () => {
    const variants: MemoryPolicyVariant[] = [
      { name: "unknown-role", config: { k: 5 } },
    ];
    let resolvedPath = "";
    const capturePath: PolicyEvaluator = (_variant, goldenSetPath) => {
      resolvedPath = goldenSetPath;
      return makeRun(0.6);
    };

    await rankMemoryPolicies(variants, "nonexistent-role", capturePath);

    expect(resolvedPath).toBe("./golden-sets/business-ops-50.jsonl");
  });

  it("accepts absolute golden set paths", async () => {
    const { getRepoRoot } = await import("@/lib/paths");
    const absolutePath = `${getRepoRoot()}/golden-sets/business-ops-50.jsonl`;
    const variants: MemoryPolicyVariant[] = [
      { name: "abs-path", config: { k: 5 } },
    ];
    let resolvedPath = "";
    const capturePath: PolicyEvaluator = (_variant, goldenSetPath) => {
      resolvedPath = goldenSetPath;
      return makeRun(0.8);
    };

    await rankMemoryPolicies(variants, absolutePath, capturePath);

    expect(resolvedPath).toBe(absolutePath);
  });

  it("supports async evaluators", async () => {
    const variants: MemoryPolicyVariant[] = [
      { name: "async-variant", config: { k: 5 } },
    ];
    const asyncEvaluator: PolicyEvaluator = async (variant) => {
      await Promise.resolve();
      return makeRun(0.77, `async-${variant.name}`);
    };

    const results = await rankMemoryPolicies(variants, "./test.jsonl", asyncEvaluator);

    expect(results[0].compositeW).toBe(0.77);
    expect(results[0].evalRunId).toBe("async-async-variant");
  });
});
