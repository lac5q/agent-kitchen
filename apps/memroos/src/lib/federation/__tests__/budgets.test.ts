// @vitest-environment node
/**
 * VAL-ORCH-007: federation global + per-source budgets.
 */
import { describe, expect, it } from "vitest";
import { BudgetTracker, validateFederationBudget } from "../budgets";

function okBudget() {
  return { sourceCount: 3, perSourceResultCount: 5, globalResultCount: 10, hops: 1, fanout: 3, maxBytes: 1000, maxCalls: 5, deadlineMs: 1000 };
}

describe("VAL-ORCH-007 -- validateFederationBudget", () => {
  it("accepts a well-formed budget", () => {
    const r = validateFederationBudget(okBudget());
    expect(r.kind).toBe("allowed");
  });

  it("rejects missing field", () => {
    const b = okBudget() as Record<string, number>;
    delete b.hops;
    const r = validateFederationBudget(b);
    expect(r.kind).toBe("rejected");
    if (r.kind === "rejected") expect(r.field).toBe("hops");
  });

  it("rejects zero and non-finite bounds", () => {
    const r1 = validateFederationBudget({ ...okBudget(), sourceCount: 0 });
    expect(r1.kind).toBe("rejected");
    const r2 = validateFederationBudget({ ...okBudget(), maxBytes: Infinity });
    expect(r2.kind).toBe("rejected");
    const r3 = validateFederationBudget({ ...okBudget(), deadlineMs: NaN });
    expect(r3.kind).toBe("rejected");
  });
});

describe("VAL-ORCH-007 -- BudgetTracker", () => {
  it("enforces global source_count", () => {
    const t = new BudgetTracker(okBudget());
    expect(t.startSource("a").ok).toBe(true);
    expect(t.startSource("b").ok).toBe(true);
    expect(t.startSource("c").ok).toBe(true);
    const r = t.startSource("d");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("global_source_count_exceeded");
  });

  it("enforces per_source_result_count", () => {
    const t = new BudgetTracker(okBudget());
    t.startSource("a");
    for (let i = 0; i < 5; i += 1) expect(t.recordResult("a", 10).ok).toBe(true);
    const r = t.recordResult("a", 10);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("per_source_result_count_exceeded");
  });

  it("enforces global byte budget", () => {
    const t = new BudgetTracker(okBudget());
    t.startSource("a");
    expect(t.recordResult("a", 600).ok).toBe(true);
    t.startSource("b");
    const r = t.recordResult("b", 500);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("global_byte_budget_exceeded");
  });

  it("rejects sources after first rejection", () => {
    const t = new BudgetTracker(okBudget());
    t.startSource("a");
    t.recordResult("a", 999);
    t.startSource("b");
    const r = t.recordResult("b", 50);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("global_byte_budget_exceeded");
    const r2 = t.startSource("c");
    expect(r2.ok).toBe(false);
  });
});
