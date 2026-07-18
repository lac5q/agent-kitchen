// @vitest-environment node
import { describe, expect, it } from "vitest";

import { buildDefaultEvalConfig, parseEvalConfigYaml } from "@/lib/evals/config";
import { judgeTrace } from "@/lib/evals/judge";
import {
  assertJudgeResidency,
  isLocalEndpoint,
  summarizeCompliancePosture,
} from "../data-residency";

describe("data residency policy", () => {
  it("leaves existing judge behavior unchanged when residency mode is disabled", () => {
    const config = buildDefaultEvalConfig();
    expect(() => assertJudgeResidency(config)).not.toThrow();
    const result = judgeTrace(
      {
        traceId: "trace-default",
        agentId: "agent-1",
        agentModelFamily: "openai",
        input: "Summarize retained finance context.",
        output: "Summarized retained finance context.",
        expectedFacts: ["finance context"],
        outcome: { completed: true },
      },
      config
    );
    expect(result.provider).toBe("anthropic");
  });

  it("blocks external judge providers when data residency is enabled", () => {
    const config = parseEvalConfigYaml(`
judge_model:
  provider: anthropic
  model: claude-haiku
  model_family: anthropic
compliance:
  data_residency_enabled: true
`);

    expect(() => assertJudgeResidency(config)).toThrow(/DATA_RESIDENCY_BLOCKED/);
  });

  it("allows Ollama and vLLM local judge endpoints", () => {
    const ollama = parseEvalConfigYaml(`
judge_model:
  provider: ollama
  model: hermes3
  model_family: local
  local_endpoint: http://localhost:11434/v1
compliance:
  data_residency_enabled: true
`);
    const vllm = parseEvalConfigYaml(`
judge_model:
  provider: openai-compatible
  model: local-judge
  model_family: local
  local_endpoint: http://127.0.0.1:8000/v1
compliance:
  data_residency_enabled: true
`);

    expect(() => assertJudgeResidency(ollama)).not.toThrow();
    expect(() => assertJudgeResidency(vllm)).not.toThrow();
  });

  it("rejects non-local OpenAI-compatible judge endpoints in residency mode", () => {
    const config = parseEvalConfigYaml(`
judge_model:
  provider: openai-compatible
  model: remote-judge
  model_family: local
  local_endpoint: https://api.example.com/v1
compliance:
  data_residency_enabled: true
`);

    expect(() => assertJudgeResidency(config)).toThrow(/local endpoint/);
  });

  it("summarizes local endpoint and adapter posture", () => {
    const config = parseEvalConfigYaml(`
judge_model:
  provider: ollama
  model: hermes3
  model_family: local
  local_endpoint: http://host.docker.internal:11434/v1
compliance:
  data_residency_enabled: true
  audit_retention_days: 730
  adapters_enabled: [quickbooks, bank_reconciliation]
`);

    expect(isLocalEndpoint(config.judgeModel.localEndpoint)).toBe(true);
    expect(summarizeCompliancePosture(config)).toMatchObject({
      dataResidencyEnabled: true,
      judgeProvider: "ollama",
      judgeEndpointLocal: true,
      auditRetentionDays: 730,
      enabledAdapters: ["quickbooks", "bank_reconciliation"],
    });
  });

  it("honors configured local hosts and rejects malformed endpoints", () => {
    expect(isLocalEndpoint("http://gpu-box.internal:8000/v1", ["gpu-box.internal"])).toBe(true);
    expect(isLocalEndpoint("not a url", ["gpu-box.internal"])).toBe(false);
    expect(isLocalEndpoint(null, ["gpu-box.internal"])).toBe(false);
  });
});
