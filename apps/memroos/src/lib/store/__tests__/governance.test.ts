/**
 * STORE-01 — the governance contract itself.
 *
 * The compile-time requirement is the real control: a write helper that is
 * called without a `GovernanceContext` does not typecheck. That property
 * cannot be asserted from inside a passing test suite, so these tests cover
 * the runtime half — the guard that catches a JavaScript caller or an `as any`
 * cast slipping past the type system.
 *
 * Following AUTHGATE-03's principle from the same architecture review: a gate
 * that has never been seen to fail is not known to work, so most of this file
 * is deliberately about making it fail.
 */

import Database from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";

import { initSchema } from "@/lib/db-schema";
import {
  assertGovernance,
  recordGovernedWrite,
  systemGovernance,
  type GovernanceContext,
} from "@/lib/store/governance";
import { ensureConnectorSpace, writeSyncState } from "@/lib/store/connectors";

const VALID: GovernanceContext = {
  actor: "user:abc",
  action: "test.write",
  asset: "table/row",
  purpose: "unit test",
  label: { visibility: "private", policy: "sealed" },
  decision: "allow",
};

function makeDb() {
  const db = new Database(":memory:");
  initSchema(db);
  return db;
}

describe("assertGovernance", () => {
  it("accepts a complete context", () => {
    expect(() => assertGovernance(VALID)).not.toThrow();
  });

  for (const field of ["actor", "action", "asset", "purpose", "decision"] as const) {
    it(`rejects a context missing ${field}`, () => {
      const ctx = { ...VALID, [field]: "" } as GovernanceContext;
      expect(() => assertGovernance(ctx)).toThrow(/ungoverned write rejected/);
      expect(() => assertGovernance(ctx)).toThrow(new RegExp(field));
    });
  }

  it("rejects a whitespace-only field rather than treating it as present", () => {
    expect(() => assertGovernance({ ...VALID, actor: "   " })).toThrow(/actor/);
  });

  it("rejects a missing label", () => {
    const ctx = { ...VALID, label: undefined } as unknown as GovernanceContext;
    expect(() => assertGovernance(ctx)).toThrow(/label/);
  });

  it("rejects a context that is absent entirely", () => {
    expect(() => assertGovernance(undefined as unknown as GovernanceContext)).toThrow(
      /ungoverned write rejected/,
    );
  });
});

describe("the gate fires on real write helpers", () => {
  let db: Database.Database;
  beforeEach(() => {
    db = makeDb();
  });

  // The point of these: the guard is wired into the helpers, not merely
  // exported and forgotten.
  it("ensureConnectorSpace refuses an ungoverned call", () => {
    expect(() =>
      ensureConnectorSpace(
        db,
        { tenantId: "default-tenant", providerKey: "linear" },
        undefined as unknown as GovernanceContext,
      ),
    ).toThrow(/ungoverned write rejected/);
  });

  it("writeSyncState refuses an ungoverned call", () => {
    expect(() =>
      writeSyncState(
        db,
        {
          connectionId: "c",
          providerKey: "linear",
          tool: "issues",
          cursorValue: null,
          pageCursor: null,
          status: "ok",
          rowsWritten: 0,
        },
        {} as GovernanceContext,
      ),
    ).toThrow(/ungoverned write rejected/);
  });

  it("does not write the space when the governance check rejects", () => {
    try {
      ensureConnectorSpace(
        db,
        { tenantId: "default-tenant", providerKey: "linear" },
        {} as GovernanceContext,
      );
    } catch {
      // expected
    }
    const spaces = db
      .prepare(`SELECT COUNT(*) AS n FROM spaces WHERE name LIKE 'connector/%'`)
      .get() as { n: number };
    expect(spaces.n).toBe(0);
  });
});

describe("recordGovernedWrite", () => {
  let db: Database.Database;
  beforeEach(() => {
    db = makeDb();
  });

  it("maps the governance fields onto audit_log", () => {
    recordGovernedWrite(db, {
      actor: "user:abc",
      action: "connector.record.write",
      asset: "messages/linear/issues",
      purpose: "scheduled sync",
      label: { visibility: "team", domain: "connectors", sensitivity: "low", policy: "indexable" },
      decision: "allow",
    });

    const row = db
      .prepare(`SELECT actor, action, target, detail, severity, visibility, domain, sensitivity, policy
                FROM audit_log ORDER BY id DESC LIMIT 1`)
      .get() as Record<string, string>;

    expect(row.actor).toBe("user:abc");
    expect(row.action).toBe("connector.record.write");
    expect(row.target).toBe("messages/linear/issues");
    expect(row.visibility).toBe("team");
    expect(row.domain).toBe("connectors");
    expect(row.sensitivity).toBe("low");
    expect(row.policy).toBe("indexable");
    // purpose and decision have no columns of their own until STORE-02.
    expect(JSON.parse(row.detail)).toEqual({ purpose: "scheduled sync", decision: "allow" });
  });

  it("records a denial, and marks it above routine severity", () => {
    recordGovernedWrite(db, { ...VALID, decision: "deny" });
    const row = db
      .prepare(`SELECT severity, detail FROM audit_log ORDER BY id DESC LIMIT 1`)
      .get() as { severity: string; detail: string };
    expect(row.severity).toBe("medium");
    expect(JSON.parse(row.detail).decision).toBe("deny");
  });

  it("never throws when the audit write fails, so the primary write survives", () => {
    const broken = new Database(":memory:"); // no schema — audit_log absent
    expect(() => recordGovernedWrite(broken, VALID)).not.toThrow();
  });
});

describe("systemGovernance", () => {
  it("produces a context that passes the guard", () => {
    const ctx = systemGovernance("startup.backfill", "spaces/*", "startup re-enrolment");
    expect(() => assertGovernance(ctx)).not.toThrow();
    expect(ctx.actor).toBe("system");
    expect(ctx.decision).toBe("allow");
  });
});
