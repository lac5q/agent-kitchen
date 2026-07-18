// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticateUser: vi.fn(),
  evaluateContextSources: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  authenticateUser: mocks.authenticateUser,
}));

vi.mock("@/lib/context-sources", () => ({
  loadContextSourceContracts: () => ({
    sources: [{
      id: "spark",
      type: "spark",
      enabled: true,
      requiredTools: [],
      envVars: [],
      sourcePath: "./spark",
      ingestCommand: "spark ingest",
      indexCommand: null,
      freshnessThresholdMinutes: 60,
      qmdCollection: "spark",
      safeAnswerPolicy: "source_required",
    }],
  }),
  evaluateContextSources: mocks.evaluateContextSources,
}));

describe("GET /api/context/health", () => {
  it("returns context source health", async () => {
    mocks.authenticateUser.mockResolvedValue({ userId: 'test-user', role: 'admin', email: 'admin@example.com', displayName: 'Admin', tenantId: 'default-tenant' });
    mocks.evaluateContextSources.mockReturnValue({
      sources: [{ id: "spark", type: "spark", status: "ok", enabled: true }],
      timestamp: "2026-05-17T12:00:00.000Z",
    });
    const { GET } = await import("../health/route");
    const res = await GET(new Request("http://localhost/api/context/health") as any);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.sources).toEqual([expect.objectContaining({ id: "spark", status: "ok" })]);
  });

  it("returns 401 when no user session is present", async () => {
    vi.resetModules();
    mocks.authenticateUser.mockResolvedValue(null);
    const { GET } = await import("../health/route");

    const res = await GET(new Request("http://localhost/api/context/health") as any);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toMatchObject({ ok: false, error: "Unauthorized" });
  });

  it("returns 500 when context source evaluation fails", async () => {
    vi.resetModules();
    mocks.authenticateUser.mockResolvedValue({ userId: 'test-user', role: 'admin', email: 'admin@example.com', displayName: 'Admin', tenantId: 'default-tenant' });
    mocks.evaluateContextSources.mockImplementation(() => {
      throw new Error("source config failed");
    });
    const { GET } = await import("../health/route");

    const res = await GET(new Request("http://localhost/api/context/health") as any);
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe("source config failed");
  });
});
