// @vitest-environment node
/**
 * Phase 129 (POLGOV-05) — Policy regression corpus.
 *
 * Loads `corpus.json`, runs every case through `evaluatePolicy`, and asserts
 * the receipt outcome matches `expectedOutcome`. Cases whose expected
 * outcome is overridden by an entry in `approved-diffs.json` are accepted
 * with the approved outcome (operator-acknowledged behavior change).
 *
 * On any unapproved difference the test fails with a clear message naming
 * the case id, expected, and actual outcomes.
 */

import { describe, expect, it } from "vitest";

import approvedDiffs from "../policies/approved-diffs.json";
import corpusManifest from "../policies/corpus.json";

import { evaluatePolicy, type PolicyRequest } from "../engine";

interface CorpusCase {
  id: string;
  request: PolicyRequest;
  expectedOutcome: string;
}

interface CorpusFile {
  version: string;
  cases: CorpusCase[];
}

interface ApprovedDiffsFile {
  approvedChanges: Array<{
    id: string;
    approvedOutcome: string;
    reason?: string;
  }>;
}

const corpus = corpusManifest as CorpusFile;
const diffs = approvedDiffs as ApprovedDiffsFile;

const approvedOutcomeByCaseId = new Map<string, string>();
for (const change of diffs.approvedChanges) {
  approvedOutcomeByCaseId.set(change.id, change.approvedOutcome);
}

describe("policy regression corpus", () => {
  it("corpus has at least 10 cases", () => {
    expect(corpus.cases.length).toBeGreaterThanOrEqual(10);
  });

  it("every corpus case has a unique id", () => {
    const ids = new Set<string>();
    for (const c of corpus.cases) {
      expect(ids.has(c.id)).toBe(false);
      ids.add(c.id);
    }
  });

  it("corpus version is pinned to the Phase 128 baseline", () => {
    expect(corpus.version).toBe("2026.07.128");
  });

  for (const c of corpus.cases) {
    const approvedOutcome = approvedOutcomeByCaseId.get(c.id);
    const effectiveExpected = approvedOutcome ?? c.expectedOutcome;

    it(`case "${c.id}" -> ${effectiveExpected}${approvedOutcome ? " (approved diff)" : ""}`, () => {
      const evaluation = evaluatePolicy(c.request);
      const actual = evaluation.receipt.outcome;

      if (actual !== effectiveExpected) {
        throw new Error(
          `Policy regression: case "${c.id}" expected outcome "${effectiveExpected}" but engine produced "${actual}".` +
            (approvedOutcome
              ? ` Approved diff applied (reason: see approved-diffs.json).`
              : ` No approved diff on file. Update expectedOutcome in corpus.json OR add an entry to approved-diffs.json.`)
        );
      }

      expect(actual).toBe(effectiveExpected);
    });
  }
});

describe("policy regression corpus — MEMSEC-08 byte-identical guarantee", () => {
  // Phase 128 regression: cases that do NOT supply `dimensions` must
  // produce byte-identical outcomes to the wrapped functions.
  const casesWithoutDimensions = corpus.cases.filter((c) => !c.request.dimensions);

  it("at least one MEMSEC-08 case exists without dimensions", () => {
    expect(casesWithoutDimensions.length).toBeGreaterThan(0);
  });

  for (const c of casesWithoutDimensions) {
    it(`case "${c.id}" without dimensions is byte-identical to expected`, () => {
      const evaluation = evaluatePolicy(c.request);
      expect(evaluation.receipt.outcome).toBe(c.expectedOutcome);
    });
  }
});