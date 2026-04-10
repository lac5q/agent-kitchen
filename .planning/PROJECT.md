# Agent Kitchen

## What This Is

A restaurant-themed observability dashboard for Luis's AI agent infrastructure. Tracks all agents (local + remote), token economics, memory, knowledge bases, APO self-learning cycles, and system flow — with live data from local services. Deployed at kitchen.epiloguecapital.com.

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
- ✓ Cloudflare tunnel at kitchen.epiloguecapital.com — v1.0

### Active

<!-- v1.1 requirements — defined below -->

### Out of Scope

- Auth/login — local dashboard, single user
- Database — all data from live services and filesystem
- Write operations — read-only dashboard
- Mobile-first — desktop-first, responsive is nice-to-have

## Context

**Tech stack:** Next.js 16, Tailwind CSS 4, shadcn/ui (base-ui), Recharts, Framer Motion, TanStack Query, React Flow (@xyflow/react), Vitest

**Infrastructure:**
- Local agents: 22 discovered from ~/github/knowledge/agent-configs/
- Remote agents: Sophia (Tailscale), Maria (Tailscale), Lucia (localhost:3001), Alba/Hermes (localhost:18793), Gwen (CF tunnel)
- Production server: npm start --port 3002 → Cloudflare tunnel → kitchen.epiloguecapital.com
- Obsidian vault = ~/github/knowledge/ (518 markdown files, the actual knowledge base)

**Knowledge system gaps found (Opus analysis 2026-04-09):**
- mem0 (Qdrant): agents don't preload on session start — cold start every time
- GitNexus: no cron for re-indexing — goes stale after commits
- LLM Wiki: scaffolded but empty — 2 raw files never processed, not in QMD
- Obsidian/QMD: connected but llm-wiki not indexed
- mem0 → QMD bridge: doesn't exist — two parallel memory systems with no sync

## Constraints

- **Tech:** Next.js 16 with base-ui (NOT Radix) — shadcn/ui components have different APIs than standard docs
- **Deployment:** Production is `npm start` not `npm run dev` — dev server breaks Cloudflare (HMR WebSockets)
- **Security:** No `execSync`/`exec` — use `execFileSync` only (security hook enforces this)
- **Model:** Use Sonnet for implementation, Opus for architecture/analysis only

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| React Flow over custom SVG | Drag, zoom, minimap built-in; better extensibility | ✓ Good |
| Config-driven agent registry | Others can clone and customize without code changes | ✓ Good |
| Production build via `npm start` | Dev server breaks CF tunnel due to HMR WebSockets | ✓ Good |
| suppressHydrationWarning on body | Grammarly extension injects attrs before React hydrates | ✓ Good |
| Local agents from filesystem | No API needed — heartbeat files are ground truth | ✓ Good |
| Obsidian vault IS the knowledge base | ~/github/knowledge/ is both Obsidian vault and QMD source | ✓ Good |

## Current Milestone: v1.1 Knowledge Architecture + Dashboard Polish

**Goal:** Connect isolated knowledge systems into a unified loop and polish the Flow dashboard.

**Target features:**
- Knowledge Curator agent (nightly automation)
- Obsidian in dashboard Library view
- mem0 session-start preload
- llm-wiki indexed by QMD
- gitnexus cron automation
- React Flow node polish and layout improvements
- Activity feed improvements

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
*Last updated: 2026-04-09 — Milestone v1.1 started*
