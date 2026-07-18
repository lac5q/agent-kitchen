// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/memory-recall-evals", () => ({
  getLatestMemoryEvalRun: vi.fn(),
  runMemoryRecallEvalSuite: vi.fn(),
}));

async function loadRoutes() {
  vi.resetModules();
  const latestRoute = await import("../latest/route");
  const runRoute = await import("../run/route");
  const evals = await import("@/lib/memory-recall-evals");
  return { latestRoute, runRoute, evals };
}

describe("memory eval API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the latest persisted eval run", async () => {
    const { latestRoute, evals } = await loadRoutes();
    vi.mocked(evals.getLatestMemoryEvalRun).mockReturnValue({
      ok: true,
      run: {
        id: "run-1",
        mode: "gold",
        status: "passed",
        startedAt: "2026-05-15T00:00:00.000Z",
        completedAt: "2026-05-15T00:01:00.000Z",
        summary: { totalCases: 1, passedCases: 1, failedCases: 0, passRate: 1, p95LatencyMs: 100, tierFailures: [] },
        results: [],
      },
      timestamp: "2026-05-15T00:01:00.000Z",
    });

    const response = await latestRoute.GET(new Request("http://localhost/api/memory/evals/latest"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.run.id).toBe("run-1");
    expect(body.run.summary.passRate).toBe(1);
  });

  it("runs the suite on demand", async () => {
    const { runRoute, evals } = await loadRoutes();
    vi.mocked(evals.runMemoryRecallEvalSuite).mockResolvedValue({
      id: "run-2",
      mode: "canary",
      status: "failed",
      startedAt: "2026-05-15T00:00:00.000Z",
      completedAt: "2026-05-15T00:01:00.000Z",
      summary: { totalCases: 1, passedCases: 0, failedCases: 1, passRate: 0, p95LatencyMs: 5000, tierFailures: ["vector"] },
      results: [],
    });

    const response = await runRoute.POST(
      new Request("http://localhost/api/memory/evals/run?mode=canary", { method: "POST" })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.run.status).toBe("failed");
    expect(body.run.summary.tierFailures).toEqual(["vector"]);
    expect(evals.runMemoryRecallEvalSuite).toHaveBeenCalledWith(expect.objectContaining({ mode: "canary" }));
  });

  it("rejects remote eval runs without operator authorization", async () => {
    process.env.MEMROOS_OPERATOR_API_KEY = "eval-secret";
    const { runRoute, evals } = await loadRoutes();

    const response = await runRoute.POST(
      new Request("https://memroos.example/api/memory/evals/run?mode=full", { method: "POST" })
    );

    expect(response.status).toBe(403);
    expect(evals.runMemoryRecallEvalSuite).not.toHaveBeenCalled();
    delete process.env.MEMROOS_OPERATOR_API_KEY;
  });

  it("defaults unknown run modes to gold", async () => {
    const { runRoute, evals } = await loadRoutes();
    vi.mocked(evals.runMemoryRecallEvalSuite).mockResolvedValue({
      id: "run-3",
      mode: "gold",
      status: "passed",
      startedAt: "2026-05-15T00:00:00.000Z",
      completedAt: "2026-05-15T00:01:00.000Z",
      summary: { totalCases: 1, passedCases: 1, failedCases: 0, passRate: 1, p95LatencyMs: 100, tierFailures: [] },
      results: [],
    });

    const response = await runRoute.POST(
      new Request("http://localhost/api/memory/evals/run?mode=surprise", { method: "POST" })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.run.mode).toBe("gold");
    expect(evals.runMemoryRecallEvalSuite).toHaveBeenCalledWith({ mode: "gold" });
  });
});
