// @vitest-environment node
import crypto from "crypto";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CURRENT_SCHEMA_VERSION, initSchema } from "@/lib/db-schema";
import {
  buildKnowledgeAuditEntry,
  verifyKnowledgeAuditChain,
} from "@/lib/audit/knowledge-chain";
import { writeAuditEntry } from "@/lib/audit/write";
import {
  ERASURE_TOMBSTONE_AUDIT_POLICY,
  insertErasureTombstone,
  listErasureTombstones,
  tombstoneUserForDsar,
} from "@/lib/erasure-tombstone";

let db: Database.Database;

beforeEach(() => {
  db = new Database(":memory:");
  initSchema(db);
});

afterEach(() => {
  db.close();
});

function seedChain(database: Database.Database, tenantId: string): void {
  database
    .prepare("INSERT OR IGNORE INTO tenants (id, name) VALUES (?, ?)")
    .run(tenantId, tenantId);
  for (let i = 0; i < 3; i++) {
    const entry = buildKnowledgeAuditEntry(database, {
      tenantId,
      actorId: "op",
      actorRole: "operator",
      path: `f${i}.md`,
      operation: "write",
      agentId: "a1",
      userId: "u1",
      opHash: `sha256:${crypto.createHash("sha256").update(String(i)).digest("hex")}`,
    });
    writeAuditEntry(
      {
        id: entry.id,
        tenant_id: entry.tenantId,
        actor_id: entry.actorId,
        actor_role: entry.actorRole,
        event_type: entry.eventType,
        entity_type: entry.entityType,
        entity_id: entry.entityId,
        reason: entry.reason,
        metadata_json: entry.metadata_json,
        created_at: entry.created_at,
      },
      database
    );
  }
}

describe("erasure-tombstone (ENTOPS-08)", () => {
  it("migration creates erasure_tombstones and stamps schema v30+", () => {
    expect(CURRENT_SCHEMA_VERSION).toBeGreaterThanOrEqual(30);
    const version = db.pragma("user_version", { simple: true });
    expect(version).toBe(CURRENT_SCHEMA_VERSION);
    const cols = db
      .prepare("PRAGMA table_info(erasure_tombstones)")
      .all() as Array<{ name: string }>;
    const names = cols.map((c) => c.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "id",
        "tenant_id",
        "entity_type",
        "entity_id",
        "reason",
        "tombstoned_by",
        "tombstoned_at",
        "scheduled_purge_at",
        "purged_at",
      ])
    );
  });

  it("tombstones never break the knowledge audit hash chain", () => {
    const tenantId = "tenant-chain";
    seedChain(db, tenantId);
    const before = verifyKnowledgeAuditChain(db, tenantId);
    expect(before.valid).toBe(true);
    expect(before.checked).toBe(3);

    tombstoneUserForDsar(db, {
      tenantId,
      userId: "u1",
      tombstonedBy: "admin",
    });

    const after = verifyKnowledgeAuditChain(db, tenantId);
    expect(after.valid).toBe(true);
    expect(after.checked).toBe(3);

    const auditCount = (
      db.prepare("SELECT COUNT(*) AS c FROM audit_entries WHERE tenant_id = ?").get(tenantId) as {
        c: number;
      }
    ).c;
    expect(auditCount).toBe(3);
    expect(ERASURE_TOMBSTONE_AUDIT_POLICY).toBe("never_delete_audit_rows");
  });

  it("insertErasureTombstone is idempotent on unique key", () => {
    const first = insertErasureTombstone(db, {
      tenantId: "t",
      entityType: "user",
      entityId: "u",
      tombstonedBy: "admin",
      reason: "dsar",
    });
    const second = insertErasureTombstone(db, {
      tenantId: "t",
      entityType: "user",
      entityId: "u",
      tombstonedBy: "admin-2",
      reason: "dsar",
    });
    expect(second.id).toBe(first.id);
    const listed = listErasureTombstones(db, { tenantId: "t", entityId: "u" });
    expect(listed).toHaveLength(1);
  });
});
