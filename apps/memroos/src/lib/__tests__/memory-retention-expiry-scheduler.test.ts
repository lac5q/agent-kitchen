// @vitest-environment node
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { initSchema } from "@/lib/db-schema";
import {
  isCronJobRunnable,
  listCronHealthJobs,
  recordCronHealthRun,
  updateCronJobStatus,
} from "@/lib/cron-health";
import { createRetentionPolicy, registerRetentionRecord } from "@/lib/memory/retention-policy";
import * as retentionExpiry from "@/lib/memory/retention-expiry";
import {
  RETENTION_EXPIRY_CRON_ID,
  RETENTION_EXPIRY_INTERVAL_MS,
  runScheduledRetentionExpiry,
  startRetentionExpiryScheduler,
  stopRetentionExpiryScheduler,
} from "@/lib/memory-retention-expiry-scheduler";

const testDb = new Database(":memory:");

vi.mock("@/lib/db", () => ({
  getDb: () => testDb,
  closeDb: () => {},
}));

initSchema(testDb);

afterEach(() => {
  stopRetentionExpiryScheduler();
  testDb.exec("DELETE FROM memory_retention_receipts");
  testDb.exec("DELETE FROM memory_retention_expiry_runs");
  testDb.exec("DELETE FROM memory_retention_records");
  testDb.exec("DELETE FROM memory_retention_policies");
  testDb.exec("DELETE FROM memory_legal_holds");
  testDb.exec("DELETE FROM cron_health_jobs");
});

describe("MEMLIFE-01 scheduled retention expiry", () => {
  beforeEach(() => {
    listCronHealthJobs(testDb); // seed defaults including memory-retention-expiry
  });

  it("registers memory-retention-expiry in the cron health registry", () => {
    const jobs = listCronHealthJobs(testDb);
    expect(jobs.some((job) => job.id === RETENTION_EXPIRY_CRON_ID)).toBe(true);
  });

  it("runs runRetentionExpiry with receipts and heartbeats cron health", () => {
    createRetentionPolicy(testDb, {
      id: "pol-sched",
      tenantId: "default-tenant",
      name: "sched",
      ontologyType: "memory.note",
      securityLabel: { visibility: "internal", sensitivity: "pii" },
      purpose: "recall",
      scope: { tenantId: "default-tenant", project: "alpha" },
      priority: 5,
      durationDays: 1,
      action: "expire",
      actorId: "system",
      now: new Date("2020-01-01T00:00:00.000Z"),
    });
    registerRetentionRecord(testDb, {
      tenantId: "default-tenant",
      recordType: "message",
      recordId: "sched-msg-1",
      ontologyType: "memory.note",
      securityLabel: { visibility: "internal", sensitivity: "pii" },
      purpose: "recall",
      createdAt: "2020-01-01T00:00:00.000Z",
      contentHash: "hash-sched-1",
      scope: { tenantId: "default-tenant", project: "alpha" },
      actorId: "system",
      now: new Date("2020-01-01T00:00:00.000Z"),
    });

    const summary = runScheduledRetentionExpiry({
      now: new Date("2026-07-16T12:00:00.000Z"),
      runKey: "retention:test:sched-1",
    });

    expect(summary).toMatchObject({ status: "completed", expired: 1 });
    if (!("expired" in summary)) throw new Error("expected full summary");
    expect(summary.receipts.length).toBeGreaterThan(0);

    const job = listCronHealthJobs(testDb).find((j) => j.id === RETENTION_EXPIRY_CRON_ID);
    expect(job?.lastRunAt).toBeTruthy();
    expect(job?.lastSuccessAt).toBeTruthy();
    expect(job?.warning).toBeNull();
  });

  it("skips work when cron job is paused", () => {
    updateCronJobStatus(testDb, RETENTION_EXPIRY_CRON_ID, "paused");
    expect(isCronJobRunnable(testDb, RETENTION_EXPIRY_CRON_ID)).toBe(false);
    const result = runScheduledRetentionExpiry({
      now: new Date("2026-07-16T12:00:00.000Z"),
      runKey: "retention:test:paused",
    });
    expect(result).toEqual({ status: "skipped", reason: "cron_paused_or_stopped" });
  });

  it("recordCronHealthRun preserves pause state", () => {
    updateCronJobStatus(testDb, RETENTION_EXPIRY_CRON_ID, "paused");
    const heartbeated = recordCronHealthRun(testDb, RETENTION_EXPIRY_CRON_ID, {
      success: true,
      itemsProcessed: 3,
      now: new Date("2026-07-16T12:00:00.000Z"),
    });
    expect(heartbeated?.status).toBe("paused");
    expect(heartbeated?.itemsProcessed).toBe(3);
    expect(heartbeated?.lastRunAt).toBe("2026-07-16T12:00:00.000Z");
  });

  it("records partial-failure and failed warnings from retention summary", () => {
    const partialSpy = vi.spyOn(retentionExpiry, "runRetentionExpiry").mockReturnValue({
      runKey: "retention:test:partial",
      tenantId: "default-tenant",
      status: "completed",
      considered: 2,
      expired: 1,
      held: 0,
      failed: 1,
      receipts: [],
    });
    runScheduledRetentionExpiry({
      now: new Date("2026-07-16T12:00:00.000Z"),
      runKey: "retention:test:partial",
    });
    let job = listCronHealthJobs(testDb).find((j) => j.id === RETENTION_EXPIRY_CRON_ID);
    expect(job?.warning).toBe("retention_expiry_partial_failures:1");
    partialSpy.mockRestore();

    const failedSpy = vi.spyOn(retentionExpiry, "runRetentionExpiry").mockReturnValue({
      runKey: "retention:test:failed",
      tenantId: "default-tenant",
      status: "failed",
      considered: 1,
      expired: 0,
      held: 0,
      failed: 1,
      receipts: [],
    });
    runScheduledRetentionExpiry({
      now: new Date("2026-07-16T13:00:00.000Z"),
      runKey: "retention:test:failed",
    });
    job = listCronHealthJobs(testDb).find((j) => j.id === RETENTION_EXPIRY_CRON_ID);
    expect(job?.warning).toBe("retention_expiry_failed");
    failedSpy.mockRestore();
  });

  it("heartbeats lease-held runs as successful", () => {
    const leaseSpy = vi.spyOn(retentionExpiry, "runRetentionExpiry").mockReturnValue({
      runKey: "retention:test:lease",
      tenantId: "default-tenant",
      status: "lease_held",
      considered: 0,
      expired: 0,
      held: 0,
      failed: 0,
      receipts: [],
    });
    runScheduledRetentionExpiry({
      now: new Date("2026-07-16T14:00:00.000Z"),
      runKey: "retention:test:lease",
    });
    const job = listCronHealthJobs(testDb).find((j) => j.id === RETENTION_EXPIRY_CRON_ID);
    expect(job?.lastSuccessAt).toBe("2026-07-16T14:00:00.000Z");
    expect(job?.warning).toBeNull();
    leaseSpy.mockRestore();
  });

  it("records cron health failure when runRetentionExpiry throws", () => {
    const errorSpy = vi.spyOn(retentionExpiry, "runRetentionExpiry").mockImplementation(() => {
      throw new Error("boom");
    });
    expect(() =>
      runScheduledRetentionExpiry({
        now: new Date("2026-07-16T15:00:00.000Z"),
        runKey: "retention:test:error",
      })
    ).toThrow("boom");
    const job = listCronHealthJobs(testDb).find((j) => j.id === RETENTION_EXPIRY_CRON_ID);
    expect(job?.warning).toBe("retention_expiry_error:boom");
    errorSpy.mockRestore();
  });

  it("startRetentionExpiryScheduler is idempotent and stop clears the interval", () => {
    vi.useFakeTimers();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    startRetentionExpiryScheduler();
    const interval = globalThis._retentionExpiryInterval;
    expect(interval).toBeDefined();
    expect(logSpy).toHaveBeenCalledWith(
      "[retention-expiry] scheduler started (interval: 60m)"
    );

    startRetentionExpiryScheduler();
    expect(globalThis._retentionExpiryInterval).toBe(interval);

    vi.advanceTimersByTime(RETENTION_EXPIRY_INTERVAL_MS);
    stopRetentionExpiryScheduler();
    expect(globalThis._retentionExpiryInterval).toBeUndefined();

    logSpy.mockRestore();
    errorSpy.mockRestore();
    vi.useRealTimers();
  });
});
