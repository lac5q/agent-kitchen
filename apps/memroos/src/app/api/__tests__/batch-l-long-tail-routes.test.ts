// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class MockSkillSyncError extends Error {}
  class MockSyncGovernanceError extends Error {}
  class MockQuarantineTransitionError extends Error {}
  class MockA2aError extends Error {
    code: string;
    details?: unknown;
    constructor(code: string, message: string, details?: unknown) {
      super(message);
      this.name = "A2aError";
      this.code = code;
      this.details = details;
    }
  }

  return {
    db: { prepare: vi.fn() },
    authorizeRegistryWrite: vi.fn(() => true),
    authorizeSyncWrite: vi.fn(() => ({ ok: true })),
    authorizeQuarantineWrite: vi.fn(() => ({ ok: true })),
    queryGraphMemory: vi.fn(),
    searchVectorMemory: vi.fn(),
    filterAuthorizedMemoryItems: vi.fn((_db, items) => items),
    extractMemoryLabelSnapshot: vi.fn(),
    getQuarantineRecord: vi.fn(),
    rejectQuarantine: vi.fn(),
    rollbackAgentVersionPinByAgent: vi.fn(),
    approveImportProposal: vi.fn(),
    approveSyncProposalById: vi.fn(),
    rejectSyncProposalById: vi.fn(),
    ingestA2aAgentCard: vi.fn(),
    authenticateUser: vi.fn(),
    requireRole: vi.fn(() => null),
    loadEvalConfig: vi.fn(),
    saveEvalConfig: vi.fn(),
    summarizeCompliancePosture: vi.fn(),
    writeAuditEntry: vi.fn(),
    createAgentCheckpoint: vi.fn(),
    resumeFromCheckpoint: vi.fn(),
    recordMemoryTrace: vi.fn(),
    getMemoryTrace: vi.fn(),
    getMemoryTraceTimeline: vi.fn(),
    createAgentVersion: vi.fn(),
    listAgentVersions: vi.fn(),
    queryEscalations: vi.fn(),
    checkSlaBreaches: vi.fn(),
    recommendModels: vi.fn(),
    responseCache: { getOrSet: vi.fn() },
    cacheKey: vi.fn((parts: unknown[]) => parts.join("|")),
    sealListProposals: vi.fn(),
    sealReflectOnTrace: vi.fn(),
    runRetentionExpiry: vi.fn(),
    resolveOrchestrationHil: vi.fn(),
    rollbackOrchestrationRun: vi.fn(),
    authenticateAgentHeaders: vi.fn(),
    buildAgentContextPacket: vi.fn(),
    listRegisteredAgents: vi.fn(),
    getRemoteAgents: vi.fn(),
    buildAgentContext: vi.fn(),
    resolveChatRuntimePlan: vi.fn(),
    chatRuntimeStatus: vi.fn(),
    selectAdapter: vi.fn(),
    SkillSyncError: MockSkillSyncError,
    SyncGovernanceError: MockSyncGovernanceError,
    QuarantineTransitionError: MockQuarantineTransitionError,
    A2aError: MockA2aError,
  };
});

vi.mock("@/lib/db", () => ({
  getDb: () => mocks.db,
}));

vi.mock("@/lib/operator-auth", () => ({
  authorizeRegistryWrite: mocks.authorizeRegistryWrite,
  registryWriteUnauthorizedResponse: () => Response.json({ error: "Forbidden" }, { status: 403 }),
}));

vi.mock("@/app/api/skills/_sync-auth", () => ({
  authorizeSyncWrite: mocks.authorizeSyncWrite,
}));

vi.mock("@/app/api/skills/quarantine/_auth", () => ({
  authorizeQuarantineWrite: mocks.authorizeQuarantineWrite,
}));

vi.mock("@/lib/memory/backends", () => ({
  queryGraphMemory: mocks.queryGraphMemory,
  searchVectorMemory: mocks.searchVectorMemory,
}));

vi.mock("@/lib/memory/policy-gate", () => ({
  extractMemoryLabelSnapshot: mocks.extractMemoryLabelSnapshot,
  filterAuthorizedMemoryItems: mocks.filterAuthorizedMemoryItems,
}));

vi.mock("@/lib/skills/skill-quarantine", () => ({
  QuarantineTransitionError: mocks.QuarantineTransitionError,
  getQuarantineRecord: mocks.getQuarantineRecord,
  rejectQuarantine: mocks.rejectQuarantine,
}));

vi.mock("@/lib/skills/skill-sync-governance", () => ({
  SyncGovernanceError: mocks.SyncGovernanceError,
  rollbackAgentVersionPinByAgent: mocks.rollbackAgentVersionPinByAgent,
  approveImportProposal: mocks.approveImportProposal,
}));

vi.mock("@/lib/skills/skill-sync", () => ({
  SkillSyncError: mocks.SkillSyncError,
  approveSyncProposalById: mocks.approveSyncProposalById,
  rejectSyncProposalById: mocks.rejectSyncProposalById,
}));

vi.mock("@/lib/a2a/card-ingestion", () => ({
  ingestA2aAgentCard: mocks.ingestA2aAgentCard,
}));

vi.mock("@/lib/a2a/errors", () => ({
  A2aError: mocks.A2aError,
  a2aErrorResponse: (error: InstanceType<typeof mocks.A2aError>) =>
    Response.json({ ok: false, error: error.message, code: error.code }, { status: error.code === "INVALID_REQUEST" ? 400 : 500 }),
}));

vi.mock("@/lib/auth/session", () => ({
  authenticateUser: mocks.authenticateUser,
}));

vi.mock("@/lib/auth/middleware-roles", () => ({
  requireRole: mocks.requireRole,
}));

vi.mock("@/lib/evals/config", () => ({
  loadEvalConfig: mocks.loadEvalConfig,
  saveEvalConfig: mocks.saveEvalConfig,
}));

vi.mock("@/lib/compliance/data-residency", () => ({
  summarizeCompliancePosture: mocks.summarizeCompliancePosture,
}));

vi.mock("@/lib/audit/write", () => ({
  writeAuditEntry: mocks.writeAuditEntry,
}));

vi.mock("@/lib/agent-checkpoints", () => ({
  createAgentCheckpoint: mocks.createAgentCheckpoint,
  resumeFromCheckpoint: mocks.resumeFromCheckpoint,
}));

vi.mock("@/lib/memory-trace-observability", () => ({
  recordMemoryTrace: mocks.recordMemoryTrace,
  getMemoryTrace: mocks.getMemoryTrace,
  getMemoryTraceTimeline: mocks.getMemoryTraceTimeline,
}));

vi.mock("@/lib/agent-cicd-gates", () => ({
  createAgentVersion: mocks.createAgentVersion,
  listAgentVersions: mocks.listAgentVersions,
}));

vi.mock("@/lib/audit/query", () => ({
  queryEscalations: mocks.queryEscalations,
  streamAuditEntries: vi.fn(() => []),
}));

vi.mock("@/lib/audit/sla", () => ({
  checkSlaBreaches: mocks.checkSlaBreaches,
}));

vi.mock("@/lib/model-routing", () => ({
  recommendModels: mocks.recommendModels,
}));

vi.mock("@/lib/response-cache", () => ({
  cacheKey: mocks.cacheKey,
  responseCache: mocks.responseCache,
}));

vi.mock("@/lib/seal/service", () => ({
  SealService: class {
    listProposals = mocks.sealListProposals;
    reflectOnTrace = mocks.sealReflectOnTrace;
  },
}));

vi.mock("@/lib/memory/retention-expiry", () => ({
  runRetentionExpiry: mocks.runRetentionExpiry,
}));

vi.mock("@/lib/orchestration/client", () => ({
  resolveOrchestrationHil: mocks.resolveOrchestrationHil,
  rollbackOrchestrationRun: mocks.rollbackOrchestrationRun,
}));

vi.mock("@/lib/agent-registry", () => ({
  authenticateAgentHeaders: mocks.authenticateAgentHeaders,
  listRegisteredAgents: mocks.listRegisteredAgents,
  getRemoteAgents: mocks.getRemoteAgents,
}));

vi.mock("@/lib/agent-context-packet", () => ({
  buildAgentContextPacket: mocks.buildAgentContextPacket,
}));

vi.mock("@/app/api/chat/chat-runtime", () => ({
  buildAgentContext: mocks.buildAgentContext,
  resolveChatRuntimePlan: mocks.resolveChatRuntimePlan,
  chatRuntimeStatus: mocks.chatRuntimeStatus,
}));

vi.mock("@/lib/dispatch/adapter-factory", () => ({
  selectAdapter: mocks.selectAdapter,
}));

function jsonRequest(url: string, body: unknown, method = "POST") {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json", authorization: "Bearer test" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("Batch L long-tail API route branches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorizeRegistryWrite.mockReturnValue(true);
    mocks.authorizeSyncWrite.mockReturnValue({ ok: true });
    mocks.authorizeQuarantineWrite.mockReturnValue({ ok: true });
    mocks.db.prepare.mockReturnValue({ get: vi.fn(() => ({ dispatch_status: "quarantined" })) });
    mocks.filterAuthorizedMemoryItems.mockImplementation((_db, items) => items);
    mocks.authenticateUser.mockResolvedValue({ userId: "admin-1", id: "admin-1", tenantId: "tenant-1", role: "admin" });
    mocks.requireRole.mockReturnValue(null);
    mocks.loadEvalConfig.mockReturnValue({
      judgeModel: { provider: "local", modelFamily: "local", localEndpoint: "http://localhost" },
      compliance: { dataResidency: { enabled: false }, auditRetentionDays: 30, enabledAdapters: ["sqlite"] },
    });
    mocks.summarizeCompliancePosture.mockReturnValue({ dataResidencyEnabled: true, enabledAdapters: ["sqlite"] });
    mocks.responseCache.getOrSet.mockImplementation(async (_namespace, _key, _ttl, loader) => loader());
  });

  it("normalizes graph and vector memory search result containers", async () => {
    mocks.queryGraphMemory.mockResolvedValueOnce({
      results: [{ node: { id: "n1" }, neighbors: [{ id: "a" }, { id: "b" }] }],
    });
    const graphRoute = await import("../memory/graph/route");
    const graph = await graphRoute.GET(new Request("https://memroos.test/api/memory/graph?limit=NaN"));
    await expect(graph.json()).resolves.toMatchObject({
      ok: true,
      result: { results: [{ node: { id: "n1" }, neighbors: [{ id: "a" }, { id: "b" }] }] },
    });
    expect(mocks.queryGraphMemory).toHaveBeenCalledWith("", 25);

    mocks.searchVectorMemory.mockResolvedValueOnce({ data: [{ id: 7, text: "memory" }] });
    const searchRoute = await import("../memory/search/route");
    const vector = await searchRoute.GET(new Request("https://memroos.test/api/memory/search?limit=-5"));
    await expect(vector.json()).resolves.toMatchObject({ ok: true, tier: "vector", result: { data: [{ id: 7 }] } });
    expect(mocks.searchVectorMemory).toHaveBeenCalledWith("recent", 1);
  });

  it("maps skill quarantine and sync validation/error branches", async () => {
    const quarantineReject = await import("../skills/quarantine/reject/route");
    const noOperator = await quarantineReject.POST(jsonRequest("https://memroos.test/api/skills/quarantine/reject", {
      skill_id: 1,
      reason: "unsafe",
    }));
    expect(noOperator.status).toBe(400);

    mocks.getQuarantineRecord.mockReturnValueOnce({ stage: "quarantined" });
    mocks.rejectQuarantine.mockImplementationOnce(() => {
      throw new mocks.QuarantineTransitionError("already rejected");
    });
    const conflict = await quarantineReject.POST(jsonRequest("https://memroos.test/api/skills/quarantine/reject", {
      skill_id: "1",
      operator: "ops",
      reason: "unsafe",
    }));
    expect(conflict.status).toBe(409);

    const pinRollback = await import("../skills/pins/[agent]/rollback/route");
    const invalidPinBody = await pinRollback.POST(jsonRequest("https://memroos.test/api/skills/pins/a/rollback", []), {
      params: Promise.resolve({ agent: "a" }),
    });
    expect(invalidPinBody.status).toBe(400);
    mocks.rollbackAgentVersionPinByAgent.mockImplementationOnce(() => {
      throw new mocks.SyncGovernanceError("No version pin found");
    });
    const missingPin = await pinRollback.POST(
      jsonRequest("https://memroos.test/api/skills/pins/a/rollback", { skill_name: "skill", operator: "ops" }),
      { params: Promise.resolve({ agent: "a" }) },
    );
    expect(missingPin.status).toBe(404);

    const proposalApprove = await import("../skills/proposals/[id]/approve/route");
    const missingOperator = await proposalApprove.POST(jsonRequest("https://memroos.test/api/skills/proposals/p/approve", null), {
      params: Promise.resolve({ id: "p" }),
    });
    expect(missingOperator.status).toBe(400);
    mocks.approveImportProposal.mockImplementationOnce(() => {
      throw new Error("disk failed");
    });
    const approveFailed = await proposalApprove.POST(
      jsonRequest("https://memroos.test/api/skills/proposals/p/approve", { operator: "ops" }),
      { params: Promise.resolve({ id: "p" }) },
    );
    expect(approveFailed.status).toBe(500);
  });

  it("maps sync proposal approve/reject body defaults and conflicts", async () => {
    const approve = await import("../skills/sync/proposals/[proposalId]/approve/route");
    mocks.approveSyncProposalById.mockReturnValueOnce({ proposal_id: "p1" });
    const approved = await approve.POST(
      jsonRequest("https://memroos.test/api/skills/sync/proposals/p1/approve", {
        operator: "ops",
        reason: " ok ",
        expected_updated_at: " 2026-01-01T00:00:00.000Z ",
        apply_to_registry: false,
      }),
      { params: Promise.resolve({ proposalId: "p1" }) },
    );
    expect(approved.status).toBe(200);
    expect(mocks.approveSyncProposalById).toHaveBeenCalledWith(mocks.db, expect.objectContaining({
      proposal_id: "p1",
      reason: "ok",
      expected_updated_at: "2026-01-01T00:00:00.000Z",
      apply_to_registry: false,
    }));

    const reject = await import("../skills/sync/proposals/[proposalId]/reject/route");
    const invalidJson = await reject.POST(
      new Request("https://memroos.test/api/skills/sync/proposals/p1/reject", { method: "POST", body: "{" }),
      { params: Promise.resolve({ proposalId: "p1" }) },
    );
    expect(invalidJson.status).toBe(400);
    mocks.rejectSyncProposalById.mockImplementationOnce(() => {
      throw new mocks.SkillSyncError("Stale concurrent update");
    });
    const stale = await reject.POST(
      jsonRequest("https://memroos.test/api/skills/sync/proposals/p1/reject", { operator: "ops", reason: "bad" }),
      { params: Promise.resolve({ proposalId: "p1" }) },
    );
    expect(stale.status).toBe(409);
  });

  it("covers compact registry, checkpoint, trace, version, and compliance routes", async () => {
    const register = await import("../a2a/agents/register/route");
    const badRegister = await register.POST(jsonRequest("https://memroos.test/api/a2a/agents/register", { source: "bad" }));
    expect(badRegister.status).toBe(400);
    mocks.ingestA2aAgentCard.mockImplementationOnce(() => {
      throw new mocks.A2aError("INVALID_REQUEST", "bad card");
    });
    const a2aError = await register.POST(jsonRequest("https://memroos.test/api/a2a/agents/register", {
      cardUrl: "https://agent.test/card.json",
      source: "manual",
      issueApiKey: true,
    }));
    expect(a2aError.status).toBe(400);

    const compliance = await import("../admin/compliance/route");
    const noBody = await compliance.PUT(new Request("https://memroos.test/api/admin/compliance", { method: "PUT", body: "{" }) as never);
    expect(noBody.status).toBe(400);
    const updated = await compliance.PUT(jsonRequest("https://memroos.test/api/admin/compliance", {
      dataResidencyEnabled: true,
      auditRetentionDays: 7.6,
      enabledAdapters: ["sqlite", "", 3],
    }, "PUT") as never);
    expect(updated.status).toBe(200);
    expect(mocks.saveEvalConfig).toHaveBeenCalledWith(expect.objectContaining({
      compliance: expect.objectContaining({ auditRetentionDays: 8, enabledAdapters: ["sqlite"] }),
    }));

    const checkpoints = await import("../agent-checkpoints/route");
    const missingRun = await checkpoints.GET(new Request("https://memroos.test/api/agent-checkpoints") as never);
    expect(missingRun.status).toBe(400);
    mocks.resumeFromCheckpoint.mockReturnValueOnce(null);
    const notFoundCheckpoint = await checkpoints.GET(new Request("https://memroos.test/api/agent-checkpoints?runId=r1") as never);
    expect(notFoundCheckpoint.status).toBe(404);

    const traces = await import("../agent-memory/traces/route");
    mocks.getMemoryTrace.mockReturnValueOnce({ id: "trace-1" });
    mocks.getMemoryTraceTimeline.mockReturnValueOnce(["created"]);
    const trace = await traces.GET(new Request("https://memroos.test/api/agent-memory/traces?runId=r1") as never);
    await expect(trace.json()).resolves.toMatchObject({ status: "ok", timeline: ["created"] });

    const versions = await import("../agents/versions/route");
    const noAgent = await versions.GET(new Request("https://memroos.test/api/agents/versions") as never);
    expect(noAgent.status).toBe(400);
    mocks.listAgentVersions.mockReturnValueOnce([{ version: "v1" }]);
    const versionList = await versions.GET(new Request("https://memroos.test/api/agents/versions?agentId=a") as never);
    await expect(versionList.json()).resolves.toMatchObject({ versions: [{ version: "v1" }] });
  });

  it("exercises operational routes with defaults and non-fatal side paths", async () => {
    const escalations = await import("../escalations/route");
    mocks.authenticateUser.mockResolvedValueOnce({ tenantId: "tenant-a", role: "reviewer" });
    mocks.checkSlaBreaches.mockImplementationOnce(() => {
      throw new Error("sla offline");
    });
    mocks.queryEscalations.mockReturnValueOnce([{ id: "e1", sla_deadline: new Date(Date.now() + 1000).toISOString() }]);
    const escalation = await escalations.GET(new Request("https://memroos.test/api/escalations?status=weird&limit=NaN") as never);
    expect(escalation.status).toBe(200);
    expect(mocks.queryEscalations).toHaveBeenCalledWith(expect.objectContaining({ status: "open", limit: NaN }), mocks.db);

    const recommendations = await import("../model-routing/recommendations/route");
    mocks.recommendModels.mockReturnValueOnce([{ model: "fast" }]);
    const recGet = await recommendations.GET(new Request("https://memroos.test/api/model-routing/recommendations?taskType= Review &strategy=speed&limit=NaN") as never);
    await expect(recGet.json()).resolves.toMatchObject({ taskType: "review", strategy: "balanced", recommendations: [{ model: "fast" }] });
    mocks.recommendModels.mockReturnValueOnce([{ model: "quality" }]);
    const recPost = await recommendations.POST(jsonRequest("https://memroos.test/api/model-routing/recommendations", {
      taskType: " Ops ",
      strategy: "quality",
      limit: 99,
    }) as never);
    await expect(recPost.json()).resolves.toMatchObject({ taskType: "ops", strategy: "quality" });

    const seal = await import("../seal/proposals/route");
    mocks.sealListProposals.mockReturnValueOnce([{ id: "p1" }]);
    const proposalList = await seal.GET(new Request("https://memroos.test/api/seal/proposals?status=not-real") as never);
    await expect(proposalList.json()).resolves.toMatchObject({ proposals: [{ id: "p1" }] });
    expect(mocks.sealListProposals).toHaveBeenCalledWith({ status: undefined });
    const badReflect = await seal.POST(jsonRequest("https://memroos.test/api/seal/proposals", { traceId: "t" }) as never);
    expect(badReflect.status).toBe(400);

    const expiry = await import("../memory-lifecycle/expiry/route");
    mocks.runRetentionExpiry.mockReturnValueOnce({ status: "lease_held" });
    const leaseHeld = await expiry.POST(jsonRequest("https://memroos.test/api/memory-lifecycle/expiry", {
      runKey: " run ",
      leaseTtlSeconds: "30",
      scope: null,
      now: "2026-01-01T00:00:00.000Z",
    }));
    expect(leaseHeld.status).toBe(409);
  });

  it("covers orchestration, agent context, audit export, and engagement checks", async () => {
    const hil = await import("../orchestration/hil/[id]/route");
    const badHil = await hil.POST(jsonRequest("https://memroos.test/api/orchestration/hil/1", { decision: "maybe" }), {
      params: Promise.resolve({ id: "hil-1" }),
    });
    expect(badHil.status).toBe(400);
    mocks.resolveOrchestrationHil.mockRejectedValueOnce(new Error("hil down"));
    const hilDown = await hil.POST(jsonRequest("https://memroos.test/api/orchestration/hil/1", { decision: "approve" }), {
      params: Promise.resolve({ id: "hil-1" }),
    });
    expect(hilDown.status).toBe(502);

    const rollback = await import("../orchestration/runs/[id]/rollback/route");
    mocks.authorizeRegistryWrite.mockReturnValueOnce(false);
    const unauthorizedRollback = await rollback.POST(jsonRequest("https://memroos.test/api/orchestration/runs/r1/rollback", {}), {
      params: Promise.resolve({ id: "r1" }),
    });
    expect(unauthorizedRollback.status).toBe(403);
    const invalidRollback = await rollback.POST(jsonRequest("https://memroos.test/api/orchestration/runs/r1/rollback", []), {
      params: Promise.resolve({ id: "r1" }),
    });
    expect(invalidRollback.status).toBe(400);

    const agentContext = await import("../agent-context/route");
    mocks.authenticateAgentHeaders.mockReturnValueOnce({ id: "agent-1" });
    const invalidLane = await agentContext.GET(new Request("https://memroos.test/api/agent-context?goal_id=g&lane=bad&agent=a") as never);
    expect(invalidLane.status).toBe(400);
    mocks.authenticateAgentHeaders.mockReturnValueOnce({ id: "agent-1" });
    mocks.buildAgentContextPacket.mockReturnValueOnce({ packet: { id: "ctx" } });
    const context = await agentContext.GET(new Request("https://memroos.test/api/agent-context?goalId=g&lane=ops&acceptance=a,b,,&agent=a") as never);
    await expect(context.json()).resolves.toMatchObject({ ok: true, packet: { id: "ctx" } });

    const auditExport = await import("../audit/export/route");
    const csv = await auditExport.GET(new Request("https://memroos.test/api/audit/export?format=csv&eventType=a,b") as never);
    expect(csv.headers.get("content-type")).toContain("text/csv");
    expect(await csv.text()).toContain("id,tenant_id");

    const engagement = await import("../engagement/test/route");
    mocks.listRegisteredAgents.mockReturnValueOnce([
      { id: "a1", name: "A1", role: "ops", platform: "local", protocol: "a2a", status: "active", capabilities: [] },
      { id: "a2", name: "A2", role: "ops", platform: "local", protocol: "poll", status: "active", capabilities: [] },
    ]);
    mocks.getRemoteAgents.mockReturnValueOnce([{ id: "a1", name: "A1", role: "ops", platform: "remote", protocol: "a2a", skills: [] }]);
    mocks.resolveChatRuntimePlan.mockResolvedValue({
      primary: { runner: "anthropic", model: "claude", source: "primary" },
      candidates: [
        { runner: "anthropic", model: "claude", source: "primary" },
        { runner: "opencode", model: "local", source: "fallback" },
      ],
    });
    mocks.chatRuntimeStatus.mockImplementation((candidate) =>
      candidate.runner === "anthropic"
        ? { status: "blocked", detail: "missing key", lastError: "no key" }
        : { status: "ready", detail: "ready" },
    );
    mocks.selectAdapter.mockImplementation((agent) => ({ name: agent.protocol === "a2a" ? "a2a" : "poll" }));
    const engagementResult = await engagement.POST(jsonRequest("https://memroos.test/api/engagement/test", { agentIds: ["a1"] }) as never);
    await expect(engagementResult.json()).resolves.toMatchObject({
      ok: true,
      results: [expect.objectContaining({ agentId: "a1", chat: expect.objectContaining({ status: "warning" }) })],
    });
  });

  it("Batch M covers compact API error and fallback branches", async () => {
    const register = await import("../a2a/agents/register/route");
    mocks.authorizeRegistryWrite.mockReturnValueOnce(false);
    const unauthorizedRegister = await register.POST(jsonRequest("https://memroos.test/api/a2a/agents/register", {
      cardUrl: "https://agent.test/card.json",
      source: "manual",
    }));
    expect(unauthorizedRegister.status).toBe(403);
    const malformedRegister = await register.POST(
      new Request("https://memroos.test/api/a2a/agents/register", { method: "POST", body: "{" })
    );
    expect(malformedRegister.status).toBe(400);
    mocks.ingestA2aAgentCard.mockRejectedValueOnce(new Error("card fetch exploded"));
    const genericRegisterFailure = await register.POST(jsonRequest("https://memroos.test/api/a2a/agents/register", {
      cardUrl: "https://agent.test/card.json",
    }));
    expect(genericRegisterFailure.status).toBe(500);

    const checkpoints = await import("../agent-checkpoints/route");
    mocks.createAgentCheckpoint.mockImplementationOnce(() => {
      throw new Error("checkpoint invalid");
    });
    const checkpointPostError = await checkpoints.POST(jsonRequest("https://memroos.test/api/agent-checkpoints", {
      runId: "run-1",
    }));
    expect(checkpointPostError.status).toBe(400);
    mocks.resumeFromCheckpoint.mockImplementationOnce(() => {
      throw new Error("resume db offline");
    });
    const checkpointGetError = await checkpoints.GET(new Request("https://memroos.test/api/agent-checkpoints?runId=run-1") as never);
    expect(checkpointGetError.status).toBe(500);

    const traces = await import("../agent-memory/traces/route");
    mocks.recordMemoryTrace.mockImplementationOnce(() => {
      throw new Error("trace invalid");
    });
    const tracePostError = await traces.POST(jsonRequest("https://memroos.test/api/agent-memory/traces", {
      runId: "run-1",
    }));
    expect(tracePostError.status).toBe(400);
    mocks.getMemoryTrace.mockImplementationOnce(() => {
      throw new Error("trace db offline");
    });
    const traceGetError = await traces.GET(new Request("https://memroos.test/api/agent-memory/traces?runId=run-1") as never);
    expect(traceGetError.status).toBe(500);

    const versions = await import("../agents/versions/route");
    mocks.createAgentVersion.mockImplementationOnce(() => {
      throw new Error("version invalid");
    });
    const versionPostError = await versions.POST(jsonRequest("https://memroos.test/api/agents/versions", {
      agentId: "agent-1",
    }));
    expect(versionPostError.status).toBe(400);
    mocks.listAgentVersions.mockImplementationOnce(() => {
      throw new Error("versions offline");
    });
    const versionGetError = await versions.GET(new Request("https://memroos.test/api/agents/versions?agentId=agent-1") as never);
    expect(versionGetError.status).toBe(500);

    const recommendations = await import("../model-routing/recommendations/route");
    mocks.recommendModels.mockReturnValueOnce([{ model: "fallback" }]);
    const badRecommendations = await recommendations.POST(
      new Request("https://memroos.test/api/model-routing/recommendations", { method: "POST", body: "{" }) as never
    );
    expect(badRecommendations.status).toBe(200);
    await expect(badRecommendations.json()).resolves.toMatchObject({
      taskType: "engineering",
      strategy: "balanced",
      recommendations: [{ model: "fallback" }],
    });

    const expiry = await import("../memory-lifecycle/expiry/route");
    mocks.runRetentionExpiry.mockImplementationOnce(() => {
      throw new Error("expiry failed");
    });
    const expiryError = await expiry.POST(jsonRequest("https://memroos.test/api/memory-lifecycle/expiry", {
      runKey: "batch-m",
      scope: { tenantId: "tenant-1" },
    }));
    expect(expiryError.status).toBe(400);
    await expect(expiryError.json()).resolves.toMatchObject({ ok: false, error: "expiry failed" });
  });
});
