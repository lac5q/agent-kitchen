# Project: Agent Kitchen

*Last updated: 2026-04-30 — v1.6 Monorepo + Progressive MCP Tool Attention shipped*

---

## Current Milestone: v1.6 Monorepo + Progressive MCP Tool Attention

**Goal:** Make `agent-kitchen` the canonical monorepo, import the local memory and Knowledge MCP services, add progressive MCP/tool-attention discovery, and harden deployment/CI around the new layout.

---

## Current State: v1.6 Shipped

v1.6 complete — 3 phases (26-28), 3 plans, monorepo migration shipped, progressive MCP tool attention live, production deployment verified, monorepo CI added.

---

## Previous State: v1.5 Shipped

v1.5 complete — 7 phases (19-25), 15 plans, 55/55 requirements satisfied. Shared SQLite backbone, cross-agent hive mind coordination, Paperclip fleet node, Pipecat voice server, LLM consolidation engine, 4-tier salience decay, security scanner + audit log, usage analytics dashboard.

---

## What This Is

A Next.js dashboard (port 3002, Cloudflare tunnel at `kitchen.example.com`) that makes every agent, knowledge system, and skill visible, connected, and self-improving. It surfaces live agent health, bidirectional knowledge sync, skill contribution analytics, and collapsible flow diagrams in a single UI.

## Core Value

Every agent and knowledge system is visible, connected, and self-improving.

---

## Requirements

### Validated

- ✓ Canonical monorepo layout with Kitchen in `apps/kitchen` and services in `services/` — v1.6 (MONO-01/02)
- ✓ Root script delegation and root-aware runtime paths — v1.6 (MONO-03/04/05)
- ✓ Memory and Knowledge MCP configured from root `.mcp.json` — v1.6 (MCP-01/02)
- ✓ Progressive Knowledge MCP workspace surface — v1.6 (MCP-03)
- ✓ Tool Attention catalog/discover/load/outcome/stats actions — v1.6 (TOOL-01/02)
- ✓ Tool Attention API, Cookbooks panel, Flow node, and node detail stats — v1.6 (UI-01/02/03/04)
- ✓ Monorepo production build, LaunchAgent deploy, and CI hardening — v1.6 (OPS-01/02/03)
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
- ✓ Dedicated Cookbooks page in sidebar navigation — v1.4 (COOK-01)
- ✓ Skill gaps/health panel on Cookbooks page — v1.4 (COOK-02)
- ✓ 30-day heatmap on Cookbooks page — v1.4 (COOK-03)
- ✓ Full skills list on Cookbooks page — v1.4 (COOK-04)
- ✓ SQLite FTS5 conversation store with recall/ingest/stats API — v1.5 (SQLDB-01/02/03)
- ✓ SqliteHealthPanel on Library page — v1.5 (SQLDB-04, DASH-01)
- ✓ Hive mind coordination (action log + task delegation + recovery) — v1.5 (HIVE-01/02/03)
- ✓ HiveFeed live polling component on Kitchen Floor — v1.5 (HIVE-04, DASH-02)
- ✓ Paperclip fleet node in Flow + fleet panel — v1.5 (PAPER-01/02/03/04, HIVE-05)
- ✓ Pipecat voice server (Gemini Live + STT/TTS cascade) — v1.5 (VOICE-01/02/03)
- ✓ Voice transcripts written to SQLite — v1.5 (VOICE-04)
- ✓ VoicePanel on Flow page with scrollable transcript — v1.5 (VOICE-05, DASH-04)
- ✓ Memory consolidation engine + LLM pattern extraction — v1.5 (MEM-01)
- ✓ 4-tier salience decay with access-resistance — v1.5 (MEM-02)
- ✓ MemoryIntelligencePanel on Library page — v1.5 (MEM-03)
- ✓ AgentPeersPanel on Kitchen Floor + /api/agent-peers — v1.5 (MEM-04)
- ✓ 18-pattern content scanner with severity blocking — v1.5 (SEC-01)
- ✓ SQLite audit_log table + AuditLogPanel — v1.5 (SEC-02/03, DASH-03)
- ✓ Usage analytics (6 metrics, 3 windows) on Ledger/Library/Cookbooks — v1.5 (ANA-01/02/03/04)

### Active

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
- GitNexus embeddings partial (285/473) — crash bug upstream
- Library freshness indicator reflects file mtime, not QMD index recency
- Turbopack NFT warning traces `/api/apo` through `next.config.ts` during production build

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
| better-sqlite3 singleton with WAL mode | ✓ Single shared DB for all tables | v1.5 |
| SqliteHealthPanel + MemoryIntelligencePanel on Library | ✓ User confirmed panels live on Library, not Ledger | v1.5 |
| Voice server as standalone Python Pipecat service | ✓ Separate port (7860), Next.js proxy via /api/voice-status | v1.5 |
| LLM consolidation on 15m schedule via instrumentation.ts | ✓ Scheduler bootstrap pattern established | v1.5 |
| 4-tier salience decay with LOG() access-resistance | ✓ Formula: rate/(1+LOG(1+access_count)) | v1.5 |
| 18 content scanner patterns with severity tiers | ✓ HIGH blocks, MEDIUM flags, length guard at 4096 | v1.5 |
| TimeSeriesChart as pure presentational component | ✓ No hook calls inside, powered by useTimeSeries | v1.5 |
| Keep private Knowledge Hub content outside the monorepo | ✓ Only service/runtime code imported | v1.6 |
| Tool Attention as progressive discovery layer | ✓ No blanket runtime dependency on mcp-agent | v1.6 |
| Monorepo CI validates Kitchen and Python service surfaces | ✓ Added CI workflow | v1.6 |

---

## Constraints

- No `execSync`/`exec` — use `execFileSync` or `fs/promises` only
- No recursive `readdir` on Obsidian vault (518+ files, catastrophic inode load)
- Obsidian heartbeat: stat 3-5 known paths only
- Production server: `npm start` on port 3002 — never `npm run dev`
- mem0 collection `agent_memory`: read-only from app — writes via mem0 HTTP API only
