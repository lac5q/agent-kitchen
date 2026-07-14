You are a WORKER on the memroos repo. Branch: v8.4-project-centric-operator-ux (already checked out; edit the working tree in place, do NOT switch branches, do NOT commit). CWD: /Users/lcalderon/github/memroos.

# TASK: Implement Phase 140 - Per-Space Cache + Invalidation Surface (CACHEADMIN-01..05)

## HARD CONSTRAINT
Do NOT modify `authorizeMemoryUse`, `checkDispatchPolicy`, `checkA2aSendPolicy`, `checkMemoryWritePolicy` internals. Do NOT edit `security-regression.test.ts`. Do NOT break existing tests. Do NOT commit or change git branch. Do NOT add any npm dependency.

## EXISTING SURFACES (read them first)
- `apps/memroos/src/lib/space.ts` — READ. Space interface, createSpace.
- `apps/memroos/src/lib/db-schema.ts` — READ. Current schema version is 8. Look at migration patterns.
- `apps/memroos/src/lib/shared-space.ts` — READ. isSpaceShared function (needed for CACHEADMIN-03).
- `apps/memroos/src/lib/workspace.ts` — READ for audit_entries INSERT patterns.
- `apps/memroos/src/lib/__tests__/workspace.test.ts` — READ for test patterns.

## FILES TO CREATE/MODIFY

### 1. apps/memroos/src/lib/db-schema.ts — MODIFY
Add a v9 schema migration. Bump CURRENT_SCHEMA_VERSION to 9. Add migration entry to SCHEMA_MIGRATIONS. Add function `applySpaceCacheSchema(db)`:

```sql
CREATE TABLE IF NOT EXISTS space_cache_state (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  space_id      TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  resource_id   TEXT NOT NULL,
  last_fetched  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  cached_size   INTEGER NOT NULL DEFAULT 0,
  retrieval_count INTEGER NOT NULL DEFAULT 0,
  invalidated_at TEXT,
  UNIQUE(space_id, resource_id)
);
CREATE INDEX IF NOT EXISTS space_cache_state_space ON space_cache_state(space_id);
```

Follow the exact pattern of existing migrations.

### 2. apps/memroos/src/lib/space-cache.ts — NEW

Follow the same code style as workspace.ts, write-rules.ts, and shared-space.ts (parameterized SQL, function-name-prefixed errors, best-effort audit_entries INSERTs).

**Interfaces:**
```ts
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
```

**Functions:**

1. `recordCacheFetch(db, input: { spaceId: string; resourceId: string; cachedSize?: number }): void` — Upsert into space_cache_state. If row exists, update last_fetched, cached_size, increment retrieval_count. If not, insert new row with retrieval_count=1.

2. `getCacheState(db, spaceId: string): CacheStateSummary` — CACHEADMIN-01. Query all space_cache_state rows for the space. Return summary with totalResources, totalCachedSize (SUM), totalRetrievals (SUM), and entries array.

3. `invalidateResource(db, input: { spaceId: string; resourceId: string; actorId: string; reason?: string }): void` — CACHEADMIN-02 + CACHEADMIN-03 + CACHEADMIN-04.
   - Check isSpaceShared (import from shared-space.ts). If shared, require reason='invalidate-from-source' — throw if different reason.
   - Coalescing: check if invalidated_at within last 5 seconds for this resource. If so, write audit event_type='cache.coalesced' and return (no-op).
   - Rate limiting: count cache.invalidated audit entries for this resource in last 60 seconds. If >= 5, write audit event_type='cache.rate_limit' and throw Error("cache invalidation rate limit exceeded for resource (CACHEADMIN-04)").
   - UPDATE space_cache_state SET invalidated_at = current timestamp WHERE space_id = ? AND resource_id = ?.
   - Write audit_entries with event_type='cache.invalidated', entity_type='cache', entity_id=`cache:${spaceId}:${resourceId}`, metadata_json with { spaceId, resourceId, actorId, reason, scope: 'resource', actionType: 'cache.invalidated' }.

4. `invalidateSpace(db, input: { spaceId: string; actorId: string; reason?: string }): void` — CACHEADMIN-02 + CACHEADMIN-03 + CACHEADMIN-04.
   - Check isSpaceShared. If shared, require reason='invalidate-from-source'.
   - Rate limiting: count cache.invalidated audit entries for this space (scope='space') in last 60 seconds. If >= 3, write audit event_type='cache.rate_limit' and throw.
   - UPDATE space_cache_state SET invalidated_at = current timestamp WHERE space_id = ?.
   - Write audit_entries with event_type='cache.invalidated', entity_type='cache', entity_id=`cache:${spaceId}`, metadata_json with { spaceId, resourceId: null, actorId, reason, scope: 'space', actionType: 'cache.invalidated' }.

5. `getInvalidationHistory(db, spaceId: string): Array<{ actorId: string; resourceId: string | null; reason: string | null; timestamp: string }>` — CACHEADMIN-05. Query audit_entries WHERE event_type='cache.invalidated' AND entity_id LIKE `cache:${spaceId}%`. Parse metadata_json. Return array sorted by created_at DESC.

IMPORTANT: Use the same audit_entries INSERT pattern as workspace.ts. Import `isSpaceShared` from `@/lib/shared-space`.

### 3. apps/memroos/src/lib/__tests__/space-cache.test.ts — NEW

Follow the test pattern from workspace.test.ts. At minimum 12 tests:
1. recordCacheFetch creates a new cache entry
2. recordCacheFetch updates existing entry and increments retrieval_count
3. getCacheState returns summary with correct totals
4. invalidateResource sets invalidated_at and writes audit entry
5. invalidateSpace invalidates all resources and writes audit entry
6. Shared space invalidation requires 'invalidate-from-source' reason
7. Shared space invalidation throws with wrong reason
8. Rate limiting: >5 resource invalidations in 60s throws (you may need to mock timestamps or insert audit entries directly to simulate prior invalidations)
9. Coalescing: second invalidation within 5s is a no-op (writes coalesced audit)
10. getInvalidationHistory returns entries with correct metadata
11. getCacheState returns empty summary for space with no cache entries
12. invalidateResource on non-existent resource is a no-op (or creates nothing)

For rate-limit tests: to simulate prior invalidations, insert audit_entries directly with event_type='cache.invalidated' and timestamps in the past, then call invalidateResource and verify it throws.

Setup: create in-memory DB, initSchema, create a space, add cache entries via recordCacheFetch, then test.

## DO NOT
- Do NOT edit `security-regression.test.ts` or the wrapped function internals.
- Do NOT add any npm dependency.
- Do NOT commit or change git branch.
- Do NOT add "droid" as a platform or modify agent registration routes/types/forms.

## VERIFY BEFORE YOU FINISH (run these, paste output)
```
cd /Users/lcalderon/github/memroos/apps/memroos && npx vitest run src/lib/__tests__/space-cache.test.ts src/lib/policy src/lib/memory/__tests__/security-regression.test.ts src/lib/__tests__/workspace.test.ts src/lib/__tests__/write-rules.test.ts src/lib/__tests__/shared-space.test.ts 2>&1 | tail -25
cd /Users/lcalderon/github/memroos/apps/memroos && npx tsc --noEmit 2>&1 | grep -E "src/lib/space-cache" | head -10; echo "CACHEADMIN-TSC-DONE"
```
All space-cache tests + policy + MEMSEC-08 + workspace + write-rules + shared-space tests MUST pass, zero tsc errors under src/lib/space-cache. Then STOP and report.
