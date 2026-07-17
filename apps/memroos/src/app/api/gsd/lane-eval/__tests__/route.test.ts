// @vitest-environment node
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TEST_DB_DIR = path.join(os.tmpdir(), `gsd-lane-eval-${crypto.randomUUID()}`);
const TEST_DB_PATH = path.join(TEST_DB_DIR, "lane-eval.db");

async function loadRoute() {
  process.env.SQLITE_DB_PATH = TEST_DB_PATH;
  vi.resetModules();
  const registry = await import("@/lib/agent-registry");
  const route = await import("../route");
  const dbModule = await import("@/lib/db");
  return {
    ...registry,
    route,
    closeDb: dbModule.closeDb,
  };
}

function request(
  method: "GET" | "POST",
  apiKey?: string,
  init: RequestInit = {}
): Request {
  return new Request("http://localhost/api/gsd/lane-eval", {
    method,
    headers: {
      "content-type": "application/json",
      ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
      ...(init.headers ?? {}),
    },
    ...init,
  });
}

describe("/api/gsd/lane-eval", () => {
  beforeEach(() => {
    fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
    fs.mkdirSync(TEST_DB_DIR, { recursive: true });
  });

  afterEach(async () => {
    const { closeDb } = await loadRoute();
    closeDb();
    fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
    delete process.env.SQLITE_DB_PATH;
  });

  it("returns 401 on GET without an authenticated agent", async () => {
    const { route } = await loadRoute();
    const res = await route.GET(request("GET") as any);
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ ok: false, error: "Unauthorized" });
  });

  it("returns 401 on POST without an authenticated agent", async () => {
    const { route } = await loadRoute();
    const res = await route.POST(
      request("POST", undefined, { body: JSON.stringify({ persistReceipts: false }) }) as any
    );
    expect(res.status).toBe(401);
  });

  it("runs the full lane eval suite via GET without persisting receipts", async () => {
    const { route, registerAgent } = await loadRoute();
    const agent = registerAgent({
      id: "lane-eval-get",
      name: "Lane Eval GET",
      role: "Worker",
      platform: "codex",
      protocol: "rest",
      issueApiKey: true,
    });

    const res = await route.GET(request("GET", agent.apiKey) as any);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.actorAgentId).toBe(agent.agent.id);
    expect(body.totalCases).toBe(6);
    expect(body.failedCases).toBe(0);
    expect(body.passRate).toBe(1);
    expect(body.timestamp).toBeTruthy();
  });

  it("runs POST with filtered caseIds and persistReceipts disabled", async () => {
    const { route, registerAgent } = await loadRoute();
    const agent = registerAgent({
      id: "lane-eval-post",
      name: "Lane Eval POST",
      role: "Worker",
      platform: "codex",
      protocol: "rest",
      issueApiKey: true,
    });

    const res = await route.POST(
      request("POST", agent.apiKey, {
        body: JSON.stringify({
          agentId: agent.agent.id,
          caseIds: ["research-lane-source-coverage", "not-a-real-case", 42],
          persistReceipts: false,
        }),
      }) as any
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.actorAgentId).toBe(agent.agent.id);
    expect(body.totalCases).toBe(1);
    expect(body.failedCases).toBe(0);
  });

  it("accepts malformed JSON on POST and still requires auth", async () => {
    const { route } = await loadRoute();
    const res = await route.POST(
      new Request("http://localhost/api/gsd/lane-eval", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{",
      }) as any
    );
    expect(res.status).toBe(401);
  });

  it("persists receipts on POST by default when the suite passes", async () => {
    const { route, registerAgent } = await loadRoute();
    const agent = registerAgent({
      id: "lane-eval-receipts",
      name: "Lane Eval Receipts",
      role: "Worker",
      platform: "codex",
      protocol: "rest",
      issueApiKey: true,
    });

    const res = await route.POST(
      request("POST", agent.apiKey, {
        body: JSON.stringify({ agent: agent.agent.id }),
      }) as any
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.passedCases).toBe(body.totalCases);
    expect(Array.isArray(body.results)).toBe(true);
    expect(body.results.length).toBeGreaterThan(0);
  });
});
