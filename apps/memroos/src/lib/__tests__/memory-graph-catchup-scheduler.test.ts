// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  testDb,
  ensureDefaultCronJobsMock,
  isCronJobRunnableMock,
  recordCronHealthRunMock,
  isNeo4jConfiguredMock,
  runGraphCatchupMock,
  defaultSummary,
} = vi.hoisted(() => {
  const testDb = { kind: "test-db" };
  const checkpoint = {
    id: "default",
    episodicLastId: 0,
    vectorLastCreatedAt: null as string | null,
    vectorLastId: null as string | null,
    updatedAt: "2026-07-18T00:00:00.000Z",
  };
  const defaultSummary = {
    status: "completed" as const,
    considered: 5,
    projected: 3,
    skipped: 1,
    errors: 0,
    dryRun: false,
    neo4jConfigured: true,
    checkpointBefore: checkpoint,
    checkpointAfter: { ...checkpoint, episodicLastId: 3, vectorLastId: "v1" },
    sources: {
      episodic: { considered: 3, projected: 2, errors: 0 },
      vector: { considered: 2, projected: 1, errors: 0 },
    },
  };
  return {
    testDb,
    ensureDefaultCronJobsMock: vi.fn(),
    isCronJobRunnableMock: vi.fn(() => true),
    recordCronHealthRunMock: vi.fn(),
    isNeo4jConfiguredMock: vi.fn(() => true),
    runGraphCatchupMock: vi.fn(async () => ({ ...defaultSummary })),
    defaultSummary,
  };
});

vi.mock("@/lib/db", () => ({
  getDb: () => testDb,
  closeDb: () => {},
}));

vi.mock("@/lib/cron-health", () => ({
  ensureDefaultCronJobs: ensureDefaultCronJobsMock,
  isCronJobRunnable: isCronJobRunnableMock,
  recordCronHealthRun: recordCronHealthRunMock,
}));

vi.mock("@/lib/memory/graph-catchup", async () => {
  const actual = await vi.importActual<typeof import("@/lib/memory/graph-catchup")>(
    "@/lib/memory/graph-catchup",
  );
  return {
    ...actual,
    isNeo4jConfigured: isNeo4jConfiguredMock,
    runGraphCatchup: runGraphCatchupMock,
  };
});

import {
  GRAPH_CATCHUP_CRON_ID,
  GRAPH_CATCHUP_INTERVAL_MS,
  runScheduledGraphCatchup,
  startGraphCatchupScheduler,
  stopGraphCatchupScheduler,
} from "@/lib/memory-graph-catchup-scheduler";

beforeEach(() => {
  stopGraphCatchupScheduler();
  ensureDefaultCronJobsMock.mockClear();
  isCronJobRunnableMock.mockReset();
  isCronJobRunnableMock.mockReturnValue(true);
  recordCronHealthRunMock.mockClear();
  isNeo4jConfiguredMock.mockReset();
  isNeo4jConfiguredMock.mockReturnValue(true);
  runGraphCatchupMock.mockReset();
  runGraphCatchupMock.mockResolvedValue({ ...defaultSummary });
});

afterEach(() => {
  stopGraphCatchupScheduler();
  vi.useRealTimers();
});

describe("memory-graph-catchup-scheduler", () => {
  it("skips when cron job is paused or stopped", async () => {
    isCronJobRunnableMock.mockReturnValue(false);

    const result = await runScheduledGraphCatchup({
      now: new Date("2026-07-18T12:00:00.000Z"),
    });

    expect(result).toEqual({ status: "skipped", reason: "cron_paused_or_stopped" });
    expect(ensureDefaultCronJobsMock).toHaveBeenCalledWith(testDb);
    expect(runGraphCatchupMock).not.toHaveBeenCalled();
    expect(recordCronHealthRunMock).not.toHaveBeenCalled();
  });

  it("skips and records cron health when neo4j is not configured (non-dryRun)", async () => {
    isNeo4jConfiguredMock.mockReturnValue(false);

    const result = await runScheduledGraphCatchup({
      now: new Date("2026-07-18T12:00:00.000Z"),
    });

    expect(result).toEqual({ status: "skipped", reason: "neo4j_not_configured" });
    expect(runGraphCatchupMock).not.toHaveBeenCalled();
    expect(recordCronHealthRunMock).toHaveBeenCalledWith(testDb, GRAPH_CATCHUP_CRON_ID, {
      success: true,
      itemsProcessed: 0,
      warning: null,
      now: new Date("2026-07-18T12:00:00.000Z"),
      metadata: { skipped: true, reason: "neo4j_not_configured" },
    });
  });

  it("allows dryRun when neo4j is not configured", async () => {
    isNeo4jConfiguredMock.mockReturnValue(false);

    const result = await runScheduledGraphCatchup({
      dryRun: true,
      now: new Date("2026-07-18T12:00:00.000Z"),
    });

    expect(result).toMatchObject({ status: "completed" });
    expect(runGraphCatchupMock).toHaveBeenCalledWith(testDb, {
      dryRun: true,
      batchSize: undefined,
      agentId: undefined,
      now: new Date("2026-07-18T12:00:00.000Z"),
    });
  });

  it("records cron health on completed summary", async () => {
    const now = new Date("2026-07-18T12:00:00.000Z");
    const result = await runScheduledGraphCatchup({ now });

    expect(result).toMatchObject({ status: "completed", projected: 3 });
    expect(recordCronHealthRunMock).toHaveBeenCalledWith(testDb, GRAPH_CATCHUP_CRON_ID, {
      success: true,
      itemsProcessed: 3,
      warning: null,
      now,
      metadata: {
        status: "completed",
        considered: 5,
        projected: 3,
        skipped: 1,
        errors: 0,
        dry_run: false,
        episodic_last_id: 3,
        vector_last_id: "v1",
      },
    });
  });

  it("records partial warning on partial summary", async () => {
    runGraphCatchupMock.mockResolvedValueOnce({
      ...defaultSummary,
      status: "partial",
      errors: 2,
    });

    await runScheduledGraphCatchup({ now: new Date("2026-07-18T12:05:00.000Z") });

    expect(recordCronHealthRunMock).toHaveBeenCalledWith(
      testDb,
      GRAPH_CATCHUP_CRON_ID,
      expect.objectContaining({
        success: true,
        warning: "graph_catchup_partial_errors:2",
      }),
    );
  });

  it("records skipped reason as warning on skipped summary", async () => {
    runGraphCatchupMock.mockResolvedValueOnce({
      ...defaultSummary,
      status: "skipped",
      reason: "nothing_to_project",
      projected: 0,
    });

    await runScheduledGraphCatchup({ now: new Date("2026-07-18T12:10:00.000Z") });

    expect(recordCronHealthRunMock).toHaveBeenCalledWith(
      testDb,
      GRAPH_CATCHUP_CRON_ID,
      expect.objectContaining({
        success: true,
        warning: "nothing_to_project",
      }),
    );
  });

  it("records failure warning on failed summary", async () => {
    runGraphCatchupMock.mockResolvedValueOnce({
      ...defaultSummary,
      status: "failed",
      reason: "neo4j_unreachable",
      projected: 0,
    });

    await runScheduledGraphCatchup({ now: new Date("2026-07-18T12:15:00.000Z") });

    expect(recordCronHealthRunMock).toHaveBeenCalledWith(
      testDb,
      GRAPH_CATCHUP_CRON_ID,
      expect.objectContaining({
        success: false,
        warning: "neo4j_unreachable",
      }),
    );
  });

  it("uses default failure message when failed summary has no reason", async () => {
    runGraphCatchupMock.mockResolvedValueOnce({
      ...defaultSummary,
      status: "failed",
      reason: undefined,
      projected: 0,
    });

    await runScheduledGraphCatchup({ now: new Date("2026-07-18T12:20:00.000Z") });

    expect(recordCronHealthRunMock).toHaveBeenCalledWith(
      testDb,
      GRAPH_CATCHUP_CRON_ID,
      expect.objectContaining({
        success: false,
        warning: "graph_catchup_failed",
      }),
    );
  });

  it("records cron failure and rethrows when runGraphCatchup rejects", async () => {
    runGraphCatchupMock.mockRejectedValueOnce(new Error("catchup_boom"));

    let caught: unknown;
    try {
      await runScheduledGraphCatchup({ now: new Date("2026-07-18T12:25:00.000Z") });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toContain("catchup_boom");

    expect(recordCronHealthRunMock).toHaveBeenCalledWith(testDb, GRAPH_CATCHUP_CRON_ID, {
      success: false,
      warning: "graph_catchup_error:catchup_boom",
      now: new Date("2026-07-18T12:25:00.000Z"),
    });
  });

  it("records non-Error rejections in cron health", async () => {
    runGraphCatchupMock.mockRejectedValueOnce("string failure");

    let caught: unknown;
    try {
      await runScheduledGraphCatchup();
    } catch (err) {
      caught = err;
    }
    expect(caught).toBe("string failure");

    expect(recordCronHealthRunMock).toHaveBeenCalledWith(
      testDb,
      GRAPH_CATCHUP_CRON_ID,
      expect.objectContaining({
        success: false,
        warning: "graph_catchup_error:string failure",
      }),
    );
  });

  it("startGraphCatchupScheduler is idempotent and fires on interval", async () => {
    vi.useFakeTimers();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    startGraphCatchupScheduler();
    const interval = globalThis._graphCatchupInterval;
    expect(interval).toBeDefined();
    expect(logSpy).toHaveBeenCalledWith(
      "[graph-catchup] scheduler started (interval: 30m)",
    );

    startGraphCatchupScheduler();
    expect(globalThis._graphCatchupInterval).toBe(interval);

    await vi.runOnlyPendingTimersAsync();
    expect(runGraphCatchupMock).toHaveBeenCalled();

    runGraphCatchupMock.mockClear();
    vi.advanceTimersByTime(GRAPH_CATCHUP_INTERVAL_MS);
    await vi.runOnlyPendingTimersAsync();
    expect(runGraphCatchupMock).toHaveBeenCalled();

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("logs info when neo4j is not configured at scheduler start", () => {
    isNeo4jConfiguredMock.mockReturnValue(false);
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    startGraphCatchupScheduler();

    expect(infoSpy).toHaveBeenCalledWith(
      "[graph-catchup] Neo4j not configured; scheduler idle until password is set",
    );

    infoSpy.mockRestore();
    logSpy.mockRestore();
  });

  it("logs tick failures without crashing the scheduler", async () => {
    vi.useFakeTimers();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    runGraphCatchupMock.mockRejectedValue(new Error("tick_boom"));

    startGraphCatchupScheduler();
    await vi.runOnlyPendingTimersAsync();
    expect(errorSpy).toHaveBeenCalledWith("[graph-catchup] initial tick failed", expect.any(Error));

    vi.advanceTimersByTime(GRAPH_CATCHUP_INTERVAL_MS);
    await vi.runOnlyPendingTimersAsync();
    expect(errorSpy).toHaveBeenCalledWith("[graph-catchup] tick failed", expect.any(Error));

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("stopGraphCatchupScheduler clears the interval", () => {
    vi.useFakeTimers();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    startGraphCatchupScheduler();
    expect(globalThis._graphCatchupInterval).toBeDefined();

    stopGraphCatchupScheduler();
    expect(globalThis._graphCatchupInterval).toBeUndefined();

    stopGraphCatchupScheduler();
    logSpy.mockRestore();
  });
});
