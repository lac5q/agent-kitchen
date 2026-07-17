// @vitest-environment node
import Database from "better-sqlite3";
import { describe, expect, it, vi } from "vitest";

const testDb = new Database(":memory:");
const { initSchema } = await import("@/lib/db-schema");
const { persistEvalRun } = await import("@/lib/evals/persistence");
initSchema(testDb);

vi.mock("@/lib/db", () => ({
  getDb: () => testDb,
  closeDb: () => {},
}));

vi.mock("@/lib/auth/session", () => ({
  authenticateUser: vi.fn(async () => ({
    userId: "test-user",
    role: "admin",
    email: "admin@example.com",
    displayName: "Admin",
    tenantId: "default-tenant",
  })),
}));

const { authenticateUser } = await import("@/lib/auth/session");

const proposalsRoute = await import("../proposals/route");
const proposalRoute = await import("../proposals/[id]/route");
const auditRoute = await import("../audit/route");

function jsonRequest(url: string, body: Record<string, unknown>): Request {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function seedRun(id: string, traceId: string, compositeW: number) {
  persistEvalRun(testDb, {
    id,
    traceId,
    agentId: "agent-api",
    role: "ops",
    compositeW,
    trusted: true,
    layers: {
      l1: { score: compositeW, weight: 0.2, scorers: [] },
      l2: { score: compositeW, weight: 0.5, scorers: [] },
      l3: { score: compositeW, weight: 0.3, scorers: [] },
    },
    scorerResults: [],
    judge: {
      score: compositeW,
      rubricScores: { faithful: compositeW, useful: compositeW, policy: compositeW },
      model: "judge",
      provider: "local",
      modelFamily: "local",
      promptTemplateVersion: "v1",
      promptHash: "hash",
      positionBiasMitigation: { swapAugmentation: true, orderAgreement: true },
    },
    driftGuard: {
      status: "passed",
      agreement: 1,
      floor: 0.85,
      goldenSetVersion: "golden",
      examples: [],
    },
    configHash: "config",
    goldenSetPath: "./golden.jsonl",
    startedAt: "2026-05-15T00:00:00.000Z",
    completedAt: "2026-05-15T00:00:01.000Z",
  });
}

describe("SEAL API routes", () => {
  it("lists proposals, records approval decisions, and exposes read-only audit", async () => {
    seedRun("api-run-low", "api-trace-low", 0.41);

    const reflectResponse = await proposalsRoute.POST(
      jsonRequest("http://localhost/api/seal/proposals", {
        traceId: "api-trace-low",
        runId: "api-run-low",
      }) as any
    );
    const reflected = await reflectResponse.json();
    expect(reflectResponse.status).toBe(200);
    expect(reflected.proposals).toHaveLength(1);

    const listResponse = await proposalsRoute.GET(
      new Request("http://localhost/api/seal/proposals?status=pending") as any
    );
    const list = await listResponse.json();
    expect(list.proposals.some((proposal: { id: string }) => proposal.id === reflected.proposals[0].id)).toBe(true);

    const approveResponse = await proposalRoute.POST(
      jsonRequest(`http://localhost/api/seal/proposals/${reflected.proposals[0].id}`, {
        action: "approve",
        reasoning: "ready",
        operator: "test-user-id",
      }) as any,
      { params: Promise.resolve({ id: reflected.proposals[0].id }) } as any
    );
    const approved = await approveResponse.json();
    expect(approved.proposal.status).toBe("approved");

    const auditResponse = await auditRoute.GET(new Request("http://localhost/api/seal/audit") as any);
    const audit = await auditResponse.json();
    expect(audit.entries.some((entry: { event: string }) => entry.event === "approved")).toBe(true);
    expect("POST" in auditRoute).toBe(false);
    expect("PATCH" in auditRoute).toBe(false);
    expect("DELETE" in auditRoute).toBe(false);
  });

  it("proposal detail GET returns 404 for unknown ids and 401 when unauthenticated", async () => {
    vi.mocked(authenticateUser).mockResolvedValueOnce(null);
    const unauthorized = await proposalRoute.GET(
      new Request("http://localhost/api/seal/proposals/missing") as any
    );
    expect(unauthorized.status).toBe(401);

    vi.mocked(authenticateUser).mockResolvedValueOnce({
      userId: "test-user",
      role: "admin",
      email: "admin@example.com",
      displayName: "Admin",
      tenantId: "default-tenant",
    });
    const missing = await proposalRoute.GET(
      new Request("http://localhost/api/seal/proposals/missing") as any,
      { params: Promise.resolve({ id: "missing" }) } as any
    );
    expect(missing.status).toBe(404);

    seedRun("api-run-get", "api-trace-get", 0.55);
    const reflectResponse = await proposalsRoute.POST(
      jsonRequest("http://localhost/api/seal/proposals", {
        traceId: "api-trace-get",
        runId: "api-run-get",
      }) as any
    );
    const reflected = await reflectResponse.json();
    const getResponse = await proposalRoute.GET(
      new Request(`http://localhost/api/seal/proposals/${reflected.proposals[0].id}`) as any,
      { params: Promise.resolve({ id: reflected.proposals[0].id }) } as any
    );
    expect(getResponse.status).toBe(200);
    const proposal = await getResponse.json();
    expect(proposal.proposal.id).toBe(reflected.proposals[0].id);
    expect(proposal.timestamp).toBeTruthy();
  });

  it("proposal detail POST validates action, auth, and service failures", async () => {
    seedRun("api-run-post", "api-trace-post", 0.42);
    const reflectResponse = await proposalsRoute.POST(
      jsonRequest("http://localhost/api/seal/proposals", {
        traceId: "api-trace-post",
        runId: "api-run-post",
      }) as any
    );
    const reflected = await reflectResponse.json();
    const proposalId = reflected.proposals[0].id;

    const invalidAction = await proposalRoute.POST(
      jsonRequest(`http://localhost/api/seal/proposals/${proposalId}`, {
        action: "archive",
        operator: "test-user",
      }) as any,
      { params: Promise.resolve({ id: proposalId }) } as any
    );
    expect(invalidAction.status).toBe(400);
    expect(await invalidAction.json()).toMatchObject({
      error: "action must be approve, reject, or apply",
    });

    const missingOperator = await proposalRoute.POST(
      jsonRequest(`http://localhost/api/seal/proposals/${proposalId}`, {
        action: "approve",
      }) as any,
      { params: Promise.resolve({ id: proposalId }) } as any
    );
    expect(missingOperator.status).toBe(401);

    const rejectResponse = await proposalRoute.POST(
      jsonRequest(`http://localhost/api/seal/proposals/${proposalId}`, {
        action: "reject",
        reasoning: "not ready",
        operator: "reviewer",
      }) as any,
      { params: Promise.resolve({ id: proposalId }) } as any
    );
    expect(rejectResponse.status).toBe(200);
    const rejected = await rejectResponse.json();
    expect(rejected.ok).toBe(true);
    expect(rejected.proposal.status).toBe("rejected");

    const applyAfterReject = await proposalRoute.POST(
      jsonRequest(`http://localhost/api/seal/proposals/${proposalId}`, {
        action: "apply",
        operator: "reviewer",
      }) as any,
      { params: Promise.resolve({ id: proposalId }) } as any
    );
    expect(applyAfterReject.status).toBe(400);
    expect((await applyAfterReject.json()).error).toBeTruthy();
  });

  it("proposal detail POST accepts x-user-id header without body operator", async () => {
    seedRun("api-run-header", "api-trace-header", 0.44);
    const reflectResponse = await proposalsRoute.POST(
      jsonRequest("http://localhost/api/seal/proposals", {
        traceId: "api-trace-header",
        runId: "api-run-header",
      }) as any
    );
    const reflected = await reflectResponse.json();
    const proposalId = reflected.proposals[0].id;

    const approveResponse = await proposalRoute.POST(
      new Request(`http://localhost/api/seal/proposals/${proposalId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": "header-operator",
        },
        body: JSON.stringify({ action: "approve", reasoning: "header auth" }),
      }) as any,
      { params: Promise.resolve({ id: proposalId }) } as any
    );
    expect(approveResponse.status).toBe(200);
    const approved = await approveResponse.json();
    expect(approved.proposal.status).toBe("approved");
  });
});
