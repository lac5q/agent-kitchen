# Requirements: Memroos v7.0 — Client-Ready Security + Architecture Audit

*Created: 2026-06-06 | Milestone: v7.0*

---

## Milestone Goal

Harden memroos for client review with a full security and architecture sweep across all codebase layers — eliminating vulnerabilities, cleaning dead code, fixing bad boundaries, and ensuring tests stay green throughout.

---

## Active Requirements

### AUDIT — Domain Scanning

- [ ] **AUDIT-01**: Security team can verify Auth & secrets domain was audited — covering hardcoded secrets, token handling, JWT security, API key exposure, session management, and cookie flags
- [ ] **AUDIT-02**: Security team can verify API surface was audited — covering missing auth guards, input validation gaps, injection risks (SQLi, XSS, SSTI), rate limiting, and CORS configuration
- [ ] **AUDIT-03**: Security team can verify Data & memory handling was audited — covering unsafe deserialization, data leakage paths, privacy exposure, unsafe file operations, and memory service access controls
- [ ] **AUDIT-04**: Engineering team can verify Architecture & code quality was audited — covering dead code, circular dependencies, leaky abstractions, redundant patterns, unsafe TypeScript casts, and inconsistent error handling

### SEC — Security Remediation

- [ ] **SEC-01**: All critical-severity security findings from the audit are fixed and verified
- [ ] **SEC-02**: All high-severity security findings from the audit are fixed and verified
- [ ] **SEC-03**: Medium-severity security findings are fixed or documented with accepted-risk rationale
- [ ] **SEC-04**: `npm audit` and `pip-audit` report zero critical/high CVEs in dependencies; all fixable vulns patched
- [ ] **SEC-05**: Codebase contains no hardcoded secrets, tokens, or credentials; git history clean of accidental secret commits
- [ ] **SEC-06**: CI/CD security gates (secret-guard.yml, pre-commit hooks) are hardened and cannot be bypassed silently

### ARCH — Architecture Cleanup

- [ ] **ARCH-01**: Dead code and unused exports are removed; no unreachable functions remain in core modules
- [ ] **ARCH-02**: Module boundary violations resolved — no circular dependencies, no cross-layer leakage between services
- [ ] **ARCH-03**: Redundant patterns consolidated — duplicate API clients, repeated utilities, copy-pasted logic replaced with shared implementations
- [ ] **ARCH-04**: Consistent error handling enforced across all Next.js API routes and Python service endpoints
- [ ] **ARCH-05**: TypeScript `any` types and unsafe casts eliminated from production code paths; strict mode violations resolved

### TEST — Validation

- [ ] **TEST-01**: Full test suite (`npm test`, Python pytest) runs green after all security and architecture changes
- [ ] **TEST-02**: Security regression tests added for each critical/high finding fixed — preventing reintroduction
- [ ] **TEST-03**: Production build (`npm run build`) and typecheck (`npm run typecheck`) pass clean with zero errors

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
| AUDIT-01 | 109 | Planned |
| AUDIT-02 | 109 | Planned |
| AUDIT-03 | 109 | Planned |
| AUDIT-04 | 109 | Planned |
| SEC-01 | 110 | Planned |
| SEC-02 | 110 | Planned |
| SEC-03 | 111 | Planned |
| SEC-04 | 111 | Planned |
| SEC-05 | 110 | Planned |
| SEC-06 | 111 | Planned |
| ARCH-01 | 112 | Planned |
| ARCH-02 | 112 | Planned |
| ARCH-03 | 112 | Planned |
| ARCH-04 | 112 | Planned |
| ARCH-05 | 112 | Planned |
| TEST-01 | 113 | Planned |
| TEST-02 | 110–112 | Planned |
| TEST-03 | 113 | Planned |
