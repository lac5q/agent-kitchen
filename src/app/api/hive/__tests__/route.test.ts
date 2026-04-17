// @vitest-environment node
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import Database from "better-sqlite3";
import { initSchema } from "@/lib/db-schema";

// Use a real in-memory SQLite DB with the actual schema
let testDb: Database.Database;

vi.mock("@/lib/db", () => {
  const Database = require("better-sqlite3");
  const { initSchema } = require("@/lib/db-schema");
  testDb = new Database(":memory:");
  initSchema(testDb);
  return {
    getDb: () => testDb,
    closeDb: () => {},
  };
});

// Import route handlers after mock is set up
const { GET, POST } = await import("../route");

// Helper: build a NextRequest-like object
function makeRequest(
  method: string,
  url: string,
  body?: unknown
): Request {
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers = { "Content-Type": "application/json" };
  }
  return new Request(url, init);
}

function makeGetRequest(params: Record<string, string> = {}): Request {
  const url = new URL("http://localhost/api/hive");
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return makeRequest("GET", url.toString());
}

function makePostRequest(body: unknown): Request {
  return makeRequest("POST", "http://localhost/api/hive", body);
}

afterAll(() => {
  if (testDb && testDb.open) testDb.close();
});

describe("POST /api/hive — actions", () => {
  it("Test 1 (HIVE-01): POST with valid action body returns 200 with {ok:true, id}", async () => {
    const req = makePostRequest({
      agent_id: "claude-code",
      action_type: "checkpoint",
      summary: "Completed task 1",
    });
    const res = await POST(req as any);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(typeof data.id).toBe("number");
  });

  it("Test 2 (HIVE-01): POST with invalid action_type returns 400 with descriptive error", async () => {
    const req = makePostRequest({
      agent_id: "claude-code",
      action_type: "invalid-type",
      summary: "Should fail",
    });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/action_type/i);
    expect(data.error).toContain("continue");
  });

  it("Test 3 (HIVE-01): POST with artifacts object stores JSON; GET returns it as string", async () => {
    const artifacts = { filesProcessed: 42, nextBatch: "batch-2" };
    const postReq = makePostRequest({
      agent_id: "claude-code",
      action_type: "continue",
      summary: "Artifacts test",
      artifacts,
    });
    const postRes = await POST(postReq as any);
    expect(postRes.status).toBe(200);
    const { id } = await postRes.json();

    const getReq = makeGetRequest({ agent: "claude-code" });
    const getRes = await GET(getReq as any);
    const data = await getRes.json();
    const row = data.actions.find((a: any) => a.id === id);
    expect(row).toBeDefined();
    expect(typeof row.artifacts).toBe("string");
    expect(JSON.parse(row.artifacts)).toEqual(artifacts);
  });
});

describe("GET /api/hive — action queries", () => {
  beforeAll(async () => {
    // Seed some actions for filter tests
    const actions = [
      { agent_id: "claude", action_type: "continue", summary: "claude continue action" },
      { agent_id: "claude", action_type: "stop", summary: "claude stopping now" },
      { agent_id: "gwen", action_type: "loop", summary: "gwen looping keyword here" },
    ];
    for (const a of actions) {
      await POST(makePostRequest(a) as any);
    }
  });

  it("Test 4 (HIVE-02): GET ?agent=claude returns only actions by that agent_id", async () => {
    const req = makeGetRequest({ agent: "claude" });
    const res = await GET(req as any);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.actions.every((a: any) => a.agent_id === "claude")).toBe(true);
  });

  it("Test 5 (HIVE-02): GET ?q=keyword returns FTS-matched results", async () => {
    const req = makeGetRequest({ q: "keyword" });
    const res = await GET(req as any);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.actions.length).toBeGreaterThan(0);
    expect(data.actions.some((a: any) => a.summary.includes("keyword"))).toBe(true);
  });

  it("Test 6 (HIVE-02): GET ?agent=claude&q=stopping combines both filters", async () => {
    const req = makeGetRequest({ agent: "claude", q: "stopping" });
    const res = await GET(req as any);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.actions.length).toBeGreaterThan(0);
    expect(data.actions.every((a: any) => a.agent_id === "claude")).toBe(true);
  });

  it("Test 7 (HIVE-02): GET ?q= with malformed FTS syntax returns 200 not 500", async () => {
    const req = makeGetRequest({ q: '"unclosed quote' });
    const res = await GET(req as any);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.actions)).toBe(true);
  });

  it("Test 12: GET ?limit=5 returns at most 5 rows", async () => {
    // Seed enough rows to exceed limit
    for (let i = 0; i < 6; i++) {
      await POST(makePostRequest({ agent_id: "limit-test", action_type: "loop", summary: `limit row ${i}` }) as any);
    }
    const req = makeGetRequest({ limit: "5" });
    const res = await GET(req as any);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.actions.length).toBeLessThanOrEqual(5);
  });
});

describe("POST /api/hive — delegations", () => {
  it("Test 8 (HIVE-03): POST type=delegation creates row; GET ?type=delegation retrieves it", async () => {
    const taskId = `task-${Date.now()}`;
    const postReq = makePostRequest({
      type: "delegation",
      task_id: taskId,
      from_agent: "claude-code",
      to_agent: "paperclip",
      task_summary: "Index all JSONL files",
      priority: 3,
      status: "pending",
    });
    const postRes = await POST(postReq as any);
    expect(postRes.status).toBe(200);
    const postData = await postRes.json();
    expect(postData.ok).toBe(true);
    expect(postData.task_id).toBe(taskId);

    const getReq = makeGetRequest({ type: "delegation" });
    const getRes = await GET(getReq as any);
    const getData = await getRes.json();
    expect(Array.isArray(getData.delegations)).toBe(true);
    const row = getData.delegations.find((d: any) => d.task_id === taskId);
    expect(row).toBeDefined();
  });

  it("Test 9 (HIVE-03): POST delegation with same task_id updates status and checkpoint (UPSERT)", async () => {
    const taskId = `task-upsert-${Date.now()}`;
    await POST(makePostRequest({
      type: "delegation",
      task_id: taskId,
      from_agent: "claude-code",
      to_agent: "paperclip",
      task_summary: "Upsert test task",
      status: "pending",
    }) as any);

    // Update via upsert
    await POST(makePostRequest({
      type: "delegation",
      task_id: taskId,
      from_agent: "claude-code",
      to_agent: "paperclip",
      task_summary: "Upsert test task",
      status: "active",
      checkpoint: { completedSteps: ["step-1"], lastStepAt: "2026-04-17T10:00:00Z", resumeFrom: "step-2" },
    }) as any);

    const getRes = await GET(makeGetRequest({ type: "delegation" }) as any);
    const getData = await getRes.json();
    const row = getData.delegations.find((d: any) => d.task_id === taskId);
    expect(row).toBeDefined();
    expect(row.status).toBe("active");
  });

  it("Test 10 (HIVE-03): Checkpoint JSON round-trips correctly", async () => {
    const taskId = `task-checkpoint-${Date.now()}`;
    const checkpoint = {
      completedSteps: ["step-1-fetch", "step-2-parse"],
      lastStepAt: "2026-04-17T10:23:00Z",
      resumeFrom: "step-3-write",
    };
    await POST(makePostRequest({
      type: "delegation",
      task_id: taskId,
      from_agent: "claude-code",
      to_agent: "paperclip",
      task_summary: "Checkpoint round-trip test",
      status: "paused",
      checkpoint,
    }) as any);

    const getRes = await GET(makeGetRequest({ type: "delegation" }) as any);
    const getData = await getRes.json();
    const row = getData.delegations.find((d: any) => d.task_id === taskId);
    expect(row).toBeDefined();
    const parsed = JSON.parse(row.checkpoint);
    expect(parsed).toEqual(checkpoint);
  });
});

describe("HIVE-05: Paperclip agent_id round-trip", () => {
  it("Test 11 (HIVE-05): POST with agent_id='paperclip' then GET returns that row", async () => {
    const postReq = makePostRequest({
      agent_id: "paperclip",
      action_type: "checkpoint",
      summary: "Paperclip completed indexing pass 1",
    });
    const postRes = await POST(postReq as any);
    expect(postRes.status).toBe(200);

    const getReq = makeGetRequest({ agent: "paperclip" });
    const getRes = await GET(getReq as any);
    const data = await getRes.json();
    expect(res.status).toBe(200);
    expect(data.actions.some((a: any) => a.agent_id === "paperclip")).toBe(true);
  });
});
