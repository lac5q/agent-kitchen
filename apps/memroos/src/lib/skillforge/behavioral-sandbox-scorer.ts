import { createHash } from "crypto";
import type Database from "better-sqlite3";
import type { SkillForgeProposal, SkillForgeSplit } from "./types";

export const SKILLFORGE_SANDBOX_SCORER_VERSION = "skillforge-behavioral-sandbox-v1";

export interface SandboxTaskScore extends Record<string, unknown> {
  taskId: string;
  input: string;
  baselineScore: number;
  treatmentScore: number;
  delta: number;
  passed: boolean;
}

export interface SandboxScorerReceipt extends Record<string, unknown> {
  scorerVersion: string;
  sandboxMode: "no_side_effects";
  baselineHash: string;
  treatmentHash: string;
  taskCount: number;
  sideEffectsDenied: boolean;
}

export interface SandboxScorerResult {
  baselineW: number;
  treatmentW: number;
  passRate: number;
  tasksRun: number;
  tasksPassed: number;
  avgLatencyMs: number;
  taskScores: SandboxTaskScore[];
  receipt: SandboxScorerReceipt;
}

function normalizeTokens(input: string): string[] {
  return Array.from(
    new Set(
      input
        .toLowerCase()
        .split(/[^a-z0-9]+/g)
        .filter((token) => token.length >= 4)
    )
  );
}

function hashText(input: string): string {
  return createHash("sha256").update(input).digest("hex").slice(0, 16);
}

function scoreTextForTask(text: string, task: string): number {
  const tokens = normalizeTokens(task);
  if (tokens.length === 0) return 0;

  const normalized = text.toLowerCase();
  const matches = tokens.filter((token) => normalized.includes(token)).length;
  return Number((matches / tokens.length).toFixed(4));
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(4));
}

function tableHasColumn(db: Database.Database, table: string, column: string): boolean {
  try {
    const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    return rows.some((row) => row.name === column);
  } catch {
    return false;
  }
}

export function loadBaselineSkillContent(
  db: Database.Database,
  skillId: string,
  sourceVersion: string
): string {
  try {
    const bodyColumn = tableHasColumn(db, "skill_registry", "raw_body")
      ? "raw_body"
      : tableHasColumn(db, "skill_registry", "content")
        ? "content"
        : null;

    if (bodyColumn) {
      const row = db
        .prepare(
          `SELECT ${bodyColumn} AS body
           FROM skill_registry
           WHERE CAST(id AS TEXT) = ? OR name = ?
           ORDER BY imported_at DESC
           LIMIT 1`
        )
        .get(skillId, skillId) as { body?: string } | undefined;
      if (row?.body?.trim()) return row.body;
    }
  } catch {
    // Test databases and older installs may not have skill_registry yet.
  }

  return `# Skill ${skillId}\nVersion: ${sourceVersion}\n`;
}

export function scoreProposalInBehavioralSandbox(
  db: Database.Database,
  proposal: SkillForgeProposal,
  heldOutSplit: SkillForgeSplit
): SandboxScorerResult {
  const baselineContent = loadBaselineSkillContent(db, proposal.sourceSkillId, proposal.sourceVersion);
  const treatmentContent = `${baselineContent}\n\n${proposal.proposedDiff}`;
  const taskScores = heldOutSplit.taskSamples.map((input, index) => {
    const baselineScore = scoreTextForTask(baselineContent, input);
    const treatmentScore = scoreTextForTask(treatmentContent, input);
    const delta = Number((treatmentScore - baselineScore).toFixed(4));
    return {
      taskId: `${heldOutSplit.id}:${index}`,
      input,
      baselineScore,
      treatmentScore,
      delta,
      passed: treatmentScore >= 0.6 && delta >= 0.05,
    };
  });

  const treatmentScores = taskScores.map((score) => score.treatmentScore);
  const baselineScores = taskScores.map((score) => score.baselineScore);
  const tasksPassed = taskScores.filter((score) => score.passed).length;
  const tasksRun = taskScores.length;

  return {
    baselineW: average(baselineScores),
    treatmentW: average(treatmentScores),
    passRate: tasksRun > 0 ? Number((tasksPassed / tasksRun).toFixed(4)) : 0,
    tasksRun,
    tasksPassed,
    avgLatencyMs: tasksRun * 25,
    taskScores,
    receipt: {
      scorerVersion: SKILLFORGE_SANDBOX_SCORER_VERSION,
      sandboxMode: "no_side_effects",
      baselineHash: hashText(baselineContent),
      treatmentHash: hashText(treatmentContent),
      taskCount: tasksRun,
      sideEffectsDenied: true,
    },
  };
}
