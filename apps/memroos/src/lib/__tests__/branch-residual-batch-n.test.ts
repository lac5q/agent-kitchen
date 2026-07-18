// @vitest-environment node
import fs from "fs";
import os from "os";
import path from "path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { writeAuditLog } from "@/lib/audit";
import { buildAgentCard } from "@/lib/dispatch/build-agent-card";
import { resolveWeights } from "@/lib/evals/presets";
import { ensureEvalTables, listEvalRuns } from "@/lib/evals/persistence";
import { generateGoldenSet, mannWhitneyU, runBehavioralABTest } from "@/lib/skillforge/behavioral-eval";
import { buildMessageMemoryDedupeKey, contentHash } from "@/lib/message-memory/dedupe";
import { filterNativeMemory } from "@/lib/native-memory/filter";
import { checkRateLimit } from "@/lib/public-api/rate-limiter";
import { anonymizePiiForStorage, detectPiiForStorage, protectMemoryPayloadForStorage } from "@/lib/privacy/pii-storage";
import { buildObservabilityModel, renderObservabilityHtml } from "@/lib/agent-runtime/observability";
import { isOpenInferenceTrace, mapOpenInferenceToAgentEvalTrace } from "@/lib/evals/openinference-mapper";
import { goldenSetPathForTrace, hashGoldenSet, loadGoldenSet } from "@/lib/evals/golden-sets";

const pathMocks = vi.hoisted(() => ({
  repoRoot: (() => {
    const nodeFs = require("fs") as typeof import("fs");
    const nodeOs = require("os") as typeof import("os");
    const nodePath = require("path") as typeof import("path");
    return nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "memroos-golden-root-"));
  })(),
}));

vi.mock("@/lib/paths", () => ({
  getRepoRoot: () => pathMocks.repoRoot,
  resolveFromRepoRoot: (relativePath: string) => path.resolve(pathMocks.repoRoot, relativePath),
}));

describe("Batch N residual library branch coverage", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("maps OpenInference fallback IDs, optional fields, and extra attributes", () => {
    expect(isOpenInferenceTrace(null)).toBe(false);
    expect(isOpenInferenceTrace("not-a-span")).toBe(false);
    expect(isOpenInferenceTrace({ "openinference.span.kind": "LLM" })).toBe(true);

    vi.spyOn(Math, "random").mockReturnValue(0.123456);
    const trace = mapOpenInferenceToAgentEvalTrace({
      "openinference.span.kind": "TOOL",
      "input.value": "input",
      custom: "<raw>",
    });

    expect(trace.traceId).toMatch(/^oi-/);
    expect(trace.agentId).toBe("unknown");
    expect(trace.output).toBe("");
    expect(trace.outcome).toBeUndefined();
    expect(trace.metadata.openInferenceAttributes).toEqual({ custom: "<raw>" });
  });

  it("loads golden sets only inside the golden-set root and resolves weight fallbacks", () => {
    const dir = path.join(pathMocks.repoRoot, "golden-sets");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, "demo.jsonl");
    fs.writeFileSync(file, '{"id":"g1","input":"a","expected":"b"}\n\n{"id":"g2"}\n');

    expect(loadGoldenSet("../outside.jsonl")).toEqual([]);
    expect(loadGoldenSet("golden-sets/missing.jsonl")).toEqual([]);
    expect(loadGoldenSet("golden-sets/demo.jsonl")).toHaveLength(2);
    expect(hashGoldenSet([{ id: "g1" } as never])).toMatch(/^[a-f0-9]{16}$/);

    const config = {
      agents: {
        "agent-1": { eval: { goldenSet: "golden-sets/agent.jsonl" } },
      },
      goldenSets: {
        default: "golden-sets/default.jsonl",
        perRole: { sales: "golden-sets/sales.jsonl" },
      },
      activePreset: "compliance-weighted",
      weightPresets: {},
      weights: { l1: 1, l2: 0, l3: 0 },
    } as never;

    expect(goldenSetPathForTrace(config, { agentId: "agent-1" })).toBe("golden-sets/agent.jsonl");
    expect(goldenSetPathForTrace(config, { agentId: "agent-2", role: "sales" })).toBe("golden-sets/sales.jsonl");
    expect(goldenSetPathForTrace(config, { agentId: "agent-2" })).toBe("golden-sets/default.jsonl");
    expect(resolveWeights(config)).toEqual({ l1: 0.4, l2: 0.4, l3: 0.2 });
    expect(resolveWeights({ ...config, activePreset: "missing" } as never)).toEqual({ l1: 1, l2: 0, l3: 0 });
  });

  it("handles malformed legacy eval rows without persisted judge scores", () => {
    const db = new Database(":memory:");
    ensureEvalTables(db);
    db.prepare(
      `INSERT INTO eval_runs (
        id, trace_id, agent_id, role, composite_w, trusted, drift_agreement, drift_status,
        layer_breakdown_json, scorer_results_json, judge_provider, judge_model, judge_model_family,
        prompt_template_version, prompt_hash, golden_set_path, golden_set_version, config_hash,
        started_at, completed_at, judge_score_json, tenant_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "run-1",
      "trace-1",
      "agent-1",
      "operator",
      0.5,
      1,
      0.9,
      "passed",
      "{}",
      "[]",
      "local",
      "judge",
      "local",
      "v1",
      "hash",
      "golden.jsonl",
      "v1",
      "cfg",
      "2026-01-01T00:00:00.000Z",
      "2026-01-01T00:01:00.000Z",
      "{not json",
      "tenant-1"
    );

    const [run] = listEvalRuns(db, 5);
    expect(run.judge.score).toBe(0);
    expect(run.judge.rubricScores).toEqual({ faithful: 0, useful: 0, policy: 0 });
    db.close();
  });

  it("exercises token bucket deny/refill and message-memory normalization branches", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const config = { requestsPerMinute: 60, burst: 1 };
    expect(checkRateLimit("tenant-batch-n", config)).toMatchObject({ allowed: true, remaining: 0 });
    const denied = checkRateLimit("tenant-batch-n", config);
    expect(denied).toMatchObject({ allowed: false, remaining: 0 });
    expect(denied.retryAfterMs).toBeGreaterThan(0);
    vi.advanceTimersByTime(1_000);
    expect(checkRateLimit("tenant-batch-n", config).allowed).toBe(true);

    expect(contentHash("  hello\n  world  ")).toBe(contentHash("hello world"));
    const key = buildMessageMemoryDedupeKey({
      provider: " Slack ",
      workspaceId: " W ",
      channelId: " C ",
      threadId: null,
      messageId: " M ",
    } as never);
    expect(key).toMatch(/^msgmem:[a-f0-9]{64}$/);
  });

  it("protects PII payload branches and native-memory null input", () => {
    expect(detectPiiForStorage("no identifiers here")).toEqual([]);
    expect(anonymizePiiForStorage("no identifiers here")).toEqual({ text: "no identifiers here", findings: [] });
    expect(protectMemoryPayloadForStorage({ metadata: "not-record" })).toEqual({ metadata: "not-record" });

    const protectedPayload = protectMemoryPayloadForStorage({
      content: "Contact ada@example.com or 212-555-1212",
      metadata: { source: "test" },
    });
    expect(protectedPayload.text).toContain("[REDACTED:EMAIL_ADDRESS]");
    expect(protectedPayload.content).toContain("[REDACTED:PHONE_NUMBER_US]");
    expect(protectedPayload.metadata).toMatchObject({
      source: "test",
      pii: { protected: true, findingCount: 2 },
    });

    expect(filterNativeMemory(null as never)).toMatchObject({
      sanitized: "",
      redacted: false,
      originalLength: 0,
    });
  });

  it("covers agent card, audit catch/default, and observability fallback branches", () => {
    expect(buildAgentCard({
      id: "a1",
      name: "Agent",
      role: "engineering",
      platform: "cursor",
      location: "cloudflare",
      tunnelUrl: "",
      host: "example.invalid",
      port: 4444,
      skills: [],
    } as never)).toMatchObject({ url: "http://example.invalid:4444" });
    expect(buildAgentCard({
      id: "a2",
      name: "Cloud",
      role: "ops",
      platform: "cursor",
      location: "cloudflare",
      tunnelUrl: "https://agent.example",
      host: "example.invalid",
      port: 4444,
      skills: [{ id: "custom", name: "Custom", description: "", tags: [] }],
    } as never).skills).toHaveLength(1);

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    writeAuditLog({ prepare: () => { throw new Error("db locked"); } } as never, {
      actor: "agent",
      action: "did",
      target: "thing",
    });
    expect(errorSpy).toHaveBeenCalledWith("[audit] write failed:", expect.objectContaining({ action: "did" }));

    const root = fs.mkdtempSync(path.join(os.tmpdir(), "memroos-observability-"));
    expect(buildObservabilityModel(root).summary).toMatchObject({ sessions: 0, errors: 0 });
    fs.mkdirSync(path.join(root, "logs"), { recursive: true });
    fs.writeFileSync(path.join(root, "logs", "tool-outcomes.jsonl"), [
      JSON.stringify({ timestamp: "2026-01-01T00:00:00.000Z", tool: "<tool>", success: false, errorType: "boom", duration_ms: 2_000 }),
      JSON.stringify({ timestamp: "2026-01-01T00:01:00.000Z", tool: "safe", success: true, duration_ms: 10 }),
    ].join("\n"));
    const html = renderObservabilityHtml(root);
    expect(html).toContain("&lt;tool&gt;");
    expect(html).toContain("\\u003ctool>");
  });

  it("covers behavioral eval empty samples, generated difficulties, and non-parametric comparison", () => {
    expect(runBehavioralABTest({} as never, "control", "treatment", [])).toMatchObject({
      controlW: 0,
      treatmentW: 0,
      sampleSize: 0,
    });

    const cases = generateGoldenSet({} as never, "skill", "ops", 6);
    expect(cases.map((testCase) => testCase.difficulty)).toEqual(["easy", "easy", "medium", "medium", "hard", "hard"]);
    expect(runBehavioralABTest({} as never, "control", "treatment expected output", cases).sampleSize).toBe(6);
    expect(mannWhitneyU([1, 2, 3], [4, 5, 6])).toMatchObject({ u: 0 });
  });
});
