// @vitest-environment node
import { describe, expect, it } from "vitest";

const checkpointsRoute = await import("../route");
const metricsRoute = await import("../metrics/route");

describe("/api/agent-checkpoints", () => {
  it("blocks direct non-local checkpoint writes without operator authorization", async () => {
    const req = new Request("https://memroos.example.com/api/agent-checkpoints", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        runId: `run-${Date.now()}`,
        ownerAgentId: "opencode",
        objective: "Bypass proxy",
      }),
    });

    const res = await checkpointsRoute.POST(req);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({
      ok: false,
      error: "Registry write authorization required",
    });
  });

  it("blocks direct non-local checkpoint reads without operator authorization", async () => {
    const req = new Request("https://memroos.example.com/api/agent-checkpoints?runId=run-missing");

    const res = await checkpointsRoute.GET(req);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({
      ok: false,
      error: "Registry write authorization required",
    });
  });

  it("blocks direct non-local checkpoint metrics without operator authorization", async () => {
    const req = new Request("https://memroos.example.com/api/agent-checkpoints/metrics");

    const res = await metricsRoute.GET(req);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({
      ok: false,
      error: "Registry write authorization required",
    });
  });

  it("accepts a POST capture and returns a checkpoint, then resumes it", async () => {
    const runId = `run-${Date.now()}`;
    const payload = {
      runId,
      ownerAgentId: "opencode",
      objective: "Verify API routes",
      nextSafeAction: "Trigger post request",
      completedSteps: ["Step A"],
      remainingSteps: ["Step B"],
    };

    const postReq = new Request("http://localhost/api/agent-checkpoints", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const postRes = await checkpointsRoute.POST(postReq);
    expect(postRes.status).toBe(200);

    const postData = await postRes.json();
    expect(postData.status).toBe("ok");
    expect(postData.checkpoint.id).toBeTruthy();

    const getReq = new Request(`http://localhost/api/agent-checkpoints?runId=${runId}`);
    const getRes = await checkpointsRoute.GET(getReq);
    expect(getRes.status).toBe(200);

    const getData = await getRes.json();
    expect(getData.status).toBe("ok");
    expect(getData.checkpoint.ownerAgentId).toBe("opencode");
    expect(getData.checkpoint.objective).toBe("Verify API routes");
  });

  it("fetches checkpoints metrics", async () => {
    const req = new Request("http://localhost/api/agent-checkpoints/metrics");
    const res = await metricsRoute.GET(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.status).toBe("ok");
    expect(data.metrics.avgWriteLatencyMs).toBeDefined();
    expect(data.metrics.avgCheckpointSize).toBeDefined();
  });
});
