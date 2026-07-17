// @vitest-environment node
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  buildDefaultEvalConfig,
  evalConfigPath,
  formatEvalConfigYaml,
  hashEvalConfig,
  loadEvalConfig,
  parseEvalConfigYaml,
  saveEvalConfig,
  setActivePreset,
  weightsForAgent,
} from "../config";

const TMP_DIR = path.join(os.tmpdir(), `eval-config-test-${Date.now()}`);

describe("evals config helpers", () => {
  beforeEach(() => {
    fs.mkdirSync(TMP_DIR, { recursive: true });
    process.env.MEMROOS_ROOT = TMP_DIR;
  });

  afterEach(() => {
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
    delete process.env.MEMROOS_ROOT;
  });

  it("round-trips YAML through format, save, and load", () => {
    const config = {
      ...buildDefaultEvalConfig(),
      judgeModel: { ...buildDefaultEvalConfig().judgeModel, localEndpoint: "http://localhost:11434" },
      activePreset: "outcome-weighted",
      cove: { ...buildDefaultEvalConfig().cove, enabled: true, judgeEndpoint: "http://judge.local" },
      agents: {
        sales: { eval: { goldenSet: "./golden-sets/sales.jsonl", weights: { l1: 0.1, l2: 0.2, l3: 0.7 } } },
      },
    };

    const yaml = formatEvalConfigYaml(config);
    expect(yaml).toContain("local_endpoint: http://localhost:11434");
    expect(yaml).toContain("active_preset: outcome-weighted");
    expect(yaml).toContain("judge_endpoint: http://judge.local");

    const parsed = parseEvalConfigYaml(yaml);
    expect(parsed.judgeModel.localEndpoint).toBe("http://localhost:11434");
    expect(parsed.agents.sales.eval?.goldenSet).toBe("./golden-sets/sales.jsonl");

    const filePath = path.join(TMP_DIR, "memroos.eval.yaml");
    saveEvalConfig(config);
    expect(fs.existsSync(filePath)).toBe(true);
    expect(loadEvalConfig().judgeModel.provider).toBe("anthropic");
  });

  it("returns defaults when the config file is missing", () => {
    expect(loadEvalConfig().judgeModel.provider).toBe("anthropic");
    expect(evalConfigPath()).toContain("memroos.eval.yaml");
  });

  it("parses top-level active preset and weight preset blocks", () => {
    const yaml = `
active_preset: quality-weighted
weight_presets:
  custom-inline: { l1: 0.15, l2: 0.45, l3: 0.40 }
`;
    expect(parseEvalConfigYaml(yaml).activePreset).toBe("quality-weighted");
  });

  it("parses weight presets, agents, compliance, finance, and cove clamps", () => {
    const yaml = `
active_preset: quality-weighted
weight_presets:
  custom-inline: { l1: 0.15, l2: 0.45, l3: 0.40 }
  custom-block:
    l1: 0.3
    l2: 0.3
    l3: 0.4
agents:
  support:
    eval:
      golden_set: ./golden-sets/support.jsonl
      weights: { l1: 0.2, l2: 0.5, l3: 0.3 }
finance:
  enabled: true
  transaction_label: txn
compliance:
  data_residency_enabled: true
  allowed_local_hosts: [localhost, ollama]
  adapters_enabled: [hubspot]
cove:
  enabled: true
  max_verification_questions: 99
  parallel_verification: false
  judge_endpoint: http://cove.local
scorers:
  l1_capability: [tool_call_schema]
  l2_quality: [rubric_5pt_faithful]
  l3_outcome: [completion_rate]
`;
    const config = parseEvalConfigYaml(yaml);

    expect(config.activePreset).toBe("quality-weighted");
    expect(config.weightPresets["custom-inline"]).toEqual({ l1: 0.15, l2: 0.45, l3: 0.4 });
    expect(config.weightPresets["custom-block"]).toEqual({ l1: 0.3, l2: 0.3, l3: 0.4 });
    expect(config.agents.support.eval?.weights).toEqual({ l1: 0.2, l2: 0.5, l3: 0.3 });
    expect(config.finance.enabled).toBe(true);
    expect(config.compliance.dataResidency.enabled).toBe(true);
    expect(config.compliance.enabledAdapters).toEqual(["hubspot"]);
    expect(config.cove.maxVerificationQuestions).toBe(12);
    expect(config.cove.parallelVerification).toBe(false);
    expect(config.cove.judgeEndpoint).toBe("http://cove.local");
    expect(config.scorers.l1Capability).toEqual(["tool_call_schema"]);
  });

  it("normalizes per-agent weights and honors active presets", () => {
    const config = buildDefaultEvalConfig();
    config.agents = { ops: { eval: { weights: { l1: 1, l2: 1, l3: 1 } } } };
    const normalized = weightsForAgent(config, "ops");
    expect(normalized.l1 + normalized.l2 + normalized.l3).toBeCloseTo(1, 6);

    config.activePreset = "outcome-weighted";
    expect(weightsForAgent(config, "ops")).toEqual({ l1: 0.1, l2: 0.4, l3: 0.5 });
  });

  it("hashes formatted YAML deterministically", () => {
    const config = buildDefaultEvalConfig();
    expect(hashEvalConfig(config)).toHaveLength(64);
    expect(hashEvalConfig(config)).toBe(hashEvalConfig(config));
  });

  it("updates active preset on disk via setActivePreset", () => {
    saveEvalConfig(buildDefaultEvalConfig());
    const updated = setActivePreset("quality-weighted");
    expect(updated.activePreset).toBe("quality-weighted");
    expect(setActivePreset(null).activePreset).toBeNull();
  });
});
