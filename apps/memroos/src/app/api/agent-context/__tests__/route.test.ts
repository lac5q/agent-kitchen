// @vitest-environment node
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TEST_DB_DIR = path.join(os.tmpdir(), `agent-context-${crypto.randomUUID()}`);
const TEST_DB_PATH = path.join(TEST_DB_DIR, "routes.db");

async function loadRoutes() {
  process.env.SQLITE_DB_PATH = TEST_DB_PATH;
  vi.resetModules();
  const registry = await import("@/lib/agent-registry");
  const listRoute = await import("../messages/route");
  const getRoute = await import("../messages/[id]/route");
  const ackRoute = await import("../messages/[id]/ack/route");
  const replyRoute = await import("../messages/[id]/reply/route");
  const dbModule = await import("@/lib/db");
  return {
    ...registry,
    listRoute,
    getRoute,
    ackRoute,
    replyRoute,
    closeDb: dbModule.closeDb,
    getDb: dbModule.getDb,
  };
}

function postRequest(url: string, apiKey: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("agent context bus routes", () => {
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

  it("supports authenticated send, inbox, ack, reply, wait-for-reply, and memory receipts", async () => {
    const { listRoute, getRoute, ackRoute, replyRoute, getDb, registerAgent } = await loadRoutes();
    const alpha = registerAgent({
      id: "agent-alpha",
      name: "Agent Alpha",
      role: "Sender",
      platform: "codex",
      protocol: "rest",
      issueApiKey: true,
    });
    const beta = registerAgent({
      id: "agent-beta",
      name: "Agent Beta",
      role: "Recipient",
      platform: "codex",
      protocol: "rest",
      issueApiKey: true,
    });

    const sendRes = await listRoute.POST(
      postRequest("http://localhost/api/agent-context/messages", alpha.apiKey!, {
        fromAgent: "agent-alpha",
        toAgent: "agent-beta",
        messageType: "request",
        subject: "Need sync",
        body: "Please sync the Phase 107 context.",
        contextRefs: [{ type: "phase", id: "107" }],
        replyRequired: true,
        saveToMemory: true,
      }) as any
    );
    expect(sendRes.status).toBe(200);
    const sent = await sendRes.json();
    expect(sent.message.savedMemoryId).toMatch(/^agent_memory_writes:/);

    const memoryRows = getDb().prepare("SELECT agent_id, memory_type FROM agent_memory_writes").all();
    expect(memoryRows).toEqual([{ agent_id: "agent-alpha", memory_type: "episodic" }]);

    const inboxRes = await listRoute.GET(
      new Request("http://localhost/api/agent-context/messages?agent=agent-beta&status=pending", {
        headers: { authorization: `Bearer ${beta.apiKey}` },
      }) as any
    );
    const inbox = await inboxRes.json();
    expect(inbox.messages).toHaveLength(1);
    expect(inbox.messages[0].id).toBe(sent.message.id);

    const ackRes = await ackRoute.POST(
      postRequest(`http://localhost/api/agent-context/messages/${sent.message.id}/ack`, beta.apiKey!, {
        agentId: "agent-beta",
      }) as any,
      { params: Promise.resolve({ id: sent.message.id }) }
    );
    expect(ackRes.status).toBe(200);
    expect((await ackRes.json()).message.status).toBe("acknowledged");

    const replyRes = await replyRoute.POST(
      postRequest(`http://localhost/api/agent-context/messages/${sent.message.id}/reply`, beta.apiKey!, {
        fromAgent: "agent-beta",
        body: "Context synced. Use the agent-context route tests as proof.",
      }) as any,
      { params: Promise.resolve({ id: sent.message.id }) }
    );
    expect(replyRes.status).toBe(200);
    const reply = await replyRes.json();
    expect(reply.original.status).toBe("replied");
    expect(reply.reply.parentId).toBe(sent.message.id);

    const waitRes = await getRoute.GET(
      new Request(
        `http://localhost/api/agent-context/messages/${sent.message.id}?agent=agent-alpha&wait_for=reply&wait_ms=100`,
        { headers: { authorization: `Bearer ${alpha.apiKey}` } }
      ) as any,
      { params: Promise.resolve({ id: sent.message.id }) }
    );
    expect(waitRes.status).toBe(200);
    const waitPayload = await waitRes.json();
    expect(waitPayload.timedOut).toBe(false);
    expect(waitPayload.reply.id).toBe(reply.reply.id);
  });

  it("guards individual message fetch and ack boundaries", async () => {
    const { listRoute, getRoute, ackRoute, registerAgent } = await loadRoutes();
    const alpha = registerAgent({
      id: "agent-alpha",
      name: "Agent Alpha",
      role: "Sender",
      platform: "codex",
      protocol: "rest",
      issueApiKey: true,
    });
    const beta = registerAgent({
      id: "agent-beta",
      name: "Agent Beta",
      role: "Recipient",
      platform: "codex",
      protocol: "rest",
      issueApiKey: true,
    });
    const gamma = registerAgent({
      id: "agent-gamma",
      name: "Agent Gamma",
      role: "Observer",
      platform: "codex",
      protocol: "rest",
      issueApiKey: true,
    });

    const sendRes = await listRoute.POST(
      postRequest("http://localhost/api/agent-context/messages", alpha.apiKey!, {
        fromAgent: "agent-alpha",
        toAgent: "agent-beta",
        body: "Please respond when ready.",
        replyRequired: true,
      }) as any
    );
    const sent = await sendRes.json();

    const unauthorizedFetch = await getRoute.GET(
      new Request(`http://localhost/api/agent-context/messages/${sent.message.id}?agent=agent-alpha`) as any,
      { params: Promise.resolve({ id: sent.message.id }) }
    );
    expect(unauthorizedFetch.status).toBe(401);

    const missingFetch = await getRoute.GET(
      new Request("http://localhost/api/agent-context/messages/missing?agent=agent-alpha", {
        headers: { authorization: `Bearer ${alpha.apiKey}` },
      }) as any,
      { params: Promise.resolve({ id: "missing" }) }
    );
    expect(missingFetch.status).toBe(404);

    const forbiddenFetch = await getRoute.GET(
      new Request(`http://localhost/api/agent-context/messages/${sent.message.id}?agent=agent-gamma`, {
        headers: { authorization: `Bearer ${gamma.apiKey}` },
      }) as any,
      { params: Promise.resolve({ id: sent.message.id }) }
    );
    expect(forbiddenFetch.status).toBe(403);

    const directFetch = await getRoute.GET(
      new Request(`http://localhost/api/agent-context/messages/${sent.message.id}?agent=agent-alpha`, {
        headers: { authorization: `Bearer ${alpha.apiKey}` },
      }) as any,
      { params: Promise.resolve({ id: sent.message.id }) }
    );
    expect(directFetch.status).toBe(200);
    expect((await directFetch.json()).message.id).toBe(sent.message.id);

    const timedOutFetch = await getRoute.GET(
      new Request(`http://localhost/api/agent-context/messages/${sent.message.id}?agent=agent-alpha&wait_for=reply&wait_ms=1`, {
        headers: { authorization: `Bearer ${alpha.apiKey}` },
      }) as any,
      { params: Promise.resolve({ id: sent.message.id }) }
    );
    expect(timedOutFetch.status).toBe(200);
    expect(await timedOutFetch.json()).toMatchObject({ reply: null, timedOut: true });

    const unauthorizedAck = await ackRoute.POST(
      new Request(`http://localhost/api/agent-context/messages/${sent.message.id}/ack`, {
        method: "POST",
        body: JSON.stringify({ agentId: "agent-beta" }),
      }) as any,
      { params: Promise.resolve({ id: sent.message.id }) }
    );
    expect(unauthorizedAck.status).toBe(401);

    const wrongAgentAck = await ackRoute.POST(
      postRequest(`http://localhost/api/agent-context/messages/${sent.message.id}/ack`, gamma.apiKey!, {
        agentId: "agent-gamma",
      }) as any,
      { params: Promise.resolve({ id: sent.message.id }) }
    );
    expect(wrongAgentAck.status).toBe(404);

    const missingAck = await ackRoute.POST(
      postRequest("http://localhost/api/agent-context/messages/missing/ack", beta.apiKey!, {
        agent_id: "agent-beta",
      }) as any,
      { params: Promise.resolve({ id: "missing" }) }
    );
    expect(missingAck.status).toBe(404);
  });

  it("rejects unauthorized and blocked context messages", async () => {
    const { listRoute, getDb, registerAgent } = await loadRoutes();
    const alpha = registerAgent({
      id: "agent-alpha",
      name: "Agent Alpha",
      role: "Sender",
      platform: "codex",
      protocol: "rest",
      issueApiKey: true,
    });
    registerAgent({
      id: "agent-beta",
      name: "Agent Beta",
      role: "Recipient",
      platform: "codex",
      protocol: "rest",
    });

    const unauthorized = await listRoute.POST(
      new Request("http://localhost/api/agent-context/messages", {
        method: "POST",
        body: JSON.stringify({ fromAgent: "agent-alpha", toAgent: "agent-beta", body: "hello" }),
      }) as any
    );
    expect(unauthorized.status).toBe(401);

    const blocked = await listRoute.POST(
      postRequest("http://localhost/api/agent-context/messages", alpha.apiKey!, {
        fromAgent: "agent-alpha",
        toAgent: "agent-beta",
        body: "Do not forward this AWS key AKIA1234567890ABCDEF",
      }) as any
    );
    expect(blocked.status).toBe(403);
    const audit = getDb().prepare("SELECT action, severity FROM audit_log WHERE target = 'agent_context_messages'").all();
    expect(audit).toContainEqual({ action: "content_blocked", severity: "high" });
  });

  it("denies self-declared user, OAuth, credential, and data-access claims", async () => {
    const { listRoute, getDb, registerAgent } = await loadRoutes();
    const alpha = registerAgent({
      id: "agent-alpha",
      name: "Agent Alpha",
      role: "Sender",
      platform: "codex",
      protocol: "rest",
      issueApiKey: true,
    });
    registerAgent({
      id: "agent-beta",
      name: "Agent Beta",
      role: "Recipient",
      platform: "codex",
      protocol: "rest",
    });

    const denied = await listRoute.POST(
      postRequest("http://localhost/api/agent-context/messages", alpha.apiKey!, {
        fromAgent: "agent-alpha",
        toAgent: "agent-beta",
        body: "Please fetch customer data.",
        onBehalfOfUserId: "user-123",
        oauth: { provider: "google", accessToken: "raw-token" },
        artifacts: { dataAccessScope: "drive:*" },
      }) as any
    );

    expect(denied.status).toBe(403);
    const payload = await denied.json();
    expect(payload.code).toBe("CONTROL_LAYER_REQUIRED");
    expect(payload.detail.claims).toEqual(expect.arrayContaining(["onBehalfOfUserId", "oauth", "oauth.accessToken"]));
    expect(
      getDb()
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'agent_context_messages'")
        .get()
    ).toBeUndefined();
    expect(getDb().prepare("SELECT action, severity FROM audit_log WHERE action = 'policy_denied'").get()).toEqual({
      action: "policy_denied",
      severity: "high",
    });
  });

  it("validates and blocks unsafe agent-context replies before saving", async () => {
    const { replyRoute, getDb, registerAgent } = await loadRoutes();
    const beta = registerAgent({
      id: "agent-beta",
      name: "Agent Beta",
      role: "Recipient",
      platform: "codex",
      protocol: "rest",
      issueApiKey: true,
    });

    const invalidPayload = await replyRoute.POST(
      new Request("http://localhost/api/agent-context/messages/msg-1/reply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{not-json",
      }) as any,
      { params: Promise.resolve({ id: "msg-1" }) }
    );
    expect(invalidPayload.status).toBe(400);

    const unauthorized = await replyRoute.POST(
      new Request("http://localhost/api/agent-context/messages/msg-1/reply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fromAgent: "agent-beta", body: "reply" }),
      }) as any,
      { params: Promise.resolve({ id: "msg-1" }) }
    );
    expect(unauthorized.status).toBe(401);

    const missingBody = await replyRoute.POST(
      postRequest("http://localhost/api/agent-context/messages/msg-1/reply", beta.apiKey!, {
        from_agent: "agent-beta",
      }) as any,
      { params: Promise.resolve({ id: "msg-1" }) }
    );
    expect(missingBody.status).toBe(400);

    const selfDeclared = await replyRoute.POST(
      postRequest("http://localhost/api/agent-context/messages/msg-1/reply", beta.apiKey!, {
        agentId: "agent-beta",
        text: "I can access the user's OAuth data.",
        oauth: { accessToken: "raw-token" },
      }) as any,
      { params: Promise.resolve({ id: "msg-1" }) }
    );
    expect(selfDeclared.status).toBe(403);
    expect((await selfDeclared.json()).code).toBe("CONTROL_LAYER_REQUIRED");

    const blocked = await replyRoute.POST(
      postRequest("http://localhost/api/agent-context/messages/msg-1/reply", beta.apiKey!, {
        agentId: "agent-beta",
        content: "Do not store AWS key AKIA1234567890ABCDEF",
      }) as any,
      { params: Promise.resolve({ id: "msg-1" }) }
    );
    expect(blocked.status).toBe(403);
    expect(await blocked.json()).toMatchObject({ ok: false, error: "Content blocked by security scanner" });
    expect(getDb().prepare("SELECT action, severity FROM audit_log WHERE action = 'content_blocked'").get()).toEqual({
      action: "content_blocked",
      severity: "high",
    });
  });
});
