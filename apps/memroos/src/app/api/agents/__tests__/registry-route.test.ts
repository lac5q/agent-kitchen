// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";

const TEST_DB_DIR = path.join(os.tmpdir(), `agents-route-${crypto.randomUUID()}`);
const TEST_DB_PATH = path.join(TEST_DB_DIR, "routes.db");

async function loadRoutes(localRuntime = { activeCliCount: 0, byPlatform: {}, scannedAt: "2026-05-07T07:45:00.000Z" }) {
  process.env.SQLITE_DB_PATH = TEST_DB_PATH;
  vi.resetModules();
  vi.doMock("@/lib/local-agent-runtime", () => ({
    getLocalAgentRuntime: () => localRuntime,
  }));
  const agentsRoute = await import("../route");
  const registerRoute = await import("../register/route");
  const agentRoute = await import("../[id]/route");
  const heartbeatRoute = await import("../../heartbeat/route");
  const dbModule = await import("@/lib/db");
  return { agentsRoute, registerRoute, agentRoute, heartbeatRoute, getDb: dbModule.getDb, closeDb: dbModule.closeDb };
}

describe("agent registry routes", () => {
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
          capabilities: [{ id: "heartbeat", name: "Heartbeat", description: "", tags: [] }],
          issueApiKey: true,
        }),
      })
    );

    expect(registerResponse.status).toBe(200);
    const registered = await registerResponse.json();
    expect(registered.apiKey).toBeTruthy();
    expect(registered.agent.id).toBe("route-agent");

    const listResponse = await agentsRoute.GET();
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

    const afterDelete = await agentsRoute.GET();
    expect((await afterDelete.json()).agents).toHaveLength(0);
  });

  it("validates registration bodies and filters optional capability fields", async () => {
    const { agentsRoute, registerRoute } = await loadRoutes();

    const invalidJson = await registerRoute.POST(
      new Request("http://localhost/api/agents/register", {
        method: "POST",
        body: "{",
      })
    );
    expect(invalidJson.status).toBe(400);

    const invalidPlatform = await registerRoute.POST(
      new Request("http://localhost/api/agents/register", {
        method: "POST",
        body: JSON.stringify({
          id: "bad-platform",
          name: "Bad Platform",
          role: "Worker",
          platform: "unknown",
          protocol: "rest",
        }),
      })
    );
    expect(invalidPlatform.status).toBe(400);

    const registered = await registerRoute.POST(
      new Request("http://localhost/api/agents/register", {
        method: "POST",
        body: JSON.stringify({
          id: "optional-agent",
          name: "Optional Agent",
          role: "Worker",
          platform: "codex",
          protocol: "rest",
          company: 123,
          location: "mars",
          host: "agent.example.invalid",
          port: "3000",
          healthEndpoint: "/health",
          tunnelUrl: "https://tunnel.example.com",
          capabilities: [
            null,
            { id: "", name: "ignored" },
            { id: "memory.read", tags: ["safe", 1] },
          ],
          metadata: ["not-object"],
          issueApiKey: false,
        }),
      })
    );
    const body = await registered.json();
    expect(registered.status).toBe(200);
    expect(body.apiKey).toBeUndefined();

    const list = await agentsRoute.GET();
    const agent = (await list.json()).agents.find((item: { id: string }) => item.id === "optional-agent");
    expect(agent).toMatchObject({
      id: "optional-agent",
      host: "agent.example.invalid",
      healthEndpoint: "/health",
      tunnelUrl: "https://tunnel.example.com",
      capabilities: [
        { id: "memory.read", name: "memory.read", description: "", tags: ["safe", "1"] },
      ],
    });
    expect(agent.location).toBe("local");
    expect(agent.port).toBeNull();
    expect(agent.company).toBeUndefined();
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

    const listResponse = await agentsRoute.GET();
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

    const listResponse = await agentsRoute.GET();
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

    const listResponse = await agentsRoute.GET();
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
    process.env.MEMROOS_OPERATOR_API_KEY = "operator-secret";
    const { agentsRoute, registerRoute, agentRoute } = await loadRoutes();

    const registrationBody = JSON.stringify({
      id: "remote-register-agent",
      name: "Remote Register Agent",
      role: "Attempts remote registration",
      platform: "codex",
      protocol: "rest",
      issueApiKey: true,
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
    expect((await (await agentsRoute.GET()).json()).agents).toHaveLength(1);

    const acceptedDelete = await agentRoute.DELETE(
      new Request("https://memroos.example.com/api/agents/remote-register-agent", {
        method: "DELETE",
        headers: { "x-memroos-operator-key": "operator-secret" },
      }),
      { params: Promise.resolve({ id: "remote-register-agent" }) }
    );
    expect(acceptedDelete.status).toBe(200);
    expect((await (await agentsRoute.GET()).json()).agents).toHaveLength(0);
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
    const listResponse = await agentsRoute.GET();
    expect((await listResponse.json()).agents).toEqual([
      expect.objectContaining({ id: "chatgpt", platform: "chatgpt" }),
    ]);
  });
});
