# Requirements: Memroos GSD Roadmap

*Updated: 2026-06-27*

---

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

---

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

## PROV Verifiable Action Provenance + Tamper-Evident Audit (Proposed)

*Source: 2026-07-01 external developer question (Arden) on crash-consistent, auditable "proof" linking agent output to consumed memories and tools. See ROADMAP.md Backlog item 18.*

- [ ] **PROV-01**: Provenance is captured at the read/tool-call boundary (which memories were read, which tools/commands ran, with source id + hash) rather than self-reported by the agent at checkpoint time, so every output carries a verified set of consumed inputs.
- [ ] **PROV-02**: The audit entry for a significant action is written inside the same database transaction as the action itself, so the action and its audit row commit or fail together and rows cannot be silently dropped; the current "audit never breaks the primary action" contract is preserved or explicitly redesigned.
- [ ] **PROV-03**: Audit entries are hash-chained (each row references the prior row's hash) so tampering, deletion, or gaps in the trail are detectable, with a verification path that reports the first broken link.
- [ ] **PROV-04**: On crash/restart, the resumed checkpoint plus the transactional audit chain reconstruct a verifiable trail with no unaccounted actions between the last checkpoint and the crash; verification work stays off the hot path and provenance receipts expose no raw sensitive payloads.

---

## Future Requirements (Bounded Spikes Complete; Adoption Deferred)

- [x] **MEMGEN-FOLLOWUP-02**: Bounded Memento memory-save quality spike completed in `.planning/spikes/2026-06-27-memento-memory-save-quality.md`; no dependency adoption, backend swap, or hosted/private trace upload approved.
- [x] **COCOINDEX-FOLLOWUP-01**: Bounded CocoIndex source-freshness spike completed in `.planning/spikes/2026-06-27-cocoindex-source-freshness.md`; no dependency adoption, production index path, policy bypass, raw sensitive corpus indexing, or memory-backend replacement approved.
- [x] **FASTCONTEXT-FOLLOWUP-01**: Bounded FastContext repo-scout spike completed in `.planning/spikes/2026-06-27-fastcontext-repo-scout.md`; no runtime dependency, hosted/private repo upload, GitNexus replacement, or automatic code-edit path approved.
- [x] **ADKA2A-FOLLOWUP-01**: Bounded ADK/A2A contract-compliance spike completed in `.planning/spikes/2026-06-27-adk-a2a-contract-compliance.md`; no ADK/Gemini core dependency, app copy, compliance-vertical claim, or runtime replacement approved.
- [x] **QDRANT-FOLLOWUP-01**: Bounded Qdrant Cloud upgrade-readiness spike completed in `.planning/spikes/2026-06-27-qdrant-cloud-upgrade-readiness.md`; no local Qdrant, backend swap, vector rewrite, TurboQuant/named-vector migration, or production cluster upgrade approved.
- [x] **HYPEREXTRACT-FOLLOWUP-01**: Bounded Hyper-Extract structured-memory spike completed in `.planning/spikes/2026-06-27-hyperextract-structured-memory.md`; no dependency adoption, production ingestion path, private-document upload, storage-layer replacement, or default extraction pipeline approved.
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
