// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { A2aError } from "@/lib/a2a/errors";

const mocks = vi.hoisted(() => ({
  authenticateAgentHeaders: vi.fn(),
  recordHeartbeat: vi.fn(),
  dispatchA2aJsonRpc: vi.fn(),
  getA2aTaskForAgent: vi.fn(),
  subscribeA2aTask: vi.fn(),
  sendA2aMessage: vi.fn(),
  streamA2aMessage: vi.fn(),
  authorizeRegistryWrite: vi.fn(),
  captureCodingAgentSession: vi.fn(),
  buildCodingAgentHandoffPack: vi.fn(),
  verifyMemoryAuditChain: vi.fn(),
  authenticateUser: vi.fn(),
  requireRole: vi.fn(),
  listVaultArtifacts: vi.fn(),
  listEvalRuns: vi.fn(),
  sealQueryAuditLog: vi.fn(),
  routeGsdModel: vi.fn(),
  getGsdModelRoutingPolicy: vi.fn(),
  createOrResumeGsdGoal: vi.fn(),
  buildGsdResume: vi.fn(),
  buildGsdStandup: vi.fn(),
  authorizeChatGptAction: vi.fn(),
  readJsonBody: vi.fn(),
  saveMemroosFromChatGpt: vi.fn(),
  decodeChatGptActionResult: vi.fn(),
  loadContextSourceContracts: vi.fn(),
  evaluateContextSources: vi.fn(),
  resolveEscalation: vi.fn(),
  readFile: vi.fn(),
  db: { prepare: vi.fn() },
}));

vi.mock("@/lib/agent-registry", () => ({
  authenticateAgentHeaders: mocks.authenticateAgentHeaders,
  recordHeartbeat: mocks.recordHeartbeat,
}));

vi.mock("@/lib/a2a/bindings", () => ({
  dispatchA2aJsonRpc: mocks.dispatchA2aJsonRpc,
}));

vi.mock("@/lib/a2a/task-service", () => ({
  getA2aTaskForAgent: mocks.getA2aTaskForAgent,
  subscribeA2aTask: mocks.subscribeA2aTask,
  sendA2aMessage: mocks.sendA2aMessage,
  streamA2aMessage: mocks.streamA2aMessage,
}));

vi.mock("@/lib/operator-auth", () => ({
  authorizeRegistryWrite: mocks.authorizeRegistryWrite,
  registryWriteUnauthorizedResponse: () => Response.json({ ok: false, error: "Forbidden" }, { status: 403 }),
}));

vi.mock("@/lib/db", () => ({
  getDb: () => mocks.db,
}));

vi.mock("@/lib/agent-memory-continuity", () => ({
  captureCodingAgentSession: mocks.captureCodingAgentSession,
  buildCodingAgentHandoffPack: mocks.buildCodingAgentHandoffPack,
}));

vi.mock("@/lib/audit/memory-chain", () => ({
  verifyMemoryAuditChain: mocks.verifyMemoryAuditChain,
}));

vi.mock("@/lib/auth/session", () => ({
  authenticateUser: mocks.authenticateUser,
}));

vi.mock("@/lib/auth/middleware-roles", () => ({
  requireRole: mocks.requireRole,
}));

vi.mock("@/lib/vault/writer", () => ({
  listVaultArtifacts: mocks.listVaultArtifacts,
}));

vi.mock("@/lib/evals/persistence", () => ({
  listEvalRuns: mocks.listEvalRuns,
}));

vi.mock("@/lib/seal/service", () => ({
  SealService: class {
    queryAuditLog = mocks.sealQueryAuditLog;
  },
}));

vi.mock("@/lib/gsd/model-routing-policy", () => ({
  getGsdModelRoutingPolicy: mocks.getGsdModelRoutingPolicy,
  routeGsdModel: mocks.routeGsdModel,
}));

vi.mock("@/lib/agent-gsd-control", () => ({
  asGsdLane: vi.fn((value: unknown) => (value === "green" || value === "blue" ? value : undefined)),
  buildGsdResume: mocks.buildGsdResume,
  buildGsdStandup: mocks.buildGsdStandup,
  createOrResumeGsdGoal: mocks.createOrResumeGsdGoal,
  gsdInputFromJson: vi.fn((value: unknown) => (value && typeof value === "object" && !Array.isArray(value) ? value : {})),
  gsdStringArray: vi.fn((value: unknown) => (Array.isArray(value) ? value.filter((item) => typeof item === "string") : [])),
}));

vi.mock("@/lib/chatgpt-actions", () => ({
  authorizeChatGptAction: mocks.authorizeChatGptAction,
  readJsonBody: mocks.readJsonBody,
  saveMemroosFromChatGpt: mocks.saveMemroosFromChatGpt,
  decodeChatGptActionResult: mocks.decodeChatGptActionResult,
}));

vi.mock("@/lib/context-sources", () => ({
  loadContextSourceContracts: mocks.loadContextSourceContracts,
  evaluateContextSources: mocks.evaluateContextSources,
}));

vi.mock("@/lib/audit/write", () => ({
  resolveEscalation: mocks.resolveEscalation,
}));

vi.mock("fs/promises", () => ({
  readFile: mocks.readFile,
}));

function jsonRequest(url: string, body: unknown, method = "POST") {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function nextRequest(url: string) {
  return new Request(url) as never;
}

describe("Batch N branch-focused API route coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticateAgentHeaders.mockReturnValue({ id: "agent-1" });
    mocks.authorizeRegistryWrite.mockReturnValue(true);
    mocks.authenticateUser.mockResolvedValue({ userId: "user-1", id: "user-1", role: "admin", tenantId: "tenant-1" });
    mocks.requireRole.mockReturnValue(null);
    mocks.getGsdModelRoutingPolicy.mockReturnValue({ tiers: [] });
    mocks.routeGsdModel.mockReturnValue({ tier: "cheap_local", model: "local" });
    mocks.createOrResumeGsdGoal.mockReturnValue({ goalId: "goal-1" });
    mocks.buildGsdResume.mockReturnValue({ goalId: "goal-1", notes: [] });
    mocks.buildGsdStandup.mockReturnValue({ items: [] });
    mocks.authorizeChatGptAction.mockReturnValue(null);
    mocks.readJsonBody.mockResolvedValue({});
    mocks.saveMemroosFromChatGpt.mockResolvedValue({ id: "memory-1" });
    mocks.decodeChatGptActionResult.mockReturnValue({ type: "memory", payload: { id: "memory-1" } });
    mocks.loadContextSourceContracts.mockReturnValue([]);
    mocks.evaluateContextSources.mockReturnValue({ ok: true, sources: [] });
    mocks.listVaultArtifacts.mockReturnValue({ artifacts: [], nextCursor: null });
    mocks.listEvalRuns.mockReturnValue([]);
    mocks.sealQueryAuditLog.mockReturnValue([]);
    mocks.verifyMemoryAuditChain.mockReturnValue({ valid: true });
    mocks.captureCodingAgentSession.mockReturnValue({ id: "capture-1", duplicate: false });
    mocks.buildCodingAgentHandoffPack.mockReturnValue({ id: "handoff-1" });
    mocks.recordHeartbeat.mockReturnValue({ id: "agent-1", status: "active" });
    mocks.readFile.mockRejectedValue(new Error("missing"));
    mocks.db.prepare.mockReturnValue({
      all: vi.fn(() => []),
      get: vi.fn(() => undefined),
      run: vi.fn(),
    });
  });

  it("maps A2A JSON-RPC and task route error branches", async () => {
    mocks.dispatchA2aJsonRpc.mockRejectedValueOnce(new A2aError("INVALID_REQUEST", "bad rpc", { field: "jsonrpc" }));
    const a2aRoute = await import("../../a2a/route");
    const invalidRpc = await a2aRoute.POST(jsonRequest("https://memroos.example/a2a", "{"));
    expect(invalidRpc.status).toBe(400);
    expect(await invalidRpc.json()).toMatchObject({ ok: false, code: "INVALID_REQUEST", details: { field: "jsonrpc" } });
    expect(mocks.dispatchA2aJsonRpc).toHaveBeenCalledWith({ id: "agent-1" }, null);

    mocks.dispatchA2aJsonRpc.mockRejectedValueOnce(new Error("transport down"));
    const genericRpc = await a2aRoute.POST(jsonRequest("https://memroos.example/a2a", { jsonrpc: "2.0" }));
    expect(genericRpc.status).toBe(500);
    expect(await genericRpc.json()).toMatchObject({ code: "INTERNAL", error: "A2A jsonrpc request failed" });

    mocks.getA2aTaskForAgent.mockRejectedValueOnce(new A2aError("NOT_FOUND", "missing task"));
    const taskRoute = await import("../../tasks/[id]/route");
    const taskMissing = await taskRoute.GET(nextRequest("https://memroos.example/tasks/t1"), {
      params: Promise.resolve({ id: "t1" }),
    });
    expect(taskMissing.status).toBe(404);

    mocks.subscribeA2aTask.mockResolvedValueOnce({ task: { id: "task 1" }, events: [] });
    const subscribeRoute = await import("../../tasks/[id]:subscribe/route");
    const subscribed = await subscribeRoute.POST(jsonRequest("https://memroos.example/tasks/task%201:subscribe", {}));
    expect(subscribed.headers.get("content-type")).toContain("text/event-stream");
    expect(await subscribed.text()).toContain('"task 1"');

    mocks.subscribeA2aTask.mockRejectedValueOnce(new Error("stream failed"));
    const streamFailed = await subscribeRoute.POST(jsonRequest("https://memroos.example/tasks/t2:subscribe", {}));
    expect(streamFailed.status).toBe(500);
    expect(await streamFailed.json()).toMatchObject({ code: "INTERNAL" });
  });

  it("covers nullable A2A message body defaults and stream failures", async () => {
    mocks.sendA2aMessage.mockResolvedValueOnce({ id: "task-1" });
    const sendRoute = await import("../../message:send/route");
    const sent = await sendRoute.POST(jsonRequest("https://memroos.example/message:send", "{"));
    expect(sent.status).toBe(200);
    expect(mocks.sendA2aMessage).toHaveBeenCalledWith({ id: "agent-1" }, {
      message: undefined,
      targetAgentId: null,
      contextId: undefined,
      taskId: undefined,
      callerAgentId: undefined,
      metadata: {},
    });

    mocks.sendA2aMessage.mockRejectedValueOnce(new Error("send failed"));
    const sendFailed = await sendRoute.POST(jsonRequest("https://memroos.example/message:send", { metadata: [] }));
    expect(sendFailed.status).toBe(500);

    mocks.streamA2aMessage.mockResolvedValueOnce({ task: { id: "task-2" }, events: [{ state: "working" }] });
    const streamRoute = await import("../../message:stream/route");
    const streamed = await streamRoute.POST(jsonRequest("https://memroos.example/message:stream", {
      targetAgentId: 123,
      contextId: "ctx",
      metadata: { ok: true },
    }));
    expect(await streamed.text()).toContain('"working"');
    expect(mocks.streamA2aMessage).toHaveBeenCalledWith({ id: "agent-1" }, expect.objectContaining({
      targetAgentId: null,
      contextId: "ctx",
      metadata: { ok: true },
    }));

    mocks.streamA2aMessage.mockRejectedValueOnce(new A2aError("UNAUTHORIZED", "denied"));
    const denied = await streamRoute.POST(jsonRequest("https://memroos.example/message:stream", {}));
    expect(denied.status).toBe(403);
  });

  it("covers agent-memory capture and handoff auth, JSON, duplicate, and catch branches", async () => {
    mocks.authorizeRegistryWrite.mockReturnValueOnce(false);
    const captureRoute = await import("../agent-memory/capture/route");
    expect((await captureRoute.POST(jsonRequest("https://memroos.example/api/agent-memory/capture", {}))).status).toBe(403);

    const invalidCapture = await captureRoute.POST(jsonRequest("https://memroos.example/api/agent-memory/capture", "{"));
    expect(invalidCapture.status).toBe(400);
    expect(await invalidCapture.json()).toMatchObject({ error: "invalid JSON body" });

    mocks.captureCodingAgentSession.mockReturnValueOnce({ id: "capture-dup", duplicate: true });
    const duplicate = await captureRoute.POST(jsonRequest("https://memroos.example/api/agent-memory/capture", { sessionId: "s1" }));
    expect(duplicate.status).toBe(200);

    mocks.captureCodingAgentSession.mockImplementationOnce(() => {
      throw "not an error";
    });
    const captureFailed = await captureRoute.POST(jsonRequest("https://memroos.example/api/agent-memory/capture", { sessionId: "s2" }));
    expect(await captureFailed.json()).toMatchObject({ error: "capture failed" });

    mocks.authorizeRegistryWrite.mockReturnValueOnce(false);
    const handoffRoute = await import("../agent-memory/handoff/route");
    expect((await handoffRoute.POST(jsonRequest("https://memroos.example/api/agent-memory/handoff", {}))).status).toBe(403);
    expect((await handoffRoute.POST(jsonRequest("https://memroos.example/api/agent-memory/handoff", "{"))).status).toBe(400);

    mocks.buildCodingAgentHandoffPack.mockImplementationOnce(() => {
      throw new Error("handoff validation failed");
    });
    const handoffFailed = await handoffRoute.POST(jsonRequest("https://memroos.example/api/agent-memory/handoff", { agentId: "a" }));
    expect(await handoffFailed.json()).toMatchObject({ error: "handoff validation failed" });
  });

  it("covers logout cookie and no-cookie branches", async () => {
    const run = vi.fn();
    mocks.db.prepare.mockReturnValueOnce({ run });
    const logoutRoute = await import("../auth/logout/route");

    const noCookie = await logoutRoute.POST(new Request("https://memroos.example/api/auth/logout", { method: "POST" }));
    expect(noCookie.status).toBe(200);
    expect(run).not.toHaveBeenCalled();

    const withCookie = await logoutRoute.POST(new Request("https://memroos.example/api/auth/logout", {
      method: "POST",
      headers: { cookie: "memroos_refresh=refresh%20token" },
    }));
    expect(withCookie.status).toBe(200);
    expect(run).toHaveBeenCalledTimes(1);
    expect(withCookie.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("covers GSD route authentication, default body, alternate field, and error branches", async () => {
    mocks.authenticateAgentHeaders.mockReturnValueOnce(null);
    const modelRoute = await import("../gsd/model-route/route");
    expect((await modelRoute.GET(nextRequest("https://memroos.example/api/gsd/model-route"))).status).toBe(401);

    const defaultModel = await modelRoute.POST(jsonRequest("https://memroos.example/api/gsd/model-route", "{") as never);
    expect(defaultModel.status).toBe(200);
    expect(mocks.routeGsdModel).toHaveBeenCalledWith(mocks.db, expect.objectContaining({
      taskClass: "hard_reasoning",
      success: true,
      sensitive: false,
    }));

    await modelRoute.POST(jsonRequest("https://memroos.example/api/gsd/model-route", {
      agent_id: "ignored",
      task_class: "light",
      task_id: "task-1",
      overrideTier: "frontier",
      success: false,
      latencyMs: 12,
    }) as never);
    expect(mocks.routeGsdModel).toHaveBeenLastCalledWith(mocks.db, expect.objectContaining({
      taskClass: "light",
      taskId: "task-1",
      overrideTier: "frontier",
      success: false,
      latencyMs: 12,
    }));

    mocks.authenticateAgentHeaders.mockReturnValueOnce(null);
    const resumeRoute = await import("../gsd/resume/route");
    expect((await resumeRoute.GET(nextRequest("https://memroos.example/api/gsd/resume"))).status).toBe(401);
    expect((await resumeRoute.GET(nextRequest("https://memroos.example/api/gsd/resume?agent=a"))).status).toBe(400);

    const standupRoute = await import("../gsd/standup/route");
    const standup = await standupRoute.GET(nextRequest("https://memroos.example/api/gsd/standup?limit=nan&lane=green"));
    expect(standup.status).toBe(200);
    expect(mocks.buildGsdStandup).toHaveBeenCalledWith(mocks.db, expect.objectContaining({ limit: 20, lane: "green" }));

    const goalRoute = await import("../gsd/goal/route");
    mocks.authenticateAgentHeaders.mockReturnValueOnce(null);
    expect((await goalRoute.POST(jsonRequest("https://memroos.example/api/gsd/goal", {}) as never)).status).toBe(401);

    mocks.createOrResumeGsdGoal.mockImplementationOnce(() => {
      throw "not an error";
    });
    const failedGoal = await goalRoute.POST(jsonRequest("https://memroos.example/api/gsd/goal", { title: "Ship", scope: [] }) as never);
    expect(failedGoal.status).toBe(400);
    expect(await failedGoal.json()).toMatchObject({ error: "Unknown error" });
  });

  it("covers heartbeat read fallback and POST default branches", async () => {
    const heartbeatRoute = await import("../heartbeat/route");
    expect((await heartbeatRoute.GET(new Request("https://memroos.example/api/heartbeat?agent=../bad"))).status).toBe(400);

    mocks.readFile.mockRejectedValueOnce(new Error("ENOENT"));
    expect(await (await heartbeatRoute.GET(new Request("https://memroos.example/api/heartbeat?agent=agent_1"))).json()).toEqual({ content: null });

    mocks.readFile.mockResolvedValueOnce("one\n\ntwo\n");
    expect(await (await heartbeatRoute.GET(new Request("https://memroos.example/api/heartbeat?agent=agent_1"))).json()).toEqual({ content: "one\ntwo" });

    mocks.authenticateAgentHeaders.mockReturnValueOnce(null);
    expect((await heartbeatRoute.POST(jsonRequest("https://memroos.example/api/heartbeat", {}))).status).toBe(401);

    const updated = await heartbeatRoute.POST(jsonRequest("https://memroos.example/api/heartbeat", "{"));
    expect(updated.status).toBe(200);
    expect(mocks.recordHeartbeat).toHaveBeenCalledWith("agent-1", {
      status: "active",
      currentTask: null,
      latencyMs: null,
      metadata: {},
    });
  });

  it("covers ChatGPT action authorization, validation, metadata, and fallback errors", async () => {
    mocks.authorizeChatGptAction.mockReturnValueOnce(Response.json({ ok: false }, { status: 401 }));
    const saveRoute = await import("../chatgpt/actions/save/route");
    expect((await saveRoute.POST(jsonRequest("https://memroos.example/api/chatgpt/actions/save", {}))).status).toBe(401);

    mocks.readJsonBody.mockResolvedValueOnce({ text: "   " });
    expect((await saveRoute.POST(jsonRequest("https://memroos.example/api/chatgpt/actions/save", {}))).status).toBe(400);

    mocks.readJsonBody.mockResolvedValueOnce({ text: " remember this ", metadata: [] });
    expect((await saveRoute.POST(jsonRequest("https://memroos.example/api/chatgpt/actions/save", {}))).status).toBe(200);
    expect(mocks.saveMemroosFromChatGpt).toHaveBeenCalledWith(expect.objectContaining({ metadata: undefined }));

    mocks.readJsonBody.mockResolvedValueOnce({ text: "remember" });
    mocks.saveMemroosFromChatGpt.mockRejectedValueOnce("nope");
    expect(await (await saveRoute.POST(jsonRequest("https://memroos.example/api/chatgpt/actions/save", {}))).json()).toMatchObject({
      error: "Unable to save memory",
    });

    const fetchRoute = await import("../chatgpt/actions/fetch/route");
    mocks.readJsonBody.mockResolvedValueOnce({ id: 123 });
    expect((await fetchRoute.POST(jsonRequest("https://memroos.example/api/chatgpt/actions/fetch", {}))).status).toBe(400);

    mocks.readJsonBody.mockResolvedValueOnce({ id: "bad" });
    mocks.decodeChatGptActionResult.mockImplementationOnce(() => {
      throw "bad id";
    });
    expect(await (await fetchRoute.POST(jsonRequest("https://memroos.example/api/chatgpt/actions/fetch", {}))).json()).toMatchObject({
      error: "Invalid MemRoOS result id",
    });
  });

  it("covers admin, audit, vault, seal, recall, and context route alternates", async () => {
    mocks.authenticateUser.mockResolvedValueOnce(null);
    const contextRoute = await import("../context/health/route");
    expect((await contextRoute.GET(nextRequest("https://memroos.example/api/context/health"))).status).toBe(401);

    mocks.evaluateContextSources.mockImplementationOnce(() => {
      throw "context failed";
    });
    expect(await (await contextRoute.GET(nextRequest("https://memroos.example/api/context/health"))).json()).toMatchObject({
      error: "Failed to evaluate context sources",
    });

    const evalHistoryRoute = await import("../evals/history/route");
    await evalHistoryRoute.GET(nextRequest("https://memroos.example/api/evals/history?limit=999"));
    expect(mocks.listEvalRuns).toHaveBeenCalledWith(mocks.db, 100);

    const vaultRoute = await import("../admin/vault/route");
    mocks.authenticateUser.mockResolvedValueOnce(null);
    expect((await vaultRoute.GET(nextRequest("https://memroos.example/api/admin/vault"))).status).toBe(401);
    mocks.requireRole.mockReturnValueOnce(Response.json({ error: "Forbidden" }, { status: 403 }));
    expect((await vaultRoute.GET(nextRequest("https://memroos.example/api/admin/vault"))).status).toBe(403);
    await vaultRoute.GET(nextRequest("https://memroos.example/api/admin/vault?limit=nan"));
    expect(mocks.listVaultArtifacts).toHaveBeenCalledWith(mocks.db, { tenantId: "default-tenant", limit: 50, cursor: null });

    const auditLogRoute = await import("../audit-log/route");
    mocks.authenticateUser.mockResolvedValueOnce(null);
    expect((await auditLogRoute.GET(nextRequest("https://memroos.example/api/audit-log"))).status).toBe(401);
    const all = vi.fn(() => []);
    mocks.db.prepare.mockImplementationOnce(() => ({ all }));
    await auditLogRoute.GET(nextRequest("https://memroos.example/api/audit-log?limit=nope"));
    expect(all).toHaveBeenCalledWith(20);

    const sealRoute = await import("../seal/audit/route");
    mocks.authenticateUser.mockResolvedValueOnce(null);
    expect((await sealRoute.GET(nextRequest("https://memroos.example/api/seal/audit"))).status).toBe(401);
    await sealRoute.GET(nextRequest("https://memroos.example/api/seal/audit?limit=nope&proposalId=p1"));
    expect(mocks.sealQueryAuditLog).toHaveBeenCalledWith({ proposalId: "p1", limit: 50 });

    const get = vi
      .fn()
      .mockReturnValueOnce({ c: 3 })
      .mockReturnValueOnce(undefined)
      .mockReturnValueOnce(undefined)
      .mockReturnValueOnce({ size: 4096 });
    mocks.db.prepare.mockReturnValue({ get });
    const recallStatsRoute = await import("../recall/stats/route");
    expect(await (await recallStatsRoute.GET()).json()).toMatchObject({
      rowCount: 3,
      lastIngest: null,
      lastRecallQuery: null,
      dbSizeBytes: 4096,
    });
  });

  it("covers escalation resolve auth, optional body, not-found, and conflict branches", async () => {
    const resolveRoute = await import("../escalations/[id]/resolve/route");
    const params = { params: Promise.resolve({ id: "esc-1" }) };

    mocks.authenticateUser.mockResolvedValueOnce(null);
    expect((await resolveRoute.POST(jsonRequest("https://memroos.example/api/escalations/esc-1/resolve", {}) as never, params)).status).toBe(401);

    expect((await resolveRoute.POST(jsonRequest("https://memroos.example/api/escalations//resolve", {}) as never, {
      params: Promise.resolve({ id: "" }),
    })).status).toBe(400);

    mocks.db.prepare.mockReturnValueOnce({ get: vi.fn(() => undefined) });
    expect((await resolveRoute.POST(jsonRequest("https://memroos.example/api/escalations/esc-1/resolve", {}) as never, params)).status).toBe(404);

    const escalation = { id: "esc-1", status: "open" };
    mocks.db.prepare
      .mockReturnValueOnce({ get: vi.fn(() => escalation) })
      .mockReturnValueOnce({ get: vi.fn(() => ({ ...escalation, status: "resolved" })) });
    const resolved = await resolveRoute.POST(jsonRequest("https://memroos.example/api/escalations/esc-1/resolve", "{") as never, params);
    expect(resolved.status).toBe(200);
    expect(mocks.resolveEscalation).toHaveBeenCalledWith("esc-1", expect.objectContaining({ note: undefined }), mocks.db);

    mocks.db.prepare.mockReturnValueOnce({ get: vi.fn(() => escalation) });
    mocks.resolveEscalation.mockImplementationOnce(() => {
      throw "no transition";
    });
    const conflict = await resolveRoute.POST(jsonRequest("https://memroos.example/api/escalations/esc-1/resolve", { note: "done" }) as never, params);
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toMatchObject({ error: "resolution failed" });
  });
});
