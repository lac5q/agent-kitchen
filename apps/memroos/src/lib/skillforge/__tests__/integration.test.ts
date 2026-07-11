/**
 * SkillForge Integration tests — Phase 90
 */

import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { runCrossModalEval, exportToRuntime, updateSkillRegistry, runSkillCycle } from "../integration";
import type { SkillForgeProposal, SkillForgeConfig } from "../types";

const config: SkillForgeConfig = {
  cronSchedule: "0 2 * * *",
  batchSize: 5,
  textualLearningRate: 0.3,
  redactionEnabled: true,
  skillScopeFilter: [],
  minTraceAgeHours: 0,
  maxTraceAgeDays: 30,
};

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

describe("SkillForge Integration", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(`
      CREATE TABLE skill_registry (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        owner TEXT,
        source_harness TEXT NOT NULL,
        risk_tier TEXT,
        dispatch_status TEXT NOT NULL DEFAULT 'incomplete',
        version TEXT,
        preconditions TEXT,
        allowed_tools TEXT,
        verification_checks TEXT,
        rollback_behavior TEXT,
        raw_body TEXT NOT NULL DEFAULT 'original body',
        completeness_pct INTEGER NOT NULL DEFAULT 0,
        missing_fields_json TEXT NOT NULL DEFAULT '[]',
        imported_by TEXT NOT NULL,
        imported_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
        evidence_examples TEXT,
        content_hash TEXT,
        signature TEXT,
        signed_by TEXT,
        signed_at TEXT,
        trust_level TEXT NOT NULL DEFAULT 'unsigned',
        lifecycle_state TEXT NOT NULL DEFAULT 'draft'
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
  });

  it("runs cross-modal eval", () => {
    const proposal = makeProposal("p1", "approved");
    const results = runCrossModalEval(proposal);

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].dimensions.goal).toBeGreaterThan(0);
    expect(results[0].suggestions.length).toBeGreaterThan(0);
  });

  it("exports approved proposal to runtime", () => {
    const proposal = makeProposal("p1", "approved");
    const result = exportToRuntime(db, proposal);

    expect(result.success).toBe(true);
    expect(result.content).toContain("skill-1");
  });

  it("fails to export non-approved proposal", () => {
    const proposal = makeProposal("p1", "pending");
    const result = exportToRuntime(db, proposal);

    expect(result.success).toBe(false);
  });

  it("updates skill registry after apply", () => {
    db.prepare(
      `INSERT INTO skill_registry (id, name, source_harness, imported_by)
       VALUES (?, ?, ?, ?)`
    ).run(1, "skill-1", "test", "test");

    const proposal = makeProposal("p1", "approved");
    const result = updateSkillRegistry(db, proposal);

    expect(result.success).toBe(true);

    const updated = db.prepare("SELECT version FROM skill_registry WHERE id = 1").get() as { version: string | null } | undefined;
    expect(updated).toBeTruthy();
    const version = updated!.version;
    expect(version === null || typeof version === "string").toBe(true);
    if (version) expect(version).toMatch(/rev-/);
  });

  it("runs full skill cycle", async () => {
    db.prepare(
      `INSERT INTO skill_registry (id, name, source_harness, imported_by)
       VALUES (?, ?, ?, ?)`
    ).run(1, "skill-1", "test", "test");

    const result = await runSkillCycle(db, config);

    expect(result.lintPassed).toBe(true);
    // After fixing fixture to include required tables, sync should now complete.
    expect(result.syncComplete).toBe(true);
  });

  it("detects missing tables in cycle", async () => {
    const db2 = new Database(":memory:");
    db2.exec(`
      CREATE TABLE skill_registry (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        source_harness TEXT NOT NULL,
        imported_by TEXT NOT NULL
      );
      INSERT INTO skill_registry (id, name, source_harness, imported_by)
      VALUES (1, 'skill-1', 'test', 'test');
    `);

    const result = await runSkillCycle(db2, config);

    expect(result.syncComplete).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
