# Roadmap: Agent Kitchen

## Milestones

- ✅ **v1.1 Knowledge Architecture + Dashboard Polish** — Phases 1-5 (shipped 2026-04-11)
- ✅ **v1.2 Live Data + Knowledge Sync** — Phases 6-11 (shipped 2026-04-12)
- ✅ **v1.3 Advanced Observability + Knowledge Depth** — Phases 12-17 (shipped 2026-04-15)
- 🔨 **v1.4 Cookbooks** — Phase 18 (in progress)

## Phases

<details>
<summary>✅ v1.1 Knowledge Architecture + Dashboard Polish (Phases 1-5) — SHIPPED 2026-04-11</summary>

- [x] Phase 1: Knowledge Foundations (1/1 plans) — completed 2026-04-09
- [x] Phase 2: Knowledge Curator Agent (2/2 plans) — completed 2026-04-10
- [x] Phase 3: Agent Awareness (1/1 plans) — completed 2026-04-10
- [x] Phase 4: Flow Diagram Upgrade (3/3 plans) — completed 2026-04-10
- [x] Phase 5: Personal Knowledge Ingestion Pipeline (5/5 plans) — completed 2026-04-11

Full archive: `.planning/milestones/v1.1-ROADMAP.md`

</details>

<details>
<summary>✅ v1.2 Live Data + Knowledge Sync (Phases 6-11) — SHIPPED 2026-04-12</summary>

- [x] Phase 6: Library Config Fixes (1/1 plans) — completed 2026-04-12
- [x] Phase 7: Live Heartbeat (1/1 plans) — completed 2026-04-12
- [x] Phase 8: Bidirectional Knowledge Sync (1/1 plans) — completed 2026-04-13
- [x] Phase 9: Skill Management Dashboard (2/2 plans) — completed 2026-04-13
- [x] Phase 10: Flow Diagram UX (1/1 plans) — completed 2026-04-12
- [x] Phase 11: Gwen Self-Improving Loop (1/1 plans) — completed 2026-04-12

Full archive: `.planning/milestones/v1.2-ROADMAP.md`

</details>

<details>
<summary>✅ v1.3 Advanced Observability + Knowledge Depth (Phases 12-17) — SHIPPED 2026-04-15</summary>

- [x] Phase 12: Projects Knowledge Ingestion (1/1 plans) — completed 2026-04-14
- [x] Phase 13: Skill Coverage Gaps (1/1 plans) — completed 2026-04-14
- [x] Phase 14: Skill Failure Rate (2/2 plans) — completed 2026-04-14
- [x] Phase 15: Skill Heatmap (1/1 plans) — completed 2026-04-14
- [x] Phase 16: Per-Node Activity Panel (1/1 plans) — completed 2026-04-14
- [x] Phase 17: Collapsible Node Groups (2/2 plans) — completed 2026-04-15

Full archive: `.planning/milestones/v1.3-ROADMAP.md`

</details>

## Phase Details

### Phase 12: Projects Knowledge Ingestion
**Goal**: All Obsidian `projects/` subdirectory content is ingested into mem0 nightly and retrievable at session start
**Depends on**: Phase 8 (Bidirectional Knowledge Sync pattern — proven template)
**Requirements**: KNOW-08, KNOW-09
**Success Criteria** (what must be TRUE):
  1. Running `knowledge-curator.sh` includes a Step 7 that executes `projects-to-mem0.py` without error
  2. Markdown files from `~/github/knowledge/projects/` subdirectories appear in mem0 under `agent_id="shared"` with `project` metadata matching their parent directory name
  3. Re-running the script on the same files produces no duplicate mem0 entries (idempotent — mtime watermark + content-hash guards active)
  4. Each project directory tracks its own watermark key in `projects-ingestion-state.json` (isolated from `obsidian-ingestion-state.json`)
**Plans**: 1 plan
Plans:
- [ ] 12-01-PLAN.md — TDD implementation of projects-to-mem0.py with 3-guard dedup and Step 7 curator wiring

### Phase 13: Skill Coverage Gaps
**Goal**: Users can see which skills have gone unused for 30+ days so stale skills can be identified and pruned
**Depends on**: Phase 9 (Skill Management Dashboard — `/api/skills` route and Cookbooks node exist)
**Requirements**: SKILL-07
**Success Criteria** (what must be TRUE):
  1. The `/api/skills` response includes a `coverageGaps` array listing skill names with no usage event in the last 30 days
  2. The Cookbooks node (or Library view) displays a gap count that updates on each poll cycle
  3. The gap calculation reads timestamps from `~/.openclaw/skill-sync-state.json` `skill_usage` dict and cross-references against the full skill directory listing (shallow `iterdir` only — no vault recursion)
**Plans**: TBD

### Phase 14: Skill Failure Rate
**Goal**: Users can see how many skill invocations have failed, grouped by agent and error type, so systemic issues are visible
**Depends on**: Phase 13 (Skill Coverage Gaps — `/api/skills` extended; confirms pattern for further extension)
**Requirements**: SKILL-06
**Success Criteria** (what must be TRUE):
  1. `skill-sync.py` emits `failed` events to `skill-contributions.jsonl` when a skill operation errors — confirmed by a new entry appearing after a triggered failure
  2. The `/api/skills` response includes `failuresByAgent` and `failuresByErrorType` fields sourced from a stateful `failures.log` parser
  3. `disk_critical` error type entries are excluded from all failure counts
  4. The skills panel in the dashboard renders failure counts without crashing when `failures.log` is absent or empty
**Plans**: TBD

### Phase 15: Skill Heatmap
**Goal**: Users can see a 30-day contribution activity heatmap for skills, revealing which skills are actively evolving vs. dormant
**Depends on**: Phase 14 (Skill Failure Rate — failure events ingested into JSONL before heatmap reads time-series)
**Requirements**: SKILL-08
**Success Criteria** (what must be TRUE):
  1. A `skill-heatmap.tsx` component renders a CSS grid heatmap (30 columns x N skill rows) with color intensity reflecting daily contribution count
  2. Hovering a cell shows the date and contribution count without triggering a re-render of the full grid (local hover state, memoized cell array)
  3. The heatmap label clearly identifies the data as "Contribution Activity" (not invocation telemetry) to avoid misinterpretation
  4. The component handles an empty or sparse contribution list without error (clamps column count to minimum 1)
**Plans**: 1 plan
- [ ] 15-01-PLAN.md — Extend /api/skills with contributionHistory + build SkillHeatmap component (CSS grid, memoized cells) and render in NodeDetailPanel for the Cookbooks node
**UI hint**: yes

### Phase 16: Per-Node Activity Panel
**Goal**: Clicking any node in the Flow diagram shows the last 10 relevant activity events in the sidebar panel, for all canvas node types
**Depends on**: Phase 15 (Skill Heatmap — canvas code settled before sidebar changes; FLOW work begins after SKILL track complete)
**Requirements**: FLOW-13
**Success Criteria** (what must be TRUE):
  1. Clicking any canvas node opens the `NodeDetailPanel` sidebar showing up to 10 recent activity events filtered to that node's ID
  2. Nodes previously unmapped (qdrant, obsidian, knowledge-curator, per-agent nodes) return at least their available events rather than an empty panel
  3. The heartbeat fetch in the panel includes an `AbortController` that cancels in-flight requests when the panel is closed or the selected node changes
  4. Nodes with sparse event coverage display a documented "limited activity data" indicator rather than a broken or misleading empty state
**Plans**: 1 plan

Plans:
- [ ] 16-01-PLAN.md — Extend NodeDetailPanel with keyword-map event filter (qdrant/obsidian/agent-* coverage), AbortController cleanup, 10-event cap, and documented sparse-data indicator
**UI hint**: yes

### Phase 17: Collapsible Node Groups
**Goal**: Users can collapse inactive agent cluster group nodes in the Flow diagram to reduce visual clutter, and expand them again without losing edge connections
**Depends on**: Phase 16 (Per-Node Activity Panel — all canvas refactors complete before the riskiest canvas change)
**Requirements**: FLOW-12
**Success Criteria** (what must be TRUE):
  1. Child nodes of a group (Remote Agents, Dev Tools) have their coordinates expressed as parent-relative offsets — verified by confirming positions are unchanged visually after the parentId migration
  2. Clicking a group node toggles it between expanded and collapsed states; collapsed groups show a single summary box with aggregate health color
  3. Edges connected to hidden child nodes remain properly hidden (not dangling to canvas origin at 0,0) when a group is collapsed, and reappear correctly on expand
  4. The collapse/expand interaction works correctly after page reload (state resets to expanded by default — no persistence needed)
**Plans**: 2 plans

Plans:
- [ ] 17-01-PLAN.md — parentId coordinate migration (children → parent-relative offsets, no toggle logic)
- [ ] 17-02-PLAN.md — Collapse/expand toggle with aggregate health color + pure collapse-logic module
**UI hint**: yes

### Phase 18: cookbooks-page
**Goal**: Dedicated Cookbooks page in sidebar with gaps/health, heatmap, and full skills list
**Requirements**: COOK-01, COOK-02, COOK-03, COOK-04
**Success Criteria**:
  1. "The Cookbooks" appears in sidebar nav and navigates to `/cookbooks`
  2. Gaps/health panel shows coverage gap count, failures by agent, failures by error type
  3. 30-day heatmap renders (reuses existing `SkillHeatmap` component)
  4. Full skills list renders all skills with coverage gaps visually highlighted
**Plans**: 1 plan

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Knowledge Foundations | v1.1 | 1/1 | Complete | 2026-04-09 |
| 2. Knowledge Curator Agent | v1.1 | 2/2 | Complete | 2026-04-10 |
| 3. Agent Awareness | v1.1 | 1/1 | Complete | 2026-04-10 |
| 4. Flow Diagram Upgrade | v1.1 | 3/3 | Complete | 2026-04-10 |
| 5. Personal Knowledge Ingestion | v1.1 | 5/5 | Complete | 2026-04-11 |
| 6. Library Config Fixes | v1.2 | 1/1 | Complete | 2026-04-12 |
| 7. Live Heartbeat | v1.2 | 1/1 | Complete | 2026-04-12 |
| 8. Bidirectional Knowledge Sync | v1.2 | 1/1 | Complete | 2026-04-13 |
| 9. Skill Management Dashboard | v1.2 | 2/2 | Complete | 2026-04-13 |
| 10. Flow Diagram UX | v1.2 | 1/1 | Complete | 2026-04-12 |
| 11. Gwen Self-Improving Loop | v1.2 | 1/1 | Complete | 2026-04-12 |
| 12. Projects Knowledge Ingestion | v1.3 | 1/1 | Complete | 2026-04-14 |
| 13. Skill Coverage Gaps | v1.3 | 1/1 | Complete | 2026-04-14 |
| 14. Skill Failure Rate | v1.3 | 2/2 | Complete | 2026-04-14 |
| 15. Skill Heatmap | v1.3 | 1/1 | Complete | 2026-04-14 |
| 16. Per-Node Activity Panel | v1.3 | 1/1 | Complete | 2026-04-14 |
| 17. Collapsible Node Groups | v1.3 | 2/2 | Complete | 2026-04-14 |
