---
gsd_state_version: 1.0
milestone: v7.6
milestone_name: Future Spike Queue
status: completed
stopped_at: Phase 119 completed (2026-06-27)
last_updated: "2026-06-28T06:31:00.000Z"
progress:
  total_phases: 62
  completed_phases: 40
  total_plans: 74
  completed_plans: 83
  percent: 65
---

# State: Memroos

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-04 for v2.0)

**Core value:** Any agent framework plugs into Memroos — and every agent, knowledge system, and skill becomes visible, connected, and self-improving.
**Current focus:** Phase 119 completed — future spike queue closed as bounded research with adoption deferred.

## Current Position

Phase: 119
Plan: 119-01 completed
Status: Future spike queue completed as bounded reports (v7.6)

## Session Continuity

Last session: 2026-06-28T06:31:00.000Z
Stopped at: Phase 119 completed (2026-06-27)
Resume file: None
Next action: v8.0 Belief + Provenance Core Phases 120-123 ALL COMPLETE (PROV-01..04 + BELIEF-01..05 test-verified + Watcher-approved 2026-07-06). v8.1 Phase 124 Operator Load Proof + SLO Gate complete (ENTOPS-01); Phases 125-127 (ENTOPS-02..08) remain and have real infra dependencies (hosted multi-tenant operator, IdP/MDM, Hermes/Claude memory-write interception) that need explicit operator sign-off on deployment model before code work. v8.2 Team-Scale + Policy Plane (Phases 128-131) follows. Phase 119 spike-adoption gates remain in force.

## Roadmap Summary (v5.0 + v6.0)

| Phase | Goal | Requirements |
|-------|------|--------------|
| 74 | Security Label Schema + Raw Vault — append-only vault, multi-dim labels, additive migrations with safe defaults | COMPLETE — MEMSEC-01, MEMSEC-02 (2) |
| 75 | Classification Cascade + Ingestion Gate — fail-closed deterministic-first cascade + human review queue | COMPLETE — MEMSEC-03, CTX-FOLLOWUP-03 (2) |
| 76 | Retrieval Authorization Gate — policy decision on every recall/export/dispatch path | COMPLETE — MEMSEC-04 (1) |
| 77 | Safe Index Projections + Envelope Encryption — classification-aware FTS/vector/graph + AES-GCM rotation | COMPLETE — MEMSEC-05, MEMSEC-06, MEMSEC-07 (3) |
| 78 | Security Regression Tests — negative-fixture suite proves no leak path | COMPLETE — MEMSEC-08 (1) |
| 79 | NOC Telemetry + Real-Data Wiring — live NOC + provenance + efficiency telemetry | COMPLETE — NOC-01..14, OPS-AUDIT-01..04 (18) |
| 80 | Cron Health Registry + Schedules Console — heartbeat, caught-up, pause/resume, source contracts | COMPLETE — CTX-FOLLOWUP-01..02, CRON-HEALTH-01..05, UX-FOLLOWUP-03 (8) |
| 81 | Universal Evidence Bundles + Harness Control Plane — Plan-Execute-Verify timelines, shared state | COMPLETE — HARN-01..03 (3) |
| 82 | Auth Hardening — email invites, password reset, OAuth/SSO, role-aware nav | COMPLETE — AUTH-FOLLOWUP-01..03 (3) |
| 83 | Memory Inventory + Listing Clarity — category-specific counts, provenance rows, filters, degraded count honesty | COMPLETE — MEMLIST-01..05 (5) |
| 84 | Competitive Memory Target Architecture — marketplace comparison plus live recall hardening | COMPLETE — MEMTARGET-01 (1) |
| 85 | SkillForge Foundation — intake, proposal, worker, API routes, schema, tests | COMPLETE — SKILLFORGE-01 (1) |
| 86 | SkillForge Analyzer — pattern detection, fail-improve loop, test generation | COMPLETE — SKILLFORGE-02 (1) |
| 87 | SkillForge Edit Generation — bounded diffs, textual LR, rejected-edit buffer | COMPLETE — SKILLFORGE-03 (1) |
| 88 | SkillForge Eval Gating — train/val/held-out splits, W delta, non-regression gates | COMPLETE — SKILLFORGE-04 (1) |
| 89 | SkillForge Operator Approval — proposal queue, diff viewer, approve/reject/rollback | COMPLETE — SKILLFORGE-05 (1) |
| 90 | SkillForge Integration — cross-modal eval, SkillCycle, runtime export | COMPLETE — SKILLFORGE-06 (1) |
| 91 | Dream Cycle — automated nightly skill optimization with risk-based auto-approval | COMPLETE — DREAM-01 (1) |
| 92 | Skill Marketplace — publish, rate, discover skills | COMPLETE — MARKET-01 (1) |
| 93 | Multi-Agent Orchestration — cross-agent skill sharing via A2A | COMPLETE — MULTIAGENT-01 (1) |
| 94 | Behavioral W-Lift v2 — true instruction/skill behavioral eval | COMPLETE — BEHAVIORAL-01 (1) |
| 95 | Self-Hosted Eval Cluster — local judge, Ollama/vLLM support | COMPLETE — LOCALJUDGE-01 (1) |
| 96 | Agent Memory Continuity — MemRoOS-native coding-agent capture and handoff packs | COMPLETE — AGENTMEM-FOLLOWUP-01 (1) |
| 97 | Source Routing Contracts for Meeting Capture — project routing, confidence/review state, qmd freshness proof | COMPLETE — CTX-FOLLOWUP-04 (1) |
| 98 | Skill Distribution Core — progressive loading, auto-load standard, A2A discovery | COMPLETE — SKDIST-01..04 (4) |
| 99 | Private Config Layer — context overlay, generic meeting recordings slot, local merge | COMPLETE — PRIVCONF-01..03 (3) |
| 100 | Circleback Ingestion — sync CLI script, nightly LaunchAgent, qmd indexing | COMPLETE — CIRCLEBACK-01..03 (3) |
| 101 | Memroos Troubleshooter Skill — system troubleshooting reference skill, tag updates | COMPLETE — MSKILL-01..02 (2) |
| 102 | Public Documentation — skills and meeting integration guides, copy-paste template | COMPLETE — PUBDOC-01..03 (3) |
| 103 | Lightweight Checkpoint/Resume/Handoff — compact structured checkpoints, async queues, performance latency | COMPLETE — AGENTMEM-FOLLOWUP-02 (1) |
| 104 | Memory-Trace Observability — casual timelines, failure classification, debug graphs | COMPLETE — AGENTMEM-FOLLOWUP-03 (1) |
| 105 | Agent CI/CD Release Gates — immutable versions, gating checklists, one-step rollback | COMPLETE — AGENTCICD-FOLLOWUP-01 (1) |
| 106 | SkillForge Production SkillOpt Hardening — real behavioral eval, one proposal path, schema traceability, typed edit ops, audit/UI receipts | COMPLETE — SKILLOPT-HARDEN-01..05 (5) |
| 107 | Agent Context Bus and Synchronous Agent Communication — durable inbox/reply bus, MCP wrappers, memory-save receipts, control-layer access enforcement, delegated user/OAuth identity, audit/security tests | COMPLETE — AGENTBUS-01..07 (7) |
| 108 | Cloud Offload + Local Footprint Reduction — inventory local permanence, migrate eligible stores/indexes to managed cloud, cap caches/logs, preserve encryption/rollback/offline fallback | COMPLETE — CLOUDOFFLOAD-01..06 (6) |

**Coverage:** 64/64 v5.0-v6.5 requirements mapped, no orphans.
**Critical path:** 74 → 75 → 76 → 77 → 78. Phases 79, 80, 81, 82 run parallel (81 soft-depends on 74).
**Completed so far:** Phase 34 through Phase 108 shipped; Phase 109 through Phase 113 v7.0 audit complete.

## Performance Metrics

**Velocity:**

- Total v2.0-v2.4 plans completed: 29
- Phase 35 execution completed: 2026-05-05
- Phase 36 completed: 2026-05-05
- Latest Phase 40 gate: docs link/content review, markdown grep checks, Memroos lint, and build passed

## Accumulated Context

### Roadmap Evolution (2026-07-05)

- Backlog item 19 (`MSIQ-01..06`) was added from the Microsoft IQ feature adoption analysis (`content/research/microsoft-iq-feature-adoption-analysis.md`). The architecture review found MEMSEC-01..08 already deliver labels + retrieval authorization for memory tiers, so MSIQ scopes down to the genuinely new surfaces: extending labels/authorization to the git-backed knowledge repo, a memory adapter for self-hosted Microsoft Agent Framework agents, a capped federated retrieval planner, and a bounded GraphRAG spike feeding the existing Knowledge Graph Intelligence item. Operator gate: zero paid services — MIT/OSS only, no Foundry-hosted paths, local-model-only GraphRAG extraction.
- Backlog hygiene: items 1–4 (Permissioned Memory Foundation, Context Source Reliability, Cloud Offload, NOC Real-Data Wiring) were marked COMPLETED in the backlog — they shipped in Phases 74–80, 108, and 117 but were still listed as un-planned P0/P1 work.

### Roadmap Evolution (2026-06-19)

- Phase 115 trust-boundary hardening advanced: handler-local operator guards and direct non-local regression tests now cover agent checkpoints, checkpoint metrics, agent version create/list/promote/rollback, memory trace POST/GET, runtime observability dashboard reads, hive POST writes, and model-routing telemetry POST writes. At the time, `ARCHREV-01` and `ARCHREV-09` remained open for the broader privileged route inventory and future proxy/Next.js migration checklist; later 2026-06-27 entries supersede the `ARCHREV-09` status.
- Phase 115 runtime topology hardening advanced: `apps/memroos/src/lib/runtime-topology.json` now serves shared manifest source service ports, health checks, supervision modes app, mem0, orchestration, voice, agentmemory. `npm run check:runtime-topology` runs standalone Node checker against current Docker/startup text; `start.sh` derives manual-script port defaults checker and `scripts/launchd-start.sh` derives launchd app port defaults after runtime env and Node path resolution. `ARCHREV-04` remains open until Docker compose generated from or otherwise directly derived from manifest.

### Roadmap Evolution (2026-06-23)

- Phase 118 was added after the proactive recollection research pass. The product answer is a deterministic recollection decision layer: detect task/project/recency/handoff/source/rediscovery triggers before plan/tool/final gates, generate bounded tier-aware memory queries, rank candidates by relevance plus recency plus salience/importance plus source freshness plus prior usefulness plus policy risk, inject only threshold-cleared context, and emit receipts for both search and skipped-search decisions.
- The requirement deliberately builds on existing MemRoOS pieces: `/api/recall`, `/api/memory/search`, `memory_salience`, Phase 96 handoff packs, Phase 104 memory traces, Phase 114 retrieval receipts, and Phase 117 efficiency telemetry. It does not approve a new memory backend or cross-project recall without explicit scope and policy proof.

### Roadmap Evolution (2026-06-27)

- Phase 115 `ARCHREV-04` was completed as a runtime-topology enforcement slice. `apps/memroos/src/lib/runtime-topology.json` now names Docker compose service mappings, dependencies, env-backed ports, and health paths; Docker compose probes `/api/health`; and `scripts/check-runtime-topology.mjs` validates Docker compose, `start.sh`, and launchd artifacts against the shared manifest.
- Phase 115 `ARCHREV-08` was completed as a planning-retention policy slice. `.planning/planning-history-retention.md` keeps current docs in place, uses tracked archives for old phase internals, treats screenshots and operational evidence as private-release material, and defines the pre-public-release review gate without deleting history or moving private artifacts from this run.
- Phase 115 `ARCHREV-05` was completed as a typed env startup-validation slice. `apps/memroos/src/lib/env.ts` now validates core app URLs, ports, root config paths, A2A settings, embedding settings, and datastore credential shapes; `apps/memroos/src/instrumentation.ts` calls startup validation before schedulers start; server constants/A2A/root-config/embedding readers consume the typed module; and root config status marks `agents.config.json` legacy while keeping collections/context-sources active. Broad route-specific env reads remain visible follow-up surface, not a hidden claim of complete env elimination.
- Phase 115 `ARCHREV-06` is complete. The verified public eval slices now cover the route, TypeScript SDK, Python SDK, REST/OpenAPI discovery, MCP tool-schema export, A2A discovery, and shared contract-manifest consolidation: `apps/memroos/src/lib/public-api/eval-contract.ts` validates public trace request/response shape and builds the OpenAPI 3.1 document, `/api/public/v1/traces` emits `X-Memroos-Contract: public-eval-api.v1`, `/api/public/v1/openapi` serves the public eval REST contract, `packages/sdk-ts/src/contract.ts` validates successful SDK responses, `packages/sdk-py/memroos_eval_sdk/contract.py` validates successful Python SDK responses, both SDK live smokes passed against local running apps with temp SQLite DBs, the MCP facade exports `memroos-mcp-tools.v1` through `mcp_tool_contract` / `mcp://tools/contract`, `/api/a2a/openapi` serves `memroos-a2a.v1` for well-known agent cards plus JSON-RPC dispatch, and `contracts/memroos-contracts.json` plus `npm run check:contracts` prevents app/SDK/MCP ID and core schema-field drift.
- Phase 115 `ARCHREV-07` is complete. `.github/workflows/ci.yml` now has `workflow_dispatch`, a daily scheduled run, and a dedicated `recall-canary` job. `npm run check:recall-canary` runs memory recall scorer coverage plus `memory-recall-canary-ci.test.ts`, which executes the committed gold recall cases from `evals/memory-recall/cases.json` through `runMemoryRecallEvalSuite({ mode: "gold" })` against a temp SQLite DB and fails on the existing recall/precision/MRR/latency thresholds.
- Phase 115 `ARCHREV-09` is complete. `docs/next-trust-boundary-upgrade.md` records the reviewed Next dependency and `proxy.ts` hash, `scripts/check-next-trust-boundary.mjs` fails if those markers drift or the proxy/matcher shape regresses, `proxy.test.ts` now covers matcher inclusion/exclusion plus expired/malformed JWTs, reviewer escalation, route-local auth traversal, and Bearer-vs-cookie precedence, and CI runs `npm run check:next-trust-boundary` after lint.
- Phase 115 `ARCHREV-01` is complete. `scripts/check-route-auth-boundary.mjs` validates every `ROUTE_LOCAL_AUTH_API_ROUTES` proxy bypass pattern and proxy operator/admin route against handler-local auth markers, requires the focused non-local denial regression tests, and CI runs `npm run check:route-auth-boundary` after lint. The marketing split remains a future deployment decision, not an open Phase 115 blocker.
- Phase 115 `ARCHREV-02` was completed as a docs-only architecture identity slice. `docs/architecture.md` now frames MemRoOS as an agent operating system with a broker kernel, maps shipped domains to routes/modules, documents Python service and script boundaries, and defines placement rules for Next.js app code, shared libraries, services, scripts, docs, and planning artifacts.
- Phase 114 was reconciled as repo-verified complete after rechecking the Phase 114 verification report, confirming Midbrain still ranks 6 at `65.2115` through `scripts/run-marketplace-memory-evals.mjs`, and closing the remaining comparative retrieval harness answer-support truncation issue with regression coverage. Public deploy approval remains separate per the Phase 114 handoff.
- Phase 117 was completed and reconciled in the planning registry. The NOC efficiency telemetry layer now has the `efficiency_events` store, all five EFFTEL emitters, `/api/operations/noc` aggregation, and Operations UI visibility for retrieval-before-work, same-source re-read, raw-context token share, operator re-ask, and rediscovered-fact metrics.
- Phase 118 was implemented in five slices: pure recollection policy, agent-runtime context injection wiring, memory-trace and efficiency-event recollection receipts, proactive/negative recall eval fixtures, and NOC/operator read-model visibility. Full Vitest, typecheck, lint, and build passed at completion; lint retained the existing 32 warnings.
- Phase 119 completed the bounded future spike queue for Memento, CocoIndex, FastContext, ADK/A2A, Qdrant Cloud 1.18, and Hyper-Extract. The reports live under `.planning/spikes/`, `npm run check:future-spikes` validates the report contract, and CI now runs that gate. All adoption, backend, hosted/private upload, production-path, Qdrant-upgrade, runtime-replacement, and default-extraction decisions remain deferred until explicitly approved.

### Roadmap Evolution (2026-06-24)

- `ADKA2A-FOLLOWUP-01` was added after reviewing Google's cross-language contract-compliance pipeline shared from the Shubham Saboo X post. The useful pattern is Python/ADK orchestration delegating to a Go deterministic validator through A2A/JSON-RPC, with timeout, retry, fail-closed, and audit behavior visible. This belongs as a bounded integration/demo fixture for MemRoOS's A2A registry, dispatch, evidence, and NOC surfaces, not as an ADK/Gemini dependency or a compliance-vertical product claim.
- `QDRANT-FOLLOWUP-01` was added after reviewing Qdrant's 1.18.x release line. The useful MemRoOS path is an operational Qdrant Cloud upgrade-readiness pass: latest 1.18.x patch target, mem0 compatibility, schema inventory, backup/rollback, canary write/search checks, recall/latency non-regression, memory monitoring, audit tracing, per-collection metrics, and strict-mode review. This does not approve local Qdrant, a backend swap, TurboQuant enablement, named-vector migration, or a production cluster upgrade without Luis approval.

### Roadmap Evolution (2026-06-25)

- `HYPEREXTRACT-FOLLOWUP-01` was added after reviewing Hyper-Extract as a possible document-to-structured-memory extraction tool. The useful MemRoOS path is a bounded test on non-sensitive or sanitized documents that compares typed graph/hypergraph/temporal/spatial extraction and source-span-backed candidate memories against the current Markdown/QMD/mem0 ingestion path. This does not approve dependency adoption, private-document upload, production ingestion, storage-layer replacement, or default extraction behavior without Luis approval.

### Roadmap Evolution (2026-06-14)

- Phase 116 is complete v7.3 Agent Context Bus Operational Bootstrap. It operationalizes Phase 107 agent-context bus provisioning/startup expectations, MCP `MEMROOS_AGENT_API_KEY` wiring, agent-side communication skill coverage, unit/integration smoke test proving register → key → send → inbox → ack → reply schema, threading, audit receipts.

### Roadmap Evolution (2026-06-10)

- Phase 115 was added from `.code-review/ARCHITECTURE-REVIEW.md` to convert the nine system-level architecture findings into executable GSD requirements. The first shipped slice is ARCHREV-03: SQLite schema initialization now has an ordered `PRAGMA user_version` migration runner, legacy unstamped DB upgrade coverage, future-version fail-closed behavior, and synchronous default-admin seeding before `getDb()` returns.
- Phase 115 is repo-verified complete as of 2026-06-27. Any marketing/app split work should be planned as a future deployment decision rather than reopened under Phase 115.

### Roadmap Evolution (2026-06-04)

- Phase 114 was added after the Midbrain.ai competitive deep dive. Midbrain is now treated as a direct research-led retrieval and continual-learning competitor, not as a proven governed operations-plane competitor. The durable roadmap response is v7.1 Competitive Retrieval Proof: add Midbrain to public comparison surfaces, keep MemRoOS public-evidence architecture scoring separate from SmartSearch retrieval metrics, and build the next proof lane around external retrieval benchmarks, SmartSearch-inspired retrieval, and retrieval receipts.
- Highest-benefit GSD additions from the Midbrain comparison: (1) a site-facing generated benchmark block with Midbrain `65.21` and caveats; (2) comparative benchmark lanes for public-evidence architecture, external retrieval tasks, and operational workflow continuity; (3) deterministic entity extraction / expansion / reranking / score-adaptive context packing; (4) public-facing retrieval receipts showing retrieved, injected, ignored, score, tier, source, authorization result, and reason; (5) a concrete LoCoMo / LongMemEval / LongMemEval-V2 implementation path.
- Phase 106 added after the SkillForge/SkillOpt architecture review. It hardens the existing SkillForge loop by replacing heuristic/stub eval behavior with real behavioral scoring, converging proposal generation, adding schema-level traceability for split/baseline/edit receipts, introducing typed bounded edit operations, and exposing accepted/rejected proposal evidence in audit/UI surfaces.
- Phase 106 is complete. SkillForge now uses a deterministic no-side-effect sandbox scorer for held-out proposal evaluation, records baseline/treatment W receipts, and no longer relies on randomized Phase 94 behavioral A/B scores.
- Phase 107 completed after the agent-context-sync research pass. It introduces a MemRoOS-native durable agent context bus for synchronous request/reply, inbox polling, explicit acknowledgements, MCP-accessible tools, optional memory-save receipts, scanner/audit guardrails, fail-closed control-layer data-access denial for self-declared claims, and delegated user/OAuth raw-token exclusion so agents can communicate without relying on hidden chat state or self-declared access.
- Phase 108 is complete as an operating-profile implementation. MemRoOS now has a local-footprint inventory library, `npm run check:local-footprint`, NOC API footprint status, cloud target mapping, prune-safety classification, and guardrails for raw vault/secrets/vector backends.
- Turbovec was added to the Phase 108 roadmap only as a future compressed-vector shadow-index limitation/test. It is not approved for implementation; any future test or dependency adoption requires Luis approval first and must prove no recall/precision regression plus meaningful hot-path latency improvement.
- Memento-style memory was added as a future bounded save-quality spike, not an approved implementation. Any future work should compare a local-first typed/audited Memento-compatible contract against MemRoOS `agent_memory_candidates`, capture/handoff packs, and recall evals; no dependency adoption, backend swap, hosted/private trace upload, or replacement of mem0/Qdrant/Neo4j/SQLite starts without Luis approval.
- CocoIndex and FastContext were added as future bounded comparison spikes, not approved implementations. CocoIndex should be tested only as an optional derived-index adapter for one non-sensitive context lane; FastContext should be tested only as a read-only repo-scout baseline against GitNexus and grep. Neither can become a dependency, production path, hosted/private upload, policy bypass, backend replacement, GitNexus replacement, or automatic-edit path without Luis approval.

### Roadmap Evolution (2026-05-27)

- Phase 97 added after the May 27 Cordant/Juan Spark meeting was captured in raw/global knowledge but misfiled under `projects/general`; permanent work tracks source-routing contracts, route confidence/review state, project qmd freshness proof, and operator visibility across raw capture, project promotion, qmd indexing, and app-level memory promotion.
- Phase 97 completed with deterministic Cordant route signals in `scripts/check-knowledge-indexing.mjs`, regression tests, and qmd proof that the May 27 meeting now lives under `projects/cordant` and the `cordant` collection.

### Positioning Guardrails (2026-05-21)

- Lead public positioning with shared organizational memory, governed orchestration, evidence/provenance, and interop across agent frameworks.
- Treat voice as an ingestion surface for memory, not a standalone product pillar.
- Frame `qmd update` UI work as context freshness and source evidence, not as a search-admin feature.
- Phase 72 should make evidence bundles and governed skill contracts explicit in acceptance criteria because they explain what memory was consumed, what tools ran, which checks passed, and what can be replayed or rolled back.

### Decisions (Phase 72 Plan 06)

- **Skill dispatch lookup key is skill_name:** Optional string in dispatch request body — no new mapping table needed; dispatchers pass skill_name when they want governed execution
- **SQL WHERE enforces enabled+complete at DB layer:** fail-closed is not a JS post-filter; `dispatch_status='enabled' AND completeness_pct=100` is in the SQL query so no future code path can bypass it
- **Evidence never includes untrusted body text:** SkillContractSummary exposes only id/name/source_harness/risk_tier/dispatch_status/completeness_pct — raw_body, preconditions, allowed_tools, verification_checks excluded from all evidence paths
- **Fallback path preserved:** no skill_name → null result → existing adapter dispatch proceeds unchanged; no governance overhead on non-governed tasks

### Decisions (Phase 72 Plan 05)

- **Dispatch fail-closed:** completeness < 100% OR missing REQUIRED_CONTRACT_FIELDS → dispatch_status='incomplete'; only fully-complete skill with explicit frontmatter 'enabled' gets dispatch_status='enabled'
- **Prompt injection as data:** parseSkillMd() stores raw_body and all fields verbatim; no eval, no exec; sanitization is caller responsibility; audit trail preserved
- **UNIQUE(name, source_harness) with ON CONFLICT DO UPDATE:** idempotent re-import replaces previous entry
- **Pagination indexes on skill_registry:** (source_harness, dispatch_status) and (dispatch_status, imported_at DESC) per performance note
- **GET /api/skills/import is read-only (no operator auth):** Browser UI needs unauthenticated read access to show registry skills; POST import remains operator-gated

### Decisions (Phase 72 Plan 02)

- **ApplyResult discriminated union:** `kind='sync'` for legacy proposal types; `kind='job'` for behavioral types — callers must switch on `result.kind` before accessing type-specific fields
- **Behavioral proposal predicate:** `agent_instruction_patch` and `skill_addition` are the two types requiring async eval (D-06); all other types keep the synchronous apply path
- **seal_eval_jobs + seal_evidence_bundles:** additive tables with FK to `seal_proposals (ON DELETE CASCADE)`; sandbox profile fails closed — all tool calls denied by default, all calls recorded in evidence bundle

### Decisions (Phase 70 Plan 04)

- **MemoryAdapter interface:** `capabilities` field is required (not optional) — MemoryCapability union = semantic|graphTraversal|reasoningTrace|bufferedWrite|tenantScoped|auditEdges
- **Registry pattern:** `Map<MemoryTier, MemoryAdapter[]>` with registerAdapter/getAdapters/clearRegistry; module-init idempotency via `_registered` guard
- **Shim delegation:** existing exported functions check `getAdapters(tier)[0]` first, fallback to direct impl — exactly one path per tier, no double-writer (T-70-12)
- **EpisodicMemoryAdapter.write() is a no-op stub** — episodic writes must go through the full db-ingest pipeline for FTS5 index integrity

### Decisions (carried into v2.0)

- Production runs on port 3002 via `npm start -- --port 3002`; kill existing: `lsof -ti :3002 | xargs kill -9`
- After any build change: rebuild with `npm run build` then restart
- **Vector store architecture (CRITICAL):** QMD handles BM25/lexical only. ALL vector/semantic search uses Qdrant Cloud. `qmd embed` is FORBIDDEN.
- **Security:** No `execSync`/`exec` — use `execFileSync` or pure `fs/promises` only
- **mem0 writes:** Only via `POST http://localhost:3201/memory/add` — never touch `agent_memory` Qdrant directly
- **Group children:** Use `parentId` + `extent:'parent'` pattern (Phase 17 — already in codebase)
- **Qdrant stays cloud:** Never add local Qdrant to Docker compose — configured via QDRANT_URL + QDRANT_API_KEY env vars
- **Qdrant upgrades are gated:** Version upgrades target Qdrant Cloud only and require mem0 compatibility, snapshot/rollback, canary write/search, and memory recall/latency/audit proof before production promotion.
- **Docker compose is for OSS users only:** Luis keeps native workflow (npm start, LaunchAgent, port 3002)
- **Memory stack is fixed for v2.0:** mem0 + Qdrant Cloud (vector) + Neo4j (graph, new) + SQLite (episodic). No pluggability until v3.0.
- **Future vector experiments require approval:** Turbovec or similar compressed-vector indexes may only be evaluated as optional shadow indexes, and require Luis approval before adding a dependency, implementation path, or backend swap.

### v2.0 architectural constraints

- **LangGraph runs as a Python service** — separate process from Next.js, same pattern as Pipecat voice service
- **LangGraph checkpoint DB is `data/orchestration.db`** — SEPARATE from Memroos's main SQLite DB to avoid cross-process lock contention
- **A2A adapter and LangGraph are separate layers** — A2A owns transport/protocol/task-state mapping; LangGraph owns routing policy, capability selection, retry, HIL. They communicate via internal API (ORCH-07 contract)
- **REG-00 canonical registry is complete** — A2A and REST registration both write through the same model
- **Phase 35 A2A layer is complete** — agent cards, A2A registration, durable task APIs, SSE, outbound delegation, ADK fixture, Registry/Flow surfacing
- **A2A adapter routing is protocol-driven** — `protocol: a2a` selects A2A; platform alone does not reroute legacy Gemini agents
- **Outbound A2A credentials are env-key-only** — metadata may name an env var, but UI must not render bearer/API-key values or raw auth headers
- **ADK proof fixture is optional** — `examples/adk-a2a-agent/` is not imported by Memroos startup

### v2.5 ACTUAL Status (reconciliation audit 2026-05-16)

Prior STATE.md claimed "all 6 phases shipped" — that was FALSE. No SUMMARY.md
exists for any phase; all work is uncommitted; production build is broken.
Verdict: coherent partial work (real logic, not scaffolding), NOT shippable.

| Phase | Name | Actual Status |
|-------|------|---------------|
| 57 | Eval Engine Core | PARTIAL — engine/scorers/judge real; golden set ~3/50 rows |
| 58 | SEAL Self-Improvement | PARTIAL — full loop coded; 4 real test failures (audit FK, eval lookups) |
| 59 | Memory Autogen | UNPLANNED — code exists, NO phase dir/plan/contract |
| 60 | Agent Autogen | PARTIAL/MISSING — golden sets 2/50 each; no dogfood W-lift evidence |
| 61 | Business-Ops L3 | PARTIAL — schema/code column mismatch will break L3 at runtime |
| 62 | Public Eval API + SDK | PARTIAL — SDKs real, route paths diverge from plan |

Scope creep outside v2.5: phases 63 (Rename+Team Auth) & 64 (Immutable Audit+HIL)
have plan dirs + code (lib/auth/, /api/auth/, login/register) — v3 direction.
| Phase 70-foundation-engine-core P05 | 11 minutes | 3 tasks | 6 files |
| Phase 70-foundation-engine-core P03 | 35m | 3 tasks | 4 files |
| Phase 71-recall-hil-sla-voice P03 | 8 | 3 tasks | 7 files |
| Phase 72-cross-project-recall-behavioral-w-lift-ui-skills P01 | 6m | 3 tasks | 4 files |
| Phase 72 P02 | 15m | 3 tasks | 7 files |
| Phase 72 P04 | 40m | 3 tasks | 6 files |
| Phase 72 P05 | 36m | 3 tasks | 7 files |
| Phase 72 P06 | 12m | 3 tasks | 4 files |
| Phase 109-parallel-domain-audit P01 | 6m | - tasks | - files |

### Blockers/Concerns (verified)

- **BUILD BROKEN:** new untracked `apps/memroos/src/middleware.ts` (auth, ph63/64)
  collides with `proxy.ts`. This Next.js replaced middleware→proxy; the two files
  hold *different* logic (RBAC vs host-redirect) and must be merged, not deleted.

- **91/545 tests fail** (25 files): SEAL audit-log FK bug, L3 schema mismatch,
  plus mock-setup failures (hive lineage, memory tier routes).

- Golden sets ~4% populated — drift guard / agreement criteria cannot be validated.
- `bcryptjs` declared in package.json but may need `npm install`.
- `.codex/` & `.agents/` untracked tool state — should be gitignored, NOT committed.
- GitNexus embeddings partial (285/473) — upstream crash bug (abhigyanpatwari/GitNexus#824)

### v2.5 Finishing Pass (2026-05-16) — what closed

- ✅ **Golden sets populated** (minimal viable): 57 business-ops 16 rows, 60
  sales/support/finance/ops 15 each. Verified vs real judge — drift agreement
  ≥0.85 with positive + policy-leak negative classes. Reproducible via
  `golden-sets/.generate.mjs`. Full ~50-row sets still a future nice-to-have.

- ✅ **Path/naming ratified** as-built for 61 (`lib/l3`) and 62
  (`/api/public/v1/*`) via plan amendments — rename deferred to external
  packaging. No longer open.

- ✅ **Phase 59 retro-documented** — PLAN + PARTIAL SUMMARY authored; all 6
  MEMGEN reqs implemented + tested.

### v2.5 Tier 1 closure (2026-05-16)

- ✅ **Dogfood W-lift closed at Tier 1:** `EvalService.rescoreForProposal`
  now uses `lib/seal/rescore.ts` to run deterministic modeled post-apply
  re-scoring through the real eval engine, golden-set loader, layer scorers,
  judge, drift guard, persistence, and SEAL audit metadata. Keep and rollback
  are both reachable without a mocked eval service.

- ✅ **Honesty guardrail preserved:** memory/config proposal classes can move W via the modeled fixed-harness delta. `agent_instruction_patch`, `skill_addition`, and `noop_test` keep W unchanged with `wLiftModeled: false`. True behavioral W-lift from instruction/skill changes remains v3.

## UAT Findings (2026-05-17)

- **Root cause fixed:** `apps/memroos/.env.local` was missing `MEMROOS_JWT_SECRET`, `MEMROOS_ADMIN_EMAIL`, `MEMROOS_ADMIN_PASSWORD`. These live in root `.env` which Next.js doesn't load. Added to `.env.local` (gitignored).
- **Tenant API key mismatch:** `tak-default-internal` hash was stale. Updated to match current `MEMROOS_OPERATOR_API_KEY` in `.env.local`.
- **All 18 pages 200 OK**, 680 tests passing, eval engine E2E verified (W=0.7035), public API functional.

## Deferred Items

Items acknowledged and deferred at milestone close on 2026-05-17:

| Category | Item | Status |
|----------|------|--------|
| context_questions | Phase 60 / 60-CONTEXT.md — trajectory authorship workflow, step count bounds, preset-change audit semantics | Deferred to v3 planning |
| context_questions | Phase 63 / 63-CONTEXT.md — rename/auth decisions recorded as next-milestone context | Deferred to Phase 63 execution |
| future_spike | Memento memory-save quality spike — compare local-first typed/audited Memento-style save behavior against MemRoOS candidates and evals; no dependency, backend, or hosted/private-trace adoption without Luis approval | Completed in Phase 119; adoption deferred |
| future_spike | CocoIndex source-freshness spike — compare optional derived-index behavior for one non-sensitive context lane against qmd/source-health checks; no dependency, production path, policy bypass, sensitive indexing, or backend replacement without Luis approval | Completed in Phase 119; adoption deferred |
| future_spike | FastContext repo-scout spike — compare read-only repo exploration against GitNexus and grep on MemRoOS code-navigation tasks; no runtime dependency, hosted/private upload, GitNexus replacement, or automatic edits without Luis approval | Completed in Phase 119; adoption deferred |
| future_spike | ADK/A2A cross-language contract-compliance demo — compare Google's Python ADK plus Go deterministic-validator A2A fixture against MemRoOS registry/dispatch/evidence/NOC surfaces; no core ADK/Gemini dependency, app copy, runtime replacement, or compliance-vertical claim without Luis approval | Completed in Phase 119; adoption deferred |
| future_spike | Qdrant 1.18.x Cloud upgrade readiness — verify latest patch, mem0 compatibility, collection schemas, snapshot/rollback, canary write/search, recall/latency non-regression, audit tracing, metrics, and strict-mode guardrails; no local Qdrant, backend swap, TurboQuant/named-vector adoption, or production upgrade without Luis approval | Completed in Phase 119; adoption deferred |
| future_spike | Hyper-Extract structured-memory extraction spike — compare typed graph/hypergraph/temporal/spatial extraction on non-sensitive or sanitized documents against Markdown/QMD/mem0 ingestion; no dependency, private-doc upload, production ingestion, default extraction, or storage-layer change without Luis approval | Completed in Phase 119; adoption deferred |
