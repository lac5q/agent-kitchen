// @vitest-environment node
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TEST_DB_DIR = path.join(os.tmpdir(), `agent-context-packet-${crypto.randomUUID()}`);
const TEST_DB_PATH = path.join(TEST_DB_DIR, "routes.db");

async function loadRoute() {
  process.env.SQLITE_DB_PATH = TEST_DB_PATH;
  vi.resetModules();
  const registry = await import("@/lib/agent/registry");
  const route = await import("../route");
  const dbModule = await import("@/lib/db");
  return {
    ...registry,
    route,
    closeDb: dbModule.closeDb,
    getDb: dbModule.getDb,
  };
}

describe("GET /api/agent-context", () => {
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

  it("requires an authenticated agent key", async () => {
    const { route } = await loadRoute();
    const res = await route.GET(new Request("http://localhost/api/agent-context?goal_id=goal-1") as any);

    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ ok: false, error: "Unauthorized" });
  });

  it("returns a packet and ledger for an authenticated agent without raw message bodies", async () => {
    const { route, registerAgent } = await loadRoute();
    const agent = registerAgent({
      id: "agent-alpha",
      name: "Agent Alpha",
      role: "Worker",
      platform: "codex",
      protocol: "rest",
      issueApiKey: true,
    });

    const res = await route.GET(
      new Request("http://localhost/api/agent-context?goal_id=goal-1&agent=agent-alpha&lane=code", {
        headers: { authorization: `Bearer ${agent.apiKey}` },
      }) as any
    );
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.packet.goal).toMatchObject({
      id: "goal-1",
      status: "planned",
      lane: "code",
    });
    expect(payload.packet.actor.agentId).toBe("agent-alpha");
    expect(payload.packet.packetHash).toMatch(/^sha256:/);
    expect(payload.ledger.goalId).toBe("goal-1");
    expect(JSON.stringify(payload)).not.toContain("body");
  });

  it("rejects invalid lanes and missing goal ids", async () => {
    const { route, registerAgent } = await loadRoute();
    const agent = registerAgent({
      id: "agent-alpha",
      name: "Agent Alpha",
      role: "Worker",
      platform: "codex",
      protocol: "rest",
      issueApiKey: true,
    });

    const missingGoal = await route.GET(
      new Request("http://localhost/api/agent-context?agent=agent-alpha", {
        headers: { authorization: `Bearer ${agent.apiKey}` },
      }) as any
    );
    expect(missingGoal.status).toBe(400);

    const invalidLane = await route.GET(
      new Request("http://localhost/api/agent-context?goal_id=goal-1&agent=agent-alpha&lane=wrong", {
        headers: { authorization: `Bearer ${agent.apiKey}` },
      }) as any
    );
    expect(invalidLane.status).toBe(400);
  });

  it("builds a pointer-only context packet from a topic without a goal id", async () => {
    const { route, registerAgent } = await loadRoute();
    const agent = registerAgent({
      id: "agent-topic",
      name: "Topic Agent",
      role: "Worker",
      platform: "codex",
      protocol: "rest",
      issueApiKey: true,
    });

    const response = await route.GET(
      new Request("http://localhost/api/agent-context?topic=prior%20onboarding%20work&agent=agent-topic", {
        headers: { authorization: `Bearer ${agent.apiKey}` },
      }) as any,
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.packet.goal.id).toMatch(/^topic:/);
    expect(payload.packet.goal.title).toBe("prior onboarding work");
    expect(Array.isArray(payload.packet.memories)).toBe(true);
    expect(payload.packet.receipts).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "prior_work_topic" }),
    ]));
    expect(JSON.stringify(payload)).not.toContain("snippet");
  });
});
