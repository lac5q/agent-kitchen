# Project Research Summary

**Project:** Agent Kitchen v1.3 — Advanced Observability + Knowledge Depth
**Domain:** AI agent infrastructure observability dashboard + knowledge ingestion pipeline
**Researched:** 2026-04-13
**Confidence:** HIGH

---

## Executive Summary

Agent Kitchen v1.3 adds 7 features across two tracks: Flow canvas improvements (FLOW-12 collapsible groups, FLOW-13 per-node activity panel) and knowledge pipeline depth (SKILL-06 failure rate, SKILL-07 coverage gaps, SKILL-08 usage heatmap, KNOW-08 projects/ ingestion, KNOW-09 per-project agent routing). The defining finding of this research cycle is that zero new npm packages are required — every feature maps to capabilities already present in the installed stack. The work is entirely pattern application and data source wiring, not dependency acquisition.

The recommended approach is to build in a strict dependency-driven order: Python pipeline changes first (KNOW-08+09), then API route extensions that have confirmed data sources (SKILL-07), then new data paths that must be instrumented before display (SKILL-06 then SKILL-08), then Flow canvas features in ascending risk order (FLOW-13 then FLOW-12). Two features are significantly simpler than their specs imply: FLOW-13 is 90% already built in `node-detail-panel.tsx`, and KNOW-08+09 are one combined script edit (not two separate phases). Two features carry a hidden prerequisite trap: SKILL-06 and SKILL-08 have no data source yet — building their display layers before the data path exists produces silently empty dashboards.

The top risk in v1.3 is the SKILL telemetry gap. `skill-contributions.jsonl` contains only `action: "synced"` events; real usage data lives in `skill-sync-state.json`'s `skill_usage` dict. The second major risk is the KNOW-09 agent_id proliferation trap: routing 46 project directories to 46 separate mem0 `agent_id` namespaces means all those memories are never surfaced at session start (the preload hook only loads `claude` and `shared`). The research-validated fix is to use `agent_id: "shared"` with `project` metadata for all project content.

---

## Key Findings

### Stack Additions

No new npm packages. All features use existing installed stack. This is the most important output of the stack research.

**Existing stack reused for v1.3:**
- `@xyflow/react` 12.10.2 — `parentId` + `extent: "parent"` for FLOW-12 collapse (confirmed present in bundle)
- `framer-motion` 12.38.0 — AnimatePresence for FLOW-13 panel (already wired in FlowPage)
- `@tanstack/react-query` 5.96.2 — new skill API routes (same polling pattern)
- Node.js `fs/promises` (built-in) — SKILL-06/07/08 log parsing (mirrors existing skills route)
- Python `pathlib`, `hashlib`, `urllib` (built-in) — KNOW-08/09 (identical to `obsidian-to-mem0.py` pattern)
- CSS grid + Tailwind inline `backgroundColor` — SKILL-08 heatmap (no chart library needed)

**Critical version note:** `recharts` 3.8.1 is NOT used for the heatmap — it has no built-in heatmap component, and misusing ScatterChart for this purpose produces poor UX and would require adding a package that conflicts with the slate/amber/emerald design language.

### Feature Complexity and Key Approaches

**Must have (table stakes):**
- **KNOW-08 projects/ ingestion** — LOW complexity. Template is `obsidian-to-mem0.py`. Add `sync_projects()` function walking `~/github/knowledge/projects/` with per-project state keys. ~40-60 lines of Python. Key approach: extend `obsidian-ingestion-state.json` with `"project-{name}"` keys using the same mtime+hash dedup guards. Use isolated `projects-ingestion-state.json` to avoid read-modify-write race with the obsidian script.
- **FLOW-13 per-node activity panel** — LOW complexity (sidebar enhancement path). `node-detail-panel.tsx` already filters events by nodeId and shows 15 items. Change is: trim to 10, add AbortController cleanup to existing heartbeat fetch, expand node-ID-to-log mapping in `/api/activity` for unmapped nodes (qdrant, knowledge-curator, per-agent nodes). Key decision: sidebar enhancement (Low) vs. on-canvas popover (Medium) — research recommends sidebar path for v1.3.

**Should have (differentiators):**
- **KNOW-09 per-project agent_id routing** — LOW complexity as an addon to KNOW-08, but carries a BLOCKING pitfall: routing to 46 separate agent_ids means memories are never surfaced and triggers 429 quota errors. Use `agent_id: "shared"` + `project` metadata instead. One combined script edit with KNOW-08.
- **FLOW-12 collapsible node groups** — MEDIUM complexity. `GroupBoxNode` is currently `pointerEvents: none` and purely decorative. Must: (1) migrate child node coordinates to parent-relative offsets (required first step), (2) use `hidden: true` on child nodes (not array removal) to avoid dangling edges, (3) add `collapsedGroups: Set<string>` state to ReactFlowCanvas, (4) add explicit `width`/`height` on group Node objects.
- **SKILL-07 coverage gaps** — LOW-MEDIUM complexity. Data source confirmed: `skill-sync-state.json` `skill_usage` dict (NOT skill-contributions.jsonl — that file has only synced events). Extend `/api/skills` to cross-reference skill names against usage timestamps. Key approach: shallow `iterdir()` on `CONFIG["master_dir"]` only — never recurse vault root (v1.1 regression risk).
- **SKILL-06 failure rate tracking** — MEDIUM complexity with a required prerequisite. `failures.log` format is `timestamp | ERROR | {json}` with multi-line tracebacks. Parser must use stateful reader anchored on timestamp regex. Key constraint: `error_type: "disk_critical"` must be excluded from skill failure counts. Must extend `skill-sync.py` to emit `failed` events before the API route is meaningful.
- **SKILL-08 per-skill usage heatmap** — MEDIUM complexity, but scope is "contribution activity heatmap" (Scope A), not invocation heatmap (Scope B, no telemetry exists). CSS grid + inline backgroundColor, no library. Key risk: 264 cells at 10s poll requires memoized cells and local hover state.

**Defer to v1.4:**
- SKILL-08 Scope B (invocation heatmap) — requires new instrumentation at the OpenClaw runtime level
- KNOW-09 per-project agent_id routing with full preload — requires `--project` flag on session hook first
- FLOW-13 on-canvas inline popover — z-index complexity, deferred per research recommendation

### Architecture Approach

Every v1.3 feature is an extension or trim of an existing component, not a new system. There are zero new API routes needed (all features extend existing routes or scripts) and zero new npm packages. The data flow pattern is: Python cron scripts write state files → Next.js API routes read state files on-demand → TanStack Query polls the routes → React components render. This pattern is already established and battle-tested; v1.3 only adds branches within it.

**Components touched:**
1. `obsidian-to-mem0.py` — KNOW-08+09 `sync_projects()` function + `agent_id` parameter
2. `/api/skills/route.ts` — SKILL-06/07/08 extended response fields
3. New `src/components/skills/skill-heatmap.tsx` — SKILL-08 CSS grid display
4. `/api/activity/route.ts` — FLOW-13 `?node` param, widen window, expand node mapping
5. `node-detail-panel.tsx` — FLOW-13 trim to 10 events + AbortController cleanup
6. `react-flow-canvas.tsx` — FLOW-12 collapse state + GroupBoxNode interactivity

### Critical Pitfalls (Top 5)

1. **parentId coordinate migration is the prerequisite for FLOW-12** — Setting `parentId` on child nodes makes their coordinates parent-relative. Every agent/devtool node's `x/y` must be recalculated as `(child_canvas_x - group_x, child_canvas_y - group_y)` before any other FLOW-12 work. Failure produces nodes jumping to wrong positions. Build and verify this first in FLOW-12.

2. **Use `hidden: true` on child nodes, not array removal** — Removing collapsed child nodes from the array leaves dangling edges that render to canvas corner (0,0) with console errors. React Flow v12 supports `hidden: true` on nodes and automatically handles connected edges. This is the correct collapse mechanism.

3. **failures.log has multi-line JSON entries (stateful parser required)** — Each log entry spans multiple lines (traceback field contains newlines). A naive line-by-line parser produces corrupted JSON. Use a stateful parser anchored on the timestamp regex `^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2},\d{3} \| ERROR \|`. Also: skip `#` comment header lines, exclude `disk_critical` error type from skill failure counts.

4. **KNOW-09: use `agent_id: "shared"` not per-project namespaces** — Routing 46 project directories to 46 separate mem0 agent_ids creates memories that are never surfaced (preload hook only loads `claude` and `shared`). Additionally, 46 namespaces risk hitting the Gemini embedding quota (429 already occurring in failures.log). Use `agent_id: "shared"` with `project` in metadata for all project content.

5. **SKILL-06/07/08 data source is NOT skill-contributions.jsonl** — That file contains only `action: "synced"` events. Real usage data is in `~/.openclaw/skill-sync-state.json` under `skill_usage` dict. Building SKILL-07 from the JSONL produces only sync history. Building SKILL-06 display before `skill-sync.py` emits `failed` events produces a silently correct-looking but wrong zero-failure dashboard.

---

## Implications for Roadmap

### Phase 1: Knowledge Pipeline — KNOW-08 + KNOW-09
**Rationale:** Highest value, lowest risk, no frontend dependencies, no new packages. Closes a real knowledge gap (341 markdown files in `projects/` currently invisible to agents). Pure Python with a battle-tested template. KNOW-09 is one function parameter change in the same edit — no reason to split them.
**Delivers:** All `~/github/knowledge/projects/` meeting notes ingested into mem0 under `agent_id: "shared"` with `project` metadata. Idempotent nightly cron step added to `knowledge-curator.sh`.
**Implements:** `sync_projects()` added to `obsidian-to-mem0.py` with per-project state keys, isolated `projects-ingestion-state.json`, `agent_id` parameter routing to `"shared"`.
**Avoids:** PITFALL-7 (isolated state file), PITFALL-8 (agent_id proliferation + 429 quota), PITFALL-9 (rglob only in cron, never in API).
**Research flag:** Skip — standard pattern, fully documented, template exists.

### Phase 2: Skill Coverage Gaps — SKILL-07
**Rationale:** Data source confirmed and available (`skill-sync-state.json` `skill_usage` dict). No prerequisite instrumentation needed. API extension is straightforward. Builds the coverage gap visibility that feeds into SKILL-06 context.
**Delivers:** `/api/skills` response extended with `coverageGaps: string[]` and `coverageGapCount: number`. Canvas `cookbooks` node shows gap count.
**Implements:** Extends `src/app/api/skills/route.ts`. Cross-references skill directory listing against usage timestamps from state file.
**Avoids:** PITFALL-4 (shallow `iterdir()` on `CONFIG["master_dir"]` only), PITFALL-13 (read from state file, not JSONL).
**Research flag:** Skip — pattern is unambiguous, data source confirmed.

### Phase 3: Skill Failure Rate — SKILL-06
**Rationale:** Two-step phase: (a) Python prerequisite — extend `skill-sync.py` to emit `failed` events; (b) after confirmed events appear in JSONL, extend `/api/skills` for failure counts. The split-commit approach lets the data path be verified before API work starts. Do NOT write the API extension first.
**Delivers:** Skill failure rate by error type and agent_id. Surfaced in skills panel. Per-skill attribution deferred to v1.4 (requires `skill` field in failure log entries).
**Implements:** `skill-sync.py` failure event logging + `/api/skills/failures` route with stateful timestamp-anchored parser. `disk_critical` excluded via error_type allowlist.
**Avoids:** PITFALL-3 (stateful parser, not line-by-line), PITFALL-11 (disk_critical excluded).
**Research flag:** Needs phase-level planning attention — stateful log parser is non-trivial; validate parser against live file before wiring to API. Enforce two-commit sequence in the plan.

### Phase 4: Skill Heatmap — SKILL-08
**Rationale:** Builds on SKILL-06 vocabulary (failure events included in time-series buckets). Contribution heatmap (Scope A) is achievable with existing data. Clear scope boundary: this is a contribution activity heatmap, not an invocation heatmap — label accurately in UI.
**Delivers:** New `skill-heatmap.tsx` component showing skill modification activity over last 30 days as CSS grid heatmap. 264-skill-safe with memoized cells.
**Implements:** CSS grid + inline `backgroundColor` intensity scaling. Extended `/api/skills` response with `contributionsBySkill` time series.
**Avoids:** PITFALL-5 (guard empty skill list, clamp column count to min 1), PITFALL-6 (local hover state, memoized cell array, no per-cell Framer Motion).
**Research flag:** Skip — CSS grid pattern is unambiguous.

### Phase 5: Per-Node Activity Panel — FLOW-13
**Rationale:** Panel is 90% built already. Main work is: expand node-ID-to-log mapping for unmapped nodes, add `?node` query param to `/api/activity`, add AbortController cleanup, trim to 10 events. Keep as sidebar enhancement (not on-canvas popover) per research recommendation.
**Delivers:** Clicking any canvas node opens a side panel with last 10 activity events. Covers currently-unmapped nodes: `qdrant`, `obsidian`, `knowledge-curator`, per-agent nodes.
**Implements:** Modified `/api/activity/route.ts` with `?node` param + wider time window + expanded node mapping. Modified `node-detail-panel.tsx` with AbortController and 10-event limit.
**Avoids:** PITFALL-10 (AbortController on heartbeat fetch, no second fetch added to panel).
**Research flag:** Skip — panel already wired, change is incremental.

### Phase 6: Collapsible Node Groups — FLOW-12
**Rationale:** Highest-risk UI change; save for last when all other features are stable and canvas code is settled. Touches the core `useMemo` logic for the entire canvas. Two bugs are easy to introduce (coordinate offset miscalculation, dangling edges) and must be verified in isolation before wiring the click handler.
**Delivers:** Group nodes (Remote Agents, Dev Tools) are collapsible via click. Collapsed state shows aggregate health color. Edges route cleanly via `hidden: true` mechanism.
**Implements:** Coordinate migration first → `hidden: true` collapse mechanism → collapse state in ReactFlowCanvas → GroupBoxNode interactivity. Explicit `width`/`height` on group Node objects.
**Avoids:** PITFALL-1 (parentId coordinate recalculation as first step), PITFALL-2 (`hidden: true` not array removal).
**Research flag:** Needs phase research — `useMemo` dependency chain is complex, dynamic `agentBoxWidth` makes coordinate math non-trivial, edge cleanup must be verified before click handler is wired.

### Phase Ordering Rationale

- KNOW-08+09 first: no dependencies, highest value/risk ratio, pure Python, proven template
- SKILL-07 before SKILL-06: data source exists for SKILL-07 now; SKILL-06 needs instrumentation time to generate events
- SKILL-06 before SKILL-08: failure events must be in JSONL before heatmap includes them in time series
- FLOW-13 before FLOW-12: panel refactor must be settled before adding collapse state to same canvas
- FLOW-12 last: riskiest change, requires stable canvas code as foundation

### Research Flags

Phases needing deeper planning or research:
- **Phase 3 (SKILL-06):** Stateful log parser is non-trivial; test against live `failures.log` before API wiring. Two-commit sequence (data path first, then API) must be enforced in phase plan.
- **Phase 6 (FLOW-12):** useMemo dependency chain is complex. `agentBoxWidth` is dynamically computed — coordinate math needs explicit constant derivation. Edge orphan cleanup must be unit-tested before UI wiring. Consider requesting deeper research on @xyflow/react v12 parentId exact behavior.

Standard patterns (skip research-phase):
- **Phase 1 (KNOW-08+09):** Template proven in production
- **Phase 2 (SKILL-07):** Data source confirmed, algorithm is a filter over existing data
- **Phase 4 (SKILL-08):** CSS grid heatmap is well-documented standard pattern
- **Phase 5 (FLOW-13):** Panel already wired, change is incremental

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All package versions confirmed from `package.json`, `parentId` confirmed in bundle, no new deps needed |
| Features | HIGH | Live files inspected: failures.log, skill-contributions.jsonl, projects/ directory, node-detail-panel.tsx |
| Architecture | HIGH | All integration points confirmed by direct code reading of every affected component |
| Pitfalls | HIGH (FLOW-12 parentId: MEDIUM) | All others confirmed via direct file inspection; parentId coordinate behavior for v12 not independently re-verified |

**Overall confidence:** HIGH

### Gaps to Address

- **FLOW-12 parentId v12 exact behavior:** Coordinate system behavior inferred from React Flow documentation and migration notes — not independently verified for v12. Validate with a minimal test before committing to the offset math constants.
- **KNOW-09 mem0 with 46 agent_ids (mitigated):** Resolved by using `agent_id: "shared"` + `project` metadata. The 46-namespace approach is explicitly rejected.
- **SKILL-06 per-skill attribution:** `failures.log` identifies `agent_id` but not skill name. Per-skill failure rate requires adding a `skill` field to future failure log entries in `mem0-server.py`. For v1.3, surface by `error_type` and `agent_id` only; per-skill deferred to v1.4.
- **FLOW-13 node mapping completeness:** After expanding node-ID-to-log mapping, most canvas nodes will still show sparse events (only ~5 node types produce log events). Document which nodes have live activity vs. observation-only in the phase plan.

---

## Sources

### Primary (HIGH confidence — direct file inspection)

- `package.json` — confirmed all package versions, zero new deps needed
- `node_modules/@xyflow/react/dist/umd/index.js` — `parentId` confirmed present
- `~/github/knowledge/logs/failures.log` (515 lines, live) — format, multi-line tracebacks, disk_critical dominance confirmed
- `~/github/knowledge/skill-contributions.jsonl` (live) — only `action: "synced"` events confirmed; no usage events
- `~/.openclaw/skill-sync-state.json` — `skill_usage` dict confirmed as real usage data source
- `~/github/knowledge/projects/` — 46 subdirs, 341 markdown files, 3+ levels depth confirmed
- `src/app/api/skills/route.ts`, `src/app/api/activity/route.ts` — integration points, node mapping gaps confirmed
- `src/components/flow/react-flow-canvas.tsx` — GroupBoxNode structure, dynamic agentBoxWidth, useMemo dependencies confirmed
- `src/components/flow/node-detail-panel.tsx` — 90% implementation confirmed, missing AbortController confirmed
- `~/github/knowledge/scripts/obsidian-to-mem0.py` — dedup pattern, state file structure, AGENT_ID="claude" confirmed
- `~/github/knowledge/scripts/skill-sync.py` — only `contributed`/`pruned` actions confirmed; no `failed` events

### Secondary (MEDIUM confidence)

- React Flow v12 parentId coordinate behavior — consistent with v10+ documented containment model and v11→v12 migration notes; not independently tested in this codebase

---

*Research completed: 2026-04-13*
*Ready for roadmap: yes*
