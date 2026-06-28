// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";

const testDb = new Database(":memory:");
const { initSchema } = await import("@/lib/db-schema");
initSchema(testDb);

vi.mock("@/lib/db", () => ({
  getDb: () => testDb,
  closeDb: () => {},
}));

const telemetryRoute = await import("../telemetry/route");
const recommendationsRoute = await import("../recommendations/route");
const evalsRoute = await import("../evals/route");

function postRequest(url: string, body: Record<string, unknown>): Request {
  return new Request(url, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("model routing APIs", () => {
  beforeEach(() => {
    testDb.exec("DROP TABLE IF EXISTS model_routing_events");
    testDb.exec("DELETE FROM efficiency_events");
  });

  it("blocks direct non-local telemetry writes without operator authorization", async () => {
    const res = await telemetryRoute.POST(
      postRequest("https://memroos.example.com/api/model-routing/telemetry", {
        taskType: "engineering",
        provider: "openai",
        model: "gpt-5.4-mini",
      }) as any
    );

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({
      ok: false,
      error: "Registry write authorization required",
    });
  });

  it("records telemetry without storing raw prompts", async () => {
    const res = await telemetryRoute.POST(
      postRequest("http://localhost/api/model-routing/telemetry", {
        taskType: "engineering",
        agentId: "codex",
        provider: "openai",
        model: "gpt-5.4-mini",
        prompt: "sensitive task context",
        inputTokens: 1000,
        outputTokens: 500,
        success: true,
        qualityScore: 0.8,
      }) as any
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.event.promptHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(data)).not.toContain("sensitive task context");
  });

  it("emits token_ledger telemetry from model-routing token accounting", async () => {
    const { listEfficiencyEvents } = await import("@/lib/efficiency-telemetry");
    const res = await telemetryRoute.POST(
      postRequest("http://localhost/api/model-routing/telemetry", {
        taskType: "engineering",
        taskId: "task-token-ledger",
        agentId: "codex",
        provider: "openai",
        model: "gpt-5.4-mini",
        inputTokens: 1000,
        outputTokens: 250,
        rawContextTokens: 300,
        cachedTokens: 50,
        success: true,
      }) as any
    );

    expect(res.status).toBe(200);
    const rows = listEfficiencyEvents(testDb, {
      eventType: "token_ledger",
      taskId: "task-token-ledger",
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      agentId: "codex",
      eventType: "token_ledger",
      payload: {
        rawContextTokens: 300,
        cachedTokens: 50,
        totalTokens: 1300,
        modelId: "openai/gpt-5.4-mini",
      },
    });
  });

  it("records an explicit zero-token ledger without dividing by zero", async () => {
    const { listEfficiencyEvents } = await import("@/lib/efficiency-telemetry");
    const res = await telemetryRoute.POST(
      postRequest("http://localhost/api/model-routing/telemetry", {
        taskType: "engineering",
        taskId: "task-zero-token-ledger",
        agentId: "codex",
        provider: "local",
        model: "qwen-coder-local",
        inputTokens: 0,
        outputTokens: 0,
        rawContextTokens: 0,
        cachedTokens: 0,
        totalTokens: 0,
        success: true,
      }) as any
    );

    expect(res.status).toBe(200);
    const rows = listEfficiencyEvents(testDb, {
      eventType: "token_ledger",
      taskId: "task-zero-token-ledger",
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].payload).toEqual({
      rawContextTokens: 0,
      cachedTokens: 0,
      totalTokens: 0,
      modelId: "local/qwen-coder-local",
    });
  });

  it("uses observed telemetry in recommendations and exposes eval summaries", async () => {
    const { listEfficiencyEvents } = await import("@/lib/efficiency-telemetry");
    await telemetryRoute.POST(
      postRequest("http://localhost/api/model-routing/telemetry", {
        taskType: "product",
        agentId: "pm-agent",
        provider: "openai",
        model: "gpt-5.4-mini",
        strategy: "balanced",
        latencyMs: 1200,
        success: true,
        qualityScore: 0.95,
      }) as any
    );

    const recRes = await recommendationsRoute.GET(
      new Request("http://localhost/api/model-routing/recommendations?taskType=product&strategy=quality") as any
    );
    const recData = await recRes.json();
    expect(recData.recommendations[0].model).toBe("gpt-5.4-mini");
    expect(recData.recommendations[0].observations).toBeGreaterThan(0);

    const evalRes = await evalsRoute.GET();
    const evalData = await evalRes.json();
    expect(evalData.dimensions.map((d: any) => d.id)).toContain("task_fit");
    expect(evalData.summary.totalRuns).toBeGreaterThan(0);
    expect(listEfficiencyEvents(testDb, { eventType: "token_ledger" })).toHaveLength(0);
  });
});
