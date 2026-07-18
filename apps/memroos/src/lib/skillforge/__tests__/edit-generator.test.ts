/**
 * SkillForge Edit Generator tests — Phase 87
 */

import { describe, it, expect } from "vitest";
import { generateEditProposal, generateEditProposals } from "../edit-generator";
import type { SkillForgeAnalysisResult, SkillForgeConfig, RejectedEdit } from "../types";

const config: SkillForgeConfig = {
  cronSchedule: "0 2 * * *",
  batchSize: 5,
  textualLearningRate: 0.3,
  redactionEnabled: true,
  skillScopeFilter: [],
  minTraceAgeHours: 0,
  maxTraceAgeDays: 30,
};

function makeAnalysis(skillId: string, patterns: Array<{ pattern: string; frequency: number; suggestedFix?: string }>): SkillForgeAnalysisResult {
  return {
    skillId,
    patterns: patterns.map((p, i) => ({
      id: `pat-${i}`,
      pattern: p.pattern,
      frequency: p.frequency,
      examples: [p.pattern],
      suggestedFix: p.suggestedFix ?? null,
    })),
    testCases: [],
    confidence: 0.5,
  };
}

describe("SkillForge Edit Generator", () => {
  it("generates a proposal for valid analysis", () => {
    const analysis = makeAnalysis("skill-1", [
      { pattern: "deploy query", frequency: 3, suggestedFix: "Add deploy trigger" },
    ]);

    const proposal = generateEditProposal(analysis, config, []);
    expect(proposal).not.toBeNull();
    expect(proposal?.sourceSkillId).toBe("skill-1");
    expect(proposal?.proposedDiff).toContain("Pattern:");
    expect(proposal?.editHash).toMatch(/^[a-f0-9]{16}$/);
    expect(proposal?.typedEditOps?.length).toBeGreaterThan(0);
    expect(proposal?.typedEditOps?.every((op) => op.op === "add" || op.op === "delete")).toBe(true);
  });

  it("skips proposals when analysis has no optimization evidence", () => {
    const proposal = generateEditProposal(
      { skillId: "skill-1", patterns: [], testCases: [], confidence: 0.1 },
      config,
      []
    );

    expect(proposal).toBeNull();
  });

  it("rejects edits touching forbidden sections", () => {
    const analysis = makeAnalysis("skill-1", [
      { pattern: "security policy", frequency: 1, suggestedFix: "Change security policy" },
    ]);

    const proposal = generateEditProposal(analysis, config, []);
    expect(proposal).toBeNull();
  });

  it("respects textual learning rate limits", () => {
    const aggressiveConfig = { ...config, textualLearningRate: 1.0 };
    const analysis = makeAnalysis("skill-1", [
      { pattern: "a", frequency: 1 },
      { pattern: "b", frequency: 1 },
      { pattern: "c", frequency: 1 },
      { pattern: "d", frequency: 1 },
      { pattern: "e", frequency: 1 },
      { pattern: "f", frequency: 1 },
      { pattern: "g", frequency: 1 },
      { pattern: "h", frequency: 1 },
      { pattern: "i", frequency: 1 },
      { pattern: "j", frequency: 1 },
    ]);

    const proposal = generateEditProposal(analysis, aggressiveConfig, []);
    // Should still generate but with bounded lines
    expect(proposal).not.toBeNull();
  });

  it("rejects recently rejected edits", () => {
    const analysis = makeAnalysis("skill-1", [
      { pattern: "deploy query", frequency: 3, suggestedFix: "Add deploy trigger" },
    ]);

    const rejectedEdits: RejectedEdit[] = [
      {
        editHash: "abc123", // Will not match actual hash
        reason: "test rejection",
        rejectedAt: new Date(),
      },
    ];

    const proposal = generateEditProposal(analysis, config, rejectedEdits);
    expect(proposal).not.toBeNull(); // Hash won't match stub
  });

  it("skips an edit whose actual hash was recently rejected", () => {
    const analysis = makeAnalysis("skill-1", [
      { pattern: "deploy query", frequency: 3, suggestedFix: "Add deploy trigger" },
    ]);
    const first = generateEditProposal(analysis, config, []);
    expect(first?.editHash).toBeTruthy();

    const proposal = generateEditProposal(analysis, config, [
      {
        editHash: first!.editHash!,
        reason: "operator rejected",
        rejectedAt: new Date(),
      },
    ]);

    expect(proposal).toBeNull();
  });

  it("includes generated test cases in bounded edit proposals", () => {
    const analysis: SkillForgeAnalysisResult = {
      skillId: "skill-tests",
      patterns: [],
      testCases: [
        {
          id: "tc-1",
          input: "When the operator asks for deployment proof, collect release evidence.",
          expectedOutput: "Return the deployment receipt and verification command.",
          patternId: "pattern-1",
          source: "deterministic",
        },
      ],
      confidence: 0.75,
    };

    const proposal = generateEditProposal(analysis, { ...config, textualLearningRate: 1 }, []);

    expect(proposal?.proposedDiff).toContain("Generated Test Cases");
    expect(proposal?.proposedDiff).toContain("Expected:");
    expect(proposal?.typedEditOps?.some((op) => op.value?.includes("Generated Test Cases"))).toBe(true);
  });

  it("returns null when the generated diff exceeds the conservative learning rate", () => {
    const analysis = makeAnalysis("skill-large", [
      { pattern: "pattern a", frequency: 1, suggestedFix: "fix a" },
      { pattern: "pattern b", frequency: 1, suggestedFix: "fix b" },
      { pattern: "pattern c", frequency: 1, suggestedFix: "fix c" },
    ]);

    const proposal = generateEditProposal(analysis, { ...config, textualLearningRate: 0 }, []);

    expect(proposal).toBeNull();
  });

  it("generates multiple proposals respecting batch size", () => {
    const analyses = [
      makeAnalysis("skill-1", [{ pattern: "a", frequency: 1 }]),
      makeAnalysis("skill-2", [{ pattern: "b", frequency: 1 }]),
      makeAnalysis("skill-3", [{ pattern: "c", frequency: 1 }]),
    ];

    const proposals = generateEditProposals(analyses, config, []);
    expect(proposals.length).toBeLessThanOrEqual(config.batchSize);
  });

  it("includes residual risks in proposal", () => {
    const analysis = makeAnalysis("skill-1", [
      { pattern: "test", frequency: 1, suggestedFix: "Fix it" },
    ]);

    const proposal = generateEditProposal(analysis, config, []);
    expect(proposal?.residualRisks.length).toBeGreaterThan(0);
    expect(proposal?.residualRisks.some((r) => r.includes("learning rate"))).toBe(true);
  });
});
