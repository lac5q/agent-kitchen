---
phase: 23-memory-intelligence
plan: "01"
subsystem: memory-intelligence-backend
tags: [sqlite, llm, consolidation, salience-decay, api-routes, tdd]
dependency_graph:
  requires: [db-schema, db-ingest, hive_actions]
  provides: [memory_salience, memory_consolidation_runs, memory_meta_insights, /api/memory-stats, /api/agent-peers, /api/memory-consolidate, recall-access-count]
  affects: [recall-route, db-schema, instrumentation]
tech_stack:
  added: ["@anthropic-ai/sdk ^0.90.0"]
  patterns: [instrumentation-scheduler, tdd-red-green, sqlite-additive-migration, LOG-probe-fallback]
key_files:
  created:
    - src/lib/memory-consolidation.ts
    - src/lib/memory-decay.ts
    - src/instrumentation.ts
    - src/app/api/memory-stats/route.ts
    - src/app/api/agent-peers/route.ts
    - src/app/api/memory-consolidate/route.ts
    - src/lib/__tests__/memory-consolidation.test.ts
    - src/lib/__tests__/memory-decay.test.ts
    - src/app/api/memory-stats/__tests__/route.test.ts
    - src/app/api/agent-peers/__tests__/route.test.ts
  modified:
    - src/lib/db-schema.ts
    - src/lib/db-ingest.ts
    - src/app/api/recall/route.ts
    - .env.example
    - package.json
decisions:
  - "Use strftime ISO format in agent-peers window comparison to match stored ISO timestamps"
  - "Use proper class constructor for @anthropic-ai/sdk mock (vi.fn arrow functions are not constructable)"
  - "insight_type validated against allowlist before INSERT into memory_meta_insights (T-23-06)"
  - "recall access_count UPDATE is fire-and-forget in try/catch for backward compatibility"
metrics:
  duration: "9m"
  completed_date: "2026-04-18"
  tasks_completed: 3
  files_created: 10
  files_modified: 5
  tests_passing: 27
---

# Phase 23 Plan 01: Memory Intelligence Backend Summary

**One-liner:** SQLite memory intelligence backend with LLM consolidation engine, 4-tier salience decay, 3 new API routes, and access_count increment on recall — all driven by instrumentation.ts scheduler.

---

## What Was Built

### Schema Extensions (db-schema.ts)
Three new tables added with `CREATE TABLE IF NOT EXISTS` (additive, safe on re-run):
- `memory_salience`: per-message tier (pinned/high/mid/low), salience_score, access_count, last_accessed, last_decay_at
- `memory_consolidation_runs`: audit log of LLM consolidation batches (started_at, completed_at, batch_size, insights_written, status, error_message)
- `memory_meta_insights`: LLM-extracted patterns, contradictions, summaries keyed to run_id
- Additive `ALTER TABLE messages ADD COLUMN consolidated` migration with `try/catch` for idempotency
- One-time salience seed: `INSERT OR IGNORE INTO memory_salience SELECT id FROM messages`

### Consolidation Engine (src/lib/memory-consolidation.ts)
- `runConsolidation()`: selects up to 50 unconsolidated messages, sends to `claude-haiku-4-5`, strips code fences, parses JSON array, validates `insight_type` against allowlist, writes insights, marks messages `consolidated=1`
- Graceful degradation: missing API key logs warning and returns; invalid JSON logs error with 0 insights; full try/catch wraps run, updating status to `failed` on unexpected errors
- `startConsolidationScheduler()`: module-level `_started` guard, runs immediately then every 15m

### Decay Engine (src/lib/memory-decay.ts)
- `runDecay()`: applies daily decay to high/mid/low tiers (1%/2%/5%), skips pinned entirely
- Module-level `LOG()` probe: tests if SQLite has `LOG()` math function; if yes, uses access-resistance formula `rate / (1.0 + LOG(1.0 + access_count))`; otherwise falls back to flat rate
- `MAX(0.0, ...)` clamp prevents negative salience
- `WHERE date(last_decay_at) < date('now')` guards against same-day double-decay
- `_resetForTest()` and `hasLogFunction()` exported for test isolation
- `startDecayScheduler()`: `_started` guard, runs immediately then every 60m

### Scheduler Bootstrap (src/instrumentation.ts)
- `register()` with `NEXT_RUNTIME === 'nodejs'` guard
- Dynamic imports of both schedulers to prevent edge-runtime crashes

### API Routes
- `GET /api/memory-stats`: lastRun (null if none), pendingUnconsolidated count, tierStats array, timestamp
- `GET /api/agent-peers`: peers grouped by agent_id from hive_actions, window param [1,1440] min, timestamp
- `POST /api/memory-consolidate`: manual trigger, returns `{ ok: true, timestamp }`
- `GET /api/recall` (modified): increments `access_count` + sets `last_accessed` on `memory_salience` for all recalled message IDs (fire-and-forget try/catch for backward compat)

---

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] RecallResult type and RECALL_SQL missing `id` field**
- **Found during:** Task 3, implementing recall access_count increment
- **Issue:** Plan specified `results.map((r: { id: number }) => r.id)` but `RecallResult` interface and `RECALL_SQL` didn't include `m.id`; access_count UPDATE would silently no-op for all rows
- **Fix:** Added `id: number` to `RecallResult` interface; added `m.id` to `RECALL_SQL` SELECT list
- **Files modified:** `src/lib/db-ingest.ts`
- **Commit:** 1ca93c6

**2. [Rule 1 - Bug] SQLite timestamp format mismatch in agent-peers window comparison**
- **Found during:** Task 3, agent-peers window exclusion test failure
- **Issue:** `datetime('now', '-N minutes')` returns `YYYY-MM-DD HH:MM:SS` format; stored timestamps use ISO `YYYY-MM-DDTHH:MM:SSZ` format; `T > space` lexically so ALL stored timestamps compared as newer than the datetime cutoff — window filtering didn't work
- **Fix:** Changed to `strftime('%Y-%m-%dT%H:%M:%SZ', 'now', ?)` so both sides use the same ISO format
- **Files modified:** `src/app/api/agent-peers/route.ts`
- **Commit:** 8702bf9

**3. [Rule 1 - Bug] @anthropic-ai/sdk mock used arrow function (not constructable)**
- **Found during:** Task 2 GREEN phase, all consolidation tests failing with "is not a constructor"
- **Issue:** `vi.mock` returning `{ default: vi.fn().mockImplementation(() => ({...})) }` — arrow functions can't be used with `new`; `memory-consolidation.ts` uses `new Anthropic()`
- **Fix:** Changed to `class MockAnthropic { messages = { create: mockCreate }; }` in mock factory
- **Files modified:** `src/lib/__tests__/memory-consolidation.test.ts`
- **Commit:** 6cc6994

---

## Threat Surface Scan

No new threat surface beyond what's documented in the plan's `<threat_model>`. All T-23-0x mitigations implemented as specified.

---

## Self-Check: PASSED

Files created:
- src/lib/memory-consolidation.ts — FOUND
- src/lib/memory-decay.ts — FOUND
- src/instrumentation.ts — FOUND
- src/app/api/memory-stats/route.ts — FOUND
- src/app/api/agent-peers/route.ts — FOUND
- src/app/api/memory-consolidate/route.ts — FOUND

Tests: 27/27 passing

Commits:
- 20b9c17: feat(23-01): install @anthropic-ai/sdk, extend schema, create test stubs
- 6cc6994: test(23-01): add failing tests for consolidation and decay engines (RED)
- 7ff4204: feat(23-01): implement consolidation engine, decay engine, instrumentation scheduler (GREEN)
- 1ca93c6: test(23-01): add failing tests for API routes and recall access_count increment (RED)
- 8702bf9: feat(23-01): implement memory-stats, agent-peers, memory-consolidate routes and recall access_count increment (GREEN)
