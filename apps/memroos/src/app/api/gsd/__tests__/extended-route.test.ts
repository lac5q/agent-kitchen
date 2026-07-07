// @vitest-environment node
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TEST_DB_DIR = path.join(os.tmpdir(), `gsd-routes-ext-${crypto.randomUUID()}`);
const TEST_DB_PATH = path.join(TEST_DB_DIR, "routes-ext.db");

async function loadRoutes() {
  process.env.SQLITE_DB_PATH = TEST_DB_PATH;
  vi.resetModules();
  const registry = await import("@/lib/agent-registry");
  const discuss = await import("../discuss/route");
  const skillAudit = await import("../skill-audit/route");
  const skillBoundary = await import("../skill-boundary/route");
  const laneEval = await import("../lane-eval/route");
  const modelRoute = await import("../model-route/route");
  const adapter = await import("../adapter/route");
  const dbModule = await import("@/lib/db");
  return {
    ...registry,
    discuss,
    skillAudit,
    skillBoundary,
    laneEval,
    modelRoute,
    adapter,
    closeDb: dbModule.closeDb,
  };
}

function request(url: string, apiKey?: string, init: RequestInit = {}): Request {
  return new Request(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
      ...(init.headers ?? {}),
    },
  });
}

describe("GSD extended routes", () => {
  beforeEach(() => {
    fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
    fs.mkdirSync(TEST_DB_DIR, { recursive: true });
  });

  afterEach(async () => {
    const { closeDb } = await loadRoutes();
    closeDb();
    fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
    delete process.env.SQLITE_DB_PATH;
  });

  it("requires authenticated agent keys", async () => {
    const { skillBoundary } = await loadRoutes();
    const res = await skillBoundary.GET(request("http://localhost/api/gsd/skill-boundary", undefined) as any);
    expect(res.status).toBe(401);
  });

  it("returns skill boundary manifest for authenticated agents", async () => {
    const { skillBoundary, registerAgent } = await loadRoutes();
    const agent = registerAgent({
      id: "agent-alpha",
      name: "Agent Alpha",
      role: "Worker",
      platform: "codex",
      protocol: "rest",
      issueApiKey: true,
    });

    const res = await skillBoundary.GET(request("http://localhost/api/gsd/skill-boundary", agent.apiKey) as any);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.manifest.entries.length).toBeGreaterThan(0);
  });

  it("runs lane eval suite through route", async () => {
    const { laneEval, registerAgent } = await loadRoutes();
    const agent = registerAgent({
      id: "agent-alpha",
      name: "Agent Alpha",
      role: "Worker",
      platform: "codex",
      protocol: "rest",
      issueApiKey: true,
    });

    const res = await laneEval.GET(request("http://localhost/api/gsd/lane-eval", agent.apiKey) as any);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.totalCases).toBe(6);
    expect(body.passRate).toBe(1);
  });

  it("routes models and exposes static policy", async () => {
    const { modelRoute, registerAgent } = await loadRoutes();
    const agent = registerAgent({
      id: "agent-alpha",
      name: "Agent Alpha",
      role: "Worker",
      platform: "codex",
      protocol: "rest",
      issueApiKey: true,
    });

    const policyRes = await modelRoute.GET(request("http://localhost/api/gsd/model-route", agent.apiKey) as any);
    const policyBody = await policyRes.json();
    expect(policyBody.policy.length).toBeGreaterThan(5);

    const routeRes = await modelRoute.POST(
      request("http://localhost/api/gsd/model-route", agent.apiKey, {
        method: "POST",
        body: JSON.stringify({ taskClass: "classification", qualityScore: 0.9 }),
      }) as any
    );
    const routeBody = await routeRes.json();
    expect(routeBody.route.tier).toBe("cheap_local");
  });

  it("executes adapter actions through safety gate", async () => {
    const { adapter, registerAgent } = await loadRoutes();
    const agent = registerAgent({
      id: "agent-alpha",
      name: "Agent Alpha",
      role: "Worker",
      platform: "codex",
      protocol: "rest",
      issueApiKey: true,
    });

    const blocked = await adapter.POST(
      request("http://localhost/api/gsd/adapter", agent.apiKey, {
        method: "POST",
        body: JSON.stringify({
          adapterId: "codex",
          action: "create_task",
          content: "ghp_123456789012345678901234567890123456",
          payload: { title: "blocked", goalId: "blocked-1", lane: "code" },
        }),
      }) as any
    );
    expect(blocked.status).toBe(403);

    const allowed = await adapter.POST(
      request("http://localhost/api/gsd/adapter", agent.apiKey, {
        method: "POST",
        body: JSON.stringify({
          adapterId: "codex",
          action: "create_task",
          content: "safe task",
          payload: { title: "Adapter task", goalId: "adapter-goal-2", lane: "code" },
        }),
      }) as any
    );
    const body = await allowed.json();
    expect(allowed.status).toBe(200);
    expect(body.ownsState).toBe(false);
    expect(body.result.goalId).toBe("adapter-goal-2");
  });
});
