/**
 * Phase 64: Unified audit write service.
 *
 * INVARIANT: This module only exports INSERT operations for audit_entries.
 * No UPDATE or DELETE statements exist here. The SQLite triggers enforce
 * this at the database layer; this module enforces it at the code layer.
 */

import crypto from "crypto";
import type Database from "better-sqlite3";
import { getDb } from "@/lib/db";
import { getSlaSeconds } from "@/lib/evals/sla-config";
import type { NewAuditEntry, NewHilEscalation } from "./schema";

/**
 * Inserts a single audit entry. Append-only — never calls UPDATE or DELETE.
 *
 * @param entry - Audit entry data; id and created_at are auto-generated if omitted.
 * @param db - Optional DB instance; uses singleton if not provided.
 */
export function writeAuditEntry(entry: NewAuditEntry, db: Database.Database = getDb()): void {
  const id = entry.id ?? crypto.randomUUID();
  const createdAt = entry.created_at ?? new Date().toISOString();
  const tenantId = entry.tenant_id ?? "default-tenant";
  const metadataJson =
    typeof entry.metadata_json === "string"
      ? entry.metadata_json
      : JSON.stringify(entry.metadata_json ?? {});

  db.prepare(
    `INSERT INTO audit_entries
      (id, tenant_id, actor_id, actor_role, event_type, entity_type, entity_id, reason, metadata_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    tenantId,
    entry.actor_id,
    entry.actor_role,
    entry.event_type,
    entry.entity_type,
    entry.entity_id,
    entry.reason ?? null,
    metadataJson,
    createdAt
  );
}

/**
 * Opens a new HIL escalation.
 *
 * Atomically:
 * 1. Resolves SLA seconds from config by escalation_type
 * 2. Inserts into hil_escalations
 * 3. Writes a hil.created audit entry
 *
 * @returns The new escalation ID.
 */
export function openEscalation(
  params: NewHilEscalation,
  db: Database.Database = getDb()
): string {
  const id = params.id ?? crypto.randomUUID();
  const tenantId = params.tenant_id ?? "default-tenant";
  const slaSeconds = getSlaSeconds(params.escalation_type);
  const slaDeadline = new Date(Date.now() + slaSeconds * 1000).toISOString();
  const now = new Date().toISOString();

  db.transaction(() => {
    db.prepare(
      `INSERT INTO hil_escalations
        (id, tenant_id, entity_type, entity_id, escalation_type, sla_seconds, sla_deadline,
         status, assigned_to, opened_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)`
    ).run(
      id,
      tenantId,
      params.entity_type,
      params.entity_id,
      params.escalation_type,
      slaSeconds,
      slaDeadline,
      params.assigned_to ?? null,
      params.opened_by,
      now
    );

    writeAuditEntry(
      {
        tenant_id: tenantId,
        actor_id: params.opened_by,
        actor_role: "system",
        event_type: "hil.created",
        entity_type: "hil_escalation",
        entity_id: `hil_escalation:${id}`,
        reason: `HIL escalation opened: ${params.escalation_type}`,
        metadata_json: {
          escalation_id: id,
          escalation_type: params.escalation_type,
          entity_type: params.entity_type,
          entity_id: params.entity_id,
          sla_seconds: slaSeconds,
          sla_deadline: slaDeadline,
        },
        created_at: now,
      },
      db
    );
  })();

  return id;
}

/**
 * Resolves an open HIL escalation.
 *
 * Atomically:
 * 1. Validates the escalation is in open or sla_breached status
 * 2. Updates hil_escalations with resolution info
 * 3. Writes a hil.resolved audit entry
 *
 * @throws If the escalation does not exist or is already resolved.
 */
export function resolveEscalation(
  id: string,
  resolution: { actorId: string; actorRole: "admin" | "operator"; note?: string },
  db: Database.Database = getDb()
): void {
  const now = new Date().toISOString();

  type EscalationRow = { id: string; status: string; tenant_id: string };
  const escalation = db
    .prepare("SELECT id, status, tenant_id FROM hil_escalations WHERE id = ?")
    .get(id) as EscalationRow | undefined;

  if (!escalation) {
    throw new Error(`HIL escalation not found: ${id}`);
  }
  if (escalation.status === "resolved") {
    throw new Error(`HIL escalation ${id} is already resolved`);
  }
  if (escalation.status !== "open" && escalation.status !== "sla_breached") {
    throw new Error(`HIL escalation ${id} cannot be resolved from status: ${escalation.status}`);
  }

  db.transaction(() => {
    db.prepare(
      `UPDATE hil_escalations
       SET status = 'resolved', resolved_by = ?, resolution_note = ?, resolved_at = ?
       WHERE id = ?`
    ).run(resolution.actorId, resolution.note ?? null, now, id);

    writeAuditEntry(
      {
        tenant_id: escalation.tenant_id,
        actor_id: resolution.actorId,
        actor_role: resolution.actorRole,
        event_type: "hil.resolved",
        entity_type: "hil_escalation",
        entity_id: `hil_escalation:${id}`,
        reason: resolution.note,
        metadata_json: {
          escalation_id: id,
          resolution_note: resolution.note,
        },
        created_at: now,
      },
      db
    );
  })();
}
