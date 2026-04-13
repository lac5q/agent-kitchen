---
gsd_state_version: 1.0
milestone: v1.3
milestone_name: Advanced Observability + Knowledge Depth
status: in_progress
stopped_at: Defining requirements
last_updated: "2026-04-13T18:05:00Z"
last_activity: 2026-04-13 — Milestone v1.3 started
progress:
  total_phases: 0
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# State: Agent Kitchen

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-13 for v1.3)

**Core value:** Every agent and knowledge system is visible, connected, and self-improving.
**Current focus:** Milestone v1.3 — Advanced Observability + Knowledge Depth

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-04-13 — Milestone v1.3 started

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**

- Total plans completed: 0
- Average duration: —
- Total execution time: —

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| — | — | — | — |

## Accumulated Context

### Decisions

- Production runs on port 3002 via `npm start -- --port 3002`; kill existing: `lsof -ti :3002 | xargs kill -9`
- After any build change: rebuild with `npm run build` then restart
- base-ui tooltip: use `className` prop not `asChild` on TooltipTrigger
- Agents config: agents.config.json at project root (not hardcoded)
- Collections config: collections.config.json at project root
- Remote agents Lucia=localhost:3001, Alba=localhost:18793 (both local, not Tailscale)
- GitNexus AGENTS.md injected — run `npx gitnexus analyze` after commits
- **Vector store architecture (CRITICAL):** QMD handles BM25/lexical keyword search ONLY. ALL vector/semantic search uses Qdrant Cloud (AWS us-west-1). `qmd embed` is FORBIDDEN. Embeddings: Gemini `models/gemini-embedding-2-preview` (3072 dims). Qdrant collections: `agent_memory` (mem0 — DO NOT TOUCH), `knowledge_docs` (markdown indexing).
- **Security:** No `execSync`/`exec` — use `execFileSync` or pure `fs/promises` only
- **Obsidian heartbeat:** stat 3-5 known paths only — never recursive readdir on vault (518+ files, 10s poll = catastrophic inode load)
- **Curator heartbeat window:** 26h (not 1h) — cron runs at 2am; by midnight it is 22h stale
- **KNOW-06 dedup:** Three guards required — origin tag + content-hash gate + mtime watermark. Missing any one allows duplicates.
- **mem0 writes:** Only via `POST http://localhost:3201/memory/add` — never touch `agent_memory` Qdrant collection directly
- **Skill sync:** `skill-sync.py` is the single sync engine — do NOT create parallel scripts
- **Gwen memory:** Cognee-OpenClaw explicitly NOT installed — conflicts with mem0/Qdrant architecture
- **basePath fix scope:** Only `meet-recordings` entry in collections.config.json. Do not touch `alex-docs` or `turnedyellow-admin` (different base intentionally).
- **Vitest ESM mocks:** Use `// @vitest-environment node` + `await import()` after `vi.mock()` for node modules (child_process, fs/promises). Static imports cause mocks to not intercept correctly in vitest 4.x.
- **checkServiceTristate:** 3-state health helper for up/degraded/down — keep separate from binary checkService to avoid risk to existing services.
- [Phase 08-bidirectional-knowledge-sync]: AGENT_ID fixed to claude — journals must land under correct agent per KNOW-06; previous value gwen was a draft artifact
- [Phase 08-bidirectional-knowledge-sync]: STATE_FILE isolated to obsidian-ingestion-state.json — prevents collision with Phase 5 ingestion-state.json (gmail/calendar/gdrive_meet/spark)
- [Phase 08-bidirectional-knowledge-sync]: All three KNOW-07 guards active — origin tag is not informational; it actively signals mem0-export.sh to skip obsidian-originated memories
- [Phase 09]: Route reads SKILL_SYNC_STATE from ~/.openclaw/skill-sync-state.json for lastPruned/lastUpdated
- [Phase 09-skill-management-dashboard]: Use allAgentIds (already in edges useMemo deps) not keyRemote for alba guard — prevents stale closure (T-09-06)
- [Phase 09-skill-management-dashboard]: cookbooks subtitle uses skillCount prop (not skillsStats) to avoid adding skillsStats to nodes useMemo deps
- [Phase 11-gwen-self-improving-loop]: STAGING_DIR constant derived from CONFIG["master_dir"] so tests can monkeypatch both together
- [Phase 11-gwen-self-improving-loop]: Grace period fix — replaced hardcoded 90-day value with CONFIG["hermes_contrib_grace_days"] (365d); staging-promoted skills auto-qualify via "hermes" in synced_from path
- [Phase 11-gwen-self-improving-loop]: Gwen reflection cron at 0 3 * * * America/Los_Angeles — 1h before Hermes skill-sync (0 4 * * *), no collision confirmed

### Roadmap Evolution

- v1.2 roadmap defined 2026-04-12: 6 phases (6-11), 16 requirements mapped, 0 orphans
- v1.3 roadmap: TBD — phases 12+, 7 requirements deferred from v1.2

### Pending Todos

None.

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-04-13
Stopped at: Milestone v1.3 started — researching + defining requirements
Resume file: None
Next action: `/gsd-plan-phase 12`
