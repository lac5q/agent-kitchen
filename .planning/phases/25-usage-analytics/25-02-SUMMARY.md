---
phase: 25-usage-analytics
plan: "02"
subsystem: ui-components
tags: [analytics, recharts, time-series, ui]
dependency_graph:
  requires: [25-01]
  provides: [ANA-01, ANA-02, ANA-03, ANA-04]
  affects: [ledger-page, library-page, cookbooks-page]
tech_stack:
  added: []
  patterns: [recharts-linechart, tdd-red-green, coordinated-window-state]
key_files:
  created:
    - src/components/shared/time-series-chart.tsx
    - src/components/shared/__tests__/time-series-chart.test.tsx
    - src/components/ledger/analytics-panel.tsx
    - src/components/library/analytics-panel.tsx
    - src/components/cookbooks/analytics-panel.tsx
  modified:
    - src/app/ledger/page.tsx
    - src/app/library/page.tsx
    - src/app/cookbooks/page.tsx
decisions:
  - "Window toggle state lives in the analytics panel (not the shared chart) — all charts on a page share one toggle via coordinated state lift"
  - "DarkTooltip uses JSX element form content={<DarkTooltip />} matching savings-chart.tsx pattern (not component reference with as any)"
  - "TimeSeriesChart is a pure presentational component receiving data as props — no hook calls inside, no QueryClientProvider needed in tests"
metrics:
  duration: "~12 minutes"
  completed: "2026-04-18"
  tasks_completed: 2
  files_created: 5
  files_modified: 3
---

# Phase 25 Plan 02: Usage Analytics UI Summary

**One-liner:** Recharts LineChart wrapped in shared TimeSeriesChart with window toggle, wired into Ledger (3 metrics), Library (2 metrics), and Cookbooks (2 metrics) pages via thin analytics panel components.

## What Was Built

### Task 1: Shared TimeSeriesChart component (TDD)

Created `src/components/shared/time-series-chart.tsx` — a pure presentational component that renders a recharts `LineChart` with:
- Day/Week/Month toggle buttons (amber active state)
- Loading spinner (`animate-spin`) when `isLoading=true`
- Empty state "No data for this period" when `points=[]`
- DarkTooltip matching the existing `savings-chart.tsx` pattern
- Customizable `lineColor` prop (defaults to amber `#f59e0b`)

8 vitest tests written first (RED), then implementation (GREEN). All pass.

**Commits:**
- `899c436`: feat(25-02): add shared TimeSeriesChart component with tests

### Task 2: Analytics panels + page wiring

Created three analytics panel components, each owning their own `window` state and calling `useTimeSeries` for their metrics:

| Panel | Metrics | Colors |
|-------|---------|--------|
| `LedgerAnalyticsPanel` | docs_ingested, memory_writes, recall_queries | amber, info, success |
| `LibraryAnalyticsPanel` | docs_ingested, collection_growth | amber, info |
| `CookbooksAnalyticsPanel` | skill_executions, skill_failures | amber, danger |

All three panels wired into their respective `page.tsx` files as single JSX element insertions.

**Commits:**
- `321a7e5`: feat(25-02): add analytics panels and wire into Ledger, Library, Cookbooks pages

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. All charts wire to live `useTimeSeries` hook backed by `/api/time-series` endpoint (delivered in Plan 01). Data flows end-to-end; no hardcoded empty values or placeholders.

## Threat Flags

No new network endpoints, auth paths, or trust boundaries introduced. All components are client-side renderers consuming the existing `/api/time-series` endpoint covered by Plan 01's threat model.

## Self-Check: PASSED

- FOUND: src/components/shared/time-series-chart.tsx
- FOUND: src/components/shared/__tests__/time-series-chart.test.tsx
- FOUND: src/components/ledger/analytics-panel.tsx
- FOUND: src/components/library/analytics-panel.tsx
- FOUND: src/components/cookbooks/analytics-panel.tsx
- FOUND: commit 899c436 (TimeSeriesChart component + tests)
- FOUND: commit 321a7e5 (analytics panels + page wiring)
