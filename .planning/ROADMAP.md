# Roadmap: Agent Kitchen

## Milestones

- **v1.1 Knowledge Architecture + Dashboard Polish** - Phases 1-4 (in progress)

## Phases

### v1.1 Knowledge Architecture + Dashboard Polish (In Progress)

**Milestone Goal:** Connect isolated knowledge systems into a unified loop and polish the Flow diagram so the full agent graph is visible and readable.

- [x] **Phase 1: Knowledge Foundations** - Wire Obsidian vault, llm-wiki, and gitnexus into the automated refresh cycle (config + cron, no new infrastructure) (completed 2026-04-09)
- [ ] **Phase 2: Knowledge Curator Agent** - Shell script + cron that orchestrates the nightly knowledge loop end-to-end
- [ ] **Phase 3: Agent Awareness** - mem0 session-start preload so agents begin each session with relevant memory
- [ ] **Phase 4: Flow Diagram Upgrade** - All React Flow visual and layout improvements, plus new nodes and edges for the knowledge graph

## Phase Details

### Phase 1: Knowledge Foundations
**Goal**: The Obsidian vault, llm-wiki, and gitnexus are all tracked collections in QMD and refresh automatically on a schedule
**Depends on**: Nothing (first phase)
**Requirements**: KNOW-02, KNOW-03, KNOW-04
**Success Criteria** (what must be TRUE):
  1. Library view shows the Obsidian vault (`~/github/knowledge/`) as a tracked collection with doc count and freshness date
  2. llm-wiki wiki pages are indexed by QMD and return results when searched by agents
  3. `gitnexus analyze` runs automatically in the weekly refresh cron across all 8 indexed repos without manual intervention
**Plans:** 1/1 plans complete
Plans:
- [x] 01-01-PLAN.md — Wire collections config, add CollectionCard freshness date, integrate gitnexus into weekly cron

### Phase 2: Knowledge Curator Agent
**Goal**: A nightly cron job runs a Knowledge Curator shell script that executes gitnexus analysis, processes llm-wiki raw files, exports mem0 highlights to QMD-indexed markdown, runs `qmd update` for BM25 keyword search, and indexes all markdown collections into Qdrant Cloud (`knowledge_docs` collection) for semantic/vector search
**Depends on**: Phase 1
**Requirements**: KNOW-01
**Success Criteria** (what must be TRUE):
  1. A shell script exists that can be run manually and produces all four outputs (gitnexus analyze, llm-wiki processing, mem0→QMD export, qmd update)
  2. A cron entry runs the script nightly with output logged to an inspectable log file
  3. mem0 highlights from the previous day appear as searchable markdown files in QMD after the nightly run
  4. Markdown collections are indexed in Qdrant Cloud `knowledge_docs` collection and return results for semantic queries (verified via `curl` to Qdrant API)
**Plans**: TBD

### Phase 3: Agent Awareness
**Goal**: Agents no longer start cold — each session begins with relevant mem0 context already loaded
**Depends on**: Phase 2
**Requirements**: KNOW-05
**Success Criteria** (what must be TRUE):
  1. A CLAUDE.md instruction or hook exists that calls `memory_search` with the current project context at session start
  2. Starting a new Claude Code session on any known project surfaces at least one relevant mem0 memory without the user manually requesting it
**Plans**: TBD

### Phase 4: Flow Diagram Upgrade
**Goal**: The Flow page shows a clean, non-overlapping graph with readable labels, real heartbeat content in the detail panel, a human-readable activity feed, and new nodes for the Knowledge Curator and Obsidian hub with accurate data flow edges
**Depends on**: Phase 1
**Requirements**: FLOW-01, FLOW-02, FLOW-03, FLOW-04, FLOW-05, FLOW-06, FLOW-07
**Success Criteria** (what must be TRUE):
  1. All 13+ nodes are visible on desktop without overlap, and every node label is fully readable without truncation
  2. Clicking any agent node opens a detail panel that shows real content from that agent's HEARTBEAT.md or HEARTBEAT_STATE.md file
  3. The activity feed displays human-readable event descriptions with log formatting noise (===, ---, raw timestamps) stripped
  4. A Knowledge Curator node appears in the diagram connected to GitNexus, LLM Wiki, mem0, and QMD — displaying last-run time and next scheduled run from live cron data
  5. An Obsidian/Knowledge Base node appears as the ground truth hub, with edges from QMD, LLM Wiki, and Knowledge Curator connecting to it
  6. New edges show the mem0→QMD bridge and llm-wiki→QMD indexing data flows
**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Knowledge Foundations | v1.1 | 1/1 | Complete   | 2026-04-09 |
| 2. Knowledge Curator Agent | v1.1 | 0/? | Not started | - |
| 3. Agent Awareness | v1.1 | 0/? | Not started | - |
| 4. Flow Diagram Upgrade | v1.1 | 0/? | Not started | - |
