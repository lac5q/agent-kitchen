/**
 * Audit log helper — writes a single row to the audit_log table.
 * Fire-and-forget: errors are caught and logged to console, never thrown.
 *
 * SEC-02: Every significant agent action is recorded here.
 */

import type Database from 'better-sqlite3';

export interface AuditEntry {
  actor: string;
  action: string;
  target: string;
  detail?: string | null;
  severity?: 'info' | 'medium' | 'high';
}

/**
 * Writes one row to the audit_log table.
 * Never throws — audit failures must not break the primary action.
 */
export function writeAuditLog(db: Database.Database, entry: AuditEntry): void {
  try {
    db.prepare(
      `INSERT INTO audit_log(actor, action, target, detail, severity)
       VALUES (@actor, @action, @target, @detail, @severity)`
    ).run({
      actor: entry.actor,
      action: entry.action,
      target: entry.target,
      detail: entry.detail ?? null,
      severity: entry.severity ?? 'info',
    });
  } catch {
    console.error('[audit] write failed:', entry);
  }
}
