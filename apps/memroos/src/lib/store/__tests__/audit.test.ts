import Database from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";

import { initSchema } from "@/lib/db-schema";
import {
  auditGovernance,
  writeAuditLog,
  type AuditEntry,
} from "@/lib/store/audit";
import type { GovernanceContext } from "@/lib/store/governance";

const ENTRY: AuditEntry = {
  actor: "agent:test",
  action: "memory_policy_decision",
  target: "memory/test",
  detail: "denied by policy",
  severity: "medium",
};

const VALID: GovernanceContext = auditGovernance(ENTRY);

// Compile-time contract: omitting GovernanceContext is intentionally invalid.
export function auditWriteRequiresGovernance(db: Database.Database, entry: AuditEntry): void {
  // @ts-expect-error STORE-04: an audit write must carry governance.
  writeAuditLog(db, entry);
}

describe("store/audit", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    initSchema(db);
  });

  it("rejects an ungoverned write at runtime", () => {
    expect(() =>
      writeAuditLog(db, ENTRY, undefined as unknown as GovernanceContext),
    ).toThrow(/ungoverned write rejected/);

    const row = db.prepare("SELECT COUNT(*) AS count FROM audit_log").get() as { count: number };
    expect(row.count).toBe(0);
  });

  it("preserves the legacy audit row shape for a governed write", () => {
    writeAuditLog(db, ENTRY, VALID);

    const row = db
      .prepare("SELECT actor, action, target, detail, severity FROM audit_log ORDER BY id DESC LIMIT 1")
      .get() as Record<string, string | null>;

    expect(row).toEqual({
      actor: ENTRY.actor,
      action: ENTRY.action,
      target: ENTRY.target,
      detail: ENTRY.detail,
      severity: ENTRY.severity,
    });
  });
});
