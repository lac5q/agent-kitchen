# Agent Kitchen

## What This Is

A restaurant-themed observability dashboard for Luis's AI agent infrastructure. Tracks all agents (local + remote), token economics, memory, knowledge bases, APO self-learning cycles, and system flow — with live data from local services and a fully automated knowledge ingestion pipeline. Deployed at kitchen.example.com.

## Core Value

Every agent and knowledge system is visible, connected, and self-improving — so Luis can see what's happening and fix problems before they compound.

## Requirements

### Validated

- ✓ 6-view dashboard (Kitchen Floor, Ledger, Notebook Wall, Library, Flow, Sous Vide) — v1.0
- ✓ Live data from RTK, mem0, QMD, filesystem, APO cron logs — v1.0
- ✓ Remote agent polling: Sophia, Maria, Lucia, Alba (Hermes), Gwen — v1.0
- ✓ React Flow interactive diagram with drag, zoom, minimap, click-to-drill — v1.0
- ✓ Live activity feed connected to flow nodes — v1.0
- ✓ GitNexus code graph panel in Library — v1.0
- ✓ Config-driven (agents.config.json, collections.config.json) for portability — v1.0
- ✓ Mobile responsive with hamburger nav — v1.0
- ✓ Cloudflare tunnel at kitchen.example.com — v1.0
- ✓ Obsidian vault + llm-wiki + gitnexus tracked in Library with doc count and freshness (KNOW-02..04) — v1.1
- ✓ Nightly knowledge-curator.sh: 5-step pipeline (gitnexus, llm-wiki, mem0 export, QMD+Qdrant, transcripts) at 2am (KNOW-01) — v1.1
- ✓ mem0 session-start preload: agents no longer start cold (KNOW-05) — v1.1
- ✓ Flow diagram: 4-row layout, 21 nodes, readable labels, heartbeat panel, noise-stripped activity feed (FLOW-01..07) — v1.1
- ✓ Personal knowledge ingestion: emails, calendar, Meet + Spark transcripts → mem0/Qdrant/Obsidian (Phase 5) — v1.1

## Current Milestone: v1.3 Advanced Observability + Knowledge Depth

**Goal:** Surface deeper insights across agent skills, Flow diagram, and Obsidian knowledge — closing all deferred items from v1.2.

**Target features:**
- FLOW-12: Collapsible node groups (fold inactive agent clusters in Flow diagram)
- FLOW-13: Per-node activity drill-down (last 10 events inline on node click)
- SKILL-06: Skill failure rate tracking from logs
- SKILL-07: Skill coverage gaps report (zero-usage skills in 30 days)
- SKILL-08: Per-skill usage heatmap in dashboard
- KNOW-08: `projects/` subdirectory ingestion into mem0 (beyond daily journals)
- KNOW-09: Per-project `agent_id` routing for vault → mem0 ingestion

### Out of Scope

- Auth/login — local dashboard, single user
- Database — all data from live services and filesystem
- Write operations — read-only dashboard
- Mobile-first — desktop-first, responsive is nice-to-have

## Context

**Tech stack:** Next.js 16, Tailwind CSS 4, shadcn/ui (base-ui), Recharts, Framer Motion, TanStack Query, React Flow (@xyflow/react), Vitest, Python 3 (ingestion scripts)

**Infrastructure:**
- Local agents: 22 discovered from ~/github/knowledge/agent-configs/
- Remote agents: Sophia (Tailscale), Maria (Tailscale), Lucia (localhost:3001), Alba/Hermes (localhost:18793), Gwen (CF tunnel)
- Production server: `npm start --port 3002` → Cloudflare tunnel → kitchen.example.com
- Obsidian vault = ~/github/knowledge/ (518+ markdown files, the actual knowledge base)
- Knowledge pipeline: 3,115+ docs in Qdrant Cloud `knowledge_docs` collection
- Ingestion: 50+ email threads, calendar events, Meet/Spark transcripts piped nightly

**Current state (v1.2):**
- Knowledge loop fully automated: emails arrive → Obsidian daily note; transcripts processed nightly; mem0 exports to QMD
- Obsidian journals synced to mem0 nightly with full dedup guards (obsidian-to-mem0.py, Step 6 of curator)
- Flow diagram shows live health for all nodes (obsidian + knowledge-curator via tristate signals)
- Skill sync pipeline visible in Flow: Cookbooks node shows live stats, dashed cyan edges, activity feed
- Gwen has persistent self-improving loop: stages skills to Hermes, reflection cron at 3am
- Agents start each Claude Code session with relevant mem0 context preloaded
- Production confirmed working at kitchen.example.com (production build, not dev server)

**Known tech debt:**
- 5 pre-existing Vitest test failures (smoke.test.tsx SummaryBar + .worktrees collection-card) — not introduced by v1.2, deferred to v1.3
- FLOW-11 verified programmatically; full visual QA at kitchen.example.com recommended before v1.3
- Nyquist validation incomplete for Phases 01, 02, 04

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| React Flow over custom SVG | Drag, zoom, minimap built-in; better extensibility | ✓ Good |
| Config-driven agent registry | Others can clone and customize without code changes | ✓ Good |
| Production build via `npm start` | Dev server breaks CF tunnel due to HMR WebSockets | ✓ Good |
| suppressHydrationWarning on body | Grammarly extension injects attrs before React hydrates | ✓ Good |
| Local agents from filesystem | No API needed — heartbeat files are ground truth | ✓ Good |
| Obsidian vault IS the knowledge base | ~/github/knowledge/ is both Obsidian vault and QMD source | ✓ Good |
| QMD = BM25 only, Qdrant = vector search | qmd embed forbidden — SQLite vectors not Qdrant Cloud | ✓ Good |
| knowledge-curator.sh 5-step orchestrator | Single cron + non-fatal guards = simple, observable pipeline | ✓ Good |
| Gemini embedding for Qdrant indexing | 3072 dims, 3,115+ docs indexed, stable hash IDs for idempotency | ✓ Good |
| mem0 session preload via SessionStart hook | Dual agent_id (claude + shared), fail-safe exit 0, startup-only gate | ✓ Good |
| gws CLI for Gmail ingestion | OAuth handled by gws, no token management in scripts | ✓ Good |
| ingestion-state.json watermarks | Atomic write via os.replace(), prevents re-processing across runs | ✓ Good |
| Phase 5 added to v1.1 mid-milestone | Ingestion pipeline was the missing piece to make knowledge loop complete | ✓ Good |

## Constraints

- **Tech:** Next.js 16 with base-ui (NOT Radix) — shadcn/ui components have different APIs than standard docs
- **Deployment:** Production is `npm start` not `npm run dev` — dev server breaks Cloudflare (HMR WebSockets)
- **Security:** No `execSync`/`exec` — use `execFileSync` only (security hook enforces this)
- **Model:** Use Sonnet for implementation, Opus for architecture/analysis only
- **Vector search:** ALL semantic search uses Qdrant Cloud — `qmd embed` is FORBIDDEN

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-12 — v1.2 shipped*
