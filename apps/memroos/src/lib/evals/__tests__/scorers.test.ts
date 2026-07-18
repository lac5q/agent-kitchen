// @vitest-environment node
import { describe, expect, it } from "vitest";

import { buildDefaultEvalConfig } from "../config";
import { createBuiltInScorers, scorerIdsForLayer } from "../scorers";
import type { AgentEvalTrace, EvalScoringContext } from "../types";

const trace: AgentEvalTrace = {
  traceId: "trace-scorers",
  agentId: "agent-1",
  agentModelFamily: "openai",
  input: "Return JSON",
  output: "{\"ok\":true}",
};

const context: EvalScoringContext = {
  config: buildDefaultEvalConfig(),
  judge: {
    score: 0.8,
    rubricScores: { faithful: 0.8, useful: 0.7, policy: 0.9 },
    model: "judge",
    provider: "anthropic",
    modelFamily: "anthropic",
    promptTemplateVersion: "v1",
    promptHash: "hash",
    positionBiasMitigation: { swapAugmentation: false, orderAgreement: true },
  },
  goldenSet: [],
};

describe("built-in eval scorers", () => {
  it("scores neutral branches for missing tool, memory, TTR, and cost signals", () => {
    const scorers = new Map(createBuiltInScorers().map((scorer) => [scorer.id, scorer]));

    expect(scorers.get("tool_call_schema")?.score(trace, context).score).toBe(0.75);
    expect(scorers.get("memory_recall_l1")?.score(trace, context).score).toBe(0.5);
    expect(scorers.get("ttr_p50")?.score(trace, context).score).toBe(0.5);
    expect(scorers.get("cost_per_task")?.score(trace, context).score).toBe(0.5);
  });

  it("returns configured scorer ids per layer", () => {
    expect(scorerIdsForLayer(context, "l1")).toBe(context.config.scorers.l1Capability);
    expect(scorerIdsForLayer(context, "l2")).toBe(context.config.scorers.l2Quality);
    expect(scorerIdsForLayer(context, "l3")).toBe(context.config.scorers.l3Outcome);
  });
});
