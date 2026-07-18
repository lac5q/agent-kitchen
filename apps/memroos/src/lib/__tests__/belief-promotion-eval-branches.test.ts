// @vitest-environment node
import Database from "better-sqlite3";
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { initSchema } from "../db-schema";

type PromotionModule = typeof import("../belief/promotion");
type OutboundModule = typeof import("../belief/outbound-policy");
type PromotionResult = ReturnType<PromotionModule["promoteCandidate"]>;
type OutboundResult = ReturnType<OutboundModule["filterOutboundClaims"]>;

const PROMOTION_PATH = "../belief/promotion";
const OUTBOUND_PATH = "../belief/outbound-policy";

function admitted(): PromotionResult {
  return { kind: "admitted", decisionId: "admitted-decision", receipt: {} } as PromotionResult;
}

function denied(reason = "policy_denied"): PromotionResult {
  return {
    kind: "denied",
    reason,
    failedCheck: "policy",
    decisionId: "denied-decision",
    receipt: {},
  } as PromotionResult;
}

function queued(): PromotionResult {
  return {
    kind: "queued_for_review",
    reason: "high_stakes_category",
    category: "pricing",
    queueId: "queue-1",
    decisionId: "queue-decision",
    receipt: {},
  } as PromotionResult;
}

function out(overrides: Partial<OutboundResult>): OutboundResult {
  return {
    emitted: [],
    dropped: [],
    receipts: [],
    ...overrides,
  } as OutboundResult;
}

function nextTempCasesPath(caseId: string): string {
  const filePath = path.join(os.tmpdir(), `belief-eval-branch-${caseId}-${Date.now()}-${Math.random()}.json`);
  fs.writeFileSync(
    filePath,
    JSON.stringify([{ id: caseId, description: "branch coverage", expectations: {} }]),
    "utf8"
  );
  return filePath;
}

async function runCaseWithMocks(
  caseId: string,
  mocks: {
    promoteCandidate?: PromotionModule["promoteCandidate"];
    demoteCandidate?: PromotionModule["demoteCandidate"];
    resolveReview?: PromotionModule["resolveReview"];
    filterOutboundClaims?: OutboundModule["filterOutboundClaims"];
  }
) {
  vi.resetModules();
  vi.doMock(PROMOTION_PATH, async () => {
    const actual = await vi.importActual<PromotionModule>(PROMOTION_PATH);
    return {
      ...actual,
      promoteCandidate: mocks.promoteCandidate ?? actual.promoteCandidate,
      demoteCandidate: mocks.demoteCandidate ?? actual.demoteCandidate,
      resolveReview: mocks.resolveReview ?? actual.resolveReview,
    };
  });
  vi.doMock(OUTBOUND_PATH, async () => {
    const actual = await vi.importActual<OutboundModule>(OUTBOUND_PATH);
    return {
      ...actual,
      filterOutboundClaims: mocks.filterOutboundClaims ?? actual.filterOutboundClaims,
    };
  });

  const db = new Database(":memory:");
  initSchema(db);
  const casesPath = nextTempCasesPath(caseId);
  try {
    const { runBeliefPromotionEvalSuite } = await import("../evals/belief-promotion-eval");
    const run = await runBeliefPromotionEvalSuite({ mode: "full", db, casesPath });
    return run.cases[0];
  } finally {
    db.close();
    fs.rmSync(casesPath, { force: true });
  }
}

afterEach(() => {
  vi.doUnmock(PROMOTION_PATH);
  vi.doUnmock(OUTBOUND_PATH);
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("belief promotion eval handler branch coverage", () => {
  it("reports unsupported silver when promotion unexpectedly admits", async () => {
    const result = await runCaseWithMocks("unsupported_silver_never_truth", {
      promoteCandidate: (() => admitted()) as PromotionModule["promoteCandidate"],
    });
    expect(result).toMatchObject({
      pass: false,
      reason: "candidate unexpectedly admitted to gold",
    });
  });

  it("records handler exceptions as failed case reasons", async () => {
    const result = await runCaseWithMocks("unsupported_silver_never_truth", {
      promoteCandidate: (() => {
        throw new Error("handler exploded");
      }) as PromotionModule["promoteCandidate"],
    });
    expect(result).toMatchObject({
      pass: false,
      reason: "handler exploded",
    });
  });

  it("reports unsupported silver when the candidate stage changes", async () => {
    const result = await runCaseWithMocks("unsupported_silver_never_truth", {
      promoteCandidate: ((db, args) => {
        db.prepare(`UPDATE agent_memory_candidates SET belief_stage = 'gold_operational_truth' WHERE id = ?`).run(
          args.candidateId
        );
        return denied();
      }) as PromotionModule["promoteCandidate"],
    });
    expect(result).toMatchObject({
      pass: false,
      reason: "candidate promoted against expectations",
    });
  });

  it("reports unsupported silver outbound stage and caveat failures", async () => {
    const wrongStage = await runCaseWithMocks("unsupported_silver_never_truth", {
      promoteCandidate: (() => denied()) as PromotionModule["promoteCandidate"],
      filterOutboundClaims: (() => out({ emitted: [] })) as OutboundModule["filterOutboundClaims"],
    });
    expect(wrongStage?.reason).toMatch(/outbound stage expected silver/);

    const missingCaveat = await runCaseWithMocks("unsupported_silver_never_truth", {
      promoteCandidate: (() => denied()) as PromotionModule["promoteCandidate"],
      filterOutboundClaims: (() =>
        out({ emitted: [{ stage: "silver_candidate_claim", content: "silver without caveat" }] })) as OutboundModule["filterOutboundClaims"],
    });
    expect(missingCaveat).toMatchObject({
      pass: false,
      reason: "silver emitted without caveat",
    });
  });

  it("reports contradicted-gold promotion, duplicate, and superseding failures", async () => {
    const firstDenied = await runCaseWithMocks("contradicted_gold_demotes_in_one_cycle", {
      promoteCandidate: (() => denied("first")) as PromotionModule["promoteCandidate"],
    });
    expect(firstDenied?.reason).toMatch(/expected promotion admitted/);

    const duplicateNotDenied = await runCaseWithMocks("contradicted_gold_demotes_in_one_cycle", {
      promoteCandidate: vi
        .fn()
        .mockReturnValueOnce(admitted())
        .mockReturnValueOnce(admitted()) as PromotionModule["promoteCandidate"],
    });
    expect(duplicateNotDenied?.reason).toMatch(/expected duplicate admission denied/);

    const supersedingDenied = await runCaseWithMocks("contradicted_gold_demotes_in_one_cycle", {
      promoteCandidate: vi
        .fn()
        .mockReturnValueOnce(admitted())
        .mockReturnValueOnce(denied("duplicate"))
        .mockReturnValueOnce(denied("still blocked")) as PromotionModule["promoteCandidate"],
      demoteCandidate: (() => ({
        decisionId: "demote",
        receipt: {},
        supersedesCandidateId: null,
      })) as PromotionModule["demoteCandidate"],
    });
    expect(supersedingDenied?.reason).toMatch(/expected superseding candidate to admit/);
  });

  it("reports receipt hash, shape, and raw-content leakage failures", async () => {
    const missingHash = await runCaseWithMocks("receipt_exposes_stage", {
      promoteCandidate: (() => admitted()) as PromotionModule["promoteCandidate"],
      filterOutboundClaims: (() =>
        out({ receipts: [{ stage: "gold_operational_truth", action: "emitted", reason: "ok" }] })) as OutboundModule["filterOutboundClaims"],
    });
    expect(missingHash).toMatchObject({ pass: false, reason: "receipt missing sha256 claimHash" });

    const missingStage = await runCaseWithMocks("receipt_exposes_stage", {
      promoteCandidate: (() => admitted()) as PromotionModule["promoteCandidate"],
      filterOutboundClaims: (() =>
        out({ receipts: [{ claimHash: "sha256:abc", action: "", reason: "ok" }] })) as OutboundModule["filterOutboundClaims"],
    });
    expect(missingStage).toMatchObject({ pass: false, reason: "receipt missing stage or action" });

    const rawLeak = await runCaseWithMocks("receipt_exposes_stage", {
      promoteCandidate: (() => admitted()) as PromotionModule["promoteCandidate"],
      filterOutboundClaims: (() =>
        out({
          receipts: [
            {
              claimHash: "sha256:abc",
              stage: "gold_operational_truth",
              action: "emitted",
              reason: "MUST-NOT-LEAK-2026-07-06",
            },
          ],
        })) as OutboundModule["filterOutboundClaims"],
    });
    expect(rawLeak).toMatchObject({ pass: false, reason: "receipt body contains sentinel substring" });
  });

  it("reports high-stakes queue, stage, approval, and caveat failures", async () => {
    const notQueued = await runCaseWithMocks("high_stakes_blocked_until_review", {
      promoteCandidate: (() => denied("not queued")) as PromotionModule["promoteCandidate"],
    });
    expect(notQueued?.reason).toMatch(/expected queued_for_review/);

    const wrongStage = await runCaseWithMocks("high_stakes_blocked_until_review", {
      promoteCandidate: ((db, args) => {
        db.prepare(`UPDATE agent_memory_candidates SET belief_stage = 'gold_operational_truth' WHERE id = ?`).run(
          args.candidateId
        );
        return queued();
      }) as PromotionModule["promoteCandidate"],
    });
    expect(wrongStage?.reason).toMatch(/candidate stage expected silver/);

    const notApproved = await runCaseWithMocks("high_stakes_blocked_until_review", {
      promoteCandidate: (() => queued()) as PromotionModule["promoteCandidate"],
      resolveReview: (() => ({ resolution: "rejected" })) as PromotionModule["resolveReview"],
    });
    expect(notApproved).toMatchObject({
      pass: false,
      reason: "review resolution did not return approved",
    });

    const noSilverEmission = await runCaseWithMocks("high_stakes_blocked_until_review", {
      promoteCandidate: (() => queued()) as PromotionModule["promoteCandidate"],
      resolveReview: (() => ({ resolution: "approved" })) as PromotionModule["resolveReview"],
      filterOutboundClaims: (() => out({ emitted: [] })) as OutboundModule["filterOutboundClaims"],
    });
    expect(noSilverEmission).toMatchObject({
      pass: false,
      reason: "high-stakes silver was not caveated before review",
    });

    const noCaveat = await runCaseWithMocks("high_stakes_blocked_until_review", {
      promoteCandidate: (() => queued()) as PromotionModule["promoteCandidate"],
      resolveReview: (() => ({ resolution: "approved" })) as PromotionModule["resolveReview"],
      filterOutboundClaims: (() =>
        out({ emitted: [{ stage: "silver_candidate_claim", content: "pricing" }] })) as OutboundModule["filterOutboundClaims"],
    });
    expect(noCaveat).toMatchObject({
      pass: false,
      reason: "high-stakes silver emitted without caveat",
    });
  });

  it("reports bronze default and citation-mode failures", async () => {
    const emittedByDefault = await runCaseWithMocks("bronze_citation_only", {
      filterOutboundClaims: (() =>
        out({ emitted: [{ stage: "bronze_raw_source", content: "bronze" }] })) as OutboundModule["filterOutboundClaims"],
    });
    expect(emittedByDefault).toMatchObject({
      pass: false,
      reason: "bronze should be dropped under default policy",
    });

    const notDropped = await runCaseWithMocks("bronze_citation_only", {
      filterOutboundClaims: (() => out({ emitted: [], dropped: [] })) as OutboundModule["filterOutboundClaims"],
    });
    expect(notDropped).toMatchObject({
      pass: false,
      reason: "default dropped should have one bronze entry",
    });

    const noCitationEmission = await runCaseWithMocks("bronze_citation_only", {
      filterOutboundClaims: vi
        .fn()
        .mockReturnValueOnce(out({ dropped: [{ stage: "bronze_raw_source", content: "bronze" }] }))
        .mockReturnValueOnce(out({ emitted: [] })) as OutboundModule["filterOutboundClaims"],
    });
    expect(noCitationEmission).toMatchObject({
      pass: false,
      reason: "bronze did not emit under citation mode",
    });

    const noCitationFlag = await runCaseWithMocks("bronze_citation_only", {
      filterOutboundClaims: vi
        .fn()
        .mockReturnValueOnce(out({ dropped: [{ stage: "bronze_raw_source", content: "bronze" }] }))
        .mockReturnValueOnce(out({ emitted: [{ stage: "bronze_raw_source", content: "bronze" }] })) as OutboundModule["filterOutboundClaims"],
    });
    expect(noCitationFlag).toMatchObject({
      pass: false,
      reason: "bronze emitted without citationOnly flag",
    });
  });
});
