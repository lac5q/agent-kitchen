// @vitest-environment node
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

import {
  loadBaselineSkillContent,
  scoreProposalInBehavioralSandbox,
  SKILLFORGE_SANDBOX_SCORER_VERSION,
} from "../behavioral-sandbox-scorer";
import type { SkillForgeProposal, SkillForgeSplit } from "../types";

function makeProposal(diff: string): SkillForgeProposal {
  return {
    id: "sf-prop-1",
    sealProposalId: null,
    sourceSkillId: "skill-alpha",
    sourceVersion: "1.0.0",
    proposedDiff: diff,
    status: "pending",
    trainSplitId: null,
    validationResults: null,
    heldOutResults: null,
    wDelta: null,
    rejectedEdits: [],
    residualRisks: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeSplit(samples: string[]): SkillForgeSplit {
  return {
    id: "split-held",
    skillId: "skill-alpha",
    splitType: "held_out",
    taskSamples: samples,
    createdAt: new Date(),
  };
}

describe("behavioral sandbox scorer", () => {
  it("falls back to a synthetic baseline when skill_registry is absent", () => {
    const db = new Database(":memory:");
    const body = loadBaselineSkillContent(db, "missing-skill", "2.0.0");
    expect(body).toContain("missing-skill");
    expect(body).toContain("2.0.0");
    db.close();
  });

  it("reads raw_body from skill_registry when present", () => {
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE skill_registry (
        id INTEGER PRIMARY KEY,
        name TEXT,
        raw_body TEXT,
        imported_at TEXT
      );
      INSERT INTO skill_registry(name, raw_body, imported_at)
      VALUES ('skill-alpha', 'baseline guidance for alpha workflows', datetime('now'));
    `);
    expect(loadBaselineSkillContent(db, "skill-alpha", "1.0.0")).toContain("baseline guidance");
    db.close();
  });

  it("scores treatment improvements against held-out task samples", () => {
    const db = new Database(":memory:");
    const proposal = makeProposal("Always mention alpha trigger routing in responses.");
    const result = scoreProposalInBehavioralSandbox(
      db,
      proposal,
      makeSplit(["alpha trigger routing case", "unrelated topic"]),
    );

    expect(result.tasksRun).toBe(2);
    expect(result.receipt.scorerVersion).toBe(SKILLFORGE_SANDBOX_SCORER_VERSION);
    expect(result.receipt.sideEffectsDenied).toBe(true);
    expect(result.treatmentW).toBeGreaterThanOrEqual(result.baselineW);
    expect(result.taskScores[0].passed).toBe(true);
    db.close();
  });

  it("returns zero pass rate when no task samples are provided", () => {
    const db = new Database(":memory:");
    const result = scoreProposalInBehavioralSandbox(db, makeProposal("diff"), makeSplit([]));
    expect(result.tasksRun).toBe(0);
    expect(result.passRate).toBe(0);
    db.close();
  });
});
