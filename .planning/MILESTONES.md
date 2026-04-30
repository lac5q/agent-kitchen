# Milestones

## v1.6 Monorepo + Progressive MCP Tool Attention (Shipped: 2026-04-30)

**Phases:** 26–28 | **Plans:** 3 | **3/3 phases complete**

**Key accomplishments:**

1. **Monorepo Foundation (Phase 26)** — Kitchen moved to `apps/kitchen`, services moved/imported under `services/`, root scripts delegate to the app, and root-aware runtime paths preserve SQLite/config behavior.
2. **Progressive MCP Tool Attention (Phase 27)** — Knowledge MCP imported with progressive workspaces, tool-attention workspace actions, curated catalog, outcome logging, Kitchen API, Cookbooks panel, and Flow Tool Gateway node.
3. **CI + Deploy Hardening (Phase 28)** — Production build and LaunchAgent deployment verified, live health/tool-attention endpoints checked, and monorepo CI added for Kitchen and Python service validation.

**Requirements satisfied:** 16/16 (all checkboxes marked [x])
**Verification:** Kitchen tests, Knowledge MCP tests, Python compile smoke, shell syntax checks, production build, and live endpoint checks all passed.
**Known deferred items:** Existing Library freshness work remains in project active backlog for a later milestone.

---

## v1.5 Agent Coordination + Voice (Shipped: 2026-04-20)

**Phases:** 19–25 | **Plans:** 15 | **7/7 phases complete**

**Key accomplishments:**

1. **SQLite Conversation Store (Phase 19)** — better-sqlite3 with FTS5, WAL mode, JSONL ingestion engine, recall/ingest/stats API routes, SqliteHealthPanel on Library page
2. **Hive Mind Coordination (Phase 20)** — Cross-agent action log + task delegation with recovery, /api/hive GET+POST, HiveFeed component with 5-second polling on Kitchen Floor
3. **Paperclip Fleet Node (Phase 21)** — Collapsible group-paperclip in Flow diagram, PaperclipFleetPanel with per-agent status/autonomy badges, dispatch form and recovery operations
4. **Voice Server (Phase 22)** — Pipecat Python service (port 7860) with Gemini Live + STT/TTS cascade, transcript persistence to SQLite, VoicePanel on Flow page
5. **Memory Intelligence (Phase 23)** — LLM consolidation engine (claude-haiku-4-5), 4-tier salience decay (pinned/high/mid/low), useMemoryStats + useAgentPeers hooks, MemoryIntelligencePanel and AgentPeersPanel on dashboard
6. **Security + Audit (Phase 24)** — 18-pattern content scanner with severity-tiered blocking, SQLite audit_log table, AuditLogPanel on Kitchen Floor
7. **Usage Analytics (Phase 25)** — SQLite recall_log table, /api/time-series for 6 metrics x 3 windows, shared TimeSeriesChart component wired into Ledger/Library/Cookbooks pages

**Requirements satisfied:** 55/55 (all checkboxes marked [x])
**Verification:** 3 open gaps resolved (Phase 12 live run, Phase 19/23 UI panels confirmed in browser)
**Known deferred items:** None

---

## v1.4 Cookbooks (Shipped: 2026-04-15)

**Phases:** 12–17 | **Plans:** 8 | **Commits:** 46 | **+6,553 lines** across 38 files | **2 days (Apr 13–15)**

**Key accomplishments:**

1. **Projects Knowledge Ingestion (Phase 12)** — Nightly mem0 ingestion of Obsidian `projects/` with SHA-256 + mtime watermark + origin-tag triple-dedup; `agent_id=shared` with per-project metadata
2. **Skill Coverage Gaps (Phase 13)** — `/api/skills` `coverageGaps` cross-references `skill_usage` dict vs skill directory to surface 30-day-dark skills; live count on Cookbooks Flow node
3. **Skill Failure Rate (Phase 14)** — Stateful `failures.log` parser with `failuresByAgent` + `failuresByErrorType`; `disk_critical` excluded; graceful empty-state handling
4. **Skill Heatmap (Phase 15)** — 30-day CSS grid heatmap with `React.memo` cells, cell-local hover state, `contributionHistory` aggregate; rendered in NodeDetailPanel Skills node
5. **Per-Node Activity Panel (Phase 16)** — Keyword-map fan-out + `AbortController` cleanup + sparse-data indicator; closes FLOW-13 with 17 new tests
6. **Collapsible Node Groups (Phase 17)** — Pure `collapse-logic.ts` (3 fns, 24 tests) + `GroupBoxNode`; parentId coordinate migration for all group children; collapse/expand with aggregate health color

---
