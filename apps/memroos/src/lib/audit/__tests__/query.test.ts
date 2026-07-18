// @vitest-environment node
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AUDIT_EVENT_TYPES, ENTITY_TYPES } from "../event-types";
import { queryAuditEntries, queryEscalations, streamAuditEntries } from "../query";

let db: Database.Database;

function insertAudit(row: {
  id: string;
  tenant?: string;
  actor?: string;
  event: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}) {
  db.prepare(
    `INSERT INTO audit_entries
      (id, tenant_id, actor_id, actor_role, event_type, entity_type, entity_id, reason, metadata_json, created_at)
     VALUES (?, ?, ?, 'agent', ?, ?, ?, NULL, ?, ?)`,
  ).run(
    row.id,
    row.tenant ?? "tenant-a",
    row.actor ?? "agent-a",
    row.event,
    row.entityType ?? ENTITY_TYPES.AGENT,
    row.entityId ?? "agent:agent-a",
    JSON.stringify(row.metadata ?? {}),
    row.createdAt,
  );
}

beforeEach(() => {
  db = new Database(":memory:");
  db.exec(`
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
    CREATE TABLE hil_escalations (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      escalation_type TEXT NOT NULL,
      sla_seconds INTEGER NOT NULL,
      sla_deadline TEXT NOT NULL,
      status TEXT NOT NULL,
      assigned_to TEXT,
      opened_by TEXT NOT NULL,
      resolved_by TEXT,
      resolution_note TEXT,
      resolved_at TEXT,
      created_at TEXT NOT NULL
    );
  `);
});

afterEach(() => {
  db.close();
});

describe("audit query service", () => {
  it("filters entries by tenant, actor, agent, event array, user id, time range, and cursor", () => {
    insertAudit({
      id: "old",
      event: AUDIT_EVENT_TYPES.AGENT_MATCHED,
      metadata: { userId: "user-1" },
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    insertAudit({
      id: "new",
      event: AUDIT_EVENT_TYPES.AGENT_FLAGGED,
      metadata: { user_id: "user-1" },
      createdAt: "2026-01-02T00:00:00.000Z",
    });
    insertAudit({
      id: "other-tenant",
      tenant: "tenant-b",
      event: AUDIT_EVENT_TYPES.AGENT_FLAGGED,
      metadata: { userId: "user-1" },
      createdAt: "2026-01-03T00:00:00.000Z",
    });

    const firstPage = queryAuditEntries(
      {
        tenantId: "tenant-a",
        actorId: "agent-a",
        agentId: "agent-a",
        eventType: [AUDIT_EVENT_TYPES.AGENT_MATCHED, AUDIT_EVENT_TYPES.AGENT_FLAGGED],
        userId: "user-1",
        from: "2025-12-31T00:00:00.000Z",
        to: "2026-01-03T00:00:00.000Z",
        limit: 1,
      },
      db,
    );

    expect(firstPage.entries.map((entry) => entry.id)).toEqual(["new"]);
    expect(firstPage.nextCursor).toBe("2026-01-02T00:00:00.000Z");

    const secondPage = queryAuditEntries(
      {
        tenantId: "tenant-a",
        userId: "user-1",
        cursor: firstPage.nextCursor,
        limit: 10,
      },
      db,
    );
    expect(secondPage.entries.map((entry) => entry.id)).toEqual(["old"]);
  });

  it("streams matching audit rows without applying pagination", () => {
    insertAudit({
      id: "agent-row",
      event: AUDIT_EVENT_TYPES.AGENT_MATCHED,
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    insertAudit({
      id: "seal-row",
      event: AUDIT_EVENT_TYPES.SEAL_APPROVED,
      entityType: ENTITY_TYPES.SEAL_PROPOSAL,
      entityId: "proposal:1",
      createdAt: "2026-01-02T00:00:00.000Z",
    });

    const rows = Array.from(streamAuditEntries({ eventType: AUDIT_EVENT_TYPES.SEAL_APPROVED }, db));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: "seal-row", entity_id: "proposal:1" });
  });

  it("streams rows with the same optional filters as paginated queries", () => {
    insertAudit({
      id: "match",
      event: AUDIT_EVENT_TYPES.AGENT_FLAGGED,
      entityType: ENTITY_TYPES.AGENT,
      entityId: "agent:agent-filter",
      actor: "actor-filter",
      metadata: { user_id: "user-100" },
      createdAt: "2026-01-02T00:00:00.000Z",
    });
    insertAudit({
      id: "wrong-user",
      event: AUDIT_EVENT_TYPES.AGENT_FLAGGED,
      entityType: ENTITY_TYPES.AGENT,
      entityId: "agent:agent-filter",
      actor: "actor-filter",
      metadata: { user_id: "user-101" },
      createdAt: "2026-01-02T00:00:01.000Z",
    });
    insertAudit({
      id: "wrong-event",
      event: AUDIT_EVENT_TYPES.AGENT_MATCHED,
      entityType: ENTITY_TYPES.AGENT,
      entityId: "agent:agent-filter",
      actor: "actor-filter",
      metadata: { user_id: "user-100" },
      createdAt: "2026-01-02T00:00:02.000Z",
    });

    expect(queryAuditEntries({ userId: "user_100%", limit: 1 }, db).entries).toEqual([]);

    const rows = Array.from(streamAuditEntries({
      tenantId: "tenant-a",
      agentId: "agent-filter",
      entityType: ENTITY_TYPES.AGENT,
      entityId: "agent:agent-filter",
      eventType: [AUDIT_EVENT_TYPES.AGENT_FLAGGED],
      actorId: "actor-filter",
      userId: "user-100",
      from: "2026-01-01T00:00:00.000Z",
      to: "2026-01-03T00:00:00.000Z",
    }, db));

    expect(rows.map((row) => row.id)).toEqual(["match"]);
  });

  it("queries HIL escalations with status filters and overdue state", () => {
    db.prepare(
      `INSERT INTO hil_escalations
        (id, tenant_id, entity_type, entity_id, escalation_type, sla_seconds, sla_deadline, status, opened_by, created_at)
       VALUES
        ('open-old', 'tenant-a', 'agent', 'agent:1', 'agent_escalate', 60, '2000-01-01T00:00:00.000Z', 'open', 'agent-a', '2026-01-01T00:00:00.000Z'),
        ('resolved-old', 'tenant-a', 'agent', 'agent:2', 'agent_escalate', 60, '2000-01-01T00:00:00.000Z', 'resolved', 'agent-a', '2026-01-01T00:00:00.000Z'),
        ('other-tenant', 'tenant-b', 'agent', 'agent:3', 'agent_escalate', 60, '2999-01-01T00:00:00.000Z', 'open', 'agent-a', '2026-01-01T00:00:00.000Z')`,
    ).run();

    const open = queryEscalations({ tenantId: "tenant-a", status: "open", limit: 20 }, db);
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({ id: "open-old", isOverdue: true });

    const all = queryEscalations({ tenantId: "tenant-a", status: "all" }, db);
    expect(all.find((row) => row.id === "resolved-old")?.isOverdue).toBe(false);
  });
});
