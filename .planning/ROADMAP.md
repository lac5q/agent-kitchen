# Roadmap: Agent Kitchen

## Milestones

- ✅ **v1.1 Knowledge Architecture + Dashboard Polish** — Phases 1-5 (shipped 2026-04-11)
- ✅ **v1.2 Live Data + Knowledge Sync** — Phases 6-11 (shipped 2026-04-12)
- ✅ **v1.3 Advanced Observability + Knowledge Depth** — Phases 12-17 (shipped 2026-04-15)
- ✅ **v1.4 Cookbooks** — Phase 18 (shipped 2026-04-15)
- 🚧 **v1.5 Agent Coordination + Voice** — Phases 19-24 (in progress)

## Phases

<details>
<summary>✅ v1.1 Knowledge Architecture + Dashboard Polish (Phases 1-5) — SHIPPED 2026-04-11</summary>

- [x] Phase 1: Knowledge Foundations (1/1 plans) — completed 2026-04-09
- [x] Phase 2: Knowledge Curator Agent (2/2 plans) — completed 2026-04-10
- [x] Phase 3: Agent Awareness (1/1 plans) — completed 2026-04-10
- [x] Phase 4: Flow Diagram Upgrade (3/3 plans) — completed 2026-04-10
- [x] Phase 5: Personal Knowledge Ingestion Pipeline (5/5 plans) — completed 2026-04-11

Full archive: `.planning/milestones/v1.1-ROADMAP.md`

</details>

<details>
<summary>✅ v1.2 Live Data + Knowledge Sync (Phases 6-11) — SHIPPED 2026-04-12</summary>

- [x] Phase 6: Library Config Fixes (1/1 plans) — completed 2026-04-12
- [x] Phase 7: Live Heartbeat (1/1 plans) — completed 2026-04-12
- [x] Phase 8: Bidirectional Knowledge Sync (1/1 plans) — completed 2026-04-13
- [x] Phase 9: Skill Management Dashboard (2/2 plans) — completed 2026-04-13
- [x] Phase 10: Flow Diagram UX (1/1 plans) — completed 2026-04-12
- [x] Phase 11: Gwen Self-Improving Loop (1/1 plans) — completed 2026-04-12

Full archive: `.planning/milestones/v1.2-ROADMAP.md`

</details>

<details>
<summary>✅ v1.3 Advanced Observability + Knowledge Depth (Phases 12-17) — SHIPPED 2026-04-15</summary>

- [x] Phase 12: Projects Knowledge Ingestion (1/1 plans) — completed 2026-04-14
- [x] Phase 13: Skill Coverage Gaps (1/1 plans) — completed 2026-04-14
- [x] Phase 14: Skill Failure Rate (2/2 plans) — completed 2026-04-14
- [x] Phase 15: Skill Heatmap (1/1 plans) — completed 2026-04-14
- [x] Phase 16: Per-Node Activity Panel (1/1 plans) — completed 2026-04-14
- [x] Phase 17: Collapsible Node Groups (2/2 plans) — completed 2026-04-15

Full archive: `.planning/milestones/v1.3-ROADMAP.md`

</details>

<details>
<summary>✅ v1.4 Cookbooks (Phase 18) — SHIPPED 2026-04-15</summary>

- [x] Phase 18: Cookbooks Page (1/1 plans) — completed 2026-04-15

Full archive: `.planning/milestones/v1.4-ROADMAP.md`

</details>

### 🚧 v1.5 Agent Coordination + Voice (In Progress)

**Milestone Goal:** Give every agent a shared SQLite memory backbone and cross-server coordination layer, bring Paperclip into the hive as a contributing fleet node, and add a voice interface.

- [ ] **Phase 19: SQLite Conversation Store** - Shared SQLite backbone with FTS5 index; all JSONL sessions ingested; health panel visible in Ledger
- [x] **Phase 20: Hive Mind Coordination** - Agents log and query cross-agent actions; task delegation with recovery; live hive feed in dashboard (completed 2026-04-17)
- [x] **Phase 21: Paperclip Fleet Node** - Paperclip as collapsible group in Flow; work assignment from dashboard; fleet panel with autonomy modes and step recovery (completed 2026-04-18)
- [ ] **Phase 22: Voice Server** - Pipecat Python service with Gemini Live + cascade fallback; transcripts written to SQLite; voice log in dashboard
- [ ] **Phase 23: Memory Intelligence** - Background consolidation engine; 4-tier salience decay; consolidation stats in dashboard
- [ ] **Phase 24: Security + Audit** - Exfiltration guard with 15+ regex patterns; SQLite audit log; last 20 entries visible in dashboard

## Phase Details

### Phase 19: SQLite Conversation Store
**Goal**: Every agent can retrieve conversation context by keyword, and the dashboard shows the health of the shared SQLite store
**Depends on**: Phase 18
**Requirements**: SQLDB-01, SQLDB-02, SQLDB-03, SQLDB-04, DASH-01
**Success Criteria** (what must be TRUE):
  1. Agent can call `/api/recall?q=keyword` and receive ranked results from all ingested JSONL sessions
  2. All Claude Code JSONL sessions in `~/.claude/projects/` are ingested with FTS5 index on content, timestamp, project, and agent_id
  3. DB path is declared once in project config and all consumers (agents, dashboard, voice) reference the same file
  4. Ledger panel shows row count, DB size, last ingest timestamp, and last recall query
**Plans:** 3 plans
Plans:
- [ ] 19-01-PLAN.md — Install better-sqlite3, configure Next.js, create DB singleton and schema
- [ ] 19-02-PLAN.md — JSONL ingestion engine and recall/ingest/stats API routes
- [ ] 19-03-PLAN.md — SqliteHealthPanel component wired into Ledger page
**UI hint**: yes

### Phase 20: Hive Mind Coordination
**Goal**: Agents can log, query, and delegate tasks through a shared coordination table; the dashboard shows a live cross-agent action feed
**Depends on**: Phase 19
**Requirements**: HIVE-01, HIVE-02, HIVE-03, HIVE-04, HIVE-05, DASH-02
**Success Criteria** (what must be TRUE):
  1. Agent can write a hive mind action (agent_id, CodeMachine action_type, summary, artifacts) to the shared table
  2. Agent can call `/api/hive?agent=X&q=keyword` and receive filtered hive history
  3. Agent can delegate a task with priority and status tracking; interrupted tasks resume from last checkpoint
  4. Dashboard hive feed shows last N cross-agent actions in real time with agent, action_type, summary, and timestamp
  5. Paperclip contributions appear in the hive feed under `agent_id="paperclip"` alongside all other agents
**Plans:** 2/2 plans complete
Plans:
- [x] 20-01-PLAN.md — Schema DDL (hive_actions + hive_delegations + FTS5), busy_timeout pragma, /api/hive route with tests
- [x] 20-02-PLAN.md — useHiveFeed() hook, HiveFeed component, wired into Kitchen Floor page
**UI hint**: yes

### Phase 21: Paperclip Fleet Node
**Goal**: Paperclip appears as a collapsible group in the Flow diagram, accepts work assignments from the dashboard, and its agents show autonomy modes and step-level recovery
**Depends on**: Phase 20
**Requirements**: PAPER-01, PAPER-02, PAPER-03, PAPER-04, DASH-03
**Success Criteria** (what must be TRUE):
  1. Paperclip renders as a collapsible group node in Flow using the Phase 17 parentId pattern; collapsed state shows fleet health summary
  2. Work can be dispatched to the Paperclip fleet from the dashboard; fleet distributes internally
  3. Expanded fleet panel shows each agent's autonomy mode (Interactive / Autonomous / Continuous / Hybrid) and active task
  4. Long-running fleet operations record completed steps with session IDs so work survives interruption and can resume
**Plans:** 2/2 plans complete
Plans:
- [x] 21-01-PLAN.md — Paperclip adapter route, fleet types, dispatch/recovery, client hook
- [x] 21-02-PLAN.md — Flow group node, fleet detail panel, dashboard dispatch UI
**UI hint**: yes

### Phase 22: Voice Server
**Goal**: A Pipecat Python voice service is running; users can speak to any active agent via Gemini Live or cascade fallback; all transcripts are searchable in SQLite
**Depends on**: Phase 19
**Requirements**: VOICE-01, VOICE-02, VOICE-03, VOICE-04, VOICE-05, DASH-04
**Success Criteria** (what must be TRUE):
  1. Pipecat service starts on a dedicated port and connects to the dashboard via WebSocket
  2. Gemini Live mode routes speech-to-speech input to the active agent with low latency
  3. Cascade mode (Groq Whisper STT → Cartesia TTS with defined fallback chain) handles the non-Gemini path
  4. Every voice session transcript is written to the SQLite conversation store and retrievable via `/api/recall`
  5. Dashboard voice panel shows active/inactive status, last session duration, and a scrollable transcript log
**Plans:** 2 plans
Plans:
- [ ] 22-01-PLAN.md — Python voice server scaffold, pipelines, transcript persistence, /api/voice-status proxy
- [ ] 22-02-PLAN.md — VoicePanel component, voice hooks, recall agent_id filter, wired into Flow page
**UI hint**: yes

### Phase 23: Memory Intelligence
**Goal**: A background engine consolidates raw memories into patterns, applies salience decay on schedule, and the dashboard shows consolidation health
**Depends on**: Phase 19
**Requirements**: MEM-01, MEM-02, MEM-03
**Success Criteria** (what must be TRUE):
  1. Background consolidation engine runs on schedule, batches unconsolidated memories, and writes LLM-extracted meta-insights back to SQLite
  2. Salience decay runs on schedule with 4-tier rates (pinned=0%, high=1%, mid=2%, low=5%/day); frequently accessed memories accumulate access-resistance
  3. Dashboard shows consolidation last-run timestamp, pending unconsolidated count, and per-tier decay stats
**Plans**: TBD
**UI hint**: yes

### Phase 24: Security + Audit
**Goal**: All outbound agent content is scanned before reaching any channel; every significant action is logged to SQLite; the dashboard exposes the audit trail
**Depends on**: Phase 20
**Requirements**: SEC-01, SEC-02, SEC-03
**Success Criteria** (what must be TRUE):
  1. 15+ regex patterns scan all outbound content before it reaches the dashboard or external channels; matched content is blocked and the event is flagged
  2. Every significant agent action is written to the SQLite audit log with actor, action, target, and timestamp
  3. Dashboard shows the last 20 audit log entries
**Plans**: TBD
**UI hint**: yes

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Knowledge Foundations | v1.1 | 1/1 | Complete | 2026-04-09 |
| 2. Knowledge Curator Agent | v1.1 | 2/2 | Complete | 2026-04-10 |
| 3. Agent Awareness | v1.1 | 1/1 | Complete | 2026-04-10 |
| 4. Flow Diagram Upgrade | v1.1 | 3/3 | Complete | 2026-04-10 |
| 5. Personal Knowledge Ingestion | v1.1 | 5/5 | Complete | 2026-04-11 |
| 6. Library Config Fixes | v1.2 | 1/1 | Complete | 2026-04-12 |
| 7. Live Heartbeat | v1.2 | 1/1 | Complete | 2026-04-12 |
| 8. Bidirectional Knowledge Sync | v1.2 | 1/1 | Complete | 2026-04-13 |
| 9. Skill Management Dashboard | v1.2 | 2/2 | Complete | 2026-04-13 |
| 10. Flow Diagram UX | v1.2 | 1/1 | Complete | 2026-04-12 |
| 11. Gwen Self-Improving Loop | v1.2 | 1/1 | Complete | 2026-04-12 |
| 12. Projects Knowledge Ingestion | v1.3 | 1/1 | Complete | 2026-04-14 |
| 13. Skill Coverage Gaps | v1.3 | 1/1 | Complete | 2026-04-14 |
| 14. Skill Failure Rate | v1.3 | 2/2 | Complete | 2026-04-14 |
| 15. Skill Heatmap | v1.3 | 1/1 | Complete | 2026-04-14 |
| 16. Per-Node Activity Panel | v1.3 | 1/1 | Complete | 2026-04-14 |
| 17. Collapsible Node Groups | v1.3 | 2/2 | Complete | 2026-04-15 |
| 18. Cookbooks Page | v1.4 | 1/1 | Complete | 2026-04-15 |
| 19. SQLite Conversation Store | v1.5 | 0/3 | Planning | - |
| 20. Hive Mind Coordination | v1.5 | 2/2 | Complete   | 2026-04-17 |
| 21. Paperclip Fleet Node | v1.5 | 2/2 | Complete   | 2026-04-18 |
| 22. Voice Server | v1.5 | 0/2 | Planning | - |
| 23. Memory Intelligence | v1.5 | 0/? | Not started | - |
| 24. Security + Audit | v1.5 | 0/? | Not started | - |
