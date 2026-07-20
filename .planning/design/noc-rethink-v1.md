# NOC Metrics Rethink — UX Design v1 (2026-07-20)

Designer: kimi-k3 (Hermes) · Inputs: `.planning/notes/2026-07-20-noc-rethink-audit.md` · Operator decisions: (1) audience = sole operator day-1 truth, (2) useful-but-empty panels hide behind "Show advanced", (3) design covers all windows (24h/7d/30d) + workspace scoping.

## Design principle

Every main-layout panel must answer one operator question with data a fresh install actually produces. The five questions, in priority order:

1. **Is it alive?** — system pulse
2. **Is it learning?** — memory growth
3. **What are my agents doing?** — agent activity
4. **What's it costing me?** — model spend
5. **Is anything broken?** — governance + anomalies

Panels that can't answer their question with day-1 data move to Advanced until their sources land.

## Panel verdicts (13 existing)

| Panel | Verdict | Reason |
|-------|---------|--------|
| PulseStrip | KEEP, re-spec KPIs | 2 of 6 KPIs are hive-centric (delegations, hive actions) = 0 day-1. Swap for memory writes + last-activity. Strip concept is right. |
| EfficiencySignals | ADVANCED | `efficiency_events` has no wired producers (EFFTEL deferred). Valuable once v8.16 observe feeds it. |
| MemoryConsumption | KEEP, promote to hero | Memory IS the product. Data lands from first use. |
| MemoryNotDigested | MERGE into MemoryConsumption | Same question ("is memory healthy"), second source. Becomes tier-health row inside hero panel. |
| AgentWorkload | REBUILD on sessions+delegations | Question is real ("what are agents doing"), source is wrong (hive feed = 0 day-1). Rebuild on `messages`/delegation records that exist single-operator. |
| ModelUtility | KEEP | Ledger fills from first model call. RTK-agnostic per commit 1da4af9f. |
| ActivityHeatmap | REBUILD on messages+memory writes | Same visual, source swap: hive_actions → messages+memory_writes timestamps. Both exist day-1. |
| SkillsLifecycle | KEEP | `skill_registry` populated on install. Fills further as SkillForge runs. |
| BehaviorSignals | KEEP, move below fold | 5 sources, thin day-1 but real (security report, escalations). Answers "is anything weird" once operator works. |
| GovernanceStrip | KEEP | `audit_entries` exist from first authenticated action. |
| Savings | MERGE into Cost panel | Same source as Waste (model_usage 24h). One question: "what's it costing". |
| Waste | MERGE into Cost panel | See above. |
| NocHeader | KEEP, add Show-advanced toggle | Owns window/workspace filters already. Toggle lives here. |

## Proposed main layout (7 panels + advanced)

```
Row 0  NocHeader [window: 24h|7d|30d] [workspace: all|…] [Show advanced ☐]
Row 1  PulseStrip — 6 KPIs: Messages 24h · Memory writes 24h · Cron health · Skills enabled · Active models · Last activity
Row 2  MemoryConsumption (hero, 1.7fr) + Tier health row (merged from MemoryNotDigested)
Row 3  AgentWorkload (rebuilt: recent sessions/delegations per agent) · ModelUtility (tokens+cost per model) · ActivityHeatmap (messages+memory writes)
Row 4  Cost panel (merged Savings+Waste: spend, top-waste calls, savings vs baseline — tabbed)
Row 5  GovernanceStrip (audit, HIL queue, security) + BehaviorSignals
Row 6  SkillsLifecycle
Row 7  ── Advanced ── (behind toggle): EfficiencySignals (+ any panel whose source is unwired)
```

## Empty-state copy standard

Pattern: **what it shows · what fills it · one action**. No bare "No events".

| Panel | Empty-state copy |
|-------|------------------|
| PulseStrip KPI | "No messages yet — chat with the operator to start the clock." (per KPI, adapted) |
| MemoryConsumption | "No memories in this window. Memories land when agents save via MCP or you chat. Try: `hermes` → 'remember that…'" |
| AgentWorkload | "No agent sessions yet. Sessions appear after any harness (Hermes, Claude, Codex, Pi) connects and works." |
| ModelUtility | "No model calls in this window. The ledger fills on the first routed call." |
| ActivityHeatmap | "No activity in this window. Messages and memory writes light this up." |
| Cost | "No spend in this window. Model usage appears after the first call." |
| GovernanceStrip | "No audit entries yet. Entries land on the first authenticated action." |
| BehaviorSignals | "No signals yet. Security and escalation events appear as the operator runs." |
| SkillsLifecycle | "No skills registered. Install skills via the marketplace or SkillForge." |
| Advanced panels | "Source not yet wired. This panel activates when `<producer>` ships." (name the producer: EFFTEL for EfficiencySignals) |

Empty states must also distinguish **window-empty** (data exists outside 24h, suggest widening to 7d) from **source-empty** (no data anywhere). Detection: query once with widest window; if rows exist outside current window, render "Nothing in 24h — N events in 7d. Widen?" instead of the day-1 copy.

## Wireframes

Desktop (≥1280px):

```
┌──────────────────────────────────────────────────────────────────────┐
│ MEMROOS NOC        [24h|7d|30d] [workspace ▾] [⬤ live] [Show adv ☐] │
├──────────────────────────────────────────────────────────────────────┤
│ 💬 12 msgs │ 🧠 8 writes │ ⏱ 14/14 cron │ 🛠 23 skills │ ⚡ 3 models │
│                                              last activity 2m ago    │
├───────────────────────────────────────────────┬──────────────────────┤
│ MEMORY — IS IT LEARNING?                      │ TIER HEALTH          │
│ [area chart: writes vs recalls]               │ vector ✓  graph ✓    │
│ 1,240 total · +8 this window                  │ fts ✓    vault ✓     │
├──────────────────────┬───────────────────────┼──────────────────────┤
│ AGENTS               │ MODELS                │ ACTIVITY             │
│ hermes  4 sessions   │ k3      41k tok $0.09 │ [7×24 heatmap grid]  │
│ claude  2 sessions   │ gpt-5.6 12k tok $0.31 │                      │
│ pi      1 session    │ m3       9k tok $0.01 │                      │
├──────────────────────┴───────────────────────┴──────────────────────┤
│ COST — [Spend $0.41] [Waste: 3 uncached repeats $0.02] [Saved $1.10] │
├──────────────────────────────────────────────────────────────────────┤
│ GOVERNANCE: 12 audit entries · 0 HIL pending · 0 security findings   │
├──────────────────────────────────────────────────────────────────────┤
│ SKILLS: 23 enabled · 2 pending seal · last optimized 2d ago          │
├──────────────────────────────────────────────────────────────────────┤
│ ── ADVANCED (toggle) ──                                              │
│ EfficiencySignals: source not wired — activates when EFFTEL ships    │
└──────────────────────────────────────────────────────────────────────┘
```

Mobile (<768px): single column, same order. PulseStrip collapses to 2×3 KPI grid. Hero chart full-width, tier health stacks below. Heatmap scrolls horizontally. Advanced toggle persists in header (sticky).

## Window + workspace behavior

- All rebuilt panels consume existing `NocFilters` — no contract change.
- Window change re-queries; empty-state detection uses the window-vs-source distinction above.
- Workspace scoping applies WHERE clauses as today; single-workspace installs hide the workspace picker (don't show a filter with one option).

## Implementation notes for worker leg

- Reused, not new: `NocPanelSkeleton`, `PillBtn`, `Eyebrow`, `NOC` theme, `useOperationsNoc`, `useMemoryStats`, `useMemoryTierHealth`, `useModelUsage`, `useTimeSeries`.
- New hooks needed: none for main layout IF AgentWorkload can source from existing delegation/session APIs; verify `/api/hive/delegations` returns single-operator rows before writing a new endpoint.
- Source swaps live in the panel components, not the API — `noc/route.ts` already queries `messages`, `skill_registry`, `cron_health_jobs`, `audit_entries`.
- Show-advanced state: `localStorage` (`memroos.noc.showAdvanced`), default off, lives in NocHeader.

## Out of scope (v1)

- Wiring EFFTEL producers (that's the observe-plane backlog, not UX).
- Editing/drilling into panels (detail views stay as-is).
- Multi-tenant workspace switcher UX beyond existing picker.
