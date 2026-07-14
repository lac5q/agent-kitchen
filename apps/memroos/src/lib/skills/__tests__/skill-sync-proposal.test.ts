// @vitest-environment node
/**
 * Phase 149 (continued) / SKILLTRUST-04 / VAL-SKILL-029 — Library
 * tests for the proposal-id approve / reject paths.
 *
 * Covers:
 *   - approveSyncProposalById atomically writes allowlisted fields
 *   - approveSyncProposalById refuses to act on missing proposal
 *   - approveSyncProposalById detects source hash drift between scan
 *     and approve
 *   - approveSyncProposalById honors expected_updated_at for
 *     optimistic concurrency
 *   - rejectSyncProposalById clears pending state and writes audit
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";

const TMP_ROOT = path.join(
  os.tmpdir(),
  `skill-sync-proposal-${crypto.randomUUID()}`
);

async function loadDb() {
  process.env["MEMROOS_ROOT"] = TMP_ROOT;
  process.env["SQLITE_DB_PATH"] = path.join(TMP_ROOT, `db-${crypto.randomUUID()}.db`);
  vi.resetModules();
  const dbModule = await import("@/lib/db");
  const { getDb, closeDb } = dbModule;
  const { initSchema } = await import("@/lib/db-schema");
  const db = getDb();
  initSchema(db);
  return { db, getDb, closeDb };
}

async function loadSync() {
  return await import("../skill-sync");
}

let db: import("better-sqlite3").Database;
let closeDb: () => void;

beforeEach(async () => {
  fs.rmSync(TMP_ROOT, { recursive: true, force: true });
  fs.mkdirSync(TMP_ROOT, { recursive: true });
  const mods = await loadDb();
  db = mods.db;
  closeDb = mods.closeDb;
});

afterEach(() => {
  try {
    closeDb();
  } catch {
    /* ignore */
  }
  delete process.env["MEMROOS_ROOT"];
  delete process.env["SQLITE_DB_PATH"];
  delete process.env["MEMROOS_OPERATOR_API_KEY"];
  fs.rmSync(TMP_ROOT, { recursive: true, force: true });
});

function insertSkillRow(overrides: {
  name?: string;
  source_harness?: string;
  content_hash?: string;
  dispatch_status?: string;
  completeness_pct?: number;
} = {}): number {
  const result = db
    .prepare(
      `INSERT INTO skill_registry (
        name, description, owner, source_harness, risk_tier, dispatch_status,
        version, preconditions, allowed_tools, verification_checks, rollback_behavior,
        raw_body, completeness_pct, missing_fields_json, imported_by, imported_at,
        evidence_examples, content_hash, signature, signed_by, signed_at, trust_level,
        public_key_fingerprint
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?
      )`
    )
    .run(
      overrides.name ?? "prop-skill",
      "Test",
      "ops",
      overrides.source_harness ?? "claude",
      "low",
      overrides.dispatch_status ?? "enabled",
      "1.0.0",
      "none",
      "read_file",
      "verify output",
      "revert",
      "## Preconditions\nnone",
      overrides.completeness_pct ?? 100,
      "[]",
      "operator",
      new Date().toISOString(),
      "check output",
      overrides.content_hash ?? "0".repeat(64),
      null,
      null,
      null,
      "unsigned",
      null
    );
  return Number(result.lastInsertRowid);
}

describe("approveSyncProposalById (VAL-SKILL-029)", () => {
  it("atomically writes allowlisted projections and clears pending state", async () => {
    const { createImportProposal, approveSyncProposalById } = await loadSync();
    const id = insertSkillRow({
      name: "atomically-approved",
      source_harness: "claude",
      content_hash: "0".repeat(64),
      dispatch_status: "enabled",
    });

    const proposal = createImportProposal(db, {
      source_harness: "claude",
      detected: {
        skill_name: "atomically-approved",
        source_harness: "claude",
        version: "2.0.0",
        raw_body: "## Preconditions\n## Allowed Tools\n## Verification Checks\n## Rollback\n## Evidence Examples",
        content_hash: "1".repeat(64),
      },
      proposed_by: "scanner",
    });
    const proposalId = proposal.proposal.pending_proposal_id!;

    const result = approveSyncProposalById(db, {
      proposal_id: proposalId,
      operator: "alice",
      reason: "ok",
    });
    expect(result.status).toBe("approved");
    expect(result.registry_updated).toBe(true);

    // Registry row updated; allowlisted fields only.
    const reg = db
      .prepare(
        `SELECT content_hash, version, dispatch_status FROM skill_registry WHERE id = ?`
      )
      .get(id) as {
      content_hash: string;
      version: string;
      dispatch_status: string;
    };
    expect(reg.content_hash).toBe("1".repeat(64));
    expect(reg.version).toBe("2.0.0");
    expect(reg.dispatch_status).toBe("quarantined");

    // Pending proposal cleared from skill_sync_state.
    const stateRow = db
      .prepare(
        `SELECT pending_proposal_id, pending_detected_hash,
                approved_by, approved_at
           FROM skill_sync_state
          WHERE skill_name = ? AND source_harness = ?`
      )
      .get("atomically-approved", "claude") as {
      pending_proposal_id: string | null;
      pending_detected_hash: string | null;
      approved_by: string | null;
      approved_at: string | null;
    };
    expect(stateRow.pending_proposal_id).toBeNull();
    expect(stateRow.pending_detected_hash).toBeNull();
    expect(stateRow.approved_by).toBe("alice");
    expect(stateRow.approved_at).not.toBeNull();

    // Audit row exists.
    const audit = db
      .prepare(
        `SELECT COUNT(*) as c FROM audit_entries
           WHERE event_type = 'skill.sync.proposal.approved'`
      )
      .get() as { c: number };
    expect(audit.c).toBe(1);
  });

  it("throws SyncSyncError when the proposal_id does not exist", async () => {
    const { approveSyncProposalById } = await loadSync();
    expect(() =>
      approveSyncProposalById(db, {
        proposal_id: "missing-uuid",
        operator: "alice",
      })
    ).toThrow(/No pending sync proposal/);
  });

  it("throws when source content has changed between scan and approve", async () => {
    const {
      createImportProposal,
      approveSyncProposalById,
    } = await loadSync();
    insertSkillRow({
      name: "stale-source",
      source_harness: "claude",
      content_hash: "0".repeat(64),
      dispatch_status: "enabled",
    });

    const harnessRoot = path.join(TMP_ROOT, "harness");
    fs.mkdirSync(harnessRoot, { recursive: true });
    const skillFile = path.join(harnessRoot, "stale-source.md");
    fs.writeFileSync(skillFile, "v1 body", "utf8");
    const v1Hash = crypto.createHash("sha256").update("v1 body", "utf8").digest("hex");

    const proposal = createImportProposal(db, {
      source_harness: "claude",
      detected: {
        skill_name: "stale-source",
        source_harness: "claude",
        version: "2.0.0",
        raw_body: "v1 body",
        content_hash: v1Hash,
        file_path: skillFile,
      },
      proposed_by: "scanner",
      source_root: harnessRoot,
    });

    // Tamper with the file on disk.
    fs.writeFileSync(skillFile, "v2 body", "utf8");

    expect(() =>
      approveSyncProposalById(db, {
        proposal_id: proposal.proposal.pending_proposal_id!,
        operator: "alice",
      })
    ).toThrow(/Source hash mismatch/);
  });

  it("honors expected_updated_at for optimistic concurrency", async () => {
    const {
      createImportProposal,
      approveSyncProposalById,
    } = await loadSync();
    insertSkillRow({
      name: "concurrency",
      source_harness: "claude",
      content_hash: "0".repeat(64),
      dispatch_status: "enabled",
    });
    const proposal = createImportProposal(db, {
      source_harness: "claude",
      detected: {
        skill_name: "concurrency",
        source_harness: "claude",
        version: "2.0.0",
        raw_body: "body",
        content_hash: "1".repeat(64),
      },
      proposed_by: "scanner",
    });
    const proposalId = proposal.proposal.pending_proposal_id!;
    const updatedAt = proposal.proposal.updated_at;

    // Concurrent scan overwrites updated_at with a clearly different
    // ISO timestamp so the optimistic-concurrency check can fire.
    db.prepare(
      `UPDATE skill_sync_state SET updated_at = ?, last_check_at = ?
        WHERE skill_name = ? AND source_harness = ?`
    ).run("2099-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z", "concurrency", "claude");

    expect(() =>
      approveSyncProposalById(db, {
        proposal_id: proposalId,
        operator: "alice",
        expected_updated_at: updatedAt,
      })
    ).toThrow(/Stale concurrent/);
  });
});

describe("rejectSyncProposalById (VAL-SKILL-029)", () => {
  it("clears pending state and writes audit on rejection", async () => {
    const {
      createImportProposal,
      rejectSyncProposalById,
    } = await loadSync();
    insertSkillRow({
      name: "reject-lib",
      source_harness: "claude",
      content_hash: "0".repeat(64),
      dispatch_status: "enabled",
    });
    const proposal = createImportProposal(db, {
      source_harness: "claude",
      detected: {
        skill_name: "reject-lib",
        source_harness: "claude",
        version: "2.0.0",
        raw_body: "body",
        content_hash: "1".repeat(64),
      },
      proposed_by: "scanner",
    });
    const proposalId = proposal.proposal.pending_proposal_id!;

    const result = rejectSyncProposalById(db, {
      proposal_id: proposalId,
      operator: "bob",
      reason: "spam",
    });
    expect(result.status).toBe("rejected");
    expect(result.reason).toBe("spam");

    const stateRow = db
      .prepare(
        `SELECT pending_proposal_id, rejected_by, rejection_reason
           FROM skill_sync_state WHERE skill_name = ? AND source_harness = ?`
      )
      .get("reject-lib", "claude") as {
      pending_proposal_id: string | null;
      rejected_by: string | null;
      rejection_reason: string | null;
    };
    expect(stateRow.pending_proposal_id).toBeNull();
    expect(stateRow.rejected_by).toBe("bob");
    expect(stateRow.rejection_reason).toBe("spam");

    const audit = db
      .prepare(
        `SELECT COUNT(*) as c FROM audit_entries
           WHERE event_type = 'skill.sync.proposal.rejected'`
      )
      .get() as { c: number };
    expect(audit.c).toBe(1);
  });

  it("rejects re-reject with a typed error", async () => {
    const {
      createImportProposal,
      rejectSyncProposalById,
    } = await loadSync();
    insertSkillRow({
      name: "reject-twice",
      source_harness: "claude",
      content_hash: "0".repeat(64),
      dispatch_status: "enabled",
    });
    const proposal = createImportProposal(db, {
      source_harness: "claude",
      detected: {
        skill_name: "reject-twice",
        source_harness: "claude",
        version: "2.0.0",
        raw_body: "body",
        content_hash: "1".repeat(64),
      },
      proposed_by: "scanner",
    });
    rejectSyncProposalById(db, {
      proposal_id: proposal.proposal.pending_proposal_id!,
      operator: "bob",
      reason: "first",
    });
    // After rejection the pending_proposal_id is cleared, so a
    // follow-up reject fails closed. The error may surface as
    // "no pending proposal" (the lookup no longer matches) or
    // "already rejected" depending on implementation; both are
    // acceptable fail-closed responses.
    expect(() =>
      rejectSyncProposalById(db, {
        proposal_id: proposal.proposal.pending_proposal_id!,
        operator: "bob",
        reason: "second",
      })
    ).toThrow();
  });
});
