import fs from "fs";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";

import {
  DIRECTIVE_BUDGET_ENFORCEMENT,
  computeDirectiveBudget,
  directiveDiff,
  loadDirectiveBudgetConfig,
  setTenantDirectiveBudget,
} from "@/lib/directive-budget";
import { resolveFromRepoRoot } from "@/lib/paths";

const STORE = resolveFromRepoRoot("apps/memroos/data/directive-budgets.json");

afterEach(() => {
  delete process.env.MEMROOS_DIRECTIVE_BUDGET_LINES;
  if (fs.existsSync(STORE)) {
    try {
      fs.unlinkSync(STORE);
    } catch {
      // ignore
    }
  }
});

describe("directiveDiff", () => {
  it("returns warn-only diff and never mutates inputs", () => {
    const local = "line a\nline b\nextra\n";
    const canonical = "line a\nline B\n";
    const localCopy = local;
    const canonicalCopy = canonical;

    const diff = directiveDiff(local, canonical);

    expect(diff.warnOnly).toBe(true);
    expect(diff.identical).toBe(false);
    expect(diff.changed).toEqual([
      { lineNumber: 2, local: "line b", canonical: "line B" },
    ]);
    expect(diff.added).toEqual([{ lineNumber: 3, content: "extra" }]);
    expect(local).toBe(localCopy);
    expect(canonical).toBe(canonicalCopy);
  });

  it("marks identical texts as identical", () => {
    const text = "one\ntwo\n";
    const diff = directiveDiff(text, text);
    expect(diff.identical).toBe(true);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
    expect(diff.changed).toEqual([]);
  });
});

describe("computeDirectiveBudget", () => {
  it("flags over-budget directives with status over", () => {
    const body = Array.from({ length: 250 }, (_, i) => `line-${i}`).join("\n");
    const report = computeDirectiveBudget(body, { budgetLines: 200 });

    expect(report.status).toBe("over");
    expect(report.lineCount).toBe(250);
    expect(report.budgetLines).toBe(200);
    expect(report.overByLines).toBe(50);
    expect(report.utilization).toBeGreaterThan(1);
    expect(report.recommendations.some((r) => /not trimmed/i.test(r))).toBe(true);
  });

  it("returns watch near the budget threshold", () => {
    const body = Array.from({ length: 180 }, (_, i) => `line-${i}`).join("\n");
    const report = computeDirectiveBudget(body, { budgetLines: 200 });
    expect(report.status).toBe("watch");
  });

  it("returns ok under watch threshold", () => {
    const body = Array.from({ length: 50 }, (_, i) => `line-${i}`).join("\n");
    const report = computeDirectiveBudget(body, { budgetLines: 200 });
    expect(report.status).toBe("ok");
  });

  it("includes warn-only canonical diff without rewriting the body", () => {
    const local = "a\nb\nc\n";
    const canonical = "a\nB\n";
    const report = computeDirectiveBudget(local, { budgetLines: 200 }, canonical);
    expect(report.diff?.warnOnly).toBe(true);
    expect(report.diff?.identical).toBe(false);
    expect(local).toBe("a\nb\nc\n");
  });
});

describe("loadDirectiveBudgetConfig / tenant override", () => {
  it("defaults to 200 lines", () => {
    expect(loadDirectiveBudgetConfig().budgetLines).toBe(200);
  });

  it("honors MEMROOS_DIRECTIVE_BUDGET_LINES", () => {
    process.env.MEMROOS_DIRECTIVE_BUDGET_LINES = "150";
    expect(loadDirectiveBudgetConfig().budgetLines).toBe(150);
  });

  it("persists per-tenant override", () => {
    setTenantDirectiveBudget("acme", 320);
    expect(loadDirectiveBudgetConfig("acme").budgetLines).toBe(320);
    expect(fs.existsSync(STORE)).toBe(true);
    const raw = JSON.parse(fs.readFileSync(STORE, "utf8")) as {
      tenants: Record<string, { budgetLines: number }>;
    };
    expect(raw.tenants.acme.budgetLines).toBe(320);
  });
});

describe("ENTOPS-06 structural: no auto-trim path", () => {
  it("exports warn_only enforcement marker", () => {
    expect(DIRECTIVE_BUDGET_ENFORCEMENT).toBe("warn_only");
  });

  it("source module has no trim/delete write helpers", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "..", "directive-budget.ts"),
      "utf8"
    );
    expect(src).not.toMatch(/\btrimDirective\b/);
    expect(src).not.toMatch(/\bautoTrim\b/);
    expect(src).not.toMatch(/\bdeleteLines\b/);
    expect(src).not.toMatch(/\btruncateDirective\b/);
    expect(src).toMatch(/warnOnly:\s*true/);
    expect(src).toMatch(/NEVER auto-trim|never mutates|Warn-only/i);
  });
});
