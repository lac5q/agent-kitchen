# Phase 21: Paperclip Fleet Node — Research

**Researched:** 2026-04-17
**Domain:** React Flow grouped nodes, Next.js App Router API adapters, React Query polling, SQLite-backed recovery state
**Confidence:** HIGH (all recommendations grounded in current codebase patterns; no new packages required)

---

## Summary

Phase 21 should be implemented in two waves.

Wave 1 adds a dedicated Paperclip adapter route at `/api/paperclip` plus a typed client hook. The route should proxy live fleet state from the Paperclip service, derive recovery state from the existing Phase 20 hive tables, and own dashboard dispatch requests. No schema migration is needed: `hive_delegations.checkpoint` already supports JSON recovery blobs, and `hive_actions.session_id` already exists for session-scoped step history.

Wave 2 uses that normalized route in the Flow page and node detail UI. The Flow diagram should keep the existing `manager` node as the always-visible orchestration hub, then add a separate collapsible `group-paperclip` cluster for fleet workers using the Phase 17 `parentId` + `extent: "parent"` pattern. That preserves the main request path (`gateways -> manager -> output/taskboard`) while still satisfying PAPER-01 with a real collapsible Paperclip fleet group. The Flow node detail panel for `manager` should host a dedicated Paperclip fleet panel with dispatch, per-agent autonomy badges, active task state, last heartbeat, and recovery/session tracking.

**Primary recommendation:** `GET/POST /api/paperclip` adapter + `usePaperclipFleet()` in Wave 1, then `group-paperclip` Flow group + `PaperclipFleetPanel` in Wave 2.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PAPER-01 | Paperclip appears as a collapsible group node in Flow; collapsed shows fleet health summary, expanded shows individual agent status | Add `group-paperclip` group box in `src/components/flow/react-flow-canvas.tsx`; fleet child nodes use `parentId: "group-paperclip"` and existing collapse logic |
| PAPER-02 | Work can be assigned to Paperclip at fleet level from the dashboard; fleet dispatches internally | `POST /api/paperclip` handles dispatch, writes local delegation/action records, forwards to upstream Paperclip dispatch endpoint |
| PAPER-03 | Each Paperclip agent exposes autonomy mode in the expanded fleet panel | Normalize autonomy mode in `/api/paperclip`; render badges in `PaperclipFleetPanel` and optionally in child node subtitles |
| PAPER-04 | Long-running fleet operations track completed steps with session IDs for recovery after interruption | Reuse `hive_delegations.checkpoint` JSON + `hive_actions.session_id`; no DB migration required |
| DASH-03 | Flow node detail shows per-agent status, autonomy mode, active task, last heartbeat | Add `PaperclipFleetPanel` inside `src/components/flow/node-detail-panel.tsx` for `manager` |
</phase_requirements>

---

## Current Codebase Findings

### 1. Flow grouping and collapse already exist

Verified files:
- `src/components/flow/react-flow-canvas.tsx`
- `src/lib/flow/collapse-logic.ts`
- `src/components/flow/__tests__/parent-id-migration.test.ts`
- `src/lib/flow/__tests__/collapse-logic.test.ts`

Existing behavior:
- `group-agents` and `group-devtools` already use `groupBoxNode` + `parentId` + `extent: "parent"`
- `collapsedGroups: Set<string>` already drives hide/show via `applyCollapseToNodes()` and `applyCollapseToEdges()`
- group nodes already expose collapsed state and aggregate health color

Implication for Phase 21:
- Phase 21 should reuse the same mechanism instead of inventing a second collapse system
- Adding a third group (`group-paperclip`) is lower risk than refactoring collapse logic

### 2. The main request path already depends on the `manager` node

Verified files:
- `src/components/flow/react-flow-canvas.tsx`
- `src/app/flow/page.tsx`
- `src/lib/node-keyword-map.ts`

Current behavior:
- `manager` is the Paperclip/orchestrator node in the main path
- Edges connect `gateways -> manager -> output` and `manager -> taskboard`
- `manager` is already the Paperclip alias in node-keyword mapping

Implication for Phase 21:
- Do not replace `manager` outright with a group node
- Keep `manager` visible as the stable orchestration hub
- Add a separate `group-paperclip` cluster for fleet workers so the main path remains legible when the fleet cluster is collapsed

### 3. Flow detail UI already supports node-specific sections

Verified files:
- `src/components/flow/node-detail-panel.tsx`
- `src/app/api/heartbeat/route.ts`

Current behavior:
- Node detail panel already has conditional sections (`cookbooks` heatmap, heartbeat block, per-node activity)
- Panel handles loading and graceful degradation

Implication for Phase 21:
- Add a dedicated `PaperclipFleetPanel` subcomponent and render it when `nodeId === "manager"`
- Keep `node-detail-panel.tsx` as the orchestration layer instead of embedding dispatch logic directly in `FlowPage`

### 4. Real-time data fetching uses React Query polling, not SSE/WebSockets

Verified files:
- `src/lib/api-client.ts`
- `src/lib/constants.ts`
- `src/app/page.tsx`
- `src/app/flow/page.tsx`

Current behavior:
- API hooks follow a consistent `useQuery + fetchJSON + refetchInterval` pattern
- Kitchen Floor and Flow Page load data at page level, then pass typed props down

Implication for Phase 21:
- Add `usePaperclipFleet()` to `src/lib/api-client.ts`
- Fetch fleet data in `src/app/flow/page.tsx`
- Pass the normalized data into `ReactFlowCanvas` and `NodeDetailPanel`

### 5. Recovery/session primitives already exist in the DB

Verified files:
- `src/lib/db-schema.ts`
- `src/app/api/hive/route.ts`
- `src/app/api/hive/__tests__/route.test.ts`

Existing data:
- `hive_actions.session_id` for action-scoped correlation
- `hive_delegations.checkpoint` JSON blob for recovery progress
- `hive_delegations.status` supports `pending | active | paused | completed | failed`

Implication for Phase 21:
- Store `sessionId` inside the delegation checkpoint JSON for Paperclip operations
- Use `hive_actions.session_id` to log step progress for the same operation
- Do not add a new table or alter existing schema in Phase 21

### 6. There is no existing Paperclip dashboard adapter

Verified files:
- `src/app/api/health/route.ts`
- `src/app/api/remote-agents/route.ts`
- `agents.config.json`

Gap:
- No `/api/paperclip` route exists
- No Paperclip fleet types or client hook exist
- Health checks mention Paperclip in docs/specs, but current `/api/health` does not probe it

Implication for Phase 21:
- Phase 21 needs a normalized adapter route before any UI work is stable
- Adding UI first would force hard-coded fake data or duplicate fetch logic

---

## Recommended Architecture

### Pattern 1: Normalize Paperclip into one dashboard route

Create `src/app/api/paperclip/route.ts` with:

- `GET /api/paperclip`
  - fetches live fleet state from the upstream Paperclip service
  - reads local `hive_delegations` where `to_agent = 'paperclip'`
  - reads local `hive_actions` where `agent_id = 'paperclip'` and `session_id IS NOT NULL`
  - returns one normalized payload for the dashboard

- `POST /api/paperclip`
  - validates a dashboard dispatch request
  - forwards it to the upstream Paperclip dispatch endpoint
  - on success, writes:
    - one `hive_delegations` row with checkpoint JSON containing `sessionId`
    - one `hive_actions` row with `agent_id = 'paperclip'`, `action_type = 'trigger'`, `session_id = <same sessionId>`

Recommended env vars:

```bash
PAPERCLIP_BASE_URL=http://localhost:3100
PAPERCLIP_STATUS_PATH=/api/fleet
PAPERCLIP_DISPATCH_PATH=/api/dispatch
```

Recommended normalized response shape:

```typescript
type AutonomyMode = "Interactive" | "Autonomous" | "Continuous" | "Hybrid";

interface PaperclipFleetSummary {
  fleetStatus: "active" | "degraded" | "offline";
  totalAgents: number;
  activeAgents: number;
  activeTasks: number;
  pausedRecoveries: number;
  autonomyMix: Record<AutonomyMode, number>;
  lastHeartbeat: string | null;
}

interface PaperclipFleetAgent {
  id: string;
  name: string;
  status: "active" | "idle" | "dormant" | "error";
  autonomyMode: AutonomyMode;
  activeTask: string | null;
  lastHeartbeat: string | null;
}

interface PaperclipOperation {
  taskId: string;
  sessionId: string;
  status: "pending" | "active" | "paused" | "completed" | "failed";
  summary: string;
  resumeFrom: string | null;
  completedSteps: string[];
  updatedAt: string;
}
```

Why a dedicated route:
- keeps the browser insulated from upstream Paperclip payload changes
- centralizes DB joins and checkpoint parsing on the server
- matches the existing `/api/*` dashboard architecture

### Pattern 2: Keep `manager`, add `group-paperclip`

Use the existing Flow layout rules:

- keep `manager` as the main orchestration node in the request path
- add a new group box node, `group-paperclip`
- render Paperclip fleet children under that group with `parentId: "group-paperclip"`
- wire `manager -> paperclip-agent-*` edges

This avoids breaking:
- `gateways -> manager -> output`
- `manager -> taskboard`
- existing node keyword matching for `manager`

Recommended UI behavior:
- collapsed `group-paperclip`: aggregate health color + short fleet summary
- expanded `group-paperclip`: individual child nodes with status ring + autonomy/task subtitle
- clicking `manager`: opens full Paperclip fleet detail panel

### Pattern 3: Use a dedicated panel component in node detail

Add `src/components/flow/paperclip-fleet-panel.tsx`.

Responsibilities:
- render summary stats
- render per-agent table/list
- render autonomy mode badges
- render active task + last heartbeat
- render recovery operations with `sessionId`, `completedSteps`, `resumeFrom`
- render a small dispatch form that POSTs to `/api/paperclip`

Why a separate component:
- keeps `node-detail-panel.tsx` from becoming a second large feature component
- makes Vitest/RTL coverage straightforward without needing full React Flow rendering

### Pattern 4: Session recovery uses existing hive data

No schema change is needed if the dispatch route writes checkpoint JSON like:

```json
{
  "sessionId": "sess_abc123",
  "completedSteps": ["plan", "fanout"],
  "lastStepAt": "2026-04-17T23:12:00Z",
  "resumeFrom": "collect-results"
}
```

And writes hive actions like:

```json
{
  "agent_id": "paperclip",
  "action_type": "checkpoint",
  "summary": "Recovered session sess_abc123 after fanout",
  "session_id": "sess_abc123"
}
```

Why this is enough:
- `hive_delegations` already tracks mutable operation state
- `hive_actions` already tracks step history with `session_id`
- the dashboard can reconstruct recovery without adding another table

---

## Testing Strategy

### Wave 1

| Requirement | Test File | Command |
|-------------|-----------|---------|
| PAPER-02 | `src/app/api/paperclip/__tests__/route.test.ts` | `npx vitest run src/app/api/paperclip/__tests__/route.test.ts` |
| PAPER-04 | `src/app/api/paperclip/__tests__/route.test.ts` | same |

Key route tests:
- GET normalizes upstream fleet payload into dashboard shape
- GET still returns local recovery operations when upstream Paperclip is offline
- POST validates dispatch body and rejects missing task summary
- POST success writes delegation checkpoint JSON containing `sessionId`
- POST success writes `hive_actions` with `agent_id="paperclip"` and matching `session_id`

### Wave 2

| Requirement | Test File | Command |
|-------------|-----------|---------|
| PAPER-01 | `src/components/flow/__tests__/paperclip-flow-structure.test.ts` | `npx vitest run src/components/flow/__tests__/paperclip-flow-structure.test.ts` |
| PAPER-03 | `src/components/flow/__tests__/paperclip-fleet-panel.test.tsx` | `npx vitest run src/components/flow/__tests__/paperclip-fleet-panel.test.tsx` |
| DASH-03 | `src/components/flow/__tests__/paperclip-fleet-panel.test.tsx` | same |
| PAPER-02 | `src/components/flow/__tests__/paperclip-fleet-panel.test.tsx` | same |

Key UI tests:
- Flow structure contains `group-paperclip` and children use `parentId: "group-paperclip"`
- collapsed summary derives from fleet data
- panel renders agent rows with autonomy badges, task, heartbeat
- panel renders recovery/session rows
- dispatch form POSTs to `/api/paperclip` and surfaces success/error state

Manual checkpoint still recommended after Wave 2:
- `npm run build`
- open `/flow`
- verify collapsed/expanded Paperclip cluster and detail panel behavior in browser

---

## Risks And Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Upstream Paperclip payload differs from assumption | Route breaks or UI hardcodes wrong shape | Normalize in `/api/paperclip`; keep browser contract owned locally |
| Flow clutter increases when Paperclip children are added | Diagram becomes unreadable | Keep `manager` stable and put workers in their own collapsible cluster |
| Recovery state drifts between upstream Paperclip and local hive tables | Dashboard shows inconsistent progress | Treat local hive tables as dashboard recovery source of truth; upstream only supplies live fleet health |
| Dispatch writes local records before upstream accepts work | Phantom operations appear | Write DB rows only after upstream dispatch returns success |

---

## Resolved Questions

### Q1. Do we need a new DB table for Paperclip operations?
**RESOLVED:** No. Use `hive_delegations.checkpoint` for recovery and `hive_actions.session_id` for step history.

### Q2. Should Phase 21 replace the existing `manager` node?
**RESOLVED:** No. Keep `manager` as the stable hub and add `group-paperclip` as the collapsible fleet cluster.

### Q3. Where should the dispatch form live?
**RESOLVED:** In a dedicated `PaperclipFleetPanel` rendered inside `NodeDetailPanel` for the `manager` node.

### Q4. How should autonomy modes be represented?
**RESOLVED:** Normalize to the requirement vocabulary exactly: `Interactive`, `Autonomous`, `Continuous`, `Hybrid`.

### Q5. Do we need live push transport for fleet status?
**RESOLVED:** No. Use the existing React Query polling pattern; no SSE/WebSocket work in Phase 21.

---

## Recommended Wave Breakdown

### Wave 1
- Add `/api/paperclip` GET/POST adapter
- Add fleet types and `usePaperclipFleet()` hook
- Validate dispatch + recovery/session plumbing with Vitest

### Wave 2
- Add `group-paperclip` Flow cluster
- Add `PaperclipFleetPanel`
- Wire fleet data through `FlowPage`, `ReactFlowCanvas`, and `NodeDetailPanel`
- Add browser checkpoint for collapsed/expanded behavior

---

## Recommendation

Proceed with two plans:

1. `21-01-PLAN.md` — Paperclip adapter route, dispatch, recovery/session normalization, types, client hook
2. `21-02-PLAN.md` — Flow group node, fleet detail panel, dashboard dispatch UI, browser verification checkpoint

This split matches the repo’s existing planning style and keeps the riskiest work isolated: backend contract first, UI second.
