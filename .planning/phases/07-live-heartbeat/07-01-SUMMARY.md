---
phase: 07-live-heartbeat
plan: 01
subsystem: health-api, flow-diagram
tags: [health, filesystem, tristate, tdd, obsidian, knowledge-curator]
dependency_graph:
  requires: []
  provides: [FLOW-08, FLOW-09]
  affects: [src/app/api/health/route.ts, src/lib/constants.ts, src/components/flow/react-flow-canvas.tsx]
tech_stack:
  added: []
  patterns: [toLocaleDateString("en-CA") for local-time YYYY-MM-DD, last-run-block log scan, checkServiceTristate 3-state helper]
key_files:
  created:
    - src/app/api/health/__tests__/live-heartbeat.test.ts
  modified:
    - src/lib/constants.ts
    - src/app/api/health/route.ts
    - src/components/flow/react-flow-canvas.tsx
decisions:
  - checkServiceTristate chosen over checkService to support 3-state up/degraded/down returns
  - toLocaleDateString("en-CA") used for YYYY-MM-DD in local time (avoids UTC midnight date bug)
  - Last-run-block scan (from last "Starting Knowledge Curator..." to EOF) avoids false positives from earlier completed runs
  - 26h curator window accounts for 2am cron — still fresh at midnight the same day
metrics:
  duration: ~6m
  completed: 2026-04-13
  tasks_completed: 2
  files_modified: 3
  files_created: 1
---

# Phase 7 Plan 01: Live Heartbeat Summary

**One-liner:** Filesystem-derived 3-state health checks for Obsidian vault and knowledge-curator cron log, replacing hardcoded statuses in the Flow diagram.

## What Was Built

Two new exported functions in `/api/health/route.ts` replace hardcoded node statuses in the Flow diagram:

- **`obsidianStatus()`** — stats the vault root, then stats today's journal (`journals/YYYY-MM-DD.md` in local time). Returns `up`/`degraded`/`down`.
- **`curatorStatus()`** — stats `/tmp/knowledge-curator.log` for existence and mtime freshness (26h window), reads only the last run block (from last "Starting Knowledge Curator..." to EOF), checks for completion and warnings. Returns `up`/`degraded`/`down`.
- **`checkServiceTristate()`** — new helper that wraps 3-state check functions and maps them to `HealthStatus` (vs the binary `checkService` helper that only returns `up`/`down`).
- **`OBSIDIAN_VAULT_PATH`** and **`CURATOR_LOG_PATH`** exported from `constants.ts` for env-overridable paths.
- **`react-flow-canvas.tsx`** — removed two hardcoded return lines and extended `svcMap` with `obsidian: "Obsidian"` and `"knowledge-curator": "Curator"` so both nodes derive color from live health poll.

## Verification Results

| Check | Result |
|-------|--------|
| `npm test -- --run live-heartbeat` | 9/9 passed |
| `npm run build` | Compiled successfully (zero TS errors) |
| `curl /api/health` — Obsidian entry | `up` (journal 2026-04-12.md exists) |
| `curl /api/health` — Curator entry | `down` (log not present — correct) |
| No hardcoded obsidian line | Confirmed |
| svcMap has knowledge-curator entry | Confirmed at line 173 |

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 | d21f27d | feat(07-01): add path constants and extend health API with 3-state obsidian + curator checks |
| Task 2 | 27704d3 | feat(07-01): remove hardcoded statuses from canvas, extend svcMap for obsidian + curator |

## Decisions Made

1. **`checkServiceTristate` over extending `checkService`** — keeping the binary helper unchanged avoids risk to 5 existing services; tristate is a separate concern.
2. **`toLocaleDateString("en-CA")`** — produces `YYYY-MM-DD` in the machine's local timezone, preventing the UTC midnight bug where a journal written at 11pm local would show as "tomorrow's" date in UTC.
3. **Last-run-block scan** — slicing from the last "Starting Knowledge Curator..." line prevents a stale previous successful run from masking a current incomplete run.
4. **26h curator window** — cron runs at 2am; by midnight the same day the log is 22h old. 1h window would produce false "down" states for 22 of 24 hours.
5. **TDD test pattern** — `// @vitest-environment node` + dynamic `await import(...)` after `vi.mock()` hoisting is required for ESM modules (`child_process`, `fs/promises`) to mock correctly in vitest 4.x.

## Pitfalls Avoided

- **Duplicate `fsStat` import** — `readFile` added to existing `fs/promises` import line, not a second import statement.
- **UTC midnight date bug** — `toLocaleDateString("en-CA")` used instead of `toISOString().slice(0,10)`.
- **Full-log scan false positive** — last-run-block extraction ensures only the current run's lines are evaluated.
- **Static imports with ESM mocks** — switched to dynamic `await import()` pattern matching existing project test (`heartbeat/route.test.ts`), which is the working vitest ESM pattern for this codebase.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test mock pattern required `// @vitest-environment node` + dynamic imports**
- **Found during:** Task 1 GREEN phase
- **Issue:** Plan's test template used static imports and `vi.clearAllMocks()`. With vitest 4.x ESM, `child_process` and `fs/promises` mocks require `importOriginal` spread OR pure factory — but pure factory causes "No default export" errors. Static imports also cause mocks to not intercept correctly.
- **Fix:** Added `// @vitest-environment node` pragma, switched to `await import()` for both the route and fs/promises after `vi.mock()` declarations, following the exact pattern used in the existing `src/app/api/heartbeat/__tests__/route.test.ts`.
- **Files modified:** `src/app/api/health/__tests__/live-heartbeat.test.ts`
- **Commit:** d21f27d (included in Task 1 commit)

## Known Stubs

None. Both status functions derive from live filesystem state. The stats panel (`nodeStats()`) for obsidian and knowledge-curator remains static by design (out of scope per RESEARCH.md).

## Threat Flags

None beyond those documented in the plan's threat model (T-07-01 through T-07-03, all accepted).

## Self-Check: PASSED

- [x] `src/lib/constants.ts` — FOUND, exports OBSIDIAN_VAULT_PATH and CURATOR_LOG_PATH
- [x] `src/app/api/health/route.ts` — FOUND, exports obsidianStatus, curatorStatus, GET
- [x] `src/components/flow/react-flow-canvas.tsx` — FOUND, no hardcoded obsidian/curator lines
- [x] `src/app/api/health/__tests__/live-heartbeat.test.ts` — FOUND, 9 tests
- [x] Commit d21f27d — EXISTS
- [x] Commit 27704d3 — EXISTS
