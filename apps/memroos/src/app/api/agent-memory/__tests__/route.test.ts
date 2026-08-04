// @vitest-environment node
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TEST_ROOT = path.join(os.tmpdir(), `agent-memory-route-${crypto.randomUUID()}`);
const TEST_DB_PATH = path.join(TEST_ROOT, "routes.db");
const TEST_VAULT_ROOT = path.join(TEST_ROOT, "vault");

async function loadRoutes() {
  process.env.SQLITE_DB_PATH = TEST_DB_PATH;
  process.env.MEMROOS_VAULT_ROOT = TEST_VAULT_ROOT;
  vi.resetModules();
  const captureRoute = await import("../capture/route");
  const handoffRoute = await import("../handoff/route");
  const dbModule = await import("@/lib/db");
  return {
    capturePost: captureRoute.POST,
    handoffPost: handoffRoute.POST,
    registerAgent: (await import("@/lib/agent/registry")).registerAgent,
    closeDb: dbModule.closeDb,
    getDb: dbModule.getDb,
  };
}

describe("/api/agent-memory capture and handoff", () => {
  beforeEach(() => {
    fs.rmSync(TEST_ROOT, { recursive: true, force: true });
    fs.mkdirSync(TEST_ROOT, { recursive: true });
  });

  afterEach(async () => {
    const { closeDb } = await loadRoutes();
    closeDb();
    fs.rmSync(TEST_ROOT, { recursive: true, force: true });
    delete process.env.SQLITE_DB_PATH;
    delete process.env.MEMROOS_VAULT_ROOT;
  });

  it("accepts a loopback capture and returns a generated handoff pack", async () => {
    const { capturePost, handoffPost } = await loadRoutes();
    const captureRes = await capturePost(
      new Request("http://localhost/api/agent-memory/capture", {
        method: "POST",
        body: JSON.stringify({
          sourceAgentId: "codex",
          runtime: "codex",
          sessionId: "route-session",
          taskId: "route-task",
          summary: "Route test captured task state.",
          decisionIntent: { decision: "Use MemRoOS handoff packs", intent: "agent switching" },
          verification: [{ command: "vitest", status: "passed" }],
        }),
      })
    );
    expect(captureRes.status).toBe(201);
    expect(await captureRes.json()).toMatchObject({
      ok: true,
      capture: { sourceAgentId: "codex", taskId: "route-task", captureHealth: "ok" },
    });

    const handoffRes = await handoffPost(
      new Request("http://localhost/api/agent-memory/handoff", {
        method: "POST",
        body: JSON.stringify({ taskId: "route-task", toAgentId: "claude-code" }),
      })
    );
    expect(handoffRes.status).toBe(201);
    const body = await handoffRes.json();
    expect(body).toMatchObject({
      ok: true,
      handoff: {
        taskId: "route-task",
        toAgentId: "claude-code",
        redactionState: "none",
      },
    });
    expect(body.handoff.contextPack.captures[0].summary).toBe("Route test captured task state.");
  });

  it("scopes an agent key to its own runtime and forces relevant depth", async () => {
    const { capturePost, registerAgent } = await loadRoutes();
    const { apiKey } = registerAgent({
      id: "capture-agent-a",
      name: "Capture Agent A",
      role: "capture",
      platform: "codex",
      protocol: "rest",
      issueApiKey: true,
    });

    const own = await capturePost(
      new Request("https://memroos.test/api/agent-memory/capture", {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          sourceAgentId: "capture-agent-a",
          runtime: "codex",
          sessionId: "agent-session-own",
          captureDepth: "full",
          summary: "Agent-owned capture",
        }),
      })
    );
    expect(own.status).toBe(201);
    expect((await own.json()).capture.captureDepth).toBe("relevant");

    const other = await capturePost(
      new Request("https://memroos.test/api/agent-memory/capture", {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          sourceAgentId: "capture-agent-b",
          runtime: "codex",
          sessionId: "agent-session-other",
          summary: "Cross-agent attempt",
        }),
      })
    );
    expect(other.status).toBe(403);
    expect(await other.json()).toMatchObject({ code: "AGENT_CAPTURE_SCOPE_DENIED" });
  });
});
