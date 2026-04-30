// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import Database from "better-sqlite3";

// Create a shared in-memory DB for the entire test suite
const testDb = new Database(":memory:");

// Apply the real schema so hive tables exist
const { initSchema } = await import("@/lib/db-schema");
initSchema(testDb);

// Mock @/lib/db to return the in-memory DB
vi.mock("@/lib/db", () => ({
  getDb: () => testDb,
  closeDb: () => {},
}));

// Helper builders
function makeGetRequest(): Request {
  return new Request("http://localhost/api/paperclip", { method: "GET" });
}

function makePostRequest(body: unknown): Request {
  return new Request("http://localhost/api/paperclip", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

// Upstream fleet payload with mixed autonomy modes
const MOCK_FLEET_PAYLOAD = {
  agents: [
    { id: "a1", name: "Alpha", status: "active", autonomyMode: "interactive", activeTask: "task-1", lastHeartbeat: "2026-04-17T10:00:00Z" },
    { id: "a2", name: "Beta",  status: "idle",   autonomyMode: "AUTONOMOUS",  activeTask: null,     lastHeartbeat: "2026-04-17T09:55:00Z" },
    { id: "a3", name: "Gamma", status: "active", autonomyMode: "continuous",  activeTask: "task-2", lastHeartbeat: "2026-04-17T09:58:00Z" },
    { id: "a4", name: "Delta", status: "dormant",autonomyMode: "hybrid",      activeTask: null,     lastHeartbeat: "2026-04-17T09:00:00Z" },
    { id: "a5", name: "Eps",   status: "active", autonomyMode: "unknown-mode",activeTask: "task-3", lastHeartbeat: "2026-04-17T09:59:00Z" },
  ],
};

// Seed a delegation row for recovery tests — returns the taskId inserted
function seedDelegation(opts: { taskId?: string; sessionId?: string; status?: string } = {}) {
  const taskId = opts.taskId ?? `task-seed-${Date.now()}-${Math.random()}`;
  const sessionId = opts.sessionId ?? `sess-seed-${Date.now()}`;
  const status = opts.status ?? "active";
  const checkpoint = JSON.stringify({
    sessionId,
    completedSteps: ["step-init"],
    resumeFrom: "step-process",
    lastStepAt: "2026-04-17T08:00:00Z",
  });
  testDb.prepare(
    `INSERT INTO hive_delegations(task_id, from_agent, to_agent, task_summary, priority, status, checkpoint)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(taskId, "test-agent", "paperclip", "Seed task for recovery", 5, status, checkpoint);
  return { taskId, sessionId };
}

beforeEach(() => {
  // Set PAPERCLIP_BASE_URL by default (individual tests unset it when needed)
  process.env.PAPERCLIP_BASE_URL = "http://localhost:3100";
  vi.restoreAllMocks();
});

afterAll(() => {
  if (testDb && testDb.open) testDb.close();
});

// Import route handlers — will fail RED until route exists
const { GET, POST } = await import("../route");

// ---------------------------------------------------------------------------
// POST tests
// ---------------------------------------------------------------------------

describe("POST /api/paperclip — dispatch", () => {
  it("Test 1 (PAPER-02): POST rejects missing taskSummary with 400", async () => {
    const req = makePostRequest({ requestedBy: "dashboard" });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBeDefined();
  });

  it("Test 2 (PAPER-02): POST returns 503 when PAPERCLIP_BASE_URL is not configured", async () => {
    delete process.env.PAPERCLIP_BASE_URL;
    const req = makePostRequest({ taskSummary: "Run indexing", requestedBy: "dashboard" });
    const res = await POST(req as any);
    expect(res.status).toBe(503);
    const data = await res.json();
    expect(data.error).toMatch(/not configured/i);
  });

  it("Test 3 (PAPER-02): POST forwards dispatch upstream and returns {ok, taskId, sessionId} + writes hive_delegations row", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url: string) => {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }));

    const req = makePostRequest({ taskSummary: "Index all agents", requestedBy: "dashboard" });
    const res = await POST(req as any);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(typeof data.taskId).toBe("string");
    expect(typeof data.sessionId).toBe("string");

    // Check hive_delegations row was written
    const row = testDb.prepare(
      `SELECT * FROM hive_delegations WHERE task_id = ?`
    ).get(data.taskId) as any;
    expect(row).toBeDefined();
    expect(row.to_agent).toBe("paperclip");
  });

  it("Test 4 (PAPER-04): stored delegation checkpoint JSON includes sessionId, completedSteps:[], resumeFrom:'dispatch'", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    ));

    const req = makePostRequest({ taskSummary: "Checkpoint test", requestedBy: "dashboard" });
    const res = await POST(req as any);
    const data = await res.json();

    const row = testDb.prepare(
      `SELECT * FROM hive_delegations WHERE task_id = ?`
    ).get(data.taskId) as any;
    expect(row).toBeDefined();
    const checkpoint = JSON.parse(row.checkpoint);
    expect(checkpoint.sessionId).toBe(data.sessionId);
    expect(checkpoint.completedSteps).toEqual([]);
    expect(checkpoint.resumeFrom).toBe("dispatch");
  });

  it("Test 5 (PAPER-04): POST writes hive_actions row with agent_id='paperclip', action_type='trigger', matching session_id", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    ));

    const req = makePostRequest({ taskSummary: "Actions row test", requestedBy: "dashboard" });
    const res = await POST(req as any);
    const data = await res.json();

    const actionRow = testDb.prepare(
      `SELECT * FROM hive_actions WHERE session_id = ? AND agent_id = 'paperclip'`
    ).get(data.sessionId) as any;
    expect(actionRow).toBeDefined();
    expect(actionRow.agent_id).toBe("paperclip");
    expect(actionRow.action_type).toBe("trigger");
    expect(actionRow.session_id).toBe(data.sessionId);
  });

  it("Test 10: user-provided sessionId is preserved instead of generating a new one", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    ));

    const customSessionId = "my-custom-session-abc123";
    const req = makePostRequest({
      taskSummary: "Preserved session test",
      requestedBy: "dashboard",
      sessionId: customSessionId,
    });
    const res = await POST(req as any);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.sessionId).toBe(customSessionId);
  });
});

// ---------------------------------------------------------------------------
// GET tests
// ---------------------------------------------------------------------------

describe("GET /api/paperclip — fleet status and recovery", () => {
  it("Test 6 (PAPER-04): GET returns normalized operations array from local hive_delegations where to_agent='paperclip'", async () => {
    const { taskId, sessionId } = seedDelegation();

    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ agents: [] }), { status: 200 })
    ));

    const req = makeGetRequest();
    const res = await GET(req as any);
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(Array.isArray(data.operations)).toBe(true);
    const op = data.operations.find((o: any) => o.taskId === taskId);
    expect(op).toBeDefined();
    expect(op.sessionId).toBe(sessionId);
    expect(Array.isArray(op.completedSteps)).toBe(true);
    expect(op.resumeFrom).toBeDefined();
    expect(op.status).toBeDefined();
    expect(op.updatedAt).toBeDefined();
  });

  it("Test 7: GET returns local recovery operations when upstream fails, with fleetStatus='offline' and agents:[]", async () => {
    // Seed a paperclip delegation so recovery is non-trivial
    seedDelegation({ status: "paused" });

    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("Connection refused");
    }));

    const req = makeGetRequest();
    const res = await GET(req as any);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.summary.fleetStatus).toBe("offline");
    expect(data.agents).toEqual([]);
    // Local operations must still be returned
    expect(Array.isArray(data.operations)).toBe(true);
    expect(data.operations.length).toBeGreaterThan(0);
  });

  it("Test 8 (PAPER-03): GET normalizes upstream autonomy values into exact vocabulary", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify(MOCK_FLEET_PAYLOAD), { status: 200 })
    ));

    const req = makeGetRequest();
    const res = await GET(req as any);
    expect(res.status).toBe(200);
    const data = await res.json();

    const validModes = new Set(["Interactive", "Autonomous", "Continuous", "Hybrid"]);
    for (const agent of data.agents) {
      expect(validModes.has(agent.autonomyMode)).toBe(true);
    }

    // Check specific normalizations
    const alpha = data.agents.find((a: any) => a.id === "a1");
    expect(alpha?.autonomyMode).toBe("Interactive");
    const beta = data.agents.find((a: any) => a.id === "a2");
    expect(beta?.autonomyMode).toBe("Autonomous");
    const gamma = data.agents.find((a: any) => a.id === "a3");
    expect(gamma?.autonomyMode).toBe("Continuous");
    const delta = data.agents.find((a: any) => a.id === "a4");
    expect(delta?.autonomyMode).toBe("Hybrid");
    // unknown-mode defaults to Interactive
    const eps = data.agents.find((a: any) => a.id === "a5");
    expect(eps?.autonomyMode).toBe("Interactive");
  });

  it("Test 9: operations are sorted newest-first by updatedAt", async () => {
    // Seed two more rows with different timestamps
    const older = `task-older-${Date.now()}`;
    const newer = `task-newer-${Date.now() + 1}`;
    testDb.prepare(
      `INSERT INTO hive_delegations(task_id, from_agent, to_agent, task_summary, priority, status, checkpoint, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(older, "agent", "paperclip", "older task", 5, "active",
      JSON.stringify({ sessionId: "s-old", completedSteps: [], resumeFrom: null, lastStepAt: "" }),
      "2026-01-01T00:00:00Z");
    testDb.prepare(
      `INSERT INTO hive_delegations(task_id, from_agent, to_agent, task_summary, priority, status, checkpoint, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(newer, "agent", "paperclip", "newer task", 5, "active",
      JSON.stringify({ sessionId: "s-new", completedSteps: [], resumeFrom: null, lastStepAt: "" }),
      "2026-04-17T12:00:00Z");

    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ agents: [] }), { status: 200 })
    ));

    const req = makeGetRequest();
    const res = await GET(req as any);
    const data = await res.json();

    const ops = data.operations;
    expect(ops.length).toBeGreaterThanOrEqual(2);

    // Verify descending order
    for (let i = 0; i < ops.length - 1; i++) {
      expect(ops[i].updatedAt >= ops[i + 1].updatedAt).toBe(true);
    }
  });
});
