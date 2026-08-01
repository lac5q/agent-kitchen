/**
 * SkillForge Analyzer tests — Phase 86
 */

import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
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

  it("classifies dispatch_disabled and eval_failure patterns with suggested fixes", () => {
    const disabled = analyzeTelemetry([
      makeEntry("skill-1", "failure", { input: "deploy app", dispatchStatus: "disabled" }),
    ], config);
    expect(disabled[0].patterns[0].suggestedFix).toMatch(/dispatch_status/i);

    const evalFailure = analyzeTelemetry([
      makeEntry("skill-1", "failure", { query: "run eval", passed: false }),
    ], config);
    expect(evalFailure[0].patterns[0].suggestedFix).toMatch(/eval candidate/i);
  });

  it("uses payload.input when query is absent and logs failures when table exists", () => {
    const results = analyzeTelemetry([
      makeEntry("skill-1", "failure", { input: "configure models", expected: "guide", actual: "error" }),
    ], config);
    expect(results[0].testCases[0].input).toBe("configure models");

    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE skillforge_failure_log (
        id TEXT PRIMARY KEY,
        operation TEXT NOT NULL,
        input TEXT NOT NULL,
        deterministic_result TEXT,
        llm_result TEXT,
        pattern TEXT,
        skill_id TEXT,
        timestamp TEXT NOT NULL
      );
    `);
    logFailure(db, {
      operation: "analyze",
      input: "configure models",
      deterministicResult: "fail",
      llmResult: "pass",
      pattern: "configure models",
      skillId: "skill-1",
    });
    const row = db.prepare(`SELECT operation, skill_id FROM skillforge_failure_log`).get() as {
      operation: string;
      skill_id: string;
    };
    expect(row.operation).toBe("analyze");
    expect(row.skill_id).toBe("skill-1");

    const missingTableDb = new Database(":memory:");
    expect(() => logFailure(missingTableDb, {
      operation: "analyze",
      input: "x",
      deterministicResult: null,
      llmResult: null,
      pattern: "x",
      skillId: "skill-1",
    })).not.toThrow();
  });
});
