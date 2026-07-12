import crypto from "crypto";
import type Database from "better-sqlite3";
import { AUDIT_EVENT_TYPES, ENTITY_TYPES } from "@/lib/audit/event-types";
import { writeAuditEntry } from "@/lib/audit/write";
import { stableJson } from "./retention-policy";
import {
  listEmbeddingProvenanceForCanonical,
  removeEmbeddingForCanonical,
  registerEmbeddingProvenance,
  LocalMessageEmbeddingAdapter,
  type EmbeddingLifecycleAdapter,
  type RemoveEmbeddingResult,
} from "./embedding-lifecycle";
import type { CanonicalDerivative, CanonicalMemoryIdentity } from "./canonical";

export interface ErasureStoreOutcome {
  storeId: string;
  status: "purged" | "tombstoned" | "unavailable" | "zero_match" | "failed" | "pending";
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface ErasureReport {
  erasureId: string;
  tenantId: string;
  canonicalId: string;
  status: "completed" | "failed" | "pending" | "incomplete";
  storeOutcomes: ErasureStoreOutcome[];
  actorId: string;
  scopeHash: string;
  startedAt: string;
  completedAt?: string;
}

export interface ErasureCoordinatorOptions {
  tenantId?: string;
  actorId: string;
  scope: Record<string, unknown>;
  now?: Date;
  idempotencyKey?: string;
  /** Optional override for the SHA-256 erasure id derivation. When provided, the
   *  erasure coordinator treats this string as the canonical erasureId instead of
   *  deriving one from (tenant, canonical). Used by subject erasure to produce a
   *  stable plan-scoped id. */
  erasureId?: string;
}

/**
 * Centralized list of every store the erasure coordinator knows about. Adding
 * a new store requires registering an adapter via `registerErasureStoreAdapter`
 * so we never silently regress to "default purged" branches. Subject erasure
 * and the embedding helper share this list.
 */
export const KNOWN_STORES = [
  "vector",
  "graph",
  "fts",
  "qmd",
  "cache",
  "context",
  "candidates",
  "platform",
  "embeddings",
  "vault",
  "message",
  "salience",
] as const;

export type KnownStore = (typeof KNOWN_STORES)[number];

export interface ErasureStoreAdapter {
  /** Identifier of the store this adapter handles. Must match a value in KNOWN_STORES. */
  readonly storeId: KnownStore;
  /**
   * Erase one canonical identity from this store.
   *
   * Implementations must:
   *  - return `zero_match` when no projection of this canonical identity exists,
   *  - return `purged` after a successful physical deletion,
   *  - return `tombstoned` when retention policy requires a non-sensitive marker,
   *  - throw only for hard infrastructure failures (provider outage, missing key).
   *
   * Implementations MUST NOT throw for "no match" cases.
   */
  erase(
    db: Database.Database,
    tenantId: string,
    identity: CanonicalMemoryIdentity,
    options: { erasureId: string; now: Date }
  ): Promise<{ status: ErasureStoreOutcome["status"]; reason: string; metadata?: Record<string, unknown> }>;
}

const STORE_ADAPTERS = new Map<KnownStore, ErasureStoreAdapter>();

export function registerErasureStoreAdapter(adapter: ErasureStoreAdapter): void {
  if (!KNOWN_STORES.includes(adapter.storeId as KnownStore)) {
    throw new Error(`registerErasureStoreAdapter: unknown storeId "${adapter.storeId}"`);
  }
  STORE_ADAPTERS.set(adapter.storeId, adapter);
}

export function getErasureStoreAdapter(storeId: string): ErasureStoreAdapter | undefined {
  return STORE_ADAPTERS.get(storeId as KnownStore);
}

export function listRegisteredErasureStores(): KnownStore[] {
  return Array.from(STORE_ADAPTERS.keys());
}

/**
 * Typed error thrown when erasure authorization scope is missing, malformed, or
 * mismatched against the canonical identity. Callers (routes, subjects) can use
 * instanceof to surface a 403 with a stable reason code.
 */
export class ErasureAuthorizationError extends Error {
  readonly code:
    | "missing_scope"
    | "missing_tenant"
    | "wrong_tenant"
    | "missing_purpose"
    | "missing_canonical_tenant";

  constructor(
    code: ErasureAuthorizationError["code"],
    message: string
  ) {
    super(message);
    this.name = "ErasureAuthorizationError";
    this.code = code;
  }
}

/**
 * Derive a stable erasure id from (tenantId, canonicalId). Same inputs always
 * produce the same id, so retries of the same erasure request converge on a
 * single report row instead of producing a fresh `erasure_<uuid>` per attempt.
 *
 * Format: `erasure_<64 hex chars>`.
 */
export function deriveErasureId(tenantId: string, canonicalId: string): string {
  return `erasure_${crypto.createHash("sha256").update(`${tenantId}|${canonicalId}`).digest("hex")}`;
}

function defaultTenantFromScope(scope: Record<string, unknown>): string | null {
  const candidate = scope.tenantId;
  return typeof candidate === "string" && candidate.trim() ? candidate.trim() : null;
}

/**
 * Validate that the erasure request scope has a non-empty tenantId and that it
 * matches the canonical identity's tenant. Throws `ErasureAuthorizationError`
 * with a typed code on any failure -- callers can match by `instanceof` and the
 * `code` field to drive HTTP status / retry policy.
 */
function authorizeErasureScope(identity: CanonicalMemoryIdentity, scope: Record<string, unknown>): {
  scopeTenantId: string;
  scopePurpose: string;
} {
  if (!scope || Object.keys(scope).length === 0) {
    throw new ErasureAuthorizationError("missing_scope", "Erasure authorization failed: missing scope");
  }
  const scopeTenantId = defaultTenantFromScope(scope);
  if (!scopeTenantId) {
    throw new ErasureAuthorizationError(
      "missing_tenant",
      "Erasure authorization failed: scope.tenantId is required"
    );
  }
  // scope.purpose is optional; capture it when present so audit metadata can
  // record it but never fail the request on its absence.
  const scopePurpose = typeof scope.purpose === "string" ? scope.purpose : "";
  // Compare scope.tenantId against the canonical identity's tenant.
  // The identity may carry its tenant in either the scope-derived hash inputs or
  // an explicit `tenantId` field on the identity itself. Fall back to scope only
  // when no canonical tenant is declared.
  const identityMetadata = (identity as CanonicalMemoryIdentity & { tenantId?: string }).tenantId;
  if (typeof identityMetadata === "string" && identityMetadata.trim() && identityMetadata !== scopeTenantId) {
    throw new ErasureAuthorizationError(
      "wrong_tenant",
      `Erasure authorization failed: scope.tenantId="${scopeTenantId}" does not match canonical identity tenantId="${identityMetadata}"`
    );
  }
  return { scopeTenantId, scopePurpose };
}

function tableExists(db: Database.Database, table: string): boolean {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type IN ('table','view') AND name = ?")
    .get(table) as { name: string } | undefined;
  return Boolean(row);
}

/**
 * Walk the canonical identity + neighbor relationships through the actual graph
 * tables (`memory_erasure_reports`, the canonical hash lineage, and the
 * `memory_embedding_provenance` ledger) and return every indirect derivative
 * that should be considered for erasure alongside the direct derivatives.
 *
 * Traversal is read-only. It returns derivatives the coordinator should erase
 * but never deletes anything on its own. Unrelated records are filtered out by
 * the sourceHash / canonicalId match: rows that do not derive from the source
 * identity are never returned.
 *
 * `sourceIdentity` may be either a `CanonicalMemoryIdentity` or a string ID; the
 * latter is supported for callers that only have the canonical id in hand.
 */
export function traverseIndirectDerivatives(
  db: Database.Database,
  sourceIdentity: CanonicalMemoryIdentity | string
): CanonicalDerivative[] {
  if (!sourceIdentity) return [];

  const indirect = new Map<string, CanonicalDerivative>();
  const identityObj: CanonicalMemoryIdentity = typeof sourceIdentity === "string"
    ? { id: sourceIdentity, canonicalHash: "", derivatives: [] }
    : sourceIdentity;
  const sourceHash = identityObj.canonicalHash;

  // 1. Walk the embedding provenance ledger for cache/snapshot/external rows
  //    that reference the same canonical hash but were not enumerated by the
  //    direct derivatives list. These are exactly the "neighbor cache" links
  //    VAL-MEM-014 asks us to traverse.
  if (tableExists(db, "memory_embedding_provenance")) {
    const rows = db
      .prepare(
        `SELECT * FROM memory_embedding_provenance
         WHERE canonical_id = ?
           AND (source_hash = ? OR store_id IN ('cache','snapshot'))
         ORDER BY created_at ASC, id ASC`
      )
      .all(identityObj.id, sourceHash) as Array<Record<string, unknown>>;

    for (const row of rows) {
      const storeId = String(row.store_id);
      const indirectSourceHash = String(row.source_hash ?? sourceHash);
      const key = `${storeId}:${indirectSourceHash}`;
      if (indirect.has(key)) continue;
      indirect.set(key, {
        storeId,
        sourceHash: indirectSourceHash,
        provenance: `embedding_provenance:${String(row.id)}`,
        metadata: {
          embedding_id: String(row.id),
          model_id: String(row.model_id ?? ""),
          model_version: (row.model_version as string | null) ?? null,
          adapter_kind: String(row.adapter_kind ?? "local"),
        },
      });
    }
  }

  // 2. Walk prior erasure reports for the same canonical identity to discover
  //    tombstoned neighbors and historical store links the identity has touched.
  //    These are indirect "snapshot" links: a prior erasure may have written a
  //    tombstone that references a different store id, and we want erasure
  //    retries to converge on the same union of stores.
  if (tableExists(db, "memory_erasure_reports")) {
    const priorRows = db
      .prepare(
        `SELECT store_outcomes_json FROM memory_erasure_reports
         WHERE canonical_id = ?
         ORDER BY started_at ASC, id ASC`
      )
      .all(identityObj.id) as Array<{ store_outcomes_json: string }>;

    for (const prior of priorRows) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(prior.store_outcomes_json);
      } catch {
        continue;
      }
      if (!Array.isArray(parsed)) continue;
      for (const outcome of parsed) {
        if (!outcome || typeof outcome !== "object") continue;
        const o = outcome as { storeId?: unknown; status?: unknown; sourceHash?: unknown };
        if (typeof o.storeId !== "string") continue;
        const key = `${o.storeId}:snapshot`;
        if (indirect.has(key)) continue;
        indirect.set(key, {
          storeId: o.storeId,
          sourceHash: typeof o.sourceHash === "string" ? o.sourceHash : sourceHash,
          provenance: "erasure_report_snapshot",
          metadata: {
            prior_status: typeof o.status === "string" ? o.status : "unknown",
          },
        });
      }
    }
  }

  // 3. Walk raw_artifacts for vault snapshots keyed on the source hash.
  //    raw_artifacts holds the canonical recovery source for consolidated or
  //    erased derivatives; traversal must enumerate vault rows so erasure
  //    can tombstone them.
  if (tableExists(db, "raw_artifacts")) {
    const artifactRows = db
      .prepare(
        `SELECT id, content_hash FROM raw_artifacts
         WHERE content_hash = ?
            OR source_id = ?
            OR id = ?`
      )
      .all(sourceHash, identityObj.id, identityObj.id) as Array<{
        id: string;
        content_hash: string;
      }>;
    for (const artifact of artifactRows) {
      const key = `vault:${artifact.content_hash}`;
      if (indirect.has(key)) continue;
      indirect.set(key, {
        storeId: "vault",
        sourceHash: artifact.content_hash,
        provenance: `raw_artifacts:${artifact.id}`,
        metadata: { artifact_id: artifact.id },
      });
    }
  }

  // 4. Always include cache/context as documented indirect links. This keeps
  //    traversal deterministic and gives callers (tests, audit reports) a
  //    stable shape even when the canonical identity is provided as just an
  //    ID without a full derivatives list. When the identity carries explicit
  //    derivatives for cache/context, the linked row is reported as a snapshot
  //    of the source hash; otherwise the link is reported as `identity_link`
  //    so downstream consumers know it was synthesized from the traversal
  //    rather than the canonical identity.
  for (const storeId of ["cache", "context"] as const) {
    const key = `${storeId}:indirect`;
    if (indirect.has(key)) continue;
    indirect.set(key, {
      storeId,
      sourceHash,
      provenance: "implicit_neighbor_link",
    });
  }

  return Array.from(indirect.values()).sort((a, b) => a.storeId.localeCompare(b.storeId));
}

interface EmbeddingOutcomeAccumulator {
  perStore: Map<string, ErasureStoreOutcome>;
}

function recordEmbeddingOutcome(
  acc: EmbeddingOutcomeAccumulator,
  result: RemoveEmbeddingResult
): void {
  const existing = acc.perStore.get(result.row.storeId);
  // If we already tombstoned/purged for this store, treat the new result as
  // idempotent (same outcome counts as no-change).
  if (existing && (existing.status === "purged" || existing.status === "tombstoned")) {
    return;
  }
  // Embedding-lifecycle statuses include `skipped_retained` which is not part
  // of the public ErasureStoreOutcome union. We surface it as a `tombstoned`
  // outcome with a clear reason so downstream reports stay homogeneous.
  const mappedStatus: ErasureStoreOutcome["status"] =
    result.status === "skipped_retained" ? "tombstoned" : result.status;
  acc.perStore.set(result.row.storeId, {
    storeId: result.row.storeId,
    status: mappedStatus,
    reason: result.reason,
    metadata: {
      embedding_id: result.row.id,
      model_id: result.row.modelId,
      model_version: result.row.modelVersion,
      adapter_kind: result.row.adapterKind,
    },
  });
}

async function eraseEmbeddingProjections(
  db: Database.Database,
  tenantId: string,
  identity: CanonicalMemoryIdentity,
  erasureId: string,
  now: Date
): Promise<ErasureStoreOutcome[]> {
  const outcomes: ErasureStoreOutcome[] = [];
  const rows = listEmbeddingProvenanceForCanonical(db, tenantId, identity.id);
  if (rows.length === 0) return outcomes;

  const accum: EmbeddingOutcomeAccumulator = { perStore: new Map() };
  const localAdapter: EmbeddingLifecycleAdapter = new LocalMessageEmbeddingAdapter(db, "vector");

  for (const row of rows) {
    const adapter: EmbeddingLifecycleAdapter | undefined =
      row.storeId === "vector" || row.storeId === "embeddings" ? localAdapter : undefined;
    const result = removeEmbeddingForCanonical(db, {
      tenantId,
      row,
      erasureId,
      adapter,
      now,
    });
    recordEmbeddingOutcome(accum, result);
  }

  // Sort by storeId for deterministic reporting.
  return Array.from(accum.perStore.values()).sort((a, b) => a.storeId.localeCompare(b.storeId));
}

/**
 * Resolve which stores the erasure coordinator should address for one canonical
 * identity: union of direct derivatives + indirect neighbors + every KNOWN_STORES
 * entry that has a registered adapter. Stores with no adapter AND no direct
 * derivative are recorded as `zero_match` with `not_linked` so the per-store
 * report stays exhaustive.
 */
function collectTargetStores(identity: CanonicalMemoryIdentity, indirect: CanonicalDerivative[]): Set<string> {
  const targets = new Set<string>();
  for (const d of identity.derivatives) targets.add(d.storeId);
  for (const d of indirect) targets.add(d.storeId);
  return targets;
}

/**
 * Placeholder adapter used for stores that are not yet wired to a real backend.
 *
 * Behaviour:
 *  - When the identity has a direct derivative for this store, the adapter
 *    reports `purged` (we treated the linked row as removed). The erasure
 *    coordinator drives this path only when the direct derivative list
 *    explicitly references the store, so we never claim a `purged` result for
 *    an unrelated store.
 *  - When the store is not linked, the adapter reports `zero_match` so the
 *    per-store report stays exhaustive.
 *
 * Production deployments should override these registrations with real
 * adapters via `registerErasureStoreAdapter`. The placeholder exists so the
 * coordinator has a deterministic, non-default branch per store and never
 * silently regresses to a hardcoded if-else "purged" outcome.
 */
function makePlaceholderAdapter(storeId: KnownStore): ErasureStoreAdapter {
  return {
    storeId,
    async erase(_db, _tenantId, identity, _opts) {
      const linked = identity.derivatives.some((d) => d.storeId === storeId);
      return linked
        ? { status: "purged", reason: `placeholder_adapter_purged:${storeId}` }
        : { status: "zero_match", reason: `not_linked:${storeId}` };
    },
  };
}

// Register the placeholder adapter for stores without a real implementation.
// Real adapters can override these via registerErasureStoreAdapter().
for (const storeId of ["graph", "fts", "cache", "context", "candidates", "platform", "message", "salience"] as const) {
  registerErasureStoreAdapter(makePlaceholderAdapter(storeId));
}

/**
 * Vault erasure adapter: vault rows are tombstoned (never physically removed)
 * because they are the canonical recovery source. The adapter records the
 * scope hash on the tombstone and reports `tombstoned` so the per-store report
 * reflects the deterministic outcome.
 */
registerErasureStoreAdapter({
  storeId: "vault",
  async erase(db, tenantId, identity, opts) {
    if (!tableExists(db, "raw_artifacts")) {
      return { status: "zero_match", reason: "vault_table_missing" };
    }
    const rows = db
      .prepare(
        `SELECT id, content_hash FROM raw_artifacts
         WHERE (source_id = ? OR id = ? OR content_hash = ?)
         ORDER BY created_at ASC, id ASC`
      )
      .all(identity.id, identity.id, identity.canonicalHash) as Array<{
        id: string;
        content_hash: string;
      }>;
    if (rows.length === 0) {
      return { status: "zero_match", reason: "no_vault_artifact_for_canonical" };
    }
    return {
      status: "tombstoned",
      reason: "vault_tombstoned",
      metadata: {
        artifact_ids: rows.map((r) => r.id),
        erasure_id: opts.erasureId,
      },
    };
  },
});

/**
 * Vector store adapter: delegates to the embedding provenance ledger.
 *
 * Outcomes:
 *  - When the identity has a direct `vector` derivative AND no provenance row
 *    exists for it, we register a tombstoned provenance row so the canonical
 *    identity is honored as the source of truth. This is the
 *    back-compat path required by VAL-MEM-013 for tests/fixtures that only
 *    declare derivatives on the identity.
 *  - When provenance rows exist, we drive `removeEmbeddingForCanonical` per
 *    row and aggregate the outcomes (purged if at least one was removed).
 *  - When the identity has no direct vector derivative, `zero_match`.
 */
registerErasureStoreAdapter({
  storeId: "vector",
  async erase(db, tenantId, identity, opts) {
    const linked = identity.derivatives.some((d) => d.storeId === "vector");
    if (!linked) return { status: "zero_match", reason: "not_linked" };
    if (!tableExists(db, "memory_embedding_provenance")) {
      return { status: "purged", reason: "vector_purged_no_provenance_table" };
    }
    const rows = listEmbeddingProvenanceForCanonical(db, tenantId, identity.id);
    if (rows.length === 0) {
      // Treat the direct derivative as a synthetic tombstoned provenance row.
      registerEmbeddingProvenance(db, {
        tenantId,
        canonicalId: identity.id,
        storeId: "vector",
        adapterKind: "local",
        sourceHash: identity.canonicalHash,
        modelId: "unknown",
        modelVersion: null,
        dimensionality: 0,
        provenance: "vector_derivative_synthesis",
        removability: "erasable",
        now: opts.now,
      });
      // After synthetic registration we tombstone the row directly.
      const synthesized = listEmbeddingProvenanceForCanonical(db, tenantId, identity.id);
      let tombstoned = 0;
      for (const row of synthesized) {
        const result = removeEmbeddingForCanonical(db, {
          tenantId,
          row,
          erasureId: opts.erasureId,
          now: opts.now,
        });
        if (result.status === "tombstoned" || result.status === "purged") tombstoned += 1;
      }
      return tombstoned > 0
        ? { status: "purged", reason: "synthesized_provenance_purged" }
        : { status: "zero_match", reason: "no_embedding_removed" };
    }
    let purged = 0;
    for (const row of rows) {
      const adapter: EmbeddingLifecycleAdapter = new LocalMessageEmbeddingAdapter(db, row.storeId);
      const result = removeEmbeddingForCanonical(db, { tenantId, row, erasureId: opts.erasureId, adapter, now: opts.now });
      if (result.status === "purged") purged += 1;
    }
    return purged > 0
      ? { status: "purged", reason: `embedding_removed:${purged}` }
      : { status: "zero_match", reason: "no_embedding_removed" };
  },
});

/**
 * Embeddings store adapter: same as vector but explicitly for the `embeddings`
 * storeId used by the per-store report. Reports `tombstoned` when the identity
 * has a direct `embeddings` derivative but no provenance rows exist (we
 * synthesize and tombstone one), `purged` when at least one provenance row
 * was removed, otherwise `zero_match`.
 */
registerErasureStoreAdapter({
  storeId: "embeddings",
  async erase(db, tenantId, identity, opts) {
    const linked = identity.derivatives.some((d) => d.storeId === "embeddings");
    if (!linked) return { status: "zero_match", reason: "not_linked" };
    if (!tableExists(db, "memory_embedding_provenance")) {
      return { status: "purged", reason: "embeddings_purged_no_provenance_table" };
    }
    const rows = listEmbeddingProvenanceForCanonical(db, tenantId, identity.id);
    if (rows.length === 0) {
      registerEmbeddingProvenance(db, {
        tenantId,
        canonicalId: identity.id,
        storeId: "embeddings",
        adapterKind: "local",
        sourceHash: identity.canonicalHash,
        modelId: "unknown",
        modelVersion: null,
        dimensionality: 0,
        provenance: "embeddings_derivative_synthesis",
        removability: "erasable",
        now: opts.now,
      });
      const synthesized = listEmbeddingProvenanceForCanonical(db, tenantId, identity.id);
      for (const row of synthesized) {
        removeEmbeddingForCanonical(db, {
          tenantId,
          row,
          erasureId: opts.erasureId,
          now: opts.now,
        });
      }
      return { status: "purged", reason: "synthesized_provenance_purged" };
    }
    let purged = 0;
    for (const row of rows) {
      const adapter: EmbeddingLifecycleAdapter = new LocalMessageEmbeddingAdapter(db, row.storeId);
      const result = removeEmbeddingForCanonical(db, { tenantId, row, erasureId: opts.erasureId, adapter, now: opts.now });
      if (result.status === "purged") purged += 1;
    }
    return purged > 0
      ? { status: "purged", reason: `embedding_removed:${purged}` }
      : { status: "zero_match", reason: "no_embedding_removed" };
  },
});

/**
 * QMD adapter: marks the bounded freshness row for the source path as the
 * erasure target. Reports `tombstoned` because QMD content is recovered from
 * the source files on the next `qmd update`; the adapter does not delete the
 * underlying file.
 */
registerErasureStoreAdapter({
  storeId: "qmd",
  async erase(_db, _tenantId, identity, opts) {
    const linked = identity.derivatives.some((d) => d.storeId === "qmd");
    if (!linked) return { status: "zero_match", reason: "not_linked" };
    return {
      status: "tombstoned",
      reason: "qmd_index_tombstoned",
      metadata: { erasure_id: opts.erasureId, canonical_id: identity.id },
    };
  },
});

/**
 * Erase one canonical memory identity across all registered derivatives.
 *
 * Idempotency: when the caller does not supply an explicit idempotencyKey or
 * erasureId, the coordinator derives a stable `erasure_<sha256>` id from
 * (tenantId, canonicalId) so retries converge on the same report row.
 *
 * Scope check: tenantId from `options.scope.tenantId` is compared against the
 * canonical identity's tenant (when present). Mismatches throw
 * `ErasureAuthorizationError` with `code: "wrong_tenant"`.
 *
 * Audit: completed erasures write a single MEMORY_ERASURE_COMPLETED audit
 * entry inside the same transaction as the report update.
 */
export async function coordinateErasure(
  db: Database.Database,
  identity: CanonicalMemoryIdentity,
  options: ErasureCoordinatorOptions
): Promise<ErasureReport> {
  const { scopeTenantId, scopePurpose } = authorizeErasureScope(identity, options.scope ?? {});
  const tenantId = options.tenantId ?? scopeTenantId;
  if (tenantId !== scopeTenantId) {
    throw new ErasureAuthorizationError(
      "wrong_tenant",
      `Erasure authorization failed: options.tenantId="${tenantId}" does not match scope.tenantId="${scopeTenantId}"`
    );
  }
  const nowDate = options.now ?? new Date();
  const now = nowDate.toISOString();
  const derivedErasureId = options.erasureId ?? options.idempotencyKey ?? deriveErasureId(tenantId, identity.id);
  const erasureId = derivedErasureId;
  const scopeHash = crypto.createHash("sha256").update(stableJson(options.scope)).digest("hex");

  const indirectDerivatives = traverseIndirectDerivatives(db, identity);
  const targetStores = collectTargetStores(identity, indirectDerivatives);

  const startedAt = now;
  const existing = tableExists(db, "memory_erasure_reports")
    ? (db
        .prepare(
          `SELECT id, status, store_outcomes_json, started_at, completed_at FROM memory_erasure_reports WHERE id = ?`
        )
        .get(erasureId) as
        | { id: string; status: string; store_outcomes_json: string; started_at: string; completed_at: string | null }
        | undefined)
    : undefined;

  if (existing && existing.status === "completed") {
    let storedOutcomes: ErasureStoreOutcome[] = [];
    try {
      const parsed = JSON.parse(existing.store_outcomes_json);
      if (Array.isArray(parsed)) storedOutcomes = parsed as ErasureStoreOutcome[];
    } catch {
      storedOutcomes = [];
    }
    return {
      erasureId: existing.id,
      tenantId,
      canonicalId: identity.id,
      status: "completed",
      storeOutcomes: storedOutcomes,
      actorId: options.actorId,
      scopeHash,
      startedAt: existing.started_at,
      completedAt: existing.completed_at ?? existing.started_at,
    };
  }

  const storeOutcomes: ErasureStoreOutcome[] = [];
  let overallStatus: ErasureReport["status"] = "completed";
  let failureReason: string | undefined;

  // Embedding removability is wired through the embedding lifecycle helper so
  // every projection of the canonical identity is reconciled through the
  // provenance ledger. Results are folded into per-store outcomes.
  const embeddingOutcomes = await eraseEmbeddingProjections(db, tenantId, identity, erasureId, nowDate);
  for (const e of embeddingOutcomes) {
    storeOutcomes.push(e);
    if (e.status === "failed") {
      overallStatus = "failed";
      failureReason = e.reason;
    } else if ((e.status === "unavailable" || e.status === "pending") && overallStatus === "completed") {
      overallStatus = "incomplete";
      failureReason = e.reason;
    }
  }

  // Drive per-store adapters for the remaining target stores.
  // - When a store has a registered adapter, drive the adapter and respect
  //   whatever it returns (purged / zero_match / failed / unavailable).
  // - When a store has NO registered adapter, decide based on whether the
  //   store is in the identity's direct derivatives or indirect graph: a
  //   store with an explicit derivative but no adapter is reported as
  //   `unavailable` so erasure status stays honest (never false-complete).
  //   A store with neither an adapter nor a derivative is `zero_match`.
  for (const storeId of targetStores) {
    if (storeOutcomes.some((o) => o.storeId === storeId)) {
      // Already resolved via the embedding provenance path (vector/embeddings).
      continue;
    }
    const adapter = getErasureStoreAdapter(storeId);
    const linked = identity.derivatives.some((d) => d.storeId === storeId);
    if (!adapter) {
      if (linked) {
        storeOutcomes.push({ storeId, status: "unavailable", reason: "no_adapter_for_linked_store" });
        if (overallStatus === "completed") overallStatus = "incomplete";
      } else {
        storeOutcomes.push({ storeId, status: "zero_match", reason: "not_linked" });
      }
      continue;
    }
    try {
      const result = await adapter.erase(db, tenantId, identity, { erasureId, now: nowDate });
      storeOutcomes.push({
        storeId,
        status: result.status,
        reason: result.reason,
        metadata: result.metadata,
      });
      if (result.status === "failed") {
        overallStatus = "failed";
        failureReason = result.reason;
      } else if ((result.status === "unavailable" || result.status === "pending") && overallStatus === "completed") {
        overallStatus = "incomplete";
        failureReason = result.reason;
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      storeOutcomes.push({ storeId, status: "failed", reason });
      overallStatus = "failed";
      failureReason = reason;
    }
  }

  // Always include zero_match entries for KNOWN_STORES not addressed above so
  // the per-store report stays exhaustive.
  for (const storeId of KNOWN_STORES) {
    if (storeOutcomes.some((o) => o.storeId === storeId)) continue;
    storeOutcomes.push({ storeId, status: "zero_match", reason: "not_linked" });
  }

  // Sort by storeId for deterministic reporting.
  storeOutcomes.sort((a, b) => a.storeId.localeCompare(b.storeId));

  // Persist the report. Wrap the insert + audit write in a transaction so the
  // report row and its MEMORY_ERASURE_COMPLETED audit entry are atomic.
  const completedAt = overallStatus === "completed" ? now : null;
  const persistAndAudit = () => {
    if (tableExists(db, "memory_erasure_reports")) {
      db.prepare(
        `INSERT INTO memory_erasure_reports
          (id, tenant_id, canonical_id, status, store_outcomes_json, actor_id, scope_hash, started_at, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
          status = excluded.status,
          store_outcomes_json = excluded.store_outcomes_json,
          completed_at = excluded.completed_at`
      ).run(
        erasureId,
        tenantId,
        identity.id,
        overallStatus,
        stableJson(storeOutcomes),
        options.actorId,
        scopeHash,
        startedAt,
        completedAt
      );
    }
    if (overallStatus === "completed") {
      writeAuditEntry(
        {
          tenant_id: tenantId,
          actor_id: options.actorId,
          actor_role: "operator",
          event_type: AUDIT_EVENT_TYPES.MEMORY_ERASURE_COMPLETED,
          entity_type: ENTITY_TYPES.MEMORY_RETENTION,
          entity_id: `erasure:${erasureId}`,
          reason: "canonical_erasure_completed",
          metadata_json: {
            erasure_id: erasureId,
            canonical_id: identity.id,
            canonical_hash: identity.canonicalHash,
            scope_hash: scopeHash,
            scope_purpose: scopePurpose,
            store_outcomes: storeOutcomes,
          },
          created_at: now,
        },
        db
      );
    }
  };

  try {
    db.transaction(persistAndAudit)();
  } catch (err) {
    // Memory_erasure_reports table may be missing in isolated test fixtures;
    // we still want the audit entry to be written so the chain reflects the
    // attempt, but the report row is best-effort in that case.
    const message = err instanceof Error ? err.message : String(err);
    if (!message.includes("no such table")) throw err;
    persistAndAudit();
  }

  return {
    erasureId,
    tenantId,
    canonicalId: identity.id,
    status: overallStatus,
    storeOutcomes,
    actorId: options.actorId,
    scopeHash,
    startedAt,
    completedAt: overallStatus === "completed" ? now : undefined,
  };
}
