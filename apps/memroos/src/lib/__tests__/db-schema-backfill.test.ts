// @vitest-environment node
import { createHash } from "crypto";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

import {
  CURRENT_SCHEMA_VERSION,
  getSchemaVersion,
  initSchema,
  rebuildMessageFtsProjection,
} from "@/lib/db-schema";

describe("db-schema audit backfill", () => {
  it("backfills legacy seal_audit_log and audit_log rows into audit_entries on first init", () => {
    const db = new Database(":memory:");

    db.exec(`
      CREATE TABLE seal_audit_log (
        id TEXT PRIMARY KEY,
        proposal_id TEXT NOT NULL,
        event TEXT NOT NULL,
        baseline_w REAL,
        post_apply_w REAL,
        delta_l1 REAL,
        delta_l2 REAL,
        delta_l3 REAL,
        delta_composite REAL,
        detail_json TEXT,
        timestamp TEXT NOT NULL,
        tenant_id TEXT
      );
      CREATE TABLE audit_log (
        id INTEGER PRIMARY KEY,
        actor TEXT NOT NULL,
        action TEXT NOT NULL,
        target TEXT NOT NULL,
        detail TEXT,
        severity TEXT NOT NULL,
        timestamp TEXT NOT NULL
      );
      INSERT INTO seal_audit_log VALUES (
        'seal-1', 'proposal-1', 'approved', 0.5, 0.6, 0.1, 0.1, 0.1, 0.3,
        '{"note":"legacy seal"}', '2026-01-01T00:00:00.000Z', 'default-tenant'
      );
      INSERT INTO audit_log VALUES (
        1, 'operator', 'login', 'console', 'legacy detail', 'info', '2026-01-02T00:00:00.000Z'
      );
    `);

    initSchema(db);

    expect(getSchemaVersion(db)).toBe(CURRENT_SCHEMA_VERSION);
    const sealBackfill = db.prepare("SELECT event_type, entity_id FROM audit_entries WHERE id = ?").get("seal-backfill-seal-1") as { event_type: string; entity_id: string };
    const auditBackfill = db.prepare("SELECT event_type, entity_id FROM audit_entries WHERE id = ?").get("audit-backfill-1") as { event_type: string; entity_id: string };
    expect(sealBackfill.event_type).toBe("seal.approved");
    expect(sealBackfill.entity_id).toBe("seal_proposal:proposal-1");
    expect(auditBackfill.event_type).toBe("agent.login");
    expect(auditBackfill.entity_id).toBe("agent:console");

    const flag = db.prepare("SELECT value FROM meta WHERE key = 'audit_entries_backfill_done'").get() as { value: string };
    expect(flag.value).toBe("1");
    db.close();
  });

  it("rejects databases stamped with a future schema version", () => {
    const db = new Database(":memory:");
    db.pragma(`user_version = ${CURRENT_SCHEMA_VERSION + 1}`);

    expect(() => initSchema(db)).toThrow(/newer than this code supports/);
    db.close();
  });

  it("seeds the internal API key hash and rejects the known default key", () => {
    const db = new Database(":memory:");
    const key = "real-internal-key-for-test";
    process.env.MEMROOS_INTERNAL_API_KEY = key;

    try {
      initSchema(db);
      const expectedHash = createHash("sha256").update(key).digest("hex");
      const row = db
        .prepare("SELECT key_hash FROM tenant_api_keys WHERE id = 'tak-internal-env'")
        .get() as { key_hash: string };
      expect(row.key_hash).toBe(expectedHash);
    } finally {
      delete process.env.MEMROOS_INTERNAL_API_KEY;
      db.close();
    }

    const defaultDb = new Database(":memory:");
    process.env.MEMROOS_INTERNAL_API_KEY = "memroos-internal-default-key";
    try {
      expect(() => initSchema(defaultDb)).toThrow(/known default value/);
    } finally {
      delete process.env.MEMROOS_INTERNAL_API_KEY;
      defaultDb.close();
    }
  });

  it("rebuilds the message FTS projection with only indexable visible rows", () => {
    const db = new Database(":memory:");
    initSchema(db);
    const insert = db.prepare(
      `INSERT INTO messages(session_id, project, agent_id, role, content, timestamp, visibility, policy)
       VALUES(?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    insert.run("s1", "p", "a", "user", "needlevisible", "2026-01-01T00:00:00.000Z", "internal", "indexable");
    insert.run("s1", "p", "a", "user", "needlesealed", "2026-01-01T00:00:01.000Z", "private", "sealed");

    db.exec("INSERT INTO messages_fts(messages_fts) VALUES('delete-all')");
    rebuildMessageFtsProjection(db);

    expect(db.prepare("SELECT rowid FROM messages_fts WHERE messages_fts MATCH ?").all("needlevisible")).toHaveLength(1);
    expect(db.prepare("SELECT rowid FROM messages_fts WHERE messages_fts MATCH ?").all("needlesealed")).toHaveLength(0);
    db.close();
  });

  it("migrates legacy business outcome event uniqueness to include tenant_id", () => {
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE business_outcome_events (
        id              INTEGER PRIMARY KEY,
        tenant_id       TEXT    NOT NULL DEFAULT 'default-tenant',
        correlation_id  TEXT    NOT NULL,
        source_system   TEXT    NOT NULL CHECK(source_system IN ('crm','helpdesk','finance')),
        adapter         TEXT    NOT NULL,
        event_type      TEXT    NOT NULL,
        kpi_key         TEXT    NOT NULL,
        kpi_value       REAL    NOT NULL,
        raw_json        TEXT    NOT NULL,
        agent_id        TEXT,
        polled_at       TEXT    NOT NULL,
        created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
        UNIQUE(correlation_id, adapter, event_type, polled_at)
      );
      INSERT INTO business_outcome_events
        (tenant_id, correlation_id, source_system, adapter, event_type, kpi_key, kpi_value, raw_json, agent_id, polled_at, created_at)
      VALUES
        ('tenant-a', 'corr-1', 'crm', 'hubspot', 'deal_won', 'arr', 10, '{}', 'agent-1', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
    `);

    initSchema(db);

    const schema = db
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'business_outcome_events'")
      .get() as { sql: string };
    expect(schema.sql).toContain("UNIQUE(tenant_id, correlation_id, adapter, event_type, polled_at)");
    const row = db
      .prepare("SELECT tenant_id, correlation_id FROM business_outcome_events")
      .get() as { tenant_id: string; correlation_id: string };
    expect(row).toEqual({ tenant_id: "tenant-a", correlation_id: "corr-1" });
    db.close();
  });
});
