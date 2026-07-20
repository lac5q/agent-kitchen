# NOC Metrics Rethink — Audit (2026-07-20)

Branch: `gsd/v8.18-noc-ux-rethink` · Worktree: `/tmp/memroos-noc-ux` · Off `origin/main` (9b16b4b0)

## Problem statement (operator, verbatim)

"The front NOC metrics don't report anything right now, they're mostly empty and they should mostly report useful Memroos metrics. We need to rethink what's being displayed from the ground up to make sure it's meaningful to users."

## Current surface inventory

Composition: `apps/memroos/src/components/operations/index.tsx` — 13 panels in 7 rows, client-rendered, dynamic imports.

| # | Panel | Data source(s) | Empty-state today |
|---|-------|----------------|-------------------|
| 1 | PulseStrip (6 KPIs) | `useOperationsNoc`, `useHiveFeed`, `useDelegations`, `useModelUsage` | "no data" badge per KPI |
| 2 | EfficiencySignals | `useOperationsNoc` → `efficiency_events` table | "No events" per metric; full EMPTY_METRICS fallback |
| 3 | MemoryConsumption | `useMemoryStats`, `useTimeSeries(memory_writes/recall_queries)` | "chart-empty" / "empty-series" blocks |
| 4 | MemoryNotDigested | `useMemoryStats`, `useMemoryTierHealth` | — |
| 5 | AgentWorkload | `useAgents`, `useHiveFeed(500)`, `useAgentPeers(1440)` | "Healthy /api/hive returned zero actions. The workload panel is empty by design." |
| 6 | ModelUtility | `useModelUsage` | "empty-models" block |
| 7 | ActivityHeatmap | `useHiveFeed(500)` | — |
| 8 | SkillsLifecycle | `useSkills`, `useSealProposals(pending)` | — |
| 9 | BehaviorSignals | `useSecurityReport`, `useEscalations`, `useSkills`, `useModelRoutingDashboard`, `useMemoryStats` | — |
| 10 | GovernanceStrip | `useSecurityReport`, `useOrchestrationHil`, `useAuditLog` | — |
| 11 | Savings | `useModelUsage(24h)` | — |
| 12 | Waste | `useModelUsage(24h)`, `useHiveFeed`, `useDelegations`, `useSkills` | — |
| 13 | NocHeader | filters only | n/a |

## Backend inventory

`/api/operations/noc/route.ts` (814 lines) serves:
- **Pulse KPIs** from SQLite: `messages`, `hive_delegations`, `hive_actions`, `audit_entries`, `skill_registry`, `cron_health_jobs` — these tables exist and some have data (cron_health wired v8.13).
- **Efficiency metrics** from `efficiency_events` — **this is the empty one.** v7.4 (Phase 117, EFFTEL-01..05) was supposed to populate it; the instrumentation landed but events are sparse/absent in practice. Confirmed by STATE.md: "Phase 159 stopped at Hermes dual-mode memory provider."

Separate API routes feed the other panels (`/api/hive`, `/api/model-usage`, `/api/memory/*`, `/api/skills`, `/api/security`, `/api/audit`, etc.) — several of these return zero rows on a fresh operator because the underlying activity sources (hive delegations, hive_actions) are Hermes-local concepts that only fill when the hive is in use.

## Root-cause findings

| Root cause | Evidence |
|------------|----------|
| 1. Panels were designed against aspirational data contracts, not what the operator actually generates day-1 | `EMPTY_METRICS` fallback + "empty by design" copy in AgentWorkload |
| 2. `efficiency_events` instrumentation (EFFTEL) never got its producers wired into the harness paths operators actually run | STATE.md still open: ENTOPS-07 Claude/Codex wiring; Hermes rewrite deferred |
| 3. Hive-centric panels (workload, heatmap, savings/waste) presume hive activity; a single-operator install has none | `useHiveFeed` consumers: 5 of 13 panels |
| 4. No panel answers the operator's actual day-1 questions: "Is memory working? What did agents learn? Is anything broken? What's costing me money?" | Panel names vs. available tables (messages, memory tiers, cron_health_jobs, model_usage ledger) |
| 5. Empty states describe the absence ("No events") instead of the meaning (what this panel will show, what to do to fill it) | `formatPercent(null) → "No events"` |

## What data IS available day-1 (verified tables in noc/route.ts + hooks)

- `messages` (chat volume, timestamps)
- `cron_health_jobs` (status, last_failure, warning) — wired in v8.13
- `skill_registry` (enabled count)
- `audit_entries` (governance trail)
- `model_usage` ledger (tokens, cost per model — RTK-agnostic per commit 1da4af9f)
- Memory tier health (`useMemoryTierHealth`) + memory stats
- Security report, escalations, HIL queue, model routing dashboard

## Paste-ready requirements block (REQUIREMENTS.md style)

```
NOCUX-01 — NOC shows day-1-meaningful panels only: every shipped panel has a data source populated by a fresh operator install (memory, cron, skills, model-usage, audit) or is removed from default layout.
NOCUX-02 — Empty states are semantic: each empty panel states what it will show, what populates it, and one operator action to fill it. No bare "No events" strings.
NOCUX-03 — Panel inventory is reduced and re-ordered by operator question ("Is it alive? Is it learning? Is it broken? What's it costing?"), not by data-source convenience.
NOCUX-04 — EfficiencySignals panel is either backed by wired EFFTEL producers or removed from the default layout until producers ship (no permanent placeholder).
NOCUX-05 — Hive-dependent panels (workload, heatmap, savings/waste) degrade to single-operator equivalents (delegations, sessions, cost) when hive tables are empty, not to "empty by design."
```

## Open Qs for operator

1. Is the NOC's primary audience **you as sole operator** (day-1 truth) or **client demo** (aspirational richness)? The panel set differs.
2. Kill vs. hide: should empty-by-design panels be **deleted** from the layout or moved behind a "show advanced" toggle?
3. Is K3's design target the **default 24h view only**, or also the workspace-scoped / 7d / 30d views?

## Model pipeline (locked 2026-07-20)

- **UX design leg:** kimi-k3-thinking on Hermes — one call, produces panel verdicts + proposed set + IA + empty-state copy + ASCII wireframe. Deferred until operator approves this audit.
- **Orchestrator leg:** gpt-5.6-terra @ reasoning=high via `codex exec` — framing/structure review of the K3 design.
- **Worker leg:** M3 subagents — implement the approved design in `apps/memroos/src/components/operations/`.
- **Validator leg:** `codex exec review --uncommitted` on the staged diff.
