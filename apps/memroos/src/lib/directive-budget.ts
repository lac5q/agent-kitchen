/**
 * Phase 126 / ENTOPS-06: Native-memory directive budgets.
 *
 * Per-tenant line budgets (default 200). Enforcement is warn +
 * diff-against-canonical only — NEVER auto-trim directive content.
 */

import fs from "fs";
import path from "path";

import { resolveFromRepoRoot } from "@/lib/paths";

export type DirectiveBudgetStatus = "ok" | "watch" | "over";

export interface DirectiveBudgetConfig {
  budgetLines: number;
  tenantId?: string;
}

export interface DirectiveDiffLine {
  lineNumber: number;
  content: string;
}

export interface DirectiveDiff {
  added: DirectiveDiffLine[];
  removed: DirectiveDiffLine[];
  changed: Array<{ lineNumber: number; local: string; canonical: string }>;
  identical: boolean;
  /** Always true — this API never mutates either input. */
  warnOnly: true;
}

export interface DirectiveBudgetReport {
  status: DirectiveBudgetStatus;
  lineCount: number;
  budgetLines: number;
  utilization: number;
  overByLines: number;
  recommendations: string[];
  /** Optional warn-only diff when canonical text is provided. Never mutates. */
  diff: DirectiveDiff | null;
}

const DEFAULT_BUDGET_LINES = 200;
const WATCH_UTILIZATION = 0.85;
const STORE_RELATIVE = "apps/memroos/data/directive-budgets.json";

type TenantBudgetStore = {
  tenants: Record<string, { budgetLines: number; updatedAt: string }>;
};

function countLines(text: string): number {
  if (text.length === 0) return 0;
  // Trailing newline does not add an extra empty line for budget purposes.
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const parts = normalized.split("\n");
  if (parts.length > 0 && parts[parts.length - 1] === "") {
    return parts.length - 1;
  }
  return parts.length;
}

function splitLines(text: string): string[] {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (normalized.length === 0) return [];
  const parts = normalized.split("\n");
  if (parts.length > 0 && parts[parts.length - 1] === "") {
    return parts.slice(0, -1);
  }
  return parts;
}

/**
 * Diff local vs canonical directive text. Warn-only: never mutates inputs
 * and never returns a trimmed/rewritten body.
 */
export function directiveDiff(local: string, canonical: string): DirectiveDiff {
  const localLines = splitLines(local);
  const canonicalLines = splitLines(canonical);
  const max = Math.max(localLines.length, canonicalLines.length);

  const added: DirectiveDiffLine[] = [];
  const removed: DirectiveDiffLine[] = [];
  const changed: Array<{ lineNumber: number; local: string; canonical: string }> = [];

  for (let i = 0; i < max; i++) {
    const lineNumber = i + 1;
    const left = localLines[i];
    const right = canonicalLines[i];
    if (left === undefined && right !== undefined) {
      removed.push({ lineNumber, content: right });
      continue;
    }
    if (right === undefined && left !== undefined) {
      added.push({ lineNumber, content: left });
      continue;
    }
    if (left !== right) {
      changed.push({ lineNumber, local: left ?? "", canonical: right ?? "" });
    }
  }

  return {
    added,
    removed,
    changed,
    identical: added.length === 0 && removed.length === 0 && changed.length === 0,
    warnOnly: true,
  };
}

export function loadDirectiveBudgetConfig(tenantId?: string): DirectiveBudgetConfig {
  const envRaw = process.env.MEMROOS_DIRECTIVE_BUDGET_LINES;
  const envParsed = envRaw ? Number(envRaw) : NaN;
  let budgetLines =
    Number.isFinite(envParsed) && envParsed > 0
      ? Math.round(envParsed)
      : DEFAULT_BUDGET_LINES;

  if (tenantId) {
    const override = readTenantOverride(tenantId);
    if (override !== null) budgetLines = override;
  }

  return { budgetLines, tenantId };
}

function storePath(): string {
  return resolveFromRepoRoot(STORE_RELATIVE);
}

function readStore(): TenantBudgetStore {
  const filename = storePath();
  if (!fs.existsSync(filename)) return { tenants: {} };
  try {
    const parsed = JSON.parse(fs.readFileSync(filename, "utf8")) as TenantBudgetStore;
    if (!parsed || typeof parsed !== "object" || !parsed.tenants) {
      return { tenants: {} };
    }
    return parsed;
  } catch {
    return { tenants: {} };
  }
}

function writeStore(store: TenantBudgetStore): void {
  const filename = storePath();
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, JSON.stringify(store, null, 2) + "\n", "utf8");
}

function readTenantOverride(tenantId: string): number | null {
  const entry = readStore().tenants[tenantId];
  if (!entry) return null;
  if (!Number.isFinite(entry.budgetLines) || entry.budgetLines <= 0) return null;
  return Math.round(entry.budgetLines);
}

/** Persist a per-tenant budget override (admin endpoint). */
export function setTenantDirectiveBudget(
  tenantId: string,
  budgetLines: number
): DirectiveBudgetConfig {
  if (!tenantId.trim()) {
    throw new Error("tenantId required");
  }
  if (!Number.isFinite(budgetLines) || budgetLines <= 0) {
    throw new Error("budgetLines must be a positive number");
  }
  const store = readStore();
  store.tenants[tenantId] = {
    budgetLines: Math.round(budgetLines),
    updatedAt: new Date().toISOString(),
  };
  writeStore(store);
  return { tenantId, budgetLines: Math.round(budgetLines) };
}

export function getTenantDirectiveBudget(tenantId: string): DirectiveBudgetConfig {
  return loadDirectiveBudgetConfig(tenantId);
}

/**
 * Compute budget status for a directive body.
 * NEVER trims, deletes, or rewrites directiveText.
 */
export function computeDirectiveBudget(
  directiveText: string,
  config: DirectiveBudgetConfig = loadDirectiveBudgetConfig(),
  canonicalText?: string
): DirectiveBudgetReport {
  const lineCount = countLines(directiveText);
  const budgetLines = config.budgetLines > 0 ? config.budgetLines : DEFAULT_BUDGET_LINES;
  const utilization = budgetLines > 0 ? lineCount / budgetLines : 0;
  const overByLines = Math.max(0, lineCount - budgetLines);

  const status: DirectiveBudgetStatus =
    utilization > 1 ? "over" : utilization >= WATCH_UTILIZATION ? "watch" : "ok";

  const recommendations: string[] = [];
  if (status === "over") {
    recommendations.push(
      `Directive exceeds budget (${lineCount}/${budgetLines} lines). Warn-only — content was not trimmed.`
    );
  } else if (status === "watch") {
    recommendations.push(
      `Directive is approaching budget (${lineCount}/${budgetLines} lines). Review before adding more lines.`
    );
  }

  const diff =
    typeof canonicalText === "string"
      ? directiveDiff(directiveText, canonicalText)
      : null;

  if (diff && !diff.identical) {
    recommendations.push(
      "Local directive differs from canonical — review the warn-only diff; nothing was auto-trimmed."
    );
  }

  return {
    status,
    lineCount,
    budgetLines,
    utilization,
    overByLines,
    recommendations,
    diff,
  };
}

/** Structural marker for tests: this module has no trim/delete write path. */
export const DIRECTIVE_BUDGET_ENFORCEMENT = "warn_only" as const;
