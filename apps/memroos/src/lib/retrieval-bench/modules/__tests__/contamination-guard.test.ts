// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  checkContamination,
  createIsolationContext,
  deriveRunFingerprint,
  filterByScope,
  type RunScope,
  type ScopeTag,
} from "../contamination-guard";

const baseScope: RunScope = {
  runId: "run-a",
  lane: "external_retrieval",
  dataset: "locomo",
  adapter: "lexical",
  tenantId: "tenant-1",
  scope: "project:alpha",
  seed: 42,
};

function tagFrom(scope: RunScope): ScopeTag {
  return {
    runId: scope.runId,
    lane: scope.lane,
    dataset: scope.dataset,
    adapter: scope.adapter,
    tenantId: scope.tenantId,
    scope: scope.scope,
  };
}

describe("contamination-guard", () => {
  it("deriveRunFingerprint is stable for identical scopes", () => {
    const first = deriveRunFingerprint(baseScope);
    const second = deriveRunFingerprint({ ...baseScope });
    expect(first).toBe(second);
    expect(first.startsWith("sha256:")).toBe(true);
  });

  it("deriveRunFingerprint changes when scope fields differ", () => {
    const baseline = deriveRunFingerprint(baseScope);
    expect(deriveRunFingerprint({ ...baseScope, runId: "run-b" })).not.toBe(baseline);
    expect(deriveRunFingerprint({ ...baseScope, seed: 99 })).not.toBe(baseline);
  });

  it("createIsolationContext exposes scope, fingerprint, and tag", () => {
    const ctx = createIsolationContext(baseScope);
    expect(ctx.scope).toEqual(baseScope);
    expect(ctx.fingerprint).toBe(deriveRunFingerprint(baseScope));
    expect(ctx.tag).toEqual(tagFrom(baseScope));
  });

  it("checkContamination accepts matching tags", () => {
    const result = checkContamination({
      expected: baseScope,
      actual: tagFrom(baseScope),
    });
    expect(result.ok).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it.each([
    ["runId", { runId: "other-run" }],
    ["lane", { lane: "other-lane" }],
    ["dataset", { dataset: "other-dataset" }],
    ["adapter", { adapter: "other-adapter" }],
    ["tenantId", { tenantId: "other-tenant" }],
    ["scope", { scope: "project:beta" }],
  ] as const)("checkContamination rejects %s mismatch", (field, patch) => {
    const actual = { ...tagFrom(baseScope), ...patch };
    const result = checkContamination({ expected: baseScope, actual });
    expect(result.ok).toBe(false);
    if (field === "scope") {
      expect(result.reason).toBe("scope_mismatch");
    } else {
      expect(result.reason).toContain(`${field}_mismatch`);
    }
  });

  it("checkContamination treats undefined and null scope as equivalent", () => {
    const withoutScope = { ...baseScope, scope: undefined };
    const result = checkContamination({
      expected: withoutScope,
      actual: { ...tagFrom(withoutScope), scope: undefined },
    });
    expect(result.ok).toBe(true);
  });

  it("filterByScope keeps matching records and reports foreign ones", () => {
    const matching: ScopeTag = tagFrom(baseScope);
    const foreign: ScopeTag = { ...matching, runId: "foreign-run" };
    const result = filterByScope(baseScope, [matching, foreign, matching]);

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("found_foreign_records:1");
    expect(result.filtered).toHaveLength(2);
    expect(result.rejected).toEqual([foreign]);
  });

  it("filterByScope succeeds when all candidates match", () => {
    const candidates = [tagFrom(baseScope), tagFrom(baseScope)];
    const result = filterByScope(baseScope, candidates);
    expect(result.ok).toBe(true);
    expect(result.filtered).toEqual(candidates);
    expect(result.rejected).toEqual([]);
  });
});
