// @vitest-environment node
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TEST_DB_DIR = path.join(os.tmpdir(), `agents-id-route-${crypto.randomUUID()}`);
const TEST_DB_PATH = path.join(TEST_DB_DIR, "agent-id.db");

async function loadRoutes(localRuntime?: { scannedAt: string }) {
  process.env.SQLITE_DB_PATH = TEST_DB_PATH;
  vi.resetModules();
  if (localRuntime === undefined) {
    vi.doMock("@/lib/local-agent-runtime", () => ({
      getLocalAgentRuntime: () => ({ activeCliCount: 0, byPlatform: {}, scannedAt: "2026-05-07T07:45:00.000Z" }),
    }));
  } else if (localRuntime === null) {
    vi.doMock("@/lib/local-agent-runtime", () => ({
      getLocalAgentRuntime: () => {
        throw new Error("local runtime unavailable");
      },
    }));
  } else {
    vi.doMock("@/lib/local-agent-runtime", () => ({
      getLocalAgentRuntime: () => ({ activeCliCount: 1, byPlatform: { codex: 1 }, scannedAt: localRuntime.scannedAt }),
    }));
  }

  const registerRoute = await import("../../register/route");
  const agentRoute = await import("../route");
  const heartbeatRoute = await import("../../../heartbeat/route");
  const dbModule = await import("@/lib/db");
  return { registerRoute, agentRoute, heartbeatRoute, getDb: dbModule.getDb, closeDb: dbModule.closeDb };
}

async function registerAgent(registerRoute: { POST: (req: Request) => Promise<Response> }, id: string, issueApiKey = false) {
  const res = await registerRoute.POST(
    new Request("http://localhost/api/agents/register", {
      method: "POST",
      body: JSON.stringify({
        id,
        name: `Agent ${id}`,
        role: "Test agent",
        platform: "codex",
        protocol: "rest",
        issueApiKey,
      }),
    })
  );
  expect(res.status).toBe(200);
  return res.json();
}

describe("GET /api/agents/[id]", () => {
  beforeEach(() => {
    fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
    fs.mkdirSync(TEST_DB_DIR, { recursive: true });
  });

  afterEach(async () => {
    const { closeDb } = await loadRoutes();
    closeDb();
    fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
    delete process.env.SQLITE_DB_PATH;
    vi.doUnmock("@/lib/local-agent-runtime");
  });

  it("returns 404 when the agent does not exist", async () => {
    const { agentRoute } = await loadRoutes();
    const res = await agentRoute.GET(
      new Request("http://localhost/api/agents/missing-agent") as any,
      { params: Promise.resolve({ id: "missing-agent" }) }
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: "Agent not found: missing-agent" });
  });

  it("returns agent detail with never-seen liveness when no heartbeat exists", async () => {
    const { registerRoute, agentRoute } = await loadRoutes();
    await registerAgent(registerRoute, "detail-never");

    const res = await agentRoute.GET(
      new Request("http://localhost/api/agents/detail-never") as any,
      { params: Promise.resolve({ id: "detail-never" }) }
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.agent.id).toBe("detail-never");
    expect(body.liveness.state).toBe("never");
    expect(body.liveness.heartbeat.status).toBe("empty");
    expect(body.liveness.heartbeat.value).toBeNull();
    expect(body.timestamp).toBeTruthy();
  });

  it("classifies live agents from a recent heartbeat", async () => {
    const { registerRoute, agentRoute, heartbeatRoute } = await loadRoutes();
    const registered = await registerAgent(registerRoute, "detail-live", true);

    const heartbeatRes = await heartbeatRoute.POST(
      new Request("http://localhost/api/heartbeat", {
        method: "POST",
        headers: { authorization: `Bearer ${registered.apiKey}` },
        body: JSON.stringify({ status: "active", currentTask: "coverage run" }),
      })
    );
    expect(heartbeatRes.status).toBe(200);

    const res = await agentRoute.GET(
      new Request("http://localhost/api/agents/detail-live") as any,
      { params: Promise.resolve({ id: "detail-live" }) }
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.liveness.state).toBe("live");
    expect(body.liveness.heartbeat.status).toBe("live");
    expect(body.liveness.heartbeat.value).toBe(0);
    expect(body.agent.status).toBe("active");
  });

  it("classifies stale agents from an old heartbeat", async () => {
    const { registerRoute, agentRoute, getDb } = await loadRoutes();
    await registerAgent(registerRoute, "detail-stale");

    const staleAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    getDb()
      .prepare(`UPDATE registered_agents SET last_heartbeat_at = ? WHERE id = ?`)
      .run(staleAt, "detail-stale");

    const res = await agentRoute.GET(
      new Request("http://localhost/api/agents/detail-stale") as any,
      { params: Promise.resolve({ id: "detail-stale" }) }
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.liveness.state).toBe("stale");
    expect(body.liveness.heartbeat.status).toBe("stale");
    expect(body.liveness.heartbeat.value).toBeNull();
    expect(body.liveness.observedAt).toBe(staleAt);
  });

  it("still returns agent detail when local runtime probing fails", async () => {
    const { registerRoute, agentRoute } = await loadRoutes(null);
    await registerAgent(registerRoute, "detail-runtime-fail");

    const res = await agentRoute.GET(
      new Request("http://localhost/api/agents/detail-runtime-fail") as any,
      { params: Promise.resolve({ id: "detail-runtime-fail" }) }
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.agent.id).toBe("detail-runtime-fail");
    expect(body.liveness.state).toBe("never");
  });
});

describe("PATCH /api/agents/[id]", () => {
  beforeEach(() => {
    fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
    fs.mkdirSync(TEST_DB_DIR, { recursive: true });
  });

  afterEach(async () => {
    const { closeDb } = await loadRoutes();
    closeDb();
    fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
    delete process.env.SQLITE_DB_PATH;
    delete process.env.MEMROOS_OPERATOR_API_KEY;
    vi.doUnmock("@/lib/local-agent-runtime");
  });

  it("updates display fields for a registered agent", async () => {
    const { registerRoute, agentRoute } = await loadRoutes();
    await registerAgent(registerRoute, "patch-agent");

    const res = await agentRoute.PATCH(
      new Request("http://localhost/api/agents/patch-agent", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Renamed Agent",
          role: "Updated role",
          company: "MemRoOS",
        }),
      }),
      { params: Promise.resolve({ id: "patch-agent" }) }
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.agent).toMatchObject({
      id: "patch-agent",
      name: "Renamed Agent",
      role: "Updated role",
      company: "MemRoOS",
    });
    expect(body.timestamp).toEqual(expect.any(String));
  });

  it("returns 404 when patching a missing agent", async () => {
    const { agentRoute } = await loadRoutes();

    const res = await agentRoute.PATCH(
      new Request("http://localhost/api/agents/missing-patch", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Ghost" }),
      }),
      { params: Promise.resolve({ id: "missing-patch" }) }
    );

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: "Agent not found: missing-patch" });
  });

  it("rejects invalid JSON, non-object bodies, and invalid field types", async () => {
    const { registerRoute, agentRoute } = await loadRoutes();
    await registerAgent(registerRoute, "patch-validate");

    const badJson = await agentRoute.PATCH(
      new Request("http://localhost/api/agents/patch-validate", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: "{not-json",
      }),
      { params: Promise.resolve({ id: "patch-validate" }) }
    );
    expect(badJson.status).toBe(400);
    expect(await badJson.json()).toMatchObject({ error: "Invalid JSON body" });

    const notObject = await agentRoute.PATCH(
      new Request("http://localhost/api/agents/patch-validate", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify("not-an-object"),
      }),
      { params: Promise.resolve({ id: "patch-validate" }) }
    );
    expect(notObject.status).toBe(400);
    expect(await notObject.json()).toMatchObject({ error: "Body must be an object" });

    const badName = await agentRoute.PATCH(
      new Request("http://localhost/api/agents/patch-validate", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: 42 }),
      }),
      { params: Promise.resolve({ id: "patch-validate" }) }
    );
    expect(badName.status).toBe(400);
    expect(await badName.json()).toMatchObject({ error: "name must be a string" });

    const badCompany = await agentRoute.PATCH(
      new Request("http://localhost/api/agents/patch-validate", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ company: 99 }),
      }),
      { params: Promise.resolve({ id: "patch-validate" }) }
    );
    expect(badCompany.status).toBe(400);
    expect(await badCompany.json()).toMatchObject({ error: "company must be a string or null" });
  });

  it("returns 400 when update validation fails", async () => {
    const { registerRoute, agentRoute } = await loadRoutes();
    await registerAgent(registerRoute, "patch-empty-name");

    const res = await agentRoute.PATCH(
      new Request("http://localhost/api/agents/patch-empty-name", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "   " }),
      }),
      { params: Promise.resolve({ id: "patch-empty-name" }) }
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "name cannot be empty" });
  });

  it("requires operator authorization for non-local PATCH writes", async () => {
    process.env.MEMROOS_OPERATOR_API_KEY = "operator-secret";
    const { registerRoute, agentRoute } = await loadRoutes();
    await registerAgent(registerRoute, "remote-patch");

    const rejected = await agentRoute.PATCH(
      new Request("https://memroos.example.com/api/agents/remote-patch", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Blocked" }),
      }),
      { params: Promise.resolve({ id: "remote-patch" }) }
    );
    expect(rejected.status).toBe(403);

    const accepted = await agentRoute.PATCH(
      new Request("https://memroos.example.com/api/agents/remote-patch", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-memroos-operator-key": "operator-secret",
        },
        body: JSON.stringify({ name: "Remote Rename" }),
      }),
      { params: Promise.resolve({ id: "remote-patch" }) }
    );
    expect(accepted.status).toBe(200);
    expect((await accepted.json()).agent.name).toBe("Remote Rename");
  });
});

describe("DELETE /api/agents/[id]", () => {
  beforeEach(() => {
    fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
    fs.mkdirSync(TEST_DB_DIR, { recursive: true });
  });

  afterEach(async () => {
    const { closeDb } = await loadRoutes();
    closeDb();
    fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
    delete process.env.SQLITE_DB_PATH;
    vi.doUnmock("@/lib/local-agent-runtime");
  });

  it("returns 404 when deleting a missing agent", async () => {
    const { agentRoute } = await loadRoutes();

    const res = await agentRoute.DELETE(
      new Request("http://localhost/api/agents/missing-delete"),
      { params: Promise.resolve({ id: "missing-delete" }) }
    );

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: "Agent not found: missing-delete" });
  });
});
