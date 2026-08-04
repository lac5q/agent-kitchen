// @vitest-environment node
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";

import { initSchema } from "../db-schema";
import {
  loadMemoryRecallEvalCases,
  runMemoryRecallEvalSuite,
} from "../memory/recall-evals";

describe("memory recall CI canary", () => {
  let db: Database.Database | undefined;

  afterEach(() => {
    db?.close();
    db = undefined;
  });

  it("runs the committed gold recall set against recall thresholds without external services", async () => {
    const cases = loadMemoryRecallEvalCases();
    const goldCases = cases.filter((testCase) => testCase.layer === "gold");

    expect(goldCases.length).toBeGreaterThan(0);
    expect(goldCases.every((testCase) => testCase.expectedTiers.every((tier) => tier === "episodic"))).toBe(true);

    db = new Database(":memory:");
    initSchema(db);

    const run = await runMemoryRecallEvalSuite({ mode: "gold", db });

    expect(run.mode).toBe("gold");
    expect(run.status).toBe("passed");
    expect(run.summary).toMatchObject({
      totalCases: goldCases.length,
      failedCases: 0,
      passRate: 1,
    });
    expect(run.results).toHaveLength(goldCases.length);
    expect(run.results.every((result) => result.passed)).toBe(true);
    expect(run.results.flatMap((result) => result.failures)).toEqual([]);
  });
});
