# Requirements: Memroos GSD Roadmap

*Updated: 2026-06-08*

---

## Current Completed Milestones

- v6.4 SkillForge Production SkillOpt Hardening — complete
- v6.5 Agent Context Bus + Synchronous Agent Communication — complete
- v6.6 Cloud Offload + Local Footprint Reduction — complete
- v7.0 Client-Ready Security + Architecture Audit — complete

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

---

## Future Requirements (Deferred)

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
