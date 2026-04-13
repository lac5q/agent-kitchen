---
gsd_state_version: 1.0
milestone: v1.2
milestone_name: Live Data + Knowledge Sync
status: in_progress
stopped_at: "Phase 7 Plan 01 complete — live heartbeat for obsidian + knowledge-curator"
last_updated: "2026-04-13T07:23:00.000Z"
last_activity: 2026-04-13
progress:
  total_phases: 6
  completed_phases: 2
  total_plans: 2
  completed_plans: 2
  percent: 33
---

# State: Agent Kitchen

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-11 for v1.2)

**Core value:** Every agent and knowledge system is visible, connected, and self-improving.
**Current focus:** Milestone v1.2 — Live Data + Knowledge Sync

## Current Position

Phase: Phase 7 — Live Heartbeat (COMPLETE)
Plan: 01/01 — complete
Status: Phase 7 done; ready for Phase 8
Last activity: 2026-04-13 — Phase 7 Plan 01 complete (live heartbeat — obsidian + curator nodes)

Progress: [####░░░░░░] 33%

## Performance Metrics

**Velocity:**

- Total plans completed: 2
- Average duration: ~18m
- Total execution time: ~36m

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 06 — Library Config Fixes | 1 | ~30m | ~30m |
| 07 — Live Heartbeat | 1 | ~6m | ~6m |

*Updated after each plan completion*

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

### Roadmap Evolution

- v1.2 roadmap defined 2026-04-12: 6 phases (6-11), 16 requirements mapped, 0 orphans

### Pending Todos

None.

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-04-13
Stopped at: Phase 7 Plan 01 complete — live heartbeat (FLOW-08, FLOW-09 satisfied)
Resume file: None
Next action: `/gsd-plan-phase 8`
