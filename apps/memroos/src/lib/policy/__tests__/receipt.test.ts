// @vitest-environment node
/**
 * Phase 128 (POLGOV-02) — Policy receipt audit-write tests.
 *
 * Verifies:
 *   - emitPolicyReceipt writes the expected audit_entries row
 *     (event_type, entity_type, actor_role, metadata_json round-trip)
 *   - emitPolicyReceipt swallows errors thrown from the underlying DB and
 *     does not propagate them
 */

import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AUDIT_EVENT_TYPES,
  ENTITY_TYPES,
  ACTOR_ROLES,
} from "@/lib/audit/event-types";
import { initSchema } from "@/lib/db-schema";

import { emitPolicyReceipt, type PolicyReceipt } from "../receipt";

let db: Database.Database;

beforeEach(() => {
  db = new Database(":memory:");
  initSchema(db);
});

afterEach(() => {
  db.close();
  vi.restoreAllMocks();
});

describe("emitPolicyReceipt — happy path", () => {
  it("writes a row with correct event_type, entity_type, actor_role, and round-tripping metadata_json", () => {
    const receipt: PolicyReceipt = {
      policyVersion: "2026.07.128",
      domain: "memory-use",
      action: "receipt.test",
      ruleMatched: "memsec.memory-use",
      outcome: "deny",
      reason: "sealed_content",
      detail: { label: { visibility: "private" }, purpose: "recall", actorRole: "agent" },
      actorId: "agent:test",
      actorRole: ACTOR_ROLES.SYSTEM,
      tenantId: "default-tenant",
      createdAt: "2026-07-08T00:00:00.000Z",
    };

    emitPolicyReceipt(db, receipt);

    const row = db
      .prepare(
        "SELECT event_type, entity_type, entity_id, actor_id, actor_role, reason, metadata_json, tenant_id FROM audit_entries ORDER BY rowid DESC LIMIT 1"
      )
      .get() as {
      event_type: string;
      entity_type: string;
      entity_id: string;
      actor_id: string;
      actor_role: string;
      reason: string;
      metadata_json: string;
      tenant_id: string;
    };

    expect(row.event_type).toBe(AUDIT_EVENT_TYPES.POLICY_DECISION);
    expect(row.entity_type).toBe(ENTITY_TYPES.POLICY_DECISION);
    expect(row.entity_id).toBe("policy_decision:memory-use:receipt.test");
    expect(row.actor_id).toBe("agent:test");
    expect(row.actor_role).toBe("system");
    expect(row.reason).toBe("sealed_content");
    expect(row.tenant_id).toBe("default-tenant");

    // metadata_json is stored as a string and must round-trip to the same shape.
    const parsed = JSON.parse(row.metadata_json) as Record<string, unknown>;
    expect(parsed.policyVersion).toBe("2026.07.128");
    expect(parsed.domain).toBe("memory-use");
    expect(parsed.action).toBe("receipt.test");
    expect(parsed.ruleMatched).toBe("memsec.memory-use");
    expect(parsed.outcome).toBe("deny");
    expect(parsed.reason).toBe("sealed_content");
    expect(parsed.detail).toEqual({
      label: { visibility: "private" },
      purpose: "recall",
      actorRole: "agent",
    });
  });

  it("accepts all valid actor_role enum values without coercion", () => {
    for (const role of [ACTOR_ROLES.ADMIN, ACTOR_ROLES.OPERATOR, ACTOR_ROLES.REVIEWER, ACTOR_ROLES.SYSTEM] as const) {
      const receipt: PolicyReceipt = {
        policyVersion: "2026.07.128",
        domain: "capability",
        action: `role.${role}`,
        ruleMatched: "capability.dispatch",
        outcome: "allow",
        reason: "capability_allowed",
        actorId: `actor:${role}`,
        actorRole: role,
        tenantId: "default-tenant",
        createdAt: new Date().toISOString(),
      };

      emitPolicyReceipt(db, receipt);

      const rows = db
        .prepare(
          "SELECT actor_role FROM audit_entries WHERE entity_id = ? ORDER BY rowid DESC LIMIT 1"
        )
        .get(`policy_decision:capability:role.${role}`) as { actor_role: string };

      expect(rows.actor_role).toBe(role);
    }
  });
});

describe("emitPolicyReceipt — error handling", () => {
  it("does not throw when the underlying writer throws (best-effort)", () => {
    // Build a "broken" db-like whose `prepare()` throws on every call.
    // This models an audit-write failure (closed handle / corrupt storage)
    // and exercises the swallow-path inside `emitPolicyReceipt`.
    const brokenDb = {
      // every method we might touch is a thrower
      prepare: () => {
        throw new Error("simulated audit write failure");
      },
      transaction: () => () => {},
      exec: () => {
        throw new Error("simulated audit write failure");
      },
    } as unknown as Database.Database;

    const receipt: PolicyReceipt = {
      policyVersion: "2026.07.128",
      domain: "memory-use",
      action: "broken.should.swallow",
      ruleMatched: "memsec.memory-use",
      outcome: "deny",
      reason: "sealed_content",
      actorId: "agent:broken",
      actorRole: "system",
      tenantId: "default-tenant",
      createdAt: "2026-07-08T00:00:00.000Z",
    };

    expect(() => emitPolicyReceipt(brokenDb, receipt)).not.toThrow();

    // After the failure, a perfectly normal write should still succeed and
    // produce exactly one row — proves the broken handle didn't poison the
    // singleton in a way that affects subsequent writes.
    emitPolicyReceipt(db, receipt);

    const count = (db
      .prepare(
        "SELECT COUNT(*) as c FROM audit_entries WHERE entity_id = ?"
      )
      .get("policy_decision:memory-use:broken.should.swallow") as { c: number }).c;

    expect(count).toBe(1);
  });
});
