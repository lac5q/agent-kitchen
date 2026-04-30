// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── GET /api/voice-status ────────────────────────────────────────────────────

describe("GET /api/voice-status", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 200 with health data when Python voice server responds", async () => {
    const mockHealth = {
      active: true,
      session_id: "abc-123",
      started_at: "2026-04-18T10:00:00Z",
      duration_secs: 42,
    };

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify(mockHealth), { status: 200 })
      )
    );

    const { GET } = await import("../route");
    const req = new Request("http://localhost/api/voice-status");
    const res = await GET(req as unknown as import("next/server").NextRequest);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.active).toBe(true);
    expect(body.session_id).toBe("abc-123");
    expect(body.started_at).toBe("2026-04-18T10:00:00Z");
    expect(body.duration_secs).toBe(42);
  });

  it("returns active:false with error message when Python server is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      })
    );

    const { GET } = await import("../route");
    const req = new Request("http://localhost/api/voice-status");
    const res = await GET(req as unknown as import("next/server").NextRequest);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.active).toBe(false);
    expect(body.error).toBe("voice server unavailable");
  });
});
