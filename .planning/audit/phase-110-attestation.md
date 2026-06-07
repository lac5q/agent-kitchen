---
phase: 110-critical-high-security-fixes
generated: 2026-06-07
audited-by: "Phase 109 parallel domain audit"
requirements: [SEC-01, SEC-02]
---

# Phase 110 Security Attestation

Attestation document confirming the Phase 109 audit results for SEC-01 and SEC-02, and routing the SEC-05 work item.

---

## SEC-01 Attestation — Critical Findings

**Status: CLEAN — Zero critical findings.**

Phase 109 audited all four security domains in parallel (Wave 2):
- Domain A — Auth & Secrets (audit plan 109-02)
- Domain B — API Surface (audit plan 109-03)
- Domain C — Data & Memory (audit plan 109-04)
- Domain D — Architecture (audit plan 109-05)

The FINDINGS-INDEX.md Severity Summary table confirms:

| Severity | Count |
|----------|-------|
| critical | **0** |
| high | 2 |
| medium | 7 |
| low | 12 |
| info | 3 |

Zero critical-severity findings were identified across all four domains. SEC-01 is therefore **CLEAN**. No remediation actions are required under SEC-01.

---

## SEC-02 Attestation — High Findings (Non-CVE, Non-Secret)

**Status: CLEAN — Zero in-scope high findings for Phase 110.**

Phase 109 identified exactly two high-severity findings:

| Finding ID | Domain | Title | Disposition |
|------------|--------|-------|-------------|
| B01-001 | B — API Surface | Next.js v16.2.4 middleware/proxy-bypass CVEs (GHSA-26hh-7cqf-hhc6, GHSA-492v-c6pp-mqqv, GHSA-267c-6grr-h53f) | **Dependency CVE → routed to SEC-04/Phase 111** |
| C01-001 | C — Data/Memory | mem0ai 0.1.118 — 4 known CVEs (no upgrade path below major version jump to 2.0.x) | **Dependency CVE → routed to SEC-04/Phase 111** |

SEC-02 covers high-severity findings that are **NOT** dependency CVEs and **NOT** hardcoded secrets/credentials. Both high findings (B01-001 and C01-001) are dependency CVEs and are therefore explicitly excluded from SEC-02 scope per the type-based routing rule.

**Zero high findings fall in SEC-02 scope.** SEC-02 is CLEAN for Phase 110.

The two high CVE findings (B01-001, C01-001) remain **OPEN** and are tracked under SEC-04 in Phase 111. They are not resolved by Phase 110.

---

## SEC-05 Work Item

**Finding:** A01-002 — Known default internal API key shipped in `.env.example` and used as dev fallback.

- **Severity:** low
- **Location:** `.env.example:94` / `apps/memroos/src/lib/db-schema.ts:792-801` / `apps/memroos/src/lib/seal/sdk-eval-service.ts:95`
- **Source finding:** `.planning/audit/domain-auth-secrets.md` § A01-002
- **Mapped Fix Requirement:** SEC-05 (hardcoded/default credential in source)

**Remediation status:** Fixed in Plan 110-01 (Tasks 2–4):
- Task 2 creates `apps/memroos/src/lib/internal-api-key.ts` — a shared `assertNotDefaultInternalApiKey()` validator that rejects the known default value at runtime.
- Task 2 removes the `?? "memroos-internal-default-key"` fallback from `db-schema.ts` (seeding block) and `sdk-eval-service.ts` (constructor).
- Task 2 updates `.env.example` line 94 to replace the literal working value with a safe placeholder.
- Task 3 adds a regression test pinning the rejection sentinel to `"memroos-internal-default-key"`.

---

## Phase 110 Closure Summary

| Requirement | Status | Notes |
|-------------|--------|-------|
| SEC-01 | **CLEAN** | 0 critical findings across all four domains |
| SEC-02 | **CLEAN** (Phase 110 scope) | 0 in-scope high findings; 2 CVE highs (B01-001, C01-001) deferred to Phase 111 SEC-04 |
| SEC-05 | **FIXED** | A01-002 remediated in this plan (Tasks 2–4) |
