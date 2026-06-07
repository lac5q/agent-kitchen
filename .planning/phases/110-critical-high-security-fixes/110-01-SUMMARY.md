---
phase: 110-critical-high-security-fixes
plan: "01"
subsystem: security
tags: [security, api-key, secrets, hardening, tdd, attestation]
dependency_graph:
  requires: [109-parallel-domain-audit]
  provides: [phase-110-attestation, internal-api-key-validator, SEC-05-fix]
  affects: [db-schema, sdk-eval-service, env-example]
tech_stack:
  added: []
  patterns: [fail-fast-sentinel, rejection-constant-pattern]
key_files:
  created:
    - .planning/audit/phase-110-attestation.md
    - apps/memroos/src/lib/internal-api-key.ts
    - apps/memroos/src/lib/auth/__tests__/api-key-security.test.ts
  modified:
    - apps/memroos/src/lib/db-schema.ts
    - apps/memroos/src/lib/seal/sdk-eval-service.ts
    - .env.example
decisions:
  - "Throw unconditionally on missing MEMROOS_INTERNAL_API_KEY in SdkBackedEvalService (not just in production) — safe because createEvalServiceForSeal factory only constructs it in production anyway"
  - "Remove shouldSeedDevInternalKey branch entirely; no key seeded when env var unset — eliminates publicly-known credential from dev seeding"
  - "SEC-02 is CLEAN for Phase 110 scope: both high findings (B01-001, C01-001) are dependency CVEs routed to SEC-04/Phase 111, not in-scope for SEC-02"
metrics:
  duration: "2m 34s"
  completed: "2026-06-07"
  tasks_completed: 3
  files_created: 3
  files_modified: 3
requirements: [SEC-01, SEC-02, SEC-05, TEST-02]
---

# Phase 110 Plan 01: Critical & High Security Fixes Summary

**One-liner:** Attestation of zero critical/in-scope-high findings, plus fail-fast rejection sentinel for the known default internal API key `memroos-internal-default-key` with regression test.

---

## What Was Built

**Task 1 — SEC-01/SEC-02 attestation document:**
Created `.planning/audit/phase-110-attestation.md` documenting that Phase 109 found 0 critical findings (SEC-01 clean), 0 in-scope high findings (SEC-02 clean for Phase 110), and correctly routing the 2 high CVE findings (B01-001, C01-001) to SEC-04/Phase 111.

**Task 2 — Validator module + fallback removal:**
- Created `apps/memroos/src/lib/internal-api-key.ts` exporting `KNOWN_DEFAULT_INTERNAL_API_KEY` (rejection sentinel constant) and `assertNotDefaultInternalApiKey()` — throws with a clear message if the known default is used at runtime.
- Removed `shouldSeedDevInternalKey` branch from `db-schema.ts`; removed `?? "memroos-internal-default-key"` fallback. DB seeding now requires `MEMROOS_INTERNAL_API_KEY` to be set, and validates it is not the known default before hashing.
- Removed `?? "memroos-internal-default-key"` fallback from `sdk-eval-service.ts` constructor; now throws unconditionally on missing key (not just in production).
- Updated `.env.example` line 94 to replace the working literal with `<generate-with-openssl-rand-hex-32>` and updated the comment to remove the revealing `Value: "..."` sentence.

**Task 3 — Regression test:**
Created `apps/memroos/src/lib/auth/__tests__/api-key-security.test.ts` with 6 tests covering all behavior cases. Pins `KNOWN_DEFAULT_INTERNAL_API_KEY` constant value so any rename is caught.

---

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 8f313fb | docs(110-01): write SEC-01/SEC-02 clean attestation document |
| 2 (RED) | 131dd6d | test(110-01): add failing regression test for A01-002 known default key rejection |
| 2 (GREEN) | 705ee94 | feat(110-01): extract assertNotDefaultInternalApiKey validator; remove known-default fallbacks |

---

## Verification Results

All tests pass:
- `src/lib/auth/__tests__/api-key-security.test.ts` — 6/6 pass
- `src/lib/auth/__tests__` (full suite) — all pass
- `src/lib/seal/__tests__/sdk-eval-service.test.ts` — all pass
- `src/app/api/public/__tests__/v1.test.ts` — 14/14 pass (including the "does not seed hard-coded internal API key in production" test)

Literal default absent from source (verified):
```
grep -rn '"memroos-internal-default-key"' apps/memroos/src/ | grep -v "internal-api-key.ts" | grep -v "\.test\."
# Output: empty (PASS)
```

`.env.example` confirmed:
```
MEMROOS_INTERNAL_API_KEY=<generate-with-openssl-rand-hex-32>
```

---

## Deviations from Plan

### Auto-applied decisions

**1. [Rule 2 - Critical Functionality] Unconditional throw in SdkBackedEvalService**

The plan said: `Widen the production guard: if !apiKey (not just NODE_ENV === "production"), throw`. This was applied. The advisor confirmed this is safe because `createEvalServiceForSeal` (the factory) only instantiates `SdkBackedEvalService` when `NODE_ENV === "production"`, so no dev code path is broken.

**2. gitnexus impact: CRITICAL flag on initSchema (expected, not blocking)**

`gitnexus impact "initSchema"` returned CRITICAL (184 impacted items, 40 processes). This is the structural blast radius of the entire database initializer. The change is targeted to lines 792-801 (seeding block only) with no schema changes. All 45 tests pass confirming no regression. CLAUDE.md requires reporting this — reported above.

---

## TDD Gate Compliance

| Gate | Commit | Status |
|------|--------|--------|
| RED (test/* commit before implementation) | 131dd6d | PASS |
| GREEN (feat/* commit after RED) | 705ee94 | PASS |
| REFACTOR | n/a — no cleanup needed | N/A |

---

## Self-Check: PASSED

- [x] `.planning/audit/phase-110-attestation.md` exists and contains SEC-01, SEC-02, B01-001, SEC-04
- [x] `apps/memroos/src/lib/internal-api-key.ts` exists, exports KNOWN_DEFAULT_INTERNAL_API_KEY and assertNotDefaultInternalApiKey
- [x] `apps/memroos/src/lib/db-schema.ts` no longer contains `shouldSeedDevInternalKey` or `?? "memroos-internal-default-key"`
- [x] `apps/memroos/src/lib/seal/sdk-eval-service.ts` no longer contains `?? "memroos-internal-default-key"`
- [x] `.env.example` line 94 contains `<generate-with-openssl-rand-hex-32>`
- [x] `apps/memroos/src/lib/auth/__tests__/api-key-security.test.ts` exists and all 6 tests pass
- [x] Commits 8f313fb, 131dd6d, 705ee94 present in git log

## Known Stubs

None. All data flows are wired.

## Threat Flags

None. No new network endpoints, auth paths, or trust boundaries introduced. Changes are purely subtractive (removing a known-default fallback) plus additive validator.
