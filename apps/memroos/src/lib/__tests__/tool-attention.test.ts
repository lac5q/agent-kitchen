// @vitest-environment node
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getToolAttention, getSimilarTaskRecommendations } from "@/lib/tool-attention";

let tempRoot: string | undefined;

function makeOutcomeFile(root: string, records: object[]): string {
  const p = path.join(root, "outcomes.jsonl");
  fs.writeFileSync(p, records.map((r) => JSON.stringify(r)).join("\n") + "\n");
  return p;
}

function makeCatalogFile(root: string, toolId: string): string {
  const p = path.join(root, "catalog.json");
  fs.writeFileSync(
    p,
    JSON.stringify({
      capabilities: [
        {
          id: toolId,
          name: toolId,
          type: "mcp-tool",
          source: "test",
          description: "d",
          status: "available",
          tags: [],
          useWhen: [],
          topLevel: false,
          loadCommand: null,
        },
      ],
      sources: [],
    }),
  );
  return p;
}

afterEach(() => {
  vi.unstubAllEnvs();
  if (tempRoot) {
    fs.rmSync(tempRoot, { recursive: true, force: true });
    tempRoot = undefined;
  }
});

describe("contextMatchSignal", () => {
  it("scores task_type match * 2", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ctx-"));
    const outcomesPath = makeOutcomeFile(root, [
      { timestamp: "t", toolId: "skill:foo", outcome: "helped", metadata: { task_type: "code-review" } },
    ]);
    const catalogPath = makeCatalogFile(root, "skill:foo");
    vi.stubEnv("MEMROOS_ROOT", root);
    vi.stubEnv("TOOL_ATTENTION_CATALOG", catalogPath);
    vi.stubEnv("TOOL_ATTENTION_OUTCOMES", outcomesPath);
    vi.stubEnv("SKILLS_PATH", path.join(root, "no-skills"));

    const result = getSimilarTaskRecommendations({ task_type: "code-review" });
    const rec = result.recommendations.find((r) => r.capabilityId === "skill:foo");
    expect(rec).toBeDefined();
    expect(rec!.contextScore).toBeGreaterThanOrEqual(2);

    fs.rmSync(root, { recursive: true, force: true });
  });

  it("scores repo match * 2", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ctx-"));
    const outcomesPath = makeOutcomeFile(root, [
      { timestamp: "t", toolId: "skill:bar", outcome: "helped", metadata: { repo: "my-repo" } },
    ]);
    const catalogPath = makeCatalogFile(root, "skill:bar");
    vi.stubEnv("MEMROOS_ROOT", root);
    vi.stubEnv("TOOL_ATTENTION_CATALOG", catalogPath);
    vi.stubEnv("TOOL_ATTENTION_OUTCOMES", outcomesPath);
    vi.stubEnv("SKILLS_PATH", path.join(root, "no-skills"));

    const result = getSimilarTaskRecommendations({ repo: "my-repo" });
    const rec = result.recommendations.find((r) => r.capabilityId === "skill:bar");
    expect(rec).toBeDefined();
    expect(rec!.contextScore).toBeGreaterThanOrEqual(2);

    fs.rmSync(root, { recursive: true, force: true });
  });

  it("scores agent_id match * 1", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ctx-"));
    const outcomesPath = makeOutcomeFile(root, [
      { timestamp: "t", toolId: "skill:baz", outcome: "helped", metadata: { agent_id: "claude-1" } },
    ]);
    const catalogPath = makeCatalogFile(root, "skill:baz");
    vi.stubEnv("MEMROOS_ROOT", root);
    vi.stubEnv("TOOL_ATTENTION_CATALOG", catalogPath);
    vi.stubEnv("TOOL_ATTENTION_OUTCOMES", outcomesPath);
    vi.stubEnv("SKILLS_PATH", path.join(root, "no-skills"));

    const result = getSimilarTaskRecommendations({ agent_id: "claude-1" });
    const rec = result.recommendations.find((r) => r.capabilityId === "skill:baz");
    expect(rec).toBeDefined();
    expect(rec!.contextScore).toBeGreaterThanOrEqual(1);

    fs.rmSync(root, { recursive: true, force: true });
  });

  it("never reads task field", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ctx-"));
    const toolId = "skill:secret-test";
    const catalog = makeCatalogFile(root, toolId);

    const outcomesWithTask = makeOutcomeFile(root, [
      { timestamp: "t", toolId, task: "top secret task text", outcome: "helped",
        metadata: { task_type: "analysis" } },
    ]);
    vi.stubEnv("MEMROOS_ROOT", root);
    vi.stubEnv("TOOL_ATTENTION_CATALOG", catalog);
    vi.stubEnv("TOOL_ATTENTION_OUTCOMES", outcomesWithTask);
    vi.stubEnv("SKILLS_PATH", path.join(root, "no-skills"));
    const resultWithTask = getSimilarTaskRecommendations({ task_type: "analysis" });

    const outcomesWithoutTask = makeOutcomeFile(root, [
      { timestamp: "t", toolId, outcome: "helped", metadata: { task_type: "analysis" } },
    ]);
    vi.stubEnv("TOOL_ATTENTION_OUTCOMES", outcomesWithoutTask);
    const resultWithoutTask = getSimilarTaskRecommendations({ task_type: "analysis" });

    const recWith = resultWithTask.recommendations.find((r) => r.capabilityId === toolId);
    const recWithout = resultWithoutTask.recommendations.find((r) => r.capabilityId === toolId);
    expect(recWith).toBeDefined();
    expect(recWithout).toBeDefined();
    expect(recWith!.contextScore).toEqual(recWithout!.contextScore);
    expect(recWith!.overallScore).toEqual(recWithout!.overallScore);

    fs.rmSync(root, { recursive: true, force: true });
  });
});

describe("getToolAttention", () => {
  it("redacts absolute local paths from the UI response", () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tool-attention-"));
    const catalogPath = path.join(tempRoot, "services", "knowledge-mcp", "tool-catalog.json");
    const outcomesPath = path.join(tempRoot, "logs", "tool-attention-outcomes.jsonl");
    const skillsPath = path.join(tempRoot, "skills");

    fs.mkdirSync(path.dirname(catalogPath), { recursive: true });
    fs.mkdirSync(path.dirname(outcomesPath), { recursive: true });
    fs.mkdirSync(path.join(skillsPath, "sample-skill"), { recursive: true });
    fs.writeFileSync(path.join(tempRoot, ".mcp.json"), JSON.stringify({ mcpServers: { gitnexus: {} } }));
    fs.writeFileSync(
      catalogPath,
      JSON.stringify({
        sources: [
          {
            id: "external-source",
            label: "External Source",
            type: "external",
            path: path.join(tempRoot, "private", "catalog.json"),
            status: "available",
          },
        ],
        capabilities: [
          {
            id: "external:router",
            name: "router",
            type: "reference",
            source: "external-source",
            description: "Routes tool choices",
            status: "candidate",
            tags: ["router"],
            useWhen: ["Need routing"],
            topLevel: false,
            loadCommand: `Read ${path.join(tempRoot, "private", "router.md")}`,
          },
        ],
      })
    );
    fs.writeFileSync(
      outcomesPath,
      JSON.stringify({ timestamp: "2026-04-30T00:00:00Z", toolId: "external:router", task: "x", outcome: "helped" })
    );

    vi.stubEnv("MEMROOS_ROOT", tempRoot);
    vi.stubEnv("TOOL_ATTENTION_CATALOG", catalogPath);
    vi.stubEnv("TOOL_ATTENTION_OUTCOMES", outcomesPath);
    vi.stubEnv("SKILLS_PATH", skillsPath);

    const data = getToolAttention("", 100);
    const payload = JSON.stringify(data);

    expect(payload).not.toContain(tempRoot);
    expect(data.health).toEqual({
      status: "ok",
      catalog: "available",
      outcomes: "available",
      messages: [],
    });
    expect(data.sources.find((source) => source.id === "root-mcp-json")?.path).toBe(".mcp.json");
    expect(data.sources.find((source) => source.id === "external-source")?.path).toBe("private/catalog.json");
  });

  it("surfaces optional Agent Lightning capability and GitNexus status", () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tool-attention-"));
    const catalogPath = path.join(tempRoot, "services", "knowledge-mcp", "tool-catalog.json");
    const outcomesPath = path.join(tempRoot, "logs", "tool-attention-outcomes.jsonl");
    const home = path.join(tempRoot, "home");

    fs.mkdirSync(path.dirname(catalogPath), { recursive: true });
    fs.mkdirSync(path.dirname(outcomesPath), { recursive: true });
    fs.mkdirSync(path.join(tempRoot, "apps", "memroos"), { recursive: true });
    fs.mkdirSync(path.join(home, ".gitnexus"), { recursive: true });
    fs.writeFileSync(path.join(tempRoot, ".mcp.json"), JSON.stringify({ mcpServers: { gitnexus: {} } }));
    fs.writeFileSync(path.join(tempRoot, "apps", "memroos", "package.json"), JSON.stringify({ scripts: { "apo:worker": "node worker.js" } }));
    fs.writeFileSync(path.join(home, ".gitnexus", "registry.json"), "{}");
    fs.writeFileSync(catalogPath, JSON.stringify({ capabilities: [], sources: [] }));
    fs.writeFileSync(outcomesPath, "");

    vi.stubEnv("MEMROOS_ROOT", tempRoot);
    vi.stubEnv("HOME", home);
    vi.stubEnv("TOOL_ATTENTION_CATALOG", catalogPath);
    vi.stubEnv("TOOL_ATTENTION_OUTCOMES", outcomesPath);
    vi.stubEnv("SKILLS_PATH", path.join(tempRoot, "no-skills"));
    vi.stubEnv("MEMROOS_OPTIONAL_CAPABILITIES", "gitnexus,agent-lightning");

    const data = getToolAttention("agent lightning APO skill proposals", 10);
    const agentLightning = data.capabilities.find((item) => item.id === "capability:agent-lightning");
    expect(agentLightning).toBeDefined();
    expect(agentLightning?.status).toBe("degraded");

    const gitnexus = getToolAttention("gitnexus", 10).capabilities.find((item) => item.id === "mcp-server:gitnexus");
    expect(gitnexus?.status).toBe("available");
  });

  it("scores shared tags and failure outcomes when ranking similar tasks", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ctx-tags-"));
    const toolId = "skill:tagged";
    const outcomesPath = makeOutcomeFile(root, [
      {
        timestamp: "t1",
        toolId,
        outcome: "failed",
        metadata: { task_type: "deploy", repo: "memroos", tags: ["heroku", "release"] },
      },
      {
        timestamp: "t2",
        toolId,
        outcome: "helped",
        metadata: { task_type: "deploy", repo: "memroos", tags: ["heroku"] },
      },
    ]);
    const catalogPath = makeCatalogFile(root, toolId);
    vi.stubEnv("MEMROOS_ROOT", root);
    vi.stubEnv("TOOL_ATTENTION_CATALOG", catalogPath);
    vi.stubEnv("TOOL_ATTENTION_OUTCOMES", outcomesPath);
    vi.stubEnv("SKILLS_PATH", path.join(root, "no-skills"));

    const result = getSimilarTaskRecommendations({
      task_type: "deploy",
      repo: "memroos",
      tags: ["heroku", "release"],
    });
    const rec = result.recommendations.find((item) => item.capabilityId === toolId);
    expect(rec).toBeDefined();
    expect(rec!.contextScore).toBeGreaterThanOrEqual(6);
    expect(rec!.reason).toMatch(/context match score/i);

    fs.rmSync(root, { recursive: true, force: true });
  });

  it("appends outcomes to the configured jsonl file", async () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tool-attention-append-"));
    const outcomesPath = path.join(tempRoot, "logs", "tool-attention-outcomes.jsonl");
    const catalogPath = path.join(tempRoot, "catalog.json");
    fs.mkdirSync(path.dirname(outcomesPath), { recursive: true });
    fs.writeFileSync(catalogPath, JSON.stringify({ capabilities: [], sources: [] }));

    vi.stubEnv("MEMROOS_ROOT", tempRoot);
    vi.stubEnv("TOOL_ATTENTION_CATALOG", catalogPath);
    vi.stubEnv("TOOL_ATTENTION_OUTCOMES", outcomesPath);
    vi.stubEnv("SKILLS_PATH", path.join(tempRoot, "no-skills"));

    const { appendToolAttentionOutcome } = await import("@/lib/tool-attention");
    appendToolAttentionOutcome({
      timestamp: "2026-07-17T00:00:00.000Z",
      toolId: "skill:append",
      outcome: "helped",
      metadata: { task_type: "review" },
    });

    const lines = fs.readFileSync(outcomesPath, "utf-8").trim().split("\n");
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!).toolId).toBe("skill:append");
  });

  it("marks invalid MCP config as invalid and tolerates missing catalog files", () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tool-attention-invalid-"));
    const catalogPath = path.join(tempRoot, "missing-catalog.json");
    const outcomesPath = path.join(tempRoot, "missing-outcomes.jsonl");

    fs.mkdirSync(tempRoot, { recursive: true });
    fs.writeFileSync(path.join(tempRoot, ".mcp.json"), "{not-json");

    vi.stubEnv("MEMROOS_ROOT", tempRoot);
    vi.stubEnv("TOOL_ATTENTION_CATALOG", catalogPath);
    vi.stubEnv("TOOL_ATTENTION_OUTCOMES", outcomesPath);
    vi.stubEnv("SKILLS_PATH", path.join(tempRoot, "no-skills"));

    const data = getToolAttention("mcp", 5);
    expect(data.sources.find((source) => source.id === "root-mcp-json")?.status).toBe("invalid");
    expect(data.health.catalog).toBe("missing");
    expect(data.health.outcomes).toBe("missing");
  });

  it("tolerates malformed catalog and outcome files without surfacing unsafe paths", () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tool-attention-corrupt-"));
    const catalogPath = path.join(tempRoot, "catalog.json");
    const outcomesPath = path.join(tempRoot, "outcomes.jsonl");
    const home = path.join(tempRoot, "home");
    fs.mkdirSync(home, { recursive: true });
    fs.writeFileSync(path.join(tempRoot, ".mcp.json"), JSON.stringify({ mcpServers: {} }));
    fs.writeFileSync(catalogPath, "{not-json");
    fs.writeFileSync(outcomesPath, "{not-json\n");
    fs.writeFileSync(path.join(home, "skills-file"), "not a directory");

    vi.stubEnv("MEMROOS_ROOT", tempRoot);
    vi.stubEnv("HOME", home);
    vi.stubEnv("TOOL_ATTENTION_CATALOG", catalogPath);
    vi.stubEnv("TOOL_ATTENTION_OUTCOMES", outcomesPath);
    vi.stubEnv("SKILLS_PATH", path.join(home, "skills-file"));

    const data = getToolAttention("", 100);

    expect(data.recentOutcomes).toEqual([]);
    expect(data.sources.find((source) => source.id === "skills-path")?.status).toBe("degraded");
    expect(JSON.stringify(data)).not.toContain(home);
  });

  it("reports optional Agent Lightning as available or missing from local signals", () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tool-attention-optional-"));
    const catalogPath = path.join(tempRoot, "catalog.json");
    const outcomesPath = path.join(tempRoot, "outcomes.jsonl");
    const proposalsPath = path.join(tempRoot, "proposals");
    const cronLogPath = path.join(tempRoot, "agent-lightning.log");

    fs.mkdirSync(path.join(tempRoot, "apps", "memroos"), { recursive: true });
    fs.mkdirSync(proposalsPath, { recursive: true });
    fs.writeFileSync(path.join(tempRoot, ".mcp.json"), JSON.stringify({ mcpServers: {} }));
    fs.writeFileSync(path.join(tempRoot, "apps", "memroos", "package.json"), JSON.stringify({ scripts: { "apo:worker": "node worker.js" } }));
    fs.writeFileSync(catalogPath, JSON.stringify({ capabilities: [], sources: [] }));
    fs.writeFileSync(outcomesPath, "");
    fs.writeFileSync(cronLogPath, "ok");

    vi.stubEnv("MEMROOS_ROOT", tempRoot);
    vi.stubEnv("TOOL_ATTENTION_CATALOG", catalogPath);
    vi.stubEnv("TOOL_ATTENTION_OUTCOMES", outcomesPath);
    vi.stubEnv("SKILLS_PATH", path.join(tempRoot, "no-skills"));
    vi.stubEnv("APO_PROPOSALS_PATH", proposalsPath);
    vi.stubEnv("APO_CRON_LOG_PATH", cronLogPath);
    vi.stubEnv("MEMROOS_OPTIONAL_CAPABILITIES", "agent-lightning");

    const available = getToolAttention("agent lightning", 10).capabilities.find((item) => item.id === "capability:agent-lightning");
    expect(available?.status).toBe("available");

    vi.stubEnv("MEMROOS_ROOT", path.join(tempRoot, "empty-root"));
    vi.stubEnv("APO_PROPOSALS_PATH", path.join(tempRoot, "missing-proposals"));
    vi.stubEnv("APO_CRON_LOG_PATH", path.join(tempRoot, "missing.log"));
    const missing = getToolAttention("agent lightning", 10).capabilities.find((item) => item.id === "capability:agent-lightning");
    expect(missing?.status).toBe("missing");
  });

  it("normalizes home-relative catalog paths and scores neutral outcomes", () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tool-attention-home-"));
    const repoRoot = path.join(tempRoot, "repo");
    const home = path.join(tempRoot, "home");
    const catalogPath = path.join(repoRoot, "catalog.json");
    const outcomesPath = path.join(repoRoot, "outcomes.jsonl");
    const homeCatalogPath = path.join(home, "private", "catalog.json");
    const homeCommandPath = path.join(home, "private", "loader.md");
    fs.mkdirSync(repoRoot, { recursive: true });
    fs.mkdirSync(path.dirname(homeCatalogPath), { recursive: true });
    fs.writeFileSync(path.join(repoRoot, ".mcp.json"), JSON.stringify({ mcpServers: {} }));
    fs.writeFileSync(
      catalogPath,
      JSON.stringify({
        capabilities: [
          {
            id: "tool:neutral",
            name: "Neutral Tool",
            type: "reference",
            source: "home-source",
            description: "Useful for neutral outcomes",
            status: "available",
            tags: ["neutral"],
            useWhen: ["Need neutral help"],
            topLevel: false,
            loadCommand: `Read ${homeCommandPath}`,
          },
        ],
        sources: [{ id: "home-source", label: "Home Source", type: "external", path: homeCatalogPath, status: "available" }],
      }),
    );
    makeOutcomeFile(repoRoot, [
      { timestamp: "t1", toolId: "", outcome: "helped", metadata: { task_type: "ignored" } },
      { timestamp: "t2", toolId: "tool:neutral", outcome: "maybe", metadata: {} },
    ]);

    vi.stubEnv("MEMROOS_ROOT", repoRoot);
    vi.stubEnv("HOME", home);
    vi.stubEnv("TOOL_ATTENTION_CATALOG", catalogPath);
    vi.stubEnv("TOOL_ATTENTION_OUTCOMES", outcomesPath);
    vi.stubEnv("SKILLS_PATH", path.join(tempRoot, "no-skills"));

    const data = getToolAttention("neutral", 10);
    expect(data.sources.find((source) => source.id === "home-source")?.path).toBe("~/private/catalog.json");
    expect(data.capabilities.find((item) => item.id === "tool:neutral")?.loadCommand).toBe("Read ~/private/loader.md");

    const rec = getSimilarTaskRecommendations({}, 10).recommendations.find((item) => item.capabilityId === "tool:neutral");
    expect(rec?.reason).toContain("1 recorded outcome(s) with score 1");
  });
});
