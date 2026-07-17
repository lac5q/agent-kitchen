// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { initSchema } from "@/lib/db-schema";
import { writeAuditEntry, openEscalation, resolveEscalation } from "@/lib/audit/write";
import { queryAuditEntries, streamAuditEntries, queryEscalations } from "@/lib/audit/query";
import { checkSlaBreaches } from "@/lib/audit/sla";

function makeDb(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("journal_mode = WAL");
  initSchema(db);
  return db;
}

describe("audit: writeAuditEntry", () => {
  it("inserts a row and SELECT returns it", () => {
    const db = makeDb();
    writeAuditEntry(
      {
        actor_id: "user-001",
        actor_role: "operator",
        event_type: "agent.matched",
        entity_type: "agent",
        entity_id: "agent:test-001",
        reason: "test reason",
      },
      db
    );
    type Row = { actor_id: string; event_type: string };
    const row = db.prepare("SELECT * FROM audit_entries WHERE actor_id = ?").get("user-001") as Row;
    expect(row).toBeDefined();
    expect(row.event_type).toBe("agent.matched");
  });
});

describe("audit: immutability triggers", () => {
  it("throws on UPDATE audit_entries", () => {
    const db = makeDb();
    writeAuditEntry(
      {
        actor_id: "system",
        actor_role: "system",
        event_type: "seal.proposed",
        entity_type: "seal_proposal",
        entity_id: "seal_proposal:p-001",
      },
      db
    );
    type Row = { id: string };
    const row = db.prepare("SELECT id FROM audit_entries LIMIT 1").get() as Row;
    expect(() => {
      db.prepare("UPDATE audit_entries SET reason = 'x' WHERE id = ?").run(row.id);
    }).toThrow("audit_entries is append-only: UPDATE is not permitted");
  });

  it("throws on DELETE audit_entries", () => {
    const db = makeDb();
    writeAuditEntry(
      {
        actor_id: "system",
        actor_role: "system",
        event_type: "eval.completed",
        entity_type: "eval_run",
        entity_id: "eval_run:r-001",
      },
      db
    );
    type Row = { id: string };
    const row = db.prepare("SELECT id FROM audit_entries LIMIT 1").get() as Row;
    expect(() => {
      db.prepare("DELETE FROM audit_entries WHERE id = ?").run(row.id);
    }).toThrow("audit_entries is append-only: DELETE is not permitted");
  });
});

describe("audit: queryAuditEntries", () => {
  let db: Database.Database;
  beforeEach(() => {
    db = makeDb();
    // Seed 10 varied rows with unique staggered timestamps to ensure cursor pagination works
    const baseTs = new Date("2026-01-01T00:00:00.000Z").getTime();
    const entries = [
      { actor_id: "user-a", actor_role: "operator" as const, event_type: "agent.matched" as const, entity_type: "agent" as const, entity_id: "agent:a-001" },
      { actor_id: "user-a", actor_role: "operator" as const, event_type: "agent.flagged" as const, entity_type: "agent" as const, entity_id: "agent:a-001" },
      { actor_id: "user-b", actor_role: "reviewer" as const, event_type: "seal.approved" as const, entity_type: "seal_proposal" as const, entity_id: "seal_proposal:s-001" },
      { actor_id: "system", actor_role: "system" as const, event_type: "seal.proposed" as const, entity_type: "seal_proposal" as const, entity_id: "seal_proposal:s-002" },
      { actor_id: "system", actor_role: "system" as const, event_type: "eval.completed" as const, entity_type: "eval_run" as const, entity_id: "eval_run:r-001" },
      { actor_id: "user-c", actor_role: "admin" as const, event_type: "agent.escalated" as const, entity_type: "agent" as const, entity_id: "agent:a-002" },
      { actor_id: "user-a", actor_role: "operator" as const, event_type: "hil.created" as const, entity_type: "hil_escalation" as const, entity_id: "hil_escalation:h-001" },
      { actor_id: "system", actor_role: "system" as const, event_type: "seal.apply_started" as const, entity_type: "seal_proposal" as const, entity_id: "seal_proposal:s-001" },
      { actor_id: "system", actor_role: "system" as const, event_type: "seal.apply_succeeded" as const, entity_type: "seal_proposal" as const, entity_id: "seal_proposal:s-001" },
      { actor_id: "user-b", actor_role: "reviewer" as const, event_type: "audit.annotation" as const, entity_type: "hil_escalation" as const, entity_id: "hil_escalation:h-001" },
    ];
    // Inject unique timestamps so cursor pagination works deterministically
    for (let i = 0; i < entries.length; i++) {
      writeAuditEntry({
        ...entries[i],
        created_at: new Date(baseTs + i * 1000).toISOString(),
      }, db);
    }
  });

  it("returns all entries when no filter", () => {
    const { entries } = queryAuditEntries({ limit: 50 }, db);
    expect(entries.length).toBe(10);
  });

  it("filters by actorId", () => {
    const { entries } = queryAuditEntries({ actorId: "user-a", limit: 50 }, db);
    expect(entries.length).toBe(3);
    expect(entries.every((e) => e.actor_id === "user-a")).toBe(true);
  });

  it("filters by eventType", () => {
    const { entries } = queryAuditEntries({ eventType: "seal.approved", limit: 50 }, db);
    expect(entries.length).toBe(1);
    expect(entries[0].event_type).toBe("seal.approved");
  });

  it("filters by entityType", () => {
    const { entries } = queryAuditEntries({ entityType: "seal_proposal", limit: 50 }, db);
    expect(entries.every((e) => e.entity_type === "seal_proposal")).toBe(true);
  });

  it("returns nextCursor when results exceed limit", () => {
    const { entries, nextCursor } = queryAuditEntries({ limit: 3 }, db);
    expect(entries.length).toBe(3);
    expect(nextCursor).toBeDefined();
  });

  it("cursor returns correct next page", () => {
    const page1 = queryAuditEntries({ limit: 5 }, db);
    expect(page1.entries.length).toBe(5);
    expect(page1.nextCursor).toBeDefined();
    const page2 = queryAuditEntries({ limit: 5, cursor: page1.nextCursor }, db);
    expect(page2.entries.length).toBe(5);
    // No overlap: page2 entries should not appear in page1
    const page1Ids = new Set(page1.entries.map((e) => e.id));
    expect(page2.entries.every((e) => !page1Ids.has(e.id))).toBe(true);
  });

  it("filters by tenantId, agentId, entityId, date range, and userId metadata", () => {
    writeAuditEntry(
      {
        tenant_id: "default-tenant",
        actor_id: "user-z",
        actor_role: "operator",
        event_type: "agent.matched",
        entity_type: "agent",
        entity_id: "agent:b-001",
        metadata_json: JSON.stringify({ user_id: "stream-user" }),
        created_at: "2026-02-01T00:00:00.000Z",
      },
      db,
    );

    const tenant = queryAuditEntries({ tenantId: "default-tenant", limit: 50 }, db);
    expect(tenant.entries.length).toBeGreaterThan(0);

    const agent = queryAuditEntries({ agentId: "b-001", limit: 50 }, db);
    expect(agent.entries.every((e) => e.entity_id === "agent:b-001")).toBe(true);

    const entity = queryAuditEntries({ entityId: "agent:b-001", limit: 50 }, db);
    expect(entity.entries).toHaveLength(1);

    const ranged = queryAuditEntries(
      { from: "2026-01-15T00:00:00.000Z", to: "2026-02-15T00:00:00.000Z", limit: 50 },
      db,
    );
    expect(ranged.entries.some((e) => e.entity_id === "agent:b-001")).toBe(true);

    const user = queryAuditEntries({ userId: "stream-user", limit: 50 }, db);
    expect(user.entries).toHaveLength(1);
  });

  it("filters by multiple event types and ignores empty eventType arrays", () => {
    const multi = queryAuditEntries(
      { eventType: ["agent.matched", "seal.approved"], limit: 50 },
      db,
    );
    expect(multi.entries.length).toBeGreaterThan(0);
    expect(multi.entries.every((e) => ["agent.matched", "seal.approved"].includes(e.event_type))).toBe(true);

    const emptyArray = queryAuditEntries({ eventType: [], limit: 50 }, db);
    expect(emptyArray.entries.length).toBe(10);
  });
});

describe("audit: streamAuditEntries (export)", () => {
  it("returns all rows as iterator (NDJSON-compatible)", () => {
    const db = makeDb();
    for (let i = 0; i < 5; i++) {
      writeAuditEntry(
        {
          actor_id: "system",
          actor_role: "system",
          event_type: "eval.completed",
          entity_type: "eval_run",
          entity_id: `eval_run:r-${i}`,
        },
        db
      );
    }
    const iterator = streamAuditEntries({}, db);
    const rows: import("@/lib/audit/schema").AuditEntry[] = [];
    for (const row of iterator) rows.push(row);
    expect(rows.length).toBe(5);
    // Verify each row is JSON-serializable (NDJSON export requirement)
    expect(() => JSON.stringify(rows[0])).not.toThrow();
  });

  it("CSV: header row + correct row count from filtered export", () => {
    const db = makeDb();
    for (let i = 0; i < 3; i++) {
      writeAuditEntry(
        { actor_id: "user-x", actor_role: "operator", event_type: "agent.flagged", entity_type: "agent", entity_id: `agent:a-${i}` },
        db
      );
    }
    // Also add a non-matching row
    writeAuditEntry(
      { actor_id: "user-y", actor_role: "reviewer", event_type: "seal.approved", entity_type: "seal_proposal", entity_id: "seal_proposal:s-0" },
      db
    );
    const iterator = streamAuditEntries({ actorId: "user-x" }, db);
    const rows = [];
    for (const row of iterator) rows.push(row);
    expect(rows.length).toBe(3);
  });

  it("streams with tenant, entity, and user filters", () => {
    const db = makeDb();
    writeAuditEntry(
      {
        tenant_id: "default-tenant",
        actor_id: "user-stream",
        actor_role: "operator",
        event_type: "agent.flagged",
        entity_type: "agent",
        entity_id: "agent:stream-1",
        metadata_json: JSON.stringify({ user_id: "stream-user" }),
      },
      db,
    );
    const rows = Array.from(
      streamAuditEntries(
        { tenantId: "default-tenant", entityType: "agent", userId: "stream-user" },
        db,
      ),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.entity_id).toBe("agent:stream-1");
  });
});

describe("audit: openEscalation", () => {
  it("creates escalation row and hil.created audit entry atomically", () => {
    const db = makeDb();
    const id = openEscalation(
      {
        entity_type: "agent",
        entity_id: "agent:a-001",
        escalation_type: "agent_escalate",
        opened_by: "system",
      },
      db
    );
    type EscRow = { id: string; status: string };
    const esc = db.prepare("SELECT id, status FROM hil_escalations WHERE id = ?").get(id) as EscRow;
    expect(esc).toBeDefined();
    expect(esc.status).toBe("open");

    type AuditRow = { event_type: string };
    const auditEntry = db
      .prepare("SELECT event_type FROM audit_entries WHERE entity_id = ? AND event_type = 'hil.created'")
      .get(`hil_escalation:${id}`) as AuditRow;
    expect(auditEntry).toBeDefined();
    expect(auditEntry.event_type).toBe("hil.created");
  });
});

describe("audit: resolveEscalation", () => {
  function seedUser(db: Database.Database, userId: string) {
    // Insert a minimal user so resolved_by FK is satisfied
    db.prepare(
      `INSERT OR IGNORE INTO users (id, email, display_name, password_hash, tenant_id)
       VALUES (?, ?, ?, 'hash', 'default-tenant')`
    ).run(userId, `${userId}@test.com`, userId);
    db.prepare(
      `INSERT OR IGNORE INTO user_roles (user_id, role) VALUES (?, 'operator')`
    ).run(userId);
  }

  it("sets resolved_at and writes hil.resolved audit entry", () => {
    const db = makeDb();
    seedUser(db, "user-op");
    const id = openEscalation(
      {
        entity_type: "agent",
        entity_id: "agent:a-001",
        escalation_type: "agent_escalate",
        opened_by: "system",
      },
      db
    );
    resolveEscalation(id, { actorId: "user-op", actorRole: "operator", note: "handled" }, db);

    type EscRow = { status: string; resolved_at: string | null };
    const esc = db.prepare("SELECT status, resolved_at FROM hil_escalations WHERE id = ?").get(id) as EscRow;
    expect(esc.status).toBe("resolved");
    expect(esc.resolved_at).not.toBeNull();

    type AuditRow = { event_type: string };
    const resolvedEntry = db
      .prepare("SELECT event_type FROM audit_entries WHERE entity_id = ? AND event_type = 'hil.resolved'")
      .get(`hil_escalation:${id}`) as AuditRow;
    expect(resolvedEntry?.event_type).toBe("hil.resolved");
  });

  it("throws when attempting to resolve an already-resolved escalation", () => {
    const db = makeDb();
    seedUser(db, "user-op");
    const id = openEscalation(
      { entity_type: "agent", entity_id: "agent:a-001", escalation_type: "agent_escalate", opened_by: "system" },
      db
    );
    resolveEscalation(id, { actorId: "user-op", actorRole: "operator" }, db);
    expect(() => {
      resolveEscalation(id, { actorId: "user-op", actorRole: "operator" }, db);
    }).toThrow(/already resolved/);
  });

  it("throws when escalation not found", () => {
    const db = makeDb();
    expect(() => {
      resolveEscalation("nonexistent-id", { actorId: "system", actorRole: "operator" }, db);
    }).toThrow(/not found/);
  });
});

describe("audit: checkSlaBreaches", () => {
  it("transitions overdue open escalations to sla_breached and writes audit entries", () => {
    const db = makeDb();
    // Create an escalation with a past deadline
    const pastDeadline = new Date(Date.now() - 3600_000).toISOString(); // 1h ago
    db.prepare(
      `INSERT INTO hil_escalations
        (id, tenant_id, entity_type, entity_id, escalation_type, sla_seconds, sla_deadline, status, opened_by, created_at)
       VALUES (?, 'default-tenant', 'agent', 'agent:a-001', 'agent_escalate', 14400, ?, 'open', 'system', ?)`
    ).run("esc-overdue", pastDeadline, new Date(Date.now() - 7200_000).toISOString());

    // Create a non-overdue escalation
    const futureDeadline = new Date(Date.now() + 3600_000).toISOString();
    db.prepare(
      `INSERT INTO hil_escalations
        (id, tenant_id, entity_type, entity_id, escalation_type, sla_seconds, sla_deadline, status, opened_by, created_at)
       VALUES (?, 'default-tenant', 'agent', 'agent:a-002', 'agent_escalate', 14400, ?, 'open', 'system', ?)`
    ).run("esc-future", futureDeadline, new Date().toISOString());

    const count = checkSlaBreaches(db);
    expect(count).toBe(1);

    type EscRow = { status: string };
    const overdue = db.prepare("SELECT status FROM hil_escalations WHERE id = 'esc-overdue'").get() as EscRow;
    const future = db.prepare("SELECT status FROM hil_escalations WHERE id = 'esc-future'").get() as EscRow;
    expect(overdue.status).toBe("sla_breached");
    expect(future.status).toBe("open");

    type AuditRow = { event_type: string };
    const breachEntry = db
      .prepare("SELECT event_type FROM audit_entries WHERE entity_id = 'hil_escalation:esc-overdue'")
      .get() as AuditRow;
    expect(breachEntry?.event_type).toBe("hil.sla_breached");
  });

  it("does not affect non-overdue items", () => {
    const db = makeDb();
    const futureDeadline = new Date(Date.now() + 3600_000).toISOString();
    db.prepare(
      `INSERT INTO hil_escalations
        (id, tenant_id, entity_type, entity_id, escalation_type, sla_seconds, sla_deadline, status, opened_by, created_at)
       VALUES (?, 'default-tenant', 'agent', 'agent:a-001', 'agent_escalate', 14400, ?, 'open', 'system', ?)`
    ).run("esc-ok", futureDeadline, new Date().toISOString());

    const count = checkSlaBreaches(db);
    expect(count).toBe(0);
  });
});

describe("audit: queryEscalations", () => {
  it("returns overdue open escalations and filters by status/tenant", () => {
    const db = makeDb();
    const pastDeadline = new Date(Date.now() - 3600_000).toISOString();
    const futureDeadline = new Date(Date.now() + 3600_000).toISOString();

    db.prepare(
      `INSERT INTO hil_escalations
        (id, tenant_id, entity_type, entity_id, escalation_type, sla_seconds, sla_deadline, status, opened_by, created_at)
       VALUES (?, 'default-tenant', 'agent', 'agent:a-001', 'agent_escalate', 14400, ?, 'open', 'system', ?)`,
    ).run("esc-overdue", pastDeadline, new Date().toISOString());

    db.prepare(
      `INSERT INTO hil_escalations
        (id, tenant_id, entity_type, entity_id, escalation_type, sla_seconds, sla_deadline, status, opened_by, created_at)
       VALUES (?, 'default-tenant', 'agent', 'agent:a-002', 'agent_escalate', 14400, ?, 'resolved', 'system', ?)`,
    ).run("esc-resolved", futureDeadline, new Date().toISOString());

    const overdue = queryEscalations({ status: "open", tenantId: "default-tenant", limit: 10 }, db);
    expect(overdue).toHaveLength(1);
    expect(overdue[0]).toMatchObject({ id: "esc-overdue", isOverdue: true });

    const resolved = queryEscalations({ status: "resolved", limit: 10 }, db);
    expect(resolved[0]?.isOverdue).toBe(false);
  });
});
