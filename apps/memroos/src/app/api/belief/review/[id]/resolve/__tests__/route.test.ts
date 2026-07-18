import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveReview: vi.fn(),
  authenticateUser: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  authenticateUser: mocks.authenticateUser,
}));
vi.mock("@/lib/db", () => ({ getDb: vi.fn(() => ({})) }));
vi.mock("@/lib/belief/promotion", () => ({ resolveReview: mocks.resolveReview }));

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/belief/review/review-1/resolve", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as never;
}

describe("POST /api/belief/review/[id]/resolve", () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("requires an authenticated operator session", async () => {
    mocks.authenticateUser.mockResolvedValue(null);
    const { POST } = await import("../route");

    const response = await POST(
      jsonRequest({ resolution: "approved" }),
      { params: Promise.resolve({ id: "review-1" }) },
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "authentication required" });
  });

  it("validates queue id, JSON body, and resolution", async () => {
    mocks.authenticateUser.mockResolvedValue({
      userId: "operator-1",
      role: "operator",
      tenantId: "default-tenant",
    });
    const { POST } = await import("../route");

    const missingId = await POST(
      jsonRequest({ resolution: "approved" }),
      { params: Promise.resolve({ id: "" }) },
    );
    expect(missingId.status).toBe(400);
    expect((await missingId.json()).error).toBe("queue id is required");

    const invalidJson = await POST(
      new Request("http://localhost/api/belief/review/review-1/resolve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{not-json",
      }) as never,
      { params: Promise.resolve({ id: "review-1" }) },
    );
    expect(invalidJson.status).toBe(400);
    expect((await invalidJson.json()).error).toBe("invalid json body");

    const invalidResolution = await POST(
      jsonRequest({ resolution: "maybe" }),
      { params: Promise.resolve({ id: "review-1" }) },
    );
    expect(invalidResolution.status).toBe(400);
    expect((await invalidResolution.json()).error).toMatch(/resolution must/i);
  });

  it("returns a resolved review with admission receipt details", async () => {
    mocks.authenticateUser.mockResolvedValue({
      userId: "operator-1",
      role: "operator",
      tenantId: "",
    });
    mocks.resolveReview.mockReturnValue({
      resolution: "approved",
      decisionId: "decision-1",
      admission: {
        kind: "queued_for_review",
        decisionId: "admission-decision",
        queueId: "queue-next",
        receipt: { id: "receipt-1" },
      },
      receipt: { id: "resolve-receipt" },
    });
    const { POST } = await import("../route");

    const response = await POST(
      jsonRequest({ resolution: "approved", note: "ship it", category: "pricing" }),
      { params: Promise.resolve({ id: "review-1" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      resolution: "approved",
      decisionId: "decision-1",
      admission: { kind: "queued_for_review", queueId: "queue-next" },
      receipt: { id: "resolve-receipt" },
    });
    expect(mocks.resolveReview).toHaveBeenCalledWith({}, expect.objectContaining({
      queueId: "review-1",
      tenantId: "default-tenant",
      operatorId: "operator-1",
      note: "ship it",
      category: "pricing",
    }));
  });

  it("returns a governed denial and no promotion receipt when queued ontology context is revoked", async () => {
    mocks.authenticateUser.mockResolvedValue({
      userId: "operator-1",
      role: "operator",
      tenantId: "default-tenant",
    });
    mocks.resolveReview.mockImplementation(() => {
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
    expect(mocks.resolveReview).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        queueId: "review-1",
        tenantId: "default-tenant",
        resolution: "approved",
      }),
    );
  });

  it("maps missing and already-resolved reviews to precise statuses", async () => {
    mocks.authenticateUser.mockResolvedValue({
      userId: "operator-1",
      role: "operator",
      tenantId: "default-tenant",
    });
    const { POST } = await import("../route");

    mocks.resolveReview.mockImplementationOnce(() => {
      throw new Error("review not found");
    });
    const missing = await POST(
      jsonRequest({ resolution: "rejected" }),
      { params: Promise.resolve({ id: "missing-review" }) },
    );
    expect(missing.status).toBe(404);

    mocks.resolveReview.mockImplementationOnce(() => {
      throw new Error("review already resolved");
    });
    const already = await POST(
      jsonRequest({ resolution: "rejected" }),
      { params: Promise.resolve({ id: "review-1" }) },
    );
    expect(already.status).toBe(409);
  });
});
