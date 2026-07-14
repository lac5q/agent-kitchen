/**
 * Cross-lane / cross-run contamination prevention (VAL-RETR-030).
 *
 * Each run, lane, dataset, adapter, tenant, and scope is assigned a
 * stable namespace key. All retrieval artifacts (rows, cache entries,
 * receipt ids) MUST be tagged with the same namespace. When probes
 * are issued, this module verifies that:
 *
 *   - A query scoped to (runA, laneA) returns only items tagged with
 *     that scope, not items from (runB, laneB).
 *   - Concurrent runs do not pollute each other's packs, caches, or
 *     aggregate metrics.
 *   - A report's stage receipts all share its runId/lane/dataset.
 *
 * The `scopeGuard` is a pure function over a target scope and a
 * candidate tag; the caller is responsible for tagging data. The
 * module also provides a `SessionIsolationContext` carrying the
 * canonical namespace for a single run.
 */

import crypto from "node:crypto";

export interface RunScope {
  runId: string;
  lane: string;
  dataset: string;
  adapter: string;
  tenantId: string;
  scope?: string;
  seed: number;
}

export interface ScopeTag {
  runId: string;
  lane: string;
  dataset: string;
  adapter: string;
  tenantId: string;
  scope?: string;
}

export interface ScopeIsolationContext {
  scope: RunScope;
  /** Stable scope fingerprint. */
  fingerprint: string;
  /** Tag attached to every artifact created under this scope. */
  tag: ScopeTag;
}

export function deriveRunFingerprint(scope: RunScope): string {
  const canonical = JSON.stringify({
    runId: scope.runId,
    lane: scope.lane,
    dataset: scope.dataset,
    adapter: scope.adapter,
    tenantId: scope.tenantId,
    scope: scope.scope ?? null,
    seed: scope.seed,
  });
  return "sha256:" + crypto.createHash("sha256").update(canonical).digest("hex").slice(0, 16);
}

export function createIsolationContext(scope: RunScope): ScopeIsolationContext {
  const fingerprint = deriveRunFingerprint(scope);
  return {
    scope,
    fingerprint,
    tag: {
      runId: scope.runId,
      lane: scope.lane,
      dataset: scope.dataset,
      adapter: scope.adapter,
      tenantId: scope.tenantId,
      scope: scope.scope,
    },
  };
}

export interface ContaminationCheck {
  ok: boolean;
  reason?: string;
  expected: RunScope;
  actual: ScopeTag;
}

export function checkContamination(args: {
  expected: RunScope;
  actual: ScopeTag;
}): ContaminationCheck {
  const { expected, actual } = args;
  if (expected.runId !== actual.runId) {
    return {
      ok: false,
      reason: "runId_mismatch:" + actual.runId + "!=expected:" + expected.runId,
      expected,
      actual,
    };
  }
  if (expected.lane !== actual.lane) {
    return {
      ok: false,
      reason: "lane_mismatch:" + actual.lane + "!=expected:" + expected.lane,
      expected,
      actual,
    };
  }
  if (expected.dataset !== actual.dataset) {
    return {
      ok: false,
      reason: "dataset_mismatch:" + actual.dataset + "!=expected:" + expected.dataset,
      expected,
      actual,
    };
  }
  if (expected.adapter !== actual.adapter) {
    return {
      ok: false,
      reason: "adapter_mismatch:" + actual.adapter + "!=expected:" + expected.adapter,
      expected,
      actual,
    };
  }
  if (expected.tenantId !== actual.tenantId) {
    return {
      ok: false,
      reason: "tenantId_mismatch:" + actual.tenantId + "!=expected:" + expected.tenantId,
      expected,
      actual,
    };
  }
  if ((expected.scope ?? null) !== (actual.scope ?? null)) {
    return {
      ok: false,
      reason: "scope_mismatch",
      expected,
      actual,
    };
  }
  return { ok: true, expected, actual };
}

export interface IsolationFilter<T extends ScopeTag> {
  ok: boolean;
  reason?: string;
  filtered: T[];
  rejected: T[];
}

export function filterByScope<T extends ScopeTag>(
  expected: RunScope,
  candidates: T[],
): IsolationFilter<T> {
  const filtered: T[] = [];
  const rejected: T[] = [];
  for (const c of candidates) {
    if (
      c.runId === expected.runId &&
      c.lane === expected.lane &&
      c.dataset === expected.dataset &&
      c.adapter === expected.adapter &&
      c.tenantId === expected.tenantId &&
      (c.scope ?? null) === (expected.scope ?? null)
    ) {
      filtered.push(c);
    } else {
      rejected.push(c);
    }
  }
  const ok = rejected.length === 0;
  return {
    ok,
    reason: ok ? undefined : "found_foreign_records:" + rejected.length,
    filtered,
    rejected,
  };
}
