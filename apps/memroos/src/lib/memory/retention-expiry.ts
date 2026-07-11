import crypto from "crypto";
import type Database from "better-sqlite3";

import { AUDIT_EVENT_TYPES, ENTITY_TYPES } from "@/lib/audit/event-types";
import { writeAuditEntry } from "@/lib/audit/write";
import {
  emitRetentionReceipt,
  parseJsonObject,
  scopeHash,
  stableJson,
  type RetentionRecordRow,
  type RetentionReceipt,
  type RetentionScope,
} from "./retention-policy";

export interface LegalHoldInput {
  id?: string;
  tenantId?: string;
  scope: RetentionScope;
  reasonCode: string;
  actorId: string;
  expiresAt?: string | null;
  now?: Date;
}

export interface LegalHoldRow {
  id: string;
  tenant_id: string;
  scope_json: string;
  reason_code: string;
  created_by: string;
  created_at: string;
  updated_by: string | null;
  updated_at: string | null;
  released_by: string | null;
  released_at: string | null;
  expires_at: string | null;
  status: "active" | "released" | "expired";
}

export interface RetentionExpiryRunSummary {
  runKey: string;
  tenantId: string;
  status: "completed" | "lease_held" | "replayed" | "failed";
  considered: number;
  expired: number;
  held: number;
  skippedFuture: number;
  skippedAlreadyExpired: number;
  policyUnavailable: number;
  failed: number;
  receipts: RetentionReceipt[];
}

function toIso(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid UTC timestamp: ${String(value)}`);
  return date.toISOString();
}

function addSeconds(date: Date, seconds: number): string {
  return new Date(date.getTime() + seconds * 1000).toISOString();
}

function ensureNonEmpty(value: string, field: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${field} is required`);
  return trimmed;
}

function matchesScope(holdScope: Record<string, unknown>, recordScope: Record<string, unknown>, record: RetentionRecordRow): boolean {
  for (const [key, expected] of Object.entries(holdScope)) {
    if (expected === undefined || expected === null || expected === "" || expected === "*") continue;
    const actual =
      key === "recordId"
        ? record.record_id
        : key === "recordType"
          ? record.record_type
          : key === "tenantId"
            ? record.tenant_id
            : recordScope[key];
    if (Array.isArray(expected)) {
      if (!expected.includes(actual)) return false;
      continue;
    }
    if (expected !== actual) return false;
  }
  return true;
}

function auditHold(
  db: Database.Database,
  input: { tenantId: string; actorId: string; holdId: string; reason: string; scope: RetentionScope; at: string }
): void {
  writeAuditEntry(
    {
      tenant_id: input.tenantId,
      actor_id: input.actorId,
      actor_role: input.actorId === "system" ? "system" : "operator",
      event_type: AUDIT_EVENT_TYPES.MEMORY_LEGAL_HOLD,
      entity_type: ENTITY_TYPES.MEMORY_LEGAL_HOLD,
      entity_id: `legal_hold:${input.holdId}`,
      reason: input.reason,
      metadata_json: {
        hold_id: input.holdId,
        scope_hash: scopeHash(input.scope),
        reason: input.reason,
      },
      created_at: input.at,
    },
    db
  );
}

export function createLegalHold(db: Database.Database, input: LegalHoldInput): LegalHoldRow {
  const tenantId = input.tenantId ?? "default-tenant";
  const now = toIso(input.now ?? new Date());
  const id = input.id ?? `hold_${crypto.randomUUID()}`;
  const row = {
    id,
    tenant_id: tenantId,
    scope_json: stableJson(input.scope),
    reason_code: ensureNonEmpty(input.reasonCode, "reasonCode"),
    created_by: ensureNonEmpty(input.actorId, "actorId"),
    created_at: now,
    updated_by: null,
    updated_at: null,
    released_by: null,
    released_at: null,
    expires_at: input.expiresAt ? toIso(input.expiresAt) : null,
    status: "active",
  } satisfies LegalHoldRow;

  db.prepare(
    `INSERT INTO memory_legal_holds
      (id, tenant_id, scope_json, reason_code, created_by, created_at, expires_at, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'active')`
  ).run(row.id, row.tenant_id, row.scope_json, row.reason_code, row.created_by, row.created_at, row.expires_at);

  auditHold(db, { tenantId, actorId: row.created_by, holdId: row.id, reason: "legal_hold_created", scope: input.scope, at: now });
  return row;
}

export function updateLegalHoldScope(
  db: Database.Database,
  input: { tenantId?: string; holdId: string; scope: RetentionScope; actorId: string; reason?: string; now?: Date }
): LegalHoldRow {
  const tenantId = input.tenantId ?? "default-tenant";
  const now = toIso(input.now ?? new Date());
  const existing = db
    .prepare("SELECT * FROM memory_legal_holds WHERE tenant_id = ? AND id = ?")
    .get(tenantId, input.holdId) as LegalHoldRow | undefined;
  if (!existing || existing.status !== "active") throw new Error("active legal hold not found");

  db.prepare(
    `UPDATE memory_legal_holds
     SET scope_json = ?, updated_by = ?, updated_at = ?
     WHERE tenant_id = ? AND id = ? AND status = 'active'`
  ).run(stableJson(input.scope), input.actorId, now, tenantId, input.holdId);

  auditHold(db, {
    tenantId,
    actorId: input.actorId,
    holdId: input.holdId,
    reason: input.reason ?? "legal_hold_scope_updated",
    scope: input.scope,
    at: now,
  });

  return db
    .prepare("SELECT * FROM memory_legal_holds WHERE tenant_id = ? AND id = ?")
    .get(tenantId, input.holdId) as LegalHoldRow;
}

export function releaseLegalHold(
  db: Database.Database,
  input: { tenantId?: string; holdId: string; actorId: string; reason?: string; now?: Date }
): LegalHoldRow {
  const tenantId = input.tenantId ?? "default-tenant";
  const now = toIso(input.now ?? new Date());
  const existing = db
    .prepare("SELECT * FROM memory_legal_holds WHERE tenant_id = ? AND id = ?")
    .get(tenantId, input.holdId) as LegalHoldRow | undefined;
  if (!existing || existing.status !== "active") throw new Error("active legal hold not found");

  db.prepare(
    `UPDATE memory_legal_holds
     SET status = 'released', released_by = ?, released_at = ?
     WHERE tenant_id = ? AND id = ? AND status = 'active'`
  ).run(input.actorId, now, tenantId, input.holdId);

  auditHold(db, {
    tenantId,
    actorId: input.actorId,
    holdId: input.holdId,
    reason: input.reason ?? "legal_hold_released",
    scope: parseJsonObject(existing.scope_json),
    at: now,
  });

  return db
    .prepare("SELECT * FROM memory_legal_holds WHERE tenant_id = ? AND id = ?")
    .get(tenantId, input.holdId) as LegalHoldRow;
}

export function activeLegalHoldsForRecord(
  db: Database.Database,
  record: RetentionRecordRow,
  now: Date
): LegalHoldRow[] {
  const nowIso = now.toISOString();
  const rows = db
    .prepare(
      `SELECT * FROM memory_legal_holds
       WHERE tenant_id = ? AND status = 'active'
         AND (expires_at IS NULL OR expires_at > ?)
       ORDER BY created_at ASC, id ASC`
    )
    .all(record.tenant_id, nowIso) as LegalHoldRow[];
  const recordScope = parseJsonObject(record.scope_json);
  return rows.filter((hold) => matchesScope(parseJsonObject(hold.scope_json), recordScope, record));
}

function scopedRecords(
  db: Database.Database,
  input: { tenantId: string; scope?: RetentionScope; includeExpired?: boolean }
): RetentionRecordRow[] {
  const rows = db
    .prepare(
      `SELECT * FROM memory_retention_records
       WHERE tenant_id = ?
         AND status IN (${input.includeExpired ? "'active','expired','policy_unavailable','failed'" : "'active','policy_unavailable'"})
       ORDER BY retention_deadline ASC NULLS LAST, created_at ASC, id ASC`
    )
    .all(input.tenantId) as RetentionRecordRow[];
  if (!input.scope || Object.keys(input.scope).length === 0) return rows;
  return rows.filter((record) => matchesScope(input.scope as Record<string, unknown>, parseJsonObject(record.scope_json), record));
}

function previousRunSummary(row: { summary_json: string; tenant_id: string; status: string; run_key: string }): RetentionExpiryRunSummary {
  const summary = JSON.parse(row.summary_json || "{}") as RetentionExpiryRunSummary;
  return {
    ...summary,
    runKey: row.run_key,
    tenantId: row.tenant_id,
    status: row.status === "completed" ? "replayed" : "lease_held",
    receipts: [],
  };
}

export function runRetentionExpiry(
  db: Database.Database,
  input: {
    tenantId?: string;
    runKey: string;
    actorId?: string;
    leaseOwner?: string;
    leaseTtlSeconds?: number;
    scope?: RetentionScope;
    now?: Date;
  }
): RetentionExpiryRunSummary {
  const tenantId = input.tenantId ?? "default-tenant";
  const runKey = ensureNonEmpty(input.runKey, "runKey");
  const actorId = input.actorId ?? "system";
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const leaseOwner = input.leaseOwner ?? `${process.pid}:${crypto.randomUUID()}`;
  const leaseExpiresAt = addSeconds(now, input.leaseTtlSeconds ?? 300);
  const scope = input.scope ?? { tenantId };

  const existing = db
    .prepare("SELECT run_key, tenant_id, status, lease_expires_at, summary_json FROM memory_retention_expiry_runs WHERE run_key = ?")
    .get(runKey) as { run_key: string; tenant_id: string; status: string; lease_expires_at: string; summary_json: string } | undefined;
  if (existing?.status === "completed") return previousRunSummary(existing);
  if (existing?.status === "running" && new Date(existing.lease_expires_at).getTime() > now.getTime()) {
    return previousRunSummary(existing);
  }

  db.prepare(
    `INSERT INTO memory_retention_expiry_runs
      (run_key, tenant_id, lease_owner, lease_expires_at, status, scope_json, started_at, summary_json)
     VALUES (?, ?, ?, ?, 'running', ?, ?, '{}')
     ON CONFLICT(run_key) DO UPDATE SET
       lease_owner = excluded.lease_owner,
       lease_expires_at = excluded.lease_expires_at,
       status = 'running',
       scope_json = excluded.scope_json`
  ).run(runKey, tenantId, leaseOwner, leaseExpiresAt, stableJson(scope), nowIso);

  writeAuditEntry(
    {
      tenant_id: tenantId,
      actor_id: actorId,
      actor_role: actorId === "system" ? "system" : "operator",
      event_type: AUDIT_EVENT_TYPES.MEMORY_RETENTION_EXPIRY_RUN,
      entity_type: ENTITY_TYPES.MEMORY_RETENTION,
      entity_id: `retention_expiry_run:${runKey}`,
      reason: "retention_expiry_started",
      metadata_json: { run_key: runKey, scope_hash: scopeHash(scope), lease_owner: leaseOwner },
      created_at: nowIso,
    },
    db
  );

  const receipts: RetentionReceipt[] = [];
  const summary: RetentionExpiryRunSummary = {
    runKey,
    tenantId,
    status: "completed",
    considered: 0,
    expired: 0,
    held: 0,
    skippedFuture: 0,
    skippedAlreadyExpired: 0,
    policyUnavailable: 0,
    failed: 0,
    receipts,
  };

  try {
    const records = scopedRecords(db, { tenantId, scope, includeExpired: true });
    for (const record of records) {
      summary.considered += 1;
      const recordScope = parseJsonObject(record.scope_json);
      if (record.status === "expired") {
        summary.skippedAlreadyExpired += 1;
        receipts.push(
          emitRetentionReceipt(db, {
            tenantId,
            runKey,
            recordType: record.record_type,
            recordId: record.record_id,
            policyId: record.policy_id,
            policyVersion: record.policy_version,
            decision: "skipped_already_expired",
            reason: "record_already_expired",
            actorId,
            scope: recordScope,
            derivativeOutcomes: [{ store: record.record_type, outcome: "already_expired" }],
            metadata: {
              record_id: record.record_id,
              record_type: record.record_type,
              policy_id: record.policy_id,
              policy_version: record.policy_version,
              retention_deadline: record.retention_deadline,
            },
            createdAt: nowIso,
          })
        );
        continue;
      }
      if (!record.policy_id || !record.retention_deadline || record.status === "policy_unavailable") {
        summary.policyUnavailable += 1;
        receipts.push(
          emitRetentionReceipt(db, {
            tenantId,
            runKey,
            recordType: record.record_type,
            recordId: record.record_id,
            policyId: record.policy_id,
            policyVersion: record.policy_version,
            decision: "policy_unavailable",
            reason: "missing_policy_or_deadline",
            actorId,
            scope: recordScope,
            derivativeOutcomes: [{ store: record.record_type, outcome: "skipped" }],
            metadata: { record_id: record.record_id, record_type: record.record_type },
            createdAt: nowIso,
          })
        );
        continue;
      }

      const holds = activeLegalHoldsForRecord(db, record, now);
      if (holds.length > 0) {
        summary.held += 1;
        receipts.push(
          emitRetentionReceipt(db, {
            tenantId,
            runKey,
            recordType: record.record_type,
            recordId: record.record_id,
            policyId: record.policy_id,
            policyVersion: record.policy_version,
            decision: "held",
            reason: "active_legal_hold",
            actorId,
            scope: recordScope,
            derivativeOutcomes: [{ store: record.record_type, outcome: "blocked_by_hold" }],
            metadata: {
              record_id: record.record_id,
              record_type: record.record_type,
              hold_ids: holds.map((hold) => hold.id),
              policy_id: record.policy_id,
              policy_version: record.policy_version,
              retention_deadline: record.retention_deadline,
            },
            createdAt: nowIso,
          })
        );
        continue;
      }

      if (new Date(record.retention_deadline).getTime() > now.getTime()) {
        summary.skippedFuture += 1;
        receipts.push(
          emitRetentionReceipt(db, {
            tenantId,
            runKey,
            recordType: record.record_type,
            recordId: record.record_id,
            policyId: record.policy_id,
            policyVersion: record.policy_version,
            decision: "skipped_future",
            reason: "deadline_in_future",
            actorId,
            scope: recordScope,
            derivativeOutcomes: [{ store: record.record_type, outcome: "not_due" }],
            metadata: {
              record_id: record.record_id,
              record_type: record.record_type,
              policy_id: record.policy_id,
              policy_version: record.policy_version,
              retention_deadline: record.retention_deadline,
            },
            createdAt: nowIso,
          })
        );
        continue;
      }

      db.prepare(
        `UPDATE memory_retention_records
         SET status = 'expired', expired_at = ?, updated_at = ?
         WHERE tenant_id = ? AND record_type = ? AND record_id = ? AND status = 'active'`
      ).run(nowIso, nowIso, tenantId, record.record_type, record.record_id);
      summary.expired += 1;
      receipts.push(
        emitRetentionReceipt(db, {
          tenantId,
          runKey,
          recordType: record.record_type,
          recordId: record.record_id,
          policyId: record.policy_id,
          policyVersion: record.policy_version,
          decision: "expired",
          reason: "deadline_reached",
          actorId,
          scope: recordScope,
          derivativeOutcomes: [{ store: record.record_type, outcome: "expired" }],
          metadata: {
            record_id: record.record_id,
            record_type: record.record_type,
            policy_id: record.policy_id,
            policy_version: record.policy_version,
            retention_deadline: record.retention_deadline,
          },
          createdAt: nowIso,
        })
      );
    }

    const persistedSummary = { ...summary, receipts: receipts.map((receipt) => receipt.id) };
    db.prepare(
      `UPDATE memory_retention_expiry_runs
       SET status = 'completed', completed_at = ?, summary_json = ?
       WHERE run_key = ?`
    ).run(nowIso, stableJson(persistedSummary), runKey);
    writeAuditEntry(
      {
        tenant_id: tenantId,
        actor_id: actorId,
        actor_role: actorId === "system" ? "system" : "operator",
        event_type: AUDIT_EVENT_TYPES.MEMORY_RETENTION_EXPIRY_RUN,
        entity_type: ENTITY_TYPES.MEMORY_RETENTION,
        entity_id: `retention_expiry_run:${runKey}`,
        reason: "retention_expiry_completed",
        metadata_json: {
          run_key: runKey,
          scope_hash: scopeHash(scope),
          considered: summary.considered,
          expired: summary.expired,
          held: summary.held,
          skipped_future: summary.skippedFuture,
          policy_unavailable: summary.policyUnavailable,
          failed: summary.failed,
        },
        created_at: nowIso,
      },
      db
    );
    return summary;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    db.prepare(
      `UPDATE memory_retention_expiry_runs
       SET status = 'failed', completed_at = ?, error_message = ?
       WHERE run_key = ?`
    ).run(nowIso, message, runKey);
    writeAuditEntry(
      {
        tenant_id: tenantId,
        actor_id: actorId,
        actor_role: actorId === "system" ? "system" : "operator",
        event_type: AUDIT_EVENT_TYPES.MEMORY_RETENTION_EXPIRY_RUN,
        entity_type: ENTITY_TYPES.MEMORY_RETENTION,
        entity_id: `retention_expiry_run:${runKey}`,
        reason: "retention_expiry_failed",
        metadata_json: { run_key: runKey, scope_hash: scopeHash(scope), error_hash: crypto.createHash("sha256").update(message).digest("hex") },
        created_at: nowIso,
      },
      db
    );
    return { ...summary, status: "failed", failed: summary.failed + 1 };
  }
}
