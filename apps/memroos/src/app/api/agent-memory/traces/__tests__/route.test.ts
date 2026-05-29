// @vitest-environment node
import { describe, expect, it } from "vitest";

const tracesRoute = await import("../route");

describe("/api/agent-memory/traces", () => {
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
});
