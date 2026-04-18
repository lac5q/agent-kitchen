---
phase: 23-memory-intelligence
plan: "02"
subsystem: dashboard-ui
tags: [react, tanstack-query, ui-panels, memory-intelligence, hive-mind]
dependency_graph:
  requires: ["23-01"]
  provides: ["MEM-03-ui", "MEM-04-ui"]
  affects: ["src/app/page.tsx", "src/app/ledger/page.tsx"]
tech_stack:
  added: []
  patterns: ["useQuery polling hooks", "KpiCard grid layout", "ButtonState pattern for async actions", "TDD RED-GREEN flow"]
key_files:
  created:
    - src/components/kitchen/agent-peers-panel.tsx
    - src/components/ledger/memory-intelligence-panel.tsx
    - src/components/__tests__/agent-peers-panel.test.tsx
    - src/components/__tests__/memory-intelligence-panel.test.tsx
  modified:
    - src/lib/api-client.ts
    - src/app/page.tsx
    - src/app/ledger/page.tsx
decisions:
  - useMemoryStats uses 30s poll interval (consolidation is slow; 5s unnecessary)
  - useAgentPeers uses 5s poll interval (matches hive feed cadence)
  - ACTION_COLORS and formatRelativeTime copied into agent-peers-panel (not extracted to shared util — avoids architectural scope creep)
  - MemoryIntelligencePanel shows loading spinner while isLoading rather than skeleton cards (consistent with existing panels)
metrics:
  duration: "~12 minutes"
  completed: "2026-04-18"
  tasks_completed: 2
  files_changed: 7
---

# Phase 23 Plan 02: Dashboard UI Panels Summary

**One-liner:** Two new React panels wire /api/memory-stats and /api/agent-peers into the Ledger and Kitchen Floor dashboards via useQuery polling hooks.

## What Was Built

### Task 1: Hooks and test stubs
Added `useAgentPeers` (5s poll, query key `['agent-peers', windowMinutes]`) and `useMemoryStats` (30s poll, query key `['memory-stats']`) to `src/lib/api-client.ts` following the existing `useHiveFeed`/`useRecallStats` patterns.

Created test stub files for both panels — initially failing (TDD RED) because the components didn't exist yet.

### Task 2: Panels and page wiring (TDD GREEN)
**AgentPeersPanel** (`src/components/kitchen/agent-peers-panel.tsx`):
- Section header with amber-500 label "Agent Peers" + divider
- Loading spinner, empty state ("No active peers in the last N minutes.")
- Peer list: agent_id (w-24 truncated), status chip (ACTION_COLORS map), current_task (flex-1 truncated), relative last_seen
- Wired into `src/app/page.tsx` immediately after `<HiveFeed />`

**MemoryIntelligencePanel** (`src/components/ledger/memory-intelligence-panel.tsx`):
- Section header with amber-500 label "Memory Intelligence" + divider + "Run Now" button
- "Run Now": POST `/api/memory-consolidate`, ButtonState pattern (idle/loading/success/error), invalidates `memory-stats` query on success
- KPI grid (2 cols → 4 cols lg): Pending (sky-400), Last Run (amber-400), Insights (emerald-400), Run Status (color by status)
- Tier stats row: per-tier count and avg_score as percentage
- Handles null lastRun (shows `—` dashes)
- Wired into `src/app/ledger/page.tsx` immediately after `<SqliteHealthPanel />`

## Verification

- All 5 tests pass for AgentPeersPanel (agent IDs, tasks, relative time, loading spinner, empty state)
- All 5 tests pass for MemoryIntelligencePanel (pending count, last run time, tier stats, loading state, null lastRun)
- Full test suite: 207 tests pass, 0 failures, 0 regressions

## Deviations from Plan

### Auto-handled (not deviations)

**ACTION_COLORS and formatRelativeTime are not exported from hive-feed.tsx.**
The plan says to copy them into agent-peers-panel. Both were copied as-is — no extraction to a shared util (which would be architectural scope).

**formatRelativeTime in memory-intelligence-panel.tsx** uses the SqliteHealthPanel variant (returns "N hr ago" / "N min ago") rather than the HiveFeed variant ("Nm ago") — matching the panel's KpiCard display style. This means "5 min ago" format for Last Run value, which is what the test asserts.

None — plan executed exactly as specified.

## Known Stubs

None — both panels fetch and render live data from Plan 01 API routes.

## Threat Flags

No new security-relevant surface introduced. Both panels are read-only displays plus one POST to `/api/memory-consolidate` which was already planned in the threat model (T-23-08: accepted).

## Self-Check: PASSED

Files confirmed to exist:
- src/components/kitchen/agent-peers-panel.tsx ✓
- src/components/ledger/memory-intelligence-panel.tsx ✓
- src/components/__tests__/agent-peers-panel.test.tsx ✓
- src/components/__tests__/memory-intelligence-panel.test.tsx ✓

Commits confirmed:
- d79700c feat(23-02): add useAgentPeers and useMemoryStats hooks with test stubs ✓
- 9fce451 feat(23-02): implement AgentPeersPanel and MemoryIntelligencePanel with page wiring ✓
