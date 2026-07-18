// @vitest-environment node
import { describe, expect, it } from "vitest";

import { buildDefaultEvalConfig, parseEvalConfigYaml } from "@/lib/evals/config";
import { createEvalScorerRegistry } from "@/lib/evals/engine";
import type { AgentEvalTrace } from "@/lib/evals/types";
import {
  cove,
  coveHallucinationDeltaScorer,
  createOpenAICompatibleCoveClient,
  runCovePipeline,
} from "../index";

describe("CoVe pipeline", () => {
  it("returns the draft unchanged when disabled or no client is configured", async () => {
    await expect(runCovePipeline({
      input: "Question",
      draft: "Draft answer",
      config: { enabled: false, maxVerificationQuestions: 3, parallelVerification: true },
    })).resolves.toEqual({
      revisedAnswer: "Draft answer",
      trace: {
        input: "Question",
        draft: "Draft answer",
        questions: [],
        factChecks: [],
        revisedAnswer: "Draft answer",
      },
    });

    await expect(runCovePipeline({
      input: "Question",
      draft: "Draft answer",
      config: { enabled: true, maxVerificationQuestions: 3, parallelVerification: true },
    })).resolves.toMatchObject({ revisedAnswer: "Draft answer" });
  });

  it("runs draft, verification questions, checks, and revision through injected clients", async () => {
    const calls: string[] = [];
    const client = async (prompt: string) => {
      calls.push(prompt);
      if (prompt.includes("verification questions")) return "What is the capital?\nWhat country is it in?";
      if (prompt.includes("independent fact-check")) return "Paris is the capital of France.";
      if (prompt.includes("revise")) return "Paris is the capital of France.";
      return "Paris is the capital of Germany.";
    };

    const result = await runCovePipeline({
      input: "What is the capital of France?",
      draft: "Paris is the capital of Germany.",
      config: { enabled: true, maxVerificationQuestions: 2, parallelVerification: false },
      client,
    });

    expect(result.revisedAnswer).toBe("Paris is the capital of France.");
    expect(result.trace.questions).toEqual(["What is the capital?", "What country is it in?"]);
    expect(result.trace.factChecks).toHaveLength(2);
    expect(calls.length).toBe(4);
  });

  it("wraps any agent function and returns the revised answer plus verification trace", async () => {
    const agentFn = async () => "The revenue number was 10M, but cite no source.";
    const result = await cove(agentFn, {
      enabled: true,
      maxVerificationQuestions: 1,
      parallelVerification: true,
      client: async (prompt) => {
        if (prompt.includes("verification questions")) return "Is the revenue number sourced?";
        if (prompt.includes("Revise")) return "The sourced revenue number was 9M.";
        if (prompt.includes("independent fact-check")) return "The source says revenue was 9M.";
        return "The sourced revenue number was 9M.";
      },
    })("Report revenue.");

    expect(result.answer).toBe("The sourced revenue number was 9M.");
    expect(result.trace.draft).toContain("10M");
    expect(result.trace.factChecks[0].answer).toContain("9M");
  });

  it("adapts OpenAI-compatible local endpoints without model-specific branches", async () => {
    const requests: unknown[] = [];
    const client = createOpenAICompatibleCoveClient({
      endpoint: "http://localhost:11434/v1",
      model: "hermes3",
      fetchImpl: async (_url, init) => {
        requests.push(JSON.parse(String(init?.body)));
        return new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }));
      },
    });

    await expect(client("hello")).resolves.toBe("ok");
    expect(requests).toEqual([
      expect.objectContaining({
        model: "hermes3",
        messages: [{ role: "user", content: "hello" }],
      }),
    ]);
  });

  it("uses chat completion endpoints as-is and reports provider failures", async () => {
    const urls: string[] = [];
    const okClient = createOpenAICompatibleCoveClient({
      endpoint: "http://localhost:11434/v1/chat/completions/",
      model: "hermes3",
      apiKey: "test-key",
      fetchImpl: async (url, init) => {
        urls.push(String(url));
        expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer test-key");
        return new Response(JSON.stringify({ choices: [] }));
      },
    });
    await expect(okClient("hello")).resolves.toBe("");
    expect(urls).toEqual(["http://localhost:11434/v1/chat/completions"]);

    const failingClient = createOpenAICompatibleCoveClient({
      endpoint: "http://localhost:11434/v1",
      model: "hermes3",
      fetchImpl: async () => new Response("nope", { status: 503 }),
    });
    let providerError: unknown;
    try {
      await failingClient("hello");
    } catch (error) {
      providerError = error;
    }
    expect(providerError).toBeInstanceOf(Error);
    expect((providerError as Error).message).toBe("CoVe provider failed: 503");
  });
});

describe("CoVe eval scorer", () => {
  it("registers as an eval scorer", () => {
    const registry = createEvalScorerRegistry();
    expect(registry.has("cove_hallucination_delta")).toBe(true);
  });

  it("scores hallucination reduction against baseline trace metadata", () => {
    const baselineTrace: AgentEvalTrace = {
      traceId: "baseline",
      agentId: "agent",
      input: "Name a source-backed amount.",
      output: "Revenue was 10M.",
      expectedFacts: ["Revenue was 9M"],
      metadata: { unsupportedClaims: ["10M"] },
    };
    const coveTrace: AgentEvalTrace = {
      ...baselineTrace,
      traceId: "cove",
      output: "Revenue was 9M.",
      metadata: {
        cove: {
          baselineTrace,
          unsupportedClaims: [],
          corrections: ["10M -> 9M"],
        },
      },
    };

    const result = coveHallucinationDeltaScorer.score(coveTrace, {
      config: buildDefaultEvalConfig(),
      judge: {
        score: 0.9,
        rubricScores: { faithful: 0.9, useful: 0.9, policy: 1 },
        model: "judge",
        provider: "local",
        modelFamily: "local",
        promptTemplateVersion: "v1",
        promptHash: "hash",
        positionBiasMitigation: { swapAugmentation: true, orderAgreement: true },
      },
      goldenSet: [],
    });

    expect(result.score).toBe(1);
    expect(result.metadata).toMatchObject({
      baselineUnsupportedClaims: 1,
      coveUnsupportedClaims: 0,
      corrections: 1,
    });
  });

  it("returns a neutral score when no baseline evidence is available", () => {
    const trace: AgentEvalTrace = {
      traceId: "no-baseline",
      agentId: "agent",
      input: "Prompt",
      output: "Answer",
      expectedFacts: [],
      metadata: {},
    };

    const result = coveHallucinationDeltaScorer.score(trace, {
      config: buildDefaultEvalConfig(),
      judge: {
        score: 0.5,
        rubricScores: { faithful: 0.5, useful: 0.5, policy: 1 },
        model: "judge",
        provider: "local",
        modelFamily: "local",
        promptTemplateVersion: "v1",
        promptHash: "hash",
        positionBiasMitigation: { swapAugmentation: true, orderAgreement: true },
      },
      goldenSet: [],
    });

    expect(result.score).toBe(0.5);
    expect(result.detail).toMatch(/No baseline trace/);
  });

  it("clamps negative hallucination reductions at zero", () => {
    const trace: AgentEvalTrace = {
      traceId: "worse-cove",
      agentId: "agent",
      input: "Prompt",
      output: "Answer",
      expectedFacts: [],
      metadata: {
        baselineUnsupportedClaims: ["one"],
        cove: {
          unsupportedClaims: ["one", "two", "three"],
        },
      },
    };

    const result = coveHallucinationDeltaScorer.score(trace, {
      config: buildDefaultEvalConfig(),
      judge: {
        score: 0.5,
        rubricScores: { faithful: 0.5, useful: 0.5, policy: 1 },
        model: "judge",
        provider: "local",
        modelFamily: "local",
        promptTemplateVersion: "v1",
        promptHash: "hash",
        positionBiasMitigation: { swapAugmentation: true, orderAgreement: true },
      },
      goldenSet: [],
    });

    expect(result.score).toBe(0);
  });

  it("parses CoVe config from eval yaml", () => {
    const config = parseEvalConfigYaml(`
judge_model:
  provider: local
cove:
  enabled: true
  max_verification_questions: 5
  parallel_verification: true
  judge_endpoint: http://localhost:11434/v1
`);

    expect(config.cove).toEqual({
      enabled: true,
      maxVerificationQuestions: 5,
      parallelVerification: true,
      judgeEndpoint: "http://localhost:11434/v1",
    });
  });
});
