// @vitest-environment node
import { describe, expect, it } from "vitest";

const tracesRoute = await import("../route");

describe("/api/agent-memory/traces", () => {
  it("blocks direct non-local memory trace writes without operator authorization", async () => {
    const req = new Request("https://memroos.example.com/api/agent-memory/traces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        runId: "run-bypass",
        taskId: "task-bypass",
        causalPath: { retrievalQuery: "private query" },
      }),
    });

    const res = await tracesRoute.POST(req);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({
      ok: false,
      error: "Registry write authorization required",
    });
  });

  it("blocks direct non-local memory trace reads without operator authorization", async () => {
    const req = new Request("https://memroos.example.com/api/agent-memory/traces?runId=run-bypass");

    const res = await tracesRoute.GET(req);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({
      ok: false,
      error: "Registry write authorization required",
    });
  });

  it("accepts a POST capture of a memory run trace and returns it, then retrieves the timeline", async () => {
    const runId = `run-${Date.now()}`;
    const payload = {
      runId,
      taskId: "task-test-route",
      causalPath: {
        contextAssembly: "Assembled vector database.",
        retrievalQuery: "How does SEAL apply shadow copies?",
        retrievedCandidates: [
          { id: "seal-cand-1", content: "SEAL uses shadow copies wrapped in SQLite transactions.", score: 0.99 },
        ],
        policyFilters: [
          { id: "seal-cand-1", decision: "allow", reason: "Cleared memory" },
        ],
        promptInclusion: true,
      },
    };

    const postReq = new Request("http://localhost/api/agent-memory/traces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const postRes = await tracesRoute.POST(postReq);
    expect(postRes.status).toBe(200);

    const postData = await postRes.json();
    expect(postData.status).toBe("ok");
    expect(postData.trace.id).toBeTruthy();

    const getReq = new Request(`http://localhost/api/agent-memory/traces?runId=${runId}`);
    const getRes = await tracesRoute.GET(getReq);
    expect(getRes.status).toBe(200);

    const getData = await getRes.json();
    expect(getData.status).toBe("ok");
    expect(getData.timeline).toContain("[Context Assembly] Assembled vector database.");
    expect(getData.timeline).toContain('[Retrieval Query] "How does SEAL apply shadow copies?"');
  });

  it("returns validation and not-found responses for trace reads", async () => {
    const missingParam = await tracesRoute.GET(
      new Request("http://localhost/api/agent-memory/traces")
    );
    expect(missingParam.status).toBe(400);
    expect(await missingParam.json()).toMatchObject({
      status: "error",
      message: "runId parameter is required",
    });

    const missingTrace = await tracesRoute.GET(
      new Request("http://localhost/api/agent-memory/traces?runId=missing-run")
    );
    expect(missingTrace.status).toBe(404);
    expect(await missingTrace.json()).toMatchObject({
      status: "not_found",
      message: "No memory traces found for run ID missing-run",
    });
  });

  it("surfaces malformed trace POST payloads as client errors", async () => {
    const res = await tracesRoute.POST(
      new Request("http://localhost/api/agent-memory/traces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{",
      })
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ status: "error" });
  });
});
