/**
 * SkillForge Local Judge tests — Phase 95
 */

import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { scoreWithJudge, detectJudgeDrift } from "../local-judge";

function setupDb(): Database.Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE eval_candidates (id INTEGER PRIMARY KEY, input_text TEXT NOT NULL);
    INSERT INTO eval_candidates (input_text) VALUES ('test input 1'), ('test input 2'), ('test input 3');
  `);
  return db;
}

describe("local-judge", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = setupDb();
  });

  it("scores with cloud judge", async () => {
    const result = await scoreWithJudge(db, "skill content", "test input", {
      provider: "cloud",
      endpoint: "",
      model: "gpt-4",
      fallbackToCloud: true,
    });

    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThanOrEqual(1);
    expect(Object.keys(result.dimensions)).toHaveLength(5);
    expect(result.provider).toBe("cloud");
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("scores cloud fallback deterministically for the same inputs", async () => {
    const config = {
      provider: "cloud" as const,
      endpoint: "",
      model: "gpt-4",
      fallbackToCloud: true,
    };
    const first = await scoreWithJudge(db, "skill content", "test input", config);
    const second = await scoreWithJudge(db, "skill content", "test input", config);

    expect(second.score).toBe(first.score);
    expect(second.dimensions).toEqual(first.dimensions);
  });

  it("falls back to cloud on ollama failure", async () => {
    const result = await scoreWithJudge(db, "skill", "input", {
      provider: "ollama",
      endpoint: "http://localhost:99999",
      model: "llama2",
      fallbackToCloud: true,
      cloudModel: "gpt-4",
    });

    expect(result.provider).toBe("cloud");
    expect(result.score).toBeGreaterThan(0);
  });

  it("detects judge drift", async () => {
    const result = await detectJudgeDrift(db, {
      provider: "cloud",
      endpoint: "",
      model: "gpt-4",
      fallbackToCloud: true,
    }, 3);

    expect(typeof result.driftDetected).toBe("boolean");
    expect(typeof result.avgDrift).toBe("number");
    expect(result.details).toHaveLength(3);
  });
});
