---
phase: 23
status: issues-found
critical: 0
high: 0
medium: 1
low: 1
reviewed_at: 2026-04-18T00:00:00Z
---

# Code Review — Phase 23: memory-intelligence

## Summary

13 files reviewed covering the memory intelligence backend (consolidation engine, decay engine, 3 API routes, instrumentation scheduler) and the dashboard UI panels wiring them into the Kitchen Floor and Ledger pages. Code is well-structured with deliberate security mitigations (allowlist validation, parameterized queries, input clamping). One inconsistency in error handling between the two schedulers warrants attention.

## Findings

### CRITICAL

None

### HIGH

None

### MEDIUM

**M-01: Decay scheduler does not wrap `runDecay()` calls in try/catch**

**File:** `src/lib/memory-decay.ts:78-79`

The `startDecayScheduler()` function calls `runDecay()` synchronously at startup and passes it bare into `setInterval` with no error handling:

```ts
runDecay();
setInterval(runDecay, 60 * 60 * 1000);
```

If `runDecay()` throws (DB locked, `memory_salience` table missing on first boot before schema migration completes, connection error), the exception propagates unhandled into the Node.js event loop. Depending on the global uncaught exception handler, this can crash the process.

Compare to the consolidation scheduler in `memory-consolidation.ts:126-129`, which handles this correctly:

```ts
runConsolidation().catch(console.error);
setInterval(() => {
  runConsolidation().catch(console.error);
}, 15 * 60 * 1000);
```

**Fix:** Apply the same pattern to the decay scheduler:

```ts
export function startDecayScheduler(): void {
  if (_started) return;
  _started = true;
  console.log('[decay] scheduler started (interval: 60m)');
  try { runDecay(); } catch (err) { console.error('[decay] initial run failed:', err); }
  setInterval(() => {
    try { runDecay(); } catch (err) { console.error('[decay] run failed:', err); }
  }, 60 * 60 * 1000);
}
```

### LOW

**L-01: `lastInsertRowid` cast to `number` loses bigint safety**

**File:** `src/lib/memory-consolidation.ts:36`

```ts
const runId = db
  .prepare('INSERT INTO memory_consolidation_runs(batch_size) VALUES(0)')
  .run().lastInsertRowid as number;
```

`better-sqlite3` types `lastInsertRowid` as `number | bigint`. The cast to `number` is safe in practice for a low-cardinality audit table (row counts will never reach `Number.MAX_SAFE_INTEGER`), but it silently discards the bigint case. If this table ever grows very large or the DB is pre-populated with large IDs, `runId` could be corrupted.

**Fix:** Either assert the safe range explicitly or use `Number(...)` with a guard:

```ts
const raw = db.prepare('INSERT INTO memory_consolidation_runs(batch_size) VALUES(0)').run().lastInsertRowid;
const runId = typeof raw === 'bigint' ? Number(raw) : raw;
```

## Files Reviewed

- src/app/api/agent-peers/route.ts
- src/app/api/memory-consolidate/route.ts
- src/app/api/memory-stats/route.ts
- src/app/api/recall/route.ts
- src/app/ledger/page.tsx
- src/app/page.tsx
- src/components/kitchen/agent-peers-panel.tsx
- src/components/ledger/memory-intelligence-panel.tsx
- src/lib/api-client.ts
- src/lib/db-ingest.ts
- src/lib/memory-consolidation.ts
- src/lib/memory-decay.ts
- src/instrumentation.ts
