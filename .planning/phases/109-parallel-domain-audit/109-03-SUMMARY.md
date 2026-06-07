---
phase: 109-parallel-domain-audit
plan: "03"
subsystem: security-audit
tags: [audit, security, api-surface, proxy, cve, sql-injection, csp]
dependency_graph:
  requires: [audit-toolchain-ready, cve-baseline]
  provides: [domain-b-findings, api-surface-attestation]
  affects: [109-FINDINGS-INDEX, 110, 111]
tech_stack:
  added: []
  patterns: [proxy-matcher-coverage-analysis, semgrep-sast, sql-interpolation-review]
key_files:
  created: [.planning/audit/domain-api-surface.md]
  modified: []
decisions:
  - "Auth coverage derived from proxy.ts config.matcher + ROUTE_LOCAL_AUTH_API_ROUTES bypass-list analysis, NOT per-route grep (RESEARCH.md Pitfall 1) — all 11 bypass patterns verified to implement route-local auth; zero orphan bypasses"
  - "Open Question 1 RESOLVED: CSP unsafe-eval is removable in production per Next.js v16 docs (content-security-policy.md:42) — filed B01-002 medium"
  - "Open Question 3 RESOLVED: App-Router segment-prefetch/dynamic-param bypass CVEs (GHSA-26hh, GHSA-492v, GHSA-267c) apply since auth is in middleware; i18n/Pages-Router CVE does NOT apply (no i18n, App Router only) — filed B01-001 high → SEC-04"
  - "time-series/route.ts 'safe per T-25-02' SQL claim VERIFIED: since is a hardcoded SQLite literal selected via allowlist-validated window; bucketFormat bound via ?"
metrics:
  duration: 9m
  completed_date: "2026-06-07"
  tasks_completed: 2
  files_created: 1
---

# Phase 109 Plan 03: Domain B — API Surface Audit Summary

Audited the API surface (AUDIT-02) with matcher-grounded auth coverage: `proxy.ts` `config.matcher` matches all 129 `/api/*` routes and every one of the 11 `ROUTE_LOCAL_AUTH_API_ROUTES` bypass entries was opened and confirmed to implement route-local auth (zero orphan bypasses). Produced 5 findings — 1 high (Next.js middleware-bypass CVEs → SEC-04), 3 medium (CSP unsafe-eval, no input-validation framework, no rate limiting), 1 low (OpenAPI host reflection). All SQL `db.prepare()` interpolation sites verified to bind user data via `?`; the time-series "safe per T-25-02" claim is confirmed. semgrep (185 files) returned zero findings.

## Tasks Completed

| Task | Type | Status | Commit | Files |
|------|------|--------|--------|-------|
| T1: Analyze proxy matcher coverage + run injection scans | auto | COMPLETE | f4764fe | .planning/audit/domain-api-surface.md |
| T2: Work Domain B manual checklist + write attested report | auto | COMPLETE | f4764fe | .planning/audit/domain-api-surface.md |

Both tasks deliver the single report file; committed together as the report was finalized atomically.

## Findings Produced

| ID | Severity | Title | Fix Req |
|----|----------|-------|---------|
| B01-001 | high | Next.js v16.2.4 middleware/proxy-bypass CVEs apply | SEC-04 |
| B01-002 | medium | CSP unsafe-eval unconditional (removable in prod) | SEC-03 |
| B01-003 | low | OpenAPI spec reflects x-forwarded-host | SEC-03 |
| B01-004 | medium | No input-validation framework (zod absent) | SEC-03 |
| B01-005 | medium | No rate limiting on non-auth endpoints | SEC-03 |

Severity counts: 0 critical, 1 high, 3 medium, 1 low. Fix routing: SEC-04 ×1, SEC-03 ×4.

## Coverage Attestation (9 checklist items)

| Item | Status |
|------|--------|
| Proxy matcher blind spots | CLEAN |
| Bypass-list orphans | CLEAN (zero orphans) |
| SQL injection | CLEAN (time-series T-25-02 verified) |
| CSP unsafe-eval | FINDING B01-002 |
| Rate limiting | FINDING B01-005 |
| CORS | CLEAN (no ACAO header anywhere) |
| Next.js CVEs | FINDING B01-001 (SEC-04) |
| Input validation | FINDING B01-004 |
| Iris/scanner ingress | NOT CHECKED (deferred to AUDIT-03/Domain C per seam rule); SSTI N/A |

## Deviations from Plan

### Auto-fixed Issues

None — this is a read-only audit; no source files modified.

### Scope Adjustments

**1. [Informational] Iris/content-scanner ingress deferred to Domain C**
- **Found during:** Task 2
- **Issue:** The "Iris/content-scanner ingress coverage" checklist item is a data-handling trust-boundary concern that the Domain Coverage Matrix seam assigns to AUDIT-03 (Domain C, data/memory), not API surface.
- **Action:** Tagged NOT CHECKED in the attestation with explicit hand-off to plan 109-04; SSTI sub-item resolved as N/A (no server-side template engine; JSX is React-escaped).
- **Impact:** No coverage gap — the item is owned and will be covered by 109-04.

**2. [Informational] semgrep 4 warn-level errors are benign**
- **Found during:** Task 1
- **Issue:** semgrep emitted 4 `warn` syntax-parser errors, all in `*.test.ts` files (TS generic `>()` syntax the parser mishandles). No production route file failed to scan.
- **Action:** Documented in attestation; 185 files scanned, 0 findings.

## Known Stubs

None — audit report, no code stubs.

## Threat Flags

None — no new security surface introduced (read-only audit). All identified surface mapped to existing threat register entries T-109-B-01..04.

## Self-Check: PASSED

- [x] `.planning/audit/domain-api-surface.md` exists — FOUND
- [x] `## Coverage Attestation` present — FOUND
- [x] `## Summary Stats` present — FOUND
- [x] `config.matcher` literal recorded — FOUND
- [x] `/tmp/semgrep-domain-b.json` valid JSON — VERIFIED
- [x] commit f4764fe exists — FOUND
- [x] No source files modified — VERIFIED (only .planning/audit/ written)
