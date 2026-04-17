---
phase: 19-sqlite-conversation-store
plan: 03
subsystem: dashboard-ui
tags: [sqlite, react, tanstack-query, ledger, kpi-card, vitest, tdd]

requires:
  - 19-02 (GET /api/recall/stats, POST /api/recall/ingest API routes)

provides:
  - useRecallStats hook in api-client.ts querying /api/recall/stats
  - SqliteHealthPanel component with 4 KPI cards and Run Ingest button
  - SqliteHealthPanel wired into Ledger page after CostCalculator

affects:
  - src/app/ledger/page.tsx (SqliteHealthPanel rendered as last child)
  - src/lib/api-client.ts (useRecallStats exported)

tech-stack:
  added: []
  patterns:
    - useQuery hook with manual-only refresh (no auto-refetch interval)
    - useQueryClient.invalidateQueries on successful POST to refresh stats
    - Button state machine: idle -> loading -> success/error -> idle
    - 2-second auto-revert from success state via setTimeout
    - vi.stubGlobal('fetch') in test to isolate button click behavior
    - QueryClientProvider wrapper in tests for useQueryClient compatibility

key-files:
  created:
    - src/components/ledger/sqlite-health-panel.tsx
    - src/components/ledger/__tests__/sqlite-health-panel.test.tsx
  modified:
    - src/lib/api-client.ts
    - src/app/ledger/page.tsx

key-decisions:
  - "useRecallStats has no refetchInterval — data refreshes only via Run Ingest button invalidation (stat staleness is acceptable for manual dashboard)"
  - "Button state machine uses 4 states (idle/loading/success/error) with 2s auto-revert from success"
  - "Error state persists until next click — user must see error and retry explicitly"
  - "formatNum, formatBytes, formatRelativeTime helpers defined inside component file — not extracted to shared module (out of scope for this plan)"
  - "Tests wrap renders in QueryClientProvider to support useQueryClient() in component"

requirements-completed:
  - SQLDB-04
  - DASH-01

duration: 20min
completed: 2026-04-17
---

# Phase 19 Plan 03: SQLite Health Panel Summary

**SqliteHealthPanel component with 4 KPI cards (Conversations, DB Size, Last Ingest, Last Recall) and Run Ingest button wired into the Ledger page, backed by useRecallStats hook querying /api/recall/stats**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-04-17
- **Tasks:** 1 completed (Task 2 is checkpoint:human-verify — awaiting human approval)
- **Files modified:** 4
- **Tests:** 5 passing

## Accomplishments

- `useRecallStats` hook added to api-client.ts — queries `/api/recall/stats` with no auto-refresh (manual via button)
- `SqliteHealthPanel` renders 4 KPI cards: Conversations (sky-400), DB Size (violet-400), Last Ingest (amber-400), Last Recall (slate-100)
- "Run Ingest" button implements 4-state machine: idle → loading (disabled) → success (emerald, 2s) → idle; error state persists until retry
- On success: `queryClient.invalidateQueries({ queryKey: ['recall-stats'] })` refreshes the stats panel
- Loading state: all card values show "—"
- Error state: all card values show "—", Conversations subtitle shows "Database unavailable — check data/conversations.db path"
- Helper functions: `formatBytes`, `formatRelativeTime`, `formatNum` — all defined locally in component file
- Panel wired into Ledger page as last element after `<CostCalculator />`
- 5 vitest tests pass covering all plan behaviors (labels, colors, button, loading, error)

## Task Commits

1. **Task 1 RED: Failing tests for SqliteHealthPanel** - `8b2cb5b` (test)
2. **Task 1 GREEN: SqliteHealthPanel component, useRecallStats hook, Ledger wiring** - `3a31c24` (feat)

## Files Created/Modified

- `src/components/ledger/sqlite-health-panel.tsx` — SqliteHealthPanel component with 4 KPI cards, ingest button, helper formatters
- `src/components/ledger/__tests__/sqlite-health-panel.test.tsx` — 5 tests covering all plan behaviors
- `src/lib/api-client.ts` — useRecallStats hook appended (existing hooks untouched)
- `src/app/ledger/page.tsx` — SqliteHealthPanel import + render after CostCalculator

## Decisions Made

- **No auto-refresh on useRecallStats:** The recall stats are effectively a "point in time" snapshot. Auto-refreshing would cause unnecessary DB hits. Manual refresh via "Run Ingest" invalidation is sufficient.
- **QueryClientProvider in tests:** `useQueryClient()` requires a provider context. Tests wrap renders in a fresh `QueryClient` + `QueryClientProvider` to avoid the "No QueryClient set" error.
- **Button state machine 4-state:** `idle | loading | success | error` — success auto-reverts after 2s, error persists until next click (T-19-07 DoS mitigation: button disabled during loading).
- **Local helper functions:** `formatNum`, `formatBytes`, `formatRelativeTime` are defined inside the component file — not extracted to shared utilities (would require a separate refactor plan).

## Deviations from Plan

None — plan executed exactly as written. The `QueryClientProvider` wrapper in tests was applied proactively based on advisor guidance (not a deviation, just correct implementation given the component uses `useQueryClient()`).

## Known Stubs

None — all 4 KPI cards are wired to live data from `/api/recall/stats`. Values show "—" only during loading or error state.

## Threat Surface

T-19-07 mitigated: button is `disabled` during loading state, preventing concurrent ingest clicks.
T-19-08 accepted: last recall query text is the user's own input; single-user local tool.

No new threat surface introduced beyond what was in the plan's threat model.

---

## Self-Check: PASSED

Files exist:
- FOUND: src/components/ledger/sqlite-health-panel.tsx
- FOUND: src/components/ledger/__tests__/sqlite-health-panel.test.tsx
- FOUND: src/lib/api-client.ts (modified)
- FOUND: src/app/ledger/page.tsx (modified)

Commits exist:
- FOUND: 8b2cb5b (test RED)
- FOUND: 3a31c24 (feat GREEN)

Tests: 5 passing, 0 failing

*Phase: 19-sqlite-conversation-store*
*Completed: 2026-04-17*
