// @vitest-environment node
import { describe, expect, it } from "vitest";

import { registerTrajectoryScorer, trajectoryMultiStepScorer } from "../trajectory-scorer";
import type { TrajectoryTrace } from "../trajectory-types";
import { buildDefaultEvalConfig } from "../config";
import type { AgentEvalTrace, EvalScoringContext, EvalJudgeResult } from "../types";

function makeJudge(faithful = 0.8, useful = 0.8, policy = 0.8): EvalJudgeResult {
  return {
    score: (faithful + useful + policy) / 3,
    rubricScores: { faithful, useful, policy },
    model: "judge-model",
    provider: "anthropic",
    modelFamily: "anthropic",
    promptTemplateVersion: "v1",
    promptHash: "test-hash",
    positionBiasMitigation: { swapAugmentation: false, orderAgreement: true },
  };
}

function makeContext(judge = makeJudge()): EvalScoringContext {
  return {
    config: buildDefaultEvalConfig(),
    judge,
    goldenSet: [],
  };
}

// Base trace shared across tests (no steps = single-turn)
const baseSingleTurnTrace: AgentEvalTrace = {
  traceId: "test-single",
  agentId: "test-agent",
  agentModelFamily: "openai",
  role: "ops",
  input: "Summarize the pipeline.",
  output: "Pipeline is running normally.",
};

describe("trajectory_multi_step scorer", () => {
  it("falls back to rubric average when no steps are present", () => {
    const context = makeContext(makeJudge(0.8, 0.6, 0.7));
    const result = trajectoryMultiStepScorer.score(baseSingleTurnTrace, context);

    expect(result.scorerId).toBe("trajectory_multi_step");
    expect(result.layer).toBe("l2");
    // Rubric average: (0.8 + 0.6 + 0.7) / 3 = 0.7
    expect(result.score).toBeCloseTo(0.7, 3);
    expect(result.metadata?.fallback).toBe(true);
  });

  it("falls back gracefully when steps is an empty array", () => {
    const traceWithEmptySteps = { ...baseSingleTurnTrace, steps: [] } as unknown as AgentEvalTrace;
    const context = makeContext(makeJudge(0.9, 0.9, 0.9));
    const result = trajectoryMultiStepScorer.score(traceWithEmptySteps, context);

    expect(result.score).toBeCloseTo(0.9, 3);
    expect(result.metadata?.fallback).toBe(true);
  });

  it("scores a multi-step trace and averages step scores", () => {
    const trajectory: TrajectoryTrace = {
      ...baseSingleTurnTrace,
      traceId: "test-trajectory",
      steps: [
        {
          stepIndex: 0,
          input: "Step 0",
          output: "Step 0 output",
          toolCalls: [{ name: "tool.a", valid: true }],
          outcome: { completed: true, escalated: false },
        },
        {
          stepIndex: 1,
          input: "Step 1",
          output: "Step 1 output",
          toolCalls: [],
          outcome: { completed: true, escalated: false },
        },
      ],
      finalOutput: "Done",
    };

    const judge = makeJudge(0.8, 0.8, 0.8); // rubric avg = 0.8
    const context = makeContext(judge);
    const result = trajectoryMultiStepScorer.score(trajectory as unknown as AgentEvalTrace, context);

    // Both steps have no invalid calls and no escalation, so each scores 0.8
    expect(result.score).toBeCloseTo(0.8, 3);
    expect(result.metadata?.stepCount).toBe(2);
    expect(result.metadata?.fallback).toBeUndefined();
  });

  it("reduces step score when toolCalls contains an invalid call", () => {
    const trajectoryWithInvalidCall: TrajectoryTrace = {
      ...baseSingleTurnTrace,
      traceId: "test-invalid-tool",
      steps: [
        {
          stepIndex: 0,
          input: "Step with bad tool call",
          output: "Failed output",
          toolCalls: [{ name: "tool.bad", valid: false }], // invalid call
          outcome: { completed: false, escalated: false },
        },
      ],
      finalOutput: "Failed",
    };

    const validTrajectory: TrajectoryTrace = {
      ...baseSingleTurnTrace,
      traceId: "test-valid-tool",
      steps: [
        {
          stepIndex: 0,
          input: "Step with good tool call",
          output: "Good output",
          toolCalls: [{ name: "tool.good", valid: true }],
          outcome: { completed: true, escalated: false },
        },
      ],
      finalOutput: "Good",
    };

    const judge = makeJudge(0.8, 0.8, 0.8); // rubric avg = 0.8
    const context = makeContext(judge);

    const invalidResult = trajectoryMultiStepScorer.score(
      trajectoryWithInvalidCall as unknown as AgentEvalTrace,
      context
    );
    const validResult = trajectoryMultiStepScorer.score(
      validTrajectory as unknown as AgentEvalTrace,
      context
    );

    // Invalid call deducts 0.15; valid does not
    expect(invalidResult.score).toBeLessThan(validResult.score);
    expect(invalidResult.score).toBeCloseTo(0.65, 3); // 0.8 - 0.15 = 0.65
    expect(validResult.score).toBeCloseTo(0.8, 3);
  });

  it("applies escalation penalty on top of tool call penalty", () => {
    const escalatedTrace: TrajectoryTrace = {
      ...baseSingleTurnTrace,
      traceId: "test-escalated",
      steps: [
        {
          stepIndex: 0,
          input: "Escalated step",
          output: "Escalated",
          toolCalls: [{ name: "tool.bad", valid: false }],
          outcome: { completed: false, escalated: true },
        },
      ],
      finalOutput: "Escalated",
    };

    const judge = makeJudge(0.8, 0.8, 0.8); // rubric avg = 0.8
    const context = makeContext(judge);
    const result = trajectoryMultiStepScorer.score(
      escalatedTrace as unknown as AgentEvalTrace,
      context
    );

    // 0.8 - 0.15 (invalid call) - 0.1 (escalation) = 0.55
    expect(result.score).toBeCloseTo(0.55, 3);
  });

  it("score never goes below 0 regardless of penalties", () => {
    const maxPenaltyTrace: TrajectoryTrace = {
      ...baseSingleTurnTrace,
      traceId: "test-max-penalty",
      steps: [
        {
          stepIndex: 0,
          input: "Terrible step",
          output: "Everything failed",
          // 6 invalid calls: 6 * 0.15 = 0.9 penalty — would exceed base score
          toolCalls: Array.from({ length: 6 }, (_, i) => ({ name: `tool.bad.${i}`, valid: false })),
          outcome: { completed: false, escalated: true },
        },
      ],
      finalOutput: "Failed",
    };

    const judge = makeJudge(0.3, 0.3, 0.3); // rubric avg = 0.3
    const context = makeContext(judge);
    const result = trajectoryMultiStepScorer.score(
      maxPenaltyTrace as unknown as AgentEvalTrace,
      context
    );

    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
  });

  it("same-family agent/judge block is enforced by the eval engine (not scorer)", () => {
    // The same-family block lives in scoreTraceWithEvalEngine, not in this scorer.
    // This test documents that the scorer itself does not throw for same-family;
    // the engine layer is responsible for that guard.
    const sameFamilyTrace: AgentEvalTrace = {
      ...baseSingleTurnTrace,
      agentModelFamily: "anthropic", // same as judge family in default config
    };
    const context = makeContext(); // judge modelFamily = "anthropic"
    // Scorer itself should NOT throw — the engine throws, not the scorer
    expect(() => trajectoryMultiStepScorer.score(sameFamilyTrace, context)).not.toThrow();
  });

  it("is registered as an L2 scorer", () => {
    expect(trajectoryMultiStepScorer.layer).toBe("l2");
    expect(trajectoryMultiStepScorer.id).toBe("trajectory_multi_step");
  });

  it("registers itself into scorer registries", () => {
    const registry = new Map();

    registerTrajectoryScorer(registry);

    expect(registry.get("trajectory_multi_step")).toBe(trajectoryMultiStepScorer);
  });
});
