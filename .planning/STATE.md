---
gsd_state_version: 1.0
milestone: v1.3
milestone_name: Advanced Observability + Knowledge Depth — SHIPPED 2026-04-15
status: executing
stopped_at: Roadmap defined — 6 phases (12-17), 7 requirements, 0 orphans
last_updated: "2026-04-15T19:12:37.339Z"
last_activity: 2026-04-15
progress:
  total_phases: 6
  completed_phases: 6
  total_plans: 8
  completed_plans: 8
  percent: 100
---

# State: Agent Kitchen

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-13 for v1.3)

**Core value:** Every agent and knowledge system is visible, connected, and self-improving.
**Current focus:** Phase 17 — collapsible-node-groups

## Current Position

Phase: 17 (collapsible-node-groups) — EXECUTING
Plan: 1 of 2
Status: Executing Phase 17
Last activity: 2026-04-15

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
- [v1.3 roadmap]: KNOW-08+09 combined into Phase 12 — isolated projects-ingestion-state.json, agent_id="shared" + project metadata (not 46 per-project namespaces — quota risk)
- [v1.3 roadmap]: SKILL-07 before SKILL-06 — skill_usage dict available now; failures.log requires new instrumentation before SKILL-06 API is meaningful
- [v1.3 roadmap]: SKILL-06 requires two-commit sequence — stateful parser first, then API + UI; naive line-by-line parser breaks on multi-line tracebacks
- [v1.3 roadmap]: FLOW-12 last — riskiest change; parentId coordinate migration must happen first before any toggle logic is wired

### Roadmap Evolution

- v1.2 roadmap defined 2026-04-12: 6 phases (6-11), 16 requirements mapped, 0 orphans
- v1.3 roadmap defined 2026-04-13: 6 phases (12-17), 7 requirements mapped, 0 orphans

### Pending Todos

None.

### Blockers/Concerns

- 5 pre-existing Vitest test failures (smoke.test.tsx SummaryBar + .worktrees collection-card) — not introduced by v1.2, carry forward as known debt
- FLOW-11 verified programmatically; full visual QA at kitchen.example.com recommended before Phase 16/17

## Session Continuity

Last session: 2026-04-13
Stopped at: Roadmap defined — 6 phases (12-17), 7 requirements, 0 orphans
Resume file: None
Next action: `/gsd-plan-phase 12`
