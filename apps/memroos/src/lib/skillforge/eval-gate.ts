/**
 * SkillForge Eval Gating — Phase 88: Train/Validation/Held-Out Split Tracking
 * Runs deterministic validation and behavioral evals on proposals.
 * Gates proposals based on W delta and non-regression criteria.
 */

import type Database from "better-sqlite3";
import type {
  SkillForgeConfig,
  SkillForgeProposal,
  SkillForgeSplit,
  ValidationResult,
  HeldOutResult,
} from "./types";
import {
  SKILLFORGE_SANDBOX_SCORER_VERSION,
  scoreProposalInBehavioralSandbox,
} from "./behavioral-sandbox-scorer";

function stableHash(input: string): number {
  return input.split("").reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0);
}

function splitSampleCounts(total: number): { trainSize: number; valSize: number } {
  if (total <= 0) return { trainSize: 0, valSize: 0 };
  if (total === 1) return { trainSize: 1, valSize: 0 };
  if (total === 2) return { trainSize: 1, valSize: 1 };

  const valSize = Math.max(1, Math.floor(total * 0.2));
  const heldOutSize = Math.max(1, total - Math.floor(total * 0.8));
  const trainSize = Math.max(1, total - valSize - heldOutSize);
  return { trainSize, valSize };
}

/**
 * Create train/validation/held-out splits for a skill.
 * Returns split IDs and ensures disjoint task samples.
 */
export function createSplits(
  db: Database.Database,
  skillId: string,
  taskSamples: string[]
): { train: SkillForgeSplit; validation: SkillForgeSplit; heldOut: SkillForgeSplit } {
  // Shuffle deterministically by hashing
  const shuffled = [...taskSamples].sort((a, b) => stableHash(a) - stableHash(b));

  const { trainSize, valSize } = splitSampleCounts(shuffled.length);

  const trainSamples = shuffled.slice(0, trainSize);
  const valSamples = shuffled.slice(trainSize, trainSize + valSize);
  const heldSamples = shuffled.slice(trainSize + valSize);

  const now = new Date().toISOString();

  const train: SkillForgeSplit = {
    id: `split-${skillId}-train-${Date.now()}`,
    skillId,
    splitType: "train",
    taskSamples: trainSamples,
    createdAt: new Date(),
  };

  const validation: SkillForgeSplit = {
    id: `split-${skillId}-val-${Date.now()}`,
    skillId,
    splitType: "validation",
    taskSamples: valSamples,
    createdAt: new Date(),
  };

  const heldOut: SkillForgeSplit = {
    id: `split-${skillId}-held-${Date.now()}`,
    skillId,
    splitType: "held_out",
    taskSamples: heldSamples,
    createdAt: new Date(),
  };

  // Persist splits
  const insert = db.prepare(
    `INSERT INTO skillforge_splits (id, skill_id, split_type, task_samples, created_at)
     VALUES (?, ?, ?, ?, ?)`
  );

  for (const split of [train, validation, heldOut]) {
    try {
      insert.run(split.id, split.skillId, split.splitType, JSON.stringify(split.taskSamples), now);
    } catch {
      // Table may not exist
    }
  }

  return { train, validation, heldOut };
}

/**
 * Run deterministic validation scoring (no LLM calls, sub-100ms).
 * Scores: trigger routing accuracy, contract completeness, resolver reachability.
 */
export function runValidation(
  _db: Database.Database,
  proposal: SkillForgeProposal,
  _validationSplit: SkillForgeSplit
): ValidationResult {
  // Deterministic scoring based on diff quality metrics
  const diff = proposal.proposedDiff;
  const hasPatterns = diff.includes("## Pattern:");
  const hasTests = diff.includes("## Generated Test Cases");
  const hasFixes = diff.includes("Fix:");

  // Trigger routing: does the diff address trigger patterns?
  const triggerRoutingAccuracy = hasPatterns ? 0.7 + (hasFixes ? 0.2 : 0) : 0.3;

  // Contract completeness: does it include test cases?
  const contractCompleteness = hasTests ? 0.8 : 0.4;

  // Resolver reachability: are suggested fixes actionable?
  const resolverReachability = hasFixes ? 0.75 : 0.35;

  const overallScore = (triggerRoutingAccuracy + contractCompleteness + resolverReachability) / 3;

  return {
    triggerRoutingAccuracy: Math.min(triggerRoutingAccuracy, 1.0),
    contractCompleteness: Math.min(contractCompleteness, 1.0),
    resolverReachability: Math.min(resolverReachability, 1.0),
    overallScore: Math.min(overallScore, 1.0),
  };
}

export function runHeldOutEval(
  db: Database.Database,
  proposal: SkillForgeProposal,
  heldOutSplit: SkillForgeSplit
): HeldOutResult {
  const result = scoreProposalInBehavioralSandbox(db, proposal, heldOutSplit);

  return {
    passRate: result.passRate,
    tasksRun: result.tasksRun,
    tasksPassed: result.tasksPassed,
    avgLatencyMs: result.avgLatencyMs,
    behavioralW: result.treatmentW,
    baselineW: result.baselineW,
    treatmentW: result.treatmentW,
    scorerVersion: result.receipt.scorerVersion,
    sandboxReceipt: result.receipt,
    taskScores: result.taskScores,
  };
}

/**
 * Compute W delta from validation and held-out results.
 * Returns delta and gated status.
 */
export function computeWDelta(
  validation: ValidationResult,
  heldOut: HeldOutResult | null,
  baselineW: number
): { wDelta: number; gated: boolean; reason: string | null } {
  // Weighted composite: 60% validation, 40% held-out
  const validationW = validation.overallScore;
  const heldOutW = heldOut?.behavioralW ?? validationW;
  const compositeW = validationW * 0.6 + heldOutW * 0.4;

  const wDelta = compositeW - baselineW;

  if (heldOut && heldOut.tasksRun === 0) {
    return { wDelta, gated: true, reason: "No held-out tasks available; cannot validate proposal improvement" };
  }

  // Non-regression gate: must not decrease W
  if (wDelta < 0) {
    return { wDelta, gated: true, reason: `W delta negative (${wDelta.toFixed(3)}) — would regress performance` };
  }

  // Held-out gate: must maintain pass rate
  if (heldOut && heldOut.passRate < 0.5) {
    return { wDelta, gated: true, reason: `Held-out pass rate too low (${(heldOut.passRate * 100).toFixed(1)}%)` };
  }

  // Minimum improvement gate
  if (wDelta < 0.05) {
    return { wDelta, gated: true, reason: `W delta below improvement threshold (${wDelta.toFixed(3)} < 0.05)` };
  }

  return { wDelta, gated: false, reason: null };
}

/**
 * Run full eval gating on a proposal.
 * Updates proposal in-place with results and returns gating decision.
 */
export function runEvalGate(
  db: Database.Database,
  proposal: SkillForgeProposal,
  config: SkillForgeConfig,
  taskSamples: string[]
): { approved: boolean; reason: string | null } {
  // 1. Create splits
  const { train, validation, heldOut } = createSplits(db, proposal.sourceSkillId, taskSamples);
  proposal.trainSplitId = train.id;
  proposal.validationSplitId = validation.id;
  proposal.heldOutSplitId = heldOut.id;
  // 2. Run validation
  const validationResult = runValidation(db, proposal, validation);
  proposal.validationResults = validationResult;
  proposal.validationW = validationResult.overallScore;

  // 3. Run held-out eval
  const heldOutResult = runHeldOutEval(db, proposal, heldOut);
  const baselineW = heldOutResult.baselineW ?? proposal.heldOutResults?.behavioralW ?? proposal.validationResults?.overallScore ?? 0.5;
  proposal.baselineW = baselineW;
  proposal.heldOutResults = heldOutResult;
  proposal.heldOutW = heldOutResult.behavioralW;
  proposal.evaluatorReceipts = [
    ...(proposal.evaluatorReceipts ?? []),
    {
      evaluator: "skillforge-deterministic-validation",
      splitId: validation.id,
      w: validationResult.overallScore,
    },
    {
      evaluator: SKILLFORGE_SANDBOX_SCORER_VERSION,
      splitId: heldOut.id,
      tasksRun: heldOutResult.tasksRun,
      passRate: heldOutResult.passRate,
      baselineW,
      behavioralW: heldOutResult.behavioralW,
      scorerVersion: heldOutResult.scorerVersion,
      sandboxReceipt: heldOutResult.sandboxReceipt,
    },
  ];

  // 4. Compute W delta against the proposal's recorded baseline.
  const { wDelta, gated, reason } = computeWDelta(validationResult, heldOutResult, baselineW);
  proposal.wDelta = wDelta;

  // 5. Update status
  if (gated) {
    proposal.status = "gated";
    return { approved: false, reason };
  }

  // Passes gate — move to pending approval
  proposal.status = "pending_approval";
  return { approved: true, reason: null };
}
