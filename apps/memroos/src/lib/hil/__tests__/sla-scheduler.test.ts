/**
 * Wave 0 RED scaffold for HIL-05.
 *
 * REQ: HIL-05 — A 60-second scheduler proactively acts on expired HIL tasks.
 *
 * These tests are RED until Plan 71-03 ships:
 *   - apps/memroos/src/lib/hil/sla-scheduler.ts (new file — SLA_POLL_INTERVAL_MS, startSlaScheduler, runSlaPoll)
 *
 * Import will fail (ModuleNotFoundError) until that file exists.
 */

// @vitest-environment node
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { initSchema } from "@/lib/db-schema";

// HIL-05: imports from file that does not exist yet — RED until Plan 71-03 implements it
import { SLA_POLL_INTERVAL_MS, startSlaScheduler, runSlaPoll, _resetSlaSchedulerForTest } from "@/lib/hil/sla-scheduler";

let testDb: Database.Database;

vi.mock("@/lib/db", () => ({
  getDb: () => testDb,
  closeDb: vi.fn(),
}));

function makeDb(): Database.Database {
  const db = new Database(":memory:");
  initSchema(db);
  return db;
}

beforeEach(() => {
  testDb = makeDb();
  vi.useFakeTimers();
});

afterEach(() => {
  _resetSlaSchedulerForTest();
  testDb.close();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("SLA scheduler constants (HIL-05)", () => {
  it("SLA_POLL_INTERVAL_MS equals 60000", () => {
    // REQ: HIL-05 — polls every 60 seconds
    expect(SLA_POLL_INTERVAL_MS).toBe(60_000);
  });
});

describe("startSlaScheduler (HIL-05)", () => {
  it("is exported as a function", () => {
    // REQ: HIL-05 — scheduler must be register-able from instrumentation.ts
    expect(typeof startSlaScheduler).toBe("function");
  });

  it("calls setInterval with SLA_POLL_INTERVAL_MS", () => {
    const setIntervalSpy = vi.spyOn(globalThis, "setInterval");
    startSlaScheduler();
    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), SLA_POLL_INTERVAL_MS);
  });

  it("does not start more than one scheduler interval", () => {
    const setIntervalSpy = vi.spyOn(globalThis, "setInterval");
    startSlaScheduler();
    startSlaScheduler();
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
  });
});

describe("runSlaPoll (HIL-05)", () => {
  it("does not throw when no expired escalations exist", () => {
    // REQ: HIL-05 — poll is safe with empty DB (T-71-11 mitigation)
    expect(() => runSlaPoll(testDb)).not.toThrow();
  });

  it("handles action engine errors without propagating them", async () => {
    // REQ: T-71-11 — runSlaPoll wraps runSlaActions in try/catch; exceptions must not escape
    // We'll test this by giving runSlaPoll a closed DB — it should catch and not throw.
    const closedDb = new Database(":memory:");
    initSchema(closedDb);
    closedDb.close();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    // runSlaPoll must catch the error internally
    expect(() => runSlaPoll(closedDb)).not.toThrow();
    expect(errorSpy).toHaveBeenCalledWith(
      "[sla-scheduler] Unhandled error during SLA poll:",
      expect.any(Error)
    );
  });
});
