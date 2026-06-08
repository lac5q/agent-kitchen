/**
 * SkillForge Behavioral Eval tests — Phase 94
 */

import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { runBehavioralABTest, generateGoldenSet, mannWhitneyU } from "../behavioral-eval";

function setupDb(): Database.Database {
  return new Database(":memory:");
}

describe("behavioral-eval", () => {
  it("runs A/B test and returns results", () => {
    const db = setupDb();
    const testCases = generateGoldenSet(db, "skill-1", "testing", 10);
    const result = runBehavioralABTest(db, "control", "treatment", testCases);

    expect(result.controlW).toBeGreaterThan(0);
    expect(result.treatmentW).toBeGreaterThan(0);
    expect(result.sampleSize).toBe(10);
    expect(typeof result.significant).toBe("boolean");
  });

  it("returns deterministic A/B scores for the same inputs", () => {
    const db = setupDb();
    const testCases = generateGoldenSet(db, "skill-1", "testing", 10);
    const first = runBehavioralABTest(db, "control", "treatment", testCases);
    const second = runBehavioralABTest(db, "control", "treatment", testCases);

    expect(second).toEqual(first);
  });

  it("generates golden set with correct structure", () => {
    const db = setupDb();
    const cases = generateGoldenSet(db, "skill-1", "testing", 9);

    expect(cases).toHaveLength(9);
    expect(cases[0].difficulty).toBe("easy");
    expect(cases[4].difficulty).toBe("medium");
    expect(cases[8].difficulty).toBe("hard");
  });

  it("computes Mann-Whitney U correctly", () => {
    const control = [1, 2, 3, 4, 5];
    const treatment = [3, 4, 5, 6, 7];
    const result = mannWhitneyU(control, treatment);

    expect(result.u).toBeGreaterThan(0);
    expect(result.pValue).toBeGreaterThan(0);
    expect(typeof result.significant).toBe("boolean");
  });
});
