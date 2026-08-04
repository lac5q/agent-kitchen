// @vitest-environment node
import { describe, expect, it } from "vitest";
import { execSync } from "child_process";

import * as registry from "@/lib/agent/registry";

/**
 * Phase 221 criterion 6 — the guard that keeps scoping from silently regressing.
 *
 * The original defect was not that someone chose the unscoped list; it was that
 * an ambiguously named function *was* the unscoped list, so a call site that
 * never considered the viewer leaked the whole fleet by default. The protection
 * is that no such name exists: a caller must say `listAgentsVisibleTo(viewer)`
 * or `listAllAgentsUnscoped()`, and the second one is hard to type by accident.
 */
describe("agent listing cannot be unscoped by accident", () => {
  it("exposes no ambiguously-named listing function", () => {
    expect(registry).not.toHaveProperty("listRegisteredAgents");
  });

  it("requires a viewer to list scoped agents", () => {
    // Calling without a viewer is a type error; at runtime it must not quietly
    // fall back to everything.
    expect(() =>
      (registry.listAgentsVisibleTo as unknown as () => unknown)()
    ).toThrow();
  });

  /**
   * Application code must not *call* the removed alias. Mentions in comments and
   * in test mocks are fine and deliberately not matched — the point is that no
   * production path can obtain the unscoped list without asking for it by name.
   */
  it("has no production call site for the removed alias", () => {
    const repoRoot = process.cwd().replace(/\/apps\/memroos$/, "");
    const hits = execSync(
      "git grep -l 'listRegisteredAgents(' -- 'apps/memroos/src' || true",
      { cwd: repoRoot, encoding: "utf8" }
    )
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .filter((f) => !f.includes("__tests__"))
      .filter((f) => !f.includes("data/understand/"));

    expect(hits).toEqual([]);
  });
});
