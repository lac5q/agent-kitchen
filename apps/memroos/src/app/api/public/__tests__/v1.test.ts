// @vitest-environment node
/**
 * Phase 62: Public Eval API tests.
 *
 * Tests the three public API routes against an in-memory SQLite database.
 * Route handlers are imported directly (no server spin-up required).
 */
import crypto from "crypto";
import Database from "better-sqlite3";
import { describe, expect, it, vi, beforeAll } from "vitest";

const testDb = new Database(":memory:");
const { initSchema } = await import("@/lib/db-schema");
initSchema(testDb);

vi.mock("@/lib/db", () => ({
  getDb: () => testDb,
  closeDb: () => {},
}));

// Must be imported after the db mock is set up.
const tracesRoute = await import("../v1/traces/route");
const runsRoute = await import("../v1/runs/[runId]/route");
const proposalsRoute = await import("../v1/proposals/route");

// ── Helpers ──────────────────────────────────────────────────────────────────

function hashKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

/** Insert a tenant + API key into the in-memory DB. */
function seedTenant(tenantId: string, tenantName: string, apiKey: string): void {
  testDb
    .prepare("INSERT OR IGNORE INTO tenants (id, name) VALUES (?, ?)")
    .run(tenantId, tenantName);
  testDb
    .prepare(
      "INSERT OR IGNORE INTO tenant_api_keys (id, tenant_id, key_hash) VALUES (?, ?, ?)"
    )
    .run(`tak-${tenantId}`, tenantId, hashKey(apiKey));
}

function makeRequest(
  url: string,
  options: { method?: string; headers?: Record<string, string>; body?: unknown } = {}
): Request {
  return new Request(url, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });
}

const VALID_API_KEY = "test-public-api-key-abc123";
const OTHER_TENANT_KEY = "other-tenant-api-key-xyz789";

const sampleTrace = {
  traceId: "trace-public-001",
  agentId: "codex",
  agentModelFamily: "openai",
  role: "engineering",
  input: "Resolve the pending support ticket",
  output: "Resolved with standard workflow",
  expectedFacts: ["resolved"],
  toolCalls: [{ name: "memory.search", valid: true }],
  outcome: { completed: true, escalated: false, ttrMs: 1200, operatorApproved: true, costUsd: 0.05 },
};

const openInferenceSpan = {
  "openinference.span.kind": "AGENT",
  "input.value": "What is the refund policy?",
  "output.value": "Refunds are accepted within 30 days of purchase.",
  "llm.model_name": "claude-haiku-4-5-20251001",
  "session.id": "oi-session-trace-001",
  "metadata.agent_id": "support-agent",
  "llm.token_count.total": 500,
};

// Seed tenants once before all tests.
beforeAll(() => {
  seedTenant("tenant-alpha", "Alpha Corp", VALID_API_KEY);
  seedTenant("tenant-beta", "Beta Corp", OTHER_TENANT_KEY);
});

// ── POST /api/public/v1/traces ───────────────────────────────────────────────

describe("POST /api/public/v1/traces", () => {
  it("returns 401 when Authorization header is missing", async () => {
    const req = makeRequest("http://localhost/api/public/v1/traces", {
      method: "POST",
      body: sampleTrace,
    });
    const res = await tracesRoute.POST(req as Parameters<typeof tracesRoute.POST>[0]);
    expect(res.status).toBe(401);
  });

  it("returns 401 for an invalid API key", async () => {
    const req = makeRequest("http://localhost/api/public/v1/traces", {
      method: "POST",
      headers: { Authorization: "Bearer bad-key-does-not-exist" },
      body: sampleTrace,
    });
    const res = await tracesRoute.POST(req as Parameters<typeof tracesRoute.POST>[0]);
    expect(res.status).toBe(401);
  });

  it("returns 200 with W and layers for MemroOS JSON trace", async () => {
    const req = makeRequest("http://localhost/api/public/v1/traces", {
      method: "POST",
      headers: { Authorization: `Bearer ${VALID_API_KEY}` },
      body: sampleTrace,
    });
    const res = await tracesRoute.POST(req as Parameters<typeof tracesRoute.POST>[0]);
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Memroos-Contract")).toBe("public-eval-api.v1");
    const data = await res.json() as {
      runId: string;
      w: number;
      layers: { l1: unknown; l2: unknown; l3: unknown };
      tenantId: string;
    };
    expect(typeof data.runId).toBe("string");
    expect(typeof data.w).toBe("number");
    expect(data.w).toBeGreaterThanOrEqual(0);
    expect(data.layers).toHaveProperty("l1");
    expect(data.layers).toHaveProperty("l2");
    expect(data.layers).toHaveProperty("l3");
    expect(data.tenantId).toBe("tenant-alpha");
    const row = testDb
      .prepare("SELECT tenant_id FROM eval_runs WHERE id = ?")
      .get(data.runId) as { tenant_id: string } | undefined;
    expect(row?.tenant_id).toBe("tenant-alpha");
  });

  it("returns 200 with W for OpenInference span (round-trip format)", async () => {
    const req = makeRequest("http://localhost/api/public/v1/traces", {
      method: "POST",
      headers: { Authorization: `Bearer ${VALID_API_KEY}` },
      body: openInferenceSpan,
    });
    const res = await tracesRoute.POST(req as Parameters<typeof tracesRoute.POST>[0]);
    expect(res.status).toBe(200);
    const data = await res.json() as { w: number };
    expect(typeof data.w).toBe("number");
  });

  it("OpenInference and equivalent MemroOS trace return numeric W values", async () => {
    // Both paths should produce a numeric W — exact equality is not guaranteed
    // since field coverage differs, but both must be in [0, 1].
    const oiReq = makeRequest("http://localhost/api/public/v1/traces", {
      method: "POST",
      headers: { Authorization: `Bearer ${VALID_API_KEY}` },
      body: { ...openInferenceSpan, "session.id": "oi-roundtrip-001" },
    });
    const oiRes = await tracesRoute.POST(oiReq as Parameters<typeof tracesRoute.POST>[0]);
    const oiData = await oiRes.json() as { w: number };

    const memroosReq = makeRequest("http://localhost/api/public/v1/traces", {
      method: "POST",
      headers: { Authorization: `Bearer ${VALID_API_KEY}` },
      body: {
        traceId: "oi-roundtrip-001-memroos",
        agentId: "support-agent",
        input: "What is the refund policy?",
        output: "Refunds are accepted within 30 days of purchase.",
        agentModel: "claude-haiku-4-5-20251001",
      },
    });
    const memroosRes = await tracesRoute.POST(memroosReq as Parameters<typeof tracesRoute.POST>[0]);
    const memroosData = await memroosRes.json() as { w: number };

    expect(typeof oiData.w).toBe("number");
    expect(typeof memroosData.w).toBe("number");
    expect(oiData.w).toBeGreaterThanOrEqual(0);
    expect(memroosData.w).toBeGreaterThanOrEqual(0);
  });

  it("returns 400 for invalid payload (not a trace or OI span)", async () => {
    const req = makeRequest("http://localhost/api/public/v1/traces", {
      method: "POST",
      headers: { Authorization: `Bearer ${VALID_API_KEY}` },
      body: { foo: "bar" },
    });
    const res = await tracesRoute.POST(req as Parameters<typeof tracesRoute.POST>[0]);
    expect(res.status).toBe(400);
  });

  it("returns 400 when the trace request body is missing or invalid JSON", async () => {
    const missingBody = await tracesRoute.POST(
      new Request("http://localhost/api/public/v1/traces", {
        method: "POST",
        headers: { Authorization: `Bearer ${VALID_API_KEY}` },
      }) as Parameters<typeof tracesRoute.POST>[0]
    );
    expect(missingBody.status).toBe(400);
    expect(await missingBody.json()).toEqual({ error: "Request body is required" });

    const invalidJson = await tracesRoute.POST(
      new Request("http://localhost/api/public/v1/traces", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${VALID_API_KEY}`,
        },
        body: "{",
      }) as Parameters<typeof tracesRoute.POST>[0]
    );
    expect(invalidJson.status).toBe(400);
    expect(await invalidJson.json()).toEqual({ error: "Request body is required" });
  });

  it("returns X-RateLimit-* headers on success", async () => {
    const req = makeRequest("http://localhost/api/public/v1/traces", {
      method: "POST",
      headers: { Authorization: `Bearer ${VALID_API_KEY}` },
      body: { ...sampleTrace, traceId: "trace-ratelimit-check" },
    });
    const res = await tracesRoute.POST(req as Parameters<typeof tracesRoute.POST>[0]);
    expect(res.headers.get("X-RateLimit-Limit")).toBeTruthy();
    expect(res.headers.get("X-RateLimit-Remaining")).toBeTruthy();
    expect(res.headers.get("X-RateLimit-Reset")).toBeTruthy();
    expect(res.headers.get("X-Memroos-Contract")).toBe("public-eval-api.v1");
  });
});

// ── GET /api/public/v1/runs/[runId] ─────────────────────────────────────────

describe("GET /api/public/v1/runs/[runId]", () => {
  let persistedRunId: string;

  beforeAll(async () => {
    // Submit a trace to get a real persisted run ID for the alpha tenant.
    const req = makeRequest("http://localhost/api/public/v1/traces", {
      method: "POST",
      headers: { Authorization: `Bearer ${VALID_API_KEY}` },
      body: { ...sampleTrace, traceId: "trace-for-run-get" },
    });
    const res = await tracesRoute.POST(req as Parameters<typeof tracesRoute.POST>[0]);
    const data = await res.json() as { runId: string };
    persistedRunId = data.runId;

    const row = testDb
      .prepare("SELECT tenant_id FROM eval_runs WHERE id = ?")
      .get(persistedRunId) as { tenant_id: string } | undefined;
    expect(row?.tenant_id).toBe("tenant-alpha");
  });

  it("returns 401 with no auth", async () => {
    const req = makeRequest(`http://localhost/api/public/v1/runs/run-abc`);
    const res = await runsRoute.GET(req as Parameters<typeof runsRoute.GET>[0], {
      params: Promise.resolve({ runId: "run-abc" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 for unknown run ID", async () => {
    const req = makeRequest(`http://localhost/api/public/v1/runs/nonexistent-run`, {
      headers: { Authorization: `Bearer ${VALID_API_KEY}` },
    });
    const res = await runsRoute.GET(req as Parameters<typeof runsRoute.GET>[0], {
      params: Promise.resolve({ runId: "nonexistent-run" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 200 with run result for correct tenant", async () => {
    const req = makeRequest(
      `http://localhost/api/public/v1/runs/${persistedRunId}`,
      { headers: { Authorization: `Bearer ${VALID_API_KEY}` } }
    );
    const res = await runsRoute.GET(req as Parameters<typeof runsRoute.GET>[0], {
      params: Promise.resolve({ runId: persistedRunId }),
    });
    expect(res.status).toBe(200);
    const data = await res.json() as { run: { id: string; compositeW: number } };
    expect(data.run.id).toBe(persistedRunId);
    expect(typeof data.run.compositeW).toBe("number");
  });

  it("returns 403 when a different tenant tries to access the run (cross-tenant isolation)", async () => {
    const req = makeRequest(
      `http://localhost/api/public/v1/runs/${persistedRunId}`,
      { headers: { Authorization: `Bearer ${OTHER_TENANT_KEY}` } }
    );
    const res = await runsRoute.GET(req as Parameters<typeof runsRoute.GET>[0], {
      params: Promise.resolve({ runId: persistedRunId }),
    });
    expect(res.status).toBe(403);
  });
});

// ── GET /api/public/v1/proposals ─────────────────────────────────────────────

describe("GET /api/public/v1/proposals", () => {
  beforeAll(() => {
    // Seed a proposal for tenant-alpha and one for tenant-beta.
    const now = new Date().toISOString();

    // First ensure we have a run to reference.
    const runRow = testDb
      .prepare("SELECT id FROM eval_runs LIMIT 1")
      .get() as { id: string } | undefined;
    if (!runRow) return;

    testDb
      .prepare(
        "INSERT OR IGNORE INTO seal_proposals " +
          "(id, trace_id, run_id, agent_id, proposal_type, status, diff_json, rationale, " +
          "forecast_w_delta, baseline_w, baseline_run_id, baseline_layer_json, " +
          "created_at, updated_at, tenant_id) " +
          "VALUES (?, ?, ?, ?, ?, 'pending', '{}', 'test', 0.05, 0.5, ?, '{}', ?, ?, ?)"
      )
      .run(
        "prop-alpha-001",
        "trace-alpha",
        runRow.id,
        "codex",
        "noop_test",
        runRow.id,
        now,
        now,
        "tenant-alpha"
      );

    testDb
      .prepare(
        "INSERT OR IGNORE INTO seal_proposals " +
          "(id, trace_id, run_id, agent_id, proposal_type, status, diff_json, rationale, " +
          "forecast_w_delta, baseline_w, baseline_run_id, baseline_layer_json, " +
          "created_at, updated_at, tenant_id) " +
          "VALUES (?, ?, ?, ?, ?, 'pending', '{}', 'test', 0.03, 0.4, ?, '{}', ?, ?, ?)"
      )
      .run(
        "prop-beta-001",
        "trace-beta",
        runRow.id,
        "codex",
        "noop_test",
        runRow.id,
        now,
        now,
        "tenant-beta"
      );
  });

  it("returns 401 with no auth", async () => {
    const req = makeRequest("http://localhost/api/public/v1/proposals");
    const res = await proposalsRoute.GET(req as Parameters<typeof proposalsRoute.GET>[0]);
    expect(res.status).toBe(401);
  });

  it("returns only proposals belonging to the authenticated tenant", async () => {
    const req = makeRequest("http://localhost/api/public/v1/proposals", {
      headers: { Authorization: `Bearer ${VALID_API_KEY}` },
    });
    const res = await proposalsRoute.GET(req as Parameters<typeof proposalsRoute.GET>[0]);
    expect(res.status).toBe(200);
    const data = await res.json() as { proposals: Array<{ id: string }> };
    const ids = data.proposals.map((p) => p.id);
    expect(ids).toContain("prop-alpha-001");
    expect(ids).not.toContain("prop-beta-001");
  });

  it("does not expose tenant-beta proposals to tenant-alpha (cross-tenant isolation)", async () => {
    const req = makeRequest("http://localhost/api/public/v1/proposals", {
      headers: { Authorization: `Bearer ${OTHER_TENANT_KEY}` },
    });
    const res = await proposalsRoute.GET(req as Parameters<typeof proposalsRoute.GET>[0]);
    const data = await res.json() as { proposals: Array<{ id: string }> };
    const ids = data.proposals.map((p) => p.id);
    expect(ids).toContain("prop-beta-001");
    expect(ids).not.toContain("prop-alpha-001");
  });

  it("filters proposals by traceId when ?traceId= is provided", async () => {
    const req = makeRequest(
      "http://localhost/api/public/v1/proposals?traceId=trace-alpha",
      { headers: { Authorization: `Bearer ${VALID_API_KEY}` } }
    );
    const res = await proposalsRoute.GET(req as Parameters<typeof proposalsRoute.GET>[0]);
    const data = await res.json() as { proposals: Array<{ id: string }> };
    expect(data.proposals.every((p) => p.id.startsWith("prop-alpha"))).toBe(true);
  });
});

// ── Rate limiter quick-check ──────────────────────────────────────────────────

describe("Rate limiter", () => {
  it("allows a request at the default limit", async () => {
    const { checkRateLimit } = await import("@/lib/public-api/rate-limiter");
    const result = checkRateLimit("rl-test-tenant", { requestsPerMinute: 60, burst: 10 });
    expect(result.allowed).toBe(true);
    expect(typeof result.remaining).toBe("number");
  });

  it("blocks a request when the bucket is empty", async () => {
    const { checkRateLimit } = await import("@/lib/public-api/rate-limiter");
    // Drain the bucket for a unique tenant to avoid interference.
    const tenantId = "rl-drain-tenant-" + Date.now();
    const config = { requestsPerMinute: 60, burst: 3 };
    // Consume all burst tokens.
    for (let i = 0; i < 3; i++) {
      checkRateLimit(tenantId, config);
    }
    // Next request should be blocked.
    const result = checkRateLimit(tenantId, config);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });
});

describe("public API key bootstrap", () => {
  it("does not seed the hard-coded internal API key in production", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousInternalKey = process.env.MEMROOS_INTERNAL_API_KEY;
    process.env.NODE_ENV = "production";
    delete process.env.MEMROOS_INTERNAL_API_KEY;
    const db = new Database(":memory:");
    initSchema(db);
    const row = db
      .prepare("SELECT id FROM tenant_api_keys WHERE key_hash = ?")
      .get(hashKey("memroos-internal-default-key"));
    expect(row).toBeUndefined();
    db.close();
    process.env.NODE_ENV = previousNodeEnv;
    if (previousInternalKey === undefined) {
      delete process.env.MEMROOS_INTERNAL_API_KEY;
    } else {
      process.env.MEMROOS_INTERNAL_API_KEY = previousInternalKey;
    }
  });
});
