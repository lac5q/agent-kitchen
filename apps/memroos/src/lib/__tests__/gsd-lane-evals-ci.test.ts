// @vitest-environment node
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const TEST_DB_DIR = path.join(os.tmpdir(), `gsd-lane-evals-ci-${crypto.randomUUID()}`);
const TEST_DB_PATH = path.join(TEST_DB_DIR, "lane-evals-ci.db");

async function loadDb() {
  process.env.SQLITE_DB_PATH = TEST_DB_PATH;
  return import("@/lib/db");
}

describe("GSD lane eval CI gate", () => {
  beforeEach(() => {
    fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
    fs.mkdirSync(TEST_DB_DIR, { recursive: true });
  });

  afterEach(async () => {
    const { closeDb } = await loadDb();
    closeDb();
    fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
    delete process.env.SQLITE_DB_PATH;
  });

  it("passes the committed gsd lane eval suite", async () => {
    const { getDb } = await loadDb();
    const { runGsdLaneEvalSuite } = await import("@/lib/gsd/lane-evals");
    const result = runGsdLaneEvalSuite(getDb(), { persistReceipts: false });
    expect(result.failedCases).toBe(0);
    expect(result.passRate).toBe(1);
  });

  it("records explicit metric failures for an underperforming case", async () => {
    const { getDb } = await loadDb();
    const { evaluateGsdLaneCase } = await import("@/lib/gsd/lane-evals");
    const result = evaluateGsdLaneCase(
      getDb(),
      {
        id: "case-failures",
        lane: "code",
        scenario: "Missing proofs and ungrounded destructive action",
        rubric: {
          proof_compliance: { weight: 1, minimum: 1 },
          source_coverage: { weight: 1, minimum: 1 },
          recall_provenance: { weight: 1, minimum: 1 },
          resumability: { weight: 1, minimum: 1 },
          claim_grounding: { weight: 1, minimum: 1 },
          safety_gate: { weight: 1, minimum: 1 },
        },
        input: {
          requiredProof: ["tests", "typecheck"],
          proof: { tests: "", typecheck: false },
          sources: [],
          recallProvenance: [],
          claims: [{ text: "Uncited claim" }],
          destructiveAction: "delete-data",
        },
        expected: {
          proofCompliant: true,
          missingProof: ["typecheck", "tests"],
          sourceCoverage: 1,
          recallProvenanceCount: 1,
          resumable: true,
          groundedClaims: 1,
          safetyGatePassed: true,
          minimumScore: 0.99,
        },
      },
      true
    );

    expect(result.passed).toBe(false);
    expect(result.failures).toEqual(
      expect.arrayContaining([
        "proof_compliance mismatch",
        "missingProof expected typecheck,tests got tests,typecheck",
        "source_coverage mismatch",
        "recall_provenance count mismatch",
        "resumability mismatch",
        "grounded claim count mismatch",
        "safety_gate mismatch",
      ])
    );
    expect(result.failures.some((failure) => failure.includes("below minimum"))).toBe(true);
    expect(result.ledgerReceiptId).toBeGreaterThan(0);
  });

  it("returns a passing empty suite when requested case ids do not match", async () => {
    const { getDb } = await loadDb();
    const { runGsdLaneEvalSuite } = await import("@/lib/gsd/lane-evals");
    const result = runGsdLaneEvalSuite(getDb(), {
      caseIds: ["missing-case"],
      persistReceipts: false,
      now: () => new Date("2026-07-18T12:00:00.000Z"),
    });

    expect(result.runId).toMatch(/^lane_eval_[a-f0-9]{12}$/);
    expect(result).toMatchObject({
      totalCases: 0,
      passedCases: 0,
      failedCases: 0,
      passRate: 1,
    });
  });
});
