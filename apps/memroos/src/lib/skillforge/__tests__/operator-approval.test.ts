/**
 * SkillForge Operator Approval tests — Phase 89
 */

import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { listProposals, getProposal, applyApprovalAction, markApplied, rollbackProposal } from "../operator-approval";
import type { SkillForgeProposal } from "../types";

function makeProposal(id: string, status: string): SkillForgeProposal {
  return {
    id,
    sealProposalId: null,
    sourceSkillId: "skill-1",
    sourceVersion: "1.0.0",
    proposedDiff: "test diff",
    status: status as any,
    trainSplitId: null,
    validationResults: null,
    heldOutResults: null,
    wDelta: null,
    rejectedEdits: [],
    residualRisks: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe("SkillForge Operator Approval", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(`
      CREATE TABLE skillforge_proposals (
        id TEXT PRIMARY KEY,
        seal_proposal_id TEXT,
        source_skill_id TEXT NOT NULL,
        source_version TEXT NOT NULL,
        proposed_diff TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        train_split_id TEXT,
        validation_results TEXT,
        held_out_results TEXT,
        w_delta REAL,
        rejected_edits TEXT NOT NULL DEFAULT '[]',
        residual_risks TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE skillforge_exports (
        id INTEGER PRIMARY KEY,
        proposal_id TEXT NOT NULL,
        pre_version TEXT,
        pre_hash TEXT,
        pre_raw_body TEXT,
        created_at TEXT NOT NULL
      );
      CREATE TABLE audit_entries (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        actor_role TEXT NOT NULL,
        event_type TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        reason TEXT,
        metadata_json TEXT,
        created_at TEXT NOT NULL
      );
    `);
  });

  it("lists proposals grouped by status", () => {
    const insert = db.prepare(
      `INSERT INTO skillforge_proposals (id, source_skill_id, source_version, proposed_diff, status, rejected_edits, residual_risks, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    insert.run("p1", "skill-1", "1.0.0", "diff1", "pending", "[]", "[]", new Date().toISOString(), new Date().toISOString());
    insert.run("p2", "skill-1", "1.0.0", "diff2", "gated", "[]", "[]", new Date().toISOString(), new Date().toISOString());

    const queue = listProposals(db);
    expect(queue.pending.length).toBe(1);
    expect(queue.gated.length).toBe(1);
  });

  it("gets a proposal by id", () => {
    db.prepare(
      `INSERT INTO skillforge_proposals (id, source_skill_id, source_version, proposed_diff, status, rejected_edits, residual_risks, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run("p1", "skill-1", "1.0.0", "diff1", "pending", "[]", "[]", new Date().toISOString(), new Date().toISOString());

    const proposal = getProposal(db, "p1");
    expect(proposal).not.toBeNull();
    expect(proposal?.id).toBe("p1");
  });

  it("returns null for missing proposal", () => {
    const proposal = getProposal(db, "missing");
    expect(proposal).toBeNull();
  });

  it("approves a pending_approval proposal", () => {
    db.prepare(
      `INSERT INTO skillforge_proposals (id, source_skill_id, source_version, proposed_diff, status, rejected_edits, residual_risks, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run("p1", "skill-1", "1.0.0", "diff1", "pending_approval", "[]", "[]", new Date().toISOString(), new Date().toISOString());

    const result = applyApprovalAction(db, { proposalId: "p1", action: "approve", operator: "test" });
    expect(result.success).toBe(true);

    const updated = getProposal(db, "p1");
    expect(updated?.status).toBe("approved");
  });

  it("rejects a proposal", () => {
    db.prepare(
      `INSERT INTO skillforge_proposals (id, source_skill_id, source_version, proposed_diff, status, rejected_edits, residual_risks, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run("p1", "skill-1", "1.0.0", "diff1", "pending", "[]", "[]", new Date().toISOString(), new Date().toISOString());

    const result = applyApprovalAction(db, { proposalId: "p1", action: "reject", operator: "test" });
    expect(result.success).toBe(true);

    const updated = getProposal(db, "p1");
    expect(updated?.status).toBe("rejected");
  });

  it("fails to approve non-pending_approval proposal", () => {
    db.prepare(
      `INSERT INTO skillforge_proposals (id, source_skill_id, source_version, proposed_diff, status, rejected_edits, residual_risks, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run("p1", "skill-1", "1.0.0", "diff1", "pending", "[]", "[]", new Date().toISOString(), new Date().toISOString());

    const result = applyApprovalAction(db, { proposalId: "p1", action: "approve", operator: "test" });
    expect(result.success).toBe(false);
  });

  it("marks applied after approval", () => {
    db.prepare(
      `INSERT INTO skillforge_proposals (id, source_skill_id, source_version, proposed_diff, status, rejected_edits, residual_risks, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run("p1", "skill-1", "1.0.0", "diff1", "approved", "[]", "[]", new Date().toISOString(), new Date().toISOString());

    const result = markApplied(db, "p1");
    expect(result.success).toBe(true);

    const updated = getProposal(db, "p1");
    expect(updated?.status).toBe("applied");
  });

  it("fails to mark applied if not approved", () => {
    db.prepare(
      `INSERT INTO skillforge_proposals (id, source_skill_id, source_version, proposed_diff, status, rejected_edits, residual_risks, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run("p1", "skill-1", "1.0.0", "diff1", "pending", "[]", "[]", new Date().toISOString(), new Date().toISOString());

    const result = markApplied(db, "p1");
    expect(result.success).toBe(false);
  });

  it("requests changes by moving a gated proposal back to pending", () => {
    db.prepare(
      `INSERT INTO skillforge_proposals (id, source_skill_id, source_version, proposed_diff, status, rejected_edits, residual_risks, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run("p-change", "skill-1", "1.0.0", "diff1", "gated", "[]", "[]", new Date().toISOString(), new Date().toISOString());

    const result = applyApprovalAction(db, {
      proposalId: "p-change",
      action: "request_changes",
      operator: "reviewer",
      reasoning: "needs more evidence",
    });
    expect(result.success).toBe(true);
    expect(getProposal(db, "p-change")?.status).toBe("pending");
  });

  it("lists approved and rejected proposals in separate queues", () => {
    const insert = db.prepare(
      `INSERT INTO skillforge_proposals (id, source_skill_id, source_version, proposed_diff, status, rejected_edits, residual_risks, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    insert.run("approved-1", "skill-1", "1.0.0", "diff", "approved", "[]", "[]", new Date().toISOString(), new Date().toISOString());
    insert.run("rejected-1", "skill-1", "1.0.0", "diff", "rejected", "[]", "[]", new Date().toISOString(), new Date().toISOString());

    const queue = listProposals(db);
    expect(queue.approved.map((proposal) => proposal.id)).toContain("approved-1");
    expect(queue.rejected.map((proposal) => proposal.id)).toContain("rejected-1");
  });

  it("rolls back an applied proposal without export history as status-only honesty", () => {
    db.prepare(
      `INSERT INTO skillforge_proposals (id, source_skill_id, source_version, proposed_diff, status, rejected_edits, residual_risks, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run("rollback-1", "skill-1", "1.0.0", "diff", "applied", "[]", "[]", new Date().toISOString(), new Date().toISOString());

    const result = rollbackProposal(db, "rollback-1", "operator", "undo export");
    expect(result.success).toBe(true);
    expect(result.restored).toBe(false);
    expect(result.proposalState).toBe("pending_approval");
    expect(getProposal(db, "rollback-1")?.status).toBe("pending_approval");
  });

  it("falls back safely when proposal JSON columns are malformed", () => {
    db.prepare(
      `INSERT INTO skillforge_proposals
        (id, source_skill_id, source_version, proposed_diff, status, validation_results, held_out_results, rejected_edits, residual_risks, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "malformed-json",
      "skill-1",
      "1.0.0",
      "diff",
      "pending",
      "{not-json",
      "{not-json",
      "{not-json",
      "{not-json",
      new Date().toISOString(),
      new Date().toISOString(),
    );

    const proposal = getProposal(db, "malformed-json");
    expect(proposal?.validationResults).toBeNull();
    expect(proposal?.heldOutResults).toBeNull();
    expect(proposal?.rejectedEdits).toEqual([]);
    expect(proposal?.residualRisks).toEqual([]);
  });

  it("returns typed errors for missing proposals, unknown actions, and invalid rollback states", () => {
    expect(applyApprovalAction(db, { proposalId: "missing", action: "reject", operator: "test" })).toEqual({
      success: false,
      error: "Proposal not found",
    });

    db.prepare(
      `INSERT INTO skillforge_proposals (id, source_skill_id, source_version, proposed_diff, status, rejected_edits, residual_risks, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run("p-errors", "skill-1", "1.0.0", "diff", "pending", "[]", "[]", new Date().toISOString(), new Date().toISOString());

    expect(applyApprovalAction(db, { proposalId: "p-errors", action: "rollback", operator: "test" })).toMatchObject({
      success: false,
      error: expect.stringMatching(/Cannot rollback/),
    });
    expect(applyApprovalAction(db, { proposalId: "p-errors", action: "unknown" as never, operator: "test" })).toEqual({
      success: false,
      error: "Unknown action",
    });
    expect(rollbackProposal(db, "missing")).toEqual({
      success: false,
      restored: false,
      error: "Proposal not found",
    });
    expect(rollbackProposal(db, "p-errors")).toMatchObject({
      success: false,
      restored: false,
      error: expect.stringMatching(/Cannot rollback/),
    });
    expect(markApplied(db, "missing")).toEqual({
      success: false,
      error: "Proposal not found",
    });
  });

  it("logs SEAL audit details when approving a proposal linked to SEAL", () => {
    db.exec(`
      CREATE TABLE seal_audit_log (
        id INTEGER PRIMARY KEY,
        proposal_id TEXT NOT NULL,
        event TEXT NOT NULL,
        detail TEXT,
        timestamp TEXT NOT NULL
      );
    `);
    db.prepare(
      `INSERT INTO skillforge_proposals (id, seal_proposal_id, source_skill_id, source_version, proposed_diff, status, rejected_edits, residual_risks, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run("p-seal", "seal-1", "skill-1", "1.0.0", "diff", "gated", "[]", "[]", new Date().toISOString(), new Date().toISOString());

    const result = applyApprovalAction(db, {
      proposalId: "p-seal",
      action: "approve",
      operator: "operator-1",
      reasoning: "passes gates",
    });

    expect(result.success).toBe(true);
    const audit = db.prepare("SELECT event, detail FROM seal_audit_log WHERE proposal_id = ?").get("seal-1") as { event: string; detail: string };
    expect(audit.event).toBe("approved");
    expect(JSON.parse(audit.detail)).toEqual({ operator: "operator-1", reasoning: "passes gates" });
  });

  it("applyApprovalAction rollback restores registry state from export history", () => {
    db.exec(`
      CREATE TABLE skill_registry (
        id INTEGER PRIMARY KEY,
        version TEXT,
        content_hash TEXT,
        raw_body TEXT,
        imported_at TEXT
      );
    `);
    db.prepare("INSERT INTO skill_registry (id, version, content_hash, raw_body, imported_at) VALUES (?, ?, ?, ?, ?)")
      .run(1, "2.0.0", "post-hash", "post body", new Date().toISOString());
    db.prepare(
      `INSERT INTO skillforge_proposals (id, source_skill_id, source_version, proposed_diff, status, rejected_edits, residual_risks, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run("rollback-export", "1", "1.0.0", "diff", "applied", "[]", "[]", new Date().toISOString(), new Date().toISOString());
    db.prepare("INSERT INTO skillforge_exports (proposal_id, pre_version, pre_hash, pre_raw_body, created_at) VALUES (?, ?, ?, ?, ?)")
      .run("rollback-export", "1.0.0", "pre-hash", "pre body", new Date().toISOString());

    const result = applyApprovalAction(db, {
      proposalId: "rollback-export",
      action: "rollback",
      operator: "operator",
      reasoning: "restore previous export",
    });

    expect(result).toMatchObject({
      success: true,
      postState: "pending_approval",
      restored: true,
      preVersion: "2.0.0",
      preHash: "post-hash",
      postVersion: "1.0.0",
      postHash: "pre-hash",
    });
    const row = db.prepare("SELECT version, content_hash, raw_body FROM skill_registry WHERE id = 1").get() as {
      version: string;
      content_hash: string;
      raw_body: string;
    };
    expect(row).toEqual({ version: "1.0.0", content_hash: "pre-hash", raw_body: "pre body" });
  });

  it("rollbackProposal restores from raw body when the export omitted a pre_hash", () => {
    db.exec(`
      CREATE TABLE skill_registry (
        id INTEGER PRIMARY KEY,
        version TEXT,
        content_hash TEXT,
        raw_body TEXT,
        imported_at TEXT
      );
    `);
    db.prepare("INSERT INTO skill_registry (id, version, content_hash, raw_body, imported_at) VALUES (?, ?, ?, ?, ?)")
      .run(2, "2.0.0", "post-hash", "post body", new Date().toISOString());
    db.prepare(
      `INSERT INTO skillforge_proposals (id, source_skill_id, source_version, proposed_diff, status, rejected_edits, residual_risks, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run("rollback-raw", "2", "1.0.0", "diff", "exported", "[]", "[]", new Date().toISOString(), new Date().toISOString());
    db.prepare("INSERT INTO skillforge_exports (proposal_id, pre_version, pre_hash, pre_raw_body, created_at) VALUES (?, ?, ?, ?, ?)")
      .run("rollback-raw", "1.0.0", null, "pre body", new Date().toISOString());

    const result = rollbackProposal(db, "rollback-raw", "operator", "restore raw");

    expect(result.success).toBe(true);
    expect(result.restored).toBe(true);
    expect(result.postVersion).toBe("1.0.0");
    expect(result.postHash).toMatch(/^[a-f0-9]{64}$/);
    expect(getProposal(db, "rollback-raw")?.status).toBe("pending_approval");
  });
});
