---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Knowledge Architecture + Dashboard Polish
status: executing
stopped_at: Completed 02-01-PLAN.md — three Knowledge Curator scripts created and committed
last_updated: "2026-04-09T20:20:36.016Z"
last_activity: 2026-04-09
progress:
  total_phases: 4
  completed_phases: 1
  total_plans: 3
  completed_plans: 2
  percent: 67
---

# State: Agent Kitchen

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-09)

**Core value:** Every agent and knowledge system is visible, connected, and self-improving.
**Current focus:** Phase 02 — knowledge-curator-agent

## Current Position

Phase: 02 (knowledge-curator-agent) — EXECUTING
Plan: 2 of 2
Status: Ready to execute
Last activity: 2026-04-09

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
| Phase 01 P01 | 251 | 3 tasks | 4 files |
| Phase 02-knowledge-curator-agent P01 | 111s | 2 tasks | 3 files |

## Accumulated Context

### Decisions

- Production runs on port 3002 via `npm start -- --port 3002`; kill existing: `lsof -ti :3002 | xargs kill -9`
- After any build change: rebuild with `npm run build` then restart
- base-ui tooltip: use `className` prop not `asChild` on TooltipTrigger
- Agents config: agents.config.json at project root (not hardcoded)
- Collections config: collections.config.json at project root
- Remote agents Lucia=localhost:3001, Alba=localhost:18793 (both local, not Tailscale)
- GitNexus AGENTS.md injected — run `npx gitnexus analyze` after commits
- Phase 4 depends on Phase 1 (not Phase 3) — Flow work can proceed in parallel with mem0 preload
- **Vector store architecture (CRITICAL):** QMD handles BM25/lexical keyword search ONLY (`qmd search`, `qmd query`, `qmd update`). ALL vector/semantic search uses **Qdrant Cloud** (AWS us-west-1). `qmd embed` is FORBIDDEN — it stores vectors in local SQLite, not Qdrant. Embeddings: Gemini `models/gemini-embedding-2-preview` (3072 dims). Qdrant collections: `agent_memory` (mem0 — DO NOT TOUCH), `knowledge_docs` (markdown indexing — built in Phase 2). Config: `~/github/knowledge/mem0-config.yaml`. Docs: `~/github/knowledge/shared/AGENT_INFRASTRUCTURE_SETUP.md`.
- **Research protocol:** Any research touching search/indexing/embeddings/vectors MUST check `~/github/knowledge/mem0-config.yaml` and run `qmd search "qdrant vector store embed"` before assuming tool capabilities. The knowledge base is the source of truth for established infrastructure.
- [Phase 01]: Use destructured lastUpdated in CollectionCard for consistency with existing destructuring pattern
- [Phase 01]: knowledge vault registered as single top-level collection at vault root, not split by subdir
- [Phase 01]: Non-fatal gitnexus call in refresh-index.sh via || echo to satisfy T-01-04 (set -e would abort qmd update on failure)
- [Phase 02-knowledge-curator-agent]: llm-wiki processing remains manual (check-only + warn via Alba); qdrant-indexer.py indexes 5 paths (4 basePath collections + mem0-exports) with stable hash IDs for idempotent upserts; assert guard prevents accidental agent_memory writes

### Pending Todos

None yet.

### Blockers/Concerns

None yet.

## Session Continuity

Last session: 2026-04-09T20:20:36.013Z
Stopped at: Completed 02-01-PLAN.md — three Knowledge Curator scripts created and committed
Resume file: None
