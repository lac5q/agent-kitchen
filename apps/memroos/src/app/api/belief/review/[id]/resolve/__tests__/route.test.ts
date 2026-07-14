import { afterEach, describe, expect, it, vi } from "vitest";

const resolveReview = vi.fn();

vi.mock("@/lib/auth/session", () => ({
  authenticateUser: async () => ({
    userId: "operator-1",
    role: "operator",
    tenantId: "default-tenant",
  }),
}));
vi.mock("@/lib/db", () => ({ getDb: vi.fn(() => ({})) }));
vi.mock("@/lib/belief/promotion", () => ({ resolveReview }));

describe("POST /api/belief/review/[id]/resolve", () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns a governed denial and no promotion receipt when queued ontology context is revoked", async () => {
    resolveReview.mockImplementation(() => {
      throw new Error("reviewedQueueId ontology context is unavailable");
    });
    const { POST } = await import("../route");
    const response = await POST(
      new Request("http://localhost/api/belief/review/review-1/resolve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ resolution: "approved", category: "pricing" }),
      }) as never,
      { params: Promise.resolve({ id: "review-1" }) },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "reviewedQueueId ontology context is unavailable",
    });
    expect(resolveReview).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        queueId: "review-1",
        tenantId: "default-tenant",
        resolution: "approved",
      }),
    );
  });
});
