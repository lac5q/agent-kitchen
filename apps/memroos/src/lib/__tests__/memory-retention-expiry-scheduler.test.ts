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
import {
  RETENTION_EXPIRY_CRON_ID,
  runScheduledRetentionExpiry,
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
});
