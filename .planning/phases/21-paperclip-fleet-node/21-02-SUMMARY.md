---
phase: 21-paperclip-fleet-node
plan: "02"
subsystem: paperclip-flow-ui
tags: [react-flow, react-query, tailwind, tdd, flow-diagram, fleet-visualization]
dependency_graph:
  requires:
    - "21-01 (GET /api/paperclip, usePaperclipFleet hook, PaperclipFleetResponse type)"
  provides:
    - "group-paperclip collapsible cluster in Flow diagram with dynamic fleet child nodes"
    - "PaperclipFleetPanel component with per-agent status, autonomy badges, recovery ops, dispatch form"
    - "NodeDetailPanel extended to render PaperclipFleetPanel when manager node is selected"
    - "FlowPage wired with usePaperclipFleet and props passed to both canvas and detail panel"
  affects:
    - "src/app/flow/page.tsx (new hook and prop plumbing)"
    - "src/components/flow/react-flow-canvas.tsx (group-paperclip cluster and edges)"
    - "src/components/flow/node-detail-panel.tsx (PaperclipFleetPanel conditional render)"
    - "src/lib/node-keyword-map.ts (group-paperclip and paperclip-agent keyword entries)"
tech_stack:
  added: []
  patterns:
    - "groupBoxNode parentId/extent:parent pattern (reuse of Phase 17 pattern)"
    - "Dynamic fleet child nodes from API data in useMemo"
    - "aggregateHealthColor for fleet aggregate status (reuse of existing collapse-logic helper)"
    - "RTL vi.mock + global.fetch mocking for dispatch form tests"
    - "File-read introspection tests for structural wiring guards"
key_files:
  created:
    - src/components/flow/paperclip-fleet-panel.tsx
    - src/components/flow/__tests__/paperclip-fleet-panel.test.tsx
    - src/components/flow/__tests__/paperclip-flow-structure.test.ts
  modified:
    - src/components/flow/react-flow-canvas.tsx
    - src/components/flow/node-detail-panel.tsx
    - src/app/flow/page.tsx
    - src/lib/node-keyword-map.ts
decisions:
  - "group-paperclip placed at PAPERCLIP_START_X=560, PAPERCLIP_Y=560 — below and right of main request path to avoid overlap with manager node"
  - "Dynamic group width: max(300, 30 + agentCount * 120) — adapts to fleet size without overflow"
  - "paperclip-fleet-panel.tsx uses relative time display for lastHeartbeat matching HiveFeed pattern"
  - "Structure tests use fs.readFileSync introspection (parent-id-migration pattern) — no full React Flow renderer needed"
  - "Working-tree partial revert of react-flow-canvas.tsx discovered during continuation; restored via git checkout HEAD"
metrics:
  duration: "~25 minutes"
  completed: "2026-04-18"
  tasks_completed: 2
  tasks_total: 2
  files_created: 3
  files_modified: 4
  tests_added: 13
  tests_passing: 13
---

# Phase 21 Plan 02: Paperclip Fleet Flow Visualization Summary

**One-liner:** Collapsible `group-paperclip` fleet cluster in the Flow diagram plus `PaperclipFleetPanel` in the manager node detail — dispatch form, per-agent autonomy badges, and recovery operations — 13 tests passing, browser-verified.

## What Was Built

### PaperclipFleetPanel (`src/components/flow/paperclip-fleet-panel.tsx`)

New `"use client"` component accepting `{ fleet: PaperclipFleetResponse | null; isLoading: boolean }`:

- **Summary cards:** fleetStatus badge, activeAgents/totalAgents count, activeTasks, pausedRecoveries
- **Per-agent list:** name, status dot, autonomy mode badge (Interactive=sky, Autonomous=emerald, Continuous=violet, Hybrid=amber), activeTask text or "idle", lastHeartbeat as relative time
- **Recovery operations:** taskId truncated, sessionId truncated, status chip, completedSteps count, resumeFrom label
- **Dispatch form:** text input + submit. POST to `/api/paperclip` with `{taskSummary, requestedBy:"dashboard"}`. Inline success (with taskId) or error. Clears input on success.
- **Loading:** animate-spin spinner. **Null/empty fleet:** "Fleet offline" message.

### Flow Canvas (`src/components/flow/react-flow-canvas.tsx`)

Extended `ReactFlowCanvasProps` with `paperclipFleet?: PaperclipFleetResponse | null`:

- `group-paperclip` groupBoxNode added before dynamic children in baseNodes array
- Dynamic child nodes mapped from `paperclipFleet.agents` — `id: paperclip-{agent.id}`, `parentId: "group-paperclip"`, `extent: "parent"`, spaced 120px apart
- `aggregateHealthColor(paperclipStatuses)` drives group border color
- `group-paperclip` collapsed stats case: Fleet status, Agents ratio, Active Tasks, Paused recoveries
- Edges from `manager` to each paperclip child node (`animated: true`)
- Empty/offline fleet: group-paperclip still renders with no children (offline aggregate color)

### Node Detail Panel (`src/components/flow/node-detail-panel.tsx`)

- Extended props: `paperclipFleet?: PaperclipFleetResponse | null`, `paperclipLoading?: boolean`
- When `nodeId === "manager"`: renders `<PaperclipFleetPanel fleet={paperclipFleet} isLoading={paperclipLoading} />` between Stats and Heartbeat sections

### Flow Page (`src/app/flow/page.tsx`)

- Added `usePaperclipFleet()` hook
- Passes `paperclipFleet` to both `ReactFlowCanvas` and `NodeDetailPanel`

### Node Keyword Map (`src/lib/node-keyword-map.ts`)

- Added `group-paperclip` and `paperclip-agent` keyword entries for activity highlighting consistency

## Commits

| Hash | Type | Description |
|------|------|-------------|
| 4bd2489 | test | Add failing tests for PaperclipFleetPanel and flow structure guards (TDD RED) |
| d228116 | feat | Implement PaperclipFleetPanel, group-paperclip cluster, and all Flow wiring (GREEN) |

## Test Results

All 13 tests pass:

| Test | Requirement | File | Description |
|------|-------------|------|-------------|
| 1 | DASH-03 | fleet-panel | Renders per-agent rows with name, autonomy badge, active task, last heartbeat |
| 2 | PAPER-03 | fleet-panel | Autonomy badges render exact vocab: Interactive, Autonomous, Continuous, Hybrid |
| 3 | PAPER-04 | fleet-panel | Recovery rows show sessionId, completedSteps count, resumeFrom, status |
| 4 | PAPER-02 | fleet-panel | Dispatch form POSTs to /api/paperclip with taskSummary and requestedBy |
| 5 | PAPER-02 | fleet-panel | Successful dispatch shows success state and clears input |
| 6 | PAPER-02 | fleet-panel | Failed dispatch surfaces inline error message |
| 7 | — | fleet-panel | Loading spinner; null fleet renders empty state without crash |
| 8 | PAPER-01 | flow-structure | react-flow-canvas.tsx contains group-paperclip group box node |
| 9 | PAPER-01 | flow-structure | Paperclip child nodes use parentId: "group-paperclip" and extent: "parent" |
| 10 | — | flow-structure | manager node NOT assigned parentId: "group-paperclip" |
| 11 | PAPER-01 | flow-structure | Collapsed summary references live fleet data (not hard-coded string) |
| 12 | DASH-03 | flow-structure | node-detail-panel.tsx renders PaperclipFleetPanel when nodeId is manager |
| 13 | — | flow-structure | flow/page.tsx imports usePaperclipFleet and passes paperclipFleet into child components |

## Browser Verification

User verified in browser (approved signal received):
- manager node remains in main request path (not moved into group-paperclip)
- group-paperclip cluster renders as a collapsible group (offline/dormant state when no Paperclip running)
- Click manager -> PaperclipFleetPanel appears in detail panel with dispatch form, fleet status
- Dispatch form shows correct error state (502/503) when Paperclip upstream not running
- Collapsing/expanding group-agents and group-devtools still works (no regression)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Partial revert of react-flow-canvas.tsx in working tree**
- **Found during:** Continuation agent startup — tests failing because paperclipFleet removed from canvas
- **Issue:** A previous session had partially reverted `src/components/flow/react-flow-canvas.tsx` and `src/app/flow/page.tsx` in the working tree (removing paperclipFleet prop from canvas while keeping it in page.tsx), causing 3 structure test failures
- **Fix:** `git checkout HEAD -- src/components/flow/react-flow-canvas.tsx src/app/flow/page.tsx` to restore committed state
- **Files modified:** src/components/flow/react-flow-canvas.tsx, src/app/flow/page.tsx
- **Commit:** N/A — restored to d228116 committed state

## Known Stubs

None. PaperclipFleetPanel renders real API data from `usePaperclipFleet()` (wired in Plan 01). Offline/empty states are graceful, not stubs.

## Threat Flags

None. PaperclipFleetPanel renders operational metadata as text content (not innerHTML). No new trust boundaries beyond what the plan's threat model (T-21-05, T-21-06, T-21-07) covers.

## Self-Check: PASSED

- [x] `src/components/flow/paperclip-fleet-panel.tsx` created — exports `PaperclipFleetPanel`
- [x] `src/components/flow/__tests__/paperclip-fleet-panel.test.tsx` created — 7 tests
- [x] `src/components/flow/__tests__/paperclip-flow-structure.test.ts` created — 6 tests
- [x] `src/components/flow/react-flow-canvas.tsx` modified — contains `group-paperclip`
- [x] `src/components/flow/node-detail-panel.tsx` modified — contains `PaperclipFleetPanel`
- [x] `src/app/flow/page.tsx` modified — imports and uses `usePaperclipFleet`
- [x] Commits 4bd2489, d228116 confirmed in git log
- [x] All 13 tests pass (7 fleet-panel + 6 flow-structure)
- [x] `npm run build` passes (1 pre-existing turbopack NFT warning, unrelated)
- [x] Browser verified by user (approved signal)
