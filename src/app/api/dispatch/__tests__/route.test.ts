// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/agent-registry", () => ({ getRemoteAgents: vi.fn() }));
vi.mock("@/lib/audit", () => ({ writeAuditLog: vi.fn() }));
vi.mock("@/lib/content-scanner", () => ({ scanContent: vi.fn() }));
vi.mock("@/lib/dispatch/adapter-factory", () => ({ selectAdapter: vi.fn() }));

const { POST } = await import("../route");
const { getDb } = await import("@/lib/db");
const { getRemoteAgents } = await import("@/lib/agent-registry");
const { scanContent } = await import("@/lib/content-scanner");
const { selectAdapter } = await import("@/lib/dispatch/adapter-factory");

const mockGetDb = vi.mocked(getDb);
const mockGetRemoteAgents = vi.mocked(getRemoteAgents);
const mockScanContent = vi.mocked(scanContent);
const mockSelectAdapter = vi.mocked(selectAdapter);

function makeDb() {
  const stmtMock = {
    run: vi.fn().mockReturnValue({ lastInsertRowid: 1 }),
    get: vi.fn().mockReturnValue(undefined),
    all: vi.fn().mockReturnValue([]),
  };
  return { prepare: vi.fn().mockReturnValue(stmtMock) };
}

const sophiaAgent = {
  id: "sophia",
  name: "Sophia",
  role: "Marketing",
  platform: "claude" as const,
  location: "tailscale" as const,
  host: "100.x.x.x",
  port: 18889,
  healthEndpoint: "/health",
};

const hivePollStub = {
  name: "hive-poll",
  platform: ["claude"] as const,
  dispatch: vi.fn().mockResolvedValue({ accepted: true, mode: "queued", detail: "ok" }),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetDb.mockReturnValue(makeDb() as any);
  mockGetRemoteAgents.mockReturnValue([sophiaAgent]);
  mockScanContent.mockReturnValue({ blocked: false, matches: [], cleanContent: "Draft blog post" });
  mockSelectAdapter.mockReturnValue(hivePollStub as any);
});

function makeRequest(body: object) {
  return { json: async () => body } as Request;
}

describe("POST /api/dispatch", () => {
  it("200 — dispatches to sophia via hive-poll", async () => {
    const res = await POST(makeRequest({ to_agent: "sophia", task_summary: "Draft blog post" }) as any);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.to_agent).toBe("sophia");
    expect(body.adapter).toBe("hive-poll");
    expect(body.mode).toBe("queued");
    expect(body.task_id).toBeTruthy();
    expect(body.context_id).toBeTruthy();
  });

  it("400 INVALID_BODY — missing task_summary", async () => {
    const res = await POST(makeRequest({ to_agent: "sophia" }) as any);
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.code).toBe("INVALID_BODY");
  });

  it("400 INVALID_BODY — missing to_agent", async () => {
    const res = await POST(makeRequest({ task_summary: "do something" }) as any);
    expect(res.status).toBe(400);
  });

  it("400 INVALID_BODY — priority out of range (0)", async () => {
    const res = await POST(makeRequest({ to_agent: "sophia", task_summary: "x", priority: 0 }) as any);
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.code).toBe("INVALID_BODY");
  });

  it("400 INVALID_BODY — priority out of range (10)", async () => {
    const res = await POST(makeRequest({ to_agent: "sophia", task_summary: "x", priority: 10 }) as any);
    expect(res.status).toBe(400);
  });

  it("404 UNKNOWN_AGENT — agent not in registry", async () => {
    const res = await POST(makeRequest({ to_agent: "ghost", task_summary: "do something" }) as any);
    const body = await res.json();
    expect(res.status).toBe(404);
    expect(body.code).toBe("UNKNOWN_AGENT");
  });

  it("403 CONTENT_BLOCKED — scanContent blocks", async () => {
    mockScanContent.mockReturnValue({ blocked: true, matches: [], cleanContent: "" });
    const res = await POST(makeRequest({ to_agent: "sophia", task_summary: "rm -rf /" }) as any);
    const body = await res.json();
    expect(res.status).toBe(403);
    expect(body.code).toBe("CONTENT_BLOCKED");
  });

  it("502 ADAPTER_REJECTED — adapter returns accepted:false", async () => {
    hivePollStub.dispatch.mockResolvedValueOnce({ accepted: false, mode: "rejected", detail: "refused" });
    const res = await POST(makeRequest({ to_agent: "sophia", task_summary: "ping" }) as any);
    const body = await res.json();
    expect(res.status).toBe(502);
    expect(body.code).toBe("ADAPTER_REJECTED");
  });

  it("preserves provided task_id and context_id", async () => {
    const res = await POST(makeRequest({
      to_agent: "sophia",
      task_summary: "chain task",
      task_id: "fixed-task-id",
      context_id: "fixed-ctx-id",
    }) as any);
    const body = await res.json();
    expect(body.task_id).toBe("fixed-task-id");
    expect(body.context_id).toBe("fixed-ctx-id");
  });
});
