# Requirements: Memroos GSD Roadmap

*Updated: 2026-08-04*

---

## v8.39 Observability-Gated Memory Engine Modernization — Planned 2026-08-04

**Sequencing:** LANGTRACE-01..12 / Phase 228 are prerequisites for MEMENG,
RECALLV2, TEMPFACT, SEMGRAPH, OBSLEARN, LIVING, and MEMEVAL implementation work.
The trace baseline must exist before memory behavior changes.

### LangSmith agent tracing prerequisite

| ID | Requirement | Phase | Status |
|---|---|---:|---|
| LANGTRACE-01 | Optional framework-neutral LangSmith exporter, disabled by default and configured only through secret-managed settings | 228 | planned |
| LANGTRACE-02 | Reuse/port the bounded redacted Beastmode `beastmode.run` and `beastmode.child` receipt projection from commit `661e0e0`; offline receipts stay authoritative | 228 | planned |
| LANGTRACE-03 | Propagate server-controlled goal/run/agent/tenant/project/space/correlation/parent-trace identity across Next.js, LangGraph, A2A/MCP, and executor children without making trace fields authorization inputs | 228 | planned |
| LANGTRACE-04 | Stable spans cover planning, model calls, dispatch, tools, policy, retrieval arms, rerank/context injection, memory writes, consolidation, and evals | 228 | planned |
| LANGTRACE-05 | Labels/redaction run before serialization; metadata-only default excludes prompts, raw outputs, passages, file names, diffs, arguments, and secrets | 228 | planned |
| LANGTRACE-06 | Richer payload modes require explicit tenant/project/classification/retention/sampling policy; restricted/confidential export fails closed by default | 228 | planned |
| LANGTRACE-07 | Async bounded retry/failure isolation; missing key, timeout, rate limit, sampling, or outage never blocks work or changes a gate | 228 | planned |
| LANGTRACE-08 | GSD ledger/NOC store LangSmith IDs and deep links while preserving MemroOS receipt IDs as canonical | 228 | planned |
| LANGTRACE-09 | MemroOS eval datasets/runs/examples/scores/config map to optional LangSmith experiments without changing the canonical eval store | 228 | planned |
| LANGTRACE-10 | Sampling, batching, queue caps, retention, budgets, and zero-traffic local/offline operation are documented and tested | 228 | planned |
| LANGTRACE-11 | Representative end-to-end and multi-agent trace proof from GSD goal through child/tool/retrieval to answer/eval | 228 | planned |
| LANGTRACE-12 | Security/resilience tests prove redaction, forged-context non-authority, retry bounds, outage non-interference, and unchanged offline verdicts | 228 | planned |

### Memory substrate and shadow comparison

| ID | Requirement | Phase | Status |
|---|---|---:|---|
| MEMENG-01 | Exact deployed Mem0 pin plus startup capability manifest for extraction instructions, graph, temporal, rerank, schema, and write semantics | 229 | planned |
| MEMENG-02 | Engine-neutral fact/write/search/curation/receipt adapter contract preserves MemroOS tenant, label, raw-vault, lifecycle, and audit boundaries | 229 | planned |
| MEMENG-03 | Governed `HindsightMemoryAdapter` maps server-controlled MemroOS scopes to banks; raw client bank IDs never authorize access | 229 | planned |
| MEMENG-04 | Authorized/redacted dual-write and shadow-read; Hindsight results reach traces/evals only until promotion | 229 | planned |
| MEMENG-05 | Identical-model LoCoMo, LongMemEval, bounded BEAM, and MemroOS operational workload bake-off with fixed budgets/configuration | 229 | planned |
| MEMENG-06 | Measure quality, temporal/update/contradiction/abstention, latency, cost, context, policy leakage, legal hold, and erasure before integrate/emulate/reject decision | 229 | planned |

### Unified Recall v2

| ID | Requirement | Phase | Status |
|---|---|---:|---|
| RECALLV2-01 | One recall contract serves direct, prior-work, proactive, dispatch, MCP, and eval callers | 230 | planned |
| RECALLV2-02 | Scope/authorize before backend retrieval where possible and re-check before fusion/injection | 230 | planned |
| RECALLV2-03 | Parallel independent BM25/FTS, full-corpus ANN, entity/graph, and temporal candidate arms | 230 | planned |
| RECALLV2-04 | RRF or measured calibrated fusion over independent candidates; lexical/entity evidence is not only a semantic-top-k boost | 230 | planned |
| RECALLV2-05 | Local cross-encoder rerank, dedupe, and token/character-budgeted context packing | 230 | planned |
| RECALLV2-06 | Per-candidate retrieved/filtered/fused/reranked/deduped/injected/ignored receipts and reasons | 230 | planned |
| RECALLV2-07 | Replace or remove the bounded recent-row in-process semantic scan; production semantic recall is full-corpus ANN | 230 | planned |
| RECALLV2-08 | Quality/latency/policy/degraded-mode proof against the Phase 228 baseline and Phase 229 harness | 230 | planned |

### Temporal evidence facts and reversible truth

| ID | Requirement | Phase | Status |
|---|---|---:|---|
| TEMPFACT-01 | Versioned fact contract carries type, occurred/valid intervals, evidence, extractor/model/prompt/version, confidence, and evidence count | 231 | planned |
| TEMPFACT-02 | Active/superseded/invalidated/disputed states plus supersedes/contradicts/supports/causes edges | 231 | planned |
| TEMPFACT-03 | Likely updates/contradictions detected without silently overwriting raw or previously valid facts | 231 | planned |
| TEMPFACT-04 | Query intent supports current, historical, first, last, before/after, and range behavior | 231 | planned |
| TEMPFACT-05 | Edit/invalidate/restore is reversible, audited, and recomputes affected derived views | 231 | planned |
| TEMPFACT-06 | Retention, legal hold, DSAR/erasure, labels, lineage, and tenant isolation remain authoritative | 231 | planned |
| TEMPFACT-07 | Temporal/conflict/supersession/restoration/erasure regression suite | 231 | planned |

### Semantic entity graph

| ID | Requirement | Phase | Status |
|---|---|---:|---|
| SEMGRAPH-01 | Write-time canonical entity/alias extraction and resolution replaces isolated content-only graph facts | 232 | planned |
| SEMGRAPH-02 | Entity embeddings plus deterministic alias evidence; uncertain merges enter governed review | 232 | planned |
| SEMGRAPH-03 | Typed relationships carry provenance, confidence, valid time, labels, and revision state | 232 | planned |
| SEMGRAPH-04 | Bounded entity/relationship/temporal/causal expansion returns candidates to Recall v2 | 232 | planned |
| SEMGRAPH-05 | Governed upper ontology plus tenant/project packs; new aliases/types follow approval | 232 | planned |
| SEMGRAPH-06 | Direct graph write/query mismatch fixed so written content is retrievable and linked | 232 | planned |
| SEMGRAPH-07 | Multi-hop quality, traversal-cost bounds, tenant/label isolation, and deletion propagation proof | 232 | planned |

### Governed observations and consolidation

| ID | Requirement | Phase | Status |
|---|---|---:|---|
| OBSLEARN-01 | Scheduled meta-insight and raw-vault/lineage consolidators converge on one async contract | 233 | planned |
| OBSLEARN-02 | Evidence changes create/update/retire/split observations without mutating raw evidence | 233 | planned |
| OBSLEARN-03 | Observations carry supporting/contradicting fact IDs, model/prompt/version, revisions, and searchable type | 233 | planned |
| OBSLEARN-04 | Strictest source policy inheritance and tenant/project/mission isolation | 233 | planned |
| OBSLEARN-05 | Replay-safe, idempotent, bounded, traceable worker with NOC health | 233 | planned |
| OBSLEARN-06 | Only affected living briefs and graph projections refresh, with recomputation receipts | 233 | planned |
| OBSLEARN-07 | Evidence removal, contradiction, retirement, split, replay, policy, and recovery tests | 233 | planned |

### Living briefs and memory profiles

| ID | Requirement | Phase | Status |
|---|---|---:|---|
| LIVING-01 | Named query-defined cached understanding for stable operational topics | 234 | planned |
| LIVING-02 | Brief declares scope, query, allowed facts/labels, refresh mode, token budget, and direct lookup | 234 | planned |
| LIVING-03 | Full and typed-delta refresh, stable-section preservation, periodic full rebuild | 234 | planned |
| LIVING-04 | Complete revision/evidence history with typed insert/replace/remove deltas | 234 | planned |
| LIVING-05 | Operator-owned sections are protected; conflicts become proposals | 234 | planned |
| LIVING-06 | Reusable profile binds mission, directives, extraction, sources, tags, ontology, retrieval budget, and refresh triggers | 234 | planned |
| LIVING-07 | Profiles only narrow existing identity/policy scope and never grant access | 234 | planned |
| LIVING-08 | UI/NOC shows freshness, evidence, refresh state, size, and failures | 234 | planned |
| LIVING-09 | Usefulness, support, staleness, delta drift, token savings, and cross-scope contamination evals | 234 | planned |

### Standardized evaluation and promotion

| ID | Requirement | Phase | Status |
|---|---|---:|---|
| MEMEVAL-01 | Reproducible LoCoMo, LongMemEval, and bounded BEAM lanes; architecture scores stay separate | 235 | planned |
| MEMEVAL-02 | Same-model/same-budget current Mem0, Hindsight, and native Recall v2 comparison | 235 | planned |
| MEMEVAL-03 | Publish config/revisions plus accuracy, latency, token, ingest, storage, failure, and cost metrics | 235 | planned |
| MEMEVAL-04 | Separate temporal, update, multi-hop, contradiction, abstention, and long-context results | 235 | planned |
| MEMEVAL-05 | Operational policy leakage, freshness, legal hold, tenant isolation, curation, and erasure tests | 235 | planned |
| MEMEVAL-06 | Canonical MemroOS eval persistence with optional Phase 228 LangSmith experiment mirror | 235 | planned |
| MEMEVAL-07 | Promotion thresholds and rollback handles defined before default-path changes | 235 | planned |
| MEMEVAL-08 | Final explicit Hindsight-default/optional/rejected decision; Cognee remains idea source unless product center changes | 235 | planned |

**Locked:** LangSmith is optional and non-authoritative; no backend switch,
private hosted-trace upload, or replacement of MemroOS knowledge/governance/
identity/lifecycle planes occurs without shadow proof and operator approval.

## Current Completed Milestones

- v6.4 SkillForge Production SkillOpt Hardening — complete
- v6.5 Agent Context Bus + Synchronous Agent Communication — complete
- v6.6 Cloud Offload + Local Footprint Reduction — complete
- v7.0 Client-Ready Security + Architecture Audit — complete
- v7.1 Competitive Retrieval Proof — complete
- v7.2 Architecture Review Hardening — complete
- v7.4 NOC Efficiency Telemetry — complete
- v7.5 Proactive Recollection Triggering — complete
- v7.6 Future Spike Queue — complete
- v8.0 Belief + Provenance Core — complete
- v8.1 Enterprise Operator Control Plane — partial (infra deps)
- v8.2 Team-Scale Access + Policy Plane — complete
- v8.3 Agent OS GSD Stack — complete
- v8.4 Project-Centric Operator UX — complete
- v8.5 Agent Fleet Plane — complete (Phases 142-147, FLEET-01..26)
- v8.6 Skill Trust Chain — complete (Phases 148-150, SKILLTRUST-01..05; closed 2026-07-16)
- v8.11 Unified Meeting Memory — complete (Phases 151-153)

---

## v8.19 Runtime Bottleneck Evidence

- [ ] **PERF-EVID-01**: A reproducible operator-load run uses sanitized production-scale fixtures and current runtime configuration, then records p50/p95/p99 latency, throughput, error rate, concurrency, source revision, and host metadata in a machine-readable report.
- [ ] **PERF-EVID-02**: Trace or profile evidence separates application CPU/heap, SQLite/queue contention, and remote Qdrant/Neo4j/Ollama/LLM time for representative operator paths; unknown time is labeled instead of inferred.
- [ ] **PERF-EVID-03**: A representative retrieval run records recall-quality metrics together with p50/p95 latency, token spend, and dependency timing using the same declared dataset and workload definition.
- [ ] **PERF-EVID-04**: A decision record selects keep, current-stack optimization, or a bounded shadow extraction. A Rust candidate is allowed only when repeated representative runs miss the accepted SLO and profiling attributes the limiting work to a bounded local compute/indexing path; no wholesale rewrite is authorized by this phase.

## v6.4 SkillForge Production SkillOpt Hardening

- [x] **SKILLOPT-HARDEN-01**: `runHeldOutEval` and `runEvalGate` use a deterministic sandbox-backed behavioral scorer with a true current-skill baseline W for instruction and skill proposals.
- [x] **SKILLOPT-HARDEN-02**: SkillForge has one authoritative proposal-generation path for worker/API/approval flows.
- [x] **SKILLOPT-HARDEN-03**: SkillForge persistence stores edit hash, split ids, baseline W, validation W, held-out W, and evaluator receipt references.
- [x] **SKILLOPT-HARDEN-04**: Proposed skill changes use typed bounded edit operations before rendering to diffs.
- [x] **SKILLOPT-HARDEN-05**: Proposal audit/API/UI evidence includes accepted/rejected status, W values, split ids, rejected-edit reason, operator decision, export receipt, and rollback handle.

## v6.6 Cloud Offload + Local Footprint Reduction

- [x] **CLOUDOFFLOAD-01**: Local-store inventory classifies each tracked store by permanence, source of truth, size, retention, privacy label, cloud target, and prune safety.
- [x] **CLOUDOFFLOAD-02**: SQLite operational state has an explicit managed persistence/sync target and is marked non-prunable until restore is proven.
- [x] **CLOUDOFFLOAD-03**: Heavy search/index workloads have remote qmd/search worker or managed-index targets, with local qmd cache marked rebuildable.
- [x] **CLOUDOFFLOAD-04**: Raw vault artifacts have encrypted object-storage target, hash verification, and rollback/replay guardrails before pruning.
- [x] **CLOUDOFFLOAD-05**: mem0, Qdrant, Neo4j, logs, replay queues, and checkpoints have cloud targets or retention/prune caps.
- [x] **CLOUDOFFLOAD-06**: NOC/API and CLI surfaces show local footprint, pressure, cloud targets, prune safety, and remaining local-only state.

## v5.0 Memory Trust + Operational Intelligence

- [x] **MEMSEC-01**: Raw evidence is stored in an append-only vault with hash verification, replay metadata, and admin list/replay APIs.
- [x] **MEMSEC-02**: Memory, audit, hive, and artifact records carry multi-dimensional security labels with fail-closed defaults.
- [x] **MEMSEC-03**: Ingestion uses a deterministic-first classification cascade with a human-review path for uncertain material.
- [x] **MEMSEC-04**: Recall, export, and dispatch paths enforce policy decisions before returning or transmitting memory data.
- [x] **MEMSEC-05**: Search/index projections are classification-aware and exclude material that is not approved for indexing.
- [x] **MEMSEC-06**: Multimodal/vector projections inherit source labels and preserve provenance back to raw artifacts.
- [x] **MEMSEC-07**: Sensitive raw artifacts and envelopes use managed encryption metadata with rotation-ready key identifiers.
- [x] **MEMSEC-08**: Security regression fixtures prove blocked recall/export/dispatch leak paths stay blocked.
- [x] **CTX-FOLLOWUP-03**: Privacy classification policy is codified as a deterministic cascade before LLM adjudication.
- [x] **NOC-08**: NOC governance strip derives live governance state from audit, orchestration, security, and escalation surfaces.

## v7.0 Client-Ready Security + Architecture Audit

### AUDIT — Domain Scanning

- [x] **AUDIT-01**: Security team can verify Auth & secrets domain was audited — covering hardcoded secrets, token handling, JWT security, API key exposure, session management, and cookie flags
- [x] **AUDIT-02**: Security team can verify API surface was audited — covering missing auth guards, input validation gaps, injection risks (SQLi, XSS, SSTI), rate limiting, and CORS configuration
- [x] **AUDIT-03**: Security team can verify Data & memory handling was audited — covering unsafe deserialization, data leakage paths, privacy exposure, unsafe file operations, and memory service access controls
- [x] **AUDIT-04**: Engineering team can verify Architecture & code quality was audited — covering dead code, circular dependencies, leaky abstractions, redundant patterns, unsafe TypeScript casts, and inconsistent error handling

### SEC — Security Remediation

- [x] **SEC-01**: All critical-severity security findings from the audit are fixed and verified
- [x] **SEC-02**: All high-severity security findings from the audit are fixed and verified
- [x] **SEC-03**: Medium-severity security findings are fixed or documented with accepted-risk rationale
- [x] **SEC-04**: `npm audit` and `pip-audit` report zero critical/high CVEs in dependencies; all fixable vulns patched
- [x] **SEC-05**: Codebase contains no hardcoded secrets, tokens, or credentials; git history clean of accidental secret commits
- [x] **SEC-06**: CI/CD security gates (secret-guard.yml, pre-commit hooks) are hardened and cannot be bypassed silently

### ARCH — Architecture Cleanup

- [x] **ARCH-01**: Dead code and unused exports are removed; no unreachable functions remain in core modules
- [x] **ARCH-02**: Module boundary violations resolved — no circular dependencies, no cross-layer leakage between services
- [x] **ARCH-03**: Redundant patterns consolidated — duplicate API clients, repeated utilities, copy-pasted logic replaced with shared implementations
- [x] **ARCH-04**: Consistent error handling enforced across all Next.js API routes and Python service endpoints
- [x] **ARCH-05**: TypeScript `any` types and unsafe casts eliminated from production code paths; strict mode violations resolved

### TEST — Validation

- [x] **TEST-01**: Full test suite (`npm test`, Python pytest) runs green after all security and architecture changes
- [x] **TEST-02**: Security regression tests added for each critical/high finding fixed — preventing reintroduction
- [x] **TEST-03**: Production build (`npm run build`) and typecheck (`npm run typecheck`) pass clean with zero errors

## v7.1 Competitive Retrieval Proof

- [x] **COMPETE-01**: Midbrain is represented in the marketplace benchmark inputs, generated results, `/vs` comparison pages, sitemap, LLM-readable docs, README, and benchmark methodology notes.
- [x] **COMPETE-02**: Public copy distinguishes MemRoOS's public-evidence architecture score from Midbrain SmartSearch retrieval metrics; no page compares those numbers as if they are the same benchmark.
- [x] **SITE-BENCH-01**: The public site has an include-ready benchmark block showing the generated marketplace ranking, Midbrain's `65.21` score, and a clear caveat that SmartSearch retrieval metrics are third-party paper results until rerun.
- [x] **BENCH-01**: Comparative benchmark plan defines three lanes: public-evidence architecture scoring, external retrieval-task scoring, and MemRoOS operational workflow scoring.
- [x] **BENCH-02**: External retrieval lane specifies LoCoMo / LongMemEval-style datasets or adapters, answer normalization, precision@k, recall@k, MRR, false-positive rate, p95 latency, token spend, and caveat reporting.
- [x] **BENCH-03**: Comparative retrieval harness has a concrete implementation path for LoCoMo, LongMemEval, and LongMemEval-V2-style tasks, including fixture ingestion, adapter contracts, scorer normalization, and report rendering.
- [x] **RETRIEVAL-01**: SmartSearch-inspired retrieval backlog covers deterministic entity extraction, entity expansion, tier fan-out, reranking, dedupe, score-adaptive context packing, and temporal caveat handling.
- [x] **RECEIPTS-01**: Retrieval receipts become public-facing product proof: retrieved, injected, ignored, score, tier, source, authorization result, and why the memory entered or missed the context pack.
- [x] **SEO-PROOF-01**: Public proof metrics render meaningful fallback text for crawlers and LLM fetchers without waiting for client-side counter animation.

## v7.2 Architecture Review Hardening

2026-06-19 progress:
- `ARCHREV-01`: handler-local operator guards now protect `/api/agent-checkpoints`, `/api/agent-checkpoints/metrics`, `/api/agents/versions`, `/api/agents/versions/promote`, `/api/agents/versions/rollback`, `/api/agent-memory/traces`, `/api/agent-runtime/observability`, `/api/hive` POST, and `/api/model-routing/telemetry` POST with direct non-local regression coverage.
- `ARCHREV-02`: `docs/architecture.md` now frames MemRoOS as an agent operating system with a broker kernel, shipped-domain module map, service/script boundaries, and placement rules for Next.js app, shared library, Python service, script, docs, and planning code.
- `ARCHREV-04`: runtime topology manifest now owns Docker service names, Docker port envs, Docker dependencies, health paths, manual-script port defaults, and launchd port defaults; `npm run check:runtime-topology` validates Docker compose, `start.sh`, and launchd artifacts against that manifest.
- `ARCHREV-05`: typed env validation now runs at Next instrumentation startup; `lib/env.ts` owns core app URLs, ports, paths, A2A settings, root config paths, embedding settings, and credential shape validation; server constants, A2A config, root config loaders, and embedding provider settings consume the typed module; root config status records `agents.config.json` as legacy compatibility state.
- `ARCHREV-06`: public eval contract slices complete for the route, TypeScript SDK, Python SDK, REST/OpenAPI discovery, MCP tool-schema export, A2A discovery, and shared contract-manifest drift gate: `/api/public/v1/traces` now uses a contract helper for `AgentEvalTrace` and `EvalSubmitResult`, emits `X-Memroos-Contract: public-eval-api.v1`, both SDKs have runtime response validation plus verified live smoke tests against a running app, `/api/public/v1/openapi` serves an OpenAPI 3.1 document from the shared route contract, the MCP facade exports `memroos-mcp-tools.v1` through `mcp_tool_contract` / `mcp://tools/contract`, `/api/a2a/openapi` serves `memroos-a2a.v1` for agent-card discovery plus JSON-RPC dispatch, and `npm run check:contracts` verifies app/SDK/MCP contract IDs plus shared response fields/task states against `contracts/memroos-contracts.json`.
- `ARCHREV-07`: `.github/workflows/ci.yml` now has `workflow_dispatch` and a daily schedule plus a dedicated `recall-canary` job. `npm run check:recall-canary` runs the memory recall scorer tests and executes the committed gold recall suite through `runMemoryRecallEvalSuite({ mode: "gold" })` against a temp SQLite DB, using the existing `evals/memory-recall/cases.json` thresholds as the regression gate.
- `ARCHREV-08`: `.planning/planning-history-retention.md` now decides the retention path before wider release: current docs stay, historical phase internals move to tracked archive when pruned, and screenshots/operational evidence require private-sibling relocation or explicit approval before public release.
- `ARCHREV-09`: `docs/next-trust-boundary-upgrade.md`, `npm run check:next-trust-boundary`, and CI now require reviewed Next/proxy markers plus proxy/auth regression coverage before framework upgrades or `proxy.ts` edits change the request trust boundary.
- `ARCHREV-01`: `npm run check:route-auth-boundary` now verifies every proxy route-local auth bypass pattern and proxy operator/admin route has handler-local auth evidence, plus focused non-local denial regression tests, before CI can pass. Marketing-app split remains a follow-on deployment decision rather than a blocker for the shared-app defense-in-depth gate.

- [x] **ARCHREV-01**: Route-level operator/agent auth wrappers protect privileged route groups inside handlers or factories so `proxy.ts` is not the only security boundary; marketing-app split remains a follow-on deployment decision.
  - 2026-06-27 progress: Added `scripts/check-route-auth-boundary.mjs`, checker tests, `npm run check:route-auth-boundary`, and a CI gate after lint. The gate validates proxy bypass coverage, proxy operator/admin route handler-auth markers, and the focused direct non-local denial regression suite.
- [x] **ARCHREV-02**: Architecture docs describe MemRoOS as an agent OS with a broker kernel, include a module map for shipped domains, and define placement rules for Next app vs. Python service vs. script.
- [x] **ARCHREV-03**: SQLite schema initialization runs through an ordered migration runner stamped with `PRAGMA user_version`; unstamped legacy DBs upgrade to the current version, future-version DBs fail closed, and default admin seeding completes synchronously before `getDb()` returns.
- [x] **ARCHREV-04**: A single runtime topology manifest names required services, ports, health checks, and supervision mode; `start.sh`, launchd installers, and Docker compose derive from or validate against that source.
  - 2026-06-19 progress: added shared JSON `runtime-topology` manifest plus standalone `check:runtime-topology` validation covering app, mem0, orchestration, voice, and agentmemory service ports, health checks, and supervision modes against current Docker/startup text.
  - 2026-06-19 progress: `start.sh` now derives its manual-script port defaults from `scripts/check-runtime-topology.mjs port ...`; environment overrides still win.
 - 2026-06-19 progress: `scripts/launchd-start.sh` now derives launchd app port defaults from the same checker after runtime env and Node path resolution; `PORT` and `MEMROOS_LAUNCHD_DEFAULT_PORT` overrides still win. Docker compose remains validated against the manifest, not generated from it yet.
- [x] **ARCHREV-05**: App configuration is validated through one typed env module at startup, with `process.env` reads centralized and legacy root config status reconciled.
  - 2026-06-27 progress: `validateMemroosEnvAtStartup()` runs from Next instrumentation before schedulers start. High-blast-radius config paths now read through `loadMemroosEnv()`: server constants, A2A config, knowledge collections, context sources, and embedding provider settings. Route-specific feature toggles, adapter credentials, subprocess env spreads, and tests remain explicit follow-up surface rather than hidden completion claims.
- [x] **ARCHREV-06**: API, A2A, REST shim, MCP, and SDK contracts have one generated or shared schema source plus an SDK smoke test against a running app.
  - 2026-06-27 progress: public eval v1, TypeScript SDK, Python SDK, REST/OpenAPI discovery, MCP tool-schema export, A2A OpenAPI discovery, and shared contract-manifest consolidation now have stable contract IDs, app-side runtime contract validation, SDK response validation, verified live SDK smokes against local running apps, tested OpenAPI 3.1 discovery routes, a tested `memroos-mcp-tools.v1` contract, a tested `memroos-a2a.v1` contract, and `contracts/memroos-contracts.json` with `npm run check:contracts` preventing app/SDK/MCP ID and core schema-field drift.
- [x] **ARCHREV-07**: Recall canary evaluation runs in CI or a scheduled workflow, using existing golden sets and recall thresholds as a regression gate.
  - 2026-06-27 progress: Added `npm run check:recall-canary`, a deterministic CI test that runs the committed gold recall eval suite against a temp SQLite DB and fails on existing recall/precision/MRR/latency thresholds; `.github/workflows/ci.yml` now exposes manual and daily scheduled runs plus a dedicated `recall-canary` job.
- [x] **ARCHREV-08**: Planning history retention is decided before wider release: prune to current-milestone public docs or move archival GSD screenshots/history to a private sibling repo.
- [x] **ARCHREV-09**: Next.js trust-boundary changes carry explicit proxy/auth regression coverage and a migration checklist before framework upgrades touch `proxy.ts`.
  - 2026-06-27 progress: Added `docs/next-trust-boundary-upgrade.md`, `scripts/check-next-trust-boundary.mjs`, checker tests, focused proxy adversarial coverage, `npm run check:next-trust-boundary`, and a CI gate after lint.

- [x] **ARCHREV-10**: Storage ingress applies PII detection and anonymization before memory payloads leave MemRoOS for mem0/vector storage; forwarded payloads carry non-sensitive metadata receipts with provider, entity types, count, redaction mode, and original content hash.

## v7.4 NOC Efficiency Telemetry

- [x] **EFFTEL-01**: Dispatch and context-pack assembly emit structured trace events (timestamp, agent id, retrieval query, source, tokens, whether result was used in first response) so NOC can compute "retrieval calls before useful work."
- [x] **EFFTEL-02**: Tool-call transcript captures per-tool read events with source identifier and hash so NOC can count repeated reads of the same source within a task window ("same-source re-read count").
- [x] **EFFTEL-03**: Model-routing layer emits token-level events distinguishing raw-context ingest tokens from processed/cached tokens so NOC can compute "raw-context ingest token share" as a percentage of total.
- [x] **EFFTEL-04**: Chat transcript and memory-hit correlation events link operator questions to prior memory hits so NOC can detect "operator re-ask redundancy" (re-asking something already answered from memory).
- [x] **EFFTEL-05**: Memory write events include provenance (source, first-seen timestamp, dedup hash) so NOC can detect "rediscovered-fact rate" (facts written to memory again after already existing).

## v7.5 Proactive Recollection Triggering

- [x] **RECOLLECT-01**: Runtime recollection policy decides, before `before_plan`, `before_tool_use`, and `before_final` gates, whether memory search is required or intentionally skipped; every decision emits a typed reason receipt.
- [x] **RECOLLECT-02**: Query planner derives bounded tier-aware recall queries from task text, entities, project/source refs, recency language, handoff state, and rediscovery risk, with explicit scope and limits.
- [x] **RECOLLECT-03**: Candidate ranking combines relevance, recency, importance/salience, source freshness, prior usefulness, and policy-risk penalties so recent context can surface without overriding older critical context.
- [x] **RECOLLECT-04**: Context-pack assembly injects only threshold-cleared memories and records retrieved, injected, ignored, skipped, score components, authorization result, and why each candidate entered or missed the pack.
- [x] **RECOLLECT-05**: Memory traces and recall evals cover proactive timing, old-critical vs recent-low-value conflicts, stale-source demotion, policy-denied candidates, operator re-ask reduction, and rediscovered-fact prevention.
- [x] **RECOLLECT-06**: Operator/NOC surfaces expose recent recollection decisions, skipped-search reasons, false-positive rate, and the downstream answer/tool step that used or ignored injected memory.
- [x] **RECOLLECT-07**: Recollection and context-pack receipts label each memory item by belief stage: bronze raw source snapshot, silver candidate claim, or gold admitted operational truth; agents may rely on gold directly, must caveat silver, and may use bronze only as source evidence unless promotion policy admits it.

## PROV Verifiable Action Provenance + Tamper-Evident Audit — COMPLETE (Phase 120-121)

*Source: 2026-07-01 external developer question (Arden) on crash-consistent, auditable "proof" linking agent output to consumed memories and tools. See ROADMAP.md Backlog item 18.*
*Implementation: `apps/memroos/src/lib/agent-checkpoints.ts` (commit `09b448f feat: add verifiable checkpoint provenance`). Verified 2026-07-06 by running `agent-checkpoints.test.ts` — all 5 tests green.*

- [x] **PROV-01**: Provenance is captured at the read/tool-call boundary (which memories were read, which tools/commands ran, with source id + hash) rather than self-reported by the agent at checkpoint time, so every output carries a verified set of consumed inputs.
  - Verified: `collectBoundaryProvenanceReceipts()` reads `efficiency_events` (`source_read`, `retrieval_trace`, `memory_write`); test asserts the agent-supplied `provenancePointers` string never reaches the receipt set.
- [x] **PROV-02**: The audit entry for a significant action is written inside the same database transaction as the action itself, so the action and its audit row commit or fail together and rows cannot be silently dropped; the current "audit never breaks the primary action" contract is preserved or explicitly redesigned.
  - Verified: `createAgentCheckpoint` wraps checkpoint INSERT + `insertCheckpointAuditEntry` in one `db.transaction()`; test "rolls back the checkpoint insert when the transactional audit write fails" passes.
- [x] **PROV-03**: Audit entries are hash-chained (each row references the prior row's hash) so tampering, deletion, or gaps in the trail are detectable, with a verification path that reports the first broken link.
  - Verified: `verifyCheckpointAuditChain()` recomputes `entryHash` and checks `previousEntryHash` linkage, returning `{firstBrokenEntryId, reason}`; test "detects a broken checkpoint audit chain row" passes.
- [x] **PROV-04**: On crash/restart, the resumed checkpoint plus the transactional audit chain reconstruct a verifiable trail with no unaccounted actions between the last checkpoint and the crash; verification work stays off the hot path and provenance receipts expose no raw sensitive payloads.
  - Verified: resume reconstructs `provenanceAudit` via `getCheckpointProvenanceAudit`; receipts expose only hashes (sourceId/sourceHash/evidenceHash), no raw content.

## MSIQ Microsoft IQ Competitive Adoption (Proposed)

*Source: 2026-07-05 Microsoft IQ feature adoption analysis — `content/research/microsoft-iq-feature-adoption-analysis.md` and `content/blog/memroos-vs-microsoft-iq.md`. Constraint: free/open-source only, zero paid services. See ROADMAP.md Backlog item 19. Note: MEMSEC-01..08 already cover labels + retrieval authorization for the memory tiers; MSIQ extends that model to the git-backed knowledge repo and adds ecosystem adapters.*

- [x] **MSIQ-01**: Knowledge-repo documents (`content/`) carry storage labels in frontmatter — `sensitivity` (public/internal/confidential/restricted), `authoritative` (operator-approved canonical flag), and freshness fields (`verified_at`, `expires_at`) — validated by the knowledge_write gatekeeper, mirroring the shipped MEMSEC-02 label schema so memory and knowledge use one vocabulary.
- [x] **MSIQ-02**: `knowledge_search` and `knowledge_read` enforce label-aware authorization per requesting agent identity (extending the MEMSEC-04 retrieval gate to the knowledge repo), with authorization results visible in retrieval receipts; default-open for unlabeled docs so single-operator deployments see no behavior change.
- [x] **MSIQ-03**: Retrieval ranking boosts `authoritative: true` documents and demotes expired ones (`expires_at` past), with a scheduled check that flags expired/unverified knowledge instead of relying on manual review.
- [x] **MSIQ-04**: A MemroOS memory adapter plus integration guide for self-hosted Microsoft Agent Framework (MIT) agents connects MAF apps to MemroOS via MCP for durable cross-session memory; no Foundry-hosted (paid) services in any default or documented path.
- [x] **MSIQ-05**: A federated retrieval planner fans one query across memory tiers, the knowledge repo, and operator-registered MCP sources, merging ranked results with per-source receipts; scope is capped at local tiers plus explicitly registered free-tier sources — no connector-breadth chase. *(Completed 2026-07-16: `apps/memroos/src/lib/federation/*` — source registry, budgets, merge, policy evaluator, retrieval executor, action bridge; Vitest suites green.)*
- [ ] **MSIQ-06**: Bounded GraphRAG (MIT) spike compares entity/relationship extraction over `content/` against the existing Graphify-style knowledge-graph plan (Backlog item 6); extraction runs incrementally on write through local models (Ollama) only — no metered LLM APIs, no dependency adoption, no production extraction path without Luis approval. *(Remains approval-gated — no GraphRAG spike without Luis approval.)*

## BELIEF Belief-Stage Promotion Pipeline (Proposed)

*Source: RECOLLECT-07 shipped the bronze/silver/gold labels on recollection receipts; the promotion machinery itself (Backlog item 9) is not built. ICP anchor: a Cordant-style GTM agent extracts "prospect signaled willingness to pay $X" from a meeting transcript — that claim must stay silver until reviewed, and outreach/CRM writeback may only use gold claims.*

- [x] **BELIEF-01**: A promotion pipeline moves memories bronze → silver → gold with explicit checks at each admission: provenance present, source freshness, policy/label clearance, conflict scan against existing gold, and dedupe — no silver-to-gold admission by LLM judgment alone.
- [x] **BELIEF-02**: Promotion decisions are auditable receipts (who/what promoted, checks passed, evidence pointers) and demotion exists: a gold fact whose source is invalidated or contradicted drops back to silver with a visible reason.
- [x] **BELIEF-03**: High-stakes claim categories (pricing/willingness-to-pay, product capability claims, legal/compliance statements, personal data) require human review for gold admission; category list is policy-configured, fail-closed for unlisted sensitive labels.
- [x] **BELIEF-04**: Outbound-facing generation paths (outreach drafts, CRM writeback, published docs) can be policy-restricted to gold-only claims, with silver usage forced to carry an inline caveat and bronze excluded except as cited evidence.
- [x] **BELIEF-05**: Phase 118 recall evals extend to promotion: unsupported candidate claims never surface as operational truth, contradicted gold is demoted within one promotion cycle, and receipts expose belief stage on every injected memory.

## GSDSTACK Agent OS Control Plane + Portable Skill Boundary (Proposed)

*Source: 2026-07-06 Mark Kashef full-channel transcript audit and stack prioritization (`content/research/mark-kashef-youtube-transcript-audit-2026-07-06.md`, `content/research/mark-kashef-agent-stack-prioritization-2026-07-06.md`). Decision: implement the stack through GSD as MemRoOS product substrate plus portable skills. Skills are for repeatable cross-runtime procedures; core product behavior is embedded when it needs shared state, schema, policy, audit, proof, or eval storage.*

- [x] **GSDSTACK-01**: A typed agent context packet endpoint/tool returns active goal, project/repo/client, constraints, relevant memories with provenance and belief stage, prior decisions, forbidden actions, required verification surface, approval requirements, source receipts, and resume marker; packet assembly emits included/denied/skipped/stale receipts with no raw sensitive payload leakage.
- [x] **GSDSTACK-02**: A canonical task/event/proof run ledger records or federates task, event, artifact, approval, cost, verification, and handoff rows from existing hive/checkpoint/evidence surfaces into one queryable model; noisy events have compaction/retention rules and every significant action remains auditable.
- [x] **GSDSTACK-03**: `/shipcheck` blocks completion until lane-specific proof exists for research, code, memory, deployment, email/doc, GTM, and safety tasks; bypass requires an explicit reason, actor, and receipt in the run ledger.
- [x] **GSDSTACK-04**: `/goal`, `/resume`, and `/standup` are backed by the context packet and run ledger: goals include acceptance criteria and verification requirements, resume reconstructs state without operator restatement, and standup reports active goals, blockers, recent proof, pending approvals, and next actions.
- [x] **GSDSTACK-05**: `/discuss` is a bounded council workflow, not an autonomous swarm: role definitions, task budget, shared context packet, verdict schema, validator pass, and ledgered outputs are required for every run.
- [x] **GSDSTACK-06**: A skill-boundary manifest classifies candidate capabilities as `core_product`, `portable_skill`, `adapter_skill`, `reference_only`, or `defer`, with rationale and owner. Core product surfaces include context packet, run ledger, proof gate, policy decisions, eval store, model-routing telemetry, audit chain, and adapter state; these cannot ship as skills-only.
- [x] **GSDSTACK-07**: `/skill-audit` reports missing owner, missing smoke test, stale review date, duplicate trigger, unsafe tool instructions, no examples, and no usage evidence across registered skills; it drafts SkillForge proposals for operator review and never auto-deletes.
- [x] **GSDSTACK-08**: Research, code, memory, handoff, GTM, and safety lanes each have committed eval fixtures, scoring rubrics, CI or scheduled execution, and ledger receipts for source coverage, proof compliance, recall provenance, resumability, claim grounding, and safety-gate outcomes.
- [x] **GSDSTACK-09**: Model routing starts as a static policy with logged overrides: cheap/local for extraction/classification/formatting, frontier for hard reasoning/final synthesis, private/customer-bound for sensitive data, vision for multimodal evidence, and validator models for high-risk review. Receipts record model, reason, estimate/actual cost, latency, and quality outcome.
- [x] **GSDSTACK-10**: Hermes, Discord/Telegram, Codex, Claude Code, and future UIs are thin adapters over the same MemRoOS contract: they may create tasks, request context, post proof, request standup/resume, and ask for approvals, but they do not own memory, task state, proof state, policy state, or model-routing decisions.
- [x] **GSDSTACK-11**: Adapter-triggered sends, writes, destructive actions, and memory persistence run through the first safety slice: secrets/PII scan, destructive-action approval, cost cap, and honest-degradation behavior. Shared/enterprise mode cannot silently fall back to local git corpus pulls or unlogged writes.

## v8.4 Project-Centric Operator UX (Complete 2026-07-08)

*Source: 2026-07-07 MemClaw (Felo-Inc) competitor gap analysis (`content/research/memclaw-gap-analysis-2026-07-07.md`). Decision: borrow MemClaw's operator-UX primitives — single-load workspace, declarative write rules + document directory, `is_shared` boolean, per-space cache transparency, save-artifact gate — but keep MemroOS governance (MEMSEC labels, belief stages, hash-chained audit) as first-class. MemClaw's hosted Felo API dependency and PPT generation are explicitly rejected per the zero-paid-services and self-host gates.*

- [x] **WORKLOAD-01**: An operator-facing `/load <space>` (or "load Client X") command primes the Agent Context Packet for the named space and binds it as the active workspace for all subsequent writes, reads, and the NOC/lane surfaces.
- [x] **WORKLOAD-02**: When a space is loaded, the active workspace is recorded in the run ledger as an event with actor, space id, and timestamp; the load is replayable from the ledger.
- [x] **WORKLOAD-03**: Adapter calls without an active workspace prompt the operator to select one (matches MemClaw's "There is no active project right now — which project do you want to operate on?"); the prompt is a single confirmation, not a recurring permission dialog.
- [x] **WORKLOAD-04**: Headless / non-interactive agent runs (no operator present) **fail closed**: no silent default workspace, no last-used-workspace fallback in shared/team mode; the load event references actor="system:headless" and a run-ledger reason.
- [x] **WORKLOAD-05**: Cross-space read is allowed but always policy-receipted; the loaded space is the **write target**, not the read universe; reads across spaces are surfaced in the run ledger.
- [x] **WRITERULES-01**: Each space has a declarative "Write Rules" table (data type → target document/resource) editable in the operator UI.
- [x] **WRITERULES-02**: The agent's memory adapter consults the Write Rules table before routing a save; mismatches are surfaced as receipts, not silently re-routed.
- [x] **WRITERULES-03**: Each space has a Document Directory (name + purpose + resource/artifact id) editable in the operator UI; this is the agent's and the operator's shared lookup table.
- [x] **WRITERULES-04**: Write Rules + Document Directory changes ship in the run ledger so the agent's view stays in sync with the operator's; stale rules trigger a drift receipt.
- [x] **WRITERULES-05**: Operator edits to Write Rules / Document Directory are **versioned + locked**; concurrent agent writes during an edit either wait or fail with a policy receipt (no silent overwrite, no race-condition loss).
- [x] **WRITERULES-06**: Write Rules are schema-validated (data type, target document, fallback rule); invalid rules are rejected at edit time with a structured error, not at write time with a silent reroute.
- [x] **SHAREDRO-01**: A single boolean `is_shared` flag on a space makes it read-only for all agents (no writes, no README updates, no document creation); the flag is enforced at **both** the retrieval gate (Phase 76, read-side) **and** the write-persistence gate (memory adapter write path, save-artifact path, README-update path, document-creation path), not as a UI-only toggle. The two enforcement points must agree and a single source of truth (the space record) drives both.
- [x] **SHAREDRO-02**: The `is_shared` flag is policy-receipted: every read or attempted write produces a receipt that references the flag and the space id, so the audit chain explains why a write was blocked.
- [x] **SHAREDRO-03**: Operator UI shows a single "Share read-only" toggle per space; toggling emits a run-ledger event with actor and timestamp; toggling off requires a policy reason.
- [x] **CACHEADMIN-01**: Each space exposes its current cache state (per-resource last-fetched timestamp, total cached size, retrieval count) in the operator UI.
- [x] **CACHEADMIN-02**: Operator can invalidate a single resource cache or the whole space cache; invalidation emits a run-ledger event.
- [x] **CACHEADMIN-03**: Cache invalidation respects MEMSEC labels and the `is_shared` flag; shared read-only spaces expose invalidate-from-source only with a policy receipt.
- [x] **CACHEADMIN-04**: Thundering-herd protection: cache invalidation is rate-limited and bounded per space; concurrent invalidations for the same resource coalesce into a single event; an invalidation loop (operator action repeated >N times in <T) emits a rate-limit receipt.
- [x] **CACHEADMIN-05**: Invalidation events are queryable from the run ledger (who invalidated what, when, why) and are surfaced in the NOC governance strip.
- [x] **ARTGATE-01**: When the agent produces a long-form artifact (report, document, deck) for a loaded space, the operator gets a single "Save to <space>?" prompt — no recurring permission dialog.
- [x] **ARTGATE-02**: On save, the agent appends the artifact to the Document Directory (or creates a new document) and emits a run-ledger event with the resource id and belief stage.
- [x] **ARTGATE-03**: On save, the agent updates the space README's "Last artifact" pointer in the Document Directory; the operator can disable auto-update per-space; auto-updates are policy-receipted.

## v8.5 Agent Fleet Plane (COMPLETE — 2026-07-10)

*Source: 2026-07-08 Discord #devops "Agent fleet control tooling research". Decision: MemroOS is the top-layer fleet plane that manages agents directly across runtimes; LangGraph is a peer orchestration runtime (already under Orchestration Proxy); Paperclip is a parallel tenant (companies/budgets/board), not the top layer. Rejected: LangGraph-as-control-plane, Archestra default (AGPL), CrewAI ACP (cloud), "Gardner" (no OSS match), cloud-only AgentCore/Foundry/Vertex as substitutes. Scenario S12. Kickoff: `.planning/milestones/v8.5-agent-fleet-plane-KICKOFF.md`. Shipped Phases 142–147; ROADMAP/STATE locked 2026-07-10. Closeout notes added 2026-07-16 (FLEET-01..12 were still unchecked despite milestone COMPLETE).*

### Architecture lock + validation

- [x] **FLEET-01**: Product architecture docs state MemroOS as top fleet plane, LangGraph as peer orchestration runtime, and Paperclip as parallel tenant — in language an operator can quote without reading research dumps. *(Completed 2026-07-09 — Phase 142; `docs/architecture.md` Fleet plane subsection + `content/architecture/memroos-as-agent-fleet-plane-2026-07-08.md`.)*
- [x] **FLEET-02**: Independent second-opinion validation of the fleet architecture is filed with provenance `model:` not equal to the authoring model (MiniMax-M3); amend loop opens on reject. *(Completed 2026-07-09 — Phase 142; GLM-5.2 PASS at `content/architecture/memroos-fleet-plane-validation-glm52-2026-07-09.md`.)*
- [x] **FLEET-03**: Scenario **S12** (multi-machine Mac + remote Hermes/OpenClaw under one MemroOS operator, Paperclip optional company budgets) is recorded in roadmap backlog and used as phase acceptance context. *(Completed 2026-07-09 — Phase 142; S12 in ROADMAP v8.5 + backlog.)*
- [x] **FLEET-04**: Planning research index points at architecture decision, OSS control-plane survey, and Paperclip audit under `content/`. *(Completed 2026-07-09 — Phase 142; `.planning/research/agent-fleet-plane-2026-07-08.md`.)*

### Runtime adapter maturity

- [x] **FLEET-05**: Every target of `scripts/install-agent-integrations.sh` appears in `docs/runtime-adapter-maturity.md` with T1/T2/T3 classification, evidence, and owner. *(Completed 2026-07-09 — Phase 143; nine-target matrix.)*
- [x] **FLEET-06**: T1 means shipped + smoke-tested + governance-hook path available; T3 is explicitly stub/unproven (no silent promotion). *(Completed 2026-07-09 — Phase 143; T1/T2/T3 definitions in maturity matrix.)*
- [x] **FLEET-07**: Hermes and OpenClaw maturity claims cite real adapter evidence (MemroOS and/or Paperclip `hermes_local` / `hermes_gateway` / `openclaw-gateway`). *(Completed 2026-07-09 — Phase 143; Hermes T1 / OpenClaw T2 with Paperclip adapter cites.)*
- [x] **FLEET-08**: Installer target list and maturity matrix cannot silently drift (documented check or CI note). *(Completed 2026-07-09 — Phase 143; "Maturity drift check" section in matrix doc.)*

### LangGraph peer contract

- [x] **FLEET-09**: `docs/integrations/langgraph.md` documents input/output schema, checkpoint store layout, HIL interrupt protocol, and failure modes. *(Completed 2026-07-09 — Phase 144; peer contract pinned in langgraph.md.)*
- [x] **FLEET-10**: Ownership split is explicit: MemroOS owns agent identity, memory routing, audit; LangGraph owns graph execution and checkpoints (no StateGraph reimplementation in Next routes). *(Completed 2026-07-09 — Phase 144; ownership tables in langgraph.md + architecture.md.)*
- [x] **FLEET-11**: Checkpoint durability path exists (litestream **or** Postgres checkpointer behind flag) with restore steps written. *(Completed 2026-07-09 — Phase 144; `services/orchestration/litestream.yml.example` + restore docs.)*
- [x] **FLEET-12**: One multi-step graph smoke proves interrupt → resume with an operator-visible receipt. *(Completed 2026-07-09 — Phase 144; `services/orchestration/tests/test_hil_checkpoint_smoke.py`.)*

### Pre-execution policy gate

- [x] **FLEET-13**: A pre-execution policy gate evaluates actor/action/purpose/labels **before** tool execution on at least one T1 runtime path. *(Completed 2026-07-09 — Phase 145; see `145-01-SUMMARY.md`.)*
- [x] **FLEET-14**: Deny blocks execution and emits a policy receipt (policy version, rule, reason) into audit/run ledger. *(Completed 2026-07-09 — Phase 145.)*
- [x] **FLEET-15**: Headless runs fail closed on the gate (no silent allow / last-used bypass). *(Completed 2026-07-09 — Phase 145.)*
- [x] **FLEET-16**: MEMSEC-08 security regression corpus remains green after gate wiring. *(Completed 2026-07-09 — Phase 145; 25/25 green.)*

### Paperclip tenant + cost delegation

- [x] **FLEET-17**: `docs/integrations/paperclip.md` states ownership boundaries: Paperclip owns companies/issues/budgets/board; MemroOS owns cross-runtime registry/memory/fleet governance. *(Completed 2026-07-09 — Phase 146; see `146-01-SUMMARY.md`.)*
- [x] **FLEET-18**: At least one integration path exists (contract-tested or live): Paperclip activity → MemroOS visibility **or** MemroOS incident → Paperclip issue. *(Completed 2026-07-09 — Phase 146.)*
- [x] **FLEET-19**: Fleet cost/budget hard-stop is **delegated to Paperclip** (source of truth documented); MemroOS does not re-implement monthly hard-stop auto-pause. *(Completed 2026-07-09 — Phase 146.)*
- [x] **FLEET-20**: Multi-Paperclip server federation is explicitly out of scope and documented as Paperclip V1 exclusion. *(Completed 2026-07-09 — Phase 146.)*
- [x] **FLEET-21**: Passive Hermes/OpenClaw adapter behavior is documented (runtime must already exist; Paperclip does not provision agent hosts). *(Completed 2026-07-09 — Phase 146.)*

### Secrets + HA

- [x] **FLEET-22**: Adapter API keys have a documented secrets path (broker/rotation); secrets never land in git or audit receipts. *(Completed 2026-07-10 — Phase 147; `docs/secrets-and-durability.md`.)*
- [x] **FLEET-23**: MemroOS kernel durability path (litestream or Postgres) is documented with one executed restore drill. *(Completed 2026-07-10 — Phase 147; `scripts/restore-drill.sh`.)*
- [x] **FLEET-24**: LangGraph checkpoint durability is aligned with FLEET-11. *(Completed 2026-07-10 — Phase 147; aligned with Phase 144 litestream path.)*
- [x] **FLEET-25**: Stretch multi-machine identity (SPIFFE/SPIRE, Envoy ratelimit for 50-host fleets) is documented as **not v8.5**. *(Completed 2026-07-10 — Phase 147.)*
- [x] **FLEET-26**: Auto-provision of new agent hosts on demand remains explicitly out of scope (industry gap; none of Paperclip/LangGraph/Archestra own it cleanly). *(Completed 2026-07-10 — Phase 147.)*

## ONTO Governed Emergent Ontology (Proposed)

*Source: operator question "how to manage the ontology" (2026-07-06). Decision: neither a hand-authored heavyweight ontology nor a fully emergent one — a small fixed upper ontology, an emergent extracted layer, and SEAL-governed promotion between them. Cordant's GTM data objects (Account, Contact, Complexity Signal, Relationship Path, Dossier, Meeting Learning) are the first domain instantiation.*

- [x] **ONTO-01**: A versioned upper ontology (~12-15 core types: Person, Organization/Account, Team, Agent, Skill, Tool, Project, Task, Event/Meeting, Source/Document, Claim, Decision, Policy, Relationship-Path) lives in git as the single shared vocabulary, mirrored into Neo4j labels, knowledge frontmatter fields, and memory-tier metadata.
- [x] **ONTO-02**: Domain schemas (e.g. GTM: Segment, Complexity Signal, Dossier) extend the upper ontology in namespaced packs; a tenant/project can enable a domain pack without forking core types. *(Completed 2026-07-16: `pack-contract.ts` + registry packs under `apps/memroos/src/lib/ontology/`; registry Vitest green.)*
- [x] **ONTO-03**: Extraction (local-model GraphRAG per MSIQ-06 or existing pipelines) may propose new entity/relation types only as candidates tagged EXTRACTED/INFERRED/AMBIGUOUS; candidate types are bronze/silver vocabulary — retrievable with caveats, never authorization-bearing. *(Completed 2026-07-16: `candidates.ts` provenanceTag mapped from confidence; never auth-bearing; candidates-governance + receipt-types tests green.)*
- [x] **ONTO-04**: Candidate type/relation promotion into a domain pack goes through the SEAL proposal lifecycle: operator approval, recall/precision non-regression eval, and a migration entry; renames are alias-based, never destructive. *(Completed 2026-07-16: `promoteOntologyCandidate` requires approved SEAL proposal + decision; candidates-governance VAL-ONTO-014..016.)*
- [x] **ONTO-05**: Ontology versions are migration-managed like the SQLite schema (`PRAGMA user_version` pattern): every stored entity records the ontology version it was written under, and queries resolve aliases across versions. *(Completed 2026-07-16: `migrations.ts` + `aliases.ts`; VAL-ONTO-017..025.)*
- [x] **ONTO-06**: Retrieval, policy, and belief-stage receipts reference ontology types (e.g. "this is a gold Claim about an Account"), so authorization and promotion rules can be written per-type instead of per-record. *(Completed 2026-07-16: `ontology/receipt-types.ts` + typed fields on PolicyReceipt / PromotionReceiptSummary / OutboundReceipt / RecollectionTraceReceipt; focused receipt-types tests green.)*

## POLGOV Policy-as-Code Governance Plane (Proposed)

*Source: gate logic is currently scattered — MEMSEC retrieval gate, capability policy, knowledge_policy_check, dispatch fail-closed rules. At 100-person scale (many teams, many agents) policy must be one declarative, testable layer. Local/OSS engines only (OPA/Cedar-class or in-repo), zero paid services.*

- [x] **POLGOV-01**: A single declarative policy layer evaluates retrieval, memory write/promotion, knowledge read/write, skill dispatch, and A2A/tool capability decisions, replacing scattered per-route logic; policies are versioned files in git with review history.
- [x] **POLGOV-02**: Every policy decision emits a receipt (policy version, rule matched, allow/deny/redact, reason) that lands in the evidence bundle and audit chain; agents see deny reasons without seeing the withheld content.
- [x] **POLGOV-03**: Policies support subject (user/team/agent/role), object (ontology type + labels + belief stage), action, and purpose dimensions — e.g. "GTM agents may read confidential Account claims for purpose=meeting-prep but not export them."
- [x] **POLGOV-04**: A shadow/dry-run mode evaluates a proposed policy version against recent live decisions and reports the diff (newly denied / newly allowed) before activation; activation is operator-gated.
- [x] **POLGOV-05**: Policy regression tests run in CI: a committed corpus of decision cases (including MEMSEC-08 leak-prevention cases) must produce identical or explicitly-approved-different outcomes on every policy change.

## TEAMSCALE Multi-Team Organizational Scale (Proposed)

*Source: ICP is an agentic-heavy company growing to ~100 people (Cordant.ai reference). Current model is single-operator-plus-agents; the ICP needs teams, spaces, and joiner/mover/leaver flows for humans AND their agents.*

- [x] **TEAMSCALE-01**: Memory and knowledge support team/space scoping (e.g. GTM, Product, Finance) layered on the existing label model: a space defines default labels, membership (humans + agents), and cross-space sharing rules; per-space recall works with no cross-space leakage by default.
- [x] **TEAMSCALE-02**: Joiner flow: onboarding a new person (e.g. a fractional seller) provisions their identity, role, space memberships, and a standard agent kit (scoped keys, allowed skills, context pack) in one operator action, with an onboarding receipt listing exactly what was granted.
- [x] **TEAMSCALE-03**: Mover/leaver flow: role change or offboarding revokes human and dependent-agent credentials atomically, reassigns owned artifacts, and triggers a MEMLIFE erasure/retention review for their personal data; no orphaned agent identities with live keys.
- [x] **TEAMSCALE-04**: Delegation chains are explicit: an agent acting for a user carries the user's identity in a verifiable chain (user → agent → sub-agent), and policy evaluates the weakest link; A2A hops preserve the chain.
- [x] **TEAMSCALE-05**: Org-level observability: per-team NOC views of memory growth, promotion queue depth, policy denials, skill usage, and agent activity, so a 100-person org can see which teams' memory is healthy, stale, or leaking effort.
- [x] **TEAMSCALE-06**: Relationship-sensitive assets (e.g. investor/warm-intro graphs in the Cordant scenario) support named-owner approval gates: any agent use of the asset requires the owner's standing or per-use approval, enforced by POLGOV and visible in receipts.

## SKILLTRUST Skill Trust Chain — COMPLETE (Phases 148–150)

*Source: SkillForge governs skill optimization, and the marketplace distributes skills, but imported/synced skills are trusted on import. Skills are executable instructions — at ICP scale they need supply-chain treatment. Promotes the "governed skill contracts" and "cross-harness skill auto-sync" Later Ideas.*

*Completion note (2026-07-16): Product code already shipped (`registry.ts`, `skill-signing.ts`, `skill-quarantine.ts`, `skill-sync*.ts`, `skill-lifecycle.ts`, `skill-dependencies.ts`, APIs under `apps/memroos/src/app/api/skills/`). Planning dirs were missing because code landed without GSD closeout; closed with SUMMARY + VERIFICATION under phases 148–150. Skill Vitest suites green (237 passed on 2026-07-16).*

- [x] **SKILLTRUST-01**: Every registered skill carries a contract: preconditions, allowed tools, risk tier, verification checks, owner, rollback behavior, and evidence examples; dispatch remains fail-closed on incomplete contracts (extends the shipped completeness gate). *(Completed 2026-07-16 — Phase 148; `registry.ts` + contract gate.)*
- [x] **SKILLTRUST-02**: Skills are content-hashed and signed at publish/import; the registry records provenance (author, source harness/marketplace, signature) and dispatch can be policy-restricted to signed skills above a trust threshold. *(Completed 2026-07-16 — Phase 148; `skill-signing.ts` + `/api/skills/sign|verify`.)*
- [x] **SKILLTRUST-03**: Imported/marketplace skills run a quarantine lane before enablement: injection/scanner pass, sandboxed eval against the skill's declared verification checks, and operator approval — no direct-to-enabled imports. *(Completed 2026-07-16 — Phase 149; `skill-quarantine.ts` + `/api/skills/quarantine/*`.)*
- [x] **SKILLTRUST-04**: Cross-harness auto-sync (Claude Code, Codex, Hermes, OpenCode dirs) becomes governed: detected skill changes arrive as import proposals with diffs, not silent updates; version pinning per agent with one-step rollback. *(Completed 2026-07-16 — Phase 149; `skill-sync.ts` / `skill-sync-governance.ts` + sync/pins APIs.)*
- [x] **SKILLTRUST-05**: Skill lifecycle states (draft, enabled, deprecated, retired) with deprecation warnings surfaced to dependent agents, a dependency view of which agents/workflows use which skill versions, and audit on every state change. *(Completed 2026-07-16 — Phase 150; `skill-lifecycle.ts` + `skill-dependencies.ts` + `/api/skills/lifecycle`.)*

## ORCH-FOLLOWUP — Phase 70 Multi-hop Compensation Closure

*Source: `.planning/phases/70-foundation-engine-core/deferred-items.md`; ROADMAP Future Milestone Priority item 14 / v8.8 Orchestration Evidence Depth.*

*Completion note (2026-07-16): Residual ORCH-FOLLOWUP-01 gaps for A2A compensate dispatch + `attempts_per_hop` tracking closed in `services/orchestration/` without requiring a live LangGraph runtime for unit proof.*

- [x] **ORCH-FOLLOWUP-01**: Rollback compensation dispatches a `requiredCapability="compensate"` A2A task (local receipt or injected transport) when the agent exposes compensate capability; agents without that capability yield an honest `compensation_skipped` row. Per-hop retry counts are recorded in lineage `detail_json["attempts_per_hop"]` keyed by hop lineage id, distinct from `orchestration_runs.attempts`. Multi-hop plan compensation records `compensation_dispatched` before `compensation_committed` when a compensate target exists. *(Completed 2026-07-16 — DEFERRED-70-03-C/D; tests in `services/orchestration/tests/test_engine.py` + `test_multihop.py`.)*

## MEMLIFE Memory Lifecycle, Retention + Erasure (Proposed)

*Source: a governed store must forget as reliably as it remembers. Embeddings, graph nodes, FTS rows, and qmd projections all copy data — erasure must chase every derivative. ICP anchor: a contractor offboards, or a prospect requests data deletion.*

- [x] **MEMLIFE-01**: Retention policies per ontology type + label (e.g. meeting transcripts 24 months, personal contact data until offboarding + 30 days), with scheduled enforcement, legal-hold override, and receipts for every expiry action. *(Completed 2026-07-16: policies + legal holds + receipted `runRetentionExpiry`; hourly in-process scheduler + cron registry `memory-retention-expiry` + `npm run retention:expiry` / POST `/api/memory-lifecycle/expiry`.)*
- [x] **MEMLIFE-02**: Verified erasure: deleting a memory/entity purges or provably tombstones every derivative — vector points, graph nodes/edges, FTS rows, qmd index entries, caches, and context-pack snapshots — with an erasure report listing each store touched. *(Completed 2026-07-16: real adapters for vector/embeddings/fts/message/salience/cache/context/candidates/platform/vault/qmd/federation; Neo4j graph best-effort with honest `unavailable` receipts when not configured/down. Distinct from Phase 127 `erasure_tombstones`.)*
- [x] **MEMLIFE-03**: Subject-scoped erasure: "erase person X" resolves via the ontology to all Claims/Events/Contacts referencing X across tiers, producing a reviewable erasure plan before execution (GDPR/CCPA data-subject shape). *(Completed 2026-07-16: `subject-erasure.ts` + `/api/memory-lifecycle/subject-erasure` + subject-erasure Vitest.)*
- [x] **MEMLIFE-04**: Decay + consolidation: low-salience episodic memories age into summarized semantic form on a schedule, with the original moved to the raw vault (not silently dropped) and consolidation receipts linking summary to sources. *(Completed 2026-07-16: `memory/consolidation.ts`, `memory-decay.ts`, APIs under `/api/memory-lifecycle/`, in-process schedulers + cron registry `memory-decay` / `memory-consolidation`; Vitest green.)*
- [x] **MEMLIFE-05**: Tombstones preserve audit integrity: erasure never breaks the hash chain or evidence bundles — receipts retain non-sensitive pointers ("a record existed and was erased under policy P") without the erased content. *(Completed 2026-07-16: `memory_tombstones` / erasure tombstones + `writeChainedMemoryAuditEntry` memory-chain + vault-durability; offboarding VAL-MEM-030 + vault-durability Vitest.)*

## ENTOPS Enterprise Operator Control Plane (Proposed)

*Source: 2026-07-06 adversarial enterprise review of the native-memory stub pattern (GPT-5.5xhigh + Claude consensus) — `content/research/memroos-enterprise-review-2026-07-06.md`. Finding: the per-laptop MCP launcher, single shared vault, per-user deletable audit JSONL, and git fallback fail the 10-100 person ICP on day one (SPOF, exfiltration vector, SOC2 tenancy collapse, broken Day-1 onboarding). Verdict: ship-modified, two SKUs — Free Solo (local MCP, git fallback OK) and Enterprise (operator-only). Governance logic (BELIEF/POLGOV/TEAMSCALE) is necessary but not sufficient without this substrate.*

- [x] **ENTOPS-01**: A repeatable committed load-test harness proves the hosted operator sustains 100 simulated agents at 1,000 knowledge writes/hour with p95 `knowledge_write` latency < 500ms and error rate < 0.1%; enterprise-readiness claims and SKU work are gated on this passing.
- [x] **ENTOPS-02**: The operator provides per-tenant and per-user vault isolation with team ACL groups; cross-user search only within policy scope; the per-laptop SQLite/bash-launcher mode remains supported solo-only behind a `--local` flag and is never the shared-team path.
- [x] **ENTOPS-03**: Every knowledge read/write on the operator is audited centrally with tenant/user/agent identity — not user-deletable laptop JSONL — exportable to SIEM, and answers "show every artifact user X wrote in Q3" in one query; central audit reuses the PROV hash-chain pattern for tamper evidence.
- [ ] **ENTOPS-04**: The installer defaults to operator-stub mode (`MEMROOS_OPERATOR_URL` + IdP/OAuth device-flow auth); git fallback is disabled in shared/enterprise mode (retained solo-only) — on MCP outage agents degrade honestly rather than pulling the corpus to laptops. *(Code slice 2026-07-16: operator-stub installer + no clone fallback + `--local`; IdP/OAuth device-flow still open — `docs/entops-stub-handoff.md`.)*
- [ ] **ENTOPS-05**: Day-1 self-bootstrap onboarding works without operator intervention: invite-token flow, MDM-deployable installer verified on a locked-down corporate Mac without admin rights, and a first-day verification script; a new hire's agents receive their directives before any human touches their machine. *(Code slice 2026-07-16: `verify-first-day-onboarding.sh` shipped; MDM/locked-down Mac/S9 still open — `docs/entops-stub-handoff.md`.)*
- [x] **ENTOPS-06**: Native-memory directive budgets are per-tenant configuration (default 200 lines, overridable via admin endpoint for compliance-heavy teams); enforcement is warn + diff-against-canonical, never auto-trim — no path silently deletes user memory content.
- [ ] **ENTOPS-07**: Native-memory files become an output of MemroOS sync, not an input: harness auto-memory writes route to MemRoOS first, are filtered/sanitized, then replayed into local files under the server-enforced budget; drift detection (`directive_diff`) alerts and never deletes; Hermes MEMORY.md keeps its skills-routing layer intact (stub the directive body only). *(Partial 2026-07-16: operator sink + **Hermes opt-in observe provider** — built-in MEMORY.md stays primary; MemRoOS mirrors when `memory.provider: memroos`. No MEMORY.md rewrite. Claude/Codex still unwired. Docs: `docs/integrations/hermes-memory-dual-mode.md`.)*
- [x] **ENTOPS-08**: An exit tool (`memroos export --flat`) produces a markdown tarball of the org vault with a signed manifest, plus per-user DSAR export (vault + audit trail) and right-to-delete tombstoning within the compliance window (executes via MEMLIFE erasure semantics). *(Completed 2026-07-16: CLI + DSAR APIs + `erasure_tombstones` v30; full MEMLIFE derivative purge still later — tombstone markers only.)*

---

## Future Requirements (Bounded Spikes Complete; Adoption Deferred)

- [x] **MEMGEN-FOLLOWUP-02**: Bounded Memento memory-save quality spike completed in `.planning/spikes/2026-06-27-memento-memory-save-quality.md`; no dependency adoption, backend swap, or hosted/private trace upload approved.
- [x] **COCOINDEX-FOLLOWUP-01**: Bounded CocoIndex source-freshness spike completed in `.planning/spikes/2026-06-27-cocoindex-source-freshness.md`; no dependency adoption, production index path, policy bypass, raw sensitive corpus indexing, or memory-backend replacement approved.
- [x] **FASTCONTEXT-FOLLOWUP-01**: Bounded FastContext repo-scout spike completed in `.planning/spikes/2026-06-27-fastcontext-repo-scout.md`; no runtime dependency, hosted/private repo upload, GitNexus replacement, or automatic code-edit path approved.
- [x] **ADKA2A-FOLLOWUP-01**: Bounded ADK/A2A contract-compliance spike completed in `.planning/spikes/2026-06-27-adk-a2a-contract-compliance.md`; no ADK/Gemini core dependency, app copy, compliance-vertical claim, or runtime replacement approved.
- [x] **QDRANT-FOLLOWUP-01**: Bounded Qdrant Cloud upgrade-readiness spike completed in `.planning/spikes/2026-06-27-qdrant-cloud-upgrade-readiness.md`; no local Qdrant, backend swap, vector rewrite, TurboQuant/named-vector migration, or production cluster upgrade approved.
- [x] **HYPEREXTRACT-FOLLOWUP-01**: Bounded Hyper-Extract structured-memory spike completed in `.planning/spikes/2026-06-27-hyperextract-structured-memory.md`; no dependency adoption, production ingestion path, private-document upload, storage-layer replacement, or default extraction pipeline approved.
- [x] **GRAPHGUIDE-FOLLOWUP-01**: Bounded Anthropic Knowledge Graph cookbook spike completed in `.planning/spikes/2026-07-23-knowledge-graph-cookbook-spike.md`; no dependency adoption, storage-backend swap, MCP gatekeeper bypass, hosted corpus upload, or "shared memory for agents" parity claim approved.
- [x] **SIMPLIFY-FOLLOWUP-01**: Bounded simplify-code four-altitude / architecture-reviewer claim spike completed in `.planning/spikes/2026-07-24-simplify-code-four-altitude-claim.md`; no new architecture reviewer added to `simplify-code`, no fan-out beyond the existing three reviewers, no rewrite of the Reuse/Quality/Efficiency coverage model, and no claim that the skill currently ships a 4th architecture reviewer approved.
- Automated DAST scanning in CI pipeline (post-audit baseline needed first)
- Penetration test by external firm (after internal audit complete)
- SOC 2 Type II controls mapping (separate compliance milestone)

---

## Out of Scope

- New feature development (this milestone is hardening-only)
- UI/UX changes not related to security fixes
- Performance optimization beyond removing dead code overhead
- Database schema migrations

---

## Traceability

| REQ-ID | Phase | Status |
|--------|-------|--------|
| PERF-EVID-01 | 175 | Planned |
| PERF-EVID-02 | 175 | Planned |
| PERF-EVID-03 | 175 | Planned |
| PERF-EVID-04 | 175 | Planned |
| SKILLOPT-HARDEN-01 | 106 | Complete |
| SKILLOPT-HARDEN-02 | 106 | Complete |
| SKILLOPT-HARDEN-03 | 106 | Complete |
| SKILLOPT-HARDEN-04 | 106 | Complete |
| SKILLOPT-HARDEN-05 | 106 | Complete |
| CLOUDOFFLOAD-01 | 108 | Complete |
| CLOUDOFFLOAD-02 | 108 | Complete |
| CLOUDOFFLOAD-03 | 108 | Complete |
| CLOUDOFFLOAD-04 | 108 | Complete |
| CLOUDOFFLOAD-05 | 108 | Complete |
| CLOUDOFFLOAD-06 | 108 | Complete |
| MEMSEC-01 | 74 | Complete |
| MEMSEC-02 | 74 | Complete |
| MEMSEC-03 | 75 | Complete |
| MEMSEC-04 | 76 | Complete |
| MEMSEC-05 | 77 | Complete |
| MEMSEC-06 | 77 | Complete |
| MEMSEC-07 | 77 | Complete |
| MEMSEC-08 | 78 | Complete |
| CTX-FOLLOWUP-03 | 75 | Complete |
| NOC-08 | 79 | Complete |
| AUDIT-01 | 109 | Complete |
| AUDIT-02 | 109 | Complete |
| AUDIT-03 | 109 | Complete |
| AUDIT-04 | 109 | Complete |
| SEC-01 | 110 | Complete |
| SEC-02 | 110 | Complete |
| SEC-03 | 111 | Complete |
| SEC-04 | 111 | Complete |
| SEC-05 | 110 | Complete |
| SEC-06 | 111 | Complete |
| ARCH-01 | 112 | Complete |
| ARCH-02 | 112 | Complete |
| ARCH-03 | 112 | Complete |
| ARCH-04 | 112 | Complete |
| ARCH-05 | 112 | Complete |
| TEST-01 | 113 | Complete |
| TEST-02 | 110–112 | Complete |
| TEST-03 | 113 | Complete |
| COMPETE-01 | 114 | Done |
| COMPETE-02 | 114 | Done |
| SITE-BENCH-01 | 114 | Done |
| BENCH-01 | 114 | Done |
| BENCH-02 | 114 | Done |
| BENCH-03 | 114 | Done |
| RETRIEVAL-01 | 114 | Done |
| RECEIPTS-01 | 114 | Done |
| SEO-PROOF-01 | 114 | Done |
| ARCHREV-01 | 115 | Complete |
| ARCHREV-02 | 115 | Complete |
| ARCHREV-03 | 115 | Complete |
| ARCHREV-04 | 115 | Complete |
| ARCHREV-05 | 115 | Complete |
| ARCHREV-06 | 115 | Complete |
| ARCHREV-07 | 115 | Complete |
| ARCHREV-08 | 115 | Complete |
| ARCHREV-09 | 115 | Complete |
| ARCHREV-10 | 115 | Complete |
| MEMGEN-FOLLOWUP-02 | 119 | Complete bounded spike; adoption deferred |
| COCOINDEX-FOLLOWUP-01 | 119 | Complete bounded spike; adoption deferred |
| FASTCONTEXT-FOLLOWUP-01 | 119 | Complete bounded spike; adoption deferred |
| ADKA2A-FOLLOWUP-01 | 119 | Complete bounded spike; adoption deferred |
| QDRANT-FOLLOWUP-01 | 119 | Complete bounded spike; adoption deferred |
| HYPEREXTRACT-FOLLOWUP-01 | 119 | Complete bounded spike; adoption deferred |
| GRAPHGUIDE-FOLLOWUP-01 | 119 | Complete bounded spike; adoption deferred |
| SIMPLIFY-FOLLOWUP-01 | 119 | Complete bounded spike; adoption deferred |
| EFFTEL-01 | 117 | Done |
| EFFTEL-02 | 117 | Done |
| EFFTEL-03 | 117 | Done |
| EFFTEL-04 | 117 | Done |
| EFFTEL-05 | 117 | Done |
| RECOLLECT-01 | 118 | Done |
| RECOLLECT-02 | 118 | Done |
| RECOLLECT-03 | 118 | Done |
| RECOLLECT-04 | 118 | Done |
| RECOLLECT-05 | 118 | Done |
| RECOLLECT-06 | 118 | Done |
| RECOLLECT-07 | 118 | Done |
| GSDSTACK-01 | 132 | Done |
| GSDSTACK-02 | 132 | Done |
| GSDSTACK-03 | 133 | Done |
| GSDSTACK-04 | 133 | Done |
| GSDSTACK-05 | 134 | Complete |
| GSDSTACK-06 | 134 | Complete |
| GSDSTACK-07 | 134 | Complete |
| GSDSTACK-08 | 135 | Complete |
| GSDSTACK-09 | 135 | Complete |
| GSDSTACK-10 | 136 | Complete |
| GSDSTACK-11 | 136 | Complete |
| WORKLOAD-01 | 137 | Planned |
| WORKLOAD-02 | 137 | Planned |
| WORKLOAD-03 | 137 | Planned |
| WORKLOAD-04 | 137 | Planned |
| WORKLOAD-05 | 137 | Planned |
| WRITERULES-01 | 138 | Planned |
| WRITERULES-02 | 138 | Planned |
| WRITERULES-03 | 138 | Planned |
| WRITERULES-04 | 138 | Planned |
| WRITERULES-05 | 138 | Planned |
| WRITERULES-06 | 138 | Planned |
| SHAREDRO-01 | 139 | Planned |
| SHAREDRO-02 | 139 | Planned |
| SHAREDRO-03 | 139 | Planned |
| CACHEADMIN-01 | 140 | Planned |
| CACHEADMIN-02 | 140 | Planned |
| CACHEADMIN-03 | 140 | Planned |
| CACHEADMIN-04 | 140 | Planned |
| CACHEADMIN-05 | 140 | Planned |
| ARTGATE-01 | 141 | Planned |
| ARTGATE-02 | 141 | Planned |
| ARTGATE-03 | 141 | Planned |
| FLEET-01 | 142 | Complete |
| FLEET-02 | 142 | Complete |
| FLEET-03 | 142 | Complete |
| FLEET-04 | 142 | Complete |
| FLEET-05 | 143 | Complete |
| FLEET-06 | 143 | Complete |
| FLEET-07 | 143 | Complete |
| FLEET-08 | 143 | Complete |
| FLEET-09 | 144 | Complete |
| FLEET-10 | 144 | Complete |
| FLEET-11 | 144 | Complete |
| FLEET-12 | 144 | Complete |
| FLEET-13 | 145 | Complete |
| FLEET-14 | 145 | Complete |
| FLEET-15 | 145 | Complete |
| FLEET-16 | 145 | Complete |
| FLEET-17 | 146 | Complete |
| FLEET-18 | 146 | Complete |
| FLEET-19 | 146 | Complete |
| FLEET-20 | 146 | Complete |
| FLEET-21 | 146 | Complete |
| FLEET-22 | 147 | Complete |
| FLEET-23 | 147 | Complete |
| FLEET-24 | 147 | Complete |
| FLEET-25 | 147 | Complete |
| FLEET-26 | 147 | Complete |

---

## v8.11 Unified Meeting Memory

*Added: 2026-07-14 — focused milestone for federated meeting recall + ingest reliability.*

### MEETREL — Meeting Ingest Reliability (Phase 151)

- [x] **MEETREL-01**: Meeting Markdown filenames are idempotent by `recording_id` / `meeting_id` (no `-2` slug-collision duplicates on re-ingest).
- [x] **MEETREL-02**: Meeting Markdown frontmatter includes `calendar_title`, `share_url`, `meeting_id`, and `source` for Fathom, Circleback, and Zoom.
- [x] **MEETREL-03**: Public provider templates live under `scripts/meet-sync/providers/`; secrets remain in envFile / 1Password only.
- [x] **MEETREL-04**: `meet-sync --health` reports freshness, last-run OK, and empty-vs-API WARN (including personal Fathom).

### URECALL — Unified Recall Facade (Phases 152–153)

- [x] **URECALL-01**: Shared resolver searches enabled meeting QMD collections plus knowledge literal and mem0.
- [x] **URECALL-02**: MCP `memory_recall` is the default agent meeting/memory recall tool.
- [x] **URECALL-03**: Orientation prefers `memory_recall` over collection-aware `qmd -c` / naive `knowledge_search` for “find the meeting”.
- [x] **URECALL-04**: `/api/memory/multi-search` includes a QMD meeting lane.
- [x] **URECALL-05**: Docs and `collections.config.json` list private meeting collections.
- [x] **URECALL-06**: Regressions prove Monaco Circleback + Fathom Impromptu are findable via `memory_recall` without `-c`.

### Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| MEETREL-01 | 151 | Done |
| MEETREL-02 | 151 | Done |
| MEETREL-03 | 151 | Done |
| MEETREL-04 | 151 | Done |
| URECALL-01 | 152 | Done |
| URECALL-02 | 152 | Done |
| URECALL-03 | 152 | Done |
| URECALL-04 | 153 | Done |
| URECALL-05 | 153 | Done |
| URECALL-06 | 153 | Done |
| SKILLTRUST-01 | 148 | Complete |
| SKILLTRUST-02 | 148 | Complete |
| SKILLTRUST-03 | 149 | Complete |
| SKILLTRUST-04 | 149 | Complete |
| SKILLTRUST-05 | 150 | Complete |


## v8.12 MemRoOS MCP Memory Gate Resilience (Codex) — 2026-07-15

**Created:** 2026-07-15T20:45:27Z  
**Updated:** 2026-07-15T20:45:27Z  
**Version:** 2026-07-15.1  
**Sources:** content/research/memroos-mcp-tools-unavailable-codex-session-2026-07-05.md; operator probe timings (3s abort vs 9–31s Mem0 /health)

| ID | Requirement | Phase | Status |
|----|-------------|-------|--------|
| GATE-RESILE-01 | Mem0 health probe default timeout 15s via backends.ts (health route uses it); configurable `MEM0_HEALTH_TIMEOUT_MS`; tests cover timeout honesty | 154 | pending |
| GATE-RESILE-02 | Remove Mem0 self-HTTP health loop; keep/strengthen Qdrant probe cache; optional `/livez`; healthcheck.sh auto-restart hung Mem0 with cooldown | 155 | pending |
| GATE-RESILE-03 | Strict-gate diagnostics include tier detail; path-scoped disk so home df% alone does not map to vector=down | 156 | pending |

**Locked:** Keep `MEMROOS_REQUIRE_SERVER_MEMORY=1`. Do not fix via allow-degraded or unsetting strict.

## v8.13 Memory Tier Catchup + Install Wiring — 2026-07-17

**Created:** 2026-07-17T19:30:00-07:00  
**Updated:** 2026-07-17T19:30:00-07:00  
**Version:** 2026-07-17.1  
**Sources:** Operator session 2026-07-17 (Aura Neo4j up / Qdrant ~628 points / graph probe-only; NOC Last-24h empty vs inventory live; install missing tier-fill jobs)

| ID | Requirement | Phase | Status |
|----|-------------|-------|--------|
| MEMTIER-01 | Shared idempotent projection from mem0/Qdrant memories into Neo4j graph facts/relationships (synergistic tier fill, not full-text duplicate store) | 157 | pending |
| MEMTIER-02 | One-shot operator catchup CLI/script with pagination, Aura-safe rate limits, and progress metrics | 157 | pending |
| MEMTIER-03 | After catchup, Neo4j inventory count exceeds probe-only nodes; MemoryFact (or equivalent) queryable for recall | 157 | pending |
| MEMTIER-04 | Durable `graph-catchup` scheduled job with checkpoint/cursor and cron-health heartbeats | 158 | pending |
| MEMTIER-05 | Job skips cleanly when Neo4j is not configured; does not fail unrelated install paths | 158 | pending |
| MEMTIER-06 | setup / `install:memory-resilience` wires the job; `docs/install-profiles.md` documents enable/status/uninstall | 159 | pending |

**Locked:** Do not treat Qdrant and Neo4j as interchangeable duplicates. Catchup projects entities/relationships for graph recall; vector store remains canonical for similarity search.

## v8.15 Always-On Cloud Operator (oracle-1) — 2026-07-17

**Created:** 2026-07-17T21:07:00-07:00  
**Updated:** 2026-07-18T09:06:00Z  
**Version:** 2026-07-18.3  
**Sources:** SSH inventory of `oracle-1` (10Gi aarch64, ~8.7Gi avail, 13G free disk, Ollama absent); `docs/package-options-embeddings-hermes-memory.md`; operator dual-brain incident (Heroku empty vs Mac live) 2026-07-17; live re-verify 2026-07-18 (`docs/uat/2026-07-18-oracle1-live-cutover-verification.md`)

| ID | Requirement | Phase | Status |
|----|-------------|-------|--------|
| CLOUDOPS-01 | Install Ollama on oracle-1 (aarch64) and pull `nomic-embed-text` only; embed smoke test passes | 163 | complete (kickoff 2026-07-18; on-host re-smoke pending SSH pubkey) |
| CLOUDOPS-02 | Keep ≥5G free disk after model install; document RAM budget (Next+mem0+nomic; no heavy chat LLM required) | 163 | complete (kickoff evidence; re-check pending SSH) |
| CLOUDOPS-03 | Deploy MemRoOS + mem0 on oracle-1 with shared Neo4j Aura + Qdrant Cloud credentials | 164 | complete (public health mem0+graph live 2026-07-18) |
| CLOUDOPS-04 | Migrate/sync Mac `conversations.db` to persistent disk on oracle-1; on-host inventory non-zero | 164 | complete (inventory 128,597 messages / 34,507 graph facts 2026-07-18) |
| CLOUDOPS-05 | Enable graph-catchup (scheduler/cron) on the oracle-1 operator host | 164 | complete (kickoff; graph live; scheduler unit re-check pending SSH) |
| CLOUDOPS-06 | Cloudflare Tunnel serves `memroos.epiloguecapital.com` → oracle-1 `:3000`; public health/inventory match host | 165 | complete (tunnel `memroos-oracle` healthy 2026-07-18) |
| CLOUDOPS-07 | Remove Heroku operator custom domain; scale web=0; rotate any backend secrets exposed on Heroku; agents/MCP use tunnel URL; Mac documented as dev-only | 165 | complete (Heroku `web=0`, custom domain absent 2026-07-18) |
| CLOUDOPS-08 | Ship optional `MEMROOS_EMBEDDING_PROVIDER=voyage` (env + provider); Ollama remains default on oracle-1 | 166 | pending (explicitly out of scope this goal) |

**Locked:** One operator brain (oracle-1). Do not keep Heroku as a second empty MemRoOS. Do not create a second Qdrant collection or Neo4j database for “prod.” Embeddings day-1 = Ollama nomic on oracle-1; Voyage is opt-in cloud alternative, not a blocker for cutover.

## v8.14 Human Wiki Surface + Memory Digest — 2026-07-17

**Created:** 2026-07-17T20:16:00-07:00  
**Updated:** 2026-07-17T20:16:00-07:00  
**Version:** 2026-07-17.1  
**Sources:** Operator session 2026-07-17 (Obsidian near-term digest + MemRoOS wiki UI options B/C); seed pages in `~/github/knowledge/llm-wiki/wiki/07-memroos-platform/`

| ID | Requirement | Phase | Status |
|----|-------------|-------|--------|
| WIKISURF-01 | Idempotent memory→wiki digest with watermark; clusters mem0 (optional journals) into entity/topic pages with provenance | 160 | complete |
| WIKISURF-02 | Digest updates `llm-wiki/wiki/index.md` + `log.md`; wired to curator or cron-health on a regular schedule; non-fatal failures | 160 | complete |
| WIKISURF-03 | Redaction: no secrets; skip/high-sensitivity personal-legal scraps from human wiki pages; dry-run mode | 160 | complete |
| WIKISURF-04 | Authenticated `/wiki` index + page routes browse compiled markdown from knowledge vault | 161 | complete |
| WIKISURF-05 | Wikilink resolution + folder tree navigation; read-only v1 | 161 | complete |
| WIKISURF-06 | Title/content search over wiki pages (QMD or lightweight index) | 161 | complete |
| WIKISURF-07 | Graph JSON refreshed when digest/compile runs | 162 | complete |
| WIKISURF-08 | Light interactive graph in `/wiki` linked to page view; degrades if graph missing | 162 | complete |

**Locked:** Wiki is a compiled human view — not a dump of raw mem0 bullets. Same files serve Obsidian and MemRoOS. No full Obsidian clone (plugins/canvas/mobile sync).

## v8.16 Multi-Harness Observe Plane — 2026-07-17

**Created:** 2026-07-17T21:10:00-07:00  
**Updated:** 2026-07-17T21:10:00-07:00  
**Version:** 2026-07-17.1  
**Sources:** Operator session 2026-07-17 (MemRoOS not learning agent work; MCP-only vs observe sidecar; client list Codex/Hermes/Claude/Pi/Factory/Cursor/Antigravity/OpenClaw); `docs/runtime-adapter-maturity.md`; `docs/integrations/mcp.md`; Hermes dual-mode observe; Phase 96 capture API

| ID | Requirement | Phase | Status |
|----|-------------|-------|--------|
| OBSERVE-01 | Capture depth enum `summary` \| `relevant` \| `full` with default `relevant`; documented in `docs/integrations/observe-capture.md` | 167 | complete |
| OBSERVE-02 | Server ingest enforces depth: `relevant` indexes summaries/candidates only; `full` may seal transcripts in vault under retention labels — not dump into mem0 by default | 167 | complete |
| OBSERVE-03 | Org/env can raise depth later without schema break; secrets redacted; elevated sensitivity for jobhunt/PII paths | 167 | complete |
| OBSERVE-04 | Remote MCP onboard installer writes config for detected harnesses **including Pi**; no local MemRoOS clone required for Streamable HTTP | 168 | complete |
| OBSERVE-05 | Employee uninstall + API key revoke path documented; onboard ≤5 minutes; observe prefers MemRoOS-registered agents (incl. `platform=pi`) | 168 | complete |
| OBSERVE-06 | Observe sidecar watches session artifacts and POSTs to capture/ingest with heartbeat | 169 | complete |
| OBSERVE-07 | Wave 1 adapters: Claude Code JSONL, Codex JSONL, Hermes sessions, OpenClaw sessions, **Pi `~/.pi/agent/sessions/**/*.jsonl`** attributed to onboarded Pi agents | 169 | complete |
| OBSERVE-08 | Hermes memory observe plugin shares the same depth policy | 169 | complete |
| OBSERVE-09 | Capture reuses Phase 96 `captureCodingAgentSession` (no parallel schema); dry-run receipts; Pi Wave-1 smoke without manual `knowledge_write` | 169 | complete |
| OBSERVE-10 | Cursor adapter: MCP + best-available hook/export; honest partial status if capture incomplete | 170 | complete (2026-07-18; `mcp-partial` maturity, sessionRoots=[`.cursor/projects`]) |
| OBSERVE-11 | Factory/Droid MCP + capture path; map to `platform=droid` when registered; **do not demote Pi out of Wave 1** | 170 | complete (2026-07-18; `hooks+jsonl` maturity, sessionRoots=[`.factory`]) |
| OBSERVE-12 | Antigravity: MCP if available else documented limitation — no false full-capture claim | 171 | complete (2026-07-18; `limited` maturity, no JSONL surface found, explicit no-path note in catalog) |
| OBSERVE-13 | Maturity matrix lists Claude/Codex/Hermes/OpenClaw/**Pi**/Cursor/Factory/Antigravity with capture method; installer TARGETS include Pi | 171 | complete (2026-07-18; `scripts/check-observe-maturity-drift.mjs` + CI wired; matrix synced to catalog) |
| OBSERVE-14 | Operator visibility per onboarded agent (incl. Pi): last capture, depth, volume, errors; Wave 1 smoke ≥1 relevant candidate without manual `knowledge_write` | 171 | complete (2026-07-18; `errorCount`+`agentsByHarness` in `listObserveHarnessHealth`; Wave-1 Pi smoke in `observe-wave1-smoke.test.ts`) |

**Locked:** Support **already-onboarded** MemRoOS agents (Pi is first-class `AgentPlatform`). MCP is the company brain interface, not a wiretap. Autonomous learning requires the observe sidecar/adapters. Default store **relevant** content only; depth is intentionally upgradable later. Do not promise 100% closed-IDE fidelity without vendor hooks.

## v8.11 Followup — Source-to-Index Evidence (Phase 172)

| ID | Requirement | Phase | Status |
|----|-------------|-------|--------|
| MEETREL-FOLLOWUP-05 | Every meeting lookup returns a bounded 6-case status (`provider_absent` \| `provider_auth_blocked` \| `captured_unrouted` \| `routed_unindexed` \| `indexed_unrecalled` \| `recalled`); pre-flight refuses to report `ok:true` when OAuth scopes are insufficient; evidence bundle at `docs/uat/2026-07-18-meetrel-source-to-index-evidence.md` | 172 | complete (2026-07-18; `services/knowledge-mcp/knowledge_system/source_status.py` + `apps/memroos/src/lib/meeting-source-status.ts`; pre-flight in `scripts/meet-sync/preflight.sh`; `memory_recall` parity fix for spark-recordings) |

## v8.18 NOC Metrics Rethink — Planned 2026-07-20

**Design:** `.planning/design/noc-rethink-v1.md`
**Audit:** `.planning/notes/2026-07-20-noc-rethink-audit.md`
**Audience:** Sole operator. No requirement may depend on hive activity or unwired EFFTEL producers for its default view.

| ID | Requirement | Phase | Status |
|----|-------------|-------|--------|
| NOCUX-01 | Default NOC panels use signals populated by a fresh single-operator install: messages, memory, cron health, skills, audit, and model usage. Hive-only signals are additive, never required. | 173, 174 | planned |
| NOCUX-02 | Every default NOC panel renders semantic state: live, window-empty, no-history, stale/error, or known-unwired. No bare "No events" or "empty by design" copy remains in the default layout. | 174 | planned |
| NOCUX-03 | Default panel order answers operator questions in order: alive, needs attention, learning, agent activity, cost, governance. | 174 | planned |
| NOCUX-04 | EfficiencySignals and other useful-but-unwired panels are hidden behind Show advanced until their producers are verified. Known-unwired is explicit, not a generic empty/error state. | 173, 174 | planned |
| NOCUX-05 | Window (24h/7d/30d) and workspace filters apply consistently; Agent Activity remains message-backed when no hive delegations exist; empty-state probes respect the selected workspace. | 173, 174 | planned |

## v8.30 Seamless Memory Adoption — Planned 2026-07-26

**Created:** 2026-07-26  
**Version:** 2026-07-26.1  
**Sources:** Operator session 2026-07-26 (agents neither check MemRoOS for prior work nor store enough; injection into every session rejected as the mechanism); repo audit in `.planning/design/memory-adoption-v1.md` §2; Phase 118 kernel (orphaned), Phase 117 telemetry (empty `retrieval_trace` stream), v8.16 observe plane, Memento save-quality spike (deferred), `agents/AGENTS_TEMPLATE.md` Skills > Memory directive, `content/research/memroos-persist-failure-rca-2026-07-05.md`

**Design:** `.planning/design/memory-adoption-v1.md`

| ID | Requirement | Phase | Status |
|----|-------------|-------|--------|
| PRIORWORK-01 | Consolidate the two Phase 118 recollection implementations into one canonical module under `lib/memory/recollection/` (richer trigger vocabulary + EFFTEL-04 guard survive; `BeliefStage` export path stable; loser deleted) | 191 | planned |
| PRIORWORK-02 | `POST /api/memory/prior-work` (agent-key auth): task text + hints → recollection kernel → pointer-sized digest pack (≤5 items: title, one-liner, belief stage, age, salience, fetch ref) with explicit prior-work-exists headline; typed skip reason codes; never raw payloads | 191 | planned |
| PRIORWORK-03 | MCP tool `memory_prior_work` in `CORE_TOOLS`; tool description carries the when-to-call contract | 191 | planned |
| PRIORWORK-04 | Every probe (served or skipped) emits a `retrieval_trace` efficiency event with the full recollection receipt via an agent-reachable path; `retrievalBeforeWorkRate` populated from real external sessions | 191 | planned |
| PRIORWORK-05 | `/api/agent-context` gains topic-based recall through the recollection module (no `goal_id` required for memories) + MCP wrapper for the context packet | 191 | planned |
| SELFCAP-01 | `/api/agent-memory/capture` accepts agent-key auth scoped to the agent's own sessions; rate-limited; server-side depth policy unchanged (`relevant` default, `full` → vault) | 192 | planned |
| SELFCAP-02 | Repo-shipped hooks installed by `install-agent-integrations.sh`: session-start memory-brief (≤600-token pointer digest; fails open with miss receipt) + stop/pre-compact capture-gate (structured capture or typed skip receipt; failure → receipt + NOC Attention, never a blocked session) | 192 | planned |
| SELFCAP-03 | Per-harness hook capability matrix committed and drift-gated (native hooks, portable-hook equivalent, plugin, or skill+sidecar fallback); no false full-coverage claims | 192 | planned |
| SELFCAP-04 | Observe sidecar structured extraction v2: decisions, outcomes/verification, errors, commands, files, entities replace the 240-char summary; deterministic-first, LLM assist only where depth policy allows | 192 | planned |
| SELFCAP-05 | Sidecar scheduled (launchd/systemd/cron template via installer) with heartbeat in NOC observe-harness health | 192 | planned |
| SAVEQ-01 | Save-quality report scored on every governed write (type, provenance, dedupe, specificity, promotion readiness); score persisted | 193 | planned |
| SAVEQ-02 | Coach-back receipts for sub-threshold writes with actionable guidance; hard-reject only on policy violations; rubric encodes Skills > Memory | 193 | planned |
| SAVEQ-03 | Governance parity: no default-visible ungoverned memory write or untraced search remains (`memory_save`/`memory_search` routed through governed paths, or demoted from `CORE_TOOLS`) | 193 | planned |
| SAVEQ-04 | Automatic silver→gold promotion scheduler running the existing five deterministic checks; conflicts → operator review queue; no LLM-only promotion; hash-chained receipts | 193 | planned |
| SAVEQ-05 | Salience coverage extends to agent-written memories/candidates; `tool_record_outcome` usefulness feedback reinforces salience and ranking | 193 | planned |
| MEMHABIT-01 | skill-packs catalog falls back to repo skills dirs when `$KNOWLEDGE_ROOT/skills` is absent, so the AGENTS.md auto-load bootstrap returns real skills in a MemRoOS checkout | 194 | planned |
| MEMHABIT-02 | `memroos-recall` shipped as SKILL.md with `auto_load: true` (generalized from `multica-memroos`): start-of-task probe protocol, mid-task re-probe triggers, belief-stage handling rules | 194 | planned |
| MEMHABIT-03 | `memroos-save` upgraded: end-of-task persist checklist covers governed memory writes (decisions, outcomes, facts, handoff state), not only document writes | 194 | planned |
| MEMHABIT-04 | GSD skills hardened: `$goal` step 4 becomes a named mandatory `memory_prior_work` probe with receipt; beastmode/qwen-cloud gain start/end memory checkpoints | 194 | planned |
| MEMHABIT-05 | Memory-tool MCP descriptions + `knowledge_system_orientation` prompt state the memory contract (probe at start, governed save or skip receipt at end) | 194 | planned |
| ADOPTTEL-01 | NOC Memory Adoption panel per agent/harness: recall-before-work, capture-per-session, rediscovered-fact rate, save-quality distribution, silver→gold throughput; NOCUX honest states | 195 | planned |
| ADOPTTEL-02 | `research-without-persist-detector` generalized to all Wave-1 harness session roots; findings surface as NOC Attention items | 195 | planned |
| ADOPTTEL-03 | GSD closeout gate: phase/goal close requires start probe receipt + close learnings write (or typed skip receipt); CI-wired check script | 195 | planned |
| ADOPTTEL-04 | Adoption SLOs measured on live operator data: retrieval-before-work ≥70% of working sessions; ≥1 governed write or skip receipt per session; rediscovered-fact rate declining over 30d; auto silver→gold throughput >0 weekly | 195 | planned |
| ADOPTTEL-05 | Eval fixtures: prior-work-exists surfaced, no-prior-work honest skip, junk-save coach-back, duplicate-save rediscovery flag, old-critical-beats-recent-noise regression | 195 | planned |

**Locked:** Pointer, not payload — session briefs stay ≤ ~600 tokens; full memories are pull-on-demand only. Recall fails open with receipts (a degraded brain never blocks work); write policy fails closed. No new memory backend, no LLM-only silver→gold promotion, no transcript dumping into mem0, depth default stays `relevant`. Skills > Memory ordering preserved: procedures → SkillForge, class lessons → skills, decisions/outcomes/facts/handoff state → memory.
| NOCUX-05 | Window (24h/7d/30d) and workspace filters apply consistently; Agent Activity remains message-backed when no hive delegations exist; empty-state probes respect the selected workspace. | 173, 174 | planned |
## v8.31 Operator Config Durability + Storage Consolidation — Planned 2026-07-26

**Sources:** oracle-1 hardening session 2026-07-25/26 (Aura config-drift discovery, full local→oracle-1 migration, disk-pressure remediation, health-check extension, systemd-timer re-arming); ROADMAP §v8.15 data-plane reconciliation.
**Governing constraint:** no upgrade, restart, reinstall, or migration on any host may lose users, configuration, or memory/data. A requirement that cannot be met under that rule fails closed.

| ID | Requirement | Phase | Status |
|----|-------------|-------|--------|
| CFGDUR-01 | Host backend topology (Aura vs local Neo4j; Qdrant Cloud vs local) is versioned in a committed, non-secret host-profile mechanism; secrets remain in `.env`/1Password and out of git | 196 | planned |
| CFGDUR-02 | A plain `docker compose up` either produces the correct topology or refuses to start with an actionable error; correctness must not depend on remembering a wrapper script | 196 | planned |
| CFGDUR-03 | `scripts/memroos-health-check.sh` is committed to the repo with tests for its failure branches; its checks (Aura env, Qdrant reachability, graph-catchup activity, users/registered_agents vs. previous run, profile presence, local-neo4j-not-running) are documented | 196 | planned |
| CFGDUR-04 | The cron+SendGrid and systemd+GitHub-issue health systems are reconciled into one documented story with stated ownership per check and per alert channel | 196 | planned |
| CFGDUR-05 | Timer/cron **liveness** is monitored — an `enabled`-but-unarmed timer (`systemctl list-timers` → `NEXT: -`) must alert; asserting `is-enabled` alone is insufficient and demonstrably missed the 2026-07-23 failure | 196, 197, 198 | planned |
| CFGDUR-06 | An upgrade-safety regression runs the documented upgrade path on a disposable host with seeded data and asserts users>0, registered_agents>0, Aura-not-local, and non-placeholder Qdrant URL; extends the v8.21 `install-regression` harness | 196 | planned |
| HOSTPAR-01 | A per-host inventory records graph backend, vector backend, SQLite path, restart path, monitoring coverage, and alert destination for oracle-1 and cordant-hermes-01; intentional divergence is allowed, undocumented divergence is not | 197 | planned |
| HOSTPAR-02 | The Phase 185 durability mechanism and health check run on cordant-hermes-01 with host-appropriate expectations (local Neo4j there is correct and must not be flagged as drift) | 197 | planned |
| HOSTPAR-03 | CFGDUR-05 timer/cron liveness monitoring covers cordant-hermes-01 | 197 | planned |
| HOSTPAR-04 | A recorded decision states whether cordant-hermes-01 moves to Aura or deliberately stays on local Neo4j, with reasoning; either outcome closes this, leaving it unexamined does not | 197 | planned |
| STORECON-01 | Sizing/cost baseline captured before any storage decision: `conversations.db` on-disk size, largest tables, growth rate, oracle-1 free-space headroom, and the Supabase tier the workload lands in | 198 | planned |
| STORECON-02 | An ADR records the SQLite→Postgres decision and explicitly corrects the "maximize space" premise — local Postgres increases oracle-1 disk usage (WAL + index + server overhead); only managed/remote Postgres reduces local footprint. The ADR states which it chooses | 198 | planned |
| STORECON-03 | Embedding generation is restored or explicitly deferred with a reason; current state is `[embeddings] provider disabled; embedding job not scheduled` with no provider key on the `memroos` or `mem0` containers, making all existing embeddings migrated history rather than live output | 198 | planned |
| STORECON-04 | `graph-catchup`'s persistent `projected: 0` is diagnosed to a cause and labelled benign or defect-with-fix; the ambiguity may not be carried forward again | 198 | planned |
| STORECON-05 | Scheduled jobs that **populate** Qdrant and Neo4j (not merely check reachability) exist, are documented, and have liveness covered by CFGDUR-05 | 198 | planned |

**Locked:** Executing the Supabase project deletion (ApplyPilot delete; JobHunt export+delete; GrowthAlchemyLab untouched) is **excluded** from v8.31. It is irreversible, the operator confirmation predates multiple context compactions, and it must be re-confirmed immediately before execution. Migrating the SQLite kernel is likewise excluded — Phase 198 produces a decision and the population fix only; an approved migration is a separate phase requiring a verified restore rehearsal first. Backend replacement of mem0/Qdrant/Neo4j remains approval-gated per `.planning/MILESTONES.md` § Deferred / Approval-Gated.
