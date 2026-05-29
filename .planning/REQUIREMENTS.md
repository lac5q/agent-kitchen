# Requirements: Memroos v5.0 — Memory Trust + Operational Intelligence

*Created: 2026-05-17 | Updated: 2026-05-23 — v5.0 requirements added*

---

## v5.0 Requirements

### Memory Security Foundation

- [x] **MEMSEC-01**: Raw agentic conversations and imported context are stored in an append-only raw evidence vault (`~/.memroos/vault/<tenant>/`), not primarily as large plaintext SQLite rows. The vault supports compressed per-session or per-day artifacts, content hashes, replay metadata, retention policy, tenant/project/source metadata, classification labels, and encryption key ids. Verified Phase 74.
- [x] **MEMSEC-02**: Security labels are represented as independent dimensions across `visibility`, `domain`, `sensitivity`, and `policy`, with at least `private/internal/public_safe/public_approved`, `legal/finance/hr/client/personal/engineering`, `pii/secret/credential/privileged/contract/payment/health`, and `indexable/agent_visible/requires_redaction/requires_human_review/sealed` support. Verified Phase 74.
- [x] **MEMSEC-03**: Ingestion and classification are fail-closed: raw meetings, emails, DMs, browser history, files, finance, legal, HR, personal, and client sources default to private; deterministic detectors run before constrained LLM adjudication; uncertain, conflicting, public-promotion, legal, finance, HR, credential, payment, privileged, and sealed cases route to human review. Verified Phase 75.
- [x] **MEMSEC-04**: Retrieval and use authorization is enforced before every memory search, multi-search, context-pack assembly, ChatGPT action, export, summarization, agent dispatch, FTS/vector/graph index write, and derived evidence bundle. The policy decision checks actor identity, role, capability, tenant/project, purpose, source freshness, and security labels, then returns allow, deny, redact, or review-required. Verified Phase 76.
- [x] **MEMSEC-05**: Derived indexes are classification-aware. FTS, semantic embeddings, Qdrant/vector memory, Neo4j/graph facts, qmd projections, and evidence bundles only receive content where `indexable=true`; restricted content remains unindexed or uses an approved redacted projection with provenance back to the raw artifact. Verified Phase 77.
- [x] **MEMSEC-06**: Multimodal storage starts with text-first embeddings from transcripts, OCR, captions, and normalized text chunks; original binary media stays in the raw vault. Every embedding stores artifact id, source span, modality, model name/version, dimension, label version, and creation timestamp, and embeddings inherit the source security label unless explicitly redacted and approved. Verified Phase 77.
- [x] **MEMSEC-07**: Sensitive raw artifacts and sensitive JSON/detail fields use app-level envelope encryption with key id metadata, rotation path, and backup/restore verification. OS or volume encryption is required for deployment profiles, while SQLCipher or whole-DB page encryption remains an evaluated defense-in-depth option rather than the primary MVP leak-prevention boundary. Verified Phase 77.
- [x] **MEMSEC-08**: Security regression tests prove restricted memory cannot leak through recall, multi-search, context packs, ChatGPT Actions, exports, summaries, agent dispatch, audit search, or derived indexes. Negative fixtures must cover legal, finance, HR, credential, payment, privileged, personal, confidential, and public-promotion cases. Verified Phase 78.
- [x] **CTX-FOLLOWUP-03**: Privacy classification policy spike: design a governed classifier cascade for meetings, emails, DMs, files, and imported context that defaults raw data to private, separates visibility/domain/sensitivity/policy labels, runs deterministic PII/secret/legal/finance/source-metadata gates before constrained LLM adjudication, requires evidence spans and abstention for uncertain labels, eval-gates public promotion against golden sets, and routes legal/finance/credential/public conflicts to human review. Verified Phase 75.

### Context Source Reliability + Sink Health

- [x] **CTX-FOLLOWUP-01**: Context-source contract coverage extends beyond the Phase 69 starter set: every configured source family used by operators (including Drive, Slack, Gmail/Spark, local folders, qmd, mem0, and future connectors) declares ingest, index, freshness, safe-answer, and repair behavior with no silent unindexed lanes. Verified Phase 80 via declarative cron/source health registry baseline.
- [x] **CTX-FOLLOWUP-02**: Runtime health reports memory degradation paths, not just service reachability: queued writes, retry backlog, stale semantic recall, replay verification, and source-to-QMD indexing proof must be visible to operators and evals. Verified Phase 80 via caught-up/warning cron health and NOC contract surfacing.
- [x] **CRON-HEALTH-01**: Recurring cron jobs ("sinks") that perform data ingestion, memory writes, or external API polling must expose a health status endpoint or heartbeat that the MemroOS dashboard can consume. Verified Phase 80.
- [x] **CRON-HEALTH-02**: The schedules and routines console must surface per-job last-run timestamp, success/failure status, items processed, and any warnings or caught-up status. Verified Phase 80 API contract.
- [x] **CRON-HEALTH-03**: Jobs that are not caught up must emit a warning-level health signal that appears in the NOC and/or operator notification surface. Verified Phase 80 and `/api/operations/noc`.
- [x] **CRON-HEALTH-04**: Operators must be able to pause, resume, or stop individual cron jobs from the dashboard without restarting the entire MemroOS runtime. Verified Phase 80 API mutation.
- [x] **CRON-HEALTH-05**: Job definitions must be declarative (stored in a config or registry) so that the health monitoring surface knows what jobs *should* exist and can detect missing or orphaned schedules. Verified Phase 80.
- [x] **UX-FOLLOWUP-03**: Schedules and routines console exposes recurring jobs, cron health, standing delegations, maintenance routines, and approval-required automations. Verified Phase 80 backend contract; UI polish remains future enhancement.

### Operations NOC Real-Data

- [x] **NOC-01**: Operations NOC must not render hardcoded sample values for any panel. Production `components/operations/*` panels must consume live data through a unified `/api/operations/noc` contract or existing React Query hooks; mock constants may only remain in tests, development fixtures, or explicitly labeled demos. Verified Phase 79.
- [x] **NOC-02**: Operations NOC data contract exposes per-panel provenance: `source`, `lastUpdated`, `window`, `status=live|empty|degraded|missing`, and `warnings`; missing/degraded telemetry must render honestly instead of fabricated metrics. Verified Phase 79.
- [x] **NOC-03**: Pulse strip derives tasks completed, active dispatches, memory reads, spend today, savings vs baseline, and wasted work from live `agents`, `hive`, `activity`, `tokens`, `memory`, and `model-routing` sources, with missing-source callouts where telemetry does not exist. Verified Phase 79 with existing hooks plus `/api/operations/noc` provenance.
- [x] **NOC-04**: Memory consumption and "memory not digested" panels derive from memory consolidation, memory tier health, recall stats/evals, and per-memory access telemetry; if per-memory access telemetry is absent, add it before claiming high-salience memories are unused. Verified Phase 79 with explicit missing telemetry state.
- [x] **NOC-05**: Agent workload panel derives agent names, status, current task, heartbeat, dispatch activity, HIL waits, and failure/retry signals from the canonical registry, local runtime detection, hive actions, orchestration/HIL state, and Paperclip fleet data. Verified Phase 79.
- [x] **NOC-06**: Model utility panel derives model rows from real model usage and model-routing telemetry, including task count, cost, latency, quality score, success rate, and best-fit recommendation. Verified Phase 79.
- [x] **NOC-07**: Skills lifecycle and behavior signals derive from the skills API, contribution history, coverage telemetry status, failure logs, review state, SEAL proposals, model-routing drift, memory evals, and security/audit events; inferred signals must cite source evidence and avoid presenting speculative recommendations as facts. Verified Phase 79 and skill suggestions audit.
- [x] **NOC-08**: Governance strip derives preflight blocks, HIL approvals, tool denials, audit lines, escalations, and recent governance events from live audit, orchestration, security, and escalation APIs. Verified Phase 79.
- [x] **NOC-09**: Engagement console on the NOC home screen uses the canonical agent registry and real chat/dispatch APIs; sending a directive must create a real dispatch/chat action or return a visible error, never a canned interaction. Verified Phase 79 by keeping chat owned by `/dispatch`.
- [x] **NOC-10**: Efficiency signals require new telemetry before being shown as live: retrieval calls before useful work, same-source re-read count, raw-context ingest token share, operator re-ask redundancy, and rediscovered-fact rate. Until those streams exist, the efficiency section must render a missing-telemetry checklist, not sample numbers. Verified Phase 79.
- [x] **NOC-11**: Verification proves the NOC is real-data backed: tests fail if production Operations components import `noc-mock-data`; seeded API tests assert metrics match fixture DB/log inputs; Playwright verifies live, empty, and degraded states; authenticated local/public smoke checks confirm `/` renders live NOC data after deployment. Verified Phase 79.
- [x] **NOC-12**: Every NOC control is actionable. Buttons must either navigate to a real owner surface, mutate visible UI state, trigger an implemented API, or render an explicit missing-backend explanation; no inert controls remain on the NOC. Verified Phase 79.
- [x] **NOC-13**: The NOC home does not embed Engage/chat controls. Engagement belongs on `/dispatch` unless a future requirement wires an inline NOC action to the same real dispatch/chat APIs with full error handling. Verified Phase 79.
- [x] **NOC-14**: NOC-level time-window controls propagate to any live-backed panels; sample-backed panels must label the window as preview-only until the unified `/api/operations/noc` contract exists. Verified Phase 79.
- [x] **OPS-AUDIT-01**: Every application page that renders performance, usage, health, outcome, cost, quality, or failure metrics has a date-range/time-window control, a source/provenance state, loading and error states, and an over-time view when the underlying data supports it. Verified Phase 79 MVP.
- [x] **OPS-AUDIT-02**: Ledger, Business Ops, Skills, Agents, Memory, Governance, Improve, Workflow Map, and Dispatch receive a route-by-route audit for mock data, silent zeros, dead controls, slow-loading queries, and missing action explanations. Verified Phase 79 MVP.
- [x] **OPS-AUDIT-03**: Ledger source availability is explicit: RTK/token stats, Claude model logs, model-routing telemetry, and time-series routes must distinguish live, empty, unavailable, and failed states instead of rendering zeros or blank charts without cause. Verified Phase 79 MVP.
- [x] **OPS-AUDIT-04**: Business Ops timeline and adapter status expose the selected date range, adapter mode, event counts, last poll, empty-state reason, and failed-load details for `/api/evals/history` and `/api/l3/events`. Verified Phase 79.

### Harness Control Plane + Evidence Governance

- [x] **HARN-01**: Full Harness Control Plane: every dispatched task exposes a Plan-Execute-Verify timeline showing context assembled, tools exposed, permissions granted, actions taken, verification run, and memory updated. Stored in `task_evidence_bundles` keyed on `a2a_tasks.task_id`. Verified Phase 81 backend substrate.
- [x] **HARN-02**: Universal evidence bundles: every agent output can show sources used, memories consumed, tools/commands run, checks passed, unverified assumptions, residual risks, and replay/rollback artifacts. Bundles are written asynchronously (fire-and-forget) so agent execution is never blocked. Verified Phase 81.
- [x] **HARN-03**: Shared harness state: tasks declare read/write sets, assumptions, version dependencies, verifier obligations, and conflict policy; stale belief/context drift is surfaced before action. Verified Phase 81 bundle fields.

### Auth + Team Hardening

- [x] **AUTH-FOLLOWUP-01**: Team auth hardening adds email invitation delivery, password reset, email change/verification, OAuth/SSO login (Google, GitHub), and login/refresh lockout telemetry. Verified Phase 82 MVP with invite/password-reset/email-verification/auth-event substrate; provider-backed OAuth remains configuration follow-up.
- [x] **AUTH-FOLLOWUP-02**: Role-aware UI gating hides or disables unauthorized nav/actions before click-through while keeping API/page-level 403 enforcement. Verified Phase 82.
- [x] **AUTH-FOLLOWUP-03**: Tenant/admin management includes API-key rotation, tenant settings, user lifecycle management, and migration of legacy audit actor fields to authenticated user identity. Verified Phase 82 MVP with existing API-key/team surfaces plus auth event tables.

---

## Traceability

| Phase | Requirements |
|-------|-------------|
| Phase 74 | MEMSEC-01, MEMSEC-02 |
| Phase 75 | MEMSEC-03, CTX-FOLLOWUP-03 |
| Phase 76 | MEMSEC-04 |
| Phase 77 | MEMSEC-05, MEMSEC-06, MEMSEC-07 |
| Phase 78 | MEMSEC-08 |
| Phase 79 | NOC-01..14, OPS-AUDIT-01..04 |
| Phase 80 | CTX-FOLLOWUP-01, CTX-FOLLOWUP-02, CRON-HEALTH-01..05, UX-FOLLOWUP-03 |
| Phase 81 | HARN-01, HARN-02, HARN-03 |
| Phase 82 | AUTH-FOLLOWUP-01, AUTH-FOLLOWUP-02, AUTH-FOLLOWUP-03 |
| Phase 96 | AGENTMEM-FOLLOWUP-01 |
| Phase 97 | CTX-FOLLOWUP-04 |
| Phase 103 | AGENTMEM-FOLLOWUP-02 |
| Phase 104 | AGENTMEM-FOLLOWUP-03 |
| Phase 105 | AGENTCICD-FOLLOWUP-01 |

---

## v5.1 Requirements (Completed)

### Memory Inventory + Listing Clarity

- [x] **MEMLIST-01**: Memory-facing UI and API copy must use explicit memory categories instead of a single ambiguous "memories" count. At minimum, surfaces distinguish vector memories, ingested messages, consolidated insights, episodic writes, graph facts, and knowledge files, with definitions available near the count.
- [x] **MEMLIST-02**: The Memory surface exposes an inventory summary that counts each memory category from its canonical source of truth: mem0/Qdrant for vector memories, SQLite `messages` for ingested messages, `memory_meta_insights` for consolidated insights, `agent_memory_writes` for explicit episodic writes, Neo4j/graph health for graph facts, and configured qmd/knowledge collections for knowledge files.
- [x] **MEMLIST-03**: Memory listing rows include provenance and state fields needed to explain why an item appears: tier/category, backend, source connector or agent, project/workspace, timestamp, security label snapshot, consolidation state, salience/access metadata when available, and raw evidence/vault pointer when authorized.
- [x] **MEMLIST-04**: Memory search and list filters let operators narrow by category/tier, backend, agent, project/workspace, source, date range, label dimensions, consolidation state, and degraded source status without mixing knowledge files, raw messages, and durable vector facts in one unlabelled result set.
- [x] **MEMLIST-05**: Memory-count and listing verification includes seeded tests and a live operator smoke that prove no hardcoded demo counts remain, all counts cite a source/provenance timestamp, empty/degraded states are honest, and provider failures such as consolidation `429` errors explain why new insights are not appearing.

### Traceability

| Phase | Requirements |
|-------|-------------|
| Phase 83 | MEMLIST-01..05 |

---

## v5.2 Requirements (Completed)

### Competitive Memory Target Architecture

- [x] **MEMTARGET-01**: MemRoOS must carry a reproducible competitive memory target architecture that can be evaluated against public alternatives and verified against the live MemRoOS recall path. The target architecture requires: a public-evidence marketplace benchmark with scored current/target MemRoOS profiles and real alternatives; a documented hard recommendation for the architecture gap; live recall eval hardening for backend-normalized vector IDs, indexable episodic fixtures, deterministic FTS projection, and non-brittle expected-fact retrieval; an npm command that regenerates the marketplace comparison; and a live full-suite recall gate that passes with `passRate=1.0`, no tier failures, and p95 latency below 500ms on the local operator deployment. Verified Phase 84.

### Traceability

| Phase | Requirements |
|-------|-------------|
| Phase 84 | MEMTARGET-01 |

---

## v4.0 Requirements (Completed)

### HIL Enhancements

- [x] **HIL-01**: Operator can modify declared task state fields via a dedicated edit UI before resuming a paused LangGraph thread (70-02 Python endpoint + 70-05 TS route/client/UI complete; live panel parity tracked by `UI-PARITY-02`)
- [x] **HIL-02**: System validates edited field values against `OrchestrationState` schema before accepting the update (70-02 Python validation + 70-05 TS proxy validation complete; live panel parity tracked by `UI-PARITY-02`)
- [x] **HIL-03**: Audit log records who edited a HIL task, which fields changed, and before/after values (70-02 lineage row + 70-05 operator identity proxy complete; live panel parity tracked by `UI-PARITY-02`)
- [x] **HIL-04**: Each HIL interrupt type has a configurable SLA deadline stored as an ISO timestamp
- [x] **HIL-05**: Background scheduler proactively checks for expired HIL tasks every 60s and triggers escalation actions (notify, auto-resolve, or abandon)
- [x] **HIL-06**: Operator can view pending HIL items with countdown timers and SLA traffic-light status in the dashboard (71-04 complete; local DB empty state browser-checked, countdown behavior covered by component tests)

### Orchestration: Multi-Hop Retry + Rollback

- [x] **ORCH-08**: Each hop in a multi-agent chain has a configurable retry budget via LangGraph `RetryPolicy` (70-03 complete; topology closure follow-up tracked by `ORCH-FOLLOWUP-01`)
- [x] **ORCH-09**: Each forward action declares a paired compensating action stored as a declarative row in `orchestration_lineage` (70-03 complete; graph-node/A2A compensation closure tracked by `ORCH-FOLLOWUP-01`)
- [x] **ORCH-10**: A2A task status reflects granular failure state: "failed at hop N, compensated hops 1..N-1" (70-03 complete; graph-node/A2A compensation closure tracked by `ORCH-FOLLOWUP-01`)

### Memory Backend Pluggability

- [x] **MEM-06**: `MemoryAdapter` interface exposes only `search()`, `write()`, and `health()` — no client handle leakage
- [x] **MEM-07**: Adapter registry maps `MemoryTier` to `MemoryAdapter[]`; new backends register without touching existing code
- [x] **MEM-08**: Existing mem0/Qdrant/Neo4j backends wrapped as concrete adapters implementing the interface

### Voice Meeting Bot

- [x] **VOICE-06**: Pipecat meeting bot pipeline joins Daily.co rooms via `DailyTransport` (room URL + token from env/API)
- [x] **VOICE-07**: Real-time transcript per speaker written to `messages` table; meeting highlights surfaced to `hive_actions`
- [x] **VOICE-08**: Meeting URL and join tokens never logged to `audit_log`; recording consent UI shown before joining (71-05 secrets discipline complete; 71-06 consent gate and join UI complete)

### LLM-Powered Recall Scoring

- [x] **RECALL-01**: Recall endpoint supports `mode=semantic|bm25|hybrid`; hybrid merges Ollama `nomic-embed-text` + BM25 via RRF; BM25 remains default; this applies to message recall in `conversations.db` and does not replace qmd BM25 or mem0/Qdrant vector memory (71-01 embedding foundation + 71-02 endpoint modes complete)
- [x] **RECALL-02**: Embeddings precomputed at ingest via background job (50 messages/cycle, 5-min interval); degrades gracefully with `degraded: true` on embedding outage (71-01 store/provider + 71-02 background job complete)

### Cross-Project Recall

- [x] **RECALL-03**: Caller can request cross-project recall by passing `crossProject: true` with explicit `allowed_project_ids`
- [x] **RECALL-04**: Cross-project results ranked by semantic similarity and annotated with source repo; single-project remains default

### True Behavioral W-Lift

- [x] **SEAL-04**: `BehavioralEvalService` implements `EvalServiceLike.rescoreForProposal()` dispatching real agent re-execution via A2A hub
- [x] **SEAL-05**: Behavioral eval uses a sandboxed profile with no-op tool stubs on a held-out 10-20 task sample
- [x] **SEAL-06**: `applyProposal()` returns `job_id` immediately; UI polls for completion; request handler never blocked; completed eval jobs expose evidence bundles with task sample, tools/commands, checks passed, assumptions, residual risks, and replay/rollback handle

### UI: Flow Trigger + Library Freshness

- [x] **UI-05**: Operator can trigger `qmd update` pipeline from the UI with SSE progress streaming
- [x] **UI-06**: Library page shows QMD index recency timestamp vs latest file mtime per collection as context freshness evidence

### Cross-Harness Skills

- [x] **SKILL-01**: `skill_registry` table stores normalized skill definitions imported from Claude/OpenAI/Gemini harnesses (SKILL.md format) with governed contract fields: preconditions, allowed tools, risk tier, verification checks, owner, rollback behavior, and dispatch status
- [x] **SKILL-02**: Operator can import a SKILL.md file and have it normalized and stored in the registry
- [x] **SKILL-03**: A2A dispatcher looks up the skill registry before falling back to per-agent instructions
- [x] **SKILL-04**: Skills UI shows all registered skills, their source harness, dispatch status, and contract completeness

---

## Future Requirements (v4.1+ candidates)

- [ ] **NOC-01**: Operations NOC must not render hardcoded sample values for any panel. Production `components/operations/*` panels must consume live data through a unified `/api/operations/noc` contract or existing React Query hooks; mock constants may only remain in tests, development fixtures, or explicitly labeled demos.
- [ ] **NOC-02**: Operations NOC data contract exposes per-panel provenance: `source`, `lastUpdated`, `window`, `status=live|empty|degraded|missing`, and `warnings`; missing/degraded telemetry must render honestly instead of fabricated metrics.
- [ ] **NOC-03**: Pulse strip derives tasks completed, active dispatches, memory reads, spend today, savings vs baseline, and wasted work from live `agents`, `hive`, `activity`, `tokens`, `memory`, and `model-routing` sources, with missing-source callouts where telemetry does not exist.
- [ ] **NOC-04**: Memory consumption and "memory not digested" panels derive from memory consolidation, memory tier health, recall stats/evals, and per-memory access telemetry; if per-memory access telemetry is absent, add it before claiming high-salience memories are unused.
- [ ] **NOC-05**: Agent workload panel derives agent names, status, current task, heartbeat, dispatch activity, HIL waits, and failure/retry signals from the canonical registry, local runtime detection, hive actions, orchestration/HIL state, and Paperclip fleet data.
- [ ] **NOC-06**: Model utility panel derives model rows from real model usage and model-routing telemetry, including task count, cost, latency, quality score, success rate, and best-fit recommendation.
- [ ] **NOC-07**: Skills lifecycle and behavior signals derive from the skills API, contribution history, coverage telemetry status, failure logs, review state, SEAL proposals, model-routing drift, memory evals, and security/audit events; inferred signals must cite source evidence and avoid presenting speculative recommendations as facts.
- [ ] **NOC-08**: Governance strip derives preflight blocks, HIL approvals, tool denials, audit lines, escalations, and recent governance events from live audit, orchestration, security, and escalation APIs.
- [ ] **NOC-09**: Engagement console on the NOC home screen uses the canonical agent registry and real chat/dispatch APIs; sending a directive must create a real dispatch/chat action or return a visible error, never a canned interaction.
- [ ] **NOC-10**: Efficiency signals require new telemetry before being shown as live: retrieval calls before useful work, same-source re-read count, raw-context ingest token share, operator re-ask redundancy, and rediscovered-fact rate. Until those streams exist, the efficiency section must render a missing-telemetry checklist, not sample numbers.
- [ ] **NOC-11**: Verification proves the NOC is real-data backed: tests fail if production Operations components import `noc-mock-data`; seeded API tests assert metrics match fixture DB/log inputs; Playwright verifies live, empty, and degraded states; authenticated local/public smoke checks confirm `/` renders live NOC data after deployment.
- [ ] **NOC-12**: Every NOC control is actionable. Buttons must either navigate to a real owner surface, mutate visible UI state, trigger an implemented API, or render an explicit missing-backend explanation; no inert controls remain on the NOC.
- [ ] **NOC-13**: The NOC home does not embed Engage/chat controls. Engagement belongs on `/dispatch` unless a future requirement wires an inline NOC action to the same real dispatch/chat APIs with full error handling.
- [ ] **NOC-14**: NOC-level time-window controls propagate to any live-backed panels; sample-backed panels must label the window as preview-only until the unified `/api/operations/noc` contract exists.
- [ ] **OPS-AUDIT-01**: Every application page that renders performance, usage, health, outcome, cost, quality, or failure metrics has a date-range/time-window control, a source/provenance state, loading and error states, and an over-time view when the underlying data supports it.
- [ ] **OPS-AUDIT-02**: Ledger, Business Ops, Skills, Agents, Memory, Governance, Improve, Workflow Map, and Dispatch receive a route-by-route audit for mock data, silent zeros, dead controls, slow-loading queries, and missing action explanations.
- [ ] **OPS-AUDIT-03**: Ledger source availability is explicit: RTK/token stats, Claude model logs, model-routing telemetry, and time-series routes must distinguish live, empty, unavailable, and failed states instead of rendering zeros or blank charts without cause.
- [ ] **OPS-AUDIT-04**: Business Ops timeline and adapter status expose the selected date range, adapter mode, event counts, last poll, empty-state reason, and failed-load details for `/api/evals/history` and `/api/l3/events`.
- [ ] **ORCH-FOLLOWUP-01**: Phase 70 deferred multi-hop topology work is promoted from phase-local debt: add a real `rollback_compensation` LangGraph node, loop through multi-hop chains in graph topology, track per-hop attempts in lineage detail JSON, and dispatch A2A compensation tasks when agents expose `requiredCapability="compensate"`.
- [ ] **ARCH-01**: MemroOS documents and verifies coverage of the agentic AI stack layers: goal, orchestration, agents, tools, memory, monitoring, reliability/failure handling, and governance/security.
- [ ] **ARCH-02**: MemroOS exposes architecture/layer health that reports configured, degraded, and missing capabilities across the agentic stack without requiring operators to infer gaps from scattered panels.
- [ ] **ARCH-03**: Onboarding and setup guide users through the agentic stack layers and their required configuration, not just isolated features.
- [ ] **PRODUCT-01**: Eval Engine product packaging decision: choose whether the 3-layer composite `W` and SEAL self-improvement loop ship only bundled with MemroOS Hub or also as a separately positioned eval/self-improvement product surface.
- [ ] **PRODUCT-02**: Eval Engine commercialization requirements: define pricing axis, trace-ingestion contract, judge-model cost ownership, golden-set marketplace strategy, compliance floor, and competitive framing before expanding the public eval API beyond dogfooding.
- [ ] **VERTICAL-01**: Second vertical candidate backlog: after finance reconciliation has a live customer proof, select healthcare, legal, or ops/logistics as the next adapter + golden-set + UI-terminology vertical without baking vertical logic into the core.
- [ ] **CTX-FOLLOWUP-01**: Context-source contract coverage extends beyond the Phase 69 starter set: every configured source family used by operators (including Drive, Slack, Gmail/Spark, local folders, qmd, mem0, and future connectors) declares ingest, index, freshness, safe-answer, and repair behavior with no silent unindexed lanes.
- [ ] **CTX-FOLLOWUP-02**: Runtime health reports memory degradation paths, not just service reachability: queued writes, retry backlog, stale semantic recall, replay verification, and source-to-QMD indexing proof must be visible to operators and evals.
- [x] **CTX-FOLLOWUP-03**: Privacy classification policy spike: design a governed classifier cascade for meetings, emails, DMs, files, and imported context that defaults raw data to private, separates visibility/domain/sensitivity/policy labels, runs deterministic PII/secret/legal/finance/source-metadata gates before constrained LLM adjudication, requires evidence spans and abstention for uncertain labels, eval-gates public promotion against golden sets, and routes legal/finance/credential/public conflicts to human review. Source note: `.planning/notes/privacy-classification-policy-spike.md`. Verified Phase 75.
- [x] **CTX-FOLLOWUP-04**: Source routing contracts for meeting capture: every captured meeting retains raw source evidence and produces a project-scoped routing decision with deterministic metadata signals, fallback body-text signals, route confidence, conflict state, low-confidence review state, qmd collection freshness proof, and regression anchors for known projects such as Cordant. Operator surfaces must show when a meeting is captured but misfiled, searchable only in global knowledge, missing from a project collection, or not promoted to app-level raw artifacts/memory. Verified Phase 97.
- [x] **MEMSEC-01**: Raw agentic conversations and imported context are stored in an append-only raw evidence vault, not primarily as large plaintext SQLite rows. The vault must support compressed per-session or per-day artifacts, content hashes, replay metadata, retention policy, tenant/project/source metadata, classification labels, and encryption key ids. Source note: `.planning/notes/memory-security-storage-spike.md`. Verified Phase 74.
- [x] **MEMSEC-02**: Security labels are represented as independent dimensions across `visibility`, `domain`, `sensitivity`, and `policy`, with at least `private/internal/public_safe/public_approved`, `legal/finance/hr/client/personal/engineering`, `pii/secret/credential/privileged/contract/payment/health`, and `indexable/agent_visible/requires_redaction/requires_human_review/sealed` support. Verified Phase 74.
- [x] **MEMSEC-03**: Ingestion and classification are fail-closed: raw meetings, emails, DMs, browser history, files, finance, legal, HR, personal, and client sources default to private; deterministic detectors run before constrained LLM adjudication; uncertain, conflicting, public-promotion, legal, finance, HR, credential, payment, privileged, and sealed cases route to human review. Verified Phase 75.
- [x] **MEMSEC-04**: Retrieval and use authorization is enforced before every memory search, multi-search, context-pack assembly, ChatGPT action, export, summarization, agent dispatch, FTS/vector/graph index write, and derived evidence bundle. The policy decision must check actor identity, role, capability, tenant/project, purpose, source freshness, and security labels, then return allow, deny, redact, or review-required. Verified Phase 76.
- [ ] **MEMSEC-05**: Derived indexes are classification-aware. FTS, semantic embeddings, Qdrant/vector memory, Neo4j/graph facts, qmd projections, and evidence bundles must only receive content where `indexable=true`; restricted content must remain unindexed or use an approved redacted projection with provenance back to the raw artifact.
- [ ] **MEMSEC-06**: Multimodal storage starts with text-first embeddings from transcripts, OCR, captions, and normalized text chunks; original binary media stays in the raw vault. Every embedding stores artifact id, source span, modality, model name/version, dimension, label version, and creation timestamp, and embeddings inherit the source security label unless explicitly redacted and approved.
- [ ] **MEMSEC-07**: Sensitive raw artifacts and sensitive JSON/detail fields use app-level envelope encryption with key id metadata, rotation path, and backup/restore verification. OS or volume encryption is required for deployment profiles, while SQLCipher or whole-DB page encryption remains an evaluated defense-in-depth option rather than the primary MVP leak-prevention boundary.
- [ ] **MEMSEC-08**: Security regression tests prove restricted memory cannot leak through recall, multi-search, context packs, ChatGPT Actions, exports, summaries, agent dispatch, audit search, or derived indexes. Negative fixtures must cover legal, finance, HR, credential, payment, privileged, personal, confidential, and public-promotion cases.
- [ ] **INT-FOLLOWUP-01**: MemroOS MCP consolidation removes the legacy standalone mem0-only MCP adapter from agent registration paths and routes all memory tools through the unified `memroos` MCP facade. Scope includes `services/memory/mcp-mem0.py`, `services/memory/mcp-mem0-wrapper.sh`, stale `memory_get_all`/`memory_health` capability references, docs/configs, and verification that `.mcp.json`, `.cursor/mcp.json`, `.gemini/mcp.json`, ChatGPT LaunchAgent, and onboarding scripts expose only the unified MemroOS MCP surface.
- [ ] **INT-FOLLOWUP-02**: FastMCP v3.x migration upgrades `services/knowledge-mcp` from `fastmcp>=2,<3` to `fastmcp>=3,<4`, moves server transport/path/stateless/auth options to the v3-compatible runtime API, preserves stdio and Streamable HTTP `/mcp`, and verifies `fastmcp inspect`, `knowledge_health`, `search`, `fetch`, `memory_search`, `memory_save`, `agent_memory_save`, `tool_catalog`, launchd restart, and ChatGPT connector behavior.
- [ ] **INT-FOLLOWUP-03**: Integration dependency modernization audit keeps a source-backed inventory of older integration surfaces before they drift further. The audit output must include current/local versions, current upstream versions, owner, risk rating, migration notes, rollback path, and live probe matrix, and it must route concrete work to the dedicated follow-ups below instead of treating major upgrades as routine package bumps.
- [ ] **INT-FOLLOWUP-04**: `mem0ai` 2.x migration upgrades the memory service from `mem0ai>=0.1,<1.0` to the current 2.x Python SDK, preserving Qdrant/Neo4j config loading, queued-write retry behavior, `/health`, `/memory/add`, `/memory/search`, `/memory/failures`, and the unified MemroOS MCP `memory_search`/`memory_save` tools. Verification must include a real or fixture-backed `Memory.from_config` add/search smoke, queue retry tests, and rollback instructions to the pinned 0.1.x line.
- [ ] **INT-FOLLOWUP-05**: A2A/ADK current-spec compatibility pass validates MemroOS against the current A2A agent-card and messaging spec before new A2A extensions ship. Scope includes `A2A_VERSION`, canonical `/.well-known/agent-card.json`, legacy `/.well-known/agent.json` compatibility policy, HTTP+JSON and JSON-RPC method names, streaming and unsupported-operation behavior, cancel/subscribe semantics, auth/security metadata, Google ADK fixture interop, and an explicit decision on ADK's non-legacy A2A extension mode.
- [ ] **INT-FOLLOWUP-06**: Runtime patch sweep verifies current minor/patch integration drift for Pipecat/Daily, LangGraph/checkpointer, and Next.js 16.2.x proxy behavior. Pipecat/Daily scope covers stale 1.0-era comments/import assumptions, `DailyTransport` listener smokes, transcript frame handling, and room-token redaction. LangGraph scope covers the 1.2.x patch bump, explicit `langgraph-checkpoint-sqlite` inventory/security floor, `SqliteSaver` checkpoint resume/HIL tests, and retry-policy behavior. Next.js scope covers the `proxy.ts` convention, route matchers, auth/tenant redirects, and absence of stale `middleware` configuration.
- [ ] **INT-FOLLOWUP-07**: Frontend/security toolchain major audit stages `jose` 5-to-6, shadcn CLI 3-to-4, ESLint 9-to-10, and TypeScript 5-to-6 before bumping. The audit must verify Node/runtime compatibility, JWT sign/verify/cookie auth behavior, shadcn registry/dry-run behavior, lint config lookup and custom rule compatibility, TypeScript root/module defaults, `npm run lint`, typecheck, Next build, and representative auth/navigation Playwright smoke tests.
- [ ] **EVAL-FOLLOWUP-01**: Eval engine judge operations include provider-backed judge invocation, judge-model re-baselining, model/prompt/dataset version capture, and cost ownership before customer-facing eval claims are made.
- [ ] **EVAL-API-FOLLOWUP-01**: Public eval API v2 supports production ingestion and notification patterns: external OpenInference traces, OpenTelemetry collector bridge, bulk trace submission, webhook push delivery, and streaming/SSE result delivery.
- [ ] **EVAL-API-FOLLOWUP-02**: Public eval API operations are externalization-ready: Redis or shared rate limiting for multi-instance deployments, tenant API-key UI, usage metering/billing hooks, SDK semantic-version automation, and verified `docs/eval-quickstart.md` before customer exposure.
- [ ] **MEMGEN-FOLLOWUP-01**: Memory autogen proposals must have an explicit phase contract and live-backend validation path: non-fixture evals exercise mem0/graph/vector memory, record deterministic replay evidence, and distinguish modeled W-lift from real behavioral lift.
- [ ] **SEAL-FOLLOWUP-01**: SEAL proposal lifecycle operations include governed auto-apply mode, bulk review, expiry/garbage-collection policy, and tenant isolation for proposal queues.
- [ ] **SEAL-FOLLOWUP-02**: SEAL proposal types become plugin-capable with file-system snapshot/restore for `skill_addition` mutations and a safe runtime proposal-type registry.
- [x] **SKILLOPT-FOLLOWUP-01**: SkillOpt-style automatic skill improvement is evaluated as a governed optimizer spike, not a live self-mutating runtime path. Scope includes a `SkillOptAdapter` worker, `skill_revision`/`skill_version_patch` SEAL proposal type, train/validation/held-out split tracking, accepted/rejected edit evidence, W non-regression gates, operator approval, rollback handles, and safe export of approved skills to runtime projections. Source note: `.planning/notes/skillopt-skill-optimization-spike.md`. Superseded by SKILLFORGE-01..06.

### SkillForge — Governed Skill Optimization (v6.0)

Based on deep research of GBrain's skillify meta-skill, fail-improve loop, dream cycle, and eval architecture; Microsoft SkillOpt's textual learning rate and bounded edit loop; and Memroos's existing eval engine, SEAL governance, and skill registry.

- [x] **SKILLFORGE-01**: SkillForge Foundation — `SkillForgeWorker` cron/event-driven worker that consumes skill telemetry from `skill_registry`, `eval_candidates`, and SEAL evidence bundles; outputs SEAL proposals of type `skill_revision`. Includes intake pipeline with privacy redaction gates, trace normalization, and skill-scope filtering. No direct mutation of active runtime skills. (Phase 85 complete)
- [x] **SKILLFORGE-02**: SkillForge Analysis — Pattern detection engine that identifies skill failure modes (trigger mismatches, resolver routing errors, contract violations, tool misuse) from telemetry logs. Includes a deterministic-first `SkillFailImproveLoop` that logs routing failures, groups by pattern, generates test cases from LLM fallback successes, and proposes deterministic trigger/rule improvements before LLM reflection. (Phase 86 complete)
- [x] **SKILLFORGE-03**: SkillForge Proposal Generation — Bounded SKILL.md edit generation with textual learning rate control. Proposes edits to: triggers (add/remove/refine), contract clauses, phase steps, anti-patterns, and tool declarations. Rejected-edit buffer prevents re-trying failed edits. Edit scope is constrained: cannot mutate security policy, governance policy, AGENTS.md directives, or owner-protection instructions. (Phase 87 complete)
- [x] **SKILLFORGE-04**: SkillForge Evaluation — Train/validation/held-out split tracking for skill proposals. Training set: historical traces and existing golden sets. Validation: deterministic scorer (trigger routing accuracy, contract completeness, resolver reachability). Held-out: behavioral eval via sandboxed agent execution with no-op tool stubs on 10-20 task samples. W delta computed via existing `EvalService.rescoreForProposal()` with modeled + behavioral components. (Phase 88 complete)
- [x] **SKILLFORGE-05**: SkillForge Governance — Operator-visible UI path showing: candidate diff, evidence bundle, W delta, held-out pass/fail, rejected-edit summary, residual risks, and promotion gate. SEAL proposal lifecycle: queued → analyzing → eval-running → gated → pending_approval → approved → applied → exported. Rollback handle preserved for every approved revision. Auto-apply disabled for all skill revisions; operator approval required. (Phase 89 complete)
- [x] **SKILLFORGE-06**: SkillForge Integration — Cross-modal eval integration using Memroos eval engine (3-model, multi-provider scoring on 5 dimensions). Skill maintenance cycle ("SkillCycle") adapted from GBrain's dream cycle: lint → sync → analyze → propose → eval → gate → embed → orphans → purge. Export to Codex/Claude/OpenClaw runtime projections only after SEAL approval. Skill registry updated with revision history, eval receipts, and rollback pointers. (Phase 90 complete)
- [ ] **AGENTGEN-FOLLOWUP-01**: Agent trajectory evaluation adds a trace-capture to human-annotation workflow, configurable `max_trajectory_steps`, and audit events for eval preset changes so W trends remain interpretable.
- [x] **AGENTMEM-FOLLOWUP-01**: AgentMemory-style coding-agent continuity becomes a MemRoOS-native capture and handoff contract, not a separate local memory plane. Scope includes automatic capture from Codex, Claude Code, Hermes/OpenClaw, OpenCode, Gemini/Qwen CLI, and similar coding agents where adapters exist: conversation turns, tool calls, shell commands, file diffs, model/provider route, errors, decisions and decision intent, sources consulted, verification results, and final task state. Raw traces land in the governed evidence vault with redaction, classification labels, retention policy, and replay pointers; durable candidates are promoted into semantic memory, episodic memory, decision-intent records, lessons, skills, and runbooks only through policy gates. MemRoOS must assemble "continue this work" context packs so an operator can switch agents and continue a conversation or coding task without manually reconstructing state. UI/API requirements include per-agent capture status, last sync, failed capture warnings, handoff-pack preview, source provenance, opt-out controls, token caps, and duplicate suppression. Verification requires a cross-agent handoff eval proving Agent A can stop mid-task, Agent B can resume with MemRoOS context, restricted data remains redacted, and the disabled third-party AgentMemory service is not required. Verified Phase 96.
- [x] **AGENTMEM-FOLLOWUP-02**: Checkpoint/resume/handoff must be implemented with minimal execution overhead. Hot-path checkpoints store only compact structured state (run id, owner agent, objective, completed/remaining steps, decisions, artifact refs, verification state, next safe action, rollback notes, and provenance pointers) plus content-addressed references to larger traces/artifacts. Vector indexing, graph updates, qmd refreshes, git commits, summarization, and heavy evidence-bundle generation run asynchronously or on debounced/background workers, never inline with normal agent execution. Checkpoint writes are event-triggered rather than every thought: after major step completion, before/after external side effects, before human approval, before agent transfer, on failure/retry, and before ending incomplete work. The implementation must expose checkpoint write latency, checkpoint size, async queue depth, replay/resume latency, duplicate-work avoided, and failure/degradation status; CI or local evals must enforce explicit p95 write/resume performance budgets and prove checkpointing does not materially slow standard GSD agent runs. Verified Milestone v6.3.
- [x] **AGENTMEM-FOLLOWUP-03**: Memory-trace observability becomes a first-class debugging and eval contract for agent memory. Inspired by MemTrace-style execution graphs, every memory-backed run must be able to reconstruct the causal path from task input to answer through memory operations: source/context pack assembly, retrieval query, retrieved candidates, filters/policy decisions, consolidation/update steps, checkpoint references, prompt inclusion/exclusion, answer citation, and downstream verification result. Failure analysis must distinguish retrieval miss, bad ranking, stale memory, corrupted/incorrect memory, policy redaction, consolidation error, benchmark/annotation error, and model misuse of correct memory. The Memory and Improve surfaces should expose trace graphs or step timelines for failed evals, with root-cause attribution, replay handle, and proposed repair action. Verification requires seeded positive/negative memory tasks, synthetic corrupted-memory cases, omission-vs-commission cases, and a nightly canary that proves MemRoOS can explain whether memory helped, hurt, or was unused. Verified Milestone v6.3.
- [x] **AGENTCICD-FOLLOWUP-01**: Agent CI/CD release gates treat an agent version as an immutable deployable artifact bundling model/provider route, system instructions, skill/tool contracts, runtime config, eval dataset versions, and policy metadata. Promotion across local/dev/test/prod or equivalent profiles must require quality, safety/grounding, governance, and performance gates: task success/accuracy, hallucination/grounding, policy/tool-use compliance, token cost, p95 latency, trace completeness, rollback handle, and human approval where configured. Each promoted agent version must have a distinct identity/version record, environment-specific permissions, OpenTelemetry/evidence traces, and one-step rollback to the prior approved version. This complements checkpoint/resume: checkpoints protect in-flight work; CI/CD gates protect what agent versions are allowed to run. Verified Milestone v6.3.
- [ ] **L3-FOLLOWUP-01**: Business outcome layer adds live Salesforce, Zendesk, and NetSuite adapters with real OAuth/SOAP/API setup rather than fixtures.
- [ ] **L3-FOLLOWUP-02**: Business outcome ingestion supports inbound webhooks and automated correlation-ID injection or setup verification for external systems, not only polling/manual configuration.
- [ ] **L3-FOLLOWUP-03**: Business outcome scoring validates against production tenant data with per-company golden sets, W-threshold alerts, and configurable SLA/TTR targets instead of observed-only signals.
- [ ] **AUTH-FOLLOWUP-01**: Team auth hardening adds email invitation delivery, password reset, email change/verification, OAuth/SSO login, and login/refresh lockout telemetry.
- [ ] **AUTH-FOLLOWUP-02**: Role-aware UI gating hides or disables unauthorized nav/actions before click-through while keeping API/page-level 403 enforcement.
- [ ] **AUTH-FOLLOWUP-03**: Tenant/admin management includes API-key rotation, tenant settings, user lifecycle management, and migration of legacy audit actor fields to authenticated user identity.
- [ ] **AUDIT-FOLLOWUP-01**: Audit compliance hardening adds tamper-evident hash chaining plus retention and archival policies configurable by admins.
- [ ] **AUDIT-FOLLOWUP-02**: HIL/escalation operations add email/webhook or Slack notifications, bulk resolution, and SLA escalation UX beyond the queue-only view.
- [ ] **AUDIT-FOLLOWUP-03**: Audit access expands to full-text search over reason/metadata and tenant-scoped audit-log access through the public/customer API boundary.
- [ ] **UX-FOLLOWUP-01**: ClaudeClaw-inspired Chat tab provides a dedicated command/chat workspace for CLIs, Paperclip project agents, runtime subagents, and MemroOS system identities separate from Flow.
- [ ] **UX-FOLLOWUP-02**: Memory search surface unifies SQLite recall, mem0/vector memory, Neo4j graph memory, qmd/knowledge files, and filters for agent, project, source, date, and memory tier.
- [ ] **UX-FOLLOWUP-03**: Schedules and routines console exposes recurring jobs, cron health, standing delegations, maintenance routines, and approval-required automations.
- [ ] **UX-FOLLOWUP-04**: Hivemind Obsidian view provides graph/canvas exploration of agents, memories, tasks, proposals, skills, backlinks, and relationships.
- [ ] **UX-FOLLOWUP-05**: Paperclip design-system completion migrates drawers, sheets, modals, detail panels, empty states, and error states off the older dark dashboard shell.
- [ ] **UX-FOLLOWUP-06**: Flow canvas redesign migrates React Flow topology, minimap, controls, node cards, edge styling, group boxes, and node detail panels into the Paperclip-style system while preserving graph readability.
- [ ] **UX-FOLLOWUP-07**: Services navigation surface adds a first-class Services page or dropdown from the app shell that lists MemRoOS service dependencies, degraded services, install mode, cloud/local ownership, health links, and direct owner actions without crowding the primary sidebar.
- [ ] **INSTALL-FOLLOWUP-01**: Optional Docker installation mechanism remains available for public users and local repo testing without becoming the default operator path. Scope includes a slim default compose profile, explicit demo/full-stack compose profile, no required local Qdrant, no persisted demo volumes unless the demo profile is selected, setup flags for cloud-first/no-Docker operation, smoke tests for the Docker option, and documentation that Luis's production/local operator setup should prefer cloud services plus launchd/native Next.js.
- [ ] **GSD-FOLLOWUP-01**: Milestone close requires every phase-local deferred item, open context question, scope trim, and retro-documented gap to be either closed as intentionally shipped, promoted to a requirement ID, or marked explicitly out of scope with rationale.
- [x] **UI-PARITY-01**: Correct phase and requirement status claims so `REQUIREMENTS.md`, `ROADMAP.md`, `STATE.md`, plan summaries, and actual operator-visible behavior agree (Phase 73 completed; v4.0 now closes through Phase 73 with NOC live-data debt still tracked as NOC-01..11).
- [x] **UI-PARITY-02**: Wire the Phase 70 HIL edit-and-continue UI into the live orchestration approval panel so an operator can edit, validate, audit, and resume a real paused HIL task from the visible app surface (Phase 73 mounts `HilEditPanel` in `OrchestrationHilPanel`).
- [x] **UI-PARITY-03**: Complete Phase 71 wave-2 operator surfaces and contracts: semantic/hybrid recall endpoint plus embedding job, HIL SLA countdown/traffic-light dashboard, and recording-consent gate plus meeting join UI.
- [x] **UI-PARITY-04**: Reconcile the Operations NOC with product truth: replace mock panels with live data where available, or clearly render missing/degraded telemetry states until the NOC real-data requirements are implemented (Phase 73 changes NOC header to telemetry-preview/live-wiring-pending and efficiency signals to a missing-telemetry checklist).
- [x] **UI-PARITY-05**: Add a GSD phase-close gate requiring every completed phase to declare its operator representation: visible UI, visible status/provenance in an existing UI, API/backend-only with explicit label, or promoted follow-up UI requirement (Phase 73 adds `validatePhaseUiRepresentation()` and updates `.planning/GOAL.md`).
- [ ] Recall.ai bridge for Zoom/Teams/Meet meeting bot (Daily-only in v4.0)
- [ ] Full 50+ task behavioral W-lift golden set (held-out sample in v4.0)
- [ ] Voyage AI `voyage-4-large` embedding upgrade (Ollama local in v4.0, env-flag swap)
- [ ] Multi-participant meeting bot (listener-only in v4.0)
- [ ] Cross-harness skill auto-sync from agent directories (manual import in v4.0)
- [ ] Full Harness Control Plane: every dispatched task exposes a Plan-Execute-Verify timeline with plan contract, permission tier, tool actions, verification checks, and memory updates (Phase 72 covers the first evidence-bundle slice for eval/skill work)
- [ ] Universal evidence bundles: every agent output can show sources used, memories consumed, tools/commands run, checks passed, unverified assumptions, residual risks, and replay/rollback artifacts (Phase 72 covers SEAL/UI/skill evidence first)
- [ ] Shared harness state: tasks declare read/write sets, assumptions, version dependencies, verifier obligations, and conflict policy; stale belief/context drift is surfaced before action
- [ ] Skill-contract evidence examples: promoted skills attach worked examples and regression cases to the governed contract fields introduced in Phase 72
- [ ] Evolution Agent: telemetry-driven harness improvements are proposed, evaluated against held-out regression tasks, and require approval before changing permissions, validators, routing, or workflow topology
- [ ] Knowledge graph intelligence: repo/docs/PDF/image/transcript graphs expose confidence-tagged edges, god nodes, surprising connections, query/path/explain flows, wiki/report exports, and freshness hooks
- [ ] PR/workflow graph risk: graph communities and dependency paths identify merge-order conflicts, impacted concepts, stale graph regions, and coordination risk before dispatch or review
- [ ] Stacked agent work units: large agent tasks can be split into ordered, dependent, independently reviewable slices with stack-aware verification, promotion gates, and rollback invalidation when an earlier slice fails
- [ ] Model gateway observability: LiteLLM can be configured as the first optional `ModelGatewayAdapter` while direct-provider fallback remains available; every LLM call records provider/model route, prompt/template version, cache hit/miss, fallback path, token/cost budget, latency, and denial reason in the task evidence bundle
- [ ] Secret-scope health: runtime health checks flag agent secrets that are not project scoped, not loaded from an approved secret manager path, or risk persistence in plain `.env`/audit artifacts
- [ ] Eval-pinned promotion commits: passing eval runs capture model version, prompt/harness version, pass rate, dataset seed, and commit/release pointer for incident rollback
- [ ] Agent lessons ledger: repo-level lessons are captured from weird behavior, edge cases, config changes, incidents, and promoted skills, then surfaced in context packs and graph freshness checks
- [ ] Third-party eval adapter: Inspect-style safety eval packs can plug into the existing eval engine for deception, tool misuse, manipulation, and policy-boundary checks

---

## Out of Scope

- Zoom/Teams native transport without bridge (platform anti-bot measures; Daily.co is the supported path)
- Recursive readdir for cross-project recall (performance constraint; explicit path config only)
- Redis/Celery/Temporal for retry/rollback (stdlib + LangGraph `RetryPolicy` sufficient)
- node-llama-cpp local inference (macOS arm64 crash bug, GitHub upstream unfixed)

---

## Traceability

| Phase | Requirements |
|-------|-------------|
| Phase 70 | HIL-01..03, ORCH-08..10, MEM-06..08 |
| Phase 71 | RECALL-01..02, HIL-04..06, VOICE-06..08 |
| Phase 72 | RECALL-03..04, SEAL-04..06, UI-05..06, SKILL-01..04 |
| Phase 73 | UI-PARITY-01..05 |

## v6.2 — Skill Distribution + Knowledge Gateway Requirements

### Skill Distribution (SKDIST)

- [x] **SKDIST-01**: `knowledge_workspace_call("skill-packs", "catalog")` must return a list of all skills from `knowledge/skills/` and `~/.memroos/skills/` (private, merged), each with: name, description, category, tags, auto-load flag. Optional `filter: "auto-load"` to return only auto-load skills.
- [x] **SKDIST-02**: `knowledge_workspace_call("skill-packs", "read", {"name": "<skill>"})` must return the full SKILL.md content for the named skill, searching both public and private skill directories.
- [x] **SKDIST-03**: Skills must support an `auto-load: true` frontmatter field. Only skills tagged `auto-load: true` are returned when `filter: "auto-load"` is passed to skill_catalog. Default is `false`.
- [x] **SKDIST-04**: Agent bootstrap convention documented in `AGENTS.md` standard: at session start, call `skill_catalog(filter: "auto-load")` and inline any returned skills. All other skills are loaded on-demand via `skill_read` when the agent determines they are needed.

### Private Config Layer (PRIVCONF)

- [x] **PRIVCONF-01**: `mcp_server.py` must load `~/.memroos/context-sources.local.json` if it exists and deep-merge it over the repo's `context-sources.config.json`. Private file is gitignored; repo file ships generic stubs. (Phase 99 complete)
- [x] **PRIVCONF-02**: `context-sources.config.json` must include a disabled `meet-recordings` source entry with `ingestCommand: "${MEETINGS_INGEST_COMMAND}"` — provider-agnostic, wired by the operator's private env. (Phase 99 complete)
- [x] **PRIVCONF-03**: `skill_catalog` must merge `~/.memroos/skills/` (private) with `knowledge/skills/` (public). Private skills are returned in catalog but not committed to the repo.

### Circleback Ingestion (CIRCLEBACK)

- [x] **CIRCLEBACK-01**: A private ingest script at `~/.memroos/integrations/circleback-ingest.sh` exports transcripts via `circleback meetings list --json`, transforms to Markdown, and writes to `data/context/meet-recordings/` with consistent filename convention (date-slug.md). (Phase 100 complete)
- [x] **CIRCLEBACK-02**: `MEETINGS_INGEST_COMMAND` is set in `~/.memroos/memroos-runtime.env` pointing to the circleback ingest script. (Phase 100 complete)
- [x] **CIRCLEBACK-03**: A LaunchAgent (`com.memroos.circleback-sync.plist`) runs the ingest script nightly and triggers a qmd re-index of the meet-recordings collection. (Phase 100 complete)

### Public Documentation (PUBDOC)

- [x] **PUBDOC-01**: `docs/integrations/meet-recordings.md` — provider-agnostic meeting integration guide; Circleback used as the reference implementation; shows how any provider with a CLI/API follows the same pattern. (Phase 102 complete)
- [x] **PUBDOC-02**: `docs/skills.md` — skill authoring guide covering: SKILL.md frontmatter schema, where skills live (public vs private), how agents discover and load skills, `auto-load` guidance (≤3 per deployment). (Phase 102 complete)
- [x] **PUBDOC-03**: `knowledge/skills/example-skill/SKILL.md` — copy-paste template with all frontmatter fields and section stubs. (Phase 102 complete)

### Memroos Troubleshooter Skill (MSKILL)

- [x] **MSKILL-01**: `knowledge/skills/memroos-troubleshooter/SKILL.md` — comprehensive skill covering: memroos architecture overview, workspace list + what each does, common errors with fixes, collection health commands, skill distribution flow, and escalation paths. Tagged `auto-load: true`. (Phase 101 complete)
- [x] **MSKILL-02**: `knowledge/skills/deep-research-subagents/SKILL.md` frontmatter updated: `auto-load: false`, `tags: [research, on-demand]` — explicitly catalog-visible but not auto-loaded. (Phase 101 complete)

---

## v4.1 / Backlog Requirements

### Cron Job Health Monitoring (new)

- [ ] **CRON-HEALTH-01**: Recurring cron jobs ("sinks") that perform data ingestion, memory writes, or external API polling must expose a health status endpoint or heartbeat that the MemroOS dashboard can consume.
- [ ] **CRON-HEALTH-02**: The schedules and routines console (UX-FOLLOWUP-03) must surface per-job last-run timestamp, success/failure status, items processed, and any warnings or caught-up/caught-up status.
- [ ] **CRON-HEALTH-03**: Jobs that are not caught up (e.g., Spark transcript ingestion lagging behind real-time) must emit a warning-level health signal that appears in the NOC and/or operator notification surface.
- [ ] **CRON-HEALTH-04**: Operators must be able to pause, resume, or stop individual cron jobs from the dashboard without restarting the entire MemroOS runtime.
- [ ] **CRON-HEALTH-05**: Job definitions must be declarative (e.g., stored in a config or registry) so that the health monitoring surface knows what jobs *should* exist and can detect missing or orphaned schedules.
