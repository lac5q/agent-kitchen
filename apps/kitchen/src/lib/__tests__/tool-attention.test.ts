// @vitest-environment node
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getToolAttention } from "@/lib/tool-attention";

let tempRoot: string | undefined;

afterEach(() => {
  vi.unstubAllEnvs();
  if (tempRoot) {
    fs.rmSync(tempRoot, { recursive: true, force: true });
    tempRoot = undefined;
  }
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

    vi.stubEnv("AGENT_KITCHEN_ROOT", tempRoot);
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
});
