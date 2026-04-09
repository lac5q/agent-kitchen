# Requirements: Agent Kitchen

**Defined:** 2026-04-09
**Core Value:** Every agent and knowledge system is visible, connected, and self-improving.

## v1.1 Requirements

### Knowledge Architecture

- [ ] **KNOW-01**: System has a Knowledge Curator agent that runs nightly — executes `gitnexus analyze` across all indexed repos, processes `llm-wiki/raw/` into wiki pages, exports mem0 highlights to QMD-indexed markdown, runs `qmd update` (BM25 keyword index only), and indexes all markdown collections into Qdrant Cloud `knowledge_docs` collection for semantic/vector search. **`qmd embed` is FORBIDDEN** — it stores vectors in local SQLite, not Qdrant Cloud.
- [x] **KNOW-02**: Obsidian vault (`~/github/knowledge/`) appears as a tracked collection in the Library view with doc count and freshness
- [x] **KNOW-03**: `llm-wiki` wiki pages are indexed by QMD (add to collections.config.json, verify searchable by agents)
- [x] **KNOW-04**: GitNexus `analyze` runs automatically in the weekly refresh cron across all 8 indexed repos
- [ ] **KNOW-05**: mem0 session-start preload — hook or CLAUDE.md instruction that calls `memory_search` with current project context so agents don't start cold every session

### Flow Dashboard

- [ ] **FLOW-01**: React Flow nodes display label text cleanly below each node — no truncation or missing labels
- [ ] **FLOW-02**: Node detail panel shows real content from agent heartbeat files (HEARTBEAT.md, HEARTBEAT_STATE.md) not just static stats
- [ ] **FLOW-03**: Activity feed shows human-readable event descriptions — log formatting noise (===, ---, timestamps) stripped
- [ ] **FLOW-04**: Flow page desktop layout has no node overlap — all 13+ nodes visible without crowding
- [ ] **FLOW-05**: Flow diagram includes a Knowledge Curator node (🧹) connected to GitNexus, LLM Wiki, mem0, and QMD — shows last-run time and next scheduled run from live cron/schedule data
- [ ] **FLOW-06**: Flow diagram edges reflect new data flows — mem0→QMD bridge, llm-wiki→QMD indexing, gitnexus→agents knowledge edge all shown
- [ ] **FLOW-07**: Flow diagram includes an Obsidian/Knowledge Base node as the ground truth hub that QMD, LLM Wiki, and Knowledge Curator connect to

## v2 Requirements

### Knowledge Depth
- **KNOW-06**: mem0 exports sync bidirectionally — agent writes to mem0, nightly export lands in Obsidian as searchable markdown
- **KNOW-07**: LLM Wiki processing is triggered automatically when new files land in raw/ (inotify or cron-polling)
- **KNOW-08**: GitNexus wiki generation (`npx gitnexus wiki`) runs after analyze and outputs to llm-wiki/

### Dashboard
- **FLOW-08**: Flow node positions persist across sessions (localStorage)
- **FLOW-09**: Flow diagram supports multiple layout modes (hierarchical, force-directed, manual)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Auth/login | Single-user local dashboard |
| Write operations from dashboard | Read-only — writes happen in source systems |
| Real-time WebSocket streaming | Polling sufficient, simpler to maintain |
| Mobile app | Web-first |
| LLM Wiki UI editor | Wiki edited in Obsidian directly |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| KNOW-01 | Phase 2 | Pending |
| KNOW-02 | Phase 1 | Complete |
| KNOW-03 | Phase 1 | Complete |
| KNOW-04 | Phase 1 | Complete |
| KNOW-05 | Phase 3 | Pending |
| FLOW-01 | Phase 4 | Pending |
| FLOW-02 | Phase 4 | Pending |
| FLOW-03 | Phase 4 | Pending |
| FLOW-04 | Phase 4 | Pending |
| FLOW-05 | Phase 4 | Pending |
| FLOW-06 | Phase 4 | Pending |
| FLOW-07 | Phase 4 | Pending |

**Coverage:**
- v1.1 requirements: 12 total
- Mapped to phases: 12/12 ✓
- Unmapped: 0

---
*Requirements defined: 2026-04-09*
*Last updated: 2026-04-08 — Traceability mapped after v1.1 roadmap creation*
