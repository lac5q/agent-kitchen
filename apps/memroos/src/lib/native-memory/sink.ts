/**
 * Phase 127 / ENTOPS-07: operator-side native-memory ingest sink.
 *
 * Pipeline: directive_diff (alert, never delete) → filterNativeMemory →
 * computeDirectiveBudget (warn) → return sanitized replay payload.
 *
 * Does NOT write to harness memory files. Does NOT modify Claude/Hermes/Codex
 * internals. The caller (future harness hook) writes `replay` locally.
 */

import {
  computeDirectiveBudget,
  directiveDiff,
  loadDirectiveBudgetConfig,
  type DirectiveBudgetReport,
  type DirectiveDiff,
  DIRECTIVE_BUDGET_ENFORCEMENT,
} from "@/lib/directive-budget";
import { filterNativeMemory } from "@/lib/native-memory/filter";

export type NativeMemorySource = "claude" | "hermes" | "codex";

export interface NativeMemoryIngestInput {
  source: NativeMemorySource;
  agentId: string;
  userId: string;
  content: string;
  memoryPath: string;
  tenantId?: string;
  /** Optional canonical directive body for warn-only diff. */
  canonicalContent?: string;
}

export interface NativeMemoryIngestResult {
  replay: string;
  budgetStatus: DirectiveBudgetReport["status"];
  budget: DirectiveBudgetReport;
  diff: DirectiveDiff | null;
  filter: {
    redacted: boolean;
    matchCount: number;
    patternNames: string[];
  };
  alerts: string[];
  /** Structural: sink never deletes local memory content. */
  enforcement: typeof DIRECTIVE_BUDGET_ENFORCEMENT;
  source: NativeMemorySource;
  agentId: string;
  userId: string;
  memoryPath: string;
}

/**
 * Process a harness auto-memory write through filter + budget + diff.
 * Returns the sanitized replay body. Never mutates inputs. Never deletes.
 */
export function processNativeMemoryIngest(
  input: NativeMemoryIngestInput
): NativeMemoryIngestResult {
  const alerts: string[] = [];

  const canonical =
    typeof input.canonicalContent === "string" ? input.canonicalContent : undefined;
  const diff =
    canonical !== undefined ? directiveDiff(input.content, canonical) : null;

  if (diff && !diff.identical) {
    alerts.push(
      "directive_diff: local content differs from canonical (warn-only; nothing deleted)"
    );
  }
  // Structural guarantee: diff.warnOnly is always true from directiveDiff.
  if (diff && diff.warnOnly !== true) {
    throw new Error("directive_diff must be warn-only — refusing to proceed");
  }

  const filtered = filterNativeMemory(input.content);
  if (filtered.redacted) {
    alerts.push(
      `content_filter: redacted ${filtered.matches.filter((m) => m.severity === "HIGH").length} HIGH-severity match(es) from replay`
    );
  }

  const budgetConfig = loadDirectiveBudgetConfig(input.tenantId);
  const budgetReport = computeDirectiveBudget(
    filtered.sanitized,
    budgetConfig,
    canonical
  );

  if (budgetReport.status === "over" || budgetReport.status === "watch") {
    alerts.push(...budgetReport.recommendations);
  }

  return {
    replay: filtered.sanitized,
    budgetStatus: budgetReport.status,
    budget: budgetReport,
    diff: budgetReport.diff ?? diff,
    filter: {
      redacted: filtered.redacted,
      matchCount: filtered.matches.length,
      patternNames: filtered.matches.map((m) => m.patternName),
    },
    alerts,
    enforcement: DIRECTIVE_BUDGET_ENFORCEMENT,
    source: input.source,
    agentId: input.agentId,
    userId: input.userId,
    memoryPath: input.memoryPath,
  };
}

/** Structural marker for tests: sink has no delete/trim write path. */
export const NATIVE_MEMORY_SINK_POLICY = {
  neverDelete: true,
  neverAutoTrim: true,
  /**
   * Hermes: opt-in observe provider (MEMORY.md stays primary).
   * Claude/Codex: still not wired.
   */
  harnessWiring: "hermes_observe_opt_in" as const,
} as const;
