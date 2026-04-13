# Requirements: Agent Kitchen

**Defined:** 2026-04-12
**Core Value:** Every agent and knowledge system is visible, connected, and self-improving — so Luis can see what's happening and fix problems before they compound.

## v1.2 Requirements

### CONFIG — Library Fixes

- [ ] **CONFIG-01**: User can see the correct meet-recordings file count in Library (fix basePath pointing to stale path — diverged from where ingestion actually writes)
- [ ] **CONFIG-02**: mem0-exports collection is visible in Library view alongside other knowledge collections

### FLOW — Live Observability

- [ ] **FLOW-08**: Obsidian node derives status from live vault filesystem signals (today's journal exists → active; >24h → idle; inaccessible → error) — hardcoded status removed
- [ ] **FLOW-09**: knowledge-curator node derives status from `/tmp/knowledge-curator.log` (ran <26h + complete → active; ran with warnings → idle; missed cron → error) — hardcoded status removed
- [ ] **FLOW-10**: Flow diagram auto-fits the viewport on initial load without manual zoom
- [ ] **FLOW-11**: Flow diagram is visually clean — nodes well-spaced, edges don't cross excessively, readable at default zoom, fits screen without feeling cramped or oversized

### KNOW — Knowledge Sync

- [ ] **KNOW-06**: Obsidian daily journal notes are ingested into mem0 nightly as memories (Obsidian → mem0 direction, running as curator Step 6)
- [ ] **KNOW-07**: Ingestion is idempotent — mtime watermark + content-hash dedup + origin tag prevent duplicate memories across runs

### SKILL — Skill Management Dashboard

- [ ] **SKILL-01**: `skill-sync.py` appends events to `skill-contributions.jsonl` after each sync/prune run (JSONL bridge — ~10 lines added to existing script)
- [ ] **SKILL-02**: `/api/skills` route returns live skill stats (total count, contributed by Hermes, contributed by Gwen, stale count, last pruned date)
- [ ] **SKILL-03**: Cookbooks node in Flow shows live skill stats panel — Skills · From Hermes · From Gwen · Last Pruned · Stale
- [ ] **SKILL-04**: Dashed cyan edges appear in Flow: alba→cookbooks and cookbooks→gateways (skill contribution flow)
- [ ] **SKILL-05**: Activity feed shows skill contribution events (last 2h from JSONL) when cookbooks node is selected

### AGENT — Gwen Self-Improving Loop

- [ ] **AGENT-01**: Gwen's `self-improving-agent` skill installed with mem0-only memory (Cognee-OpenClaw explicitly NOT installed — conflicts with Qdrant/mem0 architecture)
- [ ] **AGENT-02**: Skills Gwen creates during sessions are staged to `.hermes-staging/` for Hermes pickup (not to `~/skills/` ClawHub silo)
- [ ] **AGENT-03**: Gwen reflection cron runs at 3am (avoids 4am collision with Hermes sync cron)

## v2 Requirements

### FLOW — Advanced UX

- **FLOW-12**: Collapsible node groups (fold inactive agent cluster)
- **FLOW-13**: Per-node drill-down showing last 10 activity events inline

### SKILL — Extended Tracking

- **SKILL-06**: Skill failure rate tracking (failed invocations per skill from logs)
- **SKILL-07**: Skill coverage gaps report (skills with zero usage in 30 days)
- **SKILL-08**: Per-skill usage heatmap in dashboard

### KNOW — Extended Sync

- **KNOW-08**: `projects/` subdirectory ingestion into mem0 (not just daily journals)
- **KNOW-09**: Per-project agent_id routing for vault → mem0 ingestion

## Out of Scope

| Feature | Reason |
|---------|--------|
| Auth/login | Local dashboard, single user |
| Write operations | Read-only dashboard — no mutations from UI |
| Real-time file-watcher sync (Obsidian → mem0) | iCloud/filesystem events unreliable; nightly batch sufficient |
| Merging ~/knowledge/ and ~/github/knowledge/ paths | Data duplication risk; canonical path decision is sufficient |
| Cognee-OpenClaw for Gwen | Creates parallel memory layer conflicting with Qdrant/mem0 |
| qmd embed anywhere | Forbidden per architecture — all semantic search via Qdrant Cloud |
| execSync/exec in any new code | Security constraint — use execFileSync or pure fs/promises |
| Alerting/notifications | Dashboard is read-only observability only |
| Mobile-first | Desktop-first; responsive is nice-to-have |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| CONFIG-01 | Phase 6 | Pending |
| CONFIG-02 | Phase 6 | Pending |
| FLOW-08 | Phase 7 | Pending |
| FLOW-09 | Phase 7 | Pending |
| FLOW-10 | Phase 10 | Pending |
| FLOW-11 | Phase 10 | Pending |
| KNOW-06 | Phase 8 | Pending |
| KNOW-07 | Phase 8 | Pending |
| SKILL-01 | Phase 9 | Pending |
| SKILL-02 | Phase 9 | Pending |
| SKILL-03 | Phase 9 | Pending |
| SKILL-04 | Phase 9 | Pending |
| SKILL-05 | Phase 9 | Pending |
| AGENT-01 | Phase 11 | Pending |
| AGENT-02 | Phase 11 | Pending |
| AGENT-03 | Phase 11 | Pending |

**Coverage:**
- v1.2 requirements: 16 total
- Mapped to phases: 16
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-12*
*Last updated: 2026-04-12 after milestone v1.2 scoping*
