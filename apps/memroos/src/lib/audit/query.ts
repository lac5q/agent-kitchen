/**
 * Phase 64: Audit query service (AUDIT-02).
 *
 * All queries are read-only SELECT operations.
 * Cursor-based pagination uses created_at as the cursor value.
 */

import type Database from "better-sqlite3";
import { getDb } from "@/lib/db";
import type { AuditEntry, AuditQueryFilter, HilEscalation } from "./schema";

const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;

/**
 * Escape LIKE wildcards in user-controlled filter values. The queries
 * below use `LIKE` (not json_extract) so user-provided `userId` strings
 * need to escape `%` and `_` to avoid wildcard expansion.
 */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/**
 * Queries audit entries with optional filters. Returns paginated results.
 *
 * @param filter - Filter parameters including agentId, eventType, actorId, etc.
 * @param db - Optional DB instance; uses singleton if not provided.
 * @returns Object with `entries` array and optional `nextCursor` for pagination.
 */
export function queryAuditEntries(
  filter: AuditQueryFilter,
  db: Database.Database = getDb()
): { entries: AuditEntry[]; nextCursor?: string } {
  const limit = Math.min(MAX_LIMIT, Math.max(1, filter.limit ?? DEFAULT_LIMIT));
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filter.tenantId) {
    conditions.push("tenant_id = ?");
    params.push(filter.tenantId);
  }
  if (filter.agentId) {
    conditions.push("entity_type = 'agent' AND entity_id = ?");
    params.push(`agent:${filter.agentId}`);
  }
  if (filter.entityType) {
    conditions.push("entity_type = ?");
    params.push(filter.entityType);
  }
  if (filter.entityId) {
    conditions.push("entity_id = ?");
    params.push(filter.entityId);
  }
  if (filter.eventType) {
    if (Array.isArray(filter.eventType)) {
      if (filter.eventType.length > 0) {
        conditions.push(`event_type IN (${filter.eventType.map(() => "?").join(",")})`);
        params.push(...filter.eventType);
      }
    } else {
      conditions.push("event_type = ?");
      params.push(filter.eventType);
    }
  }
  if (filter.actorId) {
    conditions.push("actor_id = ?");
    params.push(filter.actorId);
  }
  if (filter.userId) {
    // Phase 125: DSAR / SIEM — match either `userId` or `user_id` in metadata_json.
    // LIKE is portable and JSON1 too; pick LIKE because the existing
    // hil tests already rely on it for the same column.
    conditions.push(
      "(metadata_json LIKE ? OR metadata_json LIKE ?)"
    );
    const escaped = escapeLike(filter.userId);
    params.push(`%"userId":%"${escaped}"%`);
    params.push(`%"user_id":"${escaped}"%`);
  }
  if (filter.from) {
    conditions.push("created_at >= ?");
    params.push(filter.from);
  }
  if (filter.to) {
    conditions.push("created_at <= ?");
    params.push(filter.to);
  }
  if (filter.cursor) {
    conditions.push("created_at < ?");
    params.push(filter.cursor);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const sql = `SELECT * FROM audit_entries ${whereClause} ORDER BY created_at DESC LIMIT ?`;
  params.push(limit + 1);

  const rows = db.prepare(sql).all(...params) as AuditEntry[];
  const hasMore = rows.length > limit;
  const entries = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? entries[entries.length - 1]?.created_at : undefined;

  return { entries, nextCursor };
}

/**
 * Streams audit entries using SQLite's iterator — zero in-memory buffering.
 * Suitable for large export operations.
 *
 * @param filter - Filter parameters (same as queryAuditEntries, no cursor limit).
 * @param db - Optional DB instance; uses singleton if not provided.
 * @returns An IterableIterator of AuditEntry rows.
 */
export function streamAuditEntries(
  filter: AuditQueryFilter,
  db: Database.Database = getDb()
): IterableIterator<AuditEntry> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filter.tenantId) {
    conditions.push("tenant_id = ?");
    params.push(filter.tenantId);
  }
  if (filter.agentId) {
    conditions.push("entity_type = 'agent' AND entity_id = ?");
    params.push(`agent:${filter.agentId}`);
  }
  if (filter.entityType) {
    conditions.push("entity_type = ?");
    params.push(filter.entityType);
  }
  if (filter.entityId) {
    conditions.push("entity_id = ?");
    params.push(filter.entityId);
  }
  if (filter.eventType) {
    if (Array.isArray(filter.eventType)) {
      if (filter.eventType.length > 0) {
        conditions.push(`event_type IN (${filter.eventType.map(() => "?").join(",")})`);
        params.push(...filter.eventType);
      }
    } else {
      conditions.push("event_type = ?");
      params.push(filter.eventType);
    }
  }
  if (filter.actorId) {
    conditions.push("actor_id = ?");
    params.push(filter.actorId);
  }
  if (filter.userId) {
    // Phase 125: DSAR / SIEM. See note in queryAuditEntries.
    conditions.push("(metadata_json LIKE ? OR metadata_json LIKE ?)");
    const escaped = escapeLike(filter.userId);
    params.push(`%"userId":%"${escaped}"%`);
    params.push(`%"user_id":"${escaped}"%`);
  }
  if (filter.from) {
    conditions.push("created_at >= ?");
    params.push(filter.from);
  }
  if (filter.to) {
    conditions.push("created_at <= ?");
    params.push(filter.to);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const sql = `SELECT * FROM audit_entries ${whereClause} ORDER BY created_at DESC`;

  return db.prepare(sql).iterate(...params) as IterableIterator<AuditEntry>;
}

/**
 * Queries HIL escalations with optional status and tenant filters.
 * Adds a computed `isOverdue` property based on sla_deadline vs now.
 *
 * @param filter - Optional status ('open'|'resolved'|'sla_breached'|'all') and tenantId.
 * @param db - Optional DB instance; uses singleton if not provided.
 */
export function queryEscalations(
  filter: {
    status?: "open" | "resolved" | "sla_breached" | "all";
    tenantId?: string;
    limit?: number;
  } = {},
  db: Database.Database = getDb()
): (HilEscalation & { isOverdue: boolean })[] {
  const conditions: string[] = [];
  const params: unknown[] = [];
  const limit = Math.min(MAX_LIMIT, Math.max(1, filter.limit ?? DEFAULT_LIMIT));

  if (filter.tenantId) {
    conditions.push("tenant_id = ?");
    params.push(filter.tenantId);
  }
  if (filter.status && filter.status !== "all") {
    conditions.push("status = ?");
    params.push(filter.status);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const sql = `SELECT * FROM hil_escalations ${whereClause} ORDER BY sla_deadline ASC, created_at ASC LIMIT ?`;
  params.push(limit);

  const rows = db.prepare(sql).all(...params) as HilEscalation[];
  const now = new Date().toISOString();

  return rows.map((row) => ({
    ...row,
    isOverdue: row.status !== "resolved" && row.sla_deadline < now,
  }));
}

/** Returns the truthful row count for the same escalation filters. */
export function countEscalations(
  filter: {
    status?: "open" | "resolved" | "sla_breached" | "all";
    tenantId?: string;
  } = {},
  db: Database.Database = getDb()
): number {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filter.tenantId) {
    conditions.push("tenant_id = ?");
    params.push(filter.tenantId);
  }
  if (filter.status && filter.status !== "all") {
    conditions.push("status = ?");
    params.push(filter.status);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const row = db
    .prepare(`SELECT COUNT(*) AS total FROM hil_escalations ${whereClause}`)
    .get(...params) as { total: number };
  return Number(row.total);
}
