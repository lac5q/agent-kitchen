/**
 * Phase 140 / CACHEADMIN-01..05: per-space cache + invalidation surface.
 *
 * Tracks per-resource cache state for each space and records invalidation
 * events in audit_entries for operator visibility.
 */

import type Database from "better-sqlite3";
import { isSpaceShared } from "@/lib/shared-space";

export interface CacheStateEntry {
  resourceId: string;
  lastFetched: string;
  cachedSize: number;
  retrievalCount: number;
  invalidatedAt: string | null;
}

export interface CacheStateSummary {
  totalResources: number;
  totalCachedSize: number;
  totalRetrievals: number;
  entries: CacheStateEntry[];
}

function nowIso(): string {
  return new Date().toISOString();
}

function auditId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function writeCacheAudit(
  db: Database.Database,
  input: {
    actorId: string;
    eventType: string;
    entityId: string;
    reason: string;
    metadata: Record<string, unknown>;
    timestamp: string;
  },
): void {
  db.prepare(
    `INSERT INTO audit_entries
       (id, tenant_id, actor_id, actor_role, event_type, entity_type, entity_id, reason, metadata_json, created_at)
     VALUES (?, 'default-tenant', ?, 'operator', ?, 'cache', ?, ?, ?, ?)`,
  ).run(
    auditId("cac"),
    input.actorId,
    input.eventType,
    input.entityId,
    input.reason,
    JSON.stringify(input.metadata),
    input.timestamp,
  );
}

function requireWritableSpace(db: Database.Database, spaceId: string): void {
  const exists = db
    .prepare("SELECT 1 AS one FROM spaces WHERE id = ?")
    .get(spaceId) as { one: number } | undefined;
  if (!exists) {
    throw new Error(`space-cache: space '${spaceId}' not found`);
  }
}

function validateSharedSpaceReason(
  db: Database.Database,
  spaceId: string,
  reason: string | undefined,
): void {
  if (!isSpaceShared(db, spaceId)) return;
  if (reason === "invalidate-from-source") return;
  throw new Error(
    "shared space cache invalidation requires reason='invalidate-from-source' (CACHEADMIN-03)",
  );
}

function countResourceInvalidations(
  db: Database.Database,
  spaceId: string,
  resourceId: string,
  since: string,
): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n
         FROM audit_entries
        WHERE event_type = 'cache.invalidated'
          AND entity_id = ?
          AND created_at > ?`,
    )
    .get(`cache:${spaceId}:${resourceId}`, since) as { n: number } | undefined;
  return row?.n ?? 0;
}

function countSpaceInvalidations(
  db: Database.Database,
  spaceId: string,
  since: string,
): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n
         FROM audit_entries
        WHERE event_type = 'cache.invalidated'
          AND entity_id = ?
          AND created_at > ?`,
    )
    .get(`cache:${spaceId}`, since) as { n: number } | undefined;
  return row?.n ?? 0;
}

function getRecentInvalidatedAt(
  db: Database.Database,
  spaceId: string,
  resourceId: string,
): string | null {
  const row = db
    .prepare(
      `SELECT invalidated_at
         FROM space_cache_state
        WHERE space_id = ?
          AND resource_id = ?
          AND invalidated_at IS NOT NULL
        ORDER BY invalidated_at DESC
        LIMIT 1`,
    )
    .get(spaceId, resourceId) as { invalidated_at: string } | undefined;
  return row ? row.invalidated_at : null;
}

function isoSecondsAgo(seconds: number): string {
  return new Date(Date.now() - seconds * 1000).toISOString();
}

/**
 * CACHEADMIN-01: upsert a cache fetch into space_cache_state.
 *
 * If the resource has already been recorded for this space, updates the
 * last_fetched timestamp and cached_size, and increments retrieval_count.
 * Otherwise inserts a new row with retrieval_count = 1.
 */
export function recordCacheFetch(
  db: Database.Database,
  input: {
    spaceId: string;
    resourceId: string;
    cachedSize?: number;
  },
): void {
  const spaceId = (input.spaceId || "").trim();
  const resourceId = (input.resourceId || "").trim();
  if (!spaceId) throw new Error("recordCacheFetch: spaceId is required");
  if (!resourceId) throw new Error("recordCacheFetch: resourceId is required");
  const cachedSize = input.cachedSize ?? 0;

  requireWritableSpace(db, spaceId);

  const existing = db
    .prepare(
      `SELECT id FROM space_cache_state WHERE space_id = ? AND resource_id = ?`,
    )
    .get(spaceId, resourceId) as { id: number } | undefined;

  const now = nowIso();
  if (existing) {
    db.prepare(
      `UPDATE space_cache_state
          SET last_fetched = ?,
              cached_size = ?,
              retrieval_count = retrieval_count + 1
        WHERE space_id = ?
          AND resource_id = ?`,
    ).run(now, cachedSize, spaceId, resourceId);
  } else {
    db.prepare(
      `INSERT INTO space_cache_state
         (space_id, resource_id, last_fetched, cached_size, retrieval_count)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(spaceId, resourceId, now, cachedSize, 1);
  }
}

/**
 * CACHEADMIN-01: return the current cache state for a space.
 */
export function getCacheState(
  db: Database.Database,
  spaceId: string,
): CacheStateSummary {
  const sid = (spaceId || "").trim();
  if (!sid) {
    return { totalResources: 0, totalCachedSize: 0, totalRetrievals: 0, entries: [] };
  }

  const rows = db
    .prepare(
      `SELECT resource_id, last_fetched, cached_size, retrieval_count, invalidated_at
         FROM space_cache_state
        WHERE space_id = ?
        ORDER BY resource_id ASC`,
    )
    .all(sid) as Array<{
      resource_id: string;
      last_fetched: string;
      cached_size: number;
      retrieval_count: number;
      invalidated_at: string | null;
    }>;

  const entries: CacheStateEntry[] = rows.map((row) => ({
    resourceId: row.resource_id,
    lastFetched: row.last_fetched,
    cachedSize: row.cached_size,
    retrievalCount: row.retrieval_count,
    invalidatedAt: row.invalidated_at,
  }));

  const totalResources = entries.length;
  const totalCachedSize = entries.reduce((sum, e) => sum + e.cachedSize, 0);
  const totalRetrievals = entries.reduce((sum, e) => sum + e.retrievalCount, 0);

  return { totalResources, totalCachedSize, totalRetrievals, entries };
}

/**
 * CACHEADMIN-02 + CACHEADMIN-03 + CACHEADMIN-04: invalidate a single cached resource.
 *
 * Enforces shared-space reason gating, 5-second coalescing, and a per-resource
 * rate limit of 5 invalidations per 60 seconds.
 */
export function invalidateResource(
  db: Database.Database,
  input: {
    spaceId: string;
    resourceId: string;
    actorId: string;
    reason?: string;
  },
): void {
  const spaceId = (input.spaceId || "").trim();
  const resourceId = (input.resourceId || "").trim();
  const actorId = (input.actorId || "").trim();
  if (!spaceId) throw new Error("invalidateResource: spaceId is required");
  if (!resourceId) throw new Error("invalidateResource: resourceId is required");
  if (!actorId) throw new Error("invalidateResource: actorId is required");

  requireWritableSpace(db, spaceId);
  validateSharedSpaceReason(db, spaceId, input.reason);

  const now = nowIso();

  // Coalescing: repeated invalidations within 5 seconds are collapsed.
  const lastInvalidated = getRecentInvalidatedAt(db, spaceId, resourceId);
  if (lastInvalidated && new Date(lastInvalidated) > new Date(Date.now() - 5000)) {
    writeCacheAudit(db, {
      actorId,
      eventType: "cache.coalesced",
      entityId: `cache:${spaceId}:${resourceId}`,
      reason: `coalesced invalidation for resource '${resourceId}'`,
      metadata: {
        spaceId,
        resourceId,
        actorId,
        reason: input.reason ?? null,
        scope: "resource",
        actionType: "cache.coalesced",
      },
      timestamp: now,
    });
    return;
  }

  // Rate limiting: 5 invalidations per resource per 60 seconds.
  const since = isoSecondsAgo(60);
  if (countResourceInvalidations(db, spaceId, resourceId, since) >= 5) {
    writeCacheAudit(db, {
      actorId,
      eventType: "cache.rate_limit",
      entityId: `cache:${spaceId}:${resourceId}`,
      reason: `cache invalidation rate limit exceeded for resource '${resourceId}'`,
      metadata: {
        spaceId,
        resourceId,
        actorId,
        reason: input.reason ?? null,
        scope: "resource",
        actionType: "cache.rate_limit",
      },
      timestamp: now,
    });
    throw new Error(
      "cache invalidation rate limit exceeded for resource (CACHEADMIN-04)",
    );
  }

  db.prepare(
    `UPDATE space_cache_state
        SET invalidated_at = ?
      WHERE space_id = ?
        AND resource_id = ?`,
  ).run(now, spaceId, resourceId);

  writeCacheAudit(db, {
    actorId,
    eventType: "cache.invalidated",
    entityId: `cache:${spaceId}:${resourceId}`,
    reason: `invalidated cache for resource '${resourceId}'`,
    metadata: {
      spaceId,
      resourceId,
      actorId,
      reason: input.reason ?? null,
      scope: "resource",
      actionType: "cache.invalidated",
    },
    timestamp: now,
  });
}

/**
 * CACHEADMIN-02 + CACHEADMIN-03 + CACHEADMIN-04: invalidate all cached resources in a space.
 *
 * Enforces shared-space reason gating and a per-space rate limit of 3
 * invalidations per 60 seconds.
 */
export function invalidateSpace(
  db: Database.Database,
  input: {
    spaceId: string;
    actorId: string;
    reason?: string;
  },
): void {
  const spaceId = (input.spaceId || "").trim();
  const actorId = (input.actorId || "").trim();
  if (!spaceId) throw new Error("invalidateSpace: spaceId is required");
  if (!actorId) throw new Error("invalidateSpace: actorId is required");

  requireWritableSpace(db, spaceId);
  validateSharedSpaceReason(db, spaceId, input.reason);

  const now = nowIso();

  // Rate limiting: 3 space-wide invalidations per 60 seconds.
  const since = isoSecondsAgo(60);
  if (countSpaceInvalidations(db, spaceId, since) >= 3) {
    writeCacheAudit(db, {
      actorId,
      eventType: "cache.rate_limit",
      entityId: `cache:${spaceId}`,
      reason: `cache invalidation rate limit exceeded for space '${spaceId}'`,
      metadata: {
        spaceId,
        resourceId: null,
        actorId,
        reason: input.reason ?? null,
        scope: "space",
        actionType: "cache.rate_limit",
      },
      timestamp: now,
    });
    throw new Error(
      "cache invalidation rate limit exceeded for space (CACHEADMIN-04)",
    );
  }

  db.prepare(
    `UPDATE space_cache_state
        SET invalidated_at = ?
      WHERE space_id = ?`,
  ).run(now, spaceId);

  writeCacheAudit(db, {
    actorId,
    eventType: "cache.invalidated",
    entityId: `cache:${spaceId}`,
    reason: `invalidated all cache resources in space '${spaceId}'`,
    metadata: {
      spaceId,
      resourceId: null,
      actorId,
      reason: input.reason ?? null,
      scope: "space",
      actionType: "cache.invalidated",
    },
    timestamp: now,
  });
}

/**
 * CACHEADMIN-05: return the invalidation history for a space.
 *
 * Parses audit_entries rows with event_type='cache.invalidated' and an entity_id
 * matching 'cache:SPACEID*'. Results are sorted newest-first.
 */
export function getInvalidationHistory(
  db: Database.Database,
  spaceId: string,
): Array<{
  actorId: string;
  resourceId: string | null;
  reason: string | null;
  timestamp: string;
}> {
  const sid = (spaceId || "").trim();
  if (!sid) return [];

  const rows = db
    .prepare(
      `SELECT actor_id, metadata_json, created_at
         FROM audit_entries
        WHERE event_type = 'cache.invalidated'
          AND entity_id LIKE ?
        ORDER BY created_at DESC`,
    )
    .all(`cache:${sid}%`) as Array<{
      actor_id: string;
      metadata_json: string;
      created_at: string;
    }>;

  const out: Array<{
    actorId: string;
    resourceId: string | null;
    reason: string | null;
    timestamp: string;
  }> = [];
  for (const row of rows) {
    let resourceId: string | null = null;
    let reason: string | null = null;
    try {
      const meta = JSON.parse(row.metadata_json);
      if (typeof meta.resourceId === "string") resourceId = meta.resourceId;
      else if (meta.resourceId === null) resourceId = null;
      if (typeof meta.reason === "string") reason = meta.reason;
      else if (meta.reason === null) reason = null;
    } catch {
      // Corrupt metadata — skip parsing, keep defaults.
    }
    out.push({
      actorId: row.actor_id,
      resourceId,
      reason,
      timestamp: row.created_at,
    });
  }
  return out;
}
