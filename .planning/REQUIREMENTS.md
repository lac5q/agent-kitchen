# Requirements: Memroos GSD Roadmap

*Updated: 2026-06-08*

---

## Current Completed Milestones

- v6.4 SkillForge Production SkillOpt Hardening — complete
- v6.5 Agent Context Bus + Synchronous Agent Communication — complete
- v6.6 Cloud Offload + Local Footprint Reduction — complete
- v7.0 Client-Ready Security + Architecture Audit — complete
- v7.1 Competitive Retrieval Proof — planned
- v7.2 Architecture Review Hardening — in progress

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

- [ ] **ARCHREV-01**: Route-level operator/agent auth wrappers protect privileged route groups inside handlers or factories so `proxy.ts` is not the only security boundary; marketing-app split remains a follow-on deployment decision.
- [ ] **ARCHREV-02**: Architecture docs describe MemRoOS as an agent OS with a broker kernel, include a module map for shipped domains, and define placement rules for Next app vs. Python service vs. script.
- [x] **ARCHREV-03**: SQLite schema initialization runs through an ordered migration runner stamped with `PRAGMA user_version`; unstamped legacy DBs upgrade to the current version, future-version DBs fail closed, and default admin seeding completes synchronously before `getDb()` returns.
- [ ] **ARCHREV-04**: A single runtime topology manifest names required services, ports, health checks, and supervision mode; `start.sh`, launchd installers, and Docker compose derive from or validate against that source.
- [ ] **ARCHREV-05**: App configuration is validated through one typed env module at startup, with `process.env` reads centralized and legacy root config status reconciled.
- [ ] **ARCHREV-06**: API, A2A, REST shim, MCP, and SDK contracts have one generated or shared schema source plus an SDK smoke test against a running app.
- [ ] **ARCHREV-07**: Recall canary evaluation runs in CI or a scheduled workflow, using existing golden sets and recall thresholds as a regression gate.
- [ ] **ARCHREV-08**: Planning history retention is decided before wider release: prune to current-milestone public docs or move archival GSD screenshots/history to a private sibling repo.
- [ ] **ARCHREV-09**: Next.js trust-boundary changes carry explicit proxy/auth regression coverage and a migration checklist before framework upgrades touch `proxy.ts`.

---

## Future Requirements (Deferred)

- **MEMGEN-FOLLOWUP-02**: Run a bounded Memento memory-save quality spike that compares local-first typed/audited Memento-style memory behavior against MemRoOS `agent_memory_candidates`, capture/handoff packs, and recall evals; no dependency adoption, backend swap, or hosted/private trace upload without Luis approval.
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
| COMPETE-01 | 114 | Planned |
| COMPETE-02 | 114 | Planned |
| SITE-BENCH-01 | 114 | Planned |
| BENCH-01 | 114 | Planned |
| BENCH-02 | 114 | Planned |
| BENCH-03 | 114 | Planned |
| RETRIEVAL-01 | 114 | Planned |
| RECEIPTS-01 | 114 | Planned |
| SEO-PROOF-01 | 114 | Planned |
| ARCHREV-01 | 115 | Planned |
| ARCHREV-02 | 115 | Planned |
| ARCHREV-03 | 115 | Complete |
| ARCHREV-04 | 115 | Planned |
| ARCHREV-05 | 115 | Planned |
| ARCHREV-06 | 115 | Planned |
| ARCHREV-07 | 115 | Planned |
| ARCHREV-08 | 115 | Planned |
| ARCHREV-09 | 115 | Planned |
| MEMGEN-FOLLOWUP-02 | Future | Deferred |
