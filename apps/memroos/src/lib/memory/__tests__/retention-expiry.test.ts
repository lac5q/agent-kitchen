// @vitest-environment node
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";

import { initSchema } from "@/lib/db-schema";
import { createRetentionPolicy, listRetentionReceipts, registerRetentionRecord } from "../retention-policy";
import { createLegalHold, releaseLegalHold, runRetentionExpiry } from "../retention-expiry";

let db: Database.Database | null = null;

function freshDb(): Database.Database {
  db = new Database(":memory:");
  initSchema(db);
  createRetentionPolicy(db, {
    id: "policy-zero-day",
    name: "zero day",
    ontologyType: "memory.note",
    securityLabel: { visibility: "internal", sensitivity: "pii" },
    purpose: "recall",
    scope: { tenantId: "default-tenant", project: "alpha" },
    priority: 5,
    durationDays: 0,
    actorId: "operator-1",
    now: new Date("2026-01-01T00:00:00.000Z"),
  });
  return db;
}

function registerRecord(database: Database.Database, recordId: string, createdAt: string, project = "alpha") {
  return registerRetentionRecord(database, {
    recordType: "message",
    recordId,
    ontologyType: "memory.note",
    securityLabel: { visibility: "internal", sensitivity: "pii" },
    purpose: "recall",
    scope: { tenantId: "default-tenant", project },
    contentHash: `hash:${recordId}`,
    actorId: "operator-1",
    createdAt,
    now: new Date(createdAt),
  });
}

afterEach(() => {
  db?.close();
  db = null;
});

describe("memory retention expiry runner and legal holds", () => {
  it("serializes by run key and replays idempotently without duplicate expiry work", () => {
    const database = freshDb();
    registerRecord(database, "due-1", "2026-01-01T00:00:00.000Z");

    const first = runRetentionExpiry(database, {
      runKey: "run-1",
      actorId: "system",
      scope: { tenantId: "default-tenant", project: "alpha" },
      now: new Date("2026-01-02T00:00:00.000Z"),
    });
    const replay = runRetentionExpiry(database, {
      runKey: "run-1",
      actorId: "system",
      scope: { tenantId: "default-tenant", project: "alpha" },
      now: new Date("2026-01-02T00:00:00.000Z"),
    });

    expect(first.status).toBe("completed");
    expect(first.expired).toBe(1);
    expect(replay.status).toBe("replayed");
    expect(replay.expired).toBe(1);
    const rows = database
      .prepare("SELECT decision, COUNT(*) AS count FROM memory_retention_receipts WHERE run_key = ? GROUP BY decision")
      .all("run-1") as Array<{ decision: string; count: number }>;
    expect(rows).toEqual(expect.arrayContaining([{ decision: "expired", count: 1 }]));
  });

  it("skips future and out-of-scope records while processing every due scoped record", () => {
    const database = freshDb();
    registerRecord(database, "due-1", "2026-01-01T00:00:00.000Z");
    registerRecord(database, "due-2", "2026-01-01T00:00:00.000Z");
    registerRecord(database, "foreign-project", "2026-01-01T00:00:00.000Z", "beta");
    const foreignBefore = database
      .prepare("SELECT status FROM memory_retention_records WHERE record_id = ?")
      .get("foreign-project") as { status: string };

    createRetentionPolicy(database, {
      id: "policy-future",
      name: "future",
      ontologyType: "memory.note",
      securityLabel: { visibility: "internal", sensitivity: "pii" },
      purpose: "recall",
      scope: { tenantId: "default-tenant", project: "alpha", spaceId: "future" },
      priority: 6,
      durationDays: 10,
      actorId: "operator-1",
    });
    registerRetentionRecord(database, {
      recordType: "message",
      recordId: "future-1",
      ontologyType: "memory.note",
      securityLabel: { visibility: "internal", sensitivity: "pii" },
      purpose: "recall",
      scope: { tenantId: "default-tenant", project: "alpha", spaceId: "future" },
      actorId: "operator-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      now: new Date("2026-01-01T00:00:00.000Z"),
    });

    const summary = runRetentionExpiry(database, {
      runKey: "run-scoped",
      actorId: "system",
      scope: { tenantId: "default-tenant", project: "alpha" },
      now: new Date("2026-01-02T00:00:00.000Z"),
    });

    expect(summary.expired).toBe(2);
    expect(summary.skippedFuture).toBe(1);
    const foreign = database
      .prepare("SELECT status FROM memory_retention_records WHERE record_id = ?")
      .get("foreign-project") as { status: string };
    expect(foreign.status).toBe(foreignBefore.status);
  });

  it("legal holds block expiry and release permits a later governed run", () => {
    const database = freshDb();
    registerRecord(database, "held-1", "2026-01-01T00:00:00.000Z");
    const hold = createLegalHold(database, {
      id: "hold-1",
      scope: { tenantId: "default-tenant", recordId: "held-1" },
      reasonCode: "litigation",
      actorId: "operator-legal",
      now: new Date("2026-01-01T12:00:00.000Z"),
    });

    const heldRun = runRetentionExpiry(database, {
      runKey: "run-held",
      actorId: "system",
      scope: { tenantId: "default-tenant", project: "alpha" },
      now: new Date("2026-01-02T00:00:00.000Z"),
    });
    expect(hold.id).toBe("hold-1");
    expect(heldRun.held).toBe(1);
    expect(database.prepare("SELECT status FROM memory_retention_records WHERE record_id = ?").get("held-1")).toMatchObject({ status: "active" });

    releaseLegalHold(database, {
      holdId: "hold-1",
      actorId: "operator-legal",
      now: new Date("2026-01-02T01:00:00.000Z"),
    });
    const resumed = runRetentionExpiry(database, {
      runKey: "run-after-release",
      actorId: "system",
      scope: { tenantId: "default-tenant", project: "alpha" },
      now: new Date("2026-01-02T02:00:00.000Z"),
    });

    expect(resumed.expired).toBe(1);
    expect(database.prepare("SELECT status FROM memory_retention_records WHERE record_id = ?").get("held-1")).toMatchObject({ status: "expired" });
  });

  it("retention receipts are complete enough for validation and exclude sensitive payloads", () => {
    const database = freshDb();
    registerRecord(database, "receipt-1", "2026-01-01T00:00:00.000Z");
    runRetentionExpiry(database, {
      runKey: "run-receipts",
      actorId: "system",
      scope: { tenantId: "default-tenant", project: "alpha" },
      now: new Date("2026-01-02T00:00:00.000Z"),
    });

    const receipts = listRetentionReceipts(database, { runKey: "run-receipts" });
    expect(receipts.length).toBeGreaterThanOrEqual(1);
    const expired = receipts.find((receipt) => receipt.decision === "expired");
    expect(expired).toMatchObject({
      tenantId: "default-tenant",
      runKey: "run-receipts",
      recordType: "message",
      recordId: "receipt-1",
      policyId: "policy-zero-day",
      policyVersion: "v1",
      actorId: "system",
      reason: "deadline_reached",
    });
    expect(expired?.scopeHash).toMatch(/^[a-f0-9]{64}$/);
    expect(expired?.derivativeOutcomes).toEqual([{ store: "message", outcome: "expired" }]);
    const serialized = JSON.stringify(receipts);
    expect(serialized).not.toContain("sentinel raw memory");
    expect(serialized).not.toMatch(/embedding|vector|graph_properties|password|token|credential/i);
  });

  it("does not replay destructive work if status is still running and lease has not expired", () => {
    const database = freshDb();
    registerRecord(database, "concurrent-1", "2026-01-01T00:00:00.000Z");

    database.prepare(`INSERT INTO memory_retention_expiry_runs (run_key, tenant_id, lease_owner, lease_expires_at, status, scope_json, started_at, summary_json) VALUES (?, ?, ?, ?, 'running', ?, ?, '{}')`).run("run-concurrent", "default-tenant", "owner-1", "2026-01-02T01:00:00.000Z", "{}", "2026-01-02T00:00:00.000Z");

    const concurrent = runRetentionExpiry(database, {
      runKey: "run-concurrent",
      actorId: "system",
      scope: { tenantId: "default-tenant", project: "alpha" },
      now: new Date("2026-01-02T00:00:00.000Z"),
    });

    expect(concurrent.status).toBe("lease_held");
    expect(concurrent.expired || 0).toBe(0);
    expect(database.prepare("SELECT status FROM memory_retention_records WHERE record_id = ?").get("concurrent-1")).toMatchObject({ status: "active" });
  });
});
