# Roadmap: Agent Kitchen

## Milestones

- ✅ **v1.1 Knowledge Architecture + Dashboard Polish** — Phases 1-5 (shipped 2026-04-11)
- 🔄 **v1.2 Live Data + Knowledge Sync** — Phases 6-11 (in progress)

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

### v1.2 Live Data + Knowledge Sync

- [ ] **Phase 6: Library Config Fixes** - Fix meet-recordings basePath + expose mem0-exports in Library
- [ ] **Phase 7: Live Heartbeat** - Wire obsidian + knowledge-curator nodes to real health signals
- [x] **Phase 8: Bidirectional Knowledge Sync** - Obsidian journals → mem0 nightly with dedup guards (completed 2026-04-13)
- [ ] **Phase 9: Skill Management Dashboard** - Expose skill sync pipeline in Flow diagram
- [ ] **Phase 10: Flow Diagram UX** - Auto-fit viewport + visual polish
- [ ] **Phase 11: Gwen Self-Improving Loop** - Install + configure self-improving-agent for Gwen

## Phase Details

### Phase 6: Library Config Fixes
**Goal**: Library view shows correct data for all knowledge collections without requiring code changes
**Depends on**: Nothing (config-only, do first)
**Requirements**: CONFIG-01, CONFIG-02
**Success Criteria** (what must be TRUE):
  1. Library view shows ~100 documents for meet-recordings (matching actual ingestion output at `~/github/knowledge/gdrive/meet-recordings`)
  2. mem0-exports collection appears as a card in Library view alongside Obsidian, llm-wiki, and GitNexus
  3. No other Library collection entries are affected by the changes
**Plans**: 1 plan

Plans:
- [ ] 06-01-PLAN.md — Fix meet-recordings basePath and add mem0-exports entry to collections.config.json

### Phase 7: Live Heartbeat
**Goal**: Obsidian and knowledge-curator Flow nodes reflect real health status based on filesystem and log signals
**Depends on**: Phase 6
**Requirements**: FLOW-08, FLOW-09
**Success Criteria** (what must be TRUE):
  1. Obsidian node turns green when today's journal file exists in `~/github/knowledge/journals/`
  2. Obsidian node turns yellow (idle) when vault is accessible but last journal is older than 24h
  3. Obsidian node turns red (error) when vault directory is missing or inaccessible
  4. knowledge-curator node turns green when `/tmp/knowledge-curator.log` is < 26h old and last line confirms successful completion
  5. knowledge-curator node turns red (error) when log is missing or more than 26h old (missed cron)
**Plans**: 1 plan

Plans:
- [ ] 07-01-PLAN.md — Add constants, checkServiceTristate helper, obsidianStatus + curatorStatus to health API, remove hardcoded canvas lines

### Phase 8: Bidirectional Knowledge Sync
**Goal**: Obsidian daily journal notes are fed into mem0 nightly with full deduplication protection
**Depends on**: Phase 7
**Requirements**: KNOW-06, KNOW-07
**Success Criteria** (what must be TRUE):
  1. After `knowledge-curator.sh` runs nightly, journal entries from `journals/YYYY-MM-DD.md` appear in mem0 (verifiable via `GET /memory/all?agent_id=claude`)
  2. Running the sync twice on the same day does not create duplicate mem0 memories (mtime watermark + content-hash dedup prevent re-ingestion)
  3. Memories synced from Obsidian carry `metadata.source = "obsidian-sync"` so mem0 exports do not re-ingest them back
  4. `knowledge-curator.sh` Step 6 runs `obsidian-to-mem0.py` as a non-fatal step (failure does not abort curator)
**Plans**: 1 plan

Plans:
- [x] 08-01-PLAN.md — Fix 3 deviations in obsidian-to-mem0.py (agent_id, state file, docstring) + 10-scenario TDD pytest suite

### Phase 9: Skill Management Dashboard
**Goal**: Skill sync pipeline activity is visible in the Flow diagram via a live Cookbooks node panel
**Depends on**: Phase 6
**Requirements**: SKILL-01, SKILL-02, SKILL-03, SKILL-04, SKILL-05
**Success Criteria** (what must be TRUE):
  1. `/api/skills` returns live skill stats (total count, contributed by Hermes, contributed by Gwen, stale count, last pruned date) — not a hardcoded value
  2. Cookbooks node in Flow shows a live stats panel with: Skills, From Hermes, From Gwen, Last Pruned, Stale
  3. Dashed cyan edges appear in Flow connecting alba to cookbooks and cookbooks to gateways
  4. Selecting the Cookbooks node in the activity feed shows skill contribution events from the last 2 hours
  5. `skill-sync.py` appends structured events to `skill-contributions.jsonl` after each sync/prune run (existing script extended, no parallel scripts created)
**Plans**: TBD
**UI hint**: yes

### Phase 10: Flow Diagram UX
**Goal**: Flow diagram fits the viewport on load and presents nodes at a readable, non-cramped scale
**Depends on**: Phase 9
**Requirements**: FLOW-10, FLOW-11
**Success Criteria** (what must be TRUE):
  1. Flow diagram auto-fits to the viewport on initial page load without the user needing to manually zoom or pan
  2. All 21 nodes are visible and readable at default zoom without overlapping labels or crossing edges that obscure meaning
**Plans**: TBD
**UI hint**: yes

### Phase 11: Gwen Self-Improving Loop
**Goal**: Gwen has a persistent self-improvement loop that routes memories to mem0 and skills to Hermes staging
**Depends on**: Phase 9
**Requirements**: AGENT-01, AGENT-02, AGENT-03
**Success Criteria** (what must be TRUE):
  1. `self-improving-agent` skill is installed in Gwen's OpenClaw workspace with Cognee-OpenClaw explicitly NOT enabled
  2. Skills Gwen creates during sessions appear in `~/github/knowledge/skills/.hermes-staging/` for Hermes pickup (not in `~/skills/`)
  3. Gwen's reflection cron is scheduled at 3am (confirmed no collision with Hermes 4am sync cron)
**Plans**: TBD

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Knowledge Foundations | v1.1 | 1/1 | Complete | 2026-04-09 |
| 2. Knowledge Curator Agent | v1.1 | 2/2 | Complete | 2026-04-10 |
| 3. Agent Awareness | v1.1 | 1/1 | Complete | 2026-04-10 |
| 4. Flow Diagram Upgrade | v1.1 | 3/3 | Complete | 2026-04-10 |
| 5. Personal Knowledge Ingestion | v1.1 | 5/5 | Complete | 2026-04-11 |
| 6. Library Config Fixes | v1.2 | 0/1 | Planned | - |
| 7. Live Heartbeat | v1.2 | 0/1 | Planned | - |
| 8. Bidirectional Knowledge Sync | v1.2 | 1/1 | Complete   | 2026-04-13 |
| 9. Skill Management Dashboard | v1.2 | 0/2 | Not started | - |
| 10. Flow Diagram UX | v1.2 | 0/1 | Not started | - |
| 11. Gwen Self-Improving Loop | v1.2 | 0/1 | Not started | - |
