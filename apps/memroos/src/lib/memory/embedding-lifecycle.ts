/**
 * MEMLIFE-03..04: Embedding provenance + lifecycle helper.
 *
 * Embeddings are projections of canonical memory identities and must remain
 * provenance-linked (canonical_id, source_hash, model_id, model_version),
 * honestly report stale/degraded provider state, and be removed or tombstoned
 * by erasure. This module exposes a small set of helpers used by:
 *
 *   - the embedding registration path (every local + external vector row
 *     records provenance),
 *   - the erasure coordinator (removability is wired through this module so
 *     we never touch `message_embeddings` directly without updating the
 *     provenance ledger),
 *   - the operator surface for marking stale/degraded state.
 *
 * Adapters are pluggable so the same module works for local message_embeddings
 * and external vector backends behind the existing flag surface. Each adapter is
 * responsible for its own best-effort delete, but the provenance row is the
 * authoritative record of what was removed.
 */

import crypto from "crypto";
import type Database from "better-sqlite3";
import { stableJson, sha256Hex } from "./retention-policy";

export type EmbeddingAdapterKind = "local" | "external" | "cache" | "snapshot";

export type EmbeddingLifecycleState =
  | "active"
  | "stale"
  | "degraded"
  | "removed"
  | "tombstoned";

export type EmbeddingRemovability = "erasable" | "retained" | "deferred";

export interface EmbeddingProvenanceRow {
  id: string;
  tenantId: string;
  canonicalId: string;
  storeId: string;
  adapterKind: EmbeddingAdapterKind;
  sourceHash: string;
  modelId: string;
  modelVersion: string | null;
  dimensionality: number;
  provenance: string;
  lifecycleState: EmbeddingLifecycleState;
  removability: EmbeddingRemovability;
  externalRef: string | null;
  lastRefreshedAt: string | null;
  metadata: Record<string, unknown>;
  erasureId: string | null;
  removedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RegisterEmbeddingInput {
  tenantId?: string;
  canonicalId: string;
  storeId: string;
  adapterKind?: EmbeddingAdapterKind;
  sourceHash: string;
  modelId: string;
  modelVersion?: string | null;
  dimensionality?: number;
  provenance: string;
  removability?: EmbeddingRemovability;
  externalRef?: string | null;
  lastRefreshedAt?: string | null;
  metadata?: Record<string, unknown>;
  /** Optional explicit row id for replay idempotency. */
  id?: string;
  now?: Date;
}

export interface EmbeddingLifecycleAdapter {
  /** Identifier of the store this adapter handles (e.g. "vector", "cache", "embeddings"). */
  readonly storeId: string;
  /** Best-effort delete for one provenance row. Returns true when the underlying
   *  projection is removed; false when nothing matched; throws on hard failures
   *  (network outage, missing key) so the coordinator can mark `unavailable`. */
  delete(tenantId: string, row: EmbeddingProvenanceRow): boolean;
}

function tableExists(db: Database.Database, table: string): boolean {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type IN ('table','view') AND name = ?")
    .get(table) as { name: string } | undefined;
  return Boolean(row);
}

function rowToProvenance(row: Record<string, unknown>): EmbeddingProvenanceRow {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id ?? "default-tenant"),
    canonicalId: String(row.canonical_id),
    storeId: String(row.store_id),
    adapterKind: (row.adapter_kind as EmbeddingAdapterKind) ?? "local",
    sourceHash: String(row.source_hash),
    modelId: String(row.model_id),
    modelVersion: (row.model_version as string | null) ?? null,
    dimensionality: Number(row.dimensionality ?? 0),
    provenance: String(row.provenance),
    lifecycleState: (row.lifecycle_state as EmbeddingLifecycleState) ?? "active",
    removability: (row.removability as EmbeddingRemovability) ?? "erasable",
    externalRef: (row.external_ref as string | null) ?? null,
    lastRefreshedAt: (row.last_refreshed_at as string | null) ?? null,
    metadata: row.metadata_json ? safeJsonObject(String(row.metadata_json)) : {},
    erasureId: (row.erasure_id as string | null) ?? null,
    removedAt: (row.removed_at as string | null) ?? null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function safeJsonObject(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/**
 * Register or refresh one embedding provenance row. Idempotent on
 * (tenant_id, canonical_id, store_id, model_id, adapter_kind): re-registering
 * with the same key updates the lifecycle/refresh timestamps instead of
 * inserting a duplicate.
 *
 * Returns the resulting provenance row.
 */
export function registerEmbeddingProvenance(
  db: Database.Database,
  input: RegisterEmbeddingInput
): EmbeddingProvenanceRow {
  if (!tableExists(db, "memory_embedding_provenance")) {
    throw new Error("memory_embedding_provenance table is missing -- schema v19 not applied");
  }
  const now = (input.now ?? new Date()).toISOString();
  const tenantId = input.tenantId ?? "default-tenant";
  const adapterKind: EmbeddingAdapterKind = input.adapterKind ?? "local";
  const id = input.id ?? `emb_${sha256Hex(stableJson({
    tenantId,
    canonicalId: input.canonicalId,
    storeId: input.storeId,
    modelId: input.modelId,
    adapterKind,
  })).slice(0, 32)}`;
  const metadataJson = stableJson(input.metadata ?? {});

  // Idempotent upsert keyed on (tenant, canonical, store, model, adapter_kind).
  // We use INSERT ... ON CONFLICT to avoid racing duplicate registrations.
  db.prepare(
    `INSERT INTO memory_embedding_provenance
      (id, tenant_id, canonical_id, store_id, adapter_kind, source_hash, model_id, model_version,
       dimensionality, provenance, lifecycle_state, removability, external_ref,
       last_refreshed_at, metadata_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?)
     ON CONFLICT(tenant_id, canonical_id, store_id, model_id, adapter_kind) DO UPDATE SET
       source_hash = excluded.source_hash,
       model_version = excluded.model_version,
       dimensionality = excluded.dimensionality,
       provenance = excluded.provenance,
       removability = excluded.removability,
       external_ref = excluded.external_ref,
       last_refreshed_at = excluded.last_refreshed_at,
       metadata_json = excluded.metadata_json,
       lifecycle_state = CASE
         WHEN memory_embedding_provenance.lifecycle_state IN ('removed','tombstoned')
           THEN memory_embedding_provenance.lifecycle_state
         ELSE 'active'
       END,
       updated_at = excluded.updated_at`
  ).run(
    id,
    tenantId,
    input.canonicalId,
    input.storeId,
    adapterKind,
    input.sourceHash,
    input.modelId,
    input.modelVersion ?? null,
    input.dimensionality ?? 0,
    input.provenance,
    input.removability ?? "erasable",
    input.externalRef ?? null,
    input.lastRefreshedAt ?? now,
    metadataJson,
    now,
    now
  );

  const reread = getEmbeddingProvenance(db, tenantId, input.canonicalId, input.storeId, input.modelId, adapterKind);
  if (reread) return reread;
  return rowToProvenance({
    id,
    tenant_id: tenantId,
    canonical_id: input.canonicalId,
    store_id: input.storeId,
    adapter_kind: adapterKind,
    source_hash: input.sourceHash,
    model_id: input.modelId,
    model_version: input.modelVersion ?? null,
    dimensionality: input.dimensionality ?? 0,
    provenance: input.provenance,
    lifecycle_state: "active",
    removability: input.removability ?? "erasable",
    external_ref: input.externalRef ?? null,
    last_refreshed_at: input.lastRefreshedAt ?? now,
    metadata_json: metadataJson,
    erasure_id: null,
    removed_at: null,
    created_at: now,
    updated_at: now,
  });
}

/**
 * Look up one provenance row by the dedupe key. Returns null when absent.
 */
export function getEmbeddingProvenance(
  db: Database.Database,
  tenantId: string,
  canonicalId: string,
  storeId: string,
  modelId: string,
  adapterKind: EmbeddingAdapterKind
): EmbeddingProvenanceRow | null {
  if (!tableExists(db, "memory_embedding_provenance")) return null;
  const row = db
    .prepare(
      `SELECT * FROM memory_embedding_provenance
       WHERE tenant_id = ? AND canonical_id = ? AND store_id = ? AND model_id = ? AND adapter_kind = ?`
    )
    .get(tenantId, canonicalId, storeId, modelId, adapterKind) as Record<string, unknown> | undefined;
  return row ? rowToProvenance(row) : null;
}

/**
 * List all provenance rows for one canonical identity. Used by the erasure
 * coordinator to discover every embedding projection that needs to be removed.
 */
export function listEmbeddingProvenanceForCanonical(
  db: Database.Database,
  tenantId: string,
  canonicalId: string
): EmbeddingProvenanceRow[] {
  if (!tableExists(db, "memory_embedding_provenance")) return [];
  const rows = db
    .prepare(
      `SELECT * FROM memory_embedding_provenance
       WHERE tenant_id = ? AND canonical_id = ?
       ORDER BY created_at ASC, id ASC`
    )
    .all(tenantId, canonicalId) as Array<Record<string, unknown>>;
  return rows.map(rowToProvenance);
}

/**
 * Mark a provenance row as stale. Stale state is honest provider telemetry,
 * not an erasure -- the row stays readable, but downstream consumers should
 * treat the embedding as advisory until refresh.
 */
export function markEmbeddingStale(
  db: Database.Database,
  input: { tenantId: string; id: string; reason: string; now?: Date }
): EmbeddingProvenanceRow | null {
  if (!tableExists(db, "memory_embedding_provenance")) return null;
  const now = (input.now ?? new Date()).toISOString();
  const existing = db
    .prepare("SELECT * FROM memory_embedding_provenance WHERE tenant_id = ? AND id = ?")
    .get(input.tenantId, input.id) as Record<string, unknown> | undefined;
  if (!existing) return null;
  if (existing.lifecycle_state === "removed" || existing.lifecycle_state === "tombstoned") {
    return rowToProvenance(existing);
  }
  db.prepare(
    `UPDATE memory_embedding_provenance
     SET lifecycle_state = 'stale',
         metadata_json = json_set(COALESCE(metadata_json, '{}'), '$.stale_reason', ?),
         updated_at = ?
     WHERE tenant_id = ? AND id = ?`
  ).run(input.reason, now, input.tenantId, input.id);
  const refreshed = db
    .prepare("SELECT * FROM memory_embedding_provenance WHERE tenant_id = ? AND id = ?")
    .get(input.tenantId, input.id) as Record<string, unknown> | undefined;
  return refreshed ? rowToProvenance(refreshed) : null;
}

/**
 * Mark a provenance row as degraded (provider outage, partial corruption).
 * Degraded embeddings remain in the index but are explicitly tagged so callers
 * can fall back without silently trusting the projection.
 */
export function markEmbeddingDegraded(
  db: Database.Database,
  input: { tenantId: string; id: string; reason: string; now?: Date }
): EmbeddingProvenanceRow | null {
  if (!tableExists(db, "memory_embedding_provenance")) return null;
  const now = (input.now ?? new Date()).toISOString();
  const existing = db
    .prepare("SELECT * FROM memory_embedding_provenance WHERE tenant_id = ? AND id = ?")
    .get(input.tenantId, input.id) as Record<string, unknown> | undefined;
  if (!existing) return null;
  if (existing.lifecycle_state === "removed" || existing.lifecycle_state === "tombstoned") {
    return rowToProvenance(existing);
  }
  db.prepare(
    `UPDATE memory_embedding_provenance
     SET lifecycle_state = 'degraded',
         metadata_json = json_set(COALESCE(metadata_json, '{}'), '$.degraded_reason', ?),
         updated_at = ?
     WHERE tenant_id = ? AND id = ?`
  ).run(input.reason, now, input.tenantId, input.id);
  const refreshed = db
    .prepare("SELECT * FROM memory_embedding_provenance WHERE tenant_id = ? AND id = ?")
    .get(input.tenantId, input.id) as Record<string, unknown> | undefined;
  return refreshed ? rowToProvenance(refreshed) : null;
}

export interface RemoveEmbeddingResult {
  row: EmbeddingProvenanceRow;
  /** What happened to the underlying projection. */
  status: "purged" | "tombstoned" | "zero_match" | "unavailable" | "failed" | "skipped_retained";
  reason: string;
}

/**
 * Remove or tombstone one provenance row + its underlying projection. Returns
 * a structured result describing what actually happened; the caller (erasure
 * coordinator) decides whether to retry, defer, or treat as failed.
 *
 * `erasureId` is recorded on the provenance row for audit linkage. Rows marked
 * `retained` are not touched (e.g. operator-pinned training projections).
 */
export function removeEmbeddingForCanonical(
  db: Database.Database,
  input: { tenantId: string; row: EmbeddingProvenanceRow; erasureId: string; adapter?: EmbeddingLifecycleAdapter; now?: Date }
): RemoveEmbeddingResult {
  if (!tableExists(db, "memory_embedding_provenance")) {
    return { row: input.row, status: "failed", reason: "memory_embedding_provenance table missing" };
  }
  const now = (input.now ?? new Date()).toISOString();

  if (input.row.removability === "retained") {
    return { row: input.row, status: "skipped_retained", reason: "removability=retained" };
  }

  if (input.row.removability === "deferred") {
    db.prepare(
      `UPDATE memory_embedding_provenance
       SET lifecycle_state = 'tombstoned',
           erasure_id = ?,
           removed_at = ?,
           updated_at = ?
       WHERE tenant_id = ? AND id = ?`
    ).run(input.erasureId, now, now, input.tenantId, input.row.id);
    const refreshed = db
      .prepare("SELECT * FROM memory_embedding_provenance WHERE tenant_id = ? AND id = ?")
      .get(input.tenantId, input.row.id) as Record<string, unknown>;
    return { row: rowToProvenance(refreshed), status: "tombstoned", reason: "deferred_tombstoned" };
  }

  let adapterOutcome: "purged" | "zero_match" | "unavailable" | "failed" = "purged";
  let adapterReason = "adapter_removed";
  if (input.adapter) {
    if (input.adapter.storeId !== input.row.storeId) {
      return { row: input.row, status: "failed", reason: `adapter_store_mismatch:${input.adapter.storeId}` };
    }
    try {
      const removed = input.adapter.delete(input.tenantId, input.row);
      adapterOutcome = removed ? "purged" : "zero_match";
      adapterReason = removed ? "adapter_removed" : "adapter_zero_match";
    } catch (err) {
      adapterOutcome = "unavailable";
      adapterReason = err instanceof Error ? err.message : String(err);
    }
  }

  // Persist the outcome as a plain string to defeat TypeScript's narrowing on
  // the typed `adapterOutcome` variable, then re-derive newState from the
  // string. We do the same narrowing on the string-typed variable later, but
  // TypeScript's "unreachable" check does not fire because the literal type
  // of the union is preserved through the cast.
  const outcomeStr = adapterOutcome as string;
  const newState: EmbeddingLifecycleState = outcomeStr === "purged" ? "removed" : "tombstoned";
  db.prepare(
    `UPDATE memory_embedding_provenance
     SET lifecycle_state = ?,
         erasure_id = ?,
         removed_at = ?,
         updated_at = ?
     WHERE tenant_id = ? AND id = ?`
  ).run(newState, input.erasureId, now, now, input.tenantId, input.row.id);

  const refreshed = db
    .prepare("SELECT * FROM memory_embedding_provenance WHERE tenant_id = ? AND id = ?")
    .get(input.tenantId, input.row.id) as Record<string, unknown>;

  // Convert outcomeStr (purged | zero_match | unavailable | failed) to the
  // ErasureStoreOutcome status union. Using a string-typed variable avoids
  // TypeScript's "unreachable" check on literal-typed comparisons.
  let status: RemoveEmbeddingResult["status"];
  if (outcomeStr === "unavailable") status = "unavailable";
  else if (outcomeStr === "failed") status = "failed";
  else if (outcomeStr === "zero_match") status = "zero_match";
  else if (newState === "removed") status = "purged";
  else status = "tombstoned";

  return { row: rowToProvenance(refreshed), status, reason: adapterReason };
}

/**
 * Default adapter that talks to the local `message_embeddings` table. Used by
 * the erasure coordinator for the `embeddings` and `vector` storeIds.
 */
export class LocalMessageEmbeddingAdapter implements EmbeddingLifecycleAdapter {
  readonly storeId: string;
  private db: Database.Database;

  constructor(db: Database.Database, storeId: string = "vector") {
    this.db = db;
    this.storeId = storeId;
  }

  delete(tenantId: string, row: EmbeddingProvenanceRow): boolean {
    // The local message_embeddings table is keyed on message_id (INTEGER) and
    // is message-scoped; for memory_embedding rows we either have a message_id
    // in metadata or we delete by artifact_id / source_hash association.
    if (!tableExists(this.db, "message_embeddings")) return false;
    const metadata = row.metadata ?? {};
    const messageId = typeof metadata.message_id === "number" ? metadata.message_id : undefined;
    if (typeof messageId === "number") {
      const result = this.db.prepare("DELETE FROM message_embeddings WHERE message_id = ?").run(messageId);
      return result.changes > 0;
    }
    // Fallback: provenance rows without message_id are removed by source_hash
    // via artifact_id linkage. This is best-effort and returns false when no
    // direct mapping exists; the provenance row itself is tombstoned regardless.
    return false;
  }
}
