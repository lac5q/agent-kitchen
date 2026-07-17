// @vitest-environment node
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TEST_DB_DIR = path.join(os.tmpdir(), `gsd-skill-audit-${crypto.randomUUID()}`);
const TEST_DB_PATH = path.join(TEST_DB_DIR, "skill-audit.db");

async function loadRoute() {
  process.env.SQLITE_DB_PATH = TEST_DB_PATH;
  vi.resetModules();
  const registry = await import("@/lib/agent-registry");
  const route = await import("../route");
  const dbModule = await import("@/lib/db");
  return {
    ...registry,
    route,
    getDb: dbModule.getDb,
    closeDb: dbModule.closeDb,
  };
}

function request(apiKey?: string, body: unknown = {}): Request {
  return new Request("http://localhost/api/gsd/skill-audit", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/gsd/skill-audit", () => {
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
    const { route } = await loadRoute();
    const res = await route.POST(request(undefined, { persistProposals: false }) as any);
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ ok: false, error: "Unauthorized" });
  });

  it("accepts malformed JSON bodies and still requires auth", async () => {
    const { route } = await loadRoute();
    const res = await route.POST(
      new Request("http://localhost/api/gsd/skill-audit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{",
      }) as any
    );
    expect(res.status).toBe(401);
  });

  it("audits registered skills for an authenticated agent", async () => {
    const { route, registerAgent } = await loadRoute();
    const agent = registerAgent({
      id: "skill-audit-agent",
      name: "Skill Audit Agent",
      role: "Worker",
      platform: "codex",
      protocol: "rest",
      issueApiKey: true,
    });

    const res = await route.POST(
      request(agent.apiKey, { agentId: agent.agent.id, persistProposals: false }) as any
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.actorAgentId).toBe(agent.agent.id);
    expect(body.skillsScanned).toBeGreaterThanOrEqual(0);
    expect(body.manifestVersion).toBeTruthy();
    expect(body.timestamp).toBeTruthy();
    expect(Array.isArray(body.findings)).toBe(true);
    expect(Array.isArray(body.proposalDrafts)).toBe(true);
    expect(body.persistedProposalIds).toEqual([]);
  });

  it("honors agent hint via body.agent when bearer key matches", async () => {
    const { route, registerAgent } = await loadRoute();
    const agent = registerAgent({
      id: "skill-audit-hint",
      name: "Skill Audit Hint",
      role: "Worker",
      platform: "hermes",
      protocol: "rest",
      issueApiKey: true,
    });

    const res = await route.POST(
      request(agent.apiKey, { agent: agent.agent.id, persistProposals: false }) as any
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.actorAgentId).toBe(agent.agent.id);
  });

  it("persists proposals by default when findings warrant drafts", async () => {
    const { route, registerAgent, getDb } = await loadRoute();
    const agent = registerAgent({
      id: "skill-audit-persist",
      name: "Skill Audit Persist",
      role: "Worker",
      platform: "codex",
      protocol: "rest",
      issueApiKey: true,
    });

    const now = new Date().toISOString();
    getDb()
      .prepare(
        `INSERT INTO skill_registry (name, owner, source_harness, verification_checks, imported_at, raw_body, dispatch_status, imported_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        "audit-test-skill",
        null,
        "test-harness",
        null,
        now,
        "# Audit skill\nNo examples here.",
        "incomplete",
        "skill-audit-test"
      );

    const res = await route.POST(request(agent.apiKey, { agentId: agent.agent.id }) as any);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.findings.length).toBeGreaterThan(0);
    expect(body.proposalDrafts.length).toBeGreaterThan(0);
    expect(body.persistedProposalIds.length).toBeGreaterThan(0);
  });
});
