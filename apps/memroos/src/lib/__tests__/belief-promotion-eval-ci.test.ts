// @vitest-environment node
//
// Phase 123: BELIEF-05 promotion eval CI canary (extends Phase 118).
//
// Mirrors memory-recall-canary-ci.test.ts: spins up an in-memory DB, runs
// runBeliefPromotionEvalSuite({ mode: 'gold' }), and asserts every committed
// invariant case passes. Runs with no external services and no LLM calls.
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";

import { initSchema } from "../db-schema";
import { runBeliefPromotionEvalSuite } from "../evals/belief-promotion-eval";

describe("BELIEF-05 promotion eval CI canary", () => {
  let db: Database.Database | undefined;

  afterEach(() => {
    db?.close();
    db = undefined;
  });

  it("runs the committed gold promotion cases against an in-memory db without external services", async () => {
    db = new Database(":memory:");
    initSchema(db);

    const run = await runBeliefPromotionEvalSuite({ mode: "gold", db });

    expect(run.mode).toBe("gold");
    expect(run.summary.totalCases).toBe(5);
    expect(run.summary.failedCases).toBe(0);
    expect(run.summary.passedCases).toBe(5);
    expect(run.cases.every((c) => c.pass)).toBe(true);
    expect(run.pass).toBe(true);

    // Sanity: every required invariant id is represented.
    const ids = run.cases.map((c) => c.name).sort();
    expect(ids).toEqual([
      "bronze_citation_only",
      "contradicted_gold_demotes_in_one_cycle",
      "high_stakes_blocked_until_review",
      "receipt_exposes_stage",
      "unsupported_silver_never_truth",
    ]);
  });
});
