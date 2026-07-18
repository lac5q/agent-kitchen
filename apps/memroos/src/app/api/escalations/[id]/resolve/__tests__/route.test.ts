// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticateUser: vi.fn(),
  db: { prepare: vi.fn() },
  resolveEscalation: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  authenticateUser: mocks.authenticateUser,
}));
vi.mock("@/lib/db", () => ({
  getDb: () => mocks.db,
}));
vi.mock("@/lib/audit/write", () => ({
  resolveEscalation: mocks.resolveEscalation,
}));

function request(body?: unknown) {
  return new Request("http://localhost/api/escalations/esc-1/resolve", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }) as never;
}

function setOperatorSession(role: "operator" | "reviewer" = "operator") {
  mocks.authenticateUser.mockResolvedValue({
    userId: "operator-1",
    role,
    tenantId: "default-tenant",
  });
}

describe("POST /api/escalations/[id]/resolve", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("rejects callers below operator role", async () => {
    setOperatorSession("reviewer");
    const { POST } = await import("../route");

    const response = await POST(request({ note: "done" }), { params: Promise.resolve({ id: "esc-1" }) });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "insufficient permissions" });
    expect(mocks.resolveEscalation).not.toHaveBeenCalled();
  });

  it("validates the escalation id before querying storage", async () => {
    setOperatorSession();
    const { POST } = await import("../route");

    const response = await POST(request({ note: "done" }), { params: Promise.resolve({ id: "" }) });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ ok: false, error: "escalation id is required" });
    expect(mocks.db.prepare).not.toHaveBeenCalled();
  });

  it("returns 404 when the escalation does not exist", async () => {
    setOperatorSession();
    mocks.db.prepare.mockReturnValue({ get: vi.fn(() => undefined) });
    const { POST } = await import("../route");

    const response = await POST(request({ note: "done" }), { params: Promise.resolve({ id: "esc-1" }) });

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ ok: false, error: "escalation not found" });
  });

  it("resolves an escalation even when the optional body is empty", async () => {
    setOperatorSession();
    const existing = { id: "esc-1", status: "open" };
    const updated = { id: "esc-1", status: "resolved", resolved_by: "operator-1" };
    const get = vi.fn()
      .mockReturnValueOnce(existing)
      .mockReturnValueOnce(updated);
    mocks.db.prepare.mockReturnValue({ get });
    const { POST } = await import("../route");

    const response = await POST(request(), { params: Promise.resolve({ id: "esc-1" }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.escalation).toEqual(updated);
    expect(mocks.resolveEscalation).toHaveBeenCalledWith(
      "esc-1",
      { actorId: "operator-1", actorRole: "operator", note: undefined },
      mocks.db,
    );
  });

  it("maps resolution conflicts to 409", async () => {
    setOperatorSession();
    mocks.db.prepare.mockReturnValue({ get: vi.fn(() => ({ id: "esc-1", status: "open" })) });
    mocks.resolveEscalation.mockImplementation(() => {
      throw new Error("already resolved");
    });
    const { POST } = await import("../route");

    const response = await POST(request({ note: "done" }), { params: Promise.resolve({ id: "esc-1" }) });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ ok: false, error: "already resolved" });
  });

  it("returns a safe 500 for unexpected storage failures", async () => {
    setOperatorSession();
    mocks.db.prepare.mockImplementation(() => {
      throw new Error("database unavailable");
    });
    const { POST } = await import("../route");

    const response = await POST(request({ note: "done" }), { params: Promise.resolve({ id: "esc-1" }) });

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ ok: false, error: "database unavailable" });
  });
});
