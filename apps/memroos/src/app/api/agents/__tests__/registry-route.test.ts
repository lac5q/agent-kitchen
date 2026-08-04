// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { signAccessToken, signViewAsToken } from "@/lib/auth/jwt";

/** /api/agents now authenticates, so it needs a request object. */
function agentsRequest(): never {
  return new Request("http://localhost/api/agents") as never;
}

type TestSession = { userId: string; role: string; email: string; displayName: string; tenantId: string } | null;
const ADMIN_SESSION: TestSession = {
  userId: "test-admin",
  role: "admin",
  email: "admin@test",
  displayName: "admin",
  tenantId: "default-tenant",
};
let testSession: TestSession = ADMIN_SESSION;

const TEST_DB_DIR = path.join(os.tmpdir(), `agents-route-${crypto.randomUUID()}`);
const TEST_DB_PATH = path.join(TEST_DB_DIR, "routes.db");

async function loadRoutes(localRuntime = { activeCliCount: 0, byPlatform: {}, scannedAt: "2026-05-07T07:45:00.000Z" }) {
  process.env.SQLITE_DB_PATH = TEST_DB_PATH;
  vi.resetModules();
    // Most of these tests assert registry behaviour, not authorization, so the
    // default viewer is an admin. The authorization test sets testSession to
    // null so it still exercises the no-credential path it exists to check.
    vi.doMock("@/lib/auth/session", () => ({
      authenticateUser: async () => testSession,
    }));
  vi.doMock("@/lib/local-agent-runtime", () => ({
    getLocalAgentRuntime: () => localRuntime,
  }));
  const agentsRoute = await import("../route");
  const registerRoute = await import("../register/route");
  const agentRoute = await import("../[id]/route");
  const heartbeatRoute = await import("../../heartbeat/route");
  const dbModule = await import("@/lib/db");
  const db = dbModule.getDb();
  db.prepare(
    "INSERT OR IGNORE INTO users (id, email, display_name, password_hash) VALUES (?,?,?,?)"
  ).run("test-admin", "admin@agents.test", "Test Admin", "x");
  db.prepare("INSERT OR IGNORE INTO user_roles (user_id, role) VALUES (?,?)").run("test-admin", "admin");
  return { agentsRoute, registerRoute, agentRoute, heartbeatRoute, getDb: dbModule.getDb, closeDb: dbModule.closeDb };
}

describe("agent registry routes", () => {
  afterEach(() => {
    testSession = ADMIN_SESSION;
  });

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
  });

  it("registers, lists, and deregisters canonical agents", async () => {
    const { agentsRoute, registerRoute, agentRoute } = await loadRoutes();

    const registerResponse = await registerRoute.POST(
      new Request("http://localhost/api/agents/register", {
        method: "POST",
        body: JSON.stringify({
          id: "route-agent",
          name: "Route Agent",
          role: "REST reporter",
          platform: "codex",
          protocol: "rest",
          issueApiKey: true,
        }),
      })
    );

    expect(registerResponse.status).toBe(200);
    const registered = await registerResponse.json();
    expect(registered.apiKey).toBeTruthy();
    expect(registered.agent.id).toBe("route-agent");

    const listResponse = await agentsRoute.GET(agentsRequest());
    const listBody = await listResponse.json();
    expect(listBody.agents).toEqual([
      expect.objectContaining({ id: "route-agent", protocol: "rest" }),
    ]);
    expect(JSON.stringify(listBody.agents)).not.toContain(registered.apiKey);

    const deleteResponse = await agentRoute.DELETE(
      new Request("http://localhost/api/agents/route-agent"),
      { params: Promise.resolve({ id: "route-agent" }) }
    );
    expect(deleteResponse.status).toBe(200);

    const afterDelete = await agentsRoute.GET(agentsRequest());
    expect((await afterDelete.json()).agents).toHaveLength(0);
  });

  it("registers then accepts a curl-like authenticated heartbeat", async () => {
    const { agentsRoute, registerRoute, heartbeatRoute } = await loadRoutes();

    const registerResponse = await registerRoute.POST(
      new Request("http://localhost/api/agents/register", {
        method: "POST",
        body: JSON.stringify({
          id: "curl-agent",
          name: "Curl Agent",
          role: "Non-A2A REST client",
          platform: "codex",
          protocol: "rest",
          issueApiKey: true,
        }),
      })
    );
    const registered = await registerResponse.json();

    const heartbeatResponse = await heartbeatRoute.POST(
      new Request("http://localhost/api/heartbeat", {
        method: "POST",
        headers: { authorization: `Bearer ${registered.apiKey}` },
        body: JSON.stringify({ status: "active", currentTask: "curl check-in" }),
      })
    );
    expect(heartbeatResponse.status).toBe(200);

    const listResponse = await agentsRoute.GET(agentsRequest());
    const agents = (await listResponse.json()).agents;
    expect(agents[0]).toMatchObject({
      id: "curl-agent",
      protocol: "rest",
      status: "active",
      currentTask: "curl check-in",
    });
  });

  it("derives active status from recent hive activity", async () => {
    const { agentsRoute, registerRoute, getDb } = await loadRoutes();

    await registerRoute.POST(
      new Request("http://localhost/api/agents/register", {
        method: "POST",
        body: JSON.stringify({
          id: "alba",
          name: "Alba",
          role: "Coordinator",
          platform: "hermes",
          protocol: "rest",
          issueApiKey: false,
        }),
      })
    );

    getDb()
      .prepare(
        `INSERT INTO hive_actions(agent_id, action_type, summary, timestamp)
         VALUES ('alba', 'checkpoint', 'Recent checkpoint', ?)`
      )
      .run(new Date().toISOString());

    const listResponse = await agentsRoute.GET(agentsRequest());
    const agents = (await listResponse.json()).agents;
    expect(agents[0]).toMatchObject({
      id: "alba",
      status: "active",
      currentTask: "Recent checkpoint",
      metadata: expect.objectContaining({ derivedActivity: "recent_hive_action" }),
    });
  });

  it("derives active status from live non-Paperclip local runtimes", async () => {
    const { agentsRoute, registerRoute } = await loadRoutes({
      activeCliCount: 6,
      byPlatform: { claude: 1, codex: 1, gemini: 1, hermes: 1, openclaw: 1, qwen: 1 },
      scannedAt: "2026-05-07T07:45:00.000Z",
    });

    for (const agent of [
      { id: "alba", name: "Alba", platform: "hermes" },
      { id: "sophia", name: "Sophia", platform: "openclaw" },
      { id: "claude-code-luis-mbp", name: "Claude Code", platform: "claude" },
      { id: "codex-desktop-luis-mbp", name: "Codex Desktop", platform: "codex" },
      { id: "gemini-cli-luis-mbp", name: "Gemini CLI", platform: "gemini" },
      { id: "qwen-cli-luis-mbp", name: "Qwen CLI", platform: "qwen" },
      { id: "codex-persona", name: "Codex Persona", platform: "codex" },
    ]) {
      await registerRoute.POST(
        new Request("http://localhost/api/agents/register", {
          method: "POST",
          body: JSON.stringify({
            ...agent,
            role: "Runtime participant",
            protocol: "rest",
            issueApiKey: false,
          }),
        })
      );
    }

    const listResponse = await agentsRoute.GET(agentsRequest());
    const agents = (await listResponse.json()).agents;
    expect(agents.find((agent: { id: string }) => agent.id === "alba")).toMatchObject({
      status: "active",
      currentTask: "Local hermes runtime detected",
      metadata: expect.objectContaining({ derivedActivity: "local_runtime_process" }),
    });
    expect(agents.find((agent: { id: string }) => agent.id === "sophia")).toMatchObject({
      status: "active",
      currentTask: "Local openclaw runtime detected",
      metadata: expect.objectContaining({ derivedActivity: "local_runtime_process" }),
    });
    for (const id of [
      "claude-code-luis-mbp",
      "codex-desktop-luis-mbp",
      "gemini-cli-luis-mbp",
      "qwen-cli-luis-mbp",
    ]) {
      expect(agents.find((agent: { id: string }) => agent.id === id)).toMatchObject({
        status: "active",
        metadata: expect.objectContaining({ derivedActivity: "local_runtime_process" }),
      });
    }
    expect(agents.find((agent: { id: string }) => agent.id === "codex-persona")).toMatchObject({
      status: "dormant",
    });
  });

  it("requires operator authorization for non-local registry writes", async () => {
    // No signed-in human: this is the machine path, which must present the
    // operator key. A session is now also a valid credential, so the test has to
    // remove it to still be testing what it claims.
    testSession = null;
    process.env.MEMROOS_OPERATOR_API_KEY = "operator-secret";
    const { agentsRoute, registerRoute, agentRoute } = await loadRoutes();

    const registrationBody = JSON.stringify({
      id: "remote-register-agent",
      name: "Remote Register Agent",
      role: "Attempts remote registration",
      platform: "codex",
      protocol: "rest",
      issueApiKey: true,
      ownerUserId: "test-admin",
    });

    const rejectedRegister = await registerRoute.POST(
      new Request("https://memroos.example.com/api/agents/register", {
        method: "POST",
        body: registrationBody,
      })
    );
    expect(rejectedRegister.status).toBe(403);

    const acceptedRegister = await registerRoute.POST(
      new Request("https://memroos.example.com/api/agents/register", {
        method: "POST",
        headers: { "x-memroos-operator-key": "operator-secret" },
        body: registrationBody,
      })
    );
    expect(acceptedRegister.status).toBe(200);

    const rejectedDelete = await agentRoute.DELETE(
      new Request("https://memroos.example.com/api/agents/remote-register-agent", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: "remote-register-agent" }) }
    );
    expect(rejectedDelete.status).toBe(403);
    // Listing is not what this test asserts; it needs a viewer to read state.
    testSession = ADMIN_SESSION;
    expect((await (await agentsRoute.GET(agentsRequest())).json()).agents).toHaveLength(1);
    testSession = null;

    const acceptedDelete = await agentRoute.DELETE(
      new Request("https://memroos.example.com/api/agents/remote-register-agent", {
        method: "DELETE",
        headers: { "x-memroos-operator-key": "operator-secret" },
      }),
      { params: Promise.resolve({ id: "remote-register-agent" }) }
    );
    expect(acceptedDelete.status).toBe(200);
    testSession = ADMIN_SESSION;
    expect((await (await agentsRoute.GET(agentsRequest())).json()).agents).toHaveLength(0);
  });

  it("rejects a loopback registration with no session or operator key", async () => {
    testSession = null;
    delete process.env.MEMROOS_OPERATOR_API_KEY;
    const { registerRoute } = await loadRoutes();

    const response = await registerRoute.POST(
      new Request("http://localhost/api/agents/register", {
        method: "POST",
        body: JSON.stringify({
          id: "loopback-credential-bypass",
          name: "Loopback Credential Bypass",
          role: "Authentication attack",
          platform: "codex",
          protocol: "rest",
          ownerUserId: "test-admin",
          issueApiKey: true,
        }),
      })
    );

    expect(response.status).toBe(403);
  });

  it("requires ownerUserId for an operator-key registration", async () => {
    testSession = null;
    process.env.MEMROOS_OPERATOR_API_KEY = "operator-secret";
    const { registerRoute, getDb } = await loadRoutes();

    const response = await registerRoute.POST(
      new Request("https://memroos.example.com/api/agents/register", {
        method: "POST",
        headers: { "x-memroos-operator-key": "operator-secret" },
        body: JSON.stringify({
          id: "operator-owner-bypass",
          name: "Operator Owner Bypass",
          role: "Ownership attack",
          platform: "codex",
          protocol: "rest",
          issueApiKey: true,
        }),
      })
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("ownerUserId is required");
    expect(getDb().prepare("SELECT 1 FROM registered_agents WHERE id = ?").get("operator-owner-bypass")).toBeUndefined();
  });

  it("rejects caller-supplied capabilities instead of pretending to store them", async () => {
    const { registerRoute, getDb } = await loadRoutes();

    const response = await registerRoute.POST(
      new Request("http://localhost/api/agents/register", {
        method: "POST",
        body: JSON.stringify({
          id: "capability-body-bypass",
          name: "Capability Body Bypass",
          role: "Capability authority attack",
          platform: "codex",
          protocol: "rest",
          capabilities: [{ id: "attacker-capability", name: "Attacker Capability" }],
          issueApiKey: true,
        }),
      })
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("capabilities");
    expect(getDb().prepare("SELECT 1 FROM registered_agents WHERE id = ?").get("capability-body-bypass")).toBeUndefined();
  });

  it("accepts ChatGPT as a first-class registered agent platform", async () => {
    const { agentsRoute, registerRoute } = await loadRoutes();

    const registerResponse = await registerRoute.POST(
      new Request("http://localhost/api/agents/register", {
        method: "POST",
        body: JSON.stringify({
          id: "chatgpt",
          name: "ChatGPT",
          role: "Interactive planning and research agent",
          platform: "chatgpt",
          protocol: "rest",
          issueApiKey: false,
        }),
      })
    );

    expect(registerResponse.status).toBe(200);
    const listResponse = await agentsRoute.GET(agentsRequest());
    expect((await listResponse.json()).agents).toEqual([
      expect.objectContaining({ id: "chatgpt", platform: "chatgpt" }),
    ]);
  });

  it("accepts Cline as a first-class registered agent platform", async () => {
    const { agentsRoute, registerRoute } = await loadRoutes();

    const registerResponse = await registerRoute.POST(
      new Request("http://localhost/api/agents/register", {
        method: "POST",
        body: JSON.stringify({
          id: "cline",
          name: "Cline",
          role: "Interactive coding agent",
          platform: "cline",
          protocol: "rest",
          issueApiKey: false,
        }),
      })
    );

    expect(registerResponse.status).toBe(200);
    const listResponse = await agentsRoute.GET(agentsRequest());
    expect((await listResponse.json()).agents).toEqual([
      expect.objectContaining({ id: "cline", platform: "cline" }),
    ]);
  });

  it("view-as lists exactly the target user's visible agents", async () => {
    process.env.MEMROOS_JWT_SECRET = "test-secret-that-is-long-enough-32ch";
    const { agentsRoute, registerRoute, getDb } = await loadRoutes();

    const now = new Date().toISOString();
    getDb()
      .prepare(
        `INSERT OR IGNORE INTO users (id, email, display_name, password_hash, tenant_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run("test-admin", "admin@view-as.test", "Admin One", "unused", "default-tenant", now);
    getDb()
      .prepare(
        `INSERT INTO users (id, email, display_name, password_hash, tenant_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run("target-user", "target@view-as.test", "Target User", "unused", "default-tenant", now);
    getDb().prepare("INSERT OR IGNORE INTO user_roles (user_id, role) VALUES (?, ?)").run("test-admin", "admin");
    getDb().prepare("INSERT INTO user_roles (user_id, role) VALUES (?, ?)").run("target-user", "reviewer");

    testSession = {
      userId: "target-user",
      role: "reviewer",
      email: "target@view-as.test",
      displayName: "Target User",
      tenantId: "default-tenant",
    };
    await registerRoute.POST(
      new Request("http://localhost/api/agents/register", {
        method: "POST",
        body: JSON.stringify({
          id: "target-agent",
          name: "Target Agent",
          role: "Target-owned",
          platform: "codex",
          protocol: "rest",
          issueApiKey: false,
        }),
      })
    );

    testSession = ADMIN_SESSION;
    await registerRoute.POST(
      new Request("http://localhost/api/agents/register", {
        method: "POST",
        body: JSON.stringify({
          id: "admin-agent",
          name: "Admin Agent",
          role: "Admin-owned",
          platform: "codex",
          protocol: "rest",
          issueApiKey: false,
        }),
      })
    );

    const accessToken = await signAccessToken("test-admin", "admin");
    const viewAsToken = await signViewAsToken("test-admin", "target-user");
    const listResponse = await agentsRoute.GET(
      new Request("http://localhost/api/agents", {
        headers: {
          authorization: `Bearer ${accessToken}`,
          cookie: `view_as_token=${viewAsToken}`,
        },
      })
    );

    expect(listResponse.status).toBe(200);
    expect((await listResponse.json()).agents).toEqual([
      expect.objectContaining({ id: "target-agent" }),
    ]);
  });
});
