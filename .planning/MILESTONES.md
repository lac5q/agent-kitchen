# Milestones

## v6.6 Cloud Offload + Local Footprint Reduction (Backlog)

**Phases:** 108 | **Plans:** 1

**Scope:**

1. **Cloud Offload + Local Footprint Reduction (Phase 108)** — Inventory permanent local stores versus rebuildable caches, migrate eligible persistence and heavy indexing to managed/cloud services, cap local cache/log growth, and preserve privacy, encryption, rollback, and offline-degraded operation.

---

## v6.5 Agent Context Bus + Synchronous Agent Communication (Completed 2026-06-04)

**Phases:** 107 | **Plans:** 1

**Scope:**

1. **Agent Context Bus and Synchronous Agent Communication (Phase 107)** — Add a durable MemRoOS-native inbox/reply bus for agents, REST and MCP access, bounded wait-for-reply support, optional memory-save/context-sync receipts, fail-closed control-layer data-access enforcement, and denial of self-declared user/OAuth claims with agent auth/scanner/audit regression coverage.

---

## v6.4 SkillForge Production SkillOpt Hardening (Partially Implemented)

**Phases:** 106 | **Plans:** 1 complete, 1 remaining

**Scope:**

1. **SkillForge Production SkillOpt Hardening (Phase 106)** — Replace heuristic/stub SkillForge eval behavior with real behavioral W scoring, converge proposal generation into one production path, add schema-level split/baseline/edit traceability, represent proposed skill edits as typed bounded operations, and expose accepted/rejected proposal evidence in audit/UI surfaces.

---

## v6.2 Skill Distribution + Knowledge Gateway (Next)

**Phases:** 98–102 | **Plans:** TBD

**Scope:**

1. **Skill Distribution Core (Phase 98)** — Implement `skill_catalog` + `skill_read` in `skill-packs` workspace; private `~/.memroos/skills/` merging; `auto-load` frontmatter convention.
2. **Private Config Layer (Phase 99)** — `context-sources.local.json` overlay merge; generic `meet-recordings` slot with `${MEETINGS_INGEST_COMMAND}` hook.
3. **Circleback Ingestion (Phase 100)** — Private ingest script + env wiring + nightly LaunchAgent for meeting transcript sync.
4. **Memroos Troubleshooter Skill (Phase 101)** — `memroos-troubleshooter` skill with `auto-load: true`; `deep-research-subagents` frontmatter updated.
5. **Public Documentation (Phase 102)** — `docs/skills.md`, `docs/integrations/meet-recordings.md`, `example-skill` template.

---

## v2.5 Eval Engine + Self-Improvement Platform (Shipped: 2026-05-17)

**Phases completed:** 6 phases, 7 plans, 0 tasks

**Key accomplishments:**

- 3-layer composite eval signal (`W`) with scorer registry, pinned judge, drift guard, persistence, and UI/config surface.
- SEAL reflection/proposal/apply/rollback loop with deterministic modeled post-apply re-scoring and explicit audit metadata.
- Memory and agent autogen proposal families registered on the shared SEAL substrate, with fixed-harness policy labs and trajectory scoring.
- Minimal viable golden sets populated and verified against the real judge, making the drift guard meaningful at the Tier 1 bar.
- L3 business outcome layer, public eval API, and TypeScript/Python SDKs established as the external product surface.
- Behavioral W-lift for instruction/skill proposals intentionally deferred to v3 rather than overclaimed.

**Known deferred items at close:** 2 context-question buckets acknowledged in `STATE.md`.

---

## v2.1 Security + Trust Layer (Next)

**Phases:** 42-45 | **Plans:** TBD

**Scope:**

1. **Agent Shield + Iris Pre-flight Foundation (Phase 42)** — Shipped in `4d03fae`: scan notes, `iris-scanner.ts`, Dispatch/A2A pre-flight rules, audit-compatible blocking, and tests.
2. **Tool Permission Guard + Policy Enforcement (Phase 43)** — Implemented locally: shared policy helper, dispatch/A2A/memory tier checks, policy_denied audit rows, and tests.
3. **Security Operations UI + Reports (Phase 44)** — Security event history, blocked-attempt drilldowns, scan health, severity trends, and release reports.
4. **Progressive Security Capability Exposure (Phase 45)** — Expose `capability:agent-shield`/Iris status and strict/standard/permissive security mode through progressive discovery and registry surfaces.

---

## v2.2 LLM Optimization + Evaluation (Backlog)

**Phases:** 46-49 | **Plans:** TBD

**Scope:**

1. **Model Routing Telemetry Substrate (Phase 46)** — Track task type, model, cost, latency, quality score, success rate, and context tags.
2. **Model Recommendation API + Knowledge Workspace (Phase 47)** — Agents query model recommendations before model choice and append outcomes after task completion.
3. **Evaluation Rigs + Quality Scoring (Phase 48)** — Task-class eval sets, rubrics, regression checks, and model comparisons.
4. **Optimization Dashboard + Reports (Phase 49)** — Best model by task class, cost/quality tradeoffs, drift, and recommendation explainability.

---

## v2.3 Agent Runtime Enhancements (Backlog)

**Phases:** 50-52 | **Plans:** TBD

**Scope:**

1. **Agent-Side Middleware (Phase 50)** — Pre/post-call hooks for validation, redaction, outcome logging, and skill health alerts.
2. **Agent Memory Client v2 (Phase 51)** — Semantic search, relevance-scored context injection, compression, TTL, and backward compatibility.
3. **Agent Observability Dashboard (Phase 52)** — Offline session timelines, tool events, decision points, token usage, error rates, and health scores.

---

## v2.4 Performance + Caching (Backlog)

**Phases:** 53-54 | **Plans:** TBD

**Scope:**

1. **Response Caching Layer (Phase 53)** — Multi-tier LRU cache for API routes, MCP queries, memory lookups, Neo4j graph queries, and A2A task status.
2. **Query Performance + Cold Start Elimination (Phase 54)** — Pre-warm caches on startup, SQLite/Neo4j query optimization, performance budgets, and CI regression detection.

---

## v1.7 Progressive Tool Gateway Runtime (Shipped: 2026-05-04)

**Phases completed:** 22 phases, 36 plans, 19 tasks

**Key accomplishments:**

- One-liner:
- One-liner:
- Path:
- 1. [Rule 1 - Bug] failureCount/topErrorType declared after nodeStats useCallback
- One-liner:
- One-liner:
- One-liner:
- One-liner:
- Status
- better-sqlite3 DB layer with WAL mode, FTS5 external-content table (messages_fts), incremental ingest tracking table (ingest_meta), and meta key-value table — all initialized via singleton getDb()
- FTS5-backed JSONL ingestion engine with incremental mtime+size skip logic, phrase-match recall query, and three API routes: GET /api/recall, POST /api/recall/ingest, GET /api/recall/stats
- SqliteHealthPanel component with 4 KPI cards (Conversations, DB Size, Last Ingest, Last Recall) and Run Ingest button wired into the Ledger page, backed by useRecallStats hook querying /api/recall/stats
- One-liner:
- One-liner:
- 1. [Rule 1 - Bug] Module-scope PAPERCLIP_BASE_URL captured before test env set
- One-liner:
- One-liner:
- One-liner:
- One-liner:
- One-liner:
- One-liner:
- useAuditLog hook
- One-liner:
- One-liner:

---

## v1.7 Progressive Tool Gateway Runtime (In Progress)

**Phases:** 29-32 | **Plans:** 2/5 complete

**Completed so far:**

1. **Top-Level Tool Gateway MCP Tools (Phase 29)** — Knowledge MCP now exposes direct `tool_catalog`, `tool_discover`, `tool_load`, `tool_record_outcome`, and `tool_stats` tools, while preserving the v1.6 workspace gateway.
2. **Outcome-Aware Tool Selection (Phase 30 Plan 01)** — Tool Attention summarizes recent outcomes by capability and uses outcome scores to influence discovery ranking without returning private task text.

**Remaining:**

1. **Memory-Aware Tool Selection (Phase 30 Plan 02)** — Add similar-task memory signals on top of outcome ranking.
2. **Memroos Tool Gateway Operations UI (Phase 31)** — Turn the UI from catalog visibility into an operations console.
3. **Gateway Hardening and Lint Cleanup (Phase 32)** — Make full lint enforceable and add CI coverage for the top-level gateway tools.

---

## v1.6 Monorepo + Progressive MCP Tool Attention (Shipped: 2026-04-30)

**Phases:** 26–28 | **Plans:** 3 | **3/3 phases complete**

**Key accomplishments:**

1. **Monorepo Foundation (Phase 26)** — Memroos moved to `apps/memroos`, services moved/imported under `services/`, root scripts delegate to the app, and root-aware runtime paths preserve SQLite/config behavior.
2. **Progressive MCP Tool Attention (Phase 27)** — Knowledge MCP imported with progressive workspaces, tool-attention workspace actions, curated catalog, outcome logging, Memroos API, Cookbooks panel, and Flow Tool Gateway node.
3. **CI + Deploy Hardening (Phase 28)** — Production build and LaunchAgent deployment verified, live health/tool-attention endpoints checked, and monorepo CI added for Memroos and Python service validation.

**Requirements satisfied:** 16/16 (all checkboxes marked [x])
**Verification:** Memroos tests, Knowledge MCP tests, Python compile smoke, shell syntax checks, production build, and live endpoint checks all passed.
**Known deferred items:** Existing Library freshness work remains in project active backlog for a later milestone.

---

## v1.5 Agent Coordination + Voice (Shipped: 2026-04-20)

**Phases:** 19–25 | **Plans:** 15 | **7/7 phases complete**

**Key accomplishments:**

1. **SQLite Conversation Store (Phase 19)** — better-sqlite3 with FTS5, WAL mode, JSONL ingestion engine, recall/ingest/stats API routes, SqliteHealthPanel on Library page
2. **Hive Mind Coordination (Phase 20)** — Cross-agent action log + task delegation with recovery, /api/hive GET+POST, HiveFeed component with 5-second polling on Memroos Floor
3. **Paperclip Fleet Node (Phase 21)** — Collapsible group-paperclip in Flow diagram, PaperclipFleetPanel with per-agent status/autonomy badges, dispatch form and recovery operations
4. **Voice Server (Phase 22)** — Pipecat Python service (port 7860) with Gemini Live + STT/TTS cascade, transcript persistence to SQLite, VoicePanel on Flow page
5. **Memory Intelligence (Phase 23)** — LLM consolidation engine (claude-haiku-4-5), 4-tier salience decay (pinned/high/mid/low), useMemoryStats + useAgentPeers hooks, MemoryIntelligencePanel and AgentPeersPanel on dashboard
6. **Security + Audit (Phase 24)** — 18-pattern content scanner with severity-tiered blocking, SQLite audit_log table, AuditLogPanel on Memroos Floor
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
