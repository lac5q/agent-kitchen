# Project: Agent Kitchen

*Last updated: 2026-04-15 — v1.4 started*

---

## Current Milestone: v1.4 Cookbooks

**Goal:** Give skills a first-class home in the sidebar with health, heatmap, and full skill list.

**Target features:**
- "The Cookbooks" sidebar nav entry at `/cookbooks`
- Gaps/health panel (coverage gaps count, failures by agent + error type)
- 30-day contribution heatmap
- Full skills list (all skills, gaps highlighted)

---

## What This Is

A Next.js dashboard (port 3002, Cloudflare tunnel at `kitchen.example.com`) that makes every agent, knowledge system, and skill visible, connected, and self-improving. It surfaces live agent health, bidirectional knowledge sync, skill contribution analytics, and collapsible flow diagrams in a single UI.

## Core Value

Every agent and knowledge system is visible, connected, and self-improving.

---

## Requirements

### Validated

- ✓ Knowledge base collections browsable with doc counts and freshness — v1.1
- ✓ Live agent heartbeat visible in Flow diagram — v1.2
- ✓ Bidirectional Obsidian ↔ mem0 knowledge sync — v1.2
- ✓ Skill management dashboard surfaced in Flow — v1.2
- ✓ Gwen self-improving loop (skill pruning + curation) — v1.2
- ✓ Projects/ subdirectory ingested to mem0 nightly — v1.3 (KNOW-08/09)
- ✓ Skill coverage gaps (30-day-dark skills) visible — v1.3 (SKILL-07)
- ✓ Skill failure rate by agent/error-type — v1.3 (SKILL-06)
- ✓ 30-day skill heatmap in NodeDetailPanel — v1.3 (SKILL-08)
- ✓ Per-node activity panel (last 10 events, AbortController) — v1.3 (FLOW-13)
- ✓ Collapsible agent group nodes in Flow — v1.3 (FLOW-12)

### Active

- [ ] Dedicated Cookbooks page in sidebar navigation — v1.4 (COOK-01)
- [ ] Skill gaps/health panel on Cookbooks page — v1.4 (COOK-02)
- [ ] 30-day heatmap on Cookbooks page — v1.4 (COOK-03)
- [ ] Full skills list on Cookbooks page — v1.4 (COOK-04)
- [ ] Update flow trigger button (kick off `qmd update` from UI)
- [ ] Library freshness: force-touch or show "last indexed" timestamp vs file mtime

### Out of Scope

- Mobile app — web-first, desktop dashboard
- Multi-user auth — single-user local tool
- GitNexus embeddings — blocked by node-llama-cpp macOS arm64 bug (abhigyanpatwari/GitNexus#824)

---

## Context

**Tech stack:** Next.js (App Router), React Flow, TypeScript, Tailwind, Vitest  
**Codebase:** ~7,700 LOC TypeScript/TSX across `src/`  
**Production:** Port 3002, `npm start`, LaunchAgent auto-start, Cloudflare tunnel  
**Known debt:**
- 5 pre-existing Vitest failures (smoke.test.tsx SummaryBar + .worktrees collection-card)
- GitNexus embeddings partial (285/473) — crash bug upstream
- Library freshness indicator reflects file mtime, not QMD index recency

---

## Key Decisions

| Decision | Outcome | Version |
|----------|---------|---------|
| QMD for BM25 only — Qdrant Cloud for vector/semantic | ✓ Clean separation | v1.3 |
| Skills in Flow canvas (Cookbooks node) not sidebar page | ✓ Shipped, but user expects sidebar page too | v1.2 |
| mem0 writes via HTTP only — never direct Qdrant | ✓ Maintained | v1.3 |
| `collapse-logic.ts` as pure module (no React) | ✓ 24 tests, easy to reason about | v1.3 |
| Group children use `parentId` + `extent:'parent'` | ✓ React Flow native pattern | v1.3 |
| AbortController in NodeDetailPanel for cleanup | ✓ Prevents stale-fetch race | v1.3 |
| Triple-dedup for mem0 ingestion (hash+mtime+origin) | ✓ Zero duplicates confirmed | v1.3 |

---

## Constraints

- No `execSync`/`exec` — use `execFileSync` or `fs/promises` only
- No recursive `readdir` on Obsidian vault (518+ files, catastrophic inode load)
- Obsidian heartbeat: stat 3-5 known paths only
- Production server: `npm start` on port 3002 — never `npm run dev`
- mem0 collection `agent_memory`: read-only from app — writes via mem0 HTTP API only
