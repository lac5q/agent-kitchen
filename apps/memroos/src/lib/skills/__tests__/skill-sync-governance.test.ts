// @vitest-environment node
/**
 * Phase 149 / SKILLTRUST-04 — Governed sync tests.
 *
 * Covers:
 *   VAL-SYNC-001 — Detection creates a pending proposal and does NOT
 *                   mutate the skill_registry row.
 *   VAL-SYNC-002 — Detection is idempotent: identical-hash scans do not
 *                   create duplicate pending proposals (dedupe via UNIQUE).
 *   VAL-SYNC-003 — Identical-hash detection against an existing row
 *                   surfaces `unchanged=true` and an approved status.
 *   VAL-SYNC-004 — Approve transitions pending -> approved and records
 *                   operator / reason; reject records operator / reason.
 *   VAL-SYNC-005 — Approval is gated on pending status (no double-approve).
 *   VAL-SYNC-006 — Agent pin creation writes current+prior with actor +
 *                   audit; pin replacement rotates prior correctly.
 *   VAL-SYNC-007 — Pin creation is fail-closed: rejects when the skill is
 *                   not in a dispatchable state, when the agent is unknown,
 *                   and when the hash is malformed.
 *   VAL-SYNC-008 — Rollback rotates current <- prior, discards the previous
 *                   current, stamps rollback metadata, and writes an audit row.
 *   VAL-SYNC-009 — Rollback is exactly one step: a second rollback fails
 *                   because the prior has been consumed.
 *   VAL-SYNC-010 — Schema idempotence: re-running initSchema does not
 *                   duplicate v12 tables or indexes.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";

const TMP_ROOT = path.join(
  os.tmpdir(),
  `skill-sync-governance-${crypto.randomUUID()}`
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

async function importSyncModule() {
  return import("../skill-sync-governance");
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function insertSkillRow(
  overrides: {
    name?: string;
    source_harness?: string;
    dispatch_status?: string;
    completeness_pct?: number;
    content_hash?: string | null;
    version?: string | null;
  } = {}
): number {
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
      overrides.name ?? "sync-skill",
      "Sync test skill",
      "ops",
      overrides.source_harness ?? "claude",
      "low",
      overrides.dispatch_status ?? "enabled",
      overrides.version ?? "1.0.0",
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
      overrides.content_hash ?? null,
      null,
      null,
      null,
      "unsigned",
      null
    );
  return Number(result.lastInsertRowid);
}

function insertAgent(id: string, name: string): void {
  db.prepare(
    `INSERT INTO registered_agents (
      id, name, role, platform, protocol, status, location
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, name, "operator", "local", "rest", "active", "local");
}

// ---------------------------------------------------------------------------
// VAL-SYNC-010 — Schema idempotence
// ---------------------------------------------------------------------------

describe("VAL-SYNC-010 schema migration v12 idempotence", () => {
  it("creates skill_import_proposals and skill_version_pins tables", () => {
    const proposals = db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='skill_import_proposals'`
      )
      .get() as { name: string } | undefined;
    expect(proposals).toBeTruthy();
    const pins = db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='skill_version_pins'`
      )
      .get() as { name: string } | undefined;
    expect(pins).toBeTruthy();
  });

  it("re-running initSchema does not duplicate tables or indexes", async () => {
    const { initSchema } = await import("@/lib/db-schema");
    initSchema(db); // idempotent re-run
    const tables = db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name IN ('skill_import_proposals','skill_version_pins')`
      )
      .all() as Array<{ name: string }>;
    expect(tables).toHaveLength(2);
  });

  it("skill_import_proposals status CHECK accepts pending/approved/rejected only", () => {
    expect(() =>
      db
        .prepare(
          `INSERT INTO skill_import_proposals
           (id, source_harness, skill_name, skill_identity,
            detected_content_hash, proposed_by)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run("p1", "claude", "n", "n@v", "x".repeat(64), "alice")
    ).not.toThrow();

    // Replace via UPDATE to a bogus status — CHECK should reject.
    expect(() =>
      db
        .prepare(
          `UPDATE skill_import_proposals SET status = 'pendingx' WHERE id = 'p1'`
        )
        .run()
    ).toThrow(/CHECK/);
  });

  it("skill_version_pins UNIQUE(agent_id, skill_name) prevents duplicate active pins", () => {
    insertAgent("agent-1", "Agent 1");
    db.prepare(
      `INSERT INTO skill_version_pins
       (agent_id, skill_name, current_version, current_content_hash, actor)
       VALUES (?, ?, ?, ?, ?)`
    ).run("agent-1", "dup-skill", "1.0", "a".repeat(64), "alice");

    expect(() =>
      db.prepare(
        `INSERT INTO skill_version_pins
         (agent_id, skill_name, current_version, current_content_hash, actor)
         VALUES (?, ?, ?, ?, ?)`
      ).run("agent-1", "dup-skill", "1.0", "b".repeat(64), "alice")
    ).toThrow(/UNIQUE/);
  });
});

// ---------------------------------------------------------------------------
// VAL-SYNC-001 — Detection creates proposal, leaves registry untouched
// ---------------------------------------------------------------------------

describe("VAL-SYNC-001 detectSkillChange does not mutate registry", () => {
  it("creates a pending proposal when the detected hash differs from the registry", async () => {
    const { detectSkillChange } = await importSyncModule();
    const id = insertSkillRow({
      name: "change-skill",
      content_hash: "0".repeat(64),
    });
    const beforeDispatch = db
      .prepare(`SELECT dispatch_status FROM skill_registry WHERE id = ?`)
      .get(id) as { dispatch_status: string };

    const result = detectSkillChange(db, {
      source_harness: "claude",
      skill_name: "change-skill",
      detected_content_hash: "1".repeat(64),
      proposed_by: "scanner",
      version: "2.0.0",
    });

    expect(result.created).toBe(true);
    expect(result.unchanged).toBe(false);
    expect(result.proposal.status).toBe("pending");
    expect(result.proposal.detected_content_hash).toBe("1".repeat(64));
    expect(result.proposal.current_content_hash).toBe("0".repeat(64));
    expect(result.proposal.affected_skill_id).toBe(id);

    // Registry unchanged.
    const after = db
      .prepare(`SELECT dispatch_status FROM skill_registry WHERE id = ?`)
      .get(id) as { dispatch_status: string };
    expect(after.dispatch_status).toBe(beforeDispatch.dispatch_status);

    const registryCount = db
      .prepare(`SELECT COUNT(*) as c FROM skill_registry WHERE id = ?`)
      .get(id) as { c: number };
    expect(registryCount.c).toBe(1);
  });

  it("returns the existing pending proposal on identical-hash re-scan (dedupe)", async () => {
    const { detectSkillChange } = await importSyncModule();
    insertSkillRow({ name: "dup-scan", content_hash: "0".repeat(64) });

    const first = detectSkillChange(db, {
      source_harness: "claude",
      skill_name: "dup-scan",
      detected_content_hash: "1".repeat(64),
      proposed_by: "scanner",
    });
    const second = detectSkillChange(db, {
      source_harness: "claude",
      skill_name: "dup-scan",
      detected_content_hash: "1".repeat(64),
      proposed_by: "scanner",
    });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.proposal.id).toBe(first.proposal.id);

    const total = db
      .prepare(
        `SELECT COUNT(*) as c FROM skill_import_proposals WHERE skill_name = 'dup-scan'`
      )
      .get() as { c: number };
    expect(total.c).toBe(1);
  });

  it("VAL-SYNC-003 — identical hash against existing row returns unchanged=true approved", async () => {
    const { detectSkillChange } = await importSyncModule();
    const shared = "a".repeat(64);
    insertSkillRow({ name: "unchanged-skill", content_hash: shared });

    const result = detectSkillChange(db, {
      source_harness: "claude",
      skill_name: "unchanged-skill",
      detected_content_hash: shared,
      proposed_by: "scanner",
    });

    expect(result.created).toBe(true);
    expect(result.unchanged).toBe(true);
    expect(result.proposal.status).toBe("approved");
    expect(result.proposal.decision_reason).toBe("no_change_detected");
  });

  it("rejects hash that does not match the SHA-256 64-char shape", async () => {
    const { detectSkillChange, SyncGovernanceError } = await importSyncModule();
    expect(() =>
      detectSkillChange(db, {
        source_harness: "claude",
        skill_name: "badhash",
        detected_content_hash: "tooshort",
        proposed_by: "scanner",
      })
    ).toThrow(SyncGovernanceError);
  });

  it("rejects empty source_harness / skill_name / proposed_by", async () => {
    const { detectSkillChange, SyncGovernanceError } = await importSyncModule();
    expect(() =>
      detectSkillChange(db, {
        source_harness: "  ",
        skill_name: "x",
        detected_content_hash: "a".repeat(64),
        proposed_by: "scanner",
      })
    ).toThrow(SyncGovernanceError);
    expect(() =>
      detectSkillChange(db, {
        source_harness: "claude",
        skill_name: "  ",
        detected_content_hash: "a".repeat(64),
        proposed_by: "scanner",
      })
    ).toThrow(SyncGovernanceError);
    expect(() =>
      detectSkillChange(db, {
        source_harness: "claude",
        skill_name: "x",
        detected_content_hash: "a".repeat(64),
        proposed_by: " ",
      })
    ).toThrow(SyncGovernanceError);
  });

  it("uses detected_content_body as fallback when no hash is supplied", async () => {
    const { detectSkillChange, computeGovernanceContentHash } =
      await importSyncModule();
    const body = "hash me please";
    insertSkillRow({ name: "body-fallback", content_hash: null });

    const result = detectSkillChange(db, {
      source_harness: "claude",
      skill_name: "body-fallback",
      detected_content_body: body,
      proposed_by: "scanner",
    });

    expect(result.created).toBe(true);
    expect(result.proposal.detected_content_hash).toBe(
      computeGovernanceContentHash(body)
    );
  });
});

// ---------------------------------------------------------------------------
// VAL-SYNC-004 / VAL-SYNC-005 — Approve / reject transitions
// ---------------------------------------------------------------------------

describe("VAL-SYNC-004 approveImportProposal / rejectImportProposal", () => {
  it("approves a pending proposal and writes decided_by/decided_at/reason", async () => {
    const { detectSkillChange, approveImportProposal } = await importSyncModule();
    insertSkillRow({ name: "approve-me", content_hash: "0".repeat(64) });
    const det = detectSkillChange(db, {
      source_harness: "claude",
      skill_name: "approve-me",
      detected_content_hash: "1".repeat(64),
      proposed_by: "scanner",
    });
    expect(det.proposal.status).toBe("pending");

    const approved = approveImportProposal(
      db,
      det.proposal.id,
      "alice",
      "ok to import"
    );
    expect(approved.status).toBe("approved");
    expect(approved.decided_by).toBe("alice");
    expect(approved.decided_at).not.toBeNull();
    expect(approved.decision_reason).toBe("ok to import");
  });

  it("rejects on empty reason and empty operator", async () => {
    const { detectSkillChange, rejectImportProposal, SyncGovernanceError } =
      await importSyncModule();
    insertSkillRow({ name: "reject-me", content_hash: "0".repeat(64) });
    const det = detectSkillChange(db, {
      source_harness: "claude",
      skill_name: "reject-me",
      detected_content_hash: "2".repeat(64),
      proposed_by: "scanner",
    });

    expect(() => rejectImportProposal(db, det.proposal.id, "alice", " ")).toThrow(
      SyncGovernanceError
    );
    expect(() =>
      rejectImportProposal(db, det.proposal.id, " ", "reason")
    ).toThrow(SyncGovernanceError);
  });

  it("reject records decided_by/decided_at/reason", async () => {
    const { detectSkillChange, rejectImportProposal } = await importSyncModule();
    insertSkillRow({ name: "reject-rec", content_hash: "0".repeat(64) });
    const det = detectSkillChange(db, {
      source_harness: "claude",
      skill_name: "reject-rec",
      detected_content_hash: "3".repeat(64),
      proposed_by: "scanner",
    });
    const rejected = rejectImportProposal(
      db,
      det.proposal.id,
      "bob",
      "looks like spam"
    );
    expect(rejected.status).toBe("rejected");
    expect(rejected.decided_by).toBe("bob");
    expect(rejected.decided_at).not.toBeNull();
    expect(rejected.decision_reason).toBe("looks like spam");
  });

  it("VAL-SYNC-005 — approval is gated on pending status", async () => {
    const { detectSkillChange, approveImportProposal, SyncGovernanceError } =
      await importSyncModule();
    insertSkillRow({ name: "double-approve", content_hash: "0".repeat(64) });
    const det = detectSkillChange(db, {
      source_harness: "claude",
      skill_name: "double-approve",
      detected_content_hash: "4".repeat(64),
      proposed_by: "scanner",
    });
    approveImportProposal(db, det.proposal.id, "alice", "first");
    expect(() =>
      approveImportProposal(db, det.proposal.id, "alice", "second")
    ).toThrow(SyncGovernanceError);
  });

  it("approve / reject on unknown proposal returns SyncGovernanceError", async () => {
    const { approveImportProposal, rejectImportProposal } =
      await importSyncModule();
    expect(() =>
      approveImportProposal(db, "does-not-exist", "alice")
    ).toThrow();
    expect(() =>
      rejectImportProposal(db, "does-not-exist", "alice", "reason")
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// VAL-SYNC-006 / VAL-SYNC-007 — Pin creation
// ---------------------------------------------------------------------------

describe("VAL-SYNC-006 createOrUpdateAgentVersionPin", () => {
  it("creates a pin with current+actor and writes audit entry", async () => {
    const { createOrUpdateAgentVersionPin } = await importSyncModule();
    insertAgent("a-1", "Agent 1");
    const skillId = insertSkillRow({
      name: "pin-skill",
      content_hash: "a".repeat(64),
      dispatch_status: "enabled",
      completeness_pct: 100,
    });
    const pin = createOrUpdateAgentVersionPin(db, {
      agent_id: "a-1",
      skill_name: "pin-skill",
      skill_id: skillId,
      current_version: "1.0.0",
      current_content_hash: "a".repeat(64),
      actor: "alice",
    });
    expect(pin.agent_id).toBe("a-1");
    expect(pin.skill_name).toBe("pin-skill");
    expect(pin.current_version).toBe("1.0.0");
    expect(pin.current_content_hash).toBe("a".repeat(64));
    expect(pin.prior_version).toBeNull();
    expect(pin.prior_content_hash).toBeNull();

    const audit = db
      .prepare(
        `SELECT COUNT(*) as c FROM audit_entries WHERE entity_id = ? AND event_type = ?`
      )
      .get(String(pin.id), "skill.pin.created") as { c: number };
    expect(audit.c).toBe(1);
  });

  it("replacement rotates current -> prior and writes audit row", async () => {
    const { createOrUpdateAgentVersionPin } = await importSyncModule();
    insertAgent("a-2", "Agent 2");
    const skillA = insertSkillRow({
      name: "rotate-skill",
      content_hash: "a".repeat(64),
      dispatch_status: "enabled",
      completeness_pct: 100,
    });
    createOrUpdateAgentVersionPin(db, {
      agent_id: "a-2",
      skill_name: "rotate-skill",
      skill_id: skillA,
      current_version: "1.0.0",
      current_content_hash: "a".repeat(64),
      actor: "alice",
    });

    const skillB = insertSkillRow({
      name: "rotate-skill",
      source_harness: "codex",
      content_hash: "b".repeat(64),
      dispatch_status: "enabled",
      completeness_pct: 100,
      version: "1.1.0",
    });
    const updated = createOrUpdateAgentVersionPin(db, {
      agent_id: "a-2",
      skill_name: "rotate-skill",
      skill_id: skillB,
      current_version: "1.1.0",
      current_content_hash: "b".repeat(64),
      actor: "alice",
    });

    expect(updated.current_version).toBe("1.1.0");
    expect(updated.current_content_hash).toBe("b".repeat(64));
    expect(updated.prior_version).toBe("1.0.0");
    expect(updated.prior_content_hash).toBe("a".repeat(64));
    expect(updated.prior_skill_id).toBe(skillA);

    const auditCount = db
      .prepare(
        `SELECT COUNT(*) as c FROM audit_entries WHERE entity_id = ? AND event_type = ?`
      )
      .get(String(updated.id), "skill.pin.updated") as { c: number };
    expect(auditCount.c).toBe(1);
  });

  it("idempotent re-pin with identical version+hash returns the existing pin untouched", async () => {
    const { createOrUpdateAgentVersionPin } = await importSyncModule();
    insertAgent("a-3", "Agent 3");
    const skillId = insertSkillRow({
      name: "stable-pin",
      content_hash: "d".repeat(64),
      dispatch_status: "enabled",
      completeness_pct: 100,
    });
    const first = createOrUpdateAgentVersionPin(db, {
      agent_id: "a-3",
      skill_name: "stable-pin",
      skill_id: skillId,
      current_version: "1.0.0",
      current_content_hash: "d".repeat(64),
      actor: "alice",
    });
    const second = createOrUpdateAgentVersionPin(db, {
      agent_id: "a-3",
      skill_name: "stable-pin",
      skill_id: skillId,
      current_version: "1.0.0",
      current_content_hash: "d".repeat(64),
      actor: "bob",
    });
    expect(second.id).toBe(first.id);
    expect(second.actor).toBe("alice");
  });
});

describe("VAL-SYNC-007 pin fail-closed behavior", () => {
  it("rejects pin when skill_id points at a non-dispatchable row", async () => {
    const { createOrUpdateAgentVersionPin, SyncGovernanceError } =
      await importSyncModule();
    insertAgent("a-bad", "Agent Bad");
    const skillId = insertSkillRow({
      name: "non-dispatchable",
      content_hash: "c".repeat(64),
      dispatch_status: "review",
    });
    expect(() =>
      createOrUpdateAgentVersionPin(db, {
        agent_id: "a-bad",
        skill_name: "non-dispatchable",
        skill_id: skillId,
        current_version: "1.0.0",
        current_content_hash: "c".repeat(64),
        actor: "alice",
      })
    ).toThrow(SyncGovernanceError);
  });

  it("rejects pin when skill_id completeness_pct is below 100", async () => {
    const { createOrUpdateAgentVersionPin } = await importSyncModule();
    insertAgent("a-bad-c", "Agent Bad C");
    const skillId = insertSkillRow({
      name: "incomplete-pin",
      content_hash: "e".repeat(64),
      dispatch_status: "enabled",
      completeness_pct: 91,
    });
    expect(() =>
      createOrUpdateAgentVersionPin(db, {
        agent_id: "a-bad-c",
        skill_name: "incomplete-pin",
        skill_id: skillId,
        current_version: "1.0.0",
        current_content_hash: "e".repeat(64),
        actor: "alice",
      })
    ).toThrow(/completeness_pct/);
  });

  it("rejects pin when the agent is unknown to registered_agents", async () => {
    const { createOrUpdateAgentVersionPin, SyncGovernanceError } =
      await importSyncModule();
    expect(() =>
      createOrUpdateAgentVersionPin(db, {
        agent_id: "ghost-agent",
        skill_name: "any-skill",
        skill_id: null,
        current_version: "1.0.0",
        current_content_hash: "f".repeat(64),
        actor: "alice",
      })
    ).toThrow(SyncGovernanceError);
  });

  it("rejects pin with malformed hash", async () => {
    const { createOrUpdateAgentVersionPin, SyncGovernanceError } =
      await importSyncModule();
    insertAgent("a-bad-h", "Agent Bad H");
    expect(() =>
      createOrUpdateAgentVersionPin(db, {
        agent_id: "a-bad-h",
        skill_name: "any-skill",
        skill_id: null,
        current_version: "1.0.0",
        current_content_hash: "tooshort",
        actor: "alice",
      })
    ).toThrow(SyncGovernanceError);
  });

  it("rejects pin with empty actor / agent_id / skill_name / version", async () => {
    const { createOrUpdateAgentVersionPin, SyncGovernanceError } =
      await importSyncModule();
    insertAgent("a-empty", "Agent Empty");
    expect(() =>
      createOrUpdateAgentVersionPin(db, {
        agent_id: " ",
        skill_name: "x",
        skill_id: null,
        current_version: "1.0.0",
        current_content_hash: "0".repeat(64),
        actor: "alice",
      })
    ).toThrow(SyncGovernanceError);
    expect(() =>
      createOrUpdateAgentVersionPin(db, {
        agent_id: "a-empty",
        skill_name: " ",
        skill_id: null,
        current_version: "1.0.0",
        current_content_hash: "0".repeat(64),
        actor: "alice",
      })
    ).toThrow(SyncGovernanceError);
    expect(() =>
      createOrUpdateAgentVersionPin(db, {
        agent_id: "a-empty",
        skill_name: "x",
        skill_id: null,
        current_version: " ",
        current_content_hash: "0".repeat(64),
        actor: "alice",
      })
    ).toThrow(SyncGovernanceError);
    expect(() =>
      createOrUpdateAgentVersionPin(db, {
        agent_id: "a-empty",
        skill_name: "x",
        skill_id: null,
        current_version: "1.0.0",
        current_content_hash: "0".repeat(64),
        actor: " ",
      })
    ).toThrow(SyncGovernanceError);
  });
});

// ---------------------------------------------------------------------------
// VAL-SYNC-008 / VAL-SYNC-009 — Rollback
// ---------------------------------------------------------------------------

describe("VAL-SYNC-008 rollbackAgentVersionPin", () => {
  it("rotates current <- prior and writes a skill.pin.rolled_back audit row", async () => {
    const { createOrUpdateAgentVersionPin, rollbackAgentVersionPin } =
      await importSyncModule();
    insertAgent("a-rb", "Agent RB");
    insertSkillRow({
      name: "rb-skill",
      content_hash: "1".repeat(64),
      dispatch_status: "enabled",
      completeness_pct: 100,
    });
    createOrUpdateAgentVersionPin(db, {
      agent_id: "a-rb",
      skill_name: "rb-skill",
      skill_id: null,
      current_version: "1.0.0",
      current_content_hash: "1".repeat(64),
      actor: "alice",
    });
    createOrUpdateAgentVersionPin(db, {
      agent_id: "a-rb",
      skill_name: "rb-skill",
      skill_id: null,
      current_version: "2.0.0",
      current_content_hash: "2".repeat(64),
      actor: "alice",
    });

    const before = db
      .prepare(
        `SELECT * FROM skill_version_pins WHERE agent_id = ? AND skill_name = ?`
      )
      .get("a-rb", "rb-skill") as {
      id: number;
      current_version: string;
      current_content_hash: string;
      prior_version: string;
      prior_content_hash: string;
    };
    expect(before.current_version).toBe("2.0.0");
    expect(before.prior_version).toBe("1.0.0");

    const rolled = rollbackAgentVersionPin(db, {
      pin_id: before.id,
      operator: "alice",
      reason: "regression",
    });
    expect(rolled.current_version).toBe("1.0.0");
    expect(rolled.current_content_hash).toBe("1".repeat(64));
    expect(rolled.prior_version).toBeNull();
    expect(rolled.prior_content_hash).toBeNull();
    expect(rolled.rolled_back_at).not.toBeNull();
    expect(rolled.rolled_back_by).toBe("alice");
    expect(rolled.last_rollback_event_id).not.toBeNull();

    const auditCount = db
      .prepare(
        `SELECT COUNT(*) as c FROM audit_entries
           WHERE event_type = 'skill.pin.rolled_back'
             AND entity_id = ?`
      )
      .get(String(before.id)) as { c: number };
    expect(auditCount.c).toBe(1);
  });

  it("VAL-SYNC-009 — rollback is exactly one step: a second rollback fails", async () => {
    const { createOrUpdateAgentVersionPin, rollbackAgentVersionPin, SyncGovernanceError } =
      await importSyncModule();
    insertAgent("a-rb2", "Agent RB2");
    createOrUpdateAgentVersionPin(db, {
      agent_id: "a-rb2",
      skill_name: "rb2-skill",
      skill_id: null,
      current_version: "1.0.0",
      current_content_hash: "1".repeat(64),
      actor: "alice",
    });
    const second = createOrUpdateAgentVersionPin(db, {
      agent_id: "a-rb2",
      skill_name: "rb2-skill",
      skill_id: null,
      current_version: "2.0.0",
      current_content_hash: "2".repeat(64),
      actor: "alice",
    });

    rollbackAgentVersionPin(db, {
      pin_id: second.id,
      operator: "alice",
    });

    expect(() =>
      rollbackAgentVersionPin(db, {
        pin_id: second.id,
        operator: "alice",
      })
    ).toThrow(SyncGovernanceError);
  });

  it("rollback fails when pin does not exist", async () => {
    const { rollbackAgentVersionPin, SyncGovernanceError } =
      await importSyncModule();
    expect(() =>
      rollbackAgentVersionPin(db, { pin_id: 9999999, operator: "alice" })
    ).toThrow(SyncGovernanceError);
  });

  it("rollback fails when prior skill_id is missing from the registry", async () => {
    const { rollbackAgentVersionPin } = await importSyncModule();
    insertAgent("a-rb3", "Agent RB3");
    // The FK constraint prevents inserting a pin with a prior_skill_id that
    // does not exist. To exercise the rollback's fail-closed path we
    // create a real skill_registry row, attach the pin to it, then delete
    // the registry row in a transaction with FK checks disabled. After
    // commit the pin still references a now-missing prior_skill_id.
    const tempSkillId = db
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
        "rb3-tmp-skill",
        "tmp",
        "ops",
        "claude",
        "low",
        "enabled",
        "1.0.0",
        "none",
        "read_file",
        "verify",
        "revert",
        "## Preconditions\nnone",
        100,
        "[]",
        "operator",
        new Date().toISOString(),
        "check",
        "0".repeat(64),
        null,
        null,
        null,
        "unsigned",
        null
      );

    const pinResult = db
      .prepare(
        `INSERT INTO skill_version_pins
          (agent_id, skill_name, skill_id, current_version, current_content_hash,
           prior_version, prior_content_hash, prior_skill_id, actor)
         VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        "a-rb3",
        "rb3-skill",
        "2.0.0",
        "2".repeat(64),
        "1.0.0",
        "1".repeat(64),
        Number(tempSkillId.lastInsertRowid),
        "alice"
      );

    // Temporarily disable FK so the DELETE on skill_registry does not
    // cascade-set prior_skill_id to NULL — we want to simulate the
    // situation where the prior skill row has been hard-deleted.
    db.pragma("foreign_keys = OFF");
    try {
      db.prepare(`DELETE FROM skill_registry WHERE id = ?`).run(
        Number(tempSkillId.lastInsertRowid)
      );
    } finally {
      db.pragma("foreign_keys = ON");
    }

    expect(() =>
      rollbackAgentVersionPin(db, {
        pin_id: Number(pinResult.lastInsertRowid),
        operator: "alice",
      })
    ).toThrow(/no longer exists/);
  });
});

// ---------------------------------------------------------------------------
// List helpers
// ---------------------------------------------------------------------------

describe("listImportProposals / listAgentVersionPins filters", () => {
  it("listImportProposals filters by status / source_harness", async () => {
    const { detectSkillChange, listImportProposals } = await importSyncModule();
    insertSkillRow({ name: "f1", content_hash: "0".repeat(64) });
    insertSkillRow({
      name: "f2",
      source_harness: "codex",
      content_hash: "0".repeat(64),
    });
    const a = detectSkillChange(db, {
      source_harness: "claude",
      skill_name: "f1",
      detected_content_hash: "1".repeat(64),
      proposed_by: "scanner",
    });
    const b = detectSkillChange(db, {
      source_harness: "codex",
      skill_name: "f2",
      detected_content_hash: "1".repeat(64),
      proposed_by: "scanner",
    });

    const all = listImportProposals(db);
    expect(all.length).toBeGreaterThanOrEqual(2);
    const claude = listImportProposals(db, { source_harness: "claude" });
    expect(claude.map((p) => p.id)).toContain(a.proposal.id);
    expect(claude.map((p) => p.id)).not.toContain(b.proposal.id);
  });

  it("listAgentVersionPins filters by agent_id / skill_name", async () => {
    const { createOrUpdateAgentVersionPin, listAgentVersionPins } =
      await importSyncModule();
    insertAgent("ax", "Ax");
    insertAgent("ay", "Ay");
    createOrUpdateAgentVersionPin(db, {
      agent_id: "ax",
      skill_name: "sk-x",
      skill_id: null,
      current_version: "1.0.0",
      current_content_hash: "1".repeat(64),
      actor: "alice",
    });
    createOrUpdateAgentVersionPin(db, {
      agent_id: "ay",
      skill_name: "sk-y",
      skill_id: null,
      current_version: "1.0.0",
      current_content_hash: "1".repeat(64),
      actor: "alice",
    });
    const xPins = listAgentVersionPins(db, { agent_id: "ax" });
    expect(xPins).toHaveLength(1);
    expect(xPins[0].skill_name).toBe("sk-x");
  });
});

describe("getImportProposal and listImportProposals", () => {
  it("getImportProposal returns null for invalid ids and the row when present", async () => {
    const { detectSkillChange, getImportProposal } = await importSyncModule();
    expect(getImportProposal(db, "")).toBeNull();
    const created = detectSkillChange(db, {
      source_harness: "claude",
      skill_name: "lookup-skill",
      detected_content_body: "body",
      proposed_by: "scanner",
    });
    const found = getImportProposal(db, created.proposal.id);
    expect(found?.id).toBe(created.proposal.id);
    expect(found?.status).toBe("pending");
  });

  it("listImportProposals filters by status and harness", async () => {
    const { detectSkillChange, listImportProposals } = await importSyncModule();
    detectSkillChange(db, {
      source_harness: "claude",
      skill_name: "listed-skill",
      detected_content_body: "listed body",
      proposed_by: "scanner",
    });
    const pending = listImportProposals(db, {
      status: "pending",
      source_harness: "claude",
      skill_name: "listed-skill",
    });
    expect(pending).toHaveLength(1);
    expect(() => listImportProposals(db, { status: "bogus" as "pending" })).toThrow(
      /Invalid proposal status/
    );
  });
});

describe("pin lookup helpers and agent-scoped rollback", () => {
  it("getAgentVersionPin and getVersionPin return the stored pin row", async () => {
    const { createOrUpdateAgentVersionPin, getAgentVersionPin, getVersionPin } =
      await importSyncModule();
    insertAgent("lookup-agent", "Lookup Agent");
    createOrUpdateAgentVersionPin(db, {
      agent_id: "lookup-agent",
      skill_name: "lookup-skill",
      skill_id: null,
      current_version: "1.0.0",
      current_content_hash: "1".repeat(64),
      actor: "alice",
    });
    const byAgent = getAgentVersionPin(db, "lookup-agent", "lookup-skill");
    expect(byAgent?.current_version).toBe("1.0.0");
    const byId = getVersionPin(db, byAgent!.id);
    expect(byId?.agent_id).toBe("lookup-agent");
    expect(getAgentVersionPin(db, "", "lookup-skill")).toBeNull();
    expect(getVersionPin(db, -1)).toBeNull();
  });

  it("rollbackAgentVersionPinByAgent rolls back using agent + skill tuple", async () => {
    const {
      createOrUpdateAgentVersionPin,
      rollbackAgentVersionPinByAgent,
      getAgentVersionPin,
    } = await importSyncModule();
    insertAgent("rb-agent", "RB Agent");
    createOrUpdateAgentVersionPin(db, {
      agent_id: "rb-agent",
      skill_name: "rb-by-agent",
      skill_id: null,
      current_version: "1.0.0",
      current_content_hash: "1".repeat(64),
      actor: "alice",
    });
    createOrUpdateAgentVersionPin(db, {
      agent_id: "rb-agent",
      skill_name: "rb-by-agent",
      skill_id: null,
      current_version: "2.0.0",
      current_content_hash: "2".repeat(64),
      actor: "alice",
    });
    const rolled = rollbackAgentVersionPinByAgent(db, {
      agent_id: "rb-agent",
      skill_name: "rb-by-agent",
      operator: "alice",
      reason: "regression",
    });
    expect(rolled.current_version).toBe("1.0.0");
    expect(getAgentVersionPin(db, "rb-agent", "rb-by-agent")?.prior_version).toBeNull();
  });

  it("computeGovernanceContentHash is stable SHA-256 hex", async () => {
    const { computeGovernanceContentHash } = await importSyncModule();
    const a = computeGovernanceContentHash("same body");
    const b = computeGovernanceContentHash("same body");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejectImportProposal refuses already-approved proposals", async () => {
    const { detectSkillChange, approveImportProposal, rejectImportProposal, SyncGovernanceError } =
      await importSyncModule();
    insertSkillRow({ name: "no-reject-after-approve", content_hash: "0".repeat(64) });
    const det = detectSkillChange(db, {
      source_harness: "claude",
      skill_name: "no-reject-after-approve",
      detected_content_hash: "1".repeat(64),
      proposed_by: "scanner",
    });
    approveImportProposal(db, det.proposal.id, "alice", "approved");
    expect(() =>
      rejectImportProposal(db, det.proposal.id, "bob", "too late")
    ).toThrow(SyncGovernanceError);
  });

  it("detectSkillChange computes hash from detected_content_body when hash omitted", async () => {
    const { detectSkillChange, computeGovernanceContentHash } = await importSyncModule();
    const body = "governed body for hashing";
    const created = detectSkillChange(db, {
      source_harness: "claude",
      skill_name: "hash-from-body",
      detected_content_body: body,
      proposed_by: "scanner",
    });
    expect(created.proposal.detected_content_hash).toBe(computeGovernanceContentHash(body));
  });

  it("rollbackAgentVersionPinByAgent fails closed on policy-invalid prior rows", async () => {
    const {
      createOrUpdateAgentVersionPin,
      rollbackAgentVersionPinByAgent,
      SyncGovernanceError,
    } = await importSyncModule();
    insertAgent("policy-agent", "Policy Agent");
    const priorId = insertSkillRow({
      name: "policy-prior",
      dispatch_status: "disabled",
      completeness_pct: 100,
      content_hash: "1".repeat(64),
    });
    const currentId = insertSkillRow({
      name: "policy-current",
      dispatch_status: "enabled",
      completeness_pct: 100,
      content_hash: "2".repeat(64),
    });
    createOrUpdateAgentVersionPin(db, {
      agent_id: "policy-agent",
      skill_name: "policy-skill",
      skill_id: currentId,
      current_version: "2.0.0",
      current_content_hash: "2".repeat(64),
      actor: "alice",
    });
    db.prepare(
      `UPDATE skill_version_pins
          SET prior_version = ?, prior_content_hash = ?, prior_skill_id = ?
        WHERE agent_id = ? AND skill_name = ?`
    ).run("1.0.0", "1".repeat(64), priorId, "policy-agent", "policy-skill");
    expect(() =>
      rollbackAgentVersionPinByAgent(db, {
        agent_id: "policy-agent",
        skill_name: "policy-skill",
        operator: "alice",
        reason: "bad prior",
      })
    ).toThrow(SyncGovernanceError);
  });

  it("detectSkillChange rejects empty harness, skill name, actor, and malformed hashes", async () => {
    const { detectSkillChange, SyncGovernanceError } = await importSyncModule();
    expect(() =>
      detectSkillChange(db, {
        source_harness: "   ",
        skill_name: "x",
        detected_content_hash: "0".repeat(64),
        proposed_by: "scanner",
      })
    ).toThrow(SyncGovernanceError);
    expect(() =>
      detectSkillChange(db, {
        source_harness: "claude",
        skill_name: "",
        detected_content_hash: "0".repeat(64),
        proposed_by: "scanner",
      })
    ).toThrow(SyncGovernanceError);
    expect(() =>
      detectSkillChange(db, {
        source_harness: "claude",
        skill_name: "bad-hash",
        detected_content_hash: "short",
        proposed_by: "scanner",
      })
    ).toThrow(SyncGovernanceError);
    expect(() =>
      detectSkillChange(db, {
        source_harness: "claude",
        skill_name: "missing-actor",
        detected_content_hash: "0".repeat(64),
        proposed_by: " ",
      })
    ).toThrow(SyncGovernanceError);
  });

  it("approveImportProposal refuses unknown proposals and double approval", async () => {
    const { detectSkillChange, approveImportProposal, SyncGovernanceError } = await importSyncModule();
    expect(() => approveImportProposal(db, "missing-id", "alice", "ok")).toThrow(SyncGovernanceError);
    insertSkillRow({ name: "double-approve", content_hash: "0".repeat(64) });
    const det = detectSkillChange(db, {
      source_harness: "claude",
      skill_name: "double-approve",
      detected_content_hash: "1".repeat(64),
      proposed_by: "scanner",
    });
    approveImportProposal(db, det.proposal.id, "alice", "first");
    expect(() => approveImportProposal(db, det.proposal.id, "alice", "second")).toThrow(
      SyncGovernanceError
    );
  });

  it("detectSkillChange validates non-string inputs and requires detected content", async () => {
    const { detectSkillChange, SyncGovernanceError } = await importSyncModule();
    expect(() =>
      detectSkillChange(db, {
        source_harness: null as unknown as string,
        skill_name: "x",
        detected_content_hash: "0".repeat(64),
        proposed_by: "scanner",
      })
    ).toThrow(SyncGovernanceError);
    expect(() =>
      detectSkillChange(db, {
        source_harness: "claude",
        skill_name: null as unknown as string,
        detected_content_hash: "0".repeat(64),
        proposed_by: "scanner",
      })
    ).toThrow(SyncGovernanceError);
    expect(() =>
      detectSkillChange(db, {
        source_harness: "claude",
        skill_name: "x",
        detected_content_hash: "0".repeat(64),
        proposed_by: null as unknown as string,
      })
    ).toThrow(SyncGovernanceError);
    expect(() =>
      detectSkillChange(db, {
        source_harness: "claude",
        skill_name: "no-content",
        proposed_by: "scanner",
      })
    ).toThrow(/requires detected_content_hash or detected_content_body/);
  });

  it("detectSkillChange serializes circular payloads and reports vanished inserted proposals", async () => {
    const { detectSkillChange, SyncGovernanceError } = await importSyncModule();
    const circular: Record<string, unknown> = {};
    circular["self"] = circular;
    const created = detectSkillChange(db, {
      source_harness: "claude",
      skill_name: "circular-proposal",
      detected_content_hash: "a".repeat(64),
      proposed_by: "scanner",
      diff_payload: circular,
    });
    expect(created.proposal.diff_payload).toBe("{}");

    db.prepare(
      `CREATE TRIGGER delete_vanish_governance_proposal
       AFTER INSERT ON skill_import_proposals
       WHEN NEW.skill_name = 'vanish-governance'
       BEGIN
         DELETE FROM skill_import_proposals WHERE id = NEW.id;
       END`
    ).run();
    expect(() =>
      detectSkillChange(db, {
        source_harness: "claude",
        skill_name: "vanish-governance",
        detected_content_hash: "b".repeat(64),
        proposed_by: "scanner",
      })
    ).toThrow(SyncGovernanceError);
  });

  it("approve and reject proposal guards handle missing ids and idempotent rejection", async () => {
    const {
      detectSkillChange,
      approveImportProposal,
      rejectImportProposal,
      SyncGovernanceError,
    } = await importSyncModule();

    expect(() => approveImportProposal(db, "", "alice")).toThrow(SyncGovernanceError);
    expect(() => rejectImportProposal(db, "", "alice", "reason")).toThrow(
      SyncGovernanceError
    );

    const pending = detectSkillChange(db, {
      source_harness: "claude",
      skill_name: "reject-idempotent",
      detected_content_hash: "c".repeat(64),
      proposed_by: "scanner",
    });
    const rejected = rejectImportProposal(db, pending.proposal.id, "alice", "not safe");
    const rejectedAgain = rejectImportProposal(
      db,
      pending.proposal.id,
      "bob",
      "still not safe"
    );
    expect(rejected.status).toBe("rejected");
    expect(rejectedAgain.decided_by).toBe("alice");
  });

  it("approveImportProposal and rejectImportProposal report rows that vanish mid-transition", async () => {
    const {
      detectSkillChange,
      approveImportProposal,
      rejectImportProposal,
      SyncGovernanceError,
    } = await importSyncModule();

    const approveTarget = detectSkillChange(db, {
      source_harness: "claude",
      skill_name: "approve-vanishes",
      detected_content_hash: "d".repeat(64),
      proposed_by: "scanner",
    });
    db.prepare(
      `CREATE TRIGGER delete_approve_vanishing_proposal
       AFTER UPDATE ON skill_import_proposals
       WHEN NEW.id = '${approveTarget.proposal.id}'
        AND NEW.status = 'approved'
       BEGIN
         DELETE FROM skill_import_proposals WHERE id = NEW.id;
       END`
    ).run();
    expect(() =>
      approveImportProposal(db, approveTarget.proposal.id, "alice", "ok")
    ).toThrow(SyncGovernanceError);

    const rejectTarget = detectSkillChange(db, {
      source_harness: "claude",
      skill_name: "reject-vanishes",
      detected_content_hash: "e".repeat(64),
      proposed_by: "scanner",
    });
    db.prepare(
      `CREATE TRIGGER delete_reject_vanishing_proposal
       AFTER UPDATE ON skill_import_proposals
       WHEN NEW.id = '${rejectTarget.proposal.id}'
        AND NEW.status = 'rejected'
       BEGIN
         DELETE FROM skill_import_proposals WHERE id = NEW.id;
       END`
    ).run();
    expect(() =>
      rejectImportProposal(db, rejectTarget.proposal.id, "alice", "no")
    ).toThrow(SyncGovernanceError);
  });

  it("createOrUpdateAgentVersionPin validates type-only edge cases and skill ids", async () => {
    const { createOrUpdateAgentVersionPin, SyncGovernanceError } =
      await importSyncModule();
    insertAgent("edge-agent", "Edge Agent");

    expect(() =>
      createOrUpdateAgentVersionPin(db, {
        agent_id: "edge-agent",
        skill_name: "edge-skill",
        skill_id: 0,
        current_version: "1.0.0",
        current_content_hash: "0".repeat(64),
        actor: "alice",
      })
    ).toThrow(/skill_id must be a positive integer/);
    expect(() =>
      createOrUpdateAgentVersionPin(db, {
        agent_id: "edge-agent",
        skill_name: "edge-skill",
        skill_id: 999999,
        current_version: "1.0.0",
        current_content_hash: "0".repeat(64),
        actor: "alice",
      })
    ).toThrow(/not found in skill_registry/);
    expect(() =>
      createOrUpdateAgentVersionPin(db, {
        agent_id: "edge-agent",
        skill_name: "edge-skill",
        skill_id: null,
        current_version: null as unknown as string,
        current_content_hash: "0".repeat(64),
        actor: "alice",
      })
    ).toThrow(SyncGovernanceError);
    expect(() =>
      createOrUpdateAgentVersionPin(db, {
        agent_id: "edge-agent",
        skill_name: "edge-skill",
        skill_id: null,
        current_version: 123 as unknown as string,
        current_content_hash: "0".repeat(64),
        actor: "alice",
      })
    ).toThrow(SyncGovernanceError);
    expect(() =>
      createOrUpdateAgentVersionPin(db, {
        agent_id: "edge-agent",
        skill_name: "edge-skill",
        skill_id: null,
        current_version: "1.0.0",
        current_content_hash: null as unknown as string,
        actor: "alice",
      })
    ).toThrow(SyncGovernanceError);
  });

  it("createOrUpdateAgentVersionPin enforces optimistic concurrency and idempotency keys", async () => {
    const { createOrUpdateAgentVersionPin } = await importSyncModule();
    insertAgent("idem-agent", "Idem Agent");
    const first = createOrUpdateAgentVersionPin(db, {
      agent_id: "idem-agent",
      skill_name: "idem-skill",
      skill_id: null,
      current_version: "1.0.0",
      current_content_hash: "1".repeat(64),
      actor: "alice",
      idempotency_key: "same-request",
    });

    const same = createOrUpdateAgentVersionPin(db, {
      agent_id: "idem-agent",
      skill_name: "idem-skill",
      skill_id: null,
      current_version: "1.0.0",
      current_content_hash: "1".repeat(64),
      actor: "alice",
      idempotency_key: "same-request",
    });
    expect(same.id).toBe(first.id);

    expect(() =>
      createOrUpdateAgentVersionPin(db, {
        agent_id: "idem-agent",
        skill_name: "idem-skill",
        skill_id: null,
        current_version: "2.0.0",
        current_content_hash: "2".repeat(64),
        actor: "alice",
        expected_current_updated_at: "stale",
      })
    ).toThrow(/Stale concurrent pin update/);
    expect(() =>
      createOrUpdateAgentVersionPin(db, {
        agent_id: "idem-agent",
        skill_name: "idem-skill",
        skill_id: null,
        current_version: "2.0.0",
        current_content_hash: "2".repeat(64),
        actor: "alice",
        idempotency_key: "same-request",
      })
    ).toThrow(/previously used with a different request body/);
  });

  it("createOrUpdateAgentVersionPin persists idempotency keys for update requests", async () => {
    const { createOrUpdateAgentVersionPin } = await importSyncModule();
    insertAgent("idem-update-agent", "Idem Update Agent");
    const first = createOrUpdateAgentVersionPin(db, {
      agent_id: "idem-update-agent",
      skill_name: "idem-update-skill",
      skill_id: null,
      current_version: "1.0.0",
      current_content_hash: "a".repeat(64),
      actor: "alice",
    });

    const updated = createOrUpdateAgentVersionPin(db, {
      agent_id: "idem-update-agent",
      skill_name: "idem-update-skill",
      skill_id: null,
      current_version: "2.0.0",
      current_content_hash: "b".repeat(64),
      actor: "alice",
      idempotency_key: "update-request",
    });
    const sameUpdate = createOrUpdateAgentVersionPin(db, {
      agent_id: "idem-update-agent",
      skill_name: "idem-update-skill",
      skill_id: null,
      current_version: "2.0.0",
      current_content_hash: "b".repeat(64),
      actor: "alice",
      idempotency_key: "update-request",
    });

    expect(updated.id).toBe(first.id);
    expect(sameUpdate.current_version).toBe("2.0.0");
    expect(sameUpdate.prior_version).toBe("1.0.0");
  });

  it("pin audit writes fall back when audit_entries is absent", async () => {
    const { createOrUpdateAgentVersionPin } = await importSyncModule();
    insertAgent("auditless-agent", "Auditless Agent");
    db.prepare(`DROP TABLE audit_entries`).run();

    const pin = createOrUpdateAgentVersionPin(db, {
      agent_id: "auditless-agent",
      skill_name: "auditless-skill",
      skill_id: null,
      current_version: "1.0.0",
      current_content_hash: "3".repeat(64),
      actor: "alice",
    });

    expect(pin.current_version).toBe("1.0.0");
  });

  it("createOrUpdateAgentVersionPin reports inserted pins that vanish before readback", async () => {
    const { createOrUpdateAgentVersionPin, SyncGovernanceError } =
      await importSyncModule();
    insertAgent("vanish-pin-agent", "Vanish Pin Agent");
    db.prepare(
      `CREATE TRIGGER delete_vanishing_pin
       AFTER INSERT ON skill_version_pins
       WHEN NEW.skill_name = 'vanishing-pin'
       BEGIN
         DELETE FROM skill_version_pins WHERE id = NEW.id;
       END`
    ).run();

    expect(() =>
      createOrUpdateAgentVersionPin(db, {
        agent_id: "vanish-pin-agent",
        skill_name: "vanishing-pin",
        skill_id: null,
        current_version: "1.0.0",
        current_content_hash: "4".repeat(64),
        actor: "alice",
      })
    ).toThrow(SyncGovernanceError);
  });

  it("listAgentVersionPins filters by skill_name with bounded pagination", async () => {
    const { createOrUpdateAgentVersionPin, listAgentVersionPins } =
      await importSyncModule();
    insertAgent("skill-filter-agent", "Skill Filter Agent");
    createOrUpdateAgentVersionPin(db, {
      agent_id: "skill-filter-agent",
      skill_name: "wanted-skill",
      skill_id: null,
      current_version: "1.0.0",
      current_content_hash: "5".repeat(64),
      actor: "alice",
    });
    createOrUpdateAgentVersionPin(db, {
      agent_id: "skill-filter-agent",
      skill_name: "other-skill",
      skill_id: null,
      current_version: "1.0.0",
      current_content_hash: "6".repeat(64),
      actor: "alice",
    });

    const filtered = listAgentVersionPins(db, {
      skill_name: "wanted-skill",
      limit: 500,
      offset: -1,
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].skill_name).toBe("wanted-skill");
  });

  it("rollback helpers reject invalid pin ids and missing agent-scoped pins", async () => {
    const {
      rollbackAgentVersionPin,
      rollbackAgentVersionPinByAgent,
      SyncGovernanceError,
    } = await importSyncModule();

    expect(() =>
      rollbackAgentVersionPin(db, { pin_id: 0, operator: "alice" })
    ).toThrow(SyncGovernanceError);
    expect(() =>
      rollbackAgentVersionPinByAgent(db, {
        agent_id: "no-agent-pin",
        skill_name: "missing",
        operator: "alice",
      })
    ).toThrow(SyncGovernanceError);
  });

  it("rollbackAgentVersionPinByAgent fails closed on incomplete and tampered prior rows", async () => {
    const {
      createOrUpdateAgentVersionPin,
      rollbackAgentVersionPinByAgent,
      SyncGovernanceError,
    } = await importSyncModule();

    insertAgent("rollback-edge-agent", "Rollback Edge Agent");
    const incompletePrior = insertSkillRow({
      name: "incomplete-prior",
      dispatch_status: "enabled",
      completeness_pct: 80,
      content_hash: "7".repeat(64),
    });
    createOrUpdateAgentVersionPin(db, {
      agent_id: "rollback-edge-agent",
      skill_name: "incomplete-prior-pin",
      skill_id: null,
      current_version: "2.0.0",
      current_content_hash: "8".repeat(64),
      actor: "alice",
    });
    db.prepare(
      `UPDATE skill_version_pins
          SET prior_version = ?, prior_content_hash = ?, prior_skill_id = ?
        WHERE agent_id = ? AND skill_name = ?`
    ).run(
      "1.0.0",
      "7".repeat(64),
      incompletePrior,
      "rollback-edge-agent",
      "incomplete-prior-pin"
    );
    expect(() =>
      rollbackAgentVersionPinByAgent(db, {
        agent_id: "rollback-edge-agent",
        skill_name: "incomplete-prior-pin",
        operator: "alice",
      })
    ).toThrow(/completeness_pct/);

    const tamperedPrior = insertSkillRow({
      name: "tampered-prior",
      dispatch_status: "enabled",
      completeness_pct: 100,
      content_hash: "9".repeat(64),
    });
    createOrUpdateAgentVersionPin(db, {
      agent_id: "rollback-edge-agent",
      skill_name: "tampered-prior-pin",
      skill_id: null,
      current_version: "2.0.0",
      current_content_hash: "a".repeat(64),
      actor: "alice",
    });
    db.prepare(
      `UPDATE skill_version_pins
          SET prior_version = ?, prior_content_hash = ?, prior_skill_id = ?
        WHERE agent_id = ? AND skill_name = ?`
    ).run(
      "1.0.0",
      "b".repeat(64),
      tamperedPrior,
      "rollback-edge-agent",
      "tampered-prior-pin"
    );
    expect(() =>
      rollbackAgentVersionPinByAgent(db, {
        agent_id: "rollback-edge-agent",
        skill_name: "tampered-prior-pin",
        operator: "alice",
      })
    ).toThrow(/tampering suspected/);
  });

  it("rollbackAgentVersionPinByAgent fails when the prior registry row is missing", async () => {
    const {
      createOrUpdateAgentVersionPin,
      rollbackAgentVersionPinByAgent,
      SyncGovernanceError,
    } = await importSyncModule();
    insertAgent("missing-prior-agent", "Missing Prior Agent");
    const priorId = insertSkillRow({
      name: "missing-prior-row",
      dispatch_status: "enabled",
      completeness_pct: 100,
      content_hash: "e".repeat(64),
    });
    createOrUpdateAgentVersionPin(db, {
      agent_id: "missing-prior-agent",
      skill_name: "missing-prior-pin",
      skill_id: null,
      current_version: "2.0.0",
      current_content_hash: "f".repeat(64),
      actor: "alice",
    });
    db.prepare(
      `UPDATE skill_version_pins
          SET prior_version = ?, prior_content_hash = ?, prior_skill_id = ?
        WHERE agent_id = ? AND skill_name = ?`
    ).run(
      "1.0.0",
      "e".repeat(64),
      priorId,
      "missing-prior-agent",
      "missing-prior-pin"
    );

    db.pragma("foreign_keys = OFF");
    try {
      db.prepare(`DELETE FROM skill_registry WHERE id = ?`).run(priorId);
    } finally {
      db.pragma("foreign_keys = ON");
    }

    expect(() =>
      rollbackAgentVersionPinByAgent(db, {
        agent_id: "missing-prior-agent",
        skill_name: "missing-prior-pin",
        operator: "alice",
      })
    ).toThrow(SyncGovernanceError);
  });

  it("rollbackAgentVersionPin reports pins that vanish during rollback", async () => {
    const { createOrUpdateAgentVersionPin, rollbackAgentVersionPin, SyncGovernanceError } =
      await importSyncModule();
    insertAgent("rollback-vanish-agent", "Rollback Vanish Agent");
    createOrUpdateAgentVersionPin(db, {
      agent_id: "rollback-vanish-agent",
      skill_name: "rollback-vanishes",
      skill_id: null,
      current_version: "1.0.0",
      current_content_hash: "c".repeat(64),
      actor: "alice",
    });
    const current = createOrUpdateAgentVersionPin(db, {
      agent_id: "rollback-vanish-agent",
      skill_name: "rollback-vanishes",
      skill_id: null,
      current_version: "2.0.0",
      current_content_hash: "d".repeat(64),
      actor: "alice",
    });
    db.prepare(
      `CREATE TRIGGER delete_rollback_vanishing_pin
       AFTER UPDATE ON skill_version_pins
       WHEN NEW.id = ${current.id}
        AND NEW.rolled_back_by = 'alice'
       BEGIN
         DELETE FROM skill_version_pins WHERE id = NEW.id;
       END`
    ).run();

    expect(() =>
      rollbackAgentVersionPin(db, {
        pin_id: current.id,
        operator: "alice",
      })
    ).toThrow(SyncGovernanceError);
  });
});
