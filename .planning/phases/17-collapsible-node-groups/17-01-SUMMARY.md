---
phase: 17-collapsible-node-groups
plan: "01"
subsystem: flow
tags: [react-flow, parentId, group-nodes, coordinate-migration, tdd]
dependency_graph:
  requires: []
  provides: [parentId-migration, group-box-infrastructure]
  affects: [react-flow-canvas, flow-page]
tech_stack:
  added: [GroupBoxNode component, groupBoxNode nodeType]
  patterns: [parentId + extent:parent, parent-relative coordinates, file-introspection tests]
key_files:
  created:
    - src/components/flow/__tests__/parent-id-migration.test.ts
  modified:
    - src/components/flow/react-flow-canvas.tsx
decisions:
  - "DEV_TOOL_SPACING=160 (actual canvas spacing) not 140 (plan assumed) — matched existing node positions"
  - "group-devtools at {x:145, y:528} computed from actual DEV_TOOL_START_X=160 and DEV_TOOL_Y=560"
  - "GroupBoxNode pointerEvents:none — Plan 17-02 will make it interactive for collapse/expand"
  - "GroupBoxNode selectable:false, draggable:false — kept non-interactive in this plan"
metrics:
  duration: "~10 minutes"
  completed: "2026-04-13T21:08:22Z"
  tasks_completed: 2
  tasks_total: 3
  files_changed: 2
---

# Phase 17 Plan 01: parentId Migration + Group Box Infrastructure Summary

**One-liner:** Added GroupBoxNode component and migrated all group children (5 agents + local-agents + 4 dev tools) to parentId + extent:'parent' with parent-relative coordinates, keeping visual positions pixel-identical.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add parent-id migration invariants test (RED) | 7ce2c57 | src/components/flow/__tests__/parent-id-migration.test.ts |
| 2 | Migrate children to parentId + parent-relative coordinates (GREEN) | d41c1a4 | src/components/flow/react-flow-canvas.tsx |
| 3 | Visual regression check (checkpoint) | — | awaiting human-verify |

## What Was Built

### GroupBoxNode Component
A new React component registered as `groupBoxNode` in `nodeTypes`. Renders a dashed-border container div with a small uppercase label in the top-left corner. Intentionally non-interactive (`pointerEvents: "none"`, `selectable: false`, `draggable: false`). Plan 17-02 will flip it to interactive for collapse/expand.

### Group Box Nodes
Two group container nodes created inside the `nodes` useMemo:

- **`group-agents`**: position `{x: 85, y: 248}`, data `{label: "Server Agents", width: 840, height: 160}`, `zIndex: -1`
- **`group-devtools`**: position `{x: 145, y: 528}`, data `{label: "Dev Tools", width: 600, height: 160}`, `zIndex: -1`

### Parent-Relative Coordinate Formulas

**Agent children** (parentId: "group-agents"):
```
relative_x = 15 + i * agentSpacing        // absolute was: agentStartX + i * agentSpacing = 100 + i*120
relative_y = 32                             // absolute was: agentY = 280
// Math: (100 + i*120) - 85 = 15 + i*120; 280 - 248 = 32
```

**local-agents node** (parentId: "group-agents"):
```
relative_x = 15 + keyRemote.length * agentSpacing
relative_y = 32
```

**Dev tool children** (parentId: "group-devtools"):
```
relative_x = 15 + i * DEV_TOOL_SPACING    // absolute was: DEV_TOOL_START_X + i * DEV_TOOL_SPACING = 160 + i*160
relative_y = 32                             // absolute was: DEV_TOOL_Y = 560
// Math: (160 + i*160) - 145 = 15 + i*160; 560 - 528 = 32
```

### Array Ordering
`return [...groupBoxNodes, ...staticNodes, ...agentNodes, localNode, ...devToolNodes]`

Group boxes appear FIRST — mandatory for React Flow v12 parentId resolution on first render.

## GitNexus Impact Analysis

**Symbol:** ReactFlowCanvas  
**Direction:** upstream  
**Risk:** LOW  
**Direct callers affected:** 0  
**Processes affected:** 0  

Safe to proceed — no upstream dependents broken by this change.

## Deviations from Plan

### Auto-fixed Issues (Rule 3 — Blocking Issue)

**1. [Rule 3 - Blocking] Group box infrastructure did not exist in codebase**

- **Found during:** Pre-implementation read of react-flow-canvas.tsx
- **Issue:** The plan was written against an anticipated future state. The actual file had no `GroupBoxNode`, no `groupBoxNodes`, no `devToolNodes`, no `group-agents`/`group-devtools` nodes. The plan's "migrate children to parentId" action assumed these existed; they did not.
- **Fix:** Created the full group box infrastructure as part of Task 2 — GroupBoxNode component, groupBoxNode nodeType registration, DEV_TOOL_* constants, devToolNodes extraction from staticNodes, and both group box node objects.
- **Files modified:** src/components/flow/react-flow-canvas.tsx
- **Commit:** d41c1a4

**2. [Rule 1 - Deviation] DEV_TOOL_SPACING is 160, not 140**

- **Found during:** Reading current staticNodes positions
- **Issue:** Plan assumed `DEV_TOOL_SPACING = 140` (giving absolute positions x=20, 160, 300, 440). Actual dev tool nodes (cookbooks, apo, gitnexus, llmwiki) were at x=160, 320, 480, 640 — spacing of 160 with start at 160.
- **Fix:** Used `DEV_TOOL_SPACING = 160`, `DEV_TOOL_START_X = 160`, `DEV_TOOL_Y = 560`. Group-devtools at `{x:145, y:528}` (not plan's `{x:5, y:708}`).
- **Impact:** Relative formula `15 + i * DEV_TOOL_SPACING` still holds; only the constant value differs.
- **Commit:** d41c1a4

## Test Results

- `parent-id-migration.test.ts`: 8/8 pass (started RED, ended GREEN)
- Full suite: 10/10 pass (0 regressions)
- Build: success

## GroupBoxNode State (for Plan 17-02 Reference)

GroupBoxNode is currently `pointerEvents: "none"` — it is a purely visual container, not interactive. Plan 17-02 must:
1. Change `pointerEvents` to `"all"` (or remove the override)
2. Add `collapsed?: boolean` and `onToggleCollapse?: () => void` to its data shape
3. Render a toggle button in the GroupBoxNode component
4. Wire `hidden: true` on children when parent is collapsed

## Known Stubs

None — all nodes are wired with real data.

## Threat Flags

None — client-side render change only; no new network endpoints, auth paths, or trust boundaries.

## Self-Check

- [x] `src/components/flow/__tests__/parent-id-migration.test.ts` exists
- [x] `src/components/flow/react-flow-canvas.tsx` updated with parentId + extent:'parent'
- [x] Commits 7ce2c57 and d41c1a4 exist
- [x] All 8 migration tests pass
- [x] Full suite (10 tests) passes
- [x] Build succeeds

## Self-Check: PASSED
