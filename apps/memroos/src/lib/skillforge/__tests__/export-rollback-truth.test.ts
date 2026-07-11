// @vitest-environment node
/**
 * VAL-SKILL-036 / VAL-SKILL-037 — SkillForge export/rollback truthfulness.
 * Covers:
 * - approval alone does NOT export runtime
 * - export binds edit_hash, eval receipt hash, split IDs, W metrics, typed ops
 * - export records pre/post version/hash with audit entry and actor
 * - rollback restores registry boundary truthfully or reports status-only
 * - transactions around approve/export/apply
 */
import { beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { createHash } from "crypto";

import { applyApprovalAction, getProposal, listProposals, rollbackProposal } from "../operator-approval";
import { exportToRuntime } from "../integration";
import { runDreamCycle } from "../dream-cycle";
import { DEFAULT_SKILLFORGE_CONFIG } from "../types";
import type { SkillForgeProposal } from "../types";

function makeProposal(overrides: Partial<SkillForgeProposal> & { id: string; status: string }): SkillForgeProposal {
  return {
    id: overrides.id,
    sealProposalId: overrides.sealProposalId ?? null,
    sourceSkillId: overrides.sourceSkillId ?? "1",
    sourceVersion: overrides.sourceVersion ?? "1.0.0",
    proposedDiff: overrides.proposedDiff ?? "+++ fix\n+improved trigger",
    status: overrides.status as any,
    editHash: overrides.editHash,
    trainSplitId: overrides.trainSplitId ?? "train-split-1",
    validationSplitId: overrides.validationSplitId ?? "val-split-1",
    heldOutSplitId: overrides.heldOutSplitId ?? "held-split-1",
    baselineW: overrides.baselineW ?? 0.5,
    validationW: overrides.validationW ?? 0.75,
    heldOutW: overrides.heldOutW ?? 0.8,
    validationResults: overrides.validationResults ?? {
      triggerRoutingAccuracy: 0.8,
      contractCompleteness: 0.9,
      resolverReachability: 0.85,
      overallScore: 0.85,
    },
    heldOutResults: overrides.heldOutResults ?? {
      passRate: 0.9,
      tasksRun: 10,
      tasksPassed: 9,
      avgLatencyMs: 100,
      behavioralW: 0.8,
      baselineW: 0.5,
      treatmentW: 0.8,
      scorerVersion: "v1",
    },
    wDelta: overrides.wDelta ?? 0.25,
    evaluatorReceipts: overrides.evaluatorReceipts ?? [
      { evaluator: "judge-1", score: 0.9 },
      { evaluator: "judge-2", score: 0.85 },
    ],
    typedEditOps: overrides.typedEditOps ?? [{ op: "add", path: "/skill/triggers", value: "new trigger" }],
    rejectedEdits: overrides.rejectedEdits ?? [],
    residualRisks: overrides.residualRisks ?? [],
    createdAt: overrides.createdAt ?? new Date(),
    updatedAt: overrides.updatedAt ?? new Date(),
  };
}

function setupDb(): Database.Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE skill_registry (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      owner TEXT,
      source_harness TEXT NOT NULL DEFAULT 'claude',
      risk_tier TEXT,
      dispatch_status TEXT NOT NULL DEFAULT 'enabled',
      version TEXT,
      preconditions TEXT,
      allowed_tools TEXT,
      verification_checks TEXT,
      rollback_behavior TEXT,
      raw_body TEXT NOT NULL DEFAULT 'original body',
      completeness_pct INTEGER NOT NULL DEFAULT 100,
      missing_fields_json TEXT NOT NULL DEFAULT '[]',
      imported_by TEXT NOT NULL DEFAULT 'operator',
      imported_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      evidence_examples TEXT,
      content_hash TEXT,
      signature TEXT,
      signed_by TEXT,
      signed_at TEXT,
      trust_level TEXT NOT NULL DEFAULT 'unsigned'
    );
    CREATE TABLE skillforge_proposals (
      id TEXT PRIMARY KEY,
      seal_proposal_id TEXT,
      source_skill_id TEXT NOT NULL,
      source_version TEXT NOT NULL,
      proposed_diff TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      edit_hash TEXT,
      train_split_id TEXT,
      validation_split_id TEXT,
      held_out_split_id TEXT,
      baseline_w REAL,
      validation_w REAL,
      held_out_w REAL,
      validation_results TEXT,
      held_out_results TEXT,
      w_delta REAL,
      evaluator_receipts TEXT NOT NULL DEFAULT '[]',
      typed_edit_ops TEXT NOT NULL DEFAULT '[]',
      rejected_edits TEXT NOT NULL DEFAULT '[]',
      residual_risks TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE skillforge_rejected_edits (
      id TEXT PRIMARY KEY,
      edit_hash TEXT NOT NULL,
      reason TEXT NOT NULL,
      rejected_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
    CREATE TABLE skillforge_run_log (
      run_id TEXT PRIMARY KEY,
      started_at TEXT NOT NULL,
      completed_at TEXT NOT NULL,
      status TEXT NOT NULL,
      entries_processed INTEGER NOT NULL DEFAULT 0,
      proposals_created INTEGER NOT NULL DEFAULT 0,
      proposals_submitted INTEGER NOT NULL DEFAULT 0,
      errors TEXT
    );
    CREATE TABLE skillforge_splits (
      id TEXT PRIMARY KEY,
      skill_id TEXT NOT NULL,
      split_type TEXT NOT NULL,
      task_samples TEXT,
      created_at TEXT
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
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );
    CREATE TABLE skillforge_exports (
      id TEXT PRIMARY KEY,
      proposal_id TEXT NOT NULL,
      skill_id TEXT NOT NULL,
      skill_registry_id INTEGER,
      pre_version TEXT,
      pre_hash TEXT,
      pre_raw_body TEXT,
      post_version TEXT,
      post_hash TEXT,
      edit_hash TEXT,
      eval_receipt_hash TEXT,
      actor TEXT,
      created_at TEXT NOT NULL
    );
  `);
  return db;
}

function insertRegistryRow(db: Database.Database, overrides: { id?: number; name?: string; version?: string; content_hash?: string; raw_body?: string } = {}) {
  db.prepare(
    `INSERT INTO skill_registry (id, name, version, content_hash, raw_body, imported_by) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    overrides.id ?? 1,
    overrides.name ?? "test-skill",
    overrides.version ?? "1.0.0",
    overrides.content_hash ?? "orig-hash-abc",
    overrides.raw_body ?? "original body",
    "operator"
  );
}

function insertProposalRow(db: Database.Database, p: SkillForgeProposal) {
  db.prepare(
    `INSERT INTO skillforge_proposals
      (id, seal_proposal_id, source_skill_id, source_version, proposed_diff, status, edit_hash, train_split_id, validation_split_id, held_out_split_id, baseline_w, validation_w, held_out_w, validation_results, held_out_results, w_delta, evaluator_receipts, typed_edit_ops, rejected_edits, residual_risks, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    p.id,
    p.sealProposalId,
    p.sourceSkillId,
    p.sourceVersion,
    p.proposedDiff,
    p.status,
    p.editHash ?? null,
    p.trainSplitId,
    p.validationSplitId ?? null,
    p.heldOutSplitId ?? null,
    p.baselineW ?? null,
    p.validationW ?? null,
    p.heldOutW ?? null,
    JSON.stringify(p.validationResults),
    JSON.stringify(p.heldOutResults),
    p.wDelta,
    JSON.stringify(p.evaluatorReceipts ?? []),
    JSON.stringify(p.typedEditOps ?? []),
    JSON.stringify(p.rejectedEdits),
    JSON.stringify(p.residualRisks),
    p.createdAt.toISOString(),
    p.updatedAt.toISOString()
  );
}

describe("VAL-SKILL-036 approval alone does not export runtime", () => {
  let db: Database.Database;
  beforeEach(() => {
    db = setupDb();
    insertRegistryRow(db);
  });

  it("approve moves to approved but does not auto-export registry", () => {
    const proposal = makeProposal({ id: "p-approve-1", status: "pending_approval" });
    insertProposalRow(db, proposal);

    const preVersion = (db.prepare(`SELECT version FROM skill_registry WHERE id = 1`).get() as { version: string }).version;

    const approval = applyApprovalAction(db, {
      proposalId: proposal.id,
      action: "approve",
      operator: "operator-test",
      reasoning: "looks good",
    });
    expect(approval.success).toBe(true);
    expect(approval.postState).toBe("approved");

    const updated = getProposal(db, proposal.id);
    expect(updated?.status).toBe("approved");

    const postVersion = (db.prepare(`SELECT version FROM skill_registry WHERE id = 1`).get() as { version: string }).version;
    expect(postVersion).toBe(preVersion); // registry unchanged by approval alone

    // no export audit yet
    const exports = db.prepare(`SELECT COUNT(*) as c FROM audit_entries WHERE event_type = 'skillforge.exported'`).get() as { c: number };
    expect(exports.c).toBe(0);
  });

  it("dream-cycle auto-approve does not export (decoupled)", async () => {
    const proposal = makeProposal({
      id: "p-dream-1",
      status: "pending_approval",
      wDelta: 0.3,
      residualRisks: [],
    });
    insertProposalRow(db, proposal);
    // also need skill_registry for worker
    db.prepare(`INSERT OR IGNORE INTO skill_registry (id, name, imported_by, raw_body) VALUES (2, 'other', 'test', 'body')`).run();

    const result = await runDreamCycle(db, { ...DEFAULT_SKILLFORGE_CONFIG, minTraceAgeHours: 0 });
    expect(result.errors).toHaveLength(0);
    const updated = getProposal(db, "p-dream-1");
    // if risk passes, it becomes approved, not exported/applied
    if (updated) {
      expect(["approved", "pending_approval", "gated"]).toContain(updated.status);
      expect(updated.status).not.toBe("exported");
      expect(updated.status).not.toBe("applied");
    }

    // registry version unchanged for dream-cycle decoupled path
    const ver = (db.prepare(`SELECT version FROM skill_registry WHERE id = 1`).get() as { version: string }).version;
    expect(ver).toBe("1.0.0");
  });
});

describe("VAL-SKILL-037 export binds hashes and records truthfully", () => {
  let db: Database.Database;
  beforeEach(() => {
    db = setupDb();
    insertRegistryRow(db, { id: 1, version: "1.0.0", content_hash: "orig-hash-abc", raw_body: "original body" });
  });

  it("export includes edit_hash, eval receipt hash, split IDs, W values, typed ops", () => {
    const proposal = makeProposal({ id: "p-export-1", status: "approved" });
    insertProposalRow(db, proposal);

    const result = exportToRuntime(db, proposal, "alice");
    expect(result.success).toBe(true);
    expect(result.content).toBeTruthy();
    expect(result.editHash).toBeTruthy();
    expect(result.evalReceiptHash).toBeTruthy();
    expect(result.preVersion).toBe("1.0.0");
    expect(result.preHash).toBe("orig-hash-abc");
    expect(result.postVersion).toContain("rev-");
    expect(result.postHash).toBeTruthy();

    const parsed = JSON.parse(result.content!);
    const expectedEditHash = createHash("sha256").update(proposal.proposedDiff).digest("hex");
    expect(parsed.edit_hash).toBe(expectedEditHash);
    expect(parsed.validation_split_id).toBe("val-split-1");
    expect(parsed.held_out_split_id).toBe("held-split-1");
    expect(parsed.train_split_id).toBe("train-split-1");
    expect(parsed.baseline_w).toBe(0.5);
    expect(parsed.validation_w).toBe(0.75);
    expect(parsed.held_out_w).toBe(0.8);
    expect(parsed.evaluator_receipts).toHaveLength(2);
    expect(parsed.typed_edit_ops).toHaveLength(1);
    expect(parsed.pre_version).toBe("1.0.0");
    expect(parsed.pre_hash).toBe("orig-hash-abc");
    expect(parsed.post_version).toBe(parsed.version);
  });

  it("export writes audit entry with actor and pre/post hashes", () => {
    const proposal = makeProposal({ id: "p-export-audit", status: "approved" });
    insertProposalRow(db, proposal);

    const result = exportToRuntime(db, proposal, "bob");
    expect(result.success).toBe(true);

    const auditRow = db.prepare(`SELECT actor_id, event_type, metadata_json FROM audit_entries WHERE event_type = 'skillforge.exported' ORDER BY created_at DESC LIMIT 1`).get() as
      | { actor_id: string; event_type: string; metadata_json: string }
      | undefined;
    expect(auditRow).toBeTruthy();
    expect(auditRow!.actor_id).toBe("bob");
    expect(auditRow!.event_type).toBe("skillforge.exported");
    const meta = JSON.parse(auditRow!.metadata_json);
    expect(meta.pre_version).toBe("1.0.0");
    expect(meta.pre_hash).toBe("orig-hash-abc");
    expect(meta.post_version).toBeTruthy();
    expect(meta.post_hash).toBeTruthy();
    expect(meta.edit_hash).toBe(createHash("sha256").update(proposal.proposedDiff).digest("hex"));
    expect(meta.eval_receipt_hash).toBeTruthy();
    expect(meta.validation_split_id).toBe("val-split-1");
    expect(meta.held_out_split_id).toBe("held-split-1");
  });

  it("export sets proposal status to exported and updates registry boundary", () => {
    const proposal = makeProposal({ id: "p-export-boundary", status: "approved" });
    insertProposalRow(db, proposal);

    const result = exportToRuntime(db, proposal, "carol");
    expect(result.success).toBe(true);

    const updated = getProposal(db, proposal.id);
    expect(updated?.status).toBe("exported");

    const reg = db.prepare(`SELECT version, content_hash, raw_body FROM skill_registry WHERE id = 1`).get() as {
      version: string;
      content_hash: string;
      raw_body: string;
    };
    expect(reg.version).toBe(result.postVersion);
    expect(reg.content_hash).toBe(result.postHash);
    expect(reg.raw_body).toContain("original body");
    expect(reg.raw_body).toContain(proposal.proposedDiff);

    const exportLog = db.prepare(`SELECT pre_version, pre_hash, post_version, post_hash, edit_hash, actor FROM skillforge_exports WHERE proposal_id = ?`).get(proposal.id) as any;
    expect(exportLog).toBeTruthy();
    expect(exportLog.pre_version).toBe("1.0.0");
    expect(exportLog.pre_hash).toBe("orig-hash-abc");
    expect(exportLog.post_version).toBe(result.postVersion);
    expect(exportLog.actor).toBe("carol");
  });

  it("export fails for non-approved status", () => {
    const proposal = makeProposal({ id: "p-export-fail", status: "pending" });
    insertProposalRow(db, proposal);
    const result = exportToRuntime(db, proposal, "eve");
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Cannot export/);
  });
});

describe("VAL-SKILL-037 rollback restores boundary truthfully", () => {
  let db: Database.Database;
  beforeEach(() => {
    db = setupDb();
    insertRegistryRow(db, { id: 1, version: "1.0.0", content_hash: "orig-hash-abc", raw_body: "original body" });
  });

  it("rollback restores registry to prior version/hash and reports truthful result", () => {
    const proposal = makeProposal({ id: "p-rb-1", status: "approved" });
    insertProposalRow(db, proposal);

    // Export first
    const exp = exportToRuntime(db, proposal, "alice");
    expect(exp.success).toBe(true);
    const afterExport = db.prepare(`SELECT version, content_hash, raw_body FROM skill_registry WHERE id = 1`).get() as any;
    expect(afterExport.version).not.toBe("1.0.0");

    // Rollback
    const rb = rollbackProposal(db, proposal.id, "alice", "bad export");
    expect(rb.success).toBe(true);
    expect(rb.restored).toBe(true);
    expect(rb.preVersion).toBe(afterExport.version);
    expect(rb.preHash).toBe(afterExport.content_hash);
    expect(rb.postVersion).toBe("1.0.0");
    expect(rb.postHash).toBe("orig-hash-abc");
    expect(rb.proposalState).toBe("pending_approval");

    const afterRollback = db.prepare(`SELECT version, content_hash, raw_body FROM skill_registry WHERE id = 1`).get() as any;
    expect(afterRollback.version).toBe("1.0.0");
    expect(afterRollback.content_hash).toBe("orig-hash-abc");
    expect(afterRollback.raw_body).toBe("original body");

    const updated = getProposal(db, proposal.id);
    expect(updated?.status).toBe("pending_approval");

    // Audit truthful
    const auditRow = db.prepare(`SELECT metadata_json FROM audit_entries WHERE event_type = 'skillforge.rolled_back' ORDER BY created_at DESC LIMIT 1`).get() as { metadata_json: string } | undefined;
    expect(auditRow).toBeTruthy();
    const meta = JSON.parse(auditRow!.metadata_json);
    expect(meta.restored).toBe(true);
    expect(meta.pre_version).toBe(afterExport.version);
    expect(meta.post_version).toBe("1.0.0");
  });

  it("rollback reports status-only truthfully when prior row missing", () => {
    // No registry row, no export log — direct applied proposal
    const proposal = makeProposal({ id: "p-rb-noprior", status: "applied", sourceSkillId: "nonexistent-skill" });
    insertProposalRow(db, proposal);

    // Manually set status to exported without export log to simulate missing prior
    db.prepare(`UPDATE skillforge_proposals SET status = 'exported' WHERE id = ?`).run(proposal.id);

    const rb = rollbackProposal(db, proposal.id, "operator", "revert");
    expect(rb.success).toBe(true);
    expect(rb.restored).toBe(false);
    // Should still flip to pending_approval
    const updated = getProposal(db, proposal.id);
    expect(updated?.status).toBe("pending_approval");
  });

  it("rollback via applyApprovalAction action=rollback uses transactional truthful path", () => {
    const proposal = makeProposal({ id: "p-rb-action", status: "approved" });
    insertProposalRow(db, proposal);
    const exp = exportToRuntime(db, proposal, "alice");
    expect(exp.success).toBe(true);

    const result = applyApprovalAction(db, {
      proposalId: proposal.id,
      action: "rollback",
      operator: "operator",
      reasoning: "rollback test",
    });
    expect(result.success).toBe(true);
    expect(result.postState).toBe("pending_approval");

    const reg = db.prepare(`SELECT version FROM skill_registry WHERE id = 1`).get() as { version: string };
    expect(reg.version).toBe("1.0.0"); // restored
  });
});

describe("transactions around approve/export/apply", () => {
  let db: Database.Database;
  beforeEach(() => {
    db = setupDb();
    insertRegistryRow(db);
  });

  it("approve and export each use transaction and leave consistent state on success", () => {
    const proposal = makeProposal({ id: "p-tx-1", status: "pending_approval" });
    insertProposalRow(db, proposal);

    // Approve is transactional (writes proposal + audit atomically)
    const appr = applyApprovalAction(db, { proposalId: proposal.id, action: "approve", operator: "op", reasoning: "ok" });
    expect(appr.success).toBe(true);

    // Export is transactional (registry + export log + proposal status + audit)
    const proposalAfterApprove = getProposal(db, proposal.id)!;
    const exp = exportToRuntime(db, proposalAfterApprove, "op");
    expect(exp.success).toBe(true);

    // All artifacts exist
    const reg = db.prepare(`SELECT version FROM skill_registry WHERE id = 1`).get() as { version: string };
    expect(reg.version).toBe(exp.postVersion);
    const exportCount = (db.prepare(`SELECT COUNT(*) as c FROM skillforge_exports WHERE proposal_id = ?`).get(proposal.id) as { c: number }).c;
    expect(exportCount).toBe(1);
    const auditCount = (db.prepare(`SELECT COUNT(*) as c FROM audit_entries WHERE entity_id = ? AND event_type = 'skillforge.exported'`).get(`skillforge_proposal:${proposal.id}`) as { c: number }).c;
    expect(auditCount).toBe(1);
  });
});
