/**
 * SkillForge Analyzer tests — Phase 86
 */

import Database from "better-sqlite3";
import { describe, it, expect } from "vitest";
import { analyzeTelemetry, logFailure } from "../analyzer";
import type { SkillForgeIntakeEntry, SkillForgeConfig } from "../types";

const config: SkillForgeConfig = {
  cronSchedule: "0 2 * * *",
  batchSize: 5,
  textualLearningRate: 0.3,
  redactionEnabled: true,
  skillScopeFilter: [],
  minTraceAgeHours: 0,
  maxTraceAgeDays: 30,
};

function makeEntry(skillId: string, traceType: SkillForgeIntakeEntry["traceType"], payload: Record<string, unknown>): SkillForgeIntakeEntry {
  return {
    id: `test-${Math.random().toString(36).slice(2)}`,
    skillId,
    skillName: skillId,
    traceType,
    payload,
    securityLabels: [{ visibility: "internal", policy: "indexable" }],
    timestamp: new Date(),
  };
}

describe("SkillForge Analyzer", () => {
  it("returns empty results for empty entries", () => {
    const results = analyzeTelemetry([], config);
    expect(results).toHaveLength(0);
  });

  it("identifies failure patterns from telemetry", () => {
    const entries = [
      makeEntry("skill-1", "failure", { query: "how to deploy", expected: "deploy guide", actual: "not found" }),
      makeEntry("skill-1", "failure", { query: "how to deploy", expected: "deploy guide", actual: "not found" }),
      makeEntry("skill-1", "failure", { query: "how to test", expected: "test guide", actual: "error" }),
    ];

    const results = analyzeTelemetry(entries, config);
    expect(results).toHaveLength(1);
    expect(results[0].skillId).toBe("skill-1");
    expect(results[0].patterns.length).toBeGreaterThan(0);
    expect(results[0].confidence).toBeGreaterThan(0.1);
  });

  it("groups patterns by normalized input", () => {
    const entries = [
      makeEntry("skill-1", "failure", { query: "HOW TO DEPLOY", expected: "a", actual: "b" }),
      makeEntry("skill-1", "failure", { query: "how to deploy", expected: "a", actual: "b" }),
    ];

    const results = analyzeTelemetry(entries, config);
    expect(results[0].patterns.length).toBe(1); // Same pattern after normalization
    expect(results[0].patterns[0].frequency).toBe(2);
  });

  it("generates test cases from failures", () => {
    const entries = [
      makeEntry("skill-1", "failure", { query: "test query", expected: "expected output", actual: "wrong" }),
    ];

    const results = analyzeTelemetry(entries, config);
    expect(results[0].testCases.length).toBeGreaterThan(0);
    expect(results[0].testCases[0].input).toBe("test query");
  });

  it("classifies contract_incomplete failures", () => {
    const entries = [
      makeEntry("skill-1", "telemetry", { dispatchStatus: "incomplete" }),
    ];

    const results = analyzeTelemetry(entries, config);
    // Telemetry entries without failures still produce analysis
    expect(results).toHaveLength(1);
  });

  it("sorts results by confidence descending", () => {
    const entries = [
      makeEntry("skill-a", "failure", { query: "q1", expected: "a", actual: "b" }),
      makeEntry("skill-a", "failure", { query: "q1", expected: "a", actual: "b" }),
      makeEntry("skill-b", "failure", { query: "q2", expected: "a", actual: "b" }),
    ];

    const results = analyzeTelemetry(entries, config);
    expect(results[0].confidence).toBeGreaterThanOrEqual(results[1]?.confidence ?? 0);
  });

  it("uses input and JSON payload fallbacks and caps generated tests per pattern", () => {
    const entries = [
      makeEntry("skill-1", "failure", { input: "  NEED   HELP  ", actual: "answer 1" }),
      makeEntry("skill-1", "failure", { input: "need help", actual: "answer 2" }),
      makeEntry("skill-1", "failure", { input: "need help", actual: "answer 3" }),
      makeEntry("skill-1", "failure", { input: "need help", actual: "answer 4" }),
      makeEntry("skill-1", "failure", { nested: { value: true }, actual: "json answer" }),
      makeEntry("skill-1", "failure", { query: "missing expected" }),
    ];

    const [result] = analyzeTelemetry(entries, config);
    expect(result.patterns.some((pattern) => pattern.pattern === "need help")).toBe(true);
    expect(result.patterns.some((pattern) => pattern.pattern.includes('"nested"'))).toBe(true);
    const needHelpTests = result.testCases.filter((test) => test.input.toLowerCase().includes("need help"));
    expect(needHelpTests.length).toBeGreaterThan(1);
    expect(needHelpTests.length).toBeLessThanOrEqual(3);
    expect(result.testCases.some((test) => test.input === "missing expected")).toBe(false);
  });

  it("suggests fixes for dispatch-disabled, eval, and unknown failures", () => {
    const results = analyzeTelemetry(
      [
        makeEntry("skill-disabled", "failure", { query: "disabled", dispatchStatus: "disabled" }),
        makeEntry("skill-eval", "failure", { query: "eval", passed: false, actual: "no" }),
        makeEntry("skill-unknown", "failure", { query: "unknown", actual: "no expected" }),
      ],
      config
    );

    const bySkill = new Map(results.map((result) => [result.skillId, result]));
    expect(bySkill.get("skill-disabled")?.patterns[0].suggestedFix).toMatch(/dispatch_status/);
    expect(bySkill.get("skill-eval")?.patterns[0].suggestedFix).toMatch(/eval candidate/);
    expect(bySkill.get("skill-unknown")?.patterns[0].suggestedFix).toMatch(/Review skill implementation/);
  });

  it("limits total generated tests to ten across patterns", () => {
    const entries = Array.from({ length: 12 }, (_, index) =>
      makeEntry("skill-many", "failure", {
        query: `query ${index}`,
        expected: `expected ${index}`,
        actual: `actual ${index}`,
      })
    );

    const [result] = analyzeTelemetry(entries, config);
    expect(result.testCases).toHaveLength(10);
  });

  it("logs failures when the replay table exists and skips when absent", () => {
    const db = new Database(":memory:");
    try {
      expect(() =>
        logFailure(db, {
          operation: "dispatch",
          input: "hello",
          deterministicResult: null,
          llmResult: "fallback",
          pattern: "hello",
          skillId: "skill-log",
        })
      ).not.toThrow();

      db.exec(`
        CREATE TABLE skillforge_failure_log (
          id TEXT PRIMARY KEY,
          operation TEXT,
          input TEXT,
          deterministic_result TEXT,
          llm_result TEXT,
          pattern TEXT,
          skill_id TEXT,
          timestamp TEXT
        );
      `);
      logFailure(db, {
        operation: "dispatch",
        input: "hello",
        deterministicResult: "det",
        llmResult: "fallback",
        pattern: "hello",
        skillId: "skill-log",
      });
      const row = db
        .prepare("SELECT operation, deterministic_result, llm_result FROM skillforge_failure_log")
        .get() as { operation: string; deterministic_result: string; llm_result: string };
      expect(row).toMatchObject({
        operation: "dispatch",
        deterministic_result: "det",
        llm_result: "fallback",
      });
    } finally {
      db.close();
    }
  });
});
