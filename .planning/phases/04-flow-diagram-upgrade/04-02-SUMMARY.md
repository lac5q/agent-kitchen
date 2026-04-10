---
phase: 04-flow-diagram-upgrade
plan: "02"
subsystem: flow-dashboard
tags: [api, heartbeat, activity-feed, node-detail-panel, security, tdd]
dependency_graph:
  requires: []
  provides:
    - /api/heartbeat endpoint with path traversal guard
    - cleanMessage utility for log noise stripping
    - NodeDetailPanel heartbeat section with label toggle
  affects:
    - src/app/api/activity/route.ts
    - src/components/flow/node-detail-panel.tsx
tech_stack:
  added:
    - vitest (test runner, added npm test script)
  patterns:
    - TDD (RED→GREEN) for API route and utility function
    - Pure regex transforms for log noise stripping (no LLM, per D-08)
    - Path traversal guard via string includes checks before path.join
    - Graceful degradation: content: null when file missing (per D-05)
key_files:
  created:
    - src/app/api/heartbeat/route.ts
    - src/lib/activity-cleanup.ts
    - src/app/api/heartbeat/__tests__/route.test.ts
    - src/lib/__tests__/activity-cleanup.test.ts
  modified:
    - src/app/api/activity/route.ts
    - src/components/flow/node-detail-panel.tsx
    - package.json
decisions:
  - Used @vitest-environment node docblock on route test to avoid jsdom/Next.js conflicts
  - Used dynamic import() in test file (after vi.mock) to ensure mocks are applied before module load
  - Installed vitest via npm install (was in devDependencies but not actually installed in worktree)
metrics:
  duration_seconds: 317
  completed_date: "2026-04-10"
  tasks_completed: 2
  files_created: 4
  files_modified: 3
---

# Phase 04 Plan 02: API Routes and Panel Upgrade Summary

**One-liner:** Heartbeat API route with path traversal guard, regex-based activity log noise stripping, and NodeDetailPanel heartbeat section with label toggle.

## Tasks Completed

| Task | Description | Commit | Status |
|------|-------------|--------|--------|
| 1 (TDD RED) | Failing tests for heartbeat route and cleanMessage | de4a67a | Done |
| 1 (TDD GREEN) | Heartbeat route, activity-cleanup, cleanMessage integration | d498d18 | Done |
| 2 | NodeDetailPanel heartbeat section and label toggle | d13a9b6 | Done |

## What Was Built

**`/api/heartbeat` route** (`src/app/api/heartbeat/route.ts`):
- `GET /api/heartbeat?agent={agentId}` reads `HEARTBEAT_STATE.md` from agent config dir
- Path traversal guard: rejects agentId containing `..`, `/`, or `\` with 400 + `{content: null}`
- Returns last 20 non-empty lines as `{content: string}` or `{content: null}` on ENOENT
- T-04-01 and T-04-02 threat mitigations fully implemented

**`cleanMessage` utility** (`src/lib/activity-cleanup.ts`):
- Pure regex pipeline: strips `===`/`---` delimiters, leading `[timestamp]` brackets, mid-string ISO-8601 timestamps, lone noise words ("Starting", "Complete", etc.)
- Integrated into all 5 `events.push()` calls in `/api/activity/route.ts`
- Empty messages after cleanup are filtered out (never pushed to events array)

**NodeDetailPanel upgrades** (`src/components/flow/node-detail-panel.tsx`):
- `useState`/`useEffect` added; fetches `/api/heartbeat?agent={nodeId}` on node click
- Panel subtitle toggles: "Last State" when heartbeat content available, "Node Activity" when not (per D-06)
- Heartbeat `<pre>` section renders between Stats and Events when content available
- Graceful degradation: section renders nothing when `content` is null (per D-05)
- `aria-label="Close node detail panel"` added to close button

## Tests

15 tests pass across 3 test files:
- `src/lib/__tests__/activity-cleanup.test.ts` — 7 tests (cleanMessage edge cases)
- `src/app/api/heartbeat/__tests__/route.test.ts` — 6 tests (path traversal + file read)
- `src/test/smoke.test.tsx` — 2 pre-existing tests

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] vitest not installed in worktree**
- **Found during:** Task 1 RED phase
- **Issue:** `package.json` listed vitest in devDependencies but `node_modules` not present in worktree
- **Fix:** Ran `npm install` in both main repo and worktree; added `"test": "vitest"` to package.json scripts
- **Files modified:** `package.json`, `package-lock.json`
- **Commit:** d498d18

**2. [Rule 1 - Bug] vi.mock not intercepting fs/promises.readFile**
- **Found during:** Task 1 GREEN phase (route test failing with wrong environment)
- **Issue:** vitest.config.ts uses jsdom environment; Next.js route tests need node environment; also mock wasn't applied before module load
- **Fix:** Added `// @vitest-environment node` docblock; used `await import()` after `vi.mock()` calls for proper hoisting
- **Files modified:** `src/app/api/heartbeat/__tests__/route.test.ts`
- **Commit:** d498d18

## Known Stubs

None — all functionality wired to real data sources. Heartbeat returns `{content: null}` until agents write `HEARTBEAT_STATE.md` files (expected — per D-05 graceful degradation).

## Threat Flags

No new threat surface beyond what was planned. T-04-01 and T-04-02 fully mitigated.

## Self-Check: PASSED
