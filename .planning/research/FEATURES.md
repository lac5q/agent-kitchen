# Feature Landscape

**Domain:** Observability dashboard for AI agent infrastructure + knowledge ingestion pipeline
**Researched:** 2026-04-13
**Milestone:** v1.3 — Advanced Observability + Knowledge Depth

---

## Feature-by-Feature Analysis

### FLOW-12: Collapsible Node Groups

**What it is:** Fold/expand inactive agent clusters in the React Flow diagram so the canvas isn't cluttered when a group of agents is dormant.

**Table stakes or differentiator:** Differentiator. Most observability dashboards don't offer this. It becomes table stakes only if the diagram grows beyond ~30 nodes and becomes hard to scan.

**Expected behavior:**
- Clicking a group header (e.g., "Remote Agents") collapses all child nodes into a single summary node showing aggregate status (worst-case health color)
- Collapsed state persists for the session (not across reloads — no persistent state needed)
- Edges that previously terminated at hidden child nodes reroute visually to the group summary node
- Expand restores original layout (positions remembered)

**Edge cases:**
- A group contains a mix of active and dormant nodes — collapsed node should show amber or worst-status color, not green
- Collapse while a child node has an open NodeDetailPanel — panel should auto-close
- Group with only one node — still collapsible, but low priority

**User interaction:** Single click on group label or a toggle chevron. No drag interaction needed.

**Complexity:** MEDIUM. The existing `GroupBoxNode` has `pointerEvents: "none"` — it is purely decorative and not interactive. Making groups collapsible requires replacing it with a proper interactive implementation using React Flow's `useExpandCollapse` hook or explicit `hidden` flag management on child nodes. The pattern exists in React Flow's official examples (https://reactflow.dev/examples/layout/expand-collapse). Main work: toggling `hidden` on child nodes + recalculating edges + summary node render. No new API route needed.

**Depends on:** Existing `react-flow-canvas.tsx` GroupBoxNode, existing node/edge definitions.

---

### FLOW-13: Per-Node Activity Drill-Down

**What it is:** Show the last 10 activity events for a node inline when it is selected.

**Important clarification needed:** The existing `NodeDetailPanel` (`node-detail-panel.tsx`) already does this — it slides over from the right, filters `events.filter(e => e.node === nodeId).slice(0, 15)`, and renders them in a Framer Motion panel. The v1.3 spec says "inline" — this must mean *on the canvas node itself* (tooltip or popover), not the existing sidebar. If it means sidebar, this feature is already built and only needs a limit change from 15 to 10.

**Assuming "inline" means on-node popover:**

**Table stakes or differentiator:** Table stakes for observability dashboards where sidebar feels too disruptive. In-context details without losing diagram orientation is a standard pattern in tools like Grafana and Datadog.

**Expected behavior:**
- Clicking a node shows a small popover anchored to that node (above or to the right)
- Popover lists last 10 events: timestamp, type icon, message (truncated to ~60 chars)
- Popover closes on click-outside or pressing Escape
- Popover coexists with (or replaces) the sidebar panel — needs a UX decision

**Edge cases:**
- Node near canvas edge — popover flips to stay on screen
- Node with zero events — shows "No recent activity" empty state
- Multiple nodes selected — only the most recently clicked shows popover

**User interaction:** Click node to open, click elsewhere to dismiss. No hover-only (hover is too fragile on touch/desktop).

**Complexity:** LOW if this is an enhancement to the existing NodeDetailPanel (change limit 15→10, adjust label). MEDIUM if it means a true inline canvas popover distinct from the sidebar — React Flow custom nodes can render arbitrary JSX inside the node component, so a conditional popover div is feasible, but z-index and click event propagation on the canvas require care.

**Depends on:** `node-detail-panel.tsx` (if sidebar enhancement), or `flow-node.tsx` custom node component (if inline popover). Existing activity events from `/api/activity`.

---

### SKILL-06: Skill Failure Rate

**What it is:** Track failed skill invocations from log files and surface the failure rate per skill in the dashboard.

**CRITICAL BLOCKER — New Telemetry Required:** The existing `skill-contributions.jsonl` contains only `action: "synced"` events (235 events, all from a single bulk sync run). It records when skills are copied into the master directory, not when skills are *invoked* by agents. There is no current data source for skill invocation attempts, successes, or failures.

The `gateway.err.log` contains skill *discovery* warnings (symlink path issues), not runtime invocation failures.

**This means SKILL-06 requires two phases before display is possible:**
1. Instrument skill invocations somewhere (gateway logs, agent session logs, or a new JSONL append in the skill runner)
2. Parse that new log source in a `/api/skills/stats` route and display it

**Table stakes or differentiator:** Differentiator. Failure rate visibility is standard in SRE dashboards (Grafana, Datadog) but not typically built for personal AI agent stacks. It becomes table stakes only once the scale of skill failures is high enough to cause real problems.

**Expected behavior (once instrumented):**
- Dashboard shows per-skill: invocation count (last 30 days), failure count, failure rate %
- Sorted by failure rate descending
- Threshold coloring: >10% failure = red, >5% = amber, <5% = green

**Edge cases:**
- Skill invoked 1 time and failed — 100% failure rate misleading on tiny sample; need minimum invocation threshold (suggest: N>=5 before showing rate)
- Skills never invoked — show "no data" not "0% failure rate"
- Log rotation — parser must handle log files being rotated or truncated

**Complexity:** HIGH overall, split: HIGH for instrumentation, LOW for display once data exists. Do not build the display until the data source exists.

**Depends on:** New telemetry — either gateway log enhancement or new JSONL append-on-invocation mechanism. None of this exists today.

---

### SKILL-07: Skill Coverage Gaps

**What it is:** Identify skills with zero usage in the last 30 days.

**Same blocker as SKILL-06:** No invocation data exists. "Zero usage" requires an invocation log. Without that, every skill would appear as a coverage gap by default.

**Table stakes or differentiator:** Differentiator. Pruning unused skills is already semi-automated (skill-sync.py has prune logic with a 365-day grace period). This would surface that signal visually before the pruner runs.

**Expected behavior (once instrumented):**
- List of skills not invoked in 30 days
- Sorted by last-invoked date ascending (oldest unused first)
- "Prune candidate" badge on skills beyond 365-day threshold
- Can cross-reference with SKILL-06 failure rate (zero-use may mean broken, not just unused)

**Edge cases:**
- Skills that are invoked only during rare events (e.g., "calendar" skill only used when scheduling) — 30-day window may produce false positives; consider making the window configurable
- Skills recently added (less than 30 days old) — should not appear as coverage gaps
- 248 total skills — UI must paginate or filter, not show a wall of 248 rows

**Complexity:** HIGH overall (same blocker as SKILL-06). Display complexity is MEDIUM due to pagination/filtering needs.

**Depends on:** Same instrumentation as SKILL-06. Recommend building SKILL-06 and SKILL-07 together once the telemetry layer exists.

---

### SKILL-08: Per-Skill Usage Heatmap

**What it is:** Visualize skill usage frequency over time as a calendar heatmap (GitHub contributions-style or Recharts-based time grid).

**Same blocker as SKILL-06/07:** No invocation data exists.

**Table stakes or differentiator:** Differentiator. Calendar heatmaps are a polished visualization borrowed from GitHub's contribution graph and developer productivity tools. High perceived value, but purely informational — it does not enable any action that SKILL-07's list doesn't already enable.

**Expected behavior (once instrumented):**
- X-axis: days (last 90 days), Y-axis: skills (top N by usage)
- Cell color intensity = invocation count for that skill on that day
- Hover: shows exact count
- Filterable by contributor (hermes / gwen / all)

**Edge cases:**
- Sparse data (early days post-instrumentation) — heatmap will look mostly empty; communicate data age explicitly
- Skills with very high single-day usage skew color scale — use log scale for color mapping
- 248 skills — limit Y-axis to top 20 by usage, not all skills

**Complexity:** HIGH overall (same telemetry blocker). Display complexity is MEDIUM — Recharts does not have a built-in heatmap; requires a custom grid render or a small wrapper, but is achievable with a div-grid plus color interpolation.

**Depends on:** Same instrumentation as SKILL-06/07. Treat SKILL-06, 07, 08 as a single phase: "Skill Telemetry Pipeline + Display."

---

### KNOW-08: projects/ Ingestion

**What it is:** Ingest `~/github/knowledge/projects/` subdirectories into mem0, in addition to the existing daily journals ingestion.

**Table stakes or differentiator:** Table stakes for the knowledge loop. The projects/ directory contains meeting notes for real client/business projects (10+ subdirectories confirmed: omnisend, codethread, boringmarketing, alex, turnedyellow, holifrog, dealmakerwealthsociety, epiloguecapital, multifunding, cordant). These are high-value contextual documents that agents currently don't have access to via mem0.

**Confirmed structure:**
```
projects/
  omnisend/meetings/2025-06-20-*.md
  codethread/meetings/2025-06-05-*.md
  turnedyellow/meetings/2025-05-08-*.md
  ...
```

**Expected behavior:**
- Script walks each `projects/<project>/meetings/*.md` file
- Ingests each file as a mem0 memory with metadata: `source=projects-sync`, `project=<project-name>`, `type=meeting`
- Deduplication: same mtime watermark approach used in `obsidian-to-mem0.py` (per-file hash or mtime tracking)
- Idempotent: second run on same file produces 0 new memories

**Edge cases:**
- Projects without a `meetings/` subdirectory — graceful skip
- Very long meeting transcript (>10K words) — may need chunking before mem0 add; test this
- New project directory added in the future — script must auto-discover, not use a hardcoded list
- Cross-project references (a meeting mentions multiple projects) — store under originating project, do not duplicate

**Complexity:** LOW. `obsidian-to-mem0.py` is the direct template. Main work is parameterizing the walk path and adding `project` metadata. Estimated ~40-60 lines of new Python on top of the existing pattern.

**Depends on:** `obsidian-to-mem0.py` pattern (existing). Python mem0 client (existing). `obsidian-ingestion-state.json` pattern for dedup watermarks. KNOW-09 must come after this.

---

### KNOW-09: Per-Project agent_id Routing

**What it is:** Route different project directories to different mem0 `agent_id` values when ingesting, so agents can query memories scoped to their relevant projects.

**Table stakes or differentiator:** Differentiator. Most users put everything under one agent_id. This feature allows, for example, a shopify-focused agent to query only its project memories without noise from unrelated projects. Enables proper knowledge isolation between client/project contexts.

**Expected behavior:**
- Config-driven mapping: `project_name -> agent_id` stored in a JSON file
- Default fallback: projects not in the map use `agent_id=claude` (same as journals)
- Config follows the existing `agents.config.json` pattern
- Ingestion script reads config at startup, routes each project's memories accordingly

**Edge cases:**
- Config file missing or malformed — fall back to default `agent_id=claude`, log a warning, do not crash
- Same meeting file re-run after config changes — memories already ingested under old agent_id remain; new ingestion goes to new agent_id (duplicate risk); recommend a re-ingestion flag or explicit migration step
- agent_id that doesn't exist in mem0 — mem0 creates it implicitly (non-issue)
- Querying cross-project — agents must know which agent_ids to query; this is a usage-pattern concern, not a data-storage concern

**Complexity:** LOW. Adds ~20 lines to the KNOW-08 script: load a JSON config, map project name to agent_id, fall back to default. The larger complexity is organizational — the agent_id taxonomy must be decided before coding.

**Depends on:** KNOW-08 (must exist first). A defined agent_id taxonomy decision (what are the target agent_ids for each project?).

---

## Table Stakes vs Differentiators

| Feature | Category | Rationale |
|---------|----------|-----------|
| KNOW-08 projects/ ingestion | Table Stakes | High-value documents currently invisible to agents; closes a real knowledge gap |
| FLOW-13 per-node drill-down | Table Stakes | Already partially exists (sidebar); clarify "inline" before building |
| KNOW-09 per-project agent_id | Differentiator | Useful isolation, not blocking any current workflow |
| FLOW-12 collapsible groups | Differentiator | UX improvement, not blocking visibility |
| SKILL-06 failure rate | Differentiator | Requires new telemetry — no current value without instrumentation |
| SKILL-07 coverage gaps | Differentiator | Requires new telemetry — same blocker as SKILL-06 |
| SKILL-08 usage heatmap | Differentiator | Most polish-heavy; lowest marginal value relative to SKILL-07 |

---

## Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Real-time WebSocket skill event streaming | v1.2 explicitly chose JSONL bridge over WebSocket to avoid HMR/CF tunnel issues; reopening this is high-risk low-gain | Keep the polling/JSONL pattern; refresh on page visit |
| Hardcoded project->agent_id mapping in source code | Config-driven architecture is a v1.0 decision; hardcoding breaks portability | JSON config file for the mapping |
| Building SKILL-06/07/08 display before telemetry exists | Produces a dashboard with empty charts — misleading and wasteful | Instrument first, display second; treat as one phase |
| Inline heatmap on the Flow canvas nodes | Visually overwhelming; canvas nodes are already information-dense | Keep heatmap in a separate Library or Skills view |
| Rebuilding NodeDetailPanel for FLOW-13 | Existing sidebar panel already works well | Decide: enhance sidebar (Low) OR add inline popover (Medium); don't build both |

---

## Feature Dependencies

```
KNOW-08 -> KNOW-09 (routing requires ingestion to exist first)

SKILL-06 (telemetry instrumentation) -> SKILL-07 (coverage gaps display)
SKILL-06 (telemetry instrumentation) -> SKILL-08 (usage heatmap display)
SKILL-07 and SKILL-08 share the same new telemetry pipeline — build as one phase

FLOW-13 depends on: /api/activity (existing), node-detail-panel (existing or new inline component)
FLOW-12 depends on: react-flow-canvas GroupBoxNode replacement
```

---

## MVP Recommendation for v1.3

Build in this order:

1. **KNOW-08** — Highest value, lowest risk. Closes a real knowledge gap. Pure Python, template exists.
2. **KNOW-09** — Small addon to KNOW-08. Requires one config decision (agent_id taxonomy) before coding.
3. **FLOW-13** — Clarify "inline" vs sidebar first. If sidebar enhancement: half a day. If inline canvas popover: two days.
4. **FLOW-12** — Collapsible groups. Medium effort, high visual payoff. No new data sources.
5. **SKILL-06/07/08 as one phase** — Build telemetry instrumentation first, then wire display. Do not split into three separate phases without a confirmed data source.

**Defer if timeline is tight:**
- SKILL-08 (heatmap) — most complex display, least actionable; defer until SKILL-06/07 prove the data is rich enough to visualize
- FLOW-12 — nice-to-have UX; defer if the SKILL telemetry phase is slipping

---

## Open Questions Before Building

1. **FLOW-13 "inline" semantics:** Does this mean on-node popover (Medium complexity) or enhanced sidebar (Low complexity)? Needs a UX decision before implementation starts.
2. **SKILL-06 telemetry source:** Where should skill invocations be logged — gateway.log additions, a new `skill-invocations.jsonl`, or agent session hooks? This decision gates all three SKILL features.
3. **KNOW-09 agent_id taxonomy:** What are the target agent_ids for each project? Needs a config decision before coding.
4. **SKILL-07 window:** Is 30 days the right threshold? Skills like `calendar` or `voice-call` may only be invoked monthly — configurable window vs hardcoded?

---

## Confidence Assessment

| Feature | Confidence | Basis |
|---------|------------|-------|
| FLOW-12 collapsible groups | HIGH | React Flow official examples confirm useExpandCollapse pattern exists; existing GroupBoxNode code inspected directly |
| FLOW-13 drill-down | HIGH | node-detail-panel.tsx read directly; behavior is partially implemented in sidebar already |
| SKILL-06 failure rate | HIGH | skill-contributions.jsonl inspected (only "synced" actions confirmed); gateway.err.log inspected (discovery warnings only); no invocation data confirmed absent |
| SKILL-07 coverage gaps | HIGH | Same evidence as SKILL-06 |
| SKILL-08 usage heatmap | HIGH | Same evidence as SKILL-06/07; Recharts has no built-in heatmap confirmed |
| KNOW-08 projects/ ingestion | HIGH | projects/ directory inspected directly (10+ subdirs, meetings/*.md structure confirmed); obsidian-to-mem0.py is the template |
| KNOW-09 agent_id routing | HIGH | mem0 agent_id scoping is standard mem0 usage; config-driven pattern matches existing codebase conventions |
