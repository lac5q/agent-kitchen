// @vitest-environment node
/**
 * Phase 149 (continued) / SKILLTRUST-04 / VAL-SKILL-030 — Library
 * tests for pin idempotency, optimistic concurrency, and the
 * rollback validation against policy-invalid versions.
 *
 * Covers:
 *   - idempotency_key with matching body returns the same pin
 *   - idempotency_key reuse with a different body returns a typed error
 *   - expected_current_updated_at mismatch returns a typed error
 *   - rollbackAgentVersionPinByAgent refuses policy-invalid prior versions
 *   - rollbackAgentVersionPinByAgent refuses prior registry hash tampering
 *   - rollbackAgentVersionPinByAgent succeeds for retired prior versions
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";

const TMP_ROOT = path.join(
  os.tmpdir(),
  `skill-pin-idempotency-${crypto.randomUUID()}`
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

async function loadGovernance() {
  return await import("../skill-sync-governance");
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
  dispatch_status?: string;
  completeness_pct?: number;
  content_hash?: string | null;
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
      overrides.name ?? "idem-skill",
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
// VAL-SKILL-030 — idempotency + optimistic concurrency
// ---------------------------------------------------------------------------

describe("VAL-SKILL-030 idempotency_key behavior", () => {
  it("matching key + matching body returns the existing pin", async () => {
    const { createOrUpdateAgentVersionPin } = await loadGovernance();
    insertAgent("idem-1", "Idem 1");
    const skillId = insertSkillRow({
      name: "idem-skill",
      dispatch_status: "enabled",
      completeness_pct: 100,
      content_hash: "1".repeat(64),
    });

    const first = createOrUpdateAgentVersionPin(db, {
      agent_id: "idem-1",
      skill_name: "idem-skill",
      skill_id: skillId,
      current_version: "1.0.0",
      current_content_hash: "1".repeat(64),
      actor: "alice",
      idempotency_key: "key-1",
    });
    const second = createOrUpdateAgentVersionPin(db, {
      agent_id: "idem-1",
      skill_name: "idem-skill",
      skill_id: skillId,
      current_version: "1.0.0",
      current_content_hash: "1".repeat(64),
      actor: "alice",
      idempotency_key: "key-1",
    });
    expect(second.id).toBe(first.id);
    expect(second.actor).toBe("alice"); // not updated
  });

  it("reused key + mismatched body returns a typed SyncGovernanceError", async () => {
    const { createOrUpdateAgentVersionPin, SyncGovernanceError } =
      await loadGovernance();
    insertAgent("idem-2", "Idem 2");
    const skillId = insertSkillRow({
      name: "idem-2-skill",
      dispatch_status: "enabled",
      completeness_pct: 100,
      content_hash: "1".repeat(64),
    });
    createOrUpdateAgentVersionPin(db, {
      agent_id: "idem-2",
      skill_name: "idem-2-skill",
      skill_id: skillId,
      current_version: "1.0.0",
      current_content_hash: "1".repeat(64),
      actor: "alice",
      idempotency_key: "key-2",
    });
    expect(() =>
      createOrUpdateAgentVersionPin(db, {
        agent_id: "idem-2",
        skill_name: "idem-2-skill",
        skill_id: skillId,
        current_version: "2.0.0", // different body
        current_content_hash: "1".repeat(64),
        actor: "alice",
        idempotency_key: "key-2",
      })
    ).toThrow(SyncGovernanceError);
  });

  it("different keys on the same body produce two transitions", async () => {
    const { createOrUpdateAgentVersionPin } = await loadGovernance();
    insertAgent("idem-3", "Idem 3");
    const skillId = insertSkillRow({
      name: "idem-3-skill",
      dispatch_status: "enabled",
      completeness_pct: 100,
      content_hash: "1".repeat(64),
    });
    const first = createOrUpdateAgentVersionPin(db, {
      agent_id: "idem-3",
      skill_name: "idem-3-skill",
      skill_id: skillId,
      current_version: "1.0.0",
      current_content_hash: "1".repeat(64),
      actor: "alice",
      idempotency_key: "key-a",
    });
    const second = createOrUpdateAgentVersionPin(db, {
      agent_id: "idem-3",
      skill_name: "idem-3-skill",
      skill_id: skillId,
      current_version: "2.0.0",
      current_content_hash: "2".repeat(64),
      actor: "alice",
      idempotency_key: "key-b",
    });
    expect(second.id).toBe(first.id);
    expect(second.current_version).toBe("2.0.0");
    expect(second.prior_version).toBe("1.0.0");
  });
});

describe("VAL-SKILL-030 expected_current_updated_at optimistic concurrency", () => {
  it("mismatched expected_current_updated_at returns a typed error", async () => {
    const { createOrUpdateAgentVersionPin, SyncGovernanceError } =
      await loadGovernance();
    insertAgent("oc-1", "OC 1");
    const skillId = insertSkillRow({
      name: "oc-skill",
      dispatch_status: "enabled",
      completeness_pct: 100,
      content_hash: "1".repeat(64),
    });
    const pin = createOrUpdateAgentVersionPin(db, {
      agent_id: "oc-1",
      skill_name: "oc-skill",
      skill_id: skillId,
      current_version: "1.0.0",
      current_content_hash: "1".repeat(64),
      actor: "alice",
    });
    expect(() =>
      createOrUpdateAgentVersionPin(db, {
        agent_id: "oc-1",
        skill_name: "oc-skill",
        skill_id: skillId,
        current_version: "2.0.0",
        current_content_hash: "2".repeat(64),
        actor: "alice",
        expected_current_updated_at: "2000-01-01T00:00:00.000Z",
      })
    ).toThrow(SyncGovernanceError);
    void pin;
  });

  it("matching expected_current_updated_at succeeds", async () => {
    const { createOrUpdateAgentVersionPin } = await loadGovernance();
    insertAgent("oc-2", "OC 2");
    const skillId = insertSkillRow({
      name: "oc-2-skill",
      dispatch_status: "enabled",
      completeness_pct: 100,
      content_hash: "1".repeat(64),
    });
    const pin = createOrUpdateAgentVersionPin(db, {
      agent_id: "oc-2",
      skill_name: "oc-2-skill",
      skill_id: skillId,
      current_version: "1.0.0",
      current_content_hash: "1".repeat(64),
      actor: "alice",
    });
    const updated = createOrUpdateAgentVersionPin(db, {
      agent_id: "oc-2",
      skill_name: "oc-2-skill",
      skill_id: skillId,
      current_version: "2.0.0",
      current_content_hash: "2".repeat(64),
      actor: "alice",
      expected_current_updated_at: pin.updated_at,
    });
    expect(updated.current_version).toBe("2.0.0");
    expect(updated.prior_version).toBe("1.0.0");
  });
});

describe("VAL-SKILL-031 rollbackAgentVersionPinByAgent policy validation", () => {
  it("rejects rollback when prior registry row was deleted (missing contract)", async () => {
    const {
      createOrUpdateAgentVersionPin,
      rollbackAgentVersionPinByAgent,
      SyncGovernanceError,
    } = await loadGovernance();
    insertAgent("rb-missing", "RB Missing");
    const skillId = insertSkillRow({
      name: "rb-missing-skill",
      dispatch_status: "enabled",
      completeness_pct: 100,
      content_hash: "1".repeat(64),
    });
    createOrUpdateAgentVersionPin(db, {
      agent_id: "rb-missing",
      skill_name: "rb-missing-skill",
      skill_id: skillId,
      current_version: "1.0.0",
      current_content_hash: "1".repeat(64),
      actor: "alice",
    });
    const second = createOrUpdateAgentVersionPin(db, {
      agent_id: "rb-missing",
      skill_name: "rb-missing-skill",
      skill_id: skillId,
      current_version: "2.0.0",
      current_content_hash: "2".repeat(64),
      actor: "alice",
    });
    db.pragma("foreign_keys = OFF");
    try {
      db.prepare(`DELETE FROM skill_registry WHERE id = ?`).run(skillId);
    } finally {
      db.pragma("foreign_keys = ON");
    }
    expect(() =>
      rollbackAgentVersionPinByAgent(db, {
        agent_id: "rb-missing",
        skill_name: "rb-missing-skill",
        operator: "alice",
      })
    ).toThrow(SyncGovernanceError);
    void second;
  });

  it("rejects rollback when prior version is incomplete", async () => {
    const {
      createOrUpdateAgentVersionPin,
      rollbackAgentVersionPinByAgent,
      SyncGovernanceError,
    } = await loadGovernance();
    insertAgent("rb-incomplete", "RB Incomplete");
    const priorId = insertSkillRow({
      name: "rb-incomplete-prior",
      dispatch_status: "enabled",
      completeness_pct: 100,
      content_hash: "1".repeat(64),
    });
    insertSkillRow({
      name: "rb-incomplete-prior",
      source_harness: "codex",
      dispatch_status: "enabled",
      completeness_pct: 100,
      content_hash: "2".repeat(64),
      version: "2.0.0",
    });
    createOrUpdateAgentVersionPin(db, {
      agent_id: "rb-incomplete",
      skill_name: "rb-incomplete-prior",
      skill_id: priorId,
      current_version: "1.0.0",
      current_content_hash: "1".repeat(64),
      actor: "alice",
    });
    createOrUpdateAgentVersionPin(db, {
      agent_id: "rb-incomplete",
      skill_name: "rb-incomplete-prior",
      skill_id: priorId,
      current_version: "2.0.0",
      current_content_hash: "2".repeat(64),
      actor: "alice",
    });
    // Lower the prior registry row's completeness so the rollback
    // sees a policy-invalid prior state.
    db.prepare(
      `UPDATE skill_registry SET completeness_pct = 50 WHERE id = ?`
    ).run(priorId);
    expect(() =>
      rollbackAgentVersionPinByAgent(db, {
        agent_id: "rb-incomplete",
        skill_name: "rb-incomplete-prior",
        operator: "alice",
      })
    ).toThrow(/completeness_pct/);
  });

  it("rejects rollback when prior registry hash differs from the pin (tampering)", async () => {
    const {
      createOrUpdateAgentVersionPin,
      rollbackAgentVersionPinByAgent,
      SyncGovernanceError,
    } = await loadGovernance();
    insertAgent("rb-tamper", "RB Tamper");
    const priorId = insertSkillRow({
      name: "rb-tamper-skill",
      dispatch_status: "enabled",
      completeness_pct: 100,
      content_hash: "1".repeat(64),
    });
    insertSkillRow({
      name: "rb-tamper-skill",
      source_harness: "codex",
      dispatch_status: "enabled",
      completeness_pct: 100,
      content_hash: "2".repeat(64),
      version: "2.0.0",
    });
    createOrUpdateAgentVersionPin(db, {
      agent_id: "rb-tamper",
      skill_name: "rb-tamper-skill",
      skill_id: priorId,
      current_version: "1.0.0",
      current_content_hash: "1".repeat(64),
      actor: "alice",
    });
    createOrUpdateAgentVersionPin(db, {
      agent_id: "rb-tamper",
      skill_name: "rb-tamper-skill",
      skill_id: priorId,
      current_version: "2.0.0",
      current_content_hash: "2".repeat(64),
      actor: "alice",
    });
    // Tamper with the prior row's content_hash.
    db.prepare(
      `UPDATE skill_registry SET content_hash = ? WHERE id = ?`
    ).run("f".repeat(64), priorId);
    expect(() =>
      rollbackAgentVersionPinByAgent(db, {
        agent_id: "rb-tamper",
        skill_name: "rb-tamper-skill",
        operator: "alice",
      })
    ).toThrow(/tamper/i);
  });

  it("allows rollback to a retired prior version (escape hatch)", async () => {
    const {
      createOrUpdateAgentVersionPin,
      rollbackAgentVersionPinByAgent,
    } = await loadGovernance();
    insertAgent("rb-retired", "RB Retired");
    const priorId = insertSkillRow({
      name: "rb-retired-skill",
      dispatch_status: "enabled",
      completeness_pct: 100,
      content_hash: "1".repeat(64),
    });
    insertSkillRow({
      name: "rb-retired-skill",
      source_harness: "codex",
      dispatch_status: "enabled",
      completeness_pct: 100,
      content_hash: "2".repeat(64),
      version: "2.0.0",
    });
    createOrUpdateAgentVersionPin(db, {
      agent_id: "rb-retired",
      skill_name: "rb-retired-skill",
      skill_id: priorId,
      current_version: "1.0.0",
      current_content_hash: "1".repeat(64),
      actor: "alice",
    });
    createOrUpdateAgentVersionPin(db, {
      agent_id: "rb-retired",
      skill_name: "rb-retired-skill",
      skill_id: priorId,
      current_version: "2.0.0",
      current_content_hash: "2".repeat(64),
      actor: "alice",
    });
    // Mark the prior row as retired — lifecycle_state is documented as
    // an orthogonal concern, so a retired prior version must still be
    // rollback-able (escape hatch).
    db.prepare(
      `UPDATE skill_registry SET lifecycle_state = 'retired' WHERE id = ?`
    ).run(priorId);
    const rolled = rollbackAgentVersionPinByAgent(db, {
      agent_id: "rb-retired",
      skill_name: "rb-retired-skill",
      operator: "alice",
    });
    expect(rolled.current_version).toBe("1.0.0");
  });

  it("returns 404-style error when no pin exists for the (agent, skill) tuple", async () => {
    const { rollbackAgentVersionPinByAgent, SyncGovernanceError } =
      await loadGovernance();
    insertAgent("rb-empty", "RB Empty");
    expect(() =>
      rollbackAgentVersionPinByAgent(db, {
        agent_id: "rb-empty",
        skill_name: "no-such-skill",
        operator: "alice",
      })
    ).toThrow(SyncGovernanceError);
  });
});
