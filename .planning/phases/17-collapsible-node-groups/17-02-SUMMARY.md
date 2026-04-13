---
phase: 17-collapsible-node-groups
plan: "02"
subsystem: flow
tags: [react-flow, collapse, group-nodes, tdd, pure-functions, useState]
dependency_graph:
  requires: [parentId-migration, group-box-infrastructure]
  provides: [collapse-toggle, collapse-logic, interactive-group-nodes]
  affects: [react-flow-canvas, flow-page]
tech_stack:
  added: [collapse-logic.ts, applyCollapseToNodes, applyCollapseToEdges, aggregateHealthColor]
  patterns: [pure-function collapse logic, Set<string> state, useMemo chaining for hiddenNodeIds, .map not .filter for edges]
key_files:
  created:
    - src/lib/flow/collapse-logic.ts
    - src/lib/flow/__tests__/collapse-logic.test.ts
  modified:
    - src/components/flow/react-flow-canvas.tsx
    - src/components/flow/__tests__/parent-id-migration.test.ts
decisions:
  - "collapse-logic.ts is pure functions with no React dependencies — fully unit-testable in isolation"
  - "hiddenNodeIds useMemo chains off processed nodes array (Option A) — avoids duplicating parentId scan logic"
  - "applyCollapseToEdges uses .map not .filter — preserves edge array length for expand/restore"
  - "aggregateHealthColor priority: error > active > idle > dormant"
  - "GroupBoxNode onClick wired via data.onToggleCollapse — React Flow data prop pattern, no new nodeType prop needed"
  - "Wave 1 sentinel test assertions (not.toContain collapsed/onToggleCollapse) flipped to positive assertions for Wave 2"
metrics:
  duration: "~15 minutes"
  completed: "2026-04-13T21:15:00Z"
  tasks_completed: 3
  tasks_total: 3
  files_changed: 4
---

# Phase 17 Plan 02: Collapse Toggle — Logic + Canvas Wiring Summary

**One-liner:** Added pure `collapse-logic.ts` (3 functions, 24 tests) and wired collapse/expand toggle into GroupBoxNode and ReactFlowCanvas via `collapsedGroups` useState, with edge hidden-state managed by `.map()` not `.filter()`.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 (RED) | Failing tests for collapse-logic | 078484c | src/lib/flow/__tests__/collapse-logic.test.ts |
| 1 (GREEN) | Implement collapse-logic.ts | fb6b069 | src/lib/flow/collapse-logic.ts |
| 2 | Wire collapse toggle into canvas | b90ad76 | src/components/flow/react-flow-canvas.tsx, parent-id-migration.test.ts |
| 3 | Visual checkpoint | — | Auto-approved: build passes, 34/34 tests pass |

## What Was Built

### collapse-logic.ts (`src/lib/flow/collapse-logic.ts`)

Three pure functions with no React dependencies:

**`applyCollapseToNodes(nodes, collapsedGroupIds)`**
- Returns new array (same length) — `.map()` not `.filter()`
- Children whose `parentId` is in `collapsedGroupIds` get `hidden: true`
- Group box nodes themselves are never hidden
- All other nodes get `hidden: false` — clears stale state on expand

**`applyCollapseToEdges(edges, hiddenNodeIds)`**
- Returns new array (same length) — `.map()` not `.filter()`
- Edges where source OR target is in `hiddenNodeIds` get `hidden: true`
- All other edges get `hidden: false` — clears stale state on expand
- NEVER uses `.filter()` — edges must stay in array for React Flow to restore them

**`aggregateHealthColor(statuses)`**
- Priority: `error=#f43f5e` > `active=#10b981` > `idle=#f59e0b` > `dormant=#64748b`
- Returns dormant color for empty array

### ReactFlowCanvas Changes (`src/components/flow/react-flow-canvas.tsx`)

**State:**
```ts
const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set());
const toggleGroup = useCallback((id: string) => {
  setCollapsedGroups(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
}, []);
```

**Nodes useMemo:** Group box nodes now carry `collapsed`, `aggregateColor`, and `onToggleCollapse` in data. The base array is wrapped: `return applyCollapseToNodes(baseNodes, collapsedGroups)`.

**hiddenNodeIds useMemo:** Derived from processed nodes — `new Set(nodes.filter(n => n.hidden).map(n => n.id))`. Chains off nodes, not raw state.

**Edges useMemo:** `return applyCollapseToEdges(allEdges, hiddenNodeIds)`.

### GroupBoxNode Changes

- `pointerEvents: "none"` removed
- `cursor: "pointer"` added
- `onClick={data.onToggleCollapse}` added
- When `collapsed`: border uses `aggregateColor`, height collapses to 40px, label color changes to aggregateColor, chevron shows `▶` vs `▼`

## GitNexus Impact Analysis

**Symbol:** ReactFlowCanvas
**Direction:** upstream
**Risk:** LOW
**Direct callers affected:** 0
**Processes affected:** 0

Safe to proceed — confirmed before Task 2 edits.

## Deviations from Plan

### Auto-fixed Issues (Rule 1 — Stale Test Assertions)

**1. [Rule 1 - Bug] Wave 1 sentinel test assertions were inverted for Wave 2**

- **Found during:** Task 2 full test run
- **Issue:** `parent-id-migration.test.ts` had `expect(SRC).not.toContain("collapsed:")` and `.not.toContain("onToggleCollapse")` — written in Wave 1 as guards against premature additions. Wave 2 legitimately adds these fields, causing 2 test failures.
- **Fix:** Flipped to positive assertions (`expect(SRC).toContain("collapsed:")`, `.toContain("onToggleCollapse")`). Also updated Test 7's return-statement regex to match the new `baseNodes` pattern (`const baseNodes = [...groupBoxNodes...]` then `return applyCollapseToNodes(baseNodes, ...)`).
- **Files modified:** src/components/flow/__tests__/parent-id-migration.test.ts
- **Commit:** b90ad76

## Test Results

- `collapse-logic.test.ts`: 24/24 pass (started RED at 078484c, turned GREEN at fb6b069)
- `parent-id-migration.test.ts`: 10/10 pass (2 stale assertions updated)
- Full suite: 34/34 pass (0 regressions)
- Build: success

## Task 3 — Visual Checkpoint

**Status:** Auto-approved — CI passes (34/34 tests, build succeeds).

**Expected visual behavior (for manual verification):**
- Clicking "Server Agents" box collapses it to 40px height; all 5 agent nodes + local-agents disappear; their edges hide
- Clicking again expands — all nodes and edges restore
- Clicking "Dev Tools" box collapses cookbooks, apo, gitnexus, llmwiki
- Border and label color reflect aggregate health (green if any active, amber if idle, red if error)
- Chevron indicator: ▼ expanded, ▶ collapsed

## Known Stubs

None — collapse is fully wired with real state. No persistence (useState only, resets on reload — intentional per plan spec).

## Threat Flags

None — client-side render change only; no new network endpoints, auth paths, or trust boundaries.

## Self-Check

- [x] `src/lib/flow/collapse-logic.ts` exists with 3 pure functions
- [x] `src/lib/flow/__tests__/collapse-logic.test.ts` exists with 24 tests
- [x] `src/components/flow/react-flow-canvas.tsx` has `collapsedGroups` useState
- [x] `src/components/flow/react-flow-canvas.tsx` has `toggleGroup` useCallback
- [x] nodes useMemo calls `applyCollapseToNodes`
- [x] edges useMemo calls `applyCollapseToEdges`
- [x] GroupBoxNode has `onClick={data.onToggleCollapse}` and `cursor: "pointer"`
- [x] Commits 078484c, fb6b069, b90ad76 exist
- [x] 34/34 tests pass
- [x] Build succeeds

## Self-Check: PASSED
