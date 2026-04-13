---
phase: 15-skill-heatmap
plan: "01"
subsystem: skills
tags: [skill-heatmap, css-grid, tdd, react-memo, contribution-activity]
dependency_graph:
  requires: [14-02]
  provides: [contributionHistory-api, SkillHeatmap-component, cookbooks-heatmap-panel]
  affects: [node-detail-panel, react-flow-canvas, api-client]
tech_stack:
  added: []
  patterns: [CSS-grid-inline-style, React.memo-cell-local-hover, useMemo-date-axis]
key_files:
  created:
    - src/components/skill-heatmap.tsx
    - src/components/__tests__/skill-heatmap.test.tsx
  modified:
    - src/app/api/skills/route.ts
    - src/app/api/skills/__tests__/route.test.ts
    - src/lib/api-client.ts
    - src/components/flow/react-flow-canvas.tsx
    - src/components/flow/node-detail-panel.tsx
decisions:
  - "gridTemplateColumns via inline style (not Tailwind) — Tailwind cannot generate grid-cols-30 without tailwind.config.ts change"
  - "intensityClass() returns static string per bucket — no dynamic Tailwind JIT injection risk"
  - "events array hoisted before try block so step 6 aggregator can access it without a second readFile"
  - "Test 7 render-cascade verified via source-read (memo pattern + useState) — behavioral render-count tests fragile with React 19"
  - "useSkills() added to NodeDetailPanel (not passed via props) — contributionHistory is panel-local concern"
metrics:
  duration: "~15 minutes"
  completed: "2026-04-13"
  tasks_completed: 2
  files_changed: 7
---

# Phase 15 Plan 01: Skill Heatmap Summary

**One-liner:** 30-day CSS grid contribution heatmap using React.memo cells with cell-local hover state, backed by a new `contributionHistory` aggregate computed from the existing in-memory events array.

## What Was Built

### API Extension (`src/app/api/skills/route.ts`)

Step 6 added to the GET handler. After the failures aggregation (step 5), it iterates the already-parsed `events` array (hoisted from `let events: JournalEvent[] = []` before the try block) to bucket `synced` and `failed` actions by `(skill, YYYY-MM-DD)` within the last 30 days. The JSONL file is read exactly once.

**Final `/api/skills` response shape:**
```typescript
{
  totalSkills: number;
  contributedByHermes: number;
  contributedByGwen: number;
  recentContributions: Array<{ skill: string; contributor: string; timestamp: string; action: string }>;
  lastPruned: string | null;
  staleCandidates: number;
  coverageGaps: string[];
  lastUpdated: string | null;
  failuresByAgent: Record<string, number>;
  failuresByErrorType: Record<string, number>;
  contributionHistory: Array<{ skill: string; date: string; count: number }>; // NEW — always an array
  timestamp: string;
}
```

### SkillHeatmap Component (`src/components/skill-heatmap.tsx`)

- CSS grid via `style={{ gridTemplateColumns: \`8rem repeat(${columnCount}, minmax(0, 1fr))\` }}` — avoids touching `tailwind.config.ts`
- `HeatmapCell` = `memo(function HeatmapCell(...))` with `useState(isHovered)` local to each cell — hover does not cascade to siblings
- `intensityClass()` returns one of 5 static Tailwind strings: `bg-neutral-100` / `bg-green-200` / `bg-green-400` / `bg-green-600` / `bg-green-800` (dark variants included)
- `dateColumns`, `skillRows`, `counts` all derived via `useMemo`
- Empty state: `data-testid="heatmap-grid-empty"` placeholder + "No contributions in the last N days." message
- Column clamp: `Math.max(1, dateColumns.length)` — never 0 columns

### NodeDetailPanel Wiring (`src/components/flow/node-detail-panel.tsx`)

- Added `import { useSkills } from "@/lib/api-client"` and `import { SkillHeatmap } from "@/components/skill-heatmap"`
- `const { data: skillsData } = useSkills()` called inside the component
- Heatmap rendered with `contributionHistory={skillsData?.contributionHistory ?? []}` when `nodeId === "cookbooks"`

### Type Updates

- `useSkills()` in `src/lib/api-client.ts` — type now includes `coverageGaps`, `failuresByAgent`, `failuresByErrorType`, `contributionHistory` (fixes pre-existing stale type bug from Phases 13/14)
- `SkillsStats` in `src/components/flow/react-flow-canvas.tsx` — added `contributionHistory?: Array<{ skill: string; date: string; count: number }>` as optional field

## Test Results

| Suite | Tests | Status |
|-------|-------|--------|
| Route (contributionHistory) | 9 new | All pass |
| Route (existing Phase 9+13+14) | 28 existing | All pass (no regression) |
| SkillHeatmap component | 9 new | All pass |
| **Total** | **46** | **46 passed** |

TDD commits (4 total):
- `7706d8a` test(15-01): RED — 9 route tests failing
- `752d3a3` feat(15-01): GREEN — route implementation passes all 37 tests
- `dee1394` test(15-01): RED — 9 component tests failing (component didn't exist)
- `2d6efa6` feat(15-01): GREEN — component + panel wiring, 46 tests pass

## No Double-Read Confirmed

Test 9 verifies: `mockReadFile.mock.calls.filter(args => args[0] === SKILL_CONTRIBUTIONS_LOG).length <= 1` — passes. The `events` array is populated once in step 4's try block and reused by step 6 without opening the JSONL again.

## No New npm Dependencies

`git diff package.json package-lock.json` is empty. No chart library, no new package.

## `useSkills` Type Fix Note

The hook's return type now accurately reflects the full current API response shape. Future plans that consume `coverageGaps`, `failuresByAgent`, `failuresByErrorType`, or `contributionHistory` from `useSkills()` will get correct TypeScript types without additional updates.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. All fields are wired to real data (JSONL events array for `contributionHistory`; empty array `[]` is the correct response when no events match the filter, not a placeholder).

## Threat Surface Scan

No new network endpoints, auth paths, or file access patterns introduced. `contributionHistory` exposes `{skill, date, count}` triples only — no contributor identity, no payload, no path. React's default JSX escaping handles skill names in `<span>` and `title` attributes. No `innerHTML`, no `eval`.

## Visual QA Pending

Per STATE.md: full visual QA at kitchen.epiloguecapital.com recommended before v1.3 milestone close. Verify:
1. Click Cookbooks node → detail panel opens → "Contribution Activity" heading visible
2. 30-column grid renders with color intensity
3. Hovering a cell highlights ONLY that cell (no sibling flicker)
4. When `skill-contributions.jsonl` is absent: panel shows "No contributions in the last 30 days."

## Self-Check

- `src/components/skill-heatmap.tsx` — FOUND
- `src/components/__tests__/skill-heatmap.test.tsx` — FOUND
- `src/app/api/skills/route.ts` (contains `contributionHistory`) — FOUND
- `src/lib/api-client.ts` (updated type) — FOUND
- `src/components/flow/node-detail-panel.tsx` (contains `SkillHeatmap`) — FOUND

Commits:
- `7706d8a` — FOUND
- `752d3a3` — FOUND
- `dee1394` — FOUND
- `2d6efa6` — FOUND

## Self-Check: PASSED
