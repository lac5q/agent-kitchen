---
phase: 148-skill-contracts-signing
plan: "01"
subsystem: skills
tags: [skill-trust, contracts, signing, ed25519, provenance, registry]
requires:
  - phase: 98-skill-distribution-core
    provides: skill registry + progressive loading baseline
provides:
  - 11-field skill contracts including evidence_examples
  - Ed25519 content-hash signing and provenance on publish/import
  - Fail-closed dispatch on incomplete contracts / unsigned below threshold
affects: [149-skill-quarantine-governed-sync, 150-skill-lifecycle]
tech-stack:
  added: []
  patterns: [fail-closed contract gate, content-hash + Ed25519 provenance]
key-files:
  created:
    - apps/memroos/src/lib/skills/skill-signing.ts
  modified:
    - apps/memroos/src/lib/skills/registry.ts
    - apps/memroos/src/app/api/skills/sign/route.ts
    - apps/memroos/src/app/api/skills/verify/route.ts
    - apps/memroos/src/app/api/skills/import/route.ts
key-decisions:
  - "evidence_examples is the 11th required contract field; incomplete contracts fail closed at dispatch"
  - "Signing is Ed25519 over content hash; registry stores author/source/signature provenance"
requirements-completed: [SKILLTRUST-01, SKILLTRUST-02]
duration: planning-closeout
completed: 2026-07-16
---

# Phase 148 Plan 01: Skill Contracts + Signing Summary

**Eleven-field skill contracts with Ed25519 content-hash signing and registry provenance — dispatch stays fail-closed on incomplete or untrusted skills.**

## Performance

- **Completed:** 2026-07-16 (planning closeout; product code already shipped)
- **Tasks:** planning closeout only (no new product commits in this closeout)
- **Code commits (prior):** `0f511a6`, `6388547`, `819b42c`

## Accomplishments

- Extended skill contracts so every registered skill carries preconditions, allowed tools, risk tier, verification checks, owner, rollback behavior, and `evidence_examples`.
- Added Ed25519 signing over content hashes at publish/import; registry records author, source harness/marketplace, and signature.
- Wired operator sign/verify APIs and kept dispatch fail-closed when contracts are incomplete or policy requires a signed trust threshold.

## Key Modules

| Module | Role |
|--------|------|
| `apps/memroos/src/lib/skills/registry.ts` | Contract completeness gate + provenance fields on register/dispatch |
| `apps/memroos/src/lib/skills/skill-signing.ts` | Content hash, Ed25519 sign/verify, trust-threshold helpers |
| `apps/memroos/src/app/api/skills/sign/route.ts` | Operator sign endpoint |
| `apps/memroos/src/app/api/skills/verify/route.ts` | Signature verification endpoint |
| `apps/memroos/src/app/api/skills/import/route.ts` | Import path records signed provenance |
| `apps/memroos/src/lib/skills/__tests__/skill-signing.test.ts` | Signing/verify unit coverage |
| `apps/memroos/src/lib/skills/__tests__/registry.test.ts` | Contract + registry dispatch gates |
| `apps/memroos/src/app/api/skills/__tests__/sign-verify-routes.test.ts` | HTTP sign/verify routes |

## Task Commits (product — already on main)

1. **SKILLTRUST-01 evidence_examples** — `0f511a6`
2. **SKILLTRUST-02 Ed25519 signing layer** — `6388547`
3. **Dispatch fallback / identity / evidence follow-through** — `819b42c`

## Decisions Made

- Planning dirs were missing because code landed without GSD closeout; this SUMMARY records shipped reality without rewriting product code.
- Contract field set is authoritative in `registry.ts`; signing crypto lives in `skill-signing.ts` only.

## Deviations from Plan

None for this closeout — documentation-only. Product deviations (if any) were absorbed in the original feature commits above.

## Known Stubs

None for SKILLTRUST-01/02 goals.

## Self-Check

- [x] Modules cited exist under `apps/memroos/src/lib/skills/` and `apps/memroos/src/app/api/skills/`
- [x] Requirements SKILLTRUST-01, SKILLTRUST-02 marked complete in REQUIREMENTS.md on closeout
- [x] No `apps/` code changed in this closeout

## Self-Check: PASSED
