/**
 * SkillForge Edit Generator — Phase 87: Bounded SKILL.md Edit Generation
 * Generates constrained diffs with textual learning rate control.
 * Cannot mutate security policy, governance policy, AGENTS.md directives, or owner-protection.
 */

import { createHash } from "crypto";
import type {
  SkillForgeConfig,
  SkillForgeAnalysisResult,
  SkillForgeProposal,
  RejectedEdit,
  SkillForgeEditOperation,
} from "./types";

/** Forbidden sections that cannot be modified by the edit generator */
const FORBIDDEN_SECTIONS = [
  "security policy",
  "governance policy",
  "agents.md directives",
  "owner protection",
  "asimov laws",
  "immutability clause",
];

/** Check if a diff touches forbidden content */
function touchesForbidden(diff: string): boolean {
  const lower = diff.toLowerCase();
  return FORBIDDEN_SECTIONS.some((section) => lower.includes(section));
}

/** Compute max lines to change based on textual learning rate */
function maxEditLines(config: SkillForgeConfig): number {
  // 0.1 = 3 lines, 1.0 = 20 lines, linear interpolation
  return Math.round(3 + config.textualLearningRate * 17);
}

/** Count changed lines in a unified diff */
function countChangedLines(diff: string): number {
  return diff.split("\n").filter((line) =>
    (line.startsWith("+") && !line.startsWith("+++")) ||
    (line.startsWith("-") && !line.startsWith("---"))
  ).length;
}

function buildTypedEditOps(diff: string): SkillForgeEditOperation[] {
  return diff
    .split("\n")
    .filter((line) =>
      (line.startsWith("+") && !line.startsWith("+++")) ||
      (line.startsWith("-") && !line.startsWith("---"))
    )
    .map((line, index) => {
      const content = line.slice(1);
      return line.startsWith("+")
        ? { op: "add", path: `/skill-md/lines/${index}`, value: content }
        : { op: "delete", path: `/skill-md/lines/${index}`, oldValue: content };
    });
}

/** Generate a deterministic edit from analysis patterns */
function generateDeterministicEdit(
  analysis: SkillForgeAnalysisResult,
  config: SkillForgeConfig
): string | null {
  if (analysis.patterns.length === 0 && analysis.testCases.length === 0) {
    return null;
  }

  const maxLines = maxEditLines(config);
  const lines: string[] = [];

  // Header
  lines.push(`--- SKILL.md (skill ${analysis.skillId})`);
  lines.push(`+++ SKILL.md (proposed)`);
  lines.push(`@@ -1,5 +1,${5 + analysis.patterns.length} @@`);
  lines.push(` # Skill Optimization Proposal`);
  lines.push(` `);

  // Add identified patterns section
  for (const pattern of analysis.patterns.slice(0, 3)) {
    lines.push(`+## Pattern: ${pattern.pattern.slice(0, 40)}`);
    lines.push(`+Frequency: ${pattern.frequency}`);
    if (pattern.suggestedFix) {
      lines.push(`+Fix: ${pattern.suggestedFix}`);
    }
    lines.push(`+`);
  }

  // Add test cases section
  if (analysis.testCases.length > 0) {
    lines.push(`+## Generated Test Cases`);
    for (const tc of analysis.testCases.slice(0, 3)) {
      lines.push(`+- Input: ${tc.input.slice(0, 60)}`);
      lines.push(`+  Expected: ${tc.expectedOutput.slice(0, 60)}`);
    }
    lines.push(`+`);
  }

  lines.push(` ## Confidence`);
  lines.push(` ${(analysis.confidence * 100).toFixed(1)}%`);

  const diff = lines.join("\n");

  if (countChangedLines(diff) > maxLines) {
    return null; // Too aggressive — would exceed learning rate limit
  }

  return diff;
}

/** Check if an edit hash was recently rejected */
function isRecentlyRejected(
  editHash: string,
  rejectedEdits: RejectedEdit[]
): boolean {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  return rejectedEdits.some(
    (re) =>
      re.editHash === editHash && new Date(re.rejectedAt) > thirtyDaysAgo
  );
}

/**
 * Generate a proposal from analysis results with bounded edits.
 */
export function generateEditProposal(
  analysis: SkillForgeAnalysisResult,
  config: SkillForgeConfig,
  rejectedEdits: RejectedEdit[]
): SkillForgeProposal | null {
  const diff = generateDeterministicEdit(analysis, config);

  if (!diff) {
    return null; // Deterministic edit failed — defer to LLM in future phase
  }

  if (touchesForbidden(diff)) {
    return null; // Safety: cannot mutate forbidden sections
  }

  const editHash = createHash("sha256").update(diff).digest("hex").slice(0, 16);
  const typedEditOps = buildTypedEditOps(diff);

  if (isRecentlyRejected(editHash, rejectedEdits)) {
    return null; // Recently rejected — don't retry
  }

  const id = `sf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  return {
    id,
    sealProposalId: null,
    sourceSkillId: analysis.skillId,
    sourceVersion: "1.0.0",
    proposedDiff: diff,
    status: "pending",
    editHash,
    trainSplitId: null,
    validationResults: {
      triggerRoutingAccuracy: 0.5,
      contractCompleteness: 0.5,
      resolverReachability: 0.5,
      overallScore: 0.5,
    },
    heldOutResults: null,
    wDelta: null,
    typedEditOps,
    evaluatorReceipts: [],
    rejectedEdits: [],
    residualRisks: [
      "Edit magnitude bounded by textual learning rate",
      "Forbidden sections protected from mutation",
      `Max ${maxEditLines(config)} lines changed`,
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * Generate proposals from all analyses, respecting batch size.
 */
export function generateEditProposals(
  analyses: SkillForgeAnalysisResult[],
  config: SkillForgeConfig,
  rejectedEdits: RejectedEdit[]
): SkillForgeProposal[] {
  const proposals: SkillForgeProposal[] = [];

  for (const analysis of analyses.slice(0, config.batchSize)) {
    const proposal = generateEditProposal(analysis, config, rejectedEdits);
    if (proposal) {
      proposals.push(proposal);
    }
  }

  return proposals;
}
