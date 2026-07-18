// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth/session", () => ({
  authenticateUser: vi.fn(),
}));

vi.mock("@/lib/skill-workflow", () => ({
  updateSkillReviewState: vi.fn(),
}));

const { POST } = await import("../review/route");
const { authenticateUser } = await import("@/lib/auth/session");
const { updateSkillReviewState } = await import("@/lib/skill-workflow");

const mockAuthenticateUser = vi.mocked(authenticateUser);
const mockUpdateSkillReviewState = vi.mocked(updateSkillReviewState);

function request(body: unknown) {
  return new NextRequest("http://localhost/api/skills/review", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuthenticateUser.mockResolvedValue({
    userId: "user-1",
    email: "admin@example.com",
    displayName: "Admin",
    role: "admin",
    tenantId: "default-tenant",
  });
  mockUpdateSkillReviewState.mockResolvedValue({
    stage: "general",
    status: "approved",
    notes: "ready",
    draftBody: "approved draft",
    updatedAt: "2026-05-17T12:00:00.000Z",
    updatedBy: "admin@example.com",
    approvedAt: "2026-05-17T12:00:00.000Z",
  });
});

describe("POST /api/skills/review", () => {
  it("requires an authenticated operator", async () => {
    mockAuthenticateUser.mockResolvedValueOnce(null);

    const res = await POST(request({ skillName: "browser", action: "approve-general" }));

    expect(res.status).toBe(401);
  });

  it("persists review workflow changes", async () => {
    const res = await POST(request({
      skillName: "browser",
      action: "approve-general",
      notes: "ready",
      draftBody: "approved draft",
    }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(mockUpdateSkillReviewState).toHaveBeenCalledWith({
      skillName: "browser",
      action: "approve-general",
      notes: "ready",
      draftBody: "approved draft",
      actor: "admin@example.com",
    });
  });

  it("requires an operator role before mutating review state", async () => {
    mockAuthenticateUser.mockResolvedValueOnce({
      userId: "user-2",
      email: "reviewer@example.com",
      displayName: "Reviewer",
      role: "reviewer",
      tenantId: "default-tenant",
    });

    const res = await POST(request({ skillName: "browser", action: "approve-general" }));

    expect(res.status).toBe(403);
    expect(mockUpdateSkillReviewState).not.toHaveBeenCalled();
  });

  it("validates required fields and bounded note/draft sizes", async () => {
    const missing = await POST(request({ skillName: "browser" }));
    expect(missing.status).toBe(400);

    const longNotes = await POST(request({
      skillName: "browser",
      action: "request-changes",
      notes: "n".repeat(4_001),
    }));
    expect(longNotes.status).toBe(400);

    const longDraft = await POST(request({
      skillName: "browser",
      action: "save-draft",
      draftBody: "d".repeat(50_001),
    }));
    expect(longDraft.status).toBe(400);
  });

  it("returns workflow errors and falls back to userId as actor", async () => {
    mockAuthenticateUser.mockResolvedValueOnce({
      userId: "user-no-email",
      email: "",
      displayName: "No Email",
      role: "operator",
      tenantId: "default-tenant",
    });
    mockUpdateSkillReviewState.mockRejectedValueOnce(new Error("invalid transition"));

    const res = await POST(request({
      skillName: "browser",
      action: "promote-enterprise",
      changeReason: "enterprise ready",
    }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid transition" });
    expect(mockUpdateSkillReviewState).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: "user-no-email",
        changeReason: "enterprise ready",
      })
    );
  });
});
