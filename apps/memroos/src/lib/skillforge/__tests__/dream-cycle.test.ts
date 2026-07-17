/**
 * SkillForge Dream Cycle tests — Phase 91
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import Database from "better-sqlite3";
import { runDreamCycle } from "../dream-cycle";
import { DEFAULT_SKILLFORGE_CONFIG } from "../types";
import type { SkillForgeProposal } from "../types";
import * as operatorApproval from "../operator-approval";
import * as integration from "../integration";

const { workerRun } = vi.hoisted(() => ({
  workerRun: vi.fn(),
}));

vi.mock("../worker", () => ({
  SkillForgeWorker: class MockSkillForgeWorker {
    run = workerRun;
  },
}));

function setupDb(): Database.Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE skillforge_proposals (
      id TEXT PRIMARY KEY, seal_proposal_id TEXT, source_skill_id TEXT NOT NULL,
      source_version TEXT NOT NULL, proposed_diff TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      edit_hash TEXT,
      train_split_id TEXT, validation_split_id TEXT, held_out_split_id TEXT,
      baseline_w REAL, validation_w REAL, held_out_w REAL,
      validation_results TEXT, held_out_results TEXT,
      w_delta REAL, evaluator_receipts TEXT NOT NULL DEFAULT '[]',
      typed_edit_ops TEXT NOT NULL DEFAULT '[]',
      rejected_edits TEXT NOT NULL DEFAULT '[]',
      residual_risks TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE skill_registry (
      id INTEGER PRIMARY KEY, name TEXT, description TEXT, owner TEXT,
      source_harness TEXT NOT NULL DEFAULT 'claude', risk_tier TEXT,
      dispatch_status TEXT NOT NULL DEFAULT 'enabled', version TEXT,
      preconditions TEXT, allowed_tools TEXT, verification_checks TEXT,
      rollback_behavior TEXT, raw_body TEXT NOT NULL DEFAULT 'original body',
      completeness_pct INTEGER NOT NULL DEFAULT 100,
      missing_fields_json TEXT NOT NULL DEFAULT '[]',
      imported_by TEXT NOT NULL DEFAULT 'operator',
      imported_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      evidence_examples TEXT, content_hash TEXT, signature TEXT,
      signed_by TEXT, signed_at TEXT, trust_level TEXT NOT NULL DEFAULT 'unsigned'
    );
    CREATE TABLE skillforge_exports (
      id TEXT PRIMARY KEY, proposal_id TEXT NOT NULL, skill_id TEXT NOT NULL,
      skill_registry_id INTEGER, pre_version TEXT, pre_hash TEXT, pre_raw_body TEXT,
      post_version TEXT, post_hash TEXT, edit_hash TEXT, eval_receipt_hash TEXT,
      actor TEXT, created_at TEXT NOT NULL
    );
    CREATE TABLE audit_entries (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, actor_id TEXT NOT NULL,
      actor_role TEXT NOT NULL, event_type TEXT NOT NULL, entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL, reason TEXT, metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );
    CREATE TABLE eval_candidates (id INTEGER PRIMARY KEY, input_text TEXT, output_text TEXT, source_skill_id TEXT, score REAL, created_at TEXT);
  `);
  return db;
}

function makeProposal(overrides: Partial<SkillForgeProposal> & { id: string; status: string }): SkillForgeProposal {
  return {
    id: overrides.id,
    sealProposalId: overrides.sealProposalId ?? null,
    sourceSkillId: overrides.sourceSkillId ?? "1",
    sourceVersion: overrides.sourceVersion ?? "1.0.0",
    proposedDiff: overrides.proposedDiff ?? "+++ fix\n+improved trigger",
    status: overrides.status as SkillForgeProposal["status"],
    editHash: overrides.editHash,
    trainSplitId: overrides.trainSplitId ?? "train-split-1",
    validationSplitId: overrides.validationSplitId ?? "val-split-1",
    heldOutSplitId: overrides.heldOutSplitId ?? "held-split-1",
    baselineW: overrides.baselineW ?? 0.5,
    validationW: overrides.validationW ?? 0.75,
    heldOutW: overrides.heldOutW ?? 0.8,
    validationResults: overrides.validationResults ?? null,
    heldOutResults: overrides.heldOutResults ?? null,
    wDelta: overrides.wDelta ?? 0.25,
    evaluatorReceipts: overrides.evaluatorReceipts ?? [],
    typedEditOps: overrides.typedEditOps ?? [],
    rejectedEdits: overrides.rejectedEdits ?? [],
    residualRisks: overrides.residualRisks ?? [],
    createdAt: overrides.createdAt ?? new Date(),
    updatedAt: overrides.updatedAt ?? new Date(),
  };
}

function insertProposalRow(db: Database.Database, proposal: SkillForgeProposal) {
  db.prepare(
    `INSERT INTO skillforge_proposals
      (id, seal_proposal_id, source_skill_id, source_version, proposed_diff, status, edit_hash,
       train_split_id, validation_split_id, held_out_split_id, baseline_w, validation_w, held_out_w,
       validation_results, held_out_results, w_delta, evaluator_receipts, typed_edit_ops,
       rejected_edits, residual_risks, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    proposal.id,
    proposal.sealProposalId,
    proposal.sourceSkillId,
    proposal.sourceVersion,
    proposal.proposedDiff,
    proposal.status,
    proposal.editHash ?? null,
    proposal.trainSplitId,
    proposal.validationSplitId ?? null,
    proposal.heldOutSplitId ?? null,
    proposal.baselineW ?? null,
    proposal.validationW ?? null,
    proposal.heldOutW ?? null,
    proposal.validationResults ? JSON.stringify(proposal.validationResults) : null,
    proposal.heldOutResults ? JSON.stringify(proposal.heldOutResults) : null,
    proposal.wDelta,
    JSON.stringify(proposal.evaluatorReceipts ?? []),
    JSON.stringify(proposal.typedEditOps ?? []),
    JSON.stringify(proposal.rejectedEdits),
    JSON.stringify(proposal.residualRisks),
    proposal.createdAt.toISOString(),
    proposal.updatedAt.toISOString()
  );
}

function mockPendingQueue(...proposals: SkillForgeProposal[]) {
  vi.spyOn(operatorApproval, "listProposals").mockReturnValue({
    pending: proposals,
    gated: [],
    approved: [],
    rejected: [],
  });
}

describe("dream-cycle", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = setupDb();
    workerRun.mockReset();
    workerRun.mockResolvedValue({
      runId: "sf-run-test",
      startedAt: new Date(),
      completedAt: new Date(),
      status: "success",
      entriesProcessed: 0,
      proposalsCreated: 0,
      proposalsSubmitted: 0,
      errors: [],
    });
  });

  it("runs dream cycle with no data", async () => {
    const result = await runDreamCycle(db, { ...DEFAULT_SKILLFORGE_CONFIG, minTraceAgeHours: 0 });
    expect(result.proposalsCreated).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(result.report).toContain("Dream Cycle Report");
    expect(result.report).toContain("No errors.");
  });

  it("auto-approves low-risk proposals", async () => {
    db.prepare(
      `INSERT INTO skill_registry (id, name, version, raw_body, imported_by) VALUES (?, ?, ?, ?, ?)`
    ).run(1, "Test Skill", "1.0.0", "original body", "operator");

    const proposal = makeProposal({
      id: "p-auto-approve",
      status: "pending_approval",
      wDelta: 0.25,
      residualRisks: [],
    });
    insertProposalRow(db, proposal);
    mockPendingQueue(proposal);
    vi.spyOn(integration, "exportToRuntime").mockReturnValue({
      success: true,
      content: "{}",
      editHash: "edit-hash",
      evalReceiptHash: "eval-hash",
      preVersion: "1.0.0",
      preHash: "pre-hash",
      postVersion: "1.0.0-rev-1",
      postHash: "post-hash",
    });

    const result = await runDreamCycle(db, { ...DEFAULT_SKILLFORGE_CONFIG, minTraceAgeHours: 0 });
    expect(result.errors).toHaveLength(0);
    expect(result.autoApproved).toBe(1);
    expect(result.applied).toBe(1);
    expect(result.report).toContain("Auto-approved | 1 |");
  });

  it("escalates high-risk proposals with low W delta or residual risks", async () => {
    const lowDelta = makeProposal({
      id: "p-low-delta",
      status: "pending_approval",
      wDelta: 0.05,
      residualRisks: [],
    });
    const risky = makeProposal({
      id: "p-risky",
      status: "pending_approval",
      wDelta: 0.3,
      residualRisks: ["policy-risk"],
    });
    insertProposalRow(db, lowDelta);
    insertProposalRow(db, risky);
    mockPendingQueue(lowDelta, risky);

    const result = await runDreamCycle(db, { ...DEFAULT_SKILLFORGE_CONFIG, minTraceAgeHours: 0 });
    expect(result.escalated).toBe(2);
    expect(result.autoApproved).toBe(0);
    expect(result.report).toContain("Escalated | 2 |");
  });

  it("rejects stale gated proposals older than seven days", async () => {
    const staleAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    db.prepare(
      `INSERT INTO skillforge_proposals
        (id, source_skill_id, source_version, proposed_diff, status, rejected_edits, residual_risks, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'gated', '[]', '[]', ?, ?)`
    ).run("p-stale", "1", "1.0.0", "diff", staleAt, staleAt);

    const result = await runDreamCycle(db, { ...DEFAULT_SKILLFORGE_CONFIG, minTraceAgeHours: 0 });
    expect(result.rejected).toBe(1);
    expect(result.report).toContain("Rejected (stale) | 1 |");
    const row = db.prepare(`SELECT status FROM skillforge_proposals WHERE id = ?`).get("p-stale") as { status: string };
    expect(row.status).toBe("rejected");
  });

  it("records worker failures in the report", async () => {
    workerRun.mockRejectedValue(new Error("worker pipeline failed"));

    const result = await runDreamCycle(db, { ...DEFAULT_SKILLFORGE_CONFIG, minTraceAgeHours: 0 });
    expect(result.errors).toEqual(["worker pipeline failed"]);
    expect(result.report).toContain("Errors:");
    expect(result.report).toContain("- worker pipeline failed");
  });
});
