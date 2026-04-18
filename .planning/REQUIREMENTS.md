# Requirements: Agent Kitchen v1.5 — Agent Coordination + Voice

*Last updated: 2026-04-16*

---

## Active Requirements

### SQLite Conversation Store (SQLDB)

- [ ] **SQLDB-01**: Agent can retrieve raw conversation context by keyword via `/api/recall?q=...` (FTS5 search across all ingested sessions)
- [ ] **SQLDB-02**: All Claude Code JSONL sessions are ingested into SQLite with FTS5 index on content, timestamp, project, and agent_id
- [ ] **SQLDB-03**: SQLite DB path is declared in project config and accessible as a single shared file to all agents and the dashboard
- [ ] **SQLDB-04**: Dashboard displays SQLite store health — row count, last ingest timestamp, DB size

### Hive Mind Coordination (HIVE)

- [ ] **HIVE-01**: Agent can log a significant action to the shared hive mind table (agent_id, action_type using CodeMachine vocabulary: continue/loop/checkpoint/trigger/stop/error, summary, artifacts JSON)
- [ ] **HIVE-02**: Agent can query hive mind history for any agent via `/api/hive?agent=...&q=...`
- [ ] **HIVE-03**: Agent can delegate a task to another agent with priority, status tracking, and step-level recovery on interruption
- [ ] **HIVE-04**: Dashboard shows live hive mind activity feed — last N actions across all agents, real-time
- [ ] **HIVE-05**: Paperclip fleet participates as a first-class hive mind member — reads and writes shared store as `agent_id="paperclip"`; contributions visible alongside all other agents

### Paperclip Fleet Node (PAPER)

- [x] **PAPER-01**: Paperclip appears as a collapsible group node in Flow diagram (Phase 17 parentId pattern); collapsed shows fleet health summary, expanded shows individual agent status
- [x] **PAPER-02**: Work can be assigned to Paperclip at fleet level from the dashboard; fleet dispatches internally
- [x] **PAPER-03**: Each Paperclip agent has a declared autonomy mode (Interactive / Autonomous / Continuous / Hybrid) visible in the expanded fleet panel
- [x] **PAPER-04**: Long-running fleet operations track completed steps with session IDs for recovery after interruption

### Voice Server (VOICE)

- [ ] **VOICE-01**: Pipecat Python service runs on a dedicated port with WebSocket transport to the dashboard
- [ ] **VOICE-02**: Gemini Live mode available — speech-to-speech, low latency, routed to active agent
- [ ] **VOICE-03**: Legacy cascade mode available — Groq Whisper STT → Cartesia TTS; whisper-cpp fallback for STT, ElevenLabs → Gradium → Kokoro → macOS `say` fallback for TTS
- [ ] **VOICE-04**: All voice session transcripts written to SQLite conversation store (searchable via SQLDB-01)
- [ ] **VOICE-05**: Dashboard shows active voice session status and scrollable transcript log

### Memory Intelligence (MEM)

- [ ] **MEM-01**: Background consolidation engine batches unconsolidated memories, extracts patterns and contradictions via LLM, writes meta-insights back to SQLite
- [ ] **MEM-02**: 4-tier salience decay runs on schedule — pinned=0%/day, high=1%/day, mid=2%/day, low=5%/day; frequently accessed memories resist decay
- [ ] **MEM-03**: Dashboard shows consolidation last-run timestamp, pending unconsolidated count, and decay stats

### Security (SEC)

- [ ] **SEC-01**: All outbound content is scanned by 15+ regex patterns before reaching dashboard or external channels; matched content is blocked and flagged
- [ ] **SEC-02**: All significant agent actions are written to an audit log table in SQLite (actor, action, target, timestamp)
- [ ] **SEC-03**: Dashboard shows last 20 audit log entries

### Dashboard Tracking (DASH)

- [ ] **DASH-01**: SQLite health panel visible in Ledger — row count, DB size, last ingest time, last recall query
- [ ] **DASH-02**: Hive mind activity feed component — real-time cross-agent action log with agent, action_type, summary, and timestamp
- [x] **DASH-03**: Paperclip fleet panel in Flow node detail — per-agent status, autonomy mode, active task, last heartbeat
- [ ] **DASH-04**: Voice session log in dashboard — active/inactive indicator, last session duration, scrollable transcript

---

## Future Requirements (deferred from v1.5)

- LLM-powered relevance scoring for recall results (post-v1.5)
- Memory export/import between agent instances
- Cross-project recall (query sessions from other projects, not just current)
- Voice meeting bot integration (Pika/Recall.ai video avatars) — ClaudeClaw PP7

---

## Out of Scope

- `.bit` structured task format (zaius-labs) — interesting but adds Rust/WASM complexity with no clear advantage over SQLite FTS5 for this use case; backlog
- Multi-user auth — single-user local tool
- Mobile app — web-first dashboard
- GitNexus embeddings — blocked by upstream node-llama-cpp macOS arm64 bug

---

## Traceability

*Filled in by roadmapper — 2026-04-16*

| REQ-ID | Phase | Status |
|--------|-------|--------|
| SQLDB-01 | Phase 19 | Pending |
| SQLDB-02 | Phase 19 | Pending |
| SQLDB-03 | Phase 19 | Pending |
| SQLDB-04 | Phase 19 | Pending |
| HIVE-01 | Phase 20 | Pending |
| HIVE-02 | Phase 20 | Pending |
| HIVE-03 | Phase 20 | Pending |
| HIVE-04 | Phase 20 | Pending |
| HIVE-05 | Phase 20 | Pending |
| PAPER-01 | Phase 21 | Complete |
| PAPER-02 | Phase 21 | Complete |
| PAPER-03 | Phase 21 | Complete |
| PAPER-04 | Phase 21 | Complete |
| VOICE-01 | Phase 22 | Pending |
| VOICE-02 | Phase 22 | Pending |
| VOICE-03 | Phase 22 | Pending |
| VOICE-04 | Phase 22 | Pending |
| VOICE-05 | Phase 22 | Pending |
| MEM-01 | Phase 23 | Pending |
| MEM-02 | Phase 23 | Pending |
| MEM-03 | Phase 23 | Pending |
| SEC-01 | Phase 24 | Pending |
| SEC-02 | Phase 24 | Pending |
| SEC-03 | Phase 24 | Pending |
| DASH-01 | Phase 19 | Pending |
| DASH-02 | Phase 20 | Pending |
| DASH-03 | Phase 21 | Complete |
| DASH-04 | Phase 22 | Pending |
