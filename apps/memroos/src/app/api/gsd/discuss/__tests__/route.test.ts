// @vitest-environment node
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TEST_DB_DIR = path.join(os.tmpdir(), `gsd-discuss-${crypto.randomUUID()}`);
const TEST_DB_PATH = path.join(TEST_DB_DIR, "discuss.db");

async function loadRoute() {
  process.env.SQLITE_DB_PATH = TEST_DB_PATH;
  vi.resetModules();
  const registry = await import("@/lib/agent-registry");
  const discuss = await import("../route");
  const dbModule = await import("@/lib/db");
  return {
    ...registry,
    discuss,
    closeDb: dbModule.closeDb,
  };
}

function request(apiKey?: string, body: unknown = {}): Request {
  return new Request("http://localhost/api/gsd/discuss", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/gsd/discuss", () => {
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

  it("returns 401 without an authenticated agent", async () => {
    const { discuss } = await loadRoute();
    const res = await discuss.POST(request(undefined, { topic: "x" }) as any);
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ ok: false, error: "Unauthorized" });
  });

  it("returns 400 when council validation blocks the request", async () => {
    const { discuss, registerAgent } = await loadRoute();
    const agent = registerAgent({
      id: "discuss-agent",
      name: "Discuss Agent",
      role: "Worker",
      platform: "codex",
      protocol: "rest",
      issueApiKey: true,
    });

    const res = await discuss.POST(
      request(agent.apiKey, {
        goalId: "goal-discuss",
        topic: "Need a validator",
        roles: [{ role: "chair", agentId: agent.id, mandate: "lead" }],
        taskBudget: { maxRounds: 2, maxAgents: 4 },
        verdict: { decision: "approve", summary: "ok", validatorPass: true },
      }) as any
    );

    expect(res.status).toBe(400);
    const payload = await res.json();
    expect(payload.ok).toBe(false);
    expect(payload.blockedReasons.length).toBeGreaterThan(0);
  });

  it("ledgers a successful discuss council", async () => {
    const { discuss, registerAgent } = await loadRoute();
    const agent = registerAgent({
      id: "discuss-agent-ok",
      name: "Discuss Agent",
      role: "Worker",
      platform: "codex",
      protocol: "rest",
      issueApiKey: true,
    });

    const roles = [
      { role: "chair", agentId: agent.id, mandate: "facilitate" },
      { role: "researcher", agentId: agent.id, mandate: "gather" },
      { role: "validator", agentId: agent.id, mandate: "validate" },
    ];

    const res = await discuss.POST(
      request(agent.apiKey, {
        goal_id: "goal-discuss-ok",
        agentId: agent.id,
        topic: "Ship discuss route coverage",
        lane: "research",
        roles,
        contributions: [
          {
            role: "researcher",
            agentId: agent.id,
            summary: "Found gaps in discuss route tests",
          },
        ],
        taskBudget: { maxRounds: 2, maxAgents: 4, maxTokens: 1200 },
        verdict: {
          decision: "approve",
          summary: "Council approved adding discuss route tests",
          actionItems: ["commit tests"],
          risks: [],
          validatorPass: true,
          validatorNotes: "looks good",
        },
      }) as any
    );

    expect(res.status).toBe(200);
    const payload = await res.json();
    expect(payload.ok).toBe(true);
    expect(payload.councilId).toMatch(/^discuss_/);
    expect(payload.checkpointId).toBeTruthy();
    expect(payload.ledgerReceiptId).toBeGreaterThan(0);
    expect(payload.blockedReasons).toEqual([]);
  });

  it("defaults invalid verdict decisions to needs_more_info and surfaces thrown errors", async () => {
    const { discuss, registerAgent } = await loadRoute();
    const agent = registerAgent({
      id: "discuss-agent-err",
      name: "Discuss Agent",
      role: "Worker",
      platform: "codex",
      protocol: "rest",
      issueApiKey: true,
    });

    const missingGoal = await discuss.POST(
      request(agent.apiKey, {
        topic: "missing goal",
        roles: [{ role: "validator", agentId: agent.id, mandate: "validate" }],
        verdict: { decision: "not-a-decision", summary: "x", validatorPass: true },
      }) as any
    );
    expect(missingGoal.status).toBe(400);
    expect(await missingGoal.json()).toMatchObject({
      ok: false,
      error: "goalId is required",
    });
  });

  it("accepts empty JSON bodies without crashing auth", async () => {
    const { discuss } = await loadRoute();
    const res = await discuss.POST(
      new Request("http://localhost/api/gsd/discuss", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{",
      }) as any
    );
    expect(res.status).toBe(401);
  });
});
