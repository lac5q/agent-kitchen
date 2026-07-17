/**
 * SkillForge Local Judge tests — Phase 95
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
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

  it("scores with ollama when fetch succeeds", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        response: "score: 0.82\ngoal: 0.9\ndepth: 0.8\nspecificity: 0.75\nsafety: 0.95\ncorrectness: 0.88",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await scoreWithJudge(db, "skill", "input", {
      provider: "ollama",
      endpoint: "http://ollama.local",
      model: "llama3",
      fallbackToCloud: false,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://ollama.local/api/generate",
      expect.objectContaining({ method: "POST" })
    );
    expect(result.provider).toBe("ollama");
    expect(result.model).toBe("llama3");
    expect(result.score).toBeCloseTo(0.82, 2);
    expect(result.dimensions.goal).toBeCloseTo(0.9, 2);
    expect(result.dimensions.depth).toBeCloseTo(0.8, 2);
  });

  it("scores with vllm when fetch succeeds", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ text: "overall score: 0.71\ngoal: 0.7\ndepth: 0.65" }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await scoreWithJudge(db, "skill", "input", {
      provider: "vllm",
      endpoint: "http://vllm.local",
      model: "mistral",
      fallbackToCloud: false,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://vllm.local/v1/completions",
      expect.objectContaining({ method: "POST" })
    );
    expect(result.provider).toBe("vllm");
    expect(result.score).toBeCloseTo(0.71, 2);
    expect(result.dimensions.goal).toBeCloseTo(0.7, 2);
    expect(result.dimensions.specificity).toBe(0.5);
  });

  it("uses default score and dimensions when judge text omits explicit values", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ response: "looks acceptable overall" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await scoreWithJudge(db, "skill", "input", {
      provider: "ollama",
      endpoint: "http://ollama.local",
      model: "llama3",
      fallbackToCloud: false,
    });

    expect(result.score).toBe(0.5);
    expect(result.dimensions.goal).toBe(0.5);
  });

  it("throws on ollama failure when cloud fallback is disabled", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 503 }))
    );

    try {
      await scoreWithJudge(db, "skill", "input", {
        provider: "ollama",
        endpoint: "http://ollama.local",
        model: "llama3",
        fallbackToCloud: false,
      });
      expect.fail("expected ollama scoring to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain("Ollama error: 503");
    }
  });

  it("throws on vllm failure when cloud fallback is disabled", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 500 }))
    );

    try {
      await scoreWithJudge(db, "skill", "input", {
        provider: "vllm",
        endpoint: "http://vllm.local",
        model: "mistral",
        fallbackToCloud: false,
      });
      expect.fail("expected vllm scoring to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain("vLLM error: 500");
    }
  });

  it("detects drift between local ollama and cloud judges", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ response: "score: 0.99" }),
      })
    );

    const result = await detectJudgeDrift(
      db,
      {
        provider: "ollama",
        endpoint: "http://ollama.local",
        model: "llama3",
        fallbackToCloud: false,
      },
      2
    );

    expect(result.details).toHaveLength(2);
    expect(result.avgDrift).toBeGreaterThanOrEqual(0);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });
});
