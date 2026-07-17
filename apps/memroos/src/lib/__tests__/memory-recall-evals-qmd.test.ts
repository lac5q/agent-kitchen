// @vitest-environment node
import Database from "better-sqlite3";
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("child_process", () => ({
  execFileSync: vi.fn(() => ""),
}));

import { initSchema } from "@/lib/db-schema";
import { ensureMemoryEvalTables, runMemoryRecallEvalSuite } from "@/lib/memory-recall-evals";

describe("memory recall eval qmd tier", () => {
  let db: Database.Database;
  const originalCasesPath = process.env.MEMORY_RECALL_EVAL_CASES_PATH;

  beforeEach(() => {
    db = new Database(":memory:");
    initSchema(db);
    ensureMemoryEvalTables(db);
  });

  afterEach(() => {
    db.close();
    if (originalCasesPath === undefined) {
      delete process.env.MEMORY_RECALL_EVAL_CASES_PATH;
    } else {
      process.env.MEMORY_RECALL_EVAL_CASES_PATH = originalCasesPath;
    }
  });

  it("records qmd tier availability when the qmd binary is present", async () => {
    const casesPath = path.join(os.tmpdir(), `memory-recall-qmd-${Date.now()}.json`);
    fs.writeFileSync(casesPath, JSON.stringify([{
      id: "qmd-case",
      layer: "gold",
      scenario: "qmd availability",
      agentId: "codex",
      taskPrompt: "Recall billing context.",
      expectedFacts: ["billing sync decision"],
      expectedTiers: ["qmd"],
      requiredTiming: "before_plan",
    }]));
    process.env.MEMORY_RECALL_EVAL_CASES_PATH = casesPath;

    const run = await runMemoryRecallEvalSuite({ mode: "gold", db });
    expect(run.results[0]?.tiers).toEqual(expect.arrayContaining([
      expect.objectContaining({ tier: "qmd", ok: true, count: 1 }),
    ]));

    fs.rmSync(casesPath, { force: true });
  });
});
