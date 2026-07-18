// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  scoreAndMaybePersistEvalTrace: vi.fn(),
}));

vi.mock("@/lib/evals/service", () => ({
  scoreAndMaybePersistEvalTrace: mocks.scoreAndMaybePersistEvalTrace,
}));

const { POST } = await import("../route");

describe("POST /api/evals/run", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.MEMROOS_OPERATOR_API_KEY;
  });

  it("requires registry write authorization for external requests", async () => {
    const response = await POST(
      new Request("https://memroos.example.com/api/evals/run", { method: "POST" }) as never
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: "Registry write authorization required",
    });
  });

  it("validates trace shape before scoring", async () => {
    const response = await POST(
      new Request("http://localhost/api/evals/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ trace: { traceId: "trace-1" } }),
      }) as never
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: "trace with traceId, agentId, input, and output is required",
    });
    expect(mocks.scoreAndMaybePersistEvalTrace).not.toHaveBeenCalled();
  });

  it("passes persist=false through and maps scoring failures to client errors", async () => {
    const trace = {
      traceId: "trace-1",
      agentId: "agent-1",
      input: "question",
      output: "answer",
    };
    mocks.scoreAndMaybePersistEvalTrace.mockReturnValueOnce({ score: 0.8 });

    const ok = await POST(
      new Request("http://localhost/api/evals/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ trace, persist: false }),
      }) as never
    );
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ ok: true, result: { score: 0.8 } });
    expect(mocks.scoreAndMaybePersistEvalTrace).toHaveBeenCalledWith(trace, { persist: false });

    mocks.scoreAndMaybePersistEvalTrace.mockImplementationOnce(() => {
      throw new Error("bad evaluator");
    });
    const failed = await POST(
      new Request("http://localhost/api/evals/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ trace }),
      }) as never
    );
    expect(failed.status).toBe(400);
    expect(await failed.json()).toMatchObject({ error: "bad evaluator" });
  });
});
