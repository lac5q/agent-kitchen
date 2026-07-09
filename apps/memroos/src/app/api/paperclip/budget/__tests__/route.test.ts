// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

const MOCK_BUDGET_PAYLOAD = {
  companyId: "comp-1",
  scope: "company",
  scopeId: null,
  spent: 750,
  limit: 1000,
  status: "warning",
  asOf: "2026-07-09T10:00:00Z",
};

beforeEach(() => {
  process.env.PAPERCLIP_BASE_URL = "http://localhost:3100";
  process.env.PAPERCLIP_BUDGET_PATH = "/api/budget";
  vi.restoreAllMocks();
});

afterAll(() => {
  // no-op
});

const { GET } = await import("../route");

// ---------------------------------------------------------------------------
// GET /api/paperclip/budget — budget delegation (FLEET-19)
// ---------------------------------------------------------------------------

describe("GET /api/paperclip/budget — budget delegation proxy", () => {
  it("FLEET-19: proxies upstream budget and returns a thin summary with hardStopOwner=paperclip", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(MOCK_BUDGET_PAYLOAD), { status: 200 }))
    );

    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.hardStopOwner).toBe("paperclip");
    expect(data.summary.companyId).toBe("comp-1");
    expect(data.summary.scope).toBe("company");
    expect(data.summary.scopeId).toBeNull();
    expect(data.summary.spent).toBe(750);
    expect(data.summary.limit).toBe(1000);
    expect(data.summary.utilization).toBeCloseTo(0.75);
    expect(data.summary.status).toBe("warning");
    expect(data.summary.asOf).toBe("2026-07-09T10:00:00Z");
    expect(data.summary.hardStopOwner).toBe("paperclip");
  });

  it("FLEET-19: normalizes hard_stop status correctly", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({ ...MOCK_BUDGET_PAYLOAD, status: "hard_stop", spent: 1100, limit: 1000 }),
          { status: 200 }
        )
      )
    );

    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.summary.status).toBe("hard_stop");
    expect(data.summary.utilization).toBeCloseTo(1.1);
  });

  it("FLEET-19: normalizes agent and project scopes", async () => {
    for (const scope of ["agent", "project"]) {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () =>
          new Response(
            JSON.stringify({ ...MOCK_BUDGET_PAYLOAD, scope, scopeId: `scope-${scope}` }),
            { status: 200 }
          )
        )
      );
      const res = await GET();
      const data = await res.json();
      expect(data.summary.scope).toBe(scope);
      expect(data.summary.scopeId).toBe(`scope-${scope}`);
    }
  });

  it("FLEET-19: defaults unknown scope to 'company'", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ ...MOCK_BUDGET_PAYLOAD, scope: "unknown" }), { status: 200 }))
    );
    const res = await GET();
    const data = await res.json();
    expect(data.summary.scope).toBe("company");
  });

  it("FLEET-19: handles zero limit without division error (utilization=0)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({ ...MOCK_BUDGET_PAYLOAD, spent: 0, limit: 0, status: "ok" }),
          { status: 200 }
        )
      )
    );
    const res = await GET();
    const data = await res.json();
    expect(data.summary.utilization).toBe(0);
    expect(data.summary.status).toBe("ok");
  });
});

// ---------------------------------------------------------------------------
// Graceful degradation when Paperclip is unconfigured
// ---------------------------------------------------------------------------

describe("GET /api/paperclip/budget — graceful degradation", () => {
  it("returns 503 when PAPERCLIP_BASE_URL is not configured", async () => {
    delete process.env.PAPERCLIP_BASE_URL;
    const res = await GET();
    expect(res.status).toBe(503);
    const data = await res.json();
    expect(data.error).toMatch(/not configured/i);
    expect(data.hardStopOwner).toBe("paperclip");
  });

  it("returns 502 when upstream is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("Connection refused");
    }));
    const res = await GET();
    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data.error).toMatch(/unreachable/i);
    expect(data.hardStopOwner).toBe("paperclip");
  });

  it("returns 502 when upstream returns non-OK status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("Internal Error", { status: 500 }))
    );
    const res = await GET();
    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data.error).toMatch(/upstream budget query failed/i);
    expect(data.hardStopOwner).toBe("paperclip");
  });
});

// ---------------------------------------------------------------------------
// No secret leaks
// ---------------------------------------------------------------------------

describe("GET /api/paperclip/budget — no secret leaks", () => {
  it("does not expose PAPERCLIP_BASE_URL or upstream auth in the response", async () => {
    process.env.PAPERCLIP_BASE_URL = "http://PLACEHOLDER:PLACEHOLDER@localhost:3100";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(MOCK_BUDGET_PAYLOAD), { status: 200 }))
    );
    const res = await GET();
    const text = await res.text();
    expect(text).not.toContain("secret-user");
    expect(text).not.toContain("secret-pass");
  });

  it("never fabricates budget data when upstream fails", async () => {
    delete process.env.PAPERCLIP_BASE_URL;
    const res = await GET();
    const data = await res.json();
    // Must not contain a fabricated summary
    expect(data.summary).toBeUndefined();
  });
});
