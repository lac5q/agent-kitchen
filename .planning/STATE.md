---
gsd_state_version: 1.0
milestone: v1.2
milestone_name: Live Data + Knowledge Sync
status: roadmapped
stopped_at: Roadmap created — ready to plan Phase 6
last_updated: "2026-04-12T00:00:00.000Z"
last_activity: 2026-04-12
progress:
  total_phases: 6
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# State: Agent Kitchen

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-11 for v1.2)

**Core value:** Every agent and knowledge system is visible, connected, and self-improving.
**Current focus:** Milestone v1.2 — Live Data + Knowledge Sync

## Current Position

Phase: Phase 6 — Library Config Fixes (next to start)
Plan: —
Status: Roadmap defined, ready for planning
Last activity: 2026-04-12 — v1.2 roadmap created (Phases 6-11)

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**

- Total plans completed: 0
- Average duration: —
- Total execution time: —

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

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

### Roadmap Evolution

- v1.2 roadmap defined 2026-04-12: 6 phases (6-11), 16 requirements mapped, 0 orphans

### Pending Todos

None.

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-04-12
Stopped at: v1.2 roadmap created
Resume file: None
Next action: `/gsd-plan-phase 6`
