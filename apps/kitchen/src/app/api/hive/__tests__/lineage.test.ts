// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { initSchema } from "@/lib/db-schema";

vi.mock("@/lib/db");

let testDb: Database.Database;

beforeEach(async () => {
  vi.resetModules();
  testDb = new Database(":memory:");
  initSchema(testDb);
  const { getDb } = await import("@/lib/db");
  vi.mocked(getDb).mockReturnValue(testDb as any);
});

async function getRoute() {
  const mod = await import("../route");
  return { GET: mod.GET, POST: mod.POST };
}

function makeGetRequest(params: Record<string, string>) {
  const url = new URL("http://localhost/api/hive");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return { nextUrl: url, url: url.toString() } as any;
}

function makePostRequest(body: object) {
  return { json: async () => body } as any;
}

describe("GET /api/hive lineage", () => {
  it("returns delegation + action chain for task_id", async () => {
    const { GET, POST } = await getRoute();

    await POST(makePostRequest({
      type: "delegation",
      task_id: "t1",
      from_agent: "kitchen",
      to_agent: "sophia",
      task_summary: "lineage test task",
      priority: 5,
      status: "pending",
    }));

    testDb.prepare(
      `INSERT INTO hive_actions(agent_id, action_type, summary, artifacts)
       VALUES ('sophia', 'checkpoint', 'step 1', '{"task_id":"t1","progress":0.5}')`
    ).run();
    testDb.prepare(
      `INSERT INTO hive_actions(agent_id, action_type, summary, artifacts)
       VALUES ('sophia', 'stop', 'done', '{"task_id":"t1","outcome":"completed"}')`
    ).run();

    const res = await GET(makeGetRequest({ task_id: "t1" }));
    const body = await res.json();

    expect(body.task_id).toBe("t1");
    expect(body.delegation).toBeTruthy();
    expect(body.delegation.task_summary).toBe("lineage test task");
    expect(body.actions).toHaveLength(2);
    expect(body.actions[0].action_type).toBe("checkpoint");
    expect(body.actions[1].action_type).toBe("stop");
  });

  it("returns null delegation and empty actions when task_id not found", async () => {
    const { GET } = await getRoute();
    const res = await GET(makeGetRequest({ task_id: "nonexistent" }));
    const body = await res.json();
    expect(body.task_id).toBe("nonexistent");
    expect(body.delegation).toBeNull();
    expect(body.actions).toHaveLength(0);
  });

  it("accepts 'canceled' as a valid delegation status", async () => {
    const { POST } = await getRoute();
    await POST(makePostRequest({
      type: "delegation",
      task_id: "t2",
      from_agent: "kitchen",
      to_agent: "sophia",
      task_summary: "cancelable task",
      status: "pending",
    }));
    const res = await POST(makePostRequest({
      type: "delegation",
      task_id: "t2",
      from_agent: "kitchen",
      to_agent: "sophia",
      task_summary: "cancelable task",
      status: "canceled",
    }));
    expect(res.status).toBe(200);
  });

  it("stores result JSON when delegation is completed", async () => {
    const { POST } = await getRoute();
    await POST(makePostRequest({
      type: "delegation",
      task_id: "t3",
      from_agent: "kitchen",
      to_agent: "sophia",
      task_summary: "result test",
      status: "pending",
    }));
    await POST(makePostRequest({
      type: "delegation",
      task_id: "t3",
      from_agent: "kitchen",
      to_agent: "sophia",
      task_summary: "result test",
      status: "completed",
      result: { artifacts: [{ type: "markdown", url: "https://example.com" }] },
    }));
    const row = testDb.prepare("SELECT result FROM hive_delegations WHERE task_id='t3'").get() as { result: string } | undefined;
    expect(row).toBeTruthy();
    expect(JSON.parse(row!.result)).toMatchObject({ artifacts: [{ type: "markdown" }] });
  });
});
