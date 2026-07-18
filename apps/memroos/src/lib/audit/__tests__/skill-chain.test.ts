/**
 * VAL-SKILL-038,039,040 — skill audit chain + atomic + migration idempotency tests
 */

import { describe, it, expect, vi } from "vitest";
import Database from "better-sqlite3";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";

const SCHEMA_SQL = `
  CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);
  CREATE TABLE skill_registry (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    source_harness TEXT NOT NULL,
    dispatch_status TEXT NOT NULL DEFAULT 'incomplete',
    version TEXT,
    raw_body TEXT NOT NULL DEFAULT '',
    completeness_pct INTEGER NOT NULL DEFAULT 0,
    missing_fields_json TEXT NOT NULL DEFAULT '[]',
    imported_by TEXT NOT NULL,
    imported_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    evidence_examples TEXT,
    content_hash TEXT,
    trust_level TEXT NOT NULL DEFAULT 'unsigned',
    public_key_fingerprint TEXT,
    lifecycle_state TEXT NOT NULL DEFAULT 'draft' CHECK(lifecycle_state IN ('draft','enabled','deprecated','retired')),
    UNIQUE(name, source_harness)
  );
  CREATE TABLE skill_quarantine (
    id INTEGER PRIMARY KEY,
    skill_id INTEGER NOT NULL UNIQUE REFERENCES skill_registry(id) ON DELETE CASCADE,
    stage TEXT NOT NULL DEFAULT 'imported',
    scanner_result TEXT NOT NULL DEFAULT '{}',
    eval_score REAL,
    approval_status TEXT NOT NULL DEFAULT 'pending',
    approved_by TEXT,
    approved_at TEXT,
    rejection_reason TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
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
    metadata_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`;

function createMemDb(): Database.Database {
  const db = new Database(":memory:");
  db.exec(SCHEMA_SQL);
  return db;
}

import {
  buildSkillAuditEntry,
  verifySkillAuditChain,
} from "@/lib/audit/skill-chain";

describe("VAL-039 hash-chain verification", () => {
  it("validates tenant and skill event prefix before building entries", () => {
    const db = createMemDb();

    expect(() =>
      buildSkillAuditEntry(db, {
        tenantId: " ",
        actorId: "op",
        actorRole: "operator",
        eventType: "skill.pin.created",
        entityType: "skill_version_pin",
        entityId: "pin:1",
        metadata: {},
      })
    ).toThrow(/tenantId/);

    expect(() =>
      buildSkillAuditEntry(db, {
        tenantId: "tenant",
        actorId: "op",
        actorRole: "operator",
        eventType: "agent.updated",
        entityType: "agent",
        entityId: "agent:1",
        metadata: {},
      })
    ).toThrow(/eventType/);
  });

  it("returns valid for clean chain and detects tamper", () => {
    const db = createMemDb();

    const first = buildSkillAuditEntry(db, {
      tenantId: "default-tenant",
      actorId: "op1",
      actorRole: "operator",
      eventType: "skill.quarantine.transitioned",
      entityType: "skill",
      entityId: "skill:1",
      reason: "transition",
      metadata: { skill_id: 1, from_stage: "imported", to_stage: "scanning", classification: "test" },
    });
    db.prepare(
      `INSERT INTO audit_entries (id, tenant_id, actor_id, actor_role, event_type, entity_type, entity_id, reason, metadata_json, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`
    ).run(first.id, first.tenantId, first.actorId, first.actorRole, first.eventType, first.entityType, first.entityId, first.reason, first.metadata_json, first.created_at);

    const second = buildSkillAuditEntry(db, {
      tenantId: "default-tenant",
      actorId: "op1",
      actorRole: "operator",
      eventType: "skill.quarantine.transitioned",
      entityType: "skill",
      entityId: "skill:1",
      reason: "transition",
      metadata: { skill_id: 1, from_stage: "scanning", to_stage: "pending_approval", classification: "test" },
    });
    db.prepare(
      `INSERT INTO audit_entries (id, tenant_id, actor_id, actor_role, event_type, entity_type, entity_id, reason, metadata_json, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`
    ).run(second.id, second.tenantId, second.actorId, second.actorRole, second.eventType, second.entityType, second.entityId, second.reason, second.metadata_json, second.created_at);

    let result = verifySkillAuditChain(db, "default-tenant");
    expect(result.valid).toBe(true);
    expect(result.checked).toBe(2);

    const stored = JSON.parse(second.metadata_json) as Record<string, unknown>;
    (stored as any).to_stage = "tampered";
    db.prepare(`UPDATE audit_entries SET metadata_json = ? WHERE id = ?`).run(JSON.stringify(stored), second.id);

    result = verifySkillAuditChain(db, "default-tenant");
    expect(result.valid).toBe(false);
    expect(result.firstBrokenEntryId).toBe(second.id);
  });

  it("detects deletion (broken chain via previousEntryHash mismatch after removal)", () => {
    const db = createMemDb();

    const entries = [];
    for (let i = 0; i < 3; i++) {
      const built = buildSkillAuditEntry(db, {
        tenantId: "t",
        actorId: "op",
        actorRole: "operator",
        eventType: "skill.pin.created",
        entityType: "skill_version_pin",
        entityId: `pin:${i}`,
        reason: `create ${i}`,
        metadata: { skill_id: i, classification: "test" },
      });
      db.prepare(
        `INSERT INTO audit_entries (id, tenant_id, actor_id, actor_role, event_type, entity_type, entity_id, reason, metadata_json, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`
      ).run(built.id, built.tenantId, built.actorId, built.actorRole, built.eventType, built.entityType, built.entityId, built.reason, built.metadata_json, built.created_at);
      entries.push(built);
    }

    let res = verifySkillAuditChain(db, "t");
    expect(res.valid).toBe(true);
    expect(res.checked).toBe(3);

    db.prepare(`DELETE FROM audit_entries WHERE id = ?`).run(entries[1].id);

    res = verifySkillAuditChain(db, "t");
    expect(res.valid).toBe(false);
    expect(res.firstBrokenEntryId).toBe(entries[2].id);
  });

  it("audit evidence contains IDs/hashes/classifications/reasons and no raw secrets", () => {
    const db = createMemDb();
    const built = buildSkillAuditEntry(db, {
      tenantId: "default-tenant",
      actorId: "op",
      actorRole: "operator",
      eventType: "skill.quarantine.transitioned",
      entityType: "skill",
      entityId: "skill:42",
      reason: "operator approved",
      metadata: {
        skill_id: 42,
        from_stage: "pending_approval",
        to_stage: "enabled",
        classification: "quarantine_approved",
        raw_body: "SECRET_BODY_SHOULD_BE_STRIPPED",
        evidence_examples: "should be stripped",
      },
    });
    const meta = JSON.parse(built.metadata_json);
    expect(meta.skill_id).toBe(42);
    expect(meta.classification).toBe("quarantine_approved");
    expect(meta.raw_body).toBeUndefined();
    expect(meta.evidence_examples).toBeUndefined();
    expect(JSON.stringify(built.metadata_json)).not.toContain("SECRET_BODY_SHOULD_BE_STRIPPED");
  });

  it("redacts long body-like metadata and rejects malformed stored chain metadata", () => {
    const db = createMemDb();
    const built = buildSkillAuditEntry(db, {
      tenantId: "default-tenant",
      actorId: "op",
      actorRole: "operator",
      eventType: "skill.pin.created",
      entityType: "skill_version_pin",
      entityId: "pin:1",
      metadata: {
        safe: "kept",
        generatedContent: "x".repeat(501),
      },
    });
    const meta = JSON.parse(built.metadata_json);
    expect(meta.safe).toBe("kept");
    expect(meta.generatedContent).toBeUndefined();

    db.prepare(
      `INSERT INTO audit_entries (id, tenant_id, actor_id, actor_role, event_type, entity_type, entity_id, reason, metadata_json, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`
    ).run("bad-json", "default-tenant", "op", "operator", "skill.pin.created", "skill_version_pin", "pin:bad", null, "{", "2026-01-01T00:00:00.000Z");

    expect(verifySkillAuditChain(db, "default-tenant")).toMatchObject({
      valid: false,
      firstBrokenEntryId: "bad-json",
      reason: "metadata_json is not valid JSON",
    });

    db.prepare(`UPDATE audit_entries SET metadata_json = ? WHERE id = ?`).run(JSON.stringify({ previousEntryHash: null }), "bad-json");
    expect(verifySkillAuditChain(db, "default-tenant")).toMatchObject({
      valid: false,
      firstBrokenEntryId: "bad-json",
      reason: "missing entryHash",
    });
  });
});

describe("VAL-038 audit-atomic — transactions", () => {
  it("quarantine approve rolls back registry when audit insert fails (audit-atomic)", async () => {
    const TMP_ROOT = path.join(os.tmpdir(), `audit-atomic-${crypto.randomUUID()}`);
    fs.mkdirSync(TMP_ROOT, { recursive: true });
    const dbPath = path.join(TMP_ROOT, `db-${crypto.randomUUID()}.db`);
    process.env["MEMROOS_ROOT"] = TMP_ROOT;
    process.env["SQLITE_DB_PATH"] = dbPath;
    vi.resetModules();
    const { getDb, closeDb } = await import("@/lib/db");
    const { initSchema } = await import("@/lib/db-schema");
    const db = getDb();
    initSchema(db);

    const skillId = Number(
      db
        .prepare(
          `INSERT INTO skill_registry (name, source_harness, dispatch_status, imported_by, raw_body, completeness_pct, missing_fields_json, trust_level, lifecycle_state) VALUES ('s','claude','quarantined','op','body',100,'[]','unsigned','draft')`
        )
        .run().lastInsertRowid
    );
    db.prepare(
      `INSERT INTO skill_quarantine (skill_id, stage, approval_status) VALUES (?,'pending_approval','pending')`
    ).run(skillId);

    const { approveQuarantine } = await import("@/lib/skills/skill-quarantine");
    const beforeStatus = db.prepare(`SELECT dispatch_status FROM skill_registry WHERE id = ?`).get(skillId) as { dispatch_status: string };
    expect(beforeStatus.dispatch_status).toBe("quarantined");

    const skillChainMod = await import("@/lib/audit/skill-chain");
    const spy = vi.spyOn(skillChainMod, "buildSkillAuditEntry").mockImplementation(() => {
      throw new Error("simulated audit failure");
    });

    let threw = false;
    try {
      approveQuarantine(db, skillId, "alice");
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);

    const afterStatus = db.prepare(`SELECT dispatch_status FROM skill_registry WHERE id = ?`).get(skillId) as { dispatch_status: string };
    expect(afterStatus.dispatch_status).toBe("quarantined");

    spy.mockRestore();

    const result = approveQuarantine(db, skillId, "alice");
    expect(result.stage).toBe("enabled");
    const finalStatus = db.prepare(`SELECT dispatch_status FROM skill_registry WHERE id = ?`).get(skillId) as { dispatch_status: string };
    expect(finalStatus.dispatch_status).toBe("enabled");

    const auditCount = db.prepare(`SELECT COUNT(*) as c FROM audit_entries WHERE event_type LIKE 'skill_%'`).get() as { c: number };
    expect(auditCount.c).toBeGreaterThan(0);

    closeDb();
    fs.rmSync(TMP_ROOT, { recursive: true, force: true });
    delete process.env["MEMROOS_ROOT"];
    delete process.env["SQLITE_DB_PATH"];
  });
});

describe("VAL-040 migration idempotency", () => {
  it("running initSchema twice yields same version and no data loss", async () => {
    const TMP_ROOT = path.join(os.tmpdir(), `migration-idem-${crypto.randomUUID()}`);
    fs.mkdirSync(TMP_ROOT, { recursive: true });
    const dbPath = path.join(TMP_ROOT, `db-${crypto.randomUUID()}.db`);
    process.env["MEMROOS_ROOT"] = TMP_ROOT;
    process.env["SQLITE_DB_PATH"] = dbPath;
    vi.resetModules();

    const { getDb, closeDb } = await import("@/lib/db");
    const { initSchema, getSchemaVersion, CURRENT_SCHEMA_VERSION } = await import("@/lib/db-schema");
    const db = getDb();
    initSchema(db);
    const v1 = getSchemaVersion(db);

    const skillId = Number(
      db.prepare(`INSERT INTO skill_registry (name, source_harness, dispatch_status, imported_by, raw_body, completeness_pct, missing_fields_json, trust_level, lifecycle_state) VALUES ('test-skill','claude','enabled','op','body',100,'[]','unsigned','enabled')`).run().lastInsertRowid
    );
    db.prepare(`INSERT INTO registered_agents (id, name, role, platform, protocol, status, location, metadata, created_at, updated_at) VALUES ('agent-1','a','r','p','rest','active','local','{}', datetime('now'), datetime('now'))`).run();
    db.prepare(`INSERT INTO skill_version_pins (agent_id, skill_name, skill_id, current_version, current_content_hash, actor, created_at, updated_at) VALUES ('agent-1','test-skill',?, '1.0.0', '${'a'.repeat(64)}', 'op', datetime('now'), datetime('now'))`).run(skillId);

    const skillCountBefore = (db.prepare(`SELECT COUNT(*) as c FROM skill_registry`).get() as { c: number }).c;
    const pinCountBefore = (db.prepare(`SELECT COUNT(*) as c FROM skill_version_pins`).get() as { c: number }).c;

    initSchema(db);
    const v2 = getSchemaVersion(db);

    expect(v2).toBe(v1);
    expect(v2).toBe(CURRENT_SCHEMA_VERSION);

    const skillCountAfter = (db.prepare(`SELECT COUNT(*) as c FROM skill_registry`).get() as { c: number }).c;
    const pinCountAfter = (db.prepare(`SELECT COUNT(*) as c FROM skill_version_pins`).get() as { c: number }).c;

    expect(skillCountAfter).toBe(skillCountBefore);
    expect(pinCountAfter).toBe(pinCountBefore);

    const skillRow = db.prepare(`SELECT name, raw_body FROM skill_registry WHERE id = ?`).get(skillId) as { name: string; raw_body: string };
    expect(skillRow.name).toBe("test-skill");
    expect(skillRow.raw_body).toBe("body");

    closeDb();
    fs.rmSync(TMP_ROOT, { recursive: true, force: true });
    delete process.env["MEMROOS_ROOT"];
    delete process.env["SQLITE_DB_PATH"];
  });
});
