/**
 * Wiki digest scheduler coverage (v8.14).
 */
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { initSchema } from "@/lib/db-schema";
import { listCronHealthJobs, updateCronJobStatus } from "@/lib/cron-health";

const { runWikiDigestMock, defaultSummary } = vi.hoisted(() => {
  const defaultSummary = {
    status: "completed" as const,
    dryRun: true,
    considered: 1,
    written: 1,
    skipped: 0,
    errors: 0,
    pages: ["memroos-digest/demo.md"],
    watermarkBefore: {
      lastCreatedAt: null as string | null,
      lastId: null as string | null,
      updatedAt: "2026-07-18T00:00:00.000Z",
      pagesWritten: 0,
    },
    watermarkAfter: {
      lastCreatedAt: "2026-07-18T00:00:00.000Z" as string | null,
      lastId: "m1" as string | null,
      updatedAt: "2026-07-18T00:00:00.000Z",
      pagesWritten: 1,
    },
    wikiRoot: "/tmp/wiki",
  };
  return {
    defaultSummary,
    runWikiDigestMock: vi.fn(async () => ({ ...defaultSummary })),
  };
});

vi.mock("@/lib/db", () => ({
  getDb: () => testDb,
  closeDb: () => {},
}));

vi.mock("@/lib/wiki-digest", async () => {
  const actual = await vi.importActual<typeof import("@/lib/wiki-digest")>("@/lib/wiki-digest");
  return {
    ...actual,
    runWikiDigest: runWikiDigestMock,
  };
});

import {
  runScheduledWikiDigest,
  startWikiDigestScheduler,
  stopWikiDigestScheduler,
  WIKI_DIGEST_CRON_ID,
} from "@/lib/wiki-digest-scheduler";

const testDb = new Database(":memory:");
initSchema(testDb);

beforeEach(() => {
  stopWikiDigestScheduler();
  testDb.exec("DELETE FROM cron_health_jobs");
  listCronHealthJobs(testDb);
  runWikiDigestMock.mockReset();
  runWikiDigestMock.mockResolvedValue({ ...defaultSummary });
});

afterEach(() => {
  stopWikiDigestScheduler();
});

describe("wiki-digest-scheduler", () => {
  it("skips when the cron job is paused", async () => {
    updateCronJobStatus(testDb, WIKI_DIGEST_CRON_ID, "paused");
    const result = await runScheduledWikiDigest({
      now: new Date("2026-07-18T12:00:00.000Z"),
    });
    expect(result).toEqual({ status: "skipped", reason: "cron_paused_or_stopped" });
  });

  it("records cron health on a successful scheduled digest", async () => {
    const result = await runScheduledWikiDigest({
      dryRun: true,
      now: new Date("2026-07-18T12:00:00.000Z"),
    });
    expect(result).toMatchObject({ status: "completed", written: 1 });
    const job = listCronHealthJobs(testDb).find((j) => j.id === WIKI_DIGEST_CRON_ID);
    expect(job?.lastRunAt).toBeTruthy();
    expect(job?.lastSuccessAt).toBeTruthy();
    expect(job?.metadata).toMatchObject({ status: "completed", written: 1, dry_run: true });
  });

  it("start/stop scheduler is idempotent", () => {
    startWikiDigestScheduler();
    startWikiDigestScheduler();
    expect(globalThis._wikiDigestInterval).toBeTruthy();
    stopWikiDigestScheduler();
    expect(globalThis._wikiDigestInterval).toBeUndefined();
    stopWikiDigestScheduler();
  });

  it("records warnings for failed, partial, and skipped digests", async () => {
    runWikiDigestMock.mockResolvedValueOnce({
      ...defaultSummary,
      status: "failed",
      dryRun: false,
      written: 0,
      errors: 1,
      pages: [],
      reason: "boom",
    });
    await runScheduledWikiDigest({ now: new Date("2026-07-18T12:00:00.000Z") });
    let job = listCronHealthJobs(testDb).find((j) => j.id === WIKI_DIGEST_CRON_ID);
    expect(job?.warning).toContain("boom");

    runWikiDigestMock.mockResolvedValueOnce({
      ...defaultSummary,
      status: "partial",
      dryRun: false,
      considered: 2,
      written: 1,
      errors: 1,
      pages: ["memroos-digest/a.md"],
    });
    await runScheduledWikiDigest({ now: new Date("2026-07-18T12:05:00.000Z") });
    job = listCronHealthJobs(testDb).find((j) => j.id === WIKI_DIGEST_CRON_ID);
    expect(job?.warning).toContain("wiki_digest_partial_errors:1");

    runWikiDigestMock.mockResolvedValueOnce({
      ...defaultSummary,
      status: "skipped",
      dryRun: false,
      considered: 0,
      written: 0,
      pages: [],
      reason: "nothing_new",
    });
    await runScheduledWikiDigest({ now: new Date("2026-07-18T12:10:00.000Z") });
    job = listCronHealthJobs(testDb).find((j) => j.id === WIKI_DIGEST_CRON_ID);
    expect(job?.warning).toBe("nothing_new");
  });

  it("records cron failure and rethrows when runWikiDigest rejects", async () => {
    runWikiDigestMock.mockImplementationOnce(async () => {
      throw new Error("scheduler_boom");
    });
    let caught: unknown;
    try {
      await runScheduledWikiDigest({ now: new Date("2026-07-18T12:00:00.000Z") });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toContain("scheduler_boom");
    const job = listCronHealthJobs(testDb).find((j) => j.id === WIKI_DIGEST_CRON_ID);
    expect(job?.warning).toContain("wiki_digest_error:scheduler_boom");
    expect(job?.lastFailureAt).toBeTruthy();
  });
});
