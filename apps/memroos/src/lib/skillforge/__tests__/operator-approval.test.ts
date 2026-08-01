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

  it("returns not found for missing proposals in applyApprovalAction and markApplied", () => {
    expect(applyApprovalAction(db, { proposalId: "missing", action: "approve", operator: "op" }).error).toBe(
      "Proposal not found"
    );
    expect(markApplied(db, "missing").error).toBe("Proposal not found");
  });

  it("approves a gated proposal and rejects rollback while still pending", () => {
    db.prepare(
      `INSERT INTO skillforge_proposals (id, source_skill_id, source_version, proposed_diff, status, rejected_edits, residual_risks, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run("gated-1", "skill-1", "1.0.0", "diff", "gated", "[]", "[]", new Date().toISOString(), new Date().toISOString());

    const rollbackDenied = applyApprovalAction(db, {
      proposalId: "gated-1",
      action: "rollback",
      operator: "reviewer",
    });
    expect(rollbackDenied.success).toBe(false);
    expect(rollbackDenied.error).toMatch(/Cannot rollback/);

    const approved = applyApprovalAction(db, { proposalId: "gated-1", action: "approve", operator: "reviewer" });
    expect(approved.success).toBe(true);
    expect(approved.postState).toBe("approved");
  });

  it("restores registry state from export history during rollbackProposal", () => {
    db.exec(`
      CREATE TABLE skill_registry (
        id INTEGER PRIMARY KEY,
        version TEXT,
        content_hash TEXT,
        raw_body TEXT,
        imported_at TEXT
      );
    `);
    db.prepare(
      `INSERT INTO skill_registry (id, version, content_hash, raw_body, imported_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(42, "2.0.0", "hash-new", "## New body", new Date().toISOString());

    db.prepare(
      `INSERT INTO skillforge_proposals (id, source_skill_id, source_version, proposed_diff, status, rejected_edits, residual_risks, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run("restore-1", "42", "2.0.0", "diff", "exported", "[]", "[]", new Date().toISOString(), new Date().toISOString());

    db.prepare(
      `INSERT INTO skillforge_exports (proposal_id, pre_version, pre_hash, pre_raw_body, created_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run("restore-1", "1.0.0", "hash-old", "## Old body", new Date().toISOString());

    const result = rollbackProposal(db, "restore-1", "operator", "restore prior export");
    expect(result.success).toBe(true);
    expect(result.restored).toBe(true);
    expect(result.preVersion).toBe("2.0.0");
    expect(result.postVersion).toBe("1.0.0");

    const row = db.prepare(`SELECT version, content_hash, raw_body FROM skill_registry WHERE id = ?`).get(42) as {
      version: string;
      content_hash: string;
      raw_body: string;
    };
    expect(row.version).toBe("1.0.0");
    expect(row.content_hash).toBe("hash-old");
    expect(row.raw_body).toBe("## Old body");
  });

  it("applyApprovalAction rollback restores registry and writes audit metadata", () => {
    db.exec(`
      CREATE TABLE skill_registry (
        id INTEGER PRIMARY KEY,
        version TEXT,
        content_hash TEXT,
        raw_body TEXT,
        imported_at TEXT
      );
    `);
    db.prepare(
      `INSERT INTO skill_registry (id, version, content_hash, raw_body, imported_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(7, "9.9.9", "hash-live", "## Live", new Date().toISOString());

    db.prepare(
      `INSERT INTO skillforge_proposals (id, source_skill_id, source_version, proposed_diff, status, rejected_edits, residual_risks, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run("rb-action", "7", "9.9.9", "diff", "approved", "[]", "[]", new Date().toISOString(), new Date().toISOString());
    db.prepare(
      `INSERT INTO skillforge_exports (proposal_id, pre_version, pre_hash, pre_raw_body, created_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run("rb-action", "1.0.0", null, "## Restored via action", new Date().toISOString());

    const result = applyApprovalAction(db, {
      proposalId: "rb-action",
      action: "rollback",
      operator: "operator",
      reasoning: "undo",
    });
    expect(result.success).toBe(true);
    expect(result.restored).toBe(true);
    expect(result.postState).toBe("pending_approval");

    const audit = db
      .prepare(`SELECT metadata_json FROM audit_entries WHERE event_type = 'skillforge.rolled_back'`)
      .get() as { metadata_json: string };
    const meta = JSON.parse(audit.metadata_json) as Record<string, unknown>;
    expect(meta.restored).toBe(true);
    expect(meta.post_version).toBe("1.0.0");
  });

  it("logs seal audit entries when seal_proposal_id is present", () => {
    db.exec(`
      CREATE TABLE seal_audit_log (
        proposal_id TEXT,
        event TEXT,
        detail TEXT,
        timestamp TEXT
      );
    `);
    db.prepare(
      `INSERT INTO skillforge_proposals (id, seal_proposal_id, source_skill_id, source_version, proposed_diff, status, rejected_edits, residual_risks, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "seal-1",
      "seal-prop-1",
      "skill-1",
      "1.0.0",
      "diff",
      "pending_approval",
      "[]",
      "[]",
      new Date().toISOString(),
      new Date().toISOString()
    );

    applyApprovalAction(db, { proposalId: "seal-1", action: "approve", operator: "seal-op", reasoning: "ok" });
    const row = db.prepare(`SELECT event, detail FROM seal_audit_log WHERE proposal_id = ?`).get("seal-prop-1") as {
      event: string;
      detail: string;
    };
    expect(row.event).toBe("approved");
    expect(JSON.parse(row.detail).operator).toBe("seal-op");
  });

  it("lists analyzing, eval_running, applied, and exported proposals in the right queues", () => {
    const insert = db.prepare(
      `INSERT INTO skillforge_proposals (id, source_skill_id, source_version, proposed_diff, status, rejected_edits, residual_risks, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const now = new Date().toISOString();
    insert.run("analyzing-1", "skill-1", "1.0.0", "d", "analyzing", "[]", "[]", now, now);
    insert.run("eval-1", "skill-1", "1.0.0", "d", "eval_running", "[]", "[]", now, now);
    insert.run("applied-1", "skill-1", "1.0.0", "d", "applied", "[]", "[]", now, now);
    insert.run("exported-1", "skill-1", "1.0.0", "d", "exported", "[]", "[]", now, now);

    const queue = listProposals(db);
    expect(queue.pending.map((p) => p.id).sort()).toEqual(["analyzing-1", "eval-1"]);
    expect(queue.approved.map((p) => p.id).sort()).toEqual(["applied-1", "exported-1"]);
  });
});
