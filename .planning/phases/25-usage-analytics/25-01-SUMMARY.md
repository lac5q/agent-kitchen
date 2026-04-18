---
phase: 25-usage-analytics
plan: "01"
subsystem: analytics-backend
tags: [sqlite, time-series, react-query, vitest, tdd]
dependency_graph:
  requires: []
  provides: [recall_log-table, GET-api-time-series, useTimeSeries-hook]
  affects: [src/lib/db-schema.ts, src/app/api/recall/route.ts, src/lib/api-client.ts]
tech_stack:
  added: []
  patterns: [fire-and-forget-try-catch, sqlite-datetime-expressions, jsonl-bucketing]
key_files:
  created:
    - src/app/api/time-series/route.ts
    - src/app/api/time-series/__tests__/route.test.ts
  modified:
    - src/lib/db-schema.ts
    - src/app/api/recall/route.ts
    - src/lib/api-client.ts
    - src/app/api/recall/__tests__/route.test.ts
decisions:
  - SQLite datetime expressions embedded in SQL (not bound parameters) because they are hardcoded allowlist constants, not user input
  - bucketFormat string passed as bound parameter to strftime() for SQL injection safety
  - JSONL metrics use JS Date math instead of SQLite datetime() to avoid fs/DB coupling
  - TypeSeriesMetric and TimeSeriesWindow exported as named types for Plan 02 component reuse
metrics:
  duration: "~6 minutes"
  completed: "2026-04-18"
  tasks_completed: 2
  files_changed: 6
---

# Phase 25 Plan 01: Time-Series Analytics Backend Summary

**One-liner:** SQLite recall_log table + unified GET /api/time-series for 6 metrics x 3 windows + useTimeSeries React Query hook with 60s polling.

## What Was Built

### Task 1: recall_log schema, recall route integration, and time-series API route

**recall_log DDL** appended to `initSchema()` in `src/lib/db-schema.ts`:
- `id INTEGER PRIMARY KEY`, `query TEXT NOT NULL`, `results INTEGER NOT NULL DEFAULT 0`
- `timestamp TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))`
- Index `recall_log_ts` on `timestamp` for efficient time-range queries

**GET /api/recall** updated to fire-and-forget INSERT into `recall_log` after each non-empty query, wrapped in try/catch to silently ignore if table doesn't exist on older DBs.

**GET /api/time-series** new endpoint:
- Validates `metric` against 6-item allowlist and `window` against 3-item allowlist; returns 400 on invalid input
- SQL metrics (`docs_ingested`, `memory_writes`, `recall_queries`, `collection_growth`): use `strftime(bucketFormat, col)` with bound parameter for format + hardcoded SQLite datetime expressions for window boundaries
- JSONL metrics (`skill_executions`, `skill_failures`): parse `SKILL_CONTRIBUTIONS_LOG` / `FAILURES_LOG` with `readFileSync`, bucket by JS Date math, return `[]` gracefully on ENOENT
- Returns `{ points: [{bucket, value}], metric, window, timestamp }`

### Task 2: useTimeSeries hook

Added to `src/lib/api-client.ts`:
- `useTimeSeries(metric: TimeSeriesMetric, window: TimeSeriesWindow)` using `useQuery`
- `queryKey: ['time-series', metric, window]` for cache isolation per metric+window pair
- `refetchInterval: POLL_INTERVALS.knowledge` (60000ms)
- Exported `TimeSeriesMetric` and `TimeSeriesWindow` union types for Plan 02 component props

## Test Coverage

**12 new tests** in `src/app/api/time-series/__tests__/route.test.ts`:
- Validation: invalid metric → 400, invalid window → 400
- `docs_ingested`: day (hourly %H:00 buckets), week (daily %Y-%m-%d), month
- `memory_writes`: SUM(insights_written) per bucket
- `recall_queries`: COUNT per bucket from recall_log
- `collection_growth`: COUNT(DISTINCT file_path) per bucket
- `skill_executions`: JSONL parsing with known timestamps
- `skill_failures`: JSONL daily buckets
- `skill_executions`: ENOENT → empty points (no 500)
- Empty tables → `{ points: [], metric, window, timestamp }`

**2 new tests** in `src/app/api/recall/__tests__/route.test.ts`:
- Inserts row into recall_log after non-empty query
- Does not insert for empty query

**Total: 262 tests pass, 27 test files, 0 regressions.**

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] SQL query bound parameter mismatch**
- **Found during:** Task 1 implementation review
- **Issue:** Initial draft passed `since` (a SQLite expression string) as both an interpolated SQL fragment AND a bound parameter, causing double-binding
- **Fix:** Removed `since` from `.all()` call; only `bucketFormat` is bound; `since` is the hardcoded datetime expression interpolated directly (safe: validated allowlist, not user input)
- **Files modified:** `src/app/api/time-series/route.ts`
- **Commit:** 6e4b9f0

**2. [Rule 1 - Bug] TypeScript error in empty-tables test**
- **Found during:** Task 2 TypeScript check
- **Issue:** `@ts-expect-error` directives flagged as unused (TS2578) because the mock override assignment was already type-compatible
- **Fix:** Removed the unnecessary directives
- **Files modified:** `src/app/api/time-series/__tests__/route.test.ts`
- **Commit:** d7e10da

## Known Stubs

None — all 6 metrics return real data from SQLite tables or JSONL files.

## Threat Flags

None — no new network endpoints or trust boundaries beyond those documented in the plan's threat model.

## Self-Check: PASSED

- `src/lib/db-schema.ts` — contains `recall_log` DDL: verified
- `src/app/api/time-series/route.ts` — exists and exports GET: verified
- `src/lib/api-client.ts` — exports `useTimeSeries`: verified
- Commits `37ee8a3`, `6e4b9f0`, `d7e10da` — all present in git log: verified
- 262 tests pass, 0 failures: verified
