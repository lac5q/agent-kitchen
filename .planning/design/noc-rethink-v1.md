# NOC Metrics Rethink — UX Design v1.1 (2026-07-20)

Designer: kimi-k3 (Hermes) · Inputs: `.planning/notes/2026-07-20-noc-rethink-audit.md` · Operator decisions: (1) audience = sole operator day-1 truth, (2) useful-but-empty panels hide behind "Show advanced", (3) design covers all windows (24h/7d/30d) + workspace scoping.
**v1.1: absorbed gpt-5.6-terra orchestrator REVISE notes** — Attention panel promoted below Pulse; AgentWorkload re-spec'd as message-backed activity; 4-state empty-state model; BehaviorSignals actionable counts merged into Attention; Cost panel spend-primary.

## Design principle

Every main-layout panel must answer one operator question with data a fresh install actually produces. The operator's 9am scan order:

1. **Is it alive?** — system pulse
2. **Does anything need me right now?** — attention queue
3. **Is it learning?** — memory growth
4. **What are my agents doing?** — agent activity
5. **What's it costing me?** — model spend
6. **What's the governance trail?** — audit summary

Panels that can't answer their question with day-1 data move to Advanced until their sources land.

## Panel verdicts (13 existing)

| Panel | Verdict | Reason |
|-------|---------|--------|
| PulseStrip | KEEP, re-spec KPIs | 2 of 6 KPIs are hive-centric = 0 day-1. Swap for memory writes + last-activity. Strip concept is right. |
| **Attention (NEW)** | **ADD below Pulse** | Orchestrator note 4+5: actionable items (cron failures, HIL backlog, security findings, stale sources) belong before learning/agents/cost. This is the operator's first task list. |
| EfficiencySignals | ADVANCED | `efficiency_events` has no wired producers (EFFTEL deferred). Known-unwired state, not generic empty. |
| MemoryConsumption | KEEP, hero | Memory IS the product. Data lands from first use. |
| MemoryNotDigested | MERGE into MemoryConsumption | Tier-health row inside hero panel. |
| AgentWorkload | REBUILD → **Agent Activity** | Orchestrator note 1: source = `messages` (truthful day-1). Per-agent activity from message traffic; delegation detail shown ONLY when hive_delegations has rows in window. |
| ModelUtility | KEEP | Ledger fills from first model call. |
| ActivityHeatmap | REBUILD source | Same visual; source = messages + memory_writes timestamps. |
| SkillsLifecycle | KEEP | `skill_registry` populated on install. |
| BehaviorSignals | ADVANCED (actionable counts → Attention) | Orchestrator note 3: explicitly thin day-1; its security/escalation counts surface in Attention instead. |
| GovernanceStrip | KEEP, below fold | Audit trail summary; actionable HIL/security items surface in Attention. |
| Savings | MERGE into Cost | Orchestrator note 2: spend + per-model primary. |
| Waste | MERGE into Cost | Waste/savings rows render ONLY when the ledger actually supports them; hidden otherwise (no fabricated baselines). |
| NocHeader | KEEP + Show-advanced toggle | Owns filters already. |

## Main layout (7 rows + advanced)

```
Row 0  NocHeader [window: 24h|7d|30d] [workspace ▾] [Show advanced ☐]
Row 1  PulseStrip — Messages 24h · Memory writes 24h · Cron health · Skills enabled · Active models · Last activity
Row 2  ATTENTION — severity-ordered actionable items: cron failures · HIL pending · security findings · stale sources (severity, freshness, next action each)
Row 3  MemoryConsumption (hero, 1.7fr) + Tier health row
Row 4  Agent Activity (messages per agent; delegation detail if present) · ModelUtility · ActivityHeatmap
Row 5  Cost (spend + per-model; waste/savings rows only when supported)
Row 6  GovernanceStrip (audit summary) · SkillsLifecycle
Row 7  ── Advanced ── : EfficiencySignals · BehaviorSignals (+ future unwired-source panels)
```

## Attention panel spec (new)

Each row: **severity dot** (crit/warn/info) · **what** (one line) · **freshness** ("2h ago") · **next action** (link/button).

Sources (all day-1 real):
- `cron_health_jobs` where `warning IS NOT NULL OR last_failure_at IS NOT NULL` → crit
- HIL queue pending count → warn
- Security findings/escalations → crit/warn by severity
- Stale sources: any panel data whose last-update exceeds 2× its poll interval → info ("cron heartbeat stale since 06:12")

Empty = genuinely good news: "All clear — no cron failures, no pending approvals, no findings." This is the one panel where empty is the goal state, so the empty state says that.

## Empty-state model (4 states, orchestrator notes 6-7)

| State | Detection | Copy pattern |
|-------|-----------|--------------|
| **window-empty** | Rows exist in widest window (same workspace scope) but not current | "Nothing in 24h — N in 7d. Widen?" |
| **no-history** | Zero rows at widest window, endpoint healthy | "No `<thing>` yet. `<what fills it>`. Try: `<action>`." |
| **stale/error** | Endpoint error OR last-update > 2× poll interval | "Data stale since `<ts>` — source may be down." (distinct visual: amber, never confused with empty) |
| **known-unwired** | Source on the unwired registry (EFFTEL etc.) | "Source not yet wired — activates when `<producer>` ships." (Advanced section only) |

Rules: errors never render as empty; probing is workspace-scoped (never claim no-history from a cross-workspace query); unwired sources are a deterministic registry, not a heuristic.

## Wireframes

Desktop (≥1280px):

```
┌──────────────────────────────────────────────────────────────────────┐
│ MEMROOS NOC        [24h|7d|30d] [workspace ▾] [⬤ live] [Show adv ☐] │
├──────────────────────────────────────────────────────────────────────┤
│ 💬 12 │ 🧠 8 writes │ ⏱ 14/14 cron │ 🛠 23 skills │ ⚡ 3 models · 2m │
├──────────────────────────────────────────────────────────────────────┤
│ ⚠ ATTENTION (2)                                                      │
│ 🔴 graph-catchup failed 06:12 — restart job →                        │
│ 🟡 1 skill seal awaiting approval 2h — review →                      │
├───────────────────────────────────────────────┬──────────────────────┤
│ MEMORY — IS IT LEARNING?                      │ TIER HEALTH          │
│ [area chart: writes vs recalls]               │ vector ✓  graph ✓    │
│ 1,240 total · +8 this window                  │ fts ✓    vault ✓     │
├──────────────────────┬───────────────────────┼──────────────────────┤
│ AGENT ACTIVITY       │ MODELS                │ ACTIVITY             │
│ hermes  9 msgs  4 ses│ k3      41k tok $0.09 │ [7×24 heatmap grid]  │
│ claude  3 msgs       │ gpt-5.6 12k tok $0.31 │                      │
│ pi      1 msg        │ m3       9k tok $0.01 │                      │
├──────────────────────┴───────────────────────┴──────────────────────┤
│ COST — Spend $0.41 this window · k3 $0.09 · gpt-5.6 $0.31 · m3 $0.01│
├──────────────────────────────────────────────────────────────────────┤
│ GOVERNANCE: 12 audit entries · 0 findings    SKILLS: 23 enabled      │
├──────────────────────────────────────────────────────────────────────┤
│ ── ADVANCED ──  EfficiencySignals (unwired: EFFTEL) · BehaviorSignals│
└──────────────────────────────────────────────────────────────────────┘
```

Mobile (<768px): single column, same order. Attention is the first scrollable block after the 2×3 KPI grid — the operator's morning check fits one screen. Heatmap scrolls horizontally. Advanced toggle persists in header (sticky).

## Window + workspace behavior

- All panels consume existing `NocFilters` — no contract change.
- Empty-state probing respects workspace scope (4-state model above).
- Single-workspace installs hide the workspace picker.

## Implementation notes for worker leg

- Reused: `NocPanelSkeleton`, `PillBtn`, `Eyebrow`, `NOC` theme, `useOperationsNoc`, `useMemoryStats`, `useMemoryTierHealth`, `useModelUsage`, `useTimeSeries`, `useDelegations` (conditional), `useOrchestrationHil`, `useSecurityReport`.
- Attention panel sources all exist in `noc/route.ts` queries already (cron_health, audit, skills) + existing HIL/security hooks — new component, no new endpoints expected.
- Agent Activity: messages grouped by agent — verify a per-agent messages query exists or add one grouped SELECT to `noc/route.ts` (one endpoint change max).
- Show-advanced persistence: operator-visible semantics are "toggle in header, remembers choice" — storage mechanism is the worker's call.

## Out of scope (v1.1)

- Wiring EFFTEL producers (observe-plane backlog, not UX).
- Panel detail views / drill-down redesign.
- Multi-tenant workspace switcher beyond existing picker.

## Pipeline state

- ✅ Audit (`.planning/notes/2026-07-20-noc-rethink-audit.md`)
- ✅ K3 design v1 → v1.1 (this doc, orchestrator notes absorbed)
- ⏭ Validator leg (codex review of staged docs) → promote v8.18 candidate → M3 worker implementation
