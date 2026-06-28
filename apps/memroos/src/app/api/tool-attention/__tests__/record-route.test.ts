// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";

const TEST_DIR = path.join(os.tmpdir(), `tool-record-${crypto.randomUUID()}`);
const TEST_DB_PATH = path.join(TEST_DIR, "routes.db");
const TEST_OUTCOMES_PATH = path.join(TEST_DIR, "outcomes.jsonl");

async function loadRoute() {
  process.env.SQLITE_DB_PATH = TEST_DB_PATH;
  process.env.TOOL_ATTENTION_OUTCOMES = TEST_OUTCOMES_PATH;
  vi.resetModules();
  const registry = await import("@/lib/agent-registry");
  const route = await import("../record/route");
  const dbModule = await import("@/lib/db");
  return { ...registry, ...route, closeDb: dbModule.closeDb, getDb: dbModule.getDb };
}

describe("POST /api/tool-attention/record", () => {
  beforeEach(() => {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
    fs.mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    const { closeDb } = await loadRoute();
    closeDb();
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
    delete process.env.SQLITE_DB_PATH;
    delete process.env.TOOL_ATTENTION_OUTCOMES;
  });

  it("rejects missing, invalid, and body-only agent identity", async () => {
    const { POST, registerAgent } = await loadRoute();
    registerAgent({
      id: "tool-agent",
      name: "Tool Agent",
      role: "Records tools",
      platform: "codex",
      protocol: "rest",
      issueApiKey: true,
    });

    const body = JSON.stringify({ agentId: "tool-agent", toolId: "tool:x", outcome: "helped" });
    expect((await POST(new Request("http://localhost/api/tool-attention/record", { method: "POST", body }))).status).toBe(401);
    expect(
      (
        await POST(
          new Request("http://localhost/api/tool-attention/record", {
            method: "POST",
            headers: { authorization: "Bearer nope" },
            body,
          })
        )
      ).status
    ).toBe(401);
  });

  it("records valid authenticated tool outcomes to JSONL and audit table", async () => {
    const { POST, getDb, registerAgent } = await loadRoute();
    const { apiKey } = registerAgent({
      id: "tool-agent",
      name: "Tool Agent",
      role: "Records tools",
      platform: "codex",
      protocol: "rest",
      issueApiKey: true,
    });

    const res = await POST(
      new Request("http://localhost/api/tool-attention/record", {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ toolId: "skill:test", task: "no raw echo", outcome: "helped", metadata: { repo: "memroos" } }),
      })
    );

    expect(res.status).toBe(200);
    const jsonl = fs.readFileSync(TEST_OUTCOMES_PATH, "utf-8").trim();
    expect(JSON.parse(jsonl)).toMatchObject({
      toolId: "skill:test",
      outcome: "helped",
      metadata: expect.objectContaining({ agent_id: "tool-agent", repo: "memroos" }),
    });
    const rows = getDb().prepare("SELECT agent_id, tool_id, outcome FROM agent_tool_outcomes").all();
    expect(rows).toEqual([{ agent_id: "tool-agent", tool_id: "skill:test", outcome: "helped" }]);
    const efficiencyRows = getDb().prepare("SELECT COUNT(*) AS count FROM efficiency_events").get();
    expect(efficiencyRows).toEqual({ count: 0 });
  });

  it("emits source_read telemetry for authenticated read outcomes with source metadata", async () => {
    const { POST, getDb, registerAgent } = await loadRoute();
    const { listEfficiencyEvents } = await import("@/lib/efficiency-telemetry");
    const { apiKey } = registerAgent({
      id: "tool-agent",
      name: "Tool Agent",
      role: "Records tools",
      platform: "codex",
      protocol: "rest",
      issueApiKey: true,
    });

    for (const sourceId of ["docs/phase117.md", "docs/phase117-copy.md"]) {
      const res = await POST(
        new Request("http://localhost/api/tool-attention/record", {
          method: "POST",
          headers: { authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            toolId: "read_file",
            task: "phase 117 source read",
            taskId: "task-reread",
            outcome: "helped",
            metadata: {
              sourceId,
              sourceHash: "sha256:same-source",
            },
          }),
        })
      );
      expect(res.status).toBe(200);
    }

    const sourceReads = listEfficiencyEvents(getDb(), {
      eventType: "source_read",
      taskId: "task-reread",
      limit: 10,
    });

    expect(sourceReads).toHaveLength(2);
    expect(sourceReads.map((event) => event.agentId)).toEqual(["tool-agent", "tool-agent"]);
    expect(sourceReads.map((event) => event.payload)).toEqual([
      {
        sourceId: "docs/phase117-copy.md",
        sourceHash: "sha256:same-source",
        toolId: "read_file",
      },
      {
        sourceId: "docs/phase117.md",
        sourceHash: "sha256:same-source",
        toolId: "read_file",
      },
    ]);
  });

  it("derives source_read hashes from source content when an explicit hash is absent", async () => {
    const { POST, getDb, registerAgent } = await loadRoute();
    const { listEfficiencyEvents } = await import("@/lib/efficiency-telemetry");
    const { apiKey } = registerAgent({
      id: "tool-agent",
      name: "Tool Agent",
      role: "Records tools",
      platform: "codex",
      protocol: "rest",
      issueApiKey: true,
    });

    const sourceContent = "same source body";
    const expectedHash = `sha256:${crypto.createHash("sha256").update(sourceContent).digest("hex")}`;
    const res = await POST(
      new Request("http://localhost/api/tool-attention/record", {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          toolId: "read_file",
          taskId: "task-derived-hash",
          outcome: "helped",
          metadata: {
            sourceId: "docs/derived.md",
            sourceContent,
          },
        }),
      })
    );

    expect(res.status).toBe(200);
    const sourceReads = listEfficiencyEvents(getDb(), {
      eventType: "source_read",
      taskId: "task-derived-hash",
    });
    expect(sourceReads).toHaveLength(1);
    expect(sourceReads[0].payload).toEqual({
      sourceId: "docs/derived.md",
      sourceHash: expectedHash,
      toolId: "read_file",
    });

    const jsonl = fs.readFileSync(TEST_OUTCOMES_PATH, "utf-8").trim();
    const jsonlMetadata = JSON.parse(jsonl).metadata as Record<string, unknown>;
    expect(jsonlMetadata.sourceHash).toBe(expectedHash);
    expect(jsonlMetadata.sourceContent).toBeUndefined();

    const row = getDb().prepare("SELECT metadata FROM agent_tool_outcomes").get() as { metadata: string };
    const tableMetadata = JSON.parse(row.metadata) as Record<string, unknown>;
    expect(tableMetadata.sourceHash).toBe(expectedHash);
    expect(tableMetadata.sourceContent).toBeUndefined();
  });
});
