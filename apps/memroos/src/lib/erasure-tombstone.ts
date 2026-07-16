/**
 * Phase 127 / ENTOPS-08: DSAR right-to-delete tombstones.
 *
 * Inserts compliance-window markers into `erasure_tombstones`. NEVER deletes
 * audit_entries rows. Full MEMLIFE derivative purge is a later milestone —
 * `purged_at` remains null until that pipeline runs.
 */

import crypto from "crypto";
import type Database from "better-sqlite3";

/** Default compliance window before scheduled_purge_at (days). */
export const DSAR_COMPLIANCE_WINDOW_DAYS = 30;

export type ErasureTombstoneReason = "dsar" | "operator" | "legal_hold_release";

export interface ErasureTombstone {
  id: string;
  tenantId: string;
  entityType: string;
  entityId: string;
  reason: string;
  tombstonedBy: string;
  tombstonedAt: string;
  scheduledPurgeAt: string;
  purgedAt: string | null;
}

export interface InsertErasureTombstoneInput {
  tenantId: string;
  entityType: string;
  entityId: string;
  reason?: ErasureTombstoneReason | string;
  tombstonedBy: string;
  /** Override compliance window (ms). Default: DSAR_COMPLIANCE_WINDOW_DAYS. */
  complianceWindowMs?: number;
  now?: Date;
}

export interface TombstoneUserInput {
  tenantId: string;
  userId: string;
  tombstonedBy: string;
  now?: Date;
}

function isoPlusDays(from: Date, days: number): string {
  const d = new Date(from.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

function mapRow(row: {
  id: string;
  tenant_id: string;
  entity_type: string;
  entity_id: string;
  reason: string;
  tombstoned_by: string;
  tombstoned_at: string;
  scheduled_purge_at: string;
  purged_at: string | null;
}): ErasureTombstone {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    reason: row.reason,
    tombstonedBy: row.tombstoned_by,
    tombstonedAt: row.tombstoned_at,
    scheduledPurgeAt: row.scheduled_purge_at,
    purgedAt: row.purged_at,
  };
}

/**
 * Insert a single tombstone. Idempotent on (tenant, entity_type, entity_id, reason)
 * via INSERT OR IGNORE — returns the existing row when already present.
 */
export function insertErasureTombstone(
  db: Database.Database,
  input: InsertErasureTombstoneInput
): ErasureTombstone {
  const now = input.now ?? new Date();
  const tombstonedAt = now.toISOString();
  const windowMs =
    typeof input.complianceWindowMs === "number" && input.complianceWindowMs > 0
      ? input.complianceWindowMs
      : DSAR_COMPLIANCE_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const scheduledPurgeAt = new Date(now.getTime() + windowMs).toISOString();
  const reason = (input.reason ?? "dsar").trim() || "dsar";
  const id = crypto.randomUUID();

  db.prepare(
    `INSERT OR IGNORE INTO erasure_tombstones
       (id, tenant_id, entity_type, entity_id, reason, tombstoned_by,
        tombstoned_at, scheduled_purge_at, purged_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`
  ).run(
    id,
    input.tenantId,
    input.entityType,
    input.entityId,
    reason,
    input.tombstonedBy,
    tombstonedAt,
    scheduledPurgeAt
  );

  const row = db
    .prepare(
      `SELECT id, tenant_id, entity_type, entity_id, reason, tombstoned_by,
              tombstoned_at, scheduled_purge_at, purged_at
       FROM erasure_tombstones
       WHERE tenant_id = ? AND entity_type = ? AND entity_id = ? AND reason = ?`
    )
    .get(input.tenantId, input.entityType, input.entityId, reason) as {
    id: string;
    tenant_id: string;
    entity_type: string;
    entity_id: string;
    reason: string;
    tombstoned_by: string;
    tombstoned_at: string;
    scheduled_purge_at: string;
    purged_at: string | null;
  };

  return mapRow(row);
}

/**
 * Tombstone a user for DSAR delete. Marks the user entity and a vault subject
 * marker. Does NOT delete audit rows or vault files.
 */
export function tombstoneUserForDsar(
  db: Database.Database,
  input: TombstoneUserInput
): ErasureTombstone[] {
  const now = input.now ?? new Date();
  const userTombstone = insertErasureTombstone(db, {
    tenantId: input.tenantId,
    entityType: "user",
    entityId: input.userId,
    reason: "dsar",
    tombstonedBy: input.tombstonedBy,
    now,
  });
  const vaultTombstone = insertErasureTombstone(db, {
    tenantId: input.tenantId,
    entityType: "knowledge_vault_user",
    entityId: input.userId,
    reason: "dsar",
    tombstonedBy: input.tombstonedBy,
    now,
  });
  return [userTombstone, vaultTombstone];
}

export function listErasureTombstones(
  db: Database.Database,
  opts: { tenantId: string; entityId?: string; reason?: string } 
): ErasureTombstone[] {
  const conditions = ["tenant_id = ?"];
  const params: unknown[] = [opts.tenantId];
  if (opts.entityId) {
    conditions.push("entity_id = ?");
    params.push(opts.entityId);
  }
  if (opts.reason) {
    conditions.push("reason = ?");
    params.push(opts.reason);
  }
  const rows = db
    .prepare(
      `SELECT id, tenant_id, entity_type, entity_id, reason, tombstoned_by,
              tombstoned_at, scheduled_purge_at, purged_at
       FROM erasure_tombstones
       WHERE ${conditions.join(" AND ")}
       ORDER BY tombstoned_at DESC`
    )
    .all(...params) as Array<{
    id: string;
    tenant_id: string;
    entity_type: string;
    entity_id: string;
    reason: string;
    tombstoned_by: string;
    tombstoned_at: string;
    scheduled_purge_at: string;
    purged_at: string | null;
  }>;
  return rows.map(mapRow);
}

/** Structural marker: this module never DELETEs from audit_entries. */
export const ERASURE_TOMBSTONE_AUDIT_POLICY = "never_delete_audit_rows" as const;

/** Exported for tests — compliance window helper. */
export function scheduledPurgeAtFrom(now: Date, days = DSAR_COMPLIANCE_WINDOW_DAYS): string {
  return isoPlusDays(now, days);
}
