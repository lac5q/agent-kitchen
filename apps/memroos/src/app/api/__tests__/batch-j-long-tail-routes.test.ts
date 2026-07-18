// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { A2aError } from "@/lib/a2a/errors";

const mocks = vi.hoisted(() => {
  class MockSkillSyncError extends Error {}
  class MockSyncGovernanceError extends Error {}
  class MockQuarantineTransitionError extends Error {}

  return {
    db: { prepare: vi.fn() },
    authorizeRegistryWrite: vi.fn(() => true),
    authorizeSyncWrite: vi.fn(() => ({ ok: true })),
    authorizeQuarantineWrite: vi.fn(() => ({ ok: true })),
    authenticateUser: vi.fn(),
    requireRole: vi.fn(),
    listEvalRuns: vi.fn(),
    verifyMemoryAuditChain: vi.fn(),
    rollbackAgentVersion: vi.fn(),
    listSyncObservability: vi.fn(),
    approveSyncProposalById: vi.fn(),
    approveImportProposal: vi.fn(),
    rejectImportProposal: vi.fn(),
    getQuarantineRecord: vi.fn(),
    approveQuarantine: vi.fn(),
    rejectQuarantine: vi.fn(),
    ingestA2aAgentCard: vi.fn(),
    sealListProposals: vi.fn(),
    sealReflectOnTrace: vi.fn(),
    slackManifest: vi.fn(),
    loadSlackMessageMemoryConfig: vi.fn(),
    verifySlackRequest: vi.fn(),
    normalizeSlackEvent: vi.fn(),
    ingestPlatformMessageMemory: vi.fn(),
    searchVectorMemory: vi.fn(),
    filterAuthorizedMemoryItems: vi.fn(),
    extractMemoryLabelSnapshot: vi.fn(),
    streamAuditEntries: vi.fn(),
    persistFederationActionArtifact: vi.fn(),
    resolveFederationActionProof: vi.fn(),
    executeOrchestrationPlan: vi.fn(),
    SkillSyncError: MockSkillSyncError,
    SyncGovernanceError: MockSyncGovernanceError,
    QuarantineTransitionError: MockQuarantineTransitionError,
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

vi.mock("@/lib/auth/session", () => ({
  authenticateUser: mocks.authenticateUser,
}));

vi.mock("@/lib/auth/middleware-roles", () => ({
  requireRole: mocks.requireRole,
}));

vi.mock("@/lib/evals/persistence", () => ({
  listEvalRuns: mocks.listEvalRuns,
}));

vi.mock("@/lib/audit/memory-chain", () => ({
  verifyMemoryAuditChain: mocks.verifyMemoryAuditChain,
}));

vi.mock("@/lib/agent-cicd-gates", () => ({
  rollbackAgentVersion: mocks.rollbackAgentVersion,
}));

vi.mock("@/lib/skills/skill-sync", () => ({
  SkillSyncError: mocks.SkillSyncError,
  listSyncObservability: mocks.listSyncObservability,
  approveSyncProposalById: mocks.approveSyncProposalById,
}));

vi.mock("@/lib/skills/skill-sync-governance", () => ({
  SyncGovernanceError: mocks.SyncGovernanceError,
  approveImportProposal: mocks.approveImportProposal,
  rejectImportProposal: mocks.rejectImportProposal,
}));

vi.mock("@/lib/skills/skill-quarantine", () => ({
  QuarantineTransitionError: mocks.QuarantineTransitionError,
  getQuarantineRecord: mocks.getQuarantineRecord,
  approveQuarantine: mocks.approveQuarantine,
  rejectQuarantine: mocks.rejectQuarantine,
}));

vi.mock("@/lib/a2a/card-ingestion", () => ({
  ingestA2aAgentCard: mocks.ingestA2aAgentCard,
}));

vi.mock("@/lib/seal/service", () => ({
  SealService: class {
    listProposals = mocks.sealListProposals;
    reflectOnTrace = mocks.sealReflectOnTrace;
  },
}));

vi.mock("@/lib/message-memory/slack", () => ({
  slackManifest: mocks.slackManifest,
  loadSlackMessageMemoryConfig: mocks.loadSlackMessageMemoryConfig,
  verifySlackRequest: mocks.verifySlackRequest,
}));

vi.mock("@/lib/message-memory", () => ({
  normalizeSlackEvent: mocks.normalizeSlackEvent,
  ingestPlatformMessageMemory: mocks.ingestPlatformMessageMemory,
}));

vi.mock("@/lib/memory/backends", () => ({
  searchVectorMemory: mocks.searchVectorMemory,
}));

vi.mock("@/lib/memory/policy-gate", () => ({
  extractMemoryLabelSnapshot: mocks.extractMemoryLabelSnapshot,
  filterAuthorizedMemoryItems: mocks.filterAuthorizedMemoryItems,
}));

vi.mock("@/lib/audit/query", () => ({
  streamAuditEntries: mocks.streamAuditEntries,
}));

vi.mock("@/lib/federation/action-bridge", () => ({
  persistFederationActionArtifact: mocks.persistFederationActionArtifact,
  resolveFederationActionProof: mocks.resolveFederationActionProof,
}));

vi.mock("@/lib/orchestration/client", () => ({
  executeOrchestrationPlan: mocks.executeOrchestrationPlan,
}));

function jsonRequest(url: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer operator-secret", ...headers },
    body: JSON.stringify(body),
  });
}

function auditEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: "audit-1",
    tenant_id: "tenant-1",
    actor_id: "op,one",
    actor_role: "operator",
    event_type: "skill.updated",
    entity_type: "skill",
    entity_id: "skill-1",
    reason: 'quoted "reason"\nnext',
    metadata_json: "{\"ok\":true}",
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("Batch J long-tail API route branches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("MEMROOS_OPERATOR_API_KEY", "operator-secret");
    vi.stubEnv("ORCHESTRATION_FEDERATION_PROOF_SECRET", "");
    mocks.authorizeRegistryWrite.mockReturnValue(true);
    mocks.authorizeSyncWrite.mockReturnValue({ ok: true });
    mocks.authorizeQuarantineWrite.mockReturnValue({ ok: true });
    mocks.authenticateUser.mockResolvedValue({ id: "user-1", role: "operator", tenantId: "tenant-1" });
    mocks.requireRole.mockImplementation((role: string | undefined) =>
      role === "operator" || role === "admin" ? null : Response.json({ error: "forbidden" }, { status: 403 })
    );
    mocks.db.prepare.mockReturnValue({ get: vi.fn(() => ({ dispatch_status: "enabled" })) });
    mocks.filterAuthorizedMemoryItems.mockImplementation((_db, items) => items);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("maps eval history, memory audit, and agent rollback errors", async () => {
    mocks.listEvalRuns.mockImplementationOnce(() => {
      throw new Error("history unavailable");
    });
    const evalHistory = await import("../evals/history/route");
    const evalResponse = evalHistory.GET(new Request("https://memroos.example/api/evals/history?limit=NaN") as never);
    expect(evalResponse.status).toBe(500);
    expect(await evalResponse.json()).toMatchObject({ error: "history unavailable" });

    mocks.verifyMemoryAuditChain.mockImplementationOnce(() => {
      throw new Error("audit chain broken");
    });
    const memoryAudit = await import("../memory-lifecycle/audit/route");
    const auditResponse = await memoryAudit.GET(new Request("https://memroos.example/api/memory-lifecycle/audit?tenantId=t"));
    expect(auditResponse.status).toBe(400);
    expect(await auditResponse.json()).toMatchObject({ ok: false, error: "audit chain broken" });

    const rollbackRoute = await import("../agents/versions/rollback/route");
    const missing = await rollbackRoute.POST(jsonRequest("https://memroos.example/api/agents/versions/rollback", { agentId: "a" }));
    expect(missing.status).toBe(400);
    mocks.rollbackAgentVersion.mockImplementationOnce(() => {
      throw new Error("no previous version");
    });
    const failed = await rollbackRoute.POST(
      jsonRequest("https://memroos.example/api/agents/versions/rollback", { agentId: "a", profile: "prod" })
    );
    expect(failed.status).toBe(400);
    expect(await failed.json()).toMatchObject({ message: "no previous version" });
  });

  it("parses skills sync filters and maps proposal governance errors", async () => {
    mocks.listSyncObservability.mockReturnValueOnce([{ skill_name: "demo" }]);
    const syncRoute = await import("../skills/sync/route");
    const syncResponse = await syncRoute.GET(
      new Request("https://memroos.example/api/skills/sync?pending_only=yes&pinned_only=on&limit=999&offset=-1")
    );
    expect(syncResponse.status).toBe(200);
    expect(mocks.listSyncObservability).toHaveBeenCalledWith(mocks.db, {
      pending_only: true,
      pinned_only: true,
      limit: 200,
      offset: 0,
    });

    const approveRoute = await import("../skills/proposals/[id]/approve/route");
    const rejectRoute = await import("../skills/proposals/[id]/reject/route");
    const invalidApproveBody = await approveRoute.POST(jsonRequest("https://memroos.example/api/skills/proposals/p1/approve", []), {
      params: Promise.resolve({ id: "p1" }),
    });
    expect(invalidApproveBody.status).toBe(400);
    mocks.approveImportProposal.mockImplementationOnce(() => {
      throw new mocks.SyncGovernanceError("proposal not found");
    });
    const missingApprove = await approveRoute.POST(
      jsonRequest("https://memroos.example/api/skills/proposals/p404/approve", { operator: "op" }),
      { params: Promise.resolve({ id: "p404" }) }
    );
    expect(missingApprove.status).toBe(404);

    const invalidReject = await rejectRoute.POST(
      jsonRequest("https://memroos.example/api/skills/proposals/p1/reject", { operator: "op" }),
      { params: Promise.resolve({ id: "p1" }) }
    );
    expect(invalidReject.status).toBe(400);
    mocks.rejectImportProposal.mockImplementationOnce(() => {
      throw new Error("write failed");
    });
    const failedReject = await rejectRoute.POST(
      jsonRequest("https://memroos.example/api/skills/proposals/p1/reject", { operator: "op", reason: "bad" }),
      { params: Promise.resolve({ id: "p1" }) }
    );
    expect(failedReject.status).toBe(500);
    expect(await failedReject.json()).toMatchObject({ error: "Rejection failed: write failed" });
  });

  it("maps sync proposal approval and quarantine transition failures", async () => {
    const syncApprove = await import("../skills/sync/proposals/[proposalId]/approve/route");
    const noOperator = await syncApprove.POST(
      jsonRequest("https://memroos.example/api/skills/sync/proposals/s1/approve", {}),
      { params: Promise.resolve({ proposalId: "s1" }) }
    );
    expect(noOperator.status).toBe(400);

    mocks.approveSyncProposalById.mockImplementationOnce(() => {
      throw new mocks.SkillSyncError("Stale concurrent proposal update");
    });
    const stale = await syncApprove.POST(
      jsonRequest("https://memroos.example/api/skills/sync/proposals/s1/approve", { operator: "op", apply_to_registry: false }),
      { params: Promise.resolve({ proposalId: "s1" }) }
    );
    expect(stale.status).toBe(409);

    const quarantineApprove = await import("../skills/quarantine/approve/route");
    const quarantineReject = await import("../skills/quarantine/reject/route");
    const invalidSkillId = await quarantineApprove.POST(
      jsonRequest("https://memroos.example/api/skills/quarantine/approve", { skill_id: "nope", operator: "op" })
    );
    expect(invalidSkillId.status).toBe(400);

    mocks.getQuarantineRecord.mockReturnValueOnce({ stage: "pending_approval" });
    mocks.approveQuarantine.mockImplementationOnce(() => {
      throw new mocks.QuarantineTransitionError("stage changed");
    });
    const transition = await quarantineApprove.POST(
      jsonRequest("https://memroos.example/api/skills/quarantine/approve", { skill_id: 1, operator: "op" })
    );
    expect(transition.status).toBe(409);

    const noReason = await quarantineReject.POST(
      jsonRequest("https://memroos.example/api/skills/quarantine/reject", { skill_id: 1, operator: "op" })
    );
    expect(noReason.status).toBe(400);
    mocks.getQuarantineRecord.mockReturnValueOnce({ stage: "imported" });
    mocks.rejectQuarantine.mockImplementationOnce(() => ({
      approved_by: "op",
      approved_at: "now",
      rejection_reason: "unsafe",
      stage: "rejected",
      approval_status: "rejected",
    }));
    mocks.db.prepare.mockReturnValueOnce({ get: vi.fn(() => undefined) });
    const rejected = await quarantineReject.POST(
      jsonRequest("https://memroos.example/api/skills/quarantine/reject", { skill_id: 1, operator: "op", reason: "unsafe" })
    );
    expect(rejected.status).toBe(200);
    expect(await rejected.json()).toMatchObject({ dispatch_status: null, stage: "rejected" });
  });

  it("covers A2A registration, SEAL proposals, and memory search fallbacks", async () => {
    const a2aRegister = await import("../a2a/agents/register/route");
    const invalidCard = await a2aRegister.POST(jsonRequest("https://memroos.example/api/a2a/agents/register", { cardUrl: "" }));
    expect(invalidCard.status).toBe(400);
    mocks.ingestA2aAgentCard.mockRejectedValueOnce(new A2aError("INVALID_REQUEST", "bad card"));
    const typedCardError = await a2aRegister.POST(
      jsonRequest("https://memroos.example/api/a2a/agents/register", { cardUrl: "https://agent.example/card.json" })
    );
    expect(typedCardError.status).toBe(400);

    const sealRoute = await import("../seal/proposals/route");
    mocks.authenticateUser.mockResolvedValueOnce(null);
    const unauthorizedSeal = await sealRoute.GET(new Request("https://memroos.example/api/seal/proposals?status=bogus") as never);
    expect(unauthorizedSeal.status).toBe(401);
    mocks.sealReflectOnTrace.mockRejectedValueOnce(new Error("reflection failed"));
    const sealFailure = await sealRoute.POST(
      jsonRequest("https://memroos.example/api/seal/proposals", { traceId: "trace-1", runId: "run-1" }) as never
    );
    expect(sealFailure.status).toBe(400);
    expect(await sealFailure.json()).toMatchObject({ error: "reflection failed" });

    const memorySearch = await import("../memory/search/route");
    mocks.searchVectorMemory.mockResolvedValueOnce({ data: [{ id: "mem-1", text: "hello" }] });
    const okSearch = await memorySearch.GET(new Request("https://memroos.example/api/memory/search?q=test&limit=500"));
    expect(okSearch.status).toBe(200);
    expect(mocks.searchVectorMemory).toHaveBeenCalledWith("test", 100);
    mocks.searchVectorMemory.mockRejectedValueOnce(new Error("vector down"));
    const failedSearch = await memorySearch.GET(new Request("https://memroos.example/api/memory/search?limit=NaN"));
    expect(failedSearch.status).toBe(502);
    expect(await failedSearch.json()).toMatchObject({ error: "vector down" });
  });

  it("covers Slack event manifest, validation, filtering, and ingestion branches", async () => {
    const slackRoute = await import("../integrations/slack/events/route");
    mocks.slackManifest.mockReturnValueOnce({ display_information: { name: "MemRoOS" } });
    expect(await (await slackRoute.GET(new Request("https://fallback.example/api/integrations/slack/events"))).json()).toMatchObject({
      display_information: { name: "MemRoOS" },
    });

    mocks.loadSlackMessageMemoryConfig.mockReturnValueOnce({ signingSecret: "", maxSkewSeconds: 300, allowTeamIds: new Set(), includeBotMessages: false });
    const noSecret = await slackRoute.POST(new Request("https://fallback.example/api/integrations/slack/events", { method: "POST", body: "{}" }));
    expect(noSecret.status).toBe(503);

    mocks.loadSlackMessageMemoryConfig.mockReturnValue({
      signingSecret: "secret",
      maxSkewSeconds: 300,
      allowTeamIds: new Set(["T-ok"]),
      includeBotMessages: false,
    });
    mocks.verifySlackRequest.mockReturnValue({ ok: true });
    const invalidJson = await slackRoute.POST(new Request("https://fallback.example/api/integrations/slack/events", { method: "POST", body: "{" }));
    expect(invalidJson.status).toBe(400);

    const missingChallenge = await slackRoute.POST(
      new Request("https://fallback.example/api/integrations/slack/events", { method: "POST", body: JSON.stringify({ type: "url_verification" }) })
    );
    expect(missingChallenge.status).toBe(400);

    const unsupportedEnvelope = await slackRoute.POST(
      new Request("https://fallback.example/api/integrations/slack/events", { method: "POST", body: JSON.stringify({ type: "app_rate_limited" }) })
    );
    expect(await unsupportedEnvelope.json()).toMatchObject({ ignored: true, reason: "unsupported_envelope_type" });

    mocks.normalizeSlackEvent.mockReturnValueOnce(null);
    const unsupportedEvent = await slackRoute.POST(
      new Request("https://fallback.example/api/integrations/slack/events", { method: "POST", body: JSON.stringify({ type: "event_callback" }) })
    );
    expect(await unsupportedEvent.json()).toMatchObject({ ignored: true, reason: "unsupported_event" });

    mocks.normalizeSlackEvent
      .mockReturnValueOnce({ workspaceId: "T-denied", author: { isBot: false } })
      .mockReturnValueOnce({ workspaceId: "T-ok", author: { isBot: true } })
      .mockReturnValueOnce({ workspaceId: "T-ok", author: { isBot: false }, text: "hello" });
    const deniedTeam = await slackRoute.POST(
      new Request("https://fallback.example/api/integrations/slack/events", { method: "POST", body: JSON.stringify({ type: "event_callback" }) })
    );
    expect(deniedTeam.status).toBe(403);
    const bot = await slackRoute.POST(
      new Request("https://fallback.example/api/integrations/slack/events", { method: "POST", body: JSON.stringify({ type: "event_callback" }) })
    );
    expect(await bot.json()).toMatchObject({ ignored: true, reason: "bot_message" });

    mocks.ingestPlatformMessageMemory.mockReturnValueOnce({ created: true, duplicate: false, dedupeKey: "d1", messageRowId: 12 });
    const created = await slackRoute.POST(
      new Request("https://fallback.example/api/integrations/slack/events", {
        method: "POST",
        body: JSON.stringify({ type: "event_callback", event_id: "ev-1", event_time: 1 }),
      })
    );
    expect(created.status).toBe(201);
    expect(await created.json()).toMatchObject({ created: true, messageRowId: 12 });
  });

  it("exports audit streams and maps federated execute proof failures", async () => {
    const auditExport = await import("../audit/export/route");
    mocks.streamAuditEntries.mockReturnValueOnce([auditEntry()]);
    const csv = await auditExport.GET(
      new Request("https://memroos.example/api/audit/export?format=csv&eventType=skill.created,skill.updated") as never
    );
    expect(csv.headers.get("content-type")).toContain("text/csv");
    expect(await csv.text()).toContain('"quoted ""reason""\nnext"');
    expect(mocks.streamAuditEntries).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: ["skill.created", "skill.updated"] }),
      mocks.db
    );

    const federated = await import("../orchestration/federated/execute/route");
    const invalid = await federated.POST(jsonRequest("https://memroos.example/api/orchestration/federated/execute", { plan: {} }));
    expect(invalid.status).toBe(400);

    mocks.persistFederationActionArtifact.mockReturnValueOnce({ status: "persistence_failed", reason: "disk full" });
    const body = {
      federation: { tenantId: "t", spaceId: "s", federationRunId: "run", packHash: "pack", ontologyRecords: [{ recordType: "x", recordId: "y" }] },
      plan: { scope: { tenantId: "t", spaceId: "s" } },
    };
    const persistFailed = await federated.POST(jsonRequest("https://memroos.example/api/orchestration/federated/execute", body));
    expect(persistFailed.status).toBe(503);

    mocks.persistFederationActionArtifact.mockReturnValueOnce({ status: "ready", artifact: { id: "art-1" } });
    mocks.resolveFederationActionProof.mockReturnValueOnce({ status: "tampered", reason: "hash mismatch" });
    const proofFailed = await federated.POST(jsonRequest("https://memroos.example/api/orchestration/federated/execute", body));
    expect(proofFailed.status).toBe(409);

    mocks.persistFederationActionArtifact.mockReturnValueOnce({ status: "ready", artifact: { id: "art-1" } });
    mocks.resolveFederationActionProof.mockReturnValueOnce({
      status: "ready",
      artifact: { id: "art-1", artifactHash: "ah", federationRunId: "run", packHash: "pack", policyHash: "ph", ontologyHash: "oh" },
    });
    const noSecret = await federated.POST(jsonRequest("https://memroos.example/api/orchestration/federated/execute", body));
    expect(noSecret.status).toBe(503);

    vi.stubEnv("ORCHESTRATION_FEDERATION_PROOF_SECRET", "signing-secret");
    mocks.persistFederationActionArtifact.mockReturnValueOnce({ status: "ready", artifact: { id: "art-1" } });
    mocks.resolveFederationActionProof.mockReturnValueOnce({
      status: "ready",
      artifact: { id: "art-1", artifactHash: "ah", federationRunId: "run", packHash: "pack", policyHash: "ph", ontologyHash: "oh" },
    });
    mocks.executeOrchestrationPlan.mockRejectedValueOnce(new Error("orchestration down"));
    const executeFailed = await federated.POST(jsonRequest("https://memroos.example/api/orchestration/federated/execute", body));
    expect(executeFailed.status).toBe(502);
  });
});
