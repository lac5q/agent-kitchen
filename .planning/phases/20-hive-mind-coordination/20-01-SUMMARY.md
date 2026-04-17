---
phase: 20-hive-mind-coordination
plan: "01"
subsystem: hive-mind-data-layer
tags: [sqlite, fts5, api-route, hive-mind, tdd]
dependency_graph:
  requires:
    - "19-sqlite-conversation-store/19-01 (getDb singleton, initSchema pattern)"
  provides:
    - "hive_actions table with FTS5 and triggers"
    - "hive_delegations table with UPSERT support"
    - "GET /api/hive (query, filter, delegation)"
    - "POST /api/hive (write action, write/update delegation)"
  affects:
    - "src/lib/db.ts (busy_timeout pragma)"
    - "src/lib/db-schema.ts (new tables appended)"
tech_stack:
  added: []
  patterns:
    - "FTS5 external-content virtual table (same as messages_fts)"
    - "AFTER INSERT + AFTER DELETE trigger pair for FTS sync"
    - "ON CONFLICT(task_id) DO UPDATE for delegation upserts"
    - "try/catch around FTS MATCH queries to handle malformed input (T-20-02)"
    - "TDD red-green with in-memory SQLite via vi.mock"
key_files:
  created:
    - src/app/api/hive/route.ts
    - src/app/api/hive/__tests__/route.test.ts
  modified:
    - src/lib/db.ts
    - src/lib/db-schema.ts
decisions:
  - "busy_timeout = 5000 added after synchronous pragma to prevent SQLITE_BUSY under concurrent agent writes"
  - "FTS malformed query returns 200 with empty actions array (not 500) per threat model T-20-02"
  - "action_type validated at API layer before DB write; CHECK constraint is safety net not primary validation"
  - "Delegation UPSERT via ON CONFLICT(task_id) DO UPDATE — single endpoint handles create and update"
  - "In-memory SQLite with real initSchema used in tests for full SQL fidelity"
metrics:
  duration: "~25 minutes"
  completed: "2026-04-17"
  tasks_completed: 2
  tasks_total: 2
  files_created: 2
  files_modified: 2
  tests_added: 12
  tests_passing: 12
---

# Phase 20 Plan 01: Hive Mind Data Layer Summary

**One-liner:** SQLite hive mind schema (hive_actions + hive_delegations + FTS5) with busy_timeout and /api/hive GET+POST route — 12 tests passing.

## What Was Built

Two new SQLite tables appended to `initSchema()`:

- `hive_actions` — append-only cross-agent action log with CHECK constraint enforcing CodeMachine vocabulary (`continue/loop/checkpoint/trigger/stop/error`), FTS5 external-content virtual table (`hive_actions_fts`), and AFTER INSERT + AFTER DELETE trigger pair for FTS sync
- `hive_delegations` — mutable task delegation tracker with status enum (`pending/active/paused/completed/failed`), JSON checkpoint blob, and UPSERT support via `ON CONFLICT(task_id) DO UPDATE`

DB singleton hardened with `db.pragma('busy_timeout = 5000')` to prevent SQLITE_BUSY errors under concurrent multi-agent writes.

`/api/hive` route:
- `GET` — filters hive_actions by agent, FTS keyword, limit, or type=delegation
- `POST` — validates and writes actions; UPSERTs delegations with checkpoint JSON

## Commits

| Hash | Type | Description |
|------|------|-------------|
| df5009e | feat | Add busy_timeout pragma and hive mind schema DDL |
| f9f624d | test | Add failing tests for /api/hive route (TDD RED) |
| 0922b17 | feat | Implement /api/hive route with GET and POST handlers (TDD GREEN) |

## Test Results

All 12 tests pass:

| Test | Requirement | Description |
|------|-------------|-------------|
| 1 | HIVE-01 | POST valid action returns `{ok:true, id}` |
| 2 | HIVE-01 | POST invalid action_type returns 400 with descriptive error |
| 3 | HIVE-01 | Artifacts object stores as JSON string; GET returns parseable string |
| 4 | HIVE-02 | GET ?agent=claude filters by agent_id |
| 5 | HIVE-02 | GET ?q=keyword returns FTS-matched results |
| 6 | HIVE-02 | GET ?agent=claude&q=stopping combines both filters |
| 7 | HIVE-02 | Malformed FTS query returns 200 with empty array (not 500) |
| 8 | HIVE-03 | POST delegation creates row; GET ?type=delegation retrieves it |
| 9 | HIVE-03 | UPSERT with same task_id updates status and checkpoint |
| 10 | HIVE-03 | Checkpoint JSON round-trips correctly |
| 11 | HIVE-05 | Paperclip agent_id round-trips through POST then GET |
| 12 | — | GET ?limit=5 returns at most 5 rows |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed `res` reference in Test 11**
- **Found during:** TDD GREEN phase
- **Issue:** Test 11 used `res.status` but the variable was named `getRes`
- **Fix:** Changed to `getRes.status` — caught before any commit of GREEN code
- **Files modified:** `src/app/api/hive/__tests__/route.test.ts`
- **Commit:** f9f624d (folded into test commit, fixed before GREEN commit)

**2. [Rule 1 - Bug] Fixed vi.mock factory alias resolution**
- **Found during:** TDD GREEN — first test run
- **Issue:** `require('@/lib/db-schema')` inside `vi.mock` factory fails because `@` alias doesn't resolve in CJS require context inside hoisted mock factory
- **Fix:** Moved DB + schema setup to top-level `await import('@/lib/db-schema')` before `vi.mock`, using the in-memory DB as a module-level singleton. Mock factory captures the already-initialized `testDb` via closure
- **Files modified:** `src/app/api/hive/__tests__/route.test.ts`
- **Commit:** 0922b17

## Threat Mitigations Applied

| Threat | Disposition | Implementation |
|--------|-------------|----------------|
| T-20-01: action_type tampering | mitigate | Allowlist validation before DB write; CHECK constraint as safety net |
| T-20-02: FTS injection via q= | mitigate | try/catch around FTS MATCH; returns `{actions:[], timestamp}` on SqliteError |
| T-20-03: SQL injection via params | mitigate | All queries use better-sqlite3 parameterized `.all()` / `.run()` |

## Known Stubs

None. All data flows through real SQLite queries.

## Threat Flags

None. No new network endpoints beyond `/api/hive` (already in plan). No new auth paths or file access patterns.

## Self-Check: PASSED

- [x] `src/lib/db.ts` modified — `busy_timeout` present
- [x] `src/lib/db-schema.ts` modified — `hive_actions` and `hive_delegations` DDL present
- [x] `src/app/api/hive/route.ts` created — GET and POST exported
- [x] `src/app/api/hive/__tests__/route.test.ts` created — 12 tests, 257+ lines
- [x] Commits df5009e, f9f624d, 0922b17 confirmed in git log
- [x] `npx vitest run` — 12/12 tests pass
