// @vitest-environment node
/**
 * Rate limiting and zod validation tests for /api/dispatch and /api/memory/add.
 * These tests focus on early-return paths that do not require DB/adapter mocks.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { clearAuthRateLimit } from "@/lib/auth/rate-limit";

vi.mock("@/lib/db", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/agent-registry", () => ({
  authenticateAgentHeaders: vi.fn(() => null),
  getRemoteAgents: vi.fn(() => []),
  listAllAgentsUnscoped: vi.fn(() => []),
  authenticateUser: vi.fn(() => null),
}));
vi.mock("@/lib/audit", () => ({ writeAuditLog: vi.fn() }));
vi.mock("@/lib/content-scanner", () => ({ scanContent: vi.fn() }));
vi.mock("@/lib/iris-scanner", () => ({ scanIrisPreflight: vi.fn() }));
vi.mock("@/lib/security-policy", () => ({
  checkDispatchPolicy: vi.fn(() => ({ allowed: true })),
  checkMemoryWritePolicy: vi.fn(() => ({ allowed: true })),
}));
vi.mock("@/lib/dispatch/adapter-factory", () => ({ selectAdapter: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ authenticateUser: vi.fn(() => Promise.resolve(null)) }));
vi.mock("@/lib/operator-auth", () => ({ authorizeRegistryWrite: vi.fn(() => false) }));
vi.mock("@/lib/memory/tiers", () => ({
  buildTieredMemoryPayload: vi.fn((b) => b),
  resolveMemoryTier: vi.fn(() => "episodic"),
}));
vi.mock("@/lib/response-cache", () => ({ responseCache: { invalidateTag: vi.fn() } }));

const { POST: dispatchPost } = await import("../route");
const { POST: memoryPost } = await import("@/app/api/memory/add/route");

function makeDispatchRequest(body: object) {
  return new Request("http://localhost/api/dispatch", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.1" },
    body: JSON.stringify(body),
  });
}

function makeMemoryRequest(body: object) {
  return new Request("http://localhost/api/memory/add", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.2" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  clearAuthRateLimit();
});

describe("POST /api/dispatch — zod validation", () => {
  it("returns 400 when task_summary is missing", async () => {
    const res = await dispatchPost(makeDispatchRequest({ to_agent: "sophia" }) as any);
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(typeof body.error).toBe("string");
  });

  it("returns 400 when task_summary is empty string", async () => {
    const res = await dispatchPost(makeDispatchRequest({ to_agent: "sophia", task_summary: "" }) as any);
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(typeof body.error).toBe("string");
  });

  it("returns 400 when to_agent is missing", async () => {
    const res = await dispatchPost(makeDispatchRequest({ task_summary: "do something" }) as any);
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(typeof body.error).toBe("string");
  });
});

describe("POST /api/dispatch — rate limiting", () => {
  it("returns 429 with Retry-After header after exceeding 20 requests", async () => {
    // Make 21 requests — the 21st should be rate limited
    let lastRes: Response | null = null;
    for (let i = 0; i < 21; i++) {
      lastRes = await dispatchPost(makeDispatchRequest({ to_agent: "sophia", task_summary: "ping" }) as any);
    }
    expect(lastRes!.status).toBe(429);
    expect(lastRes!.headers.get("Retry-After")).not.toBeNull();
  });
});

describe("POST /api/memory/add — rate limiting", () => {
  it("returns 429 with Retry-After header after exceeding 30 requests", async () => {
    let lastRes: Response | null = null;
    for (let i = 0; i < 31; i++) {
      lastRes = await memoryPost(makeMemoryRequest({ content: "test memory", agentId: "agent-1" }) as any);
    }
    expect(lastRes!.status).toBe(429);
    expect(lastRes!.headers.get("Retry-After")).not.toBeNull();
  });
});
