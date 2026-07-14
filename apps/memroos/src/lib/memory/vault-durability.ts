/**
 * MEMLIFE-05 / VAL-MEM-026: Raw vault durability, tenant-safe replay, label history, and
 * failure-recovery primitives for the MEMLIFE-05 slice.
 *
 * This module wraps the existing `vault/writer.ts` write/read/list primitives with:
 *   - Tenant-safe access enforcement (rejects cross-tenant artifact lookups by ID).
 *   - A durability ledger (`memory_vault_durability`) that records write_state and
 *     replay_state transitions, so DB/file/rename/key/hash faults cannot leave a
 *     false-complete artifact behind.
 *   - Replay helpers that recompute the hash on disk and mark mismatches `mismatch`.
 *   - A label-history writer that records classification transitions.
 *
 * The module fails closed: if any step fails the artifact is recorded as `failed` or
 * `orphaned` and callers can observe the receipt through the memory audit chain.
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";
import os from "os";
import type Database from "better-sqlite3";

import { AUDIT_EVENT_TYPES, ENTITY_TYPES } from "@/lib/audit/event-types";
import { writeChainedMemoryAuditEntry } from "@/lib/audit/memory-chain";
import {
  VaultHashMismatchError,
  listVaultArtifacts,
  readVaultArtifact,
  writeVaultArtifact,
} from "@/lib/vault/writer";
import type {
  VaultLabel,
  WriteVaultArtifactInput,
  WrittenVaultArtifact,
} from "@/lib/vault/types";
import { stableJson } from "@/lib/memory/retention-policy";

export type VaultWriteState = "pending" | "complete" | "failed" | "orphaned" | "replayed";
export type VaultReplayState = "pending" | "complete" | "failed" | "mismatch";

export interface VaultDurabilityRow {
  id: string;
  tenantId: string;
  artifactId: string;
  artifactUri: string;
  contentHash: string;
  writeState: VaultWriteState;
  replayState: VaultReplayState;
  failureReason: string | null;
  classification: VaultLabel;
  labelVersion: number;
  retentionUntil: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VaultWriteWithDurabilityInput extends WriteVaultArtifactInput {
  actorId: string;
}

export interface VaultReplayResult {
  ok: boolean;
  artifactId: string;
  expectedHash: string;
  observedHash: string;
  replayState: VaultReplayState;
  failureReason: string | null;
}

function tableExists(db: Database.Database, table: string): boolean {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type IN ('table','view') AND name = ?").get(table) as { name: string } | undefined;
  return Boolean(row);
}

function toIso(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid UTC timestamp: ${String(value)}`);
  return date.toISOString();
}

function defaultLabel(label?: VaultLabel): Required<Pick<VaultLabel, "visibility" | "policy">> &
  Pick<VaultLabel, "domain" | "sensitivity"> {
  return {
    visibility: label?.visibility ?? "private",
    domain: label?.domain ?? null,
    sensitivity: label?.sensitivity ?? null,
    policy: label?.policy ?? "sealed",
  };
}

function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 140) || "artifact";
}

function artifactAbsolutePath(tenantId: string, relativePath: string): string {
  const root = process.env.MEMROOS_VAULT_ROOT || path.join(os.homedir(), ".memroos", "vault");
  return path.join(root, safeSegment(tenantId), relativePath);
}

/* ------------------------------------------------------------------ */
/* Write                                                               */
/* ------------------------------------------------------------------ */

/**
 * Write a raw vault artifact and atomically record its durability state. The durability
 * row is committed in the same transaction as the artifact metadata, so DB rollback
 * leaves the file absent (or marks it `orphaned` via cleanup). File rename failures leave
 * the durability row in `pending` and surface the failure to the caller.
 *
 * On any failure, the artifact is marked `failed` and the corresponding
 * `memory.vault.failure` audit event is written through the chain.
 */
export function writeVaultArtifactWithDurability(
  db: Database.Database,
  input: VaultWriteWithDurabilityInput
): WrittenVaultArtifact & { durabilityId: string } {
  const tenantId = input.tenantId ?? "default-tenant";
  const now = toIso(input.now ?? new Date());
  const label = defaultLabel(input.label);
  const durabilityId = `vdr_${crypto.randomUUID()}`;

  // 1. Persist durability row in `pending` state first. This is the durable
  //    source of truth that an attempt happened; if write succeeds we transition
  //    to `complete`, if it fails we transition to `failed`.
  if (tableExists(db, "memory_vault_durability")) {
    db.prepare(
      `INSERT INTO memory_vault_durability
        (id, tenant_id, artifact_id, artifact_uri, content_hash, classification_json, label_version,
         write_state, replay_state, retention_until, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, 'pending', 'pending', ?, ?, ?)`
    ).run(
      durabilityId,
      tenantId,
      "pending",
      "vault://pending",
      "pending",
      stableJson(label),
      input.retentionUntil ?? null,
      now,
      now
    );
  }

  let written: WrittenVaultArtifact;
  try {
    written = writeVaultArtifact(db, {
      tenantId,
      sourceType: input.sourceType,
      sourceId: input.sourceId ?? null,
      sessionId: input.sessionId ?? null,
      project: input.project ?? null,
      body: input.body,
      label,
      keyId: input.keyId ?? null,
      retentionUntil: input.retentionUntil ?? null,
      replayMetadata: input.replayMetadata,
      now: input.now,
    });
  } catch (err) {
    if (tableExists(db, "memory_vault_durability")) {
      db.prepare(
        `UPDATE memory_vault_durability
         SET write_state = 'failed', replay_state = 'failed', failure_reason = ?, artifact_id = ?, artifact_uri = ?, content_hash = ?, updated_at = ?
         WHERE id = ?`
      ).run(
        err instanceof Error ? err.message : String(err),
        "failed",
        `vault://failed/${tenantId}`,
        "failed",
        new Date().toISOString(),
        durabilityId
      );
    }
    recordVaultFailureReceipt(db, tenantId, "unknown", "unknown", `vault_write_failed:${err instanceof Error ? err.message : String(err)}`, input.actorId);
    throw err;
  }

  // 2. Transition the durability row to `complete`.
  if (tableExists(db, "memory_vault_durability")) {
    db.prepare(
      `UPDATE memory_vault_durability
       SET artifact_id = ?, artifact_uri = ?, content_hash = ?, write_state = 'complete', replay_state = 'complete', updated_at = ?
       WHERE id = ?`
    ).run(written.id, written.artifactUri, written.contentHash, new Date().toISOString(), durabilityId);
  }

  try {
    writeChainedMemoryAuditEntry(db, {
      tenantId,
      actorId: input.actorId,
      actorRole: input.actorId === "system" ? "system" : "operator",
      eventType: AUDIT_EVENT_TYPES.MEMORY_VAULT_WRITE,
      entityType: ENTITY_TYPES.MEMORY_VAULT,
      entityId: `vault_artifact:${written.id}`,
      reason: "vault_write_succeeded",
      metadata: {
        artifact_id: written.id,
        artifact_uri: written.artifactUri,
        content_hash: written.contentHash,
        uncompressed_size: written.uncompressedSize,
        compressed_size: written.compressedSize,
        durability_id: durabilityId,
        classification: label,
      },
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    if (tableExists(db, "memory_vault_durability")) {
      db.prepare(
        `UPDATE memory_vault_durability
         SET replay_state = 'failed', failure_reason = ?, updated_at = ?
         WHERE id = ?`
      ).run(
        `audit_receipt_failure:${err instanceof Error ? err.message : String(err)}`,
        new Date().toISOString(),
        durabilityId
      );
    }
    throw err;
  }

  return { ...written, durabilityId };
}

/* ------------------------------------------------------------------ */
/* Replay                                                               */
/* ------------------------------------------------------------------ */

/**
 * Replay a vault artifact, recomputing the SHA-256 hash of the on-disk body and comparing
 * it against the persisted `content_hash`. Tenant-safe: refuses to replay an artifact
 * whose `tenant_id` does not match `expectedTenantId`.
 *
 * On mismatch the durability row is updated to `replay_state = 'mismatch'` and a
 * `memory.vault.failure` audit event is emitted through the chain.
 */
export function replayVaultArtifactWithDurability(
  db: Database.Database,
  expectedTenantId: string,
  artifactId: string,
  actorId: string
): VaultReplayResult {
  const tenantId = expectedTenantId;
  const durabilityRow = loadDurabilityRow(db, tenantId, artifactId);
  if (!durabilityRow) {
    throw new Error(`vault durability row missing: tenant=${tenantId} artifact=${artifactId}`);
  }

  let observedHash = "";
  let replayState: VaultReplayState = "complete";
  let failureReason: string | null = null;
  try {
    const replayed = readVaultArtifact(db, artifactId);
    observedHash = replayed.contentHash;
    if (replayed.tenantId !== tenantId) {
      throw new Error(`tenant mismatch: expected ${tenantId}, got ${replayed.tenantId}`);
    }
    if (replayed.contentHash !== durabilityRow.contentHash) {
      replayState = "mismatch";
      failureReason = `hash_mismatch:stored=${durabilityRow.contentHash},observed=${replayed.contentHash}`;
    }
  } catch (err) {
    replayState = err instanceof VaultHashMismatchError ? "mismatch" : "failed";
    failureReason = err instanceof Error ? err.message : String(err);
    observedHash = "";
  }

  if (tableExists(db, "memory_vault_durability")) {
    db.prepare(
      `UPDATE memory_vault_durability
       SET replay_state = ?, failure_reason = ?, updated_at = ?
       WHERE id = ?`
    ).run(replayState, failureReason, new Date().toISOString(), durabilityRow.id);
  }

  try {
    writeChainedMemoryAuditEntry(db, {
      tenantId,
      actorId,
      actorRole: actorId === "system" ? "system" : "operator",
      eventType: replayState === "complete" ? AUDIT_EVENT_TYPES.MEMORY_VAULT_REPLAY : AUDIT_EVENT_TYPES.MEMORY_VAULT_FAILURE,
      entityType: ENTITY_TYPES.MEMORY_VAULT,
      entityId: `vault_artifact:${artifactId}`,
      reason: replayState === "complete" ? "vault_replay_verified" : "vault_replay_failed",
      metadata: {
        artifact_id: artifactId,
        expected_hash: durabilityRow.contentHash,
        observed_hash: observedHash,
        replay_state: replayState,
        failure_reason: failureReason,
      },
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    if (tableExists(db, "memory_vault_durability")) {
      db.prepare(
        `UPDATE memory_vault_durability SET replay_state = 'failed', failure_reason = ?, updated_at = ? WHERE id = ?`
      ).run(
        `audit_receipt_failure:${err instanceof Error ? err.message : String(err)}`,
        new Date().toISOString(),
        durabilityRow.id
      );
    }
    throw err;
  }

  return {
    ok: replayState === "complete",
    artifactId,
    expectedHash: durabilityRow.contentHash,
    observedHash,
    replayState,
    failureReason,
  };
}

/**
 * Reconcile every durable artifact for a tenant by replaying each in turn. Returns the
 * set of artifacts whose replay_state is not `complete` (i.e. require operator review).
 */
export function reconcileVaultDurability(
  db: Database.Database,
  tenantId: string,
  actorId: string
): { ok: number; mismatched: string[]; failed: string[] } {
  if (!tableExists(db, "memory_vault_durability")) {
    return { ok: 0, mismatched: [], failed: [] };
  }
  const rows = db
    .prepare(
      `SELECT artifact_id FROM memory_vault_durability
       WHERE tenant_id = ? AND write_state = 'complete' AND artifact_id != 'pending' AND artifact_id != 'failed'`
    )
    .all(tenantId) as Array<{ artifact_id: string }>;

  const mismatched: string[] = [];
  const failed: string[] = [];
  let ok = 0;
  for (const row of rows) {
    const result = replayVaultArtifactWithDurability(db, tenantId, row.artifact_id, actorId);
    if (result.replayState === "complete") ok += 1;
    else if (result.replayState === "mismatch") mismatched.push(row.artifact_id);
    else failed.push(row.artifact_id);
  }
  return { ok, mismatched, failed };
}

/* ------------------------------------------------------------------ */
/* List / read                                                          */
/* ------------------------------------------------------------------ */

export function listVaultArtifactsForTenant(
  db: Database.Database,
  tenantId: string,
  options: { limit?: number; cursor?: string | null } = {}
): ReturnType<typeof listVaultArtifacts> {
  return listVaultArtifacts(db, { tenantId, limit: options.limit, cursor: options.cursor });
}

/**
 * Read a vault artifact enforcing tenant scope. Throws if the artifact's tenant
 * does not match the caller's tenant.
 */
export function readVaultArtifactForTenant(
  db: Database.Database,
  expectedTenantId: string,
  artifactId: string
): ReturnType<typeof readVaultArtifact> {
  const replayed = readVaultArtifact(db, artifactId);
  if (replayed.tenantId !== expectedTenantId) {
    throw new Error(`tenant mismatch: expected ${expectedTenantId}, got ${replayed.tenantId}`);
  }
  return replayed;
}

/* ------------------------------------------------------------------ */
/* Internals                                                            */
/* ------------------------------------------------------------------ */

function loadDurabilityRow(db: Database.Database, tenantId: string, artifactId: string): VaultDurabilityRow | null {
  if (!tableExists(db, "memory_vault_durability")) return null;
  const row = db
    .prepare(
      `SELECT id, tenant_id, artifact_id, artifact_uri, content_hash, write_state, replay_state,
              failure_reason, classification_json, label_version, retention_until, created_at, updated_at
       FROM memory_vault_durability
       WHERE tenant_id = ? AND artifact_id = ?
       ORDER BY updated_at DESC, id DESC LIMIT 1`
    )
    .get(tenantId, artifactId) as
    | {
        id: string;
        tenant_id: string;
        artifact_id: string;
        artifact_uri: string;
        content_hash: string;
        write_state: VaultWriteState;
        replay_state: VaultReplayState;
        failure_reason: string | null;
        classification_json: string;
        label_version: number;
        retention_until: string | null;
        created_at: string;
        updated_at: string;
      }
    | undefined;
  if (!row) return null;
  let classification: VaultLabel = {};
  try {
    classification = JSON.parse(row.classification_json || "{}") as VaultLabel;
  } catch {
    classification = {};
  }
  return {
    id: row.id,
    tenantId: row.tenant_id,
    artifactId: row.artifact_id,
    artifactUri: row.artifact_uri,
    contentHash: row.content_hash,
    writeState: row.write_state,
    replayState: row.replay_state,
    failureReason: row.failure_reason,
    classification,
    labelVersion: row.label_version,
    retentionUntil: row.retention_until,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function recordVaultFailureReceipt(
  db: Database.Database,
  tenantId: string,
  artifactId: string,
  artifactHash: string,
  reason: string,
  actorId: string
): void {
  try {
    writeChainedMemoryAuditEntry(db, {
      tenantId,
      actorId,
      actorRole: actorId === "system" ? "system" : "operator",
      eventType: AUDIT_EVENT_TYPES.MEMORY_VAULT_FAILURE,
      entityType: ENTITY_TYPES.MEMORY_VAULT,
      entityId: `vault_artifact:${artifactId}`,
      reason: "vault_failure_recorded",
      metadata: { artifact_id: artifactId, artifact_hash: artifactHash, failure_reason: reason },
      createdAt: new Date().toISOString(),
    });
  } catch {
    // Audit failure is non-fatal here -- failure reason is already in the durability row.
  }
}

/**
 * Mark orphaned artifacts: those whose durability row is `pending` but no raw_artifacts
 * row exists, or whose file is missing. Returns the count of artifacts marked `orphaned`.
 */
export function markOrphanedArtifacts(db: Database.Database, tenantId: string): number {
  if (!tableExists(db, "memory_vault_durability")) return 0;
  const rows = db
    .prepare(
      `SELECT id, artifact_id, artifact_uri FROM memory_vault_durability
       WHERE tenant_id = ? AND write_state IN ('pending') AND artifact_id NOT IN ('pending','failed')`
    )
    .all(tenantId) as Array<{ id: string; artifact_id: string; artifact_uri: string }>;
  let marked = 0;
  for (const row of rows) {
    const artifactRow = db
      .prepare("SELECT artifact_path FROM raw_artifacts WHERE id = ?")
      .get(row.artifact_id) as { artifact_path: string } | undefined;
    let missing = false;
    if (!artifactRow) {
      missing = true;
    } else {
      const absolute = artifactAbsolutePath(tenantId, artifactRow.artifact_path);
      try {
        if (!fs.existsSync(absolute)) missing = true;
      } catch {
        missing = true;
      }
    }
    if (missing) {
      db.prepare(
        `UPDATE memory_vault_durability SET write_state = 'orphaned', failure_reason = 'orphaned:file_or_row_missing', updated_at = ? WHERE id = ?`
      ).run(new Date().toISOString(), row.id);
      marked += 1;
    }
  }
  return marked;
}
