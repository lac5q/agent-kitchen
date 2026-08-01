// @vitest-environment node
//
// Phase 123: BELIEF-05 promotion eval CI canary (extends Phase 118).
//
// Mirrors memory-recall-canary-ci.test.ts: spins up an in-memory DB, runs
// runBeliefPromotionEvalSuite({ mode: 'gold' }), and asserts every committed
// invariant case passes. Runs with no external services and no LLM calls.
import Database from "better-sqlite3";
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { initSchema } from "../db-schema";
import {
  loadBeliefPromotionEvalCases,
  runBeliefPromotionEvalSuite,
} from "../evals/belief-promotion-eval";
import * as promotion from "../belief/promotion";

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

  it("loadBeliefPromotionEvalCases reads the committed cases file", () => {
    const cases = loadBeliefPromotionEvalCases();
    expect(cases.length).toBeGreaterThanOrEqual(5);
    expect(cases.every((c) => typeof c.id === "string" && c.expectations)).toBe(true);
  });

  it("reports failure when no db is injected into the runner", async () => {
    const run = await runBeliefPromotionEvalSuite({ mode: "gold" });
    expect(run.pass).toBe(false);
    expect(run.cases.every((c) => c.reason === "no db provided to runner")).toBe(true);
  });

  it("full mode includes every case in the cases file", async () => {
    db = new Database(":memory:");
    initSchema(db);
    const allCases = loadBeliefPromotionEvalCases();
    const run = await runBeliefPromotionEvalSuite({ mode: "full", db });
    expect(run.mode).toBe("full");
    expect(run.summary.totalCases).toBe(allCases.length);
    expect(run.summary.failedCases).toBe(0);
    expect(run.pass).toBe(true);
  });

  it("loadBeliefPromotionEvalCases throws when cases file is not an array", () => {
    const badPath = path.join(os.tmpdir(), `belief-bad-cases-${Date.now()}.json`);
    fs.writeFileSync(badPath, JSON.stringify({ not: "an array" }), "utf8");
    expect(() => loadBeliefPromotionEvalCases(badPath)).toThrow(/must be a JSON array/);
    fs.unlinkSync(badPath);
  });

  it("runBeliefPromotionEvalSuite reports missing handlers for unknown case ids", async () => {
    db = new Database(":memory:");
    initSchema(db);
    const casesPath = path.join(os.tmpdir(), `belief-unknown-case-${Date.now()}.json`);
    fs.writeFileSync(
      casesPath,
      JSON.stringify([
        {
          id: "unknown_case_id_xyz",
          description: "no handler",
          expectations: {},
        },
      ]),
      "utf8"
    );
    const run = await runBeliefPromotionEvalSuite({ mode: "full", db, casesPath });
    expect(run.pass).toBe(false);
    expect(run.cases[0]?.reason).toMatch(/no handler registered/);
    fs.unlinkSync(casesPath);
  });

  it("loadBeliefPromotionEvalCases honors BELIEF_PROMOTION_EVAL_CASES_PATH", () => {
    const customPath = path.join(os.tmpdir(), `belief-custom-cases-${Date.now()}.json`);
    fs.writeFileSync(
      customPath,
      JSON.stringify([
        {
          id: "bronze_citation_only",
          description: "custom path case",
          expectations: { outboundReceiptAction: "dropped" },
        },
      ]),
      "utf8"
    );
    const prev = process.env.BELIEF_PROMOTION_EVAL_CASES_PATH;
    process.env.BELIEF_PROMOTION_EVAL_CASES_PATH = customPath;
    const cases = loadBeliefPromotionEvalCases();
    expect(cases).toHaveLength(1);
    expect(cases[0]?.id).toBe("bronze_citation_only");
    if (prev === undefined) delete process.env.BELIEF_PROMOTION_EVAL_CASES_PATH;
    else process.env.BELIEF_PROMOTION_EVAL_CASES_PATH = prev;
    fs.unlinkSync(customPath);
  });

  it("runBeliefPromotionEvalSuite honors a custom clock for startedAt", async () => {
    db = new Database(":memory:");
    initSchema(db);
    const fixed = new Date("2026-06-01T12:00:00.000Z");
    const run = await runBeliefPromotionEvalSuite({
      mode: "gold",
      db,
      clock: () => fixed,
    });
    expect(run.startedAt).toBe(fixed.toISOString());
  });

  it("gold mode filters out non-invariant case ids", async () => {
    db = new Database(":memory:");
    initSchema(db);
    const casesPath = path.join(os.tmpdir(), `belief-non-gold-${Date.now()}.json`);
    fs.writeFileSync(
      casesPath,
      JSON.stringify([
        { id: "bronze_citation_only", description: "gold", expectations: {} },
        { id: "custom_non_gold_case", description: "not gold", expectations: {} },
      ]),
      "utf8"
    );
    const run = await runBeliefPromotionEvalSuite({ mode: "gold", db, casesPath });
    expect(run.summary.totalCases).toBe(1);
    expect(run.cases[0]?.name).toBe("bronze_citation_only");
    fs.unlinkSync(casesPath);
  });

  it("runBeliefPromotionEvalSuite captures handler exceptions as failed cases", async () => {
    db = new Database(":memory:");
    initSchema(db);
    const promoteSpy = vi.spyOn(promotion, "promoteCandidate").mockImplementation(() => {
      throw new Error("handler_boom");
    });
    try {
      const run = await runBeliefPromotionEvalSuite({ mode: "gold", db });
      expect(run.pass).toBe(false);
      expect(run.cases.some((c) => c.reason === "handler_boom")).toBe(true);
    } finally {
      promoteSpy.mockRestore();
    }
  });
});
