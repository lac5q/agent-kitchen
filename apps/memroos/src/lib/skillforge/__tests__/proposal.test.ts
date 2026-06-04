// @vitest-environment node
import Database from "better-sqlite3";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { initSchema } from "@/lib/db-schema";
import { generateProposals, persistProposals, buildSealPayload } from "../proposal";
import { DEFAULT_SKILLFORGE_CONFIG } from "../types";

let db: Database.Database;

beforeEach(() => {
  db = new Database(":memory:");
  initSchema(db);
});

afterEach(() => {
  db.close();
});

describe("SkillForge Proposal Generation", () => {
  it("generates proposals from analysis results", () => {
    const analyses = [
      {
        skillId: "skill-1",
        patterns: [
          {
            id: "pat-1",
            pattern: "test query",
            frequency: 3,
            examples: ["ex1"],
            suggestedFix: "improve trigger",
          },
        ],
        testCases: [],
        confidence: 0.5,
      },
    ];

    const proposals = generateProposals(analyses, DEFAULT_SKILLFORGE_CONFIG);
    expect(proposals).toHaveLength(1);
    expect(proposals[0].sourceSkillId).toBe("skill-1");
    expect(proposals[0].status).toBe("pending");
    expect(proposals[0].proposedDiff).toContain("improve trigger");
  });

  it("respects batch size", () => {
    const analyses = Array.from({ length: 10 }, (_, i) => ({
      skillId: `skill-${i}`,
      patterns: [],
      testCases: [],
      confidence: 0.1,
    }));

    const config = { ...DEFAULT_SKILLFORGE_CONFIG, batchSize: 3 };
    const proposals = generateProposals(analyses, config);
    expect(proposals).toHaveLength(3);
  });

  it("persists proposals to database", () => {
    const analyses = [
      {
        skillId: "skill-1",
        patterns: [],
        testCases: [],
        confidence: 0.1,
      },
    ];

    const proposals = generateProposals(analyses, DEFAULT_SKILLFORGE_CONFIG);
    persistProposals(db, proposals);

    const row = db
      .prepare(
        `SELECT id, status, edit_hash, validation_split_id, held_out_split_id,
                baseline_w, validation_w, held_out_w, evaluator_receipts, typed_edit_ops
         FROM skillforge_proposals WHERE source_skill_id = ?`
      )
      .get("skill-1") as { id: string; status: string } | undefined;

    expect(row).toBeTruthy();
    expect(row?.status).toBe("pending");
    expect(row).toMatchObject({
      validation_split_id: null,
      held_out_split_id: null,
      baseline_w: null,
      validation_w: 0.5,
      held_out_w: null,
      evaluator_receipts: "[]",
      typed_edit_ops: "[]",
    });
    expect((row as { edit_hash?: string }).edit_hash).toMatch(/^[a-f0-9]{16}$/);
  });

  it("builds SEAL payload correctly", () => {
    const proposal = {
      id: "sf-1",
      sealProposalId: null,
      sourceSkillId: "skill-1",
      sourceVersion: "1.0.0",
      proposedDiff: "test diff",
      status: "pending" as const,
      trainSplitId: null,
      validationResults: {
        triggerRoutingAccuracy: 0.8,
        contractCompleteness: 0.7,
        resolverReachability: 0.9,
        overallScore: 0.8,
      },
      heldOutResults: null,
      wDelta: null,
      rejectedEdits: [],
      residualRisks: ["risk-1"],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const payload = buildSealPayload(proposal);
    expect(payload.sourceSkillId).toBe("skill-1");
    expect(payload.proposedDiff).toBe("test diff");
    expect(payload.residualRisks).toContain("risk-1");
  });
});
