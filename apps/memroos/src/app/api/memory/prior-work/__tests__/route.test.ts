// @vitest-environment node
import Database from "better-sqlite3";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  agent: null as { id: string } | null,
  session: null as { userId: string; role: "admin" | "operator" | "reviewer"; tenantId: string } | null,
  operatorAuthorized: false,
  vector: vi.fn(),
  graph: vi.fn(),
  episodic: vi.fn(),
  recordTrace: vi.fn(),
}));

vi.mock("@/lib/agent/registry", () => ({
  authenticateAgentHeaders: vi.fn(() => mocks.agent),
}));
vi.mock("@/lib/auth/session", () => ({
  authenticateUser: vi.fn(async () => mocks.session),
}));
vi.mock("@/lib/operator-auth", () => ({
  authorizeRegistryWriteStrict: vi.fn(() => mocks.operatorAuthorized),
}));

const testDb = new Database(":memory:");
vi.mock("@/lib/db", () => ({ getDb: () => testDb }));
vi.mock("@/lib/db-ingest", () => ({ recallByKeyword: mocks.episodic }));
vi.mock("@/lib/memory/backends", () => ({
  searchVectorMemory: mocks.vector,
  queryGraphMemory: mocks.graph,
}));
vi.mock("@/lib/memory/policy-gate", () => ({
  extractMemoryLabelSnapshot: vi.fn(() => ({ visibility: "internal", policy: "indexable" })),
  filterAuthorizedMemoryItems: vi.fn((_db, items) => items),
  filterAuthorizedMessageRows: vi.fn((_db, rows) => rows),
}));
vi.mock("@/lib/memory/trace-observability", () => ({
  recordMemoryTrace: mocks.recordTrace,
}));

import { POST } from "../route";

function request(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("https://memroos.test/api/memory/prior-work", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("POST /api/memory/prior-work", () => {
  beforeEach(() => {
    mocks.agent = { id: "agent-prior-work" };
    mocks.session = null;
    mocks.operatorAuthorized = false;
    mocks.vector.mockReset().mockResolvedValue([]);
    mocks.graph.mockReset().mockResolvedValue([]);
    mocks.episodic.mockReset().mockReturnValue([]);
    mocks.recordTrace.mockReset();
  });

  it("accepts an agent key and returns a pointer-only digest pack", async () => {
    mocks.vector.mockResolvedValue([
      {
        id: "memory-001",
        content: "SECRET RAW PAYLOAD: use the old onboarding limiter implementation.",
        score: 1,
        metadata: {
          title: "Onboarding limiter decision",
          beliefStage: "gold_operational_truth",
          importance: 1,
          project: "memroos",
        },
      },
    ]);

    const response = await POST(request({
      task: "Have we done this before? Add rate limiting to the onboarding route.",
      project: "memroos",
      timing: "before_plan",
    }, { authorization: "Bearer agent-key" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.decision).toBe("search_required");
    expect(body.headline).toBe("Related prior work exists: 1 items");
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toEqual(expect.objectContaining({
      title: "Onboarding limiter decision",
      belief_stage: "gold_operational_truth",
      fetch_ref: "memory://prior-work/vector%3Amemory-001",
    }));
    expect(Object.keys(body.items[0]).sort()).toEqual(["age", "belief_stage", "fetch_ref", "one_liner", "salience", "title"]);
    expect(JSON.stringify(body)).not.toContain("SECRET RAW PAYLOAD");
    expect(mocks.recordTrace).toHaveBeenCalledOnce();
    expect(mocks.recordTrace.mock.calls[0][1].causalPath.retrievedCandidates[0].content).toBe("");
    expect(mocks.recordTrace.mock.calls[0][1].causalPath.recollection.tiersSearched).toEqual(["episodic", "vector", "graph"]);
  });

  it("rejects unauthenticated callers", async () => {
    mocks.agent = null;
    const response = await POST(request({ task: "Find prior onboarding work" }));
    expect(response.status).toBe(401);
    expect(mocks.recordTrace).not.toHaveBeenCalled();
  });

  it("returns a typed skip reason and emits one receipt for a skipped probe", async () => {
    const response = await POST(request({ task: "Format this JSON alphabetically." }, { authorization: "Bearer agent-key" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.decision).toBe("search_skipped");
    expect(body.skip_reason_code).toBe("low_signal");
    expect(body.items).toEqual([]);
    expect(mocks.recordTrace).toHaveBeenCalledOnce();
    expect(mocks.recordTrace.mock.calls[0][1].causalPath.recollection.decision).toBe("search_skipped");
    expect(mocks.recordTrace.mock.calls[0][1].causalPath.recollection.reasonCode).toBe("low_signal");
  });

  it("fails open when one tier is dead and records degradation instead of returning 500", async () => {
    mocks.vector.mockRejectedValue(new Error("vector backend unavailable"));
    const response = await POST(request({ task: "Find prior onboarding decisions" }, { authorization: "Bearer agent-key" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.receipt.degraded).toBe(true);
    expect(body.receipt.tier_statuses.vector.status).toBe("unavailable");
    expect(body.receipt.tier_statuses.episodic.status).toBe("empty");
    expect(mocks.recordTrace).toHaveBeenCalledOnce();
    expect(mocks.recordTrace.mock.calls[0][1].causalPath.recollection.reasonCode).toBe("tier_degraded");
  });
});
