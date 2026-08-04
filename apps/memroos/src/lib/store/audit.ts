/**
 * Persistence for the legacy `audit_log` table.
 *
 * STORE-04: this is the only production module that writes or reads the
 * legacy audit-log table. The low-level write requires GovernanceContext;
 * the entry-derived adapter exists only while older callers are migrated and
 * preserves the historical fire-and-forget API.
 */

import type Database from "better-sqlite3";

import {
  assertGovernance,
  type GovernanceContext,
} from "@/lib/store/governance";

export interface AuditEntry {
  actor: string;
  action: string;
  target: string;
  detail?: string | null;
  severity?: "info" | "medium" | "high";
}

export interface AuditLogRow extends AuditEntry {
  id: number;
  detail: string | null;
  severity: "info" | "medium" | "high";
  timestamp: string;
}

export interface AuditLogVersion {
  count: number;
  maxId: number | null;
  lastTimestamp: string | null;
  fingerprint: string | null;
}

/**
 * Governance for the audit row itself. The decision describes permission to
 * record the audit event, not the action being recorded; the latter remains
 * in `AuditEntry.severity` and the legacy table columns.
 */
export function auditGovernance(entry: AuditEntry): GovernanceContext {
  return {
    actor: entry.actor,
    action: "audit_log.write",
    asset: `audit_log/${entry.target}`,
    purpose: "record the audit trail event",
    label: {
      visibility: "private",
      domain: "audit",
      sensitivity: "high",
      policy: "sealed",
    },
    decision: "allow",
  };
}

/**
 * Write one row to `audit_log`.
 *
 * The insert intentionally keeps the historical five-column shape. The
 * governance context is the required authorization contract; its label and
 * decision are persisted by the existing governance recorder for governed
 * domain writes, while this legacy event preserves its established payload.
 */
export function writeAuditLog(
  db: Database.Database,
  entry: AuditEntry,
  governance: GovernanceContext,
): void {
  assertGovernance(governance);
  try {
    db.prepare(
      `INSERT INTO audit_log(actor, action, target, detail, severity)
       VALUES (@actor, @action, @target, @detail, @severity)`,
    ).run({
      actor: entry.actor,
      action: entry.action,
      target: entry.target,
      detail: entry.detail ?? null,
      severity: entry.severity ?? "info",
    });
  } catch {
    // Audit failures must never break the primary action.
    console.error("[audit] write failed:", entry);
  }
}

/**
 * Compatibility adapter for callers that still have only the historical
 * AuditEntry. New store write code must call writeAuditLog with an explicit
 * GovernanceContext.
 */
export function writeAuditLogFromEntry(db: Database.Database, entry: AuditEntry): void {
  writeAuditLog(db, entry, auditGovernance(entry));
}

/** Read the latest audit rows. Reads do not require governance. */
export function listAuditLog(db: Database.Database, limit: number): AuditLogRow[] {
  return db
    .prepare(
      `SELECT id, actor, action, target, detail, severity, timestamp
       FROM audit_log
       ORDER BY timestamp DESC
       LIMIT ?`,
    )
    .all(limit) as AuditLogRow[];
}

/** Read security/policy attention rows. Reads do not require governance. */
export function listSecurityAttentionAuditLog(db: Database.Database): Array<{
  id: number;
  action: string;
  target: string;
  severity: "high" | "medium";
  timestamp: string;
}> {
  return db
    .prepare(
      `SELECT id, action, target, severity, timestamp
       FROM audit_log
       WHERE severity IN ('high', 'medium')
         AND (lower(action || ' ' || target) LIKE '%security%'
              OR lower(action || ' ' || target) LIKE '%policy%'
              OR lower(action || ' ' || target) LIKE '%blocked%'
              OR lower(action || ' ' || target) LIKE '%denied%')
       ORDER BY timestamp DESC
       LIMIT 25`,
    )
    .all() as Array<{
    id: number;
    action: string;
    target: string;
    severity: "high" | "medium";
    timestamp: string;
  }>;
}

/** Return the cache version used by the security report route. */
export function getAuditLogVersion(db: Database.Database): AuditLogVersion {
  return db
    .prepare(
      `SELECT
         COUNT(*) as count,
         MAX(id) as maxId,
         MAX(timestamp) as lastTimestamp,
         (
           SELECT group_concat(id || ':' || timestamp || ':' || action || ':' || target || ':' || severity, '|')
           FROM (
             SELECT id, timestamp, action, target, severity
             FROM audit_log
             ORDER BY id DESC
             LIMIT 20
           )
         ) as fingerprint
       FROM audit_log`,
    )
    .get() as AuditLogVersion;
}
