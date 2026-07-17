// @vitest-environment node
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

import { CURRENT_SCHEMA_VERSION, getSchemaVersion, initSchema } from "@/lib/db-schema";

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
});
