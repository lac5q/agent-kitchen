---
phase: 21-paperclip-fleet-node
plan: "01"
subsystem: paperclip-api
tags: [api-route, react-query, sqlite, tdd, fleet-coordination]
dependency_graph:
  requires: [hive_actions table, hive_delegations table, db-schema initSchema]
  provides: [GET /api/paperclip, POST /api/paperclip, usePaperclipFleet hook]
  affects: [src/lib/api-client.ts, src/types/index.ts, src/lib/constants.ts]
tech_stack:
  added: []
  patterns: [NextRequest route handler, better-sqlite3 parameterized statements, AbortController timeout, React Query polling hook]
key_files:
  created:
    - src/app/api/paperclip/route.ts
    - src/app/api/paperclip/__tests__/route.test.ts
  modified:
    - src/types/index.ts
    - src/lib/constants.ts
    - src/lib/api-client.ts
decisions:
  - Read process.env at request time in GET handler (not module scope) so test env overrides via beforeEach are respected
  - Unknown autonomy modes default to Interactive per T-21-01 threat mitigation
  - POST returns 502 and writes NO local records on upstream failure (clean failure boundary)
metrics:
  duration: ~20 minutes
  completed: "2026-04-18T02:55:23Z"
  tasks_completed: 2
  files_changed: 5
---

# Phase 21 Plan 01: Paperclip Fleet Adapter Route Summary

One-liner: Typed GET/POST `/api/paperclip` adapter with autonomy normalization, offline fallback, and `usePaperclipFleet()` polling hook backed by existing hive SQLite tables.

## What Was Built

### Task 1 — Types, constants, client hook, route tests (RED)

Added four Paperclip fleet types to `src/types/index.ts`:
- `PaperclipAutonomyMode` union type (`Interactive | Autonomous | Continuous | Hybrid`)
- `PaperclipFleetSummary` — fleet health summary with autonomyMix counts
- `PaperclipFleetAgent` — normalized per-agent record
- `PaperclipOperation` — local recovery record from hive_delegations
- `PaperclipFleetResponse` — full GET response shape

Added `paperclip: 5000` to `POLL_INTERVALS` in `src/lib/constants.ts`.

Added `usePaperclipFleet()` to `src/lib/api-client.ts` following the existing `useHiveFeed()` pattern with React Query.

Created `src/app/api/paperclip/__tests__/route.test.ts` with 10 tests covering:
- POST: 400 on missing `taskSummary`, 503 when unconfigured, successful dispatch + DB writes
- POST: checkpoint JSON shape, hive_actions row, sessionId preservation
- GET: local operations from hive_delegations, offline fallback, autonomy normalization, sort order

Tests were confirmed RED (module not found) before Task 2.

### Task 2 — Implement /api/paperclip route (GREEN)

Created `src/app/api/paperclip/route.ts` with:

**GET handler:**
- Reads `process.env.PAPERCLIP_BASE_URL` at request time (not module scope) for test compatibility
- Fetches upstream fleet with 5-second AbortController timeout
- Normalizes all agent `autonomyMode` values case-insensitively to exact vocabulary; unknown values map to `"Interactive"`
- On upstream failure (network error, timeout, non-OK): `agents = []`, `fleetStatus = "offline"`
- Always reads local operations from `hive_delegations WHERE to_agent = 'paperclip' ORDER BY updated_at DESC`
- Returns `{ summary, agents, operations, timestamp }`

**POST handler:**
- Validates `taskSummary` (required, non-empty) and `requestedBy` (required)
- Returns 503 if `PAPERCLIP_BASE_URL` not configured
- Forwards dispatch upstream with 10-second timeout; returns 502 on any failure, writing NO local records
- On success: writes `hive_delegations` row with checkpoint `{ sessionId, completedSteps: [], resumeFrom: 'dispatch', lastStepAt }` and `hive_actions` row with `agent_id='paperclip', action_type='trigger'`
- Preserves caller-provided `sessionId` or generates via `crypto.randomUUID()`
- Returns `{ ok: true, taskId, sessionId }`

All 10 tests GREEN after one auto-fix (module-scope env capture).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Module-scope PAPERCLIP_BASE_URL captured before test env set**
- **Found during:** Task 2 (Test 8 failing — agents array empty in GET)
- **Issue:** `const PAPERCLIP_BASE_URL = process.env.PAPERCLIP_BASE_URL || ''` at module scope captured an empty string because the route module was imported before `beforeEach` had run
- **Fix:** GET handler now reads `process.env.PAPERCLIP_BASE_URL || PAPERCLIP_BASE_URL` at request time, consistent with how POST already handled it
- **Files modified:** `src/app/api/paperclip/route.ts`
- **Commit:** c4eeada

## Threat Mitigations Applied

| Threat | Mitigation |
|--------|-----------|
| T-21-01: Tampering via upstream payload | normalizeAutonomy() maps all values to safe vocabulary; unknown → Interactive |
| T-21-03: Repudiation | Every successful dispatch writes hive_delegations checkpoint + hive_actions row |
| T-21-04: Upstream DoS | GET: 5s timeout + offline fallback; POST: 10s timeout + 502 with no local writes |
| T-21-05: SQL injection | All DB writes use better-sqlite3 named parameters; checkpoint JSON.stringify'd |

## Known Stubs

None — all data paths are wired. GET returns real upstream fleet data or graceful offline state. Operations come from real SQLite hive_delegations rows.

## Threat Flags

None — no new trust boundaries introduced beyond what the plan's threat model covers.

## Commits

| Hash | Message |
|------|---------|
| e7d54e4 | test(21-01): add failing tests for Paperclip fleet route (TDD RED) |
| c4eeada | feat(21-01): implement /api/paperclip fleet adapter route (GREEN) |

## Self-Check: PASSED

- route.ts: FOUND
- route.test.ts: FOUND
- SUMMARY.md: FOUND
- commit e7d54e4: FOUND
- commit c4eeada: FOUND
