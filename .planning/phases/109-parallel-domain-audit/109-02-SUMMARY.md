---
phase: 109-parallel-domain-audit
plan: "02"
subsystem: audit-domain-a-auth-secrets
tags: [audit, security, auth, secrets, jwt, cookies, AUDIT-01]
dependency_graph:
  requires: [audit-toolchain-ready]
  provides: [domain-a-findings]
  affects: [109-06]
tech_stack:
  added: []
  patterns: [coverage-attestation, findings-schema-A01]
key_files:
  created: [.planning/audit/domain-auth-secrets.md]
  modified: []
decisions:
  - "Output written in worktree with relative paths and committed on worktree-agent branch (additive only); did NOT write into main's .planning tree or attempt git repair of the stale worktree branch"
  - "proxy.ts/db-schema.ts line numbers read against `main` (worktree branch predates phase 109) so the phase 110-112 remediation queue stays valid against current code; the 4 core auth files are byte-identical to main"
  - "gitleaks + local trufflehog absent — recorded TruffleHog-CI (secret-guard.yml --only-verified) as the git-history fallback per RESEARCH.md, satisfying the acceptance criterion"
  - "semgrep dummy-bcrypt-hash hit triaged as false positive (timing-defense constant), not a leak"
  - "MEMROOS_INTERNAL_API_KEY default credential rated LOW (not high) because seeding is gated behind NODE_ENV !== production and grants only eval-submit/read scopes"
metrics:
  duration: 9m
  completed_date: "2026-06-07"
  tasks_completed: 2
  files_created: 1
---

# Phase 109 Plan 02: Domain A — Auth & Secrets Audit Summary

Audited the Auth & Secrets domain (AUDIT-01) with semgrep (p/secrets + p/jwt, 49 rules / 682 files /
0 errors) plus manual review of all auth code paths, producing `.planning/audit/domain-auth-secrets.md`
with a 9-row Coverage Attestation table and 4 findings: **0 critical, 0 high, 1 medium, 3 low**. No auth
bypass or live secret exposure found; the two real findings are hardening items (JWT-secret strength
enforcement; a working default value in `.env.example`).

## Tasks Completed

| Task | Type | Status | Commit | Files |
|------|------|--------|--------|-------|
| T1: Run automated secret + JWT scans (Domain A) | auto | COMPLETE | af2fa9d | .planning/audit/domain-auth-secrets.md |
| T2: Work manual checklist + write attested report | auto | COMPLETE | 1d361c3 | .planning/audit/domain-auth-secrets.md |

## Findings (severity-ranked)

| Finding ID | Title | Severity | Location | Fix Requirement |
|------------|-------|----------|----------|-----------------|
| A01-001 | JWT secret has no minimum-entropy enforcement at load | medium | apps/memroos/src/lib/auth/jwt.ts:6-11 | SEC-03 |
| A01-002 | Known default internal API key in `.env.example` + dev fallback | low | .env.example:18 / db-schema.ts:795 | SEC-05 |
| A01-003 | Session cookies `SameSite=Lax` (not `Strict`) | low | apps/memroos/src/app/api/auth/login/route.ts:87-89 | none (informational) |
| A01-004 | semgrep dummy-bcrypt-hash hit (false positive) | low | apps/memroos/src/app/api/auth/login/route.ts:52 | none (informational) |

## Coverage Attestation Result

All 9 Domain A manual checklist items attested with no blank rows. Six CLEAN
(JWT alg, token TTLs, refresh revocation, loopback bypass, per-agent keys, and the not-in-source half of
the JWT-secret check), three carry findings (JWT-secret strength → A01-001; cookie SameSite → A01-003;
hardcoded/`.env.example` default → A01-002).

**Prior-baseline regression check (RESEARCH "Do Not Re-Litigate"):** HttpOnly cookies (CR-01),
x-forwarded-host spoofing fix (CR-08), and refresh rotation/revocation all confirmed **present, not
regressed**. STRIDE register T-109-A-01 (JWT alg pinned — confirmed), T-109-A-02 (secret scan — done),
T-109-A-03 (loopback no-spoof — confirmed) all mitigated. No closed Phase 68/69/74-78 findings re-filed.

## Deviations from Plan

### Auto-fixed Issues

None — this is a read-only audit; no source files were modified.

### Scope Adjustments

**1. [Rule 3 - Blocking, resolved without source change] Stale worktree branch lacked phase 109 files**
- **Found during:** Setup
- **Issue:** This worktree branch (`worktree-agent-a3b7656c99eac511a`) was branched before phase 109, so
  `.planning/phases/109-parallel-domain-audit/`, `.planning/audit/`, the plan, RESEARCH, and
  toolchain-baseline do not exist on this branch. They exist in the `main` working tree.
- **Action:** Read PLAN/RESEARCH/baseline from `main`'s tree (read-only orientation); wrote all
  deliverables with **relative paths inside the worktree** and committed them additively on the
  worktree-agent branch. Did NOT modify `main`'s tree and did NOT attempt to merge/reset/repair the
  branch. Additive commits merge cleanly back to main.
- **Impact:** Orchestrator should be aware the branch point predates phase 109 when merging; the new
  files are purely additive.

**2. [Informational] proxy.ts / db-schema.ts line numbers read against `main`**
- **Issue:** `proxy.ts` differs from `main` by 4 deletions (worktree lacks `/api/agent-context/` and
  `/api/skillforge/` in `ROUTE_LOCAL_AUTH_API_ROUTES`); the 4 core auth files are byte-identical to main.
- **Action:** For findings citing proxy.ts/db-schema.ts, line numbers were verified against `main` so the
  remediation queue (phases 110-112) targets current code. Noted in the report's freshness banner.

**3. [Informational] gitleaks + local trufflehog not installed**
- **Issue:** RESEARCH listed gitleaks as a MEDIUM-priority git-history scanner; neither it nor a local
  trufflehog binary is installed.
- **Action:** Recorded reliance on the TruffleHog-CI fallback (`.github/workflows/secret-guard.yml`,
  `--only-verified`) per RESEARCH.md. Local git-history depth scan was not performed; CI gate is the
  active control. This satisfies the "Gitleaks OR TruffleHog-CI fallback noted" acceptance criterion.

## Known Stubs

None — this plan produces an audit report. No code stubs.

## Threat Flags

None — no new security surface introduced (read-only audit). The threat register items T-109-A-01/02/03
were assessed and confirmed mitigated; T-109-A-SC (read-only tool invocation) held (no source writes).

## Self-Check: PASSED

- [x] `.planning/audit/domain-auth-secrets.md` exists — FOUND
- [x] `## Coverage Attestation` present with 9 body rows, no blanks — VERIFIED
- [x] `## Summary Stats` present with 4 severity counts — VERIFIED
- [x] semgrep `/tmp/semgrep-domain-a.json` valid JSON (results=1, errors=0) — VERIFIED
- [x] commit af2fa9d (Task 1) exists — FOUND
- [x] commit 1d361c3 (Task 2) exists — FOUND
- [x] No source files modified (read-only audit) — VERIFIED
- [x] Every finding row has file:line + mapped fix requirement (SEC-03/SEC-05/none) — VERIFIED
