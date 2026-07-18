// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

const cron = vi.hoisted(() => ({
  ensureDefaultCronJobs: vi.fn(),
  isCronJobRunnable: vi.fn(() => true),
  recordCronHealthRun: vi.fn(),
}));

const graph = vi.hoisted(() => ({
  GRAPH_CATCHUP_CRON_ID: "graph-catchup",
  isNeo4jConfigured: vi.fn(() => true),
  runGraphCatchup: vi.fn(),
}));

const db = vi.hoisted(() => ({
  handle: {},
}));

vi.mock("@/lib/db", () => ({
  getDb: () => db.handle,
}));

vi.mock("@/lib/cron-health", () => cron);

vi.mock("@/lib/memory/graph-catchup", () => graph);

describe("memory graph catchup scheduler error path", () => {
  it("records cron health failure when catchup throws", async () => {
    graph.runGraphCatchup.mockRejectedValueOnce(new Error("catchup exploded"));
    const { runScheduledGraphCatchup } = await import("@/lib/memory-graph-catchup-scheduler");
    const now = new Date("2026-07-18T10:00:00.000Z");

    let thrown: unknown;
    try {
      await runScheduledGraphCatchup({ dryRun: true, now });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toBe("catchup exploded");

    expect(cron.ensureDefaultCronJobs).toHaveBeenCalledWith(db.handle);
    expect(cron.recordCronHealthRun).toHaveBeenCalledWith(db.handle, "graph-catchup", {
      success: false,
      warning: "graph_catchup_error:catchup exploded",
      now,
    });
  });
});
