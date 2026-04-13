---
phase: 09-skill-management-dashboard
plan: "02"
subsystem: flow-canvas-skills
tags: [skills, flow-canvas, react-flow, activity-feed, jsonl, live-data]
dependency_graph:
  requires: ["09-01"]
  provides: ["skillsStats prop", "dashed cyan edges", "cookbooks JSONL activity events", "live skillCount", "Skill Sync legend"]
  affects: ["src/components/flow/react-flow-canvas.tsx", "src/app/flow/page.tsx", "src/app/api/activity/route.ts"]
tech_stack:
  added: []
  patterns: ["optional prop with null default", "useCallback dep array extension", "JSONL sliding window 2h", "allAgentIds alba guard for stale closure prevention"]
key_files:
  created: []
  modified:
    - src/components/flow/react-flow-canvas.tsx
    - src/app/flow/page.tsx
    - src/app/api/activity/route.ts
decisions:
  - "Use allAgentIds (already in edges useMemo deps) not keyRemote for alba guard — prevents stale closure (T-09-06)"
  - "subtitle uses skillCount prop (not skillsStats) to avoid adding skillsStats dep to nodes useMemo"
  - "skillSyncEdges animated=false with strokeDasharray static dashed, not animated flow"
  - "Pre-existing test failures (smoke.test.tsx, collection-card.test.tsx in .worktrees) confirmed present before changes — not caused by this plan"
metrics:
  duration: "~12 minutes"
  completed_date: "2026-04-13"
  tasks_completed: 3
  files_changed: 3
---

# Phase 9 Plan 02: Flow Canvas Skills Wiring Summary

One-liner: Live skillCount from /api/skills replaces hardcoded 405, cookbooks node shows 5-row detail panel via skillsStats prop, dashed cyan alba-cookbooks-gateways edges added, JSONL events emitted as cookbooks node activity.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Wire skillsStats into ReactFlowCanvas — 5-row cookbooks panel + dashed edges | eb7215e | src/components/flow/react-flow-canvas.tsx |
| 2 | Wire page.tsx (live skillCount + legend) and activity route (skill events) | 243e7a5 | src/app/flow/page.tsx, src/app/api/activity/route.ts |
| 3 | Build verification — npm run build clean + full test suite | (no files) | — |

## Test Results

**53/53 applicable tests passed** (58 total, 5 pre-existing failures in unrelated test files)

Pre-existing failures (confirmed present before this plan on clean state via `git stash`):
- `src/test/smoke.test.tsx` — SummaryBar prop mismatch (pre-existing)
- `.worktrees/v1.2-live-data/src/test/collection-card.test.tsx` — React null useRef in worktree (pre-existing)
- `.worktrees/v1.2-live-data/src/test/smoke.test.tsx` — same SummaryBar issue in worktree (pre-existing)

New tests from Plan 01: 13/13 still passing.

## Verification

- TypeScript: zero errors in all modified files (`npx tsc --noEmit` — errors only in pre-existing test files)
- Production build: `npm run build` succeeded, 1 Turbopack warning (pre-existing), zero errors
- Live API: `curl http://localhost:3002/api/skills` → `totalSkills: 248` (not 405)
- JSONL smoke test: appended test event to skill-contributions.jsonl, confirmed it appeared in `/api/activity` response as `{ node: "cookbooks", type: "knowledge", message: "Skill \"test-skill-wave2\" contributed by hermes" }`
- Test entry cleaned up after verification

## Changes Made

### react-flow-canvas.tsx
- Added `SkillsStats` interface (8 fields matching /api/skills response shape)
- Added `skillsStats?: SkillsStats | null` to `ReactFlowCanvasProps`
- Destructured `skillsStats = null` in component function
- Replaced `case "cookbooks": return { "Skills": skillCount }` with 5-field object: Skills, From Hermes, From Gwen, Last Pruned, Stale
- Added `skillsStats` to nodeStats `useCallback` dep array (T-09-07 mitigation)
- Added `EDGE_COLORS.sync = "#06b6d4"` (cyan)
- Updated cookbooks subtitle from hardcoded `"skillshare · 405+"` to `` `skillshare · ${skillCount}` ``
- Added `skillSyncEdges` (2 dashed cyan edges) inside edges useMemo, guarded by `allAgentIds.includes("agent-alba")` (T-09-06 mitigation)
- Spread `...skillSyncEdges` into return

### flow/page.tsx
- Added `useSkills` to import from `@/lib/api-client`
- Added `const { data: skillsData } = useSkills();` after devToolsData hook
- Replaced `skillCount={405}` with `skillCount={skillsData?.totalSkills ?? 0}`
- Added `skillsStats={skillsData ?? null}` prop to ReactFlowCanvas
- Added Skill Sync legend entry (dashed cyan `border-t-2 border-dashed border-cyan-400`)

### activity/route.ts
- Added `SKILL_LOG` constant at top (env var override or default `~/github/knowledge/skill-contributions.jsonl`)
- Added section 4 JSONL read: sliding 2h window, emits `{ node: "cookbooks", type: "knowledge" }` events per JSONL line

## Deviations from Plan

None — plan executed exactly as written. All four changes to react-flow-canvas.tsx, all five edits to flow/page.tsx, and both edits to activity/route.ts matched the plan's spec precisely.

## Known Stubs

None. All data is live:
- `totalSkills` comes from live directory scan of `~/github/knowledge/skills/`
- `contributedByHermes` / `contributedByGwen` will populate after next `skill-sync.py --export-jsonl` cron run
- `lastPruned` reads from `~/.openclaw/skill-sync-state.json`
- Activity events appear within the 2h window when cron runs with `--export-jsonl`

## Threat Surface Scan

No new network endpoints, auth paths, or file access patterns beyond what the plan's threat model covers. JSONL read is local filesystem only. All rendered strings go through React text nodes (no innerHTML).

## Self-Check: PASSED

- src/components/flow/react-flow-canvas.tsx: EXISTS, modified
- src/app/flow/page.tsx: EXISTS, modified
- src/app/api/activity/route.ts: EXISTS, modified
- Commit eb7215e: EXISTS (react-flow-canvas)
- Commit 243e7a5: EXISTS (page.tsx + activity route)
- 13/13 /api/skills tests: PASSED
- npm run build: EXIT 0
- /api/skills live: totalSkills=248 (not 405)
- JSONL activity smoke test: PASSED (node=cookbooks confirmed)
