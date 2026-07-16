# Phase 148 Summary — Enhanced Contracts + Content Hashing/Signing

**Phase:** 148
**Milestone:** v8.6 Skill Trust Chain
**Requirements:** SKILLTRUST-01, SKILLTRUST-02
**Status:** COMPLETE (2026-07-10)
**Plan:** `.planning/phases/148-enhanced-contracts-hashing/148-01-PLAN.md`

## What was implemented

### SKILLTRUST-01: Enhanced contracts with evidence_examples

- Added `evidence_examples` field to `SkillMdParsed` and `SkillRegistryEntry` interfaces (`string[]` type)
- Added `evidence_examples` to `CONTRACT_COMPLETENESS_FIELDS` — skills without evidence examples are now incomplete and fail-closed for dispatch
- Parser supports three frontmatter formats: comma-separated, bracket array, and YAML array
- Schema column `evidence_examples TEXT NOT NULL DEFAULT '[]'` added to `skill_registry`

### SKILLTRUST-02: Content hashing + signing + trust threshold

- `computeContentHash(rawBody: string): string` — SHA-256 hex of raw_body, computed automatically on every import via `normalizeRegistryEntry`
- `signSkill(contentHash: string, signingKey: string): { signature: string; signedBy: string }` — HMAC-SHA256 of content_hash; `signedBy` defaults to 'operator' (overridable via `MEMROOS_SKILL_SIGNER_ID`)
- `verifySkillSignature(contentHash: string, signature: string, signingKey: string): boolean` — constant-time comparison via `timingSafeEqual`
- `resolveSigningKey(): string | null` — reads `MEMROOS_SKILL_SIGNING_KEY` with fallback to `MEMROOS_OPERATOR_API_KEY`
- Schema columns: `content_hash TEXT`, `signature TEXT`, `signed_by TEXT`, `trust_level TEXT NOT NULL DEFAULT 'unsigned' CHECK(trust_level IN ('unsigned','signed','verified'))`
- Import route (`POST /api/skills/import`) now signs skills automatically when a signing key is available
- `lookupSkillContract` accepts optional `minTrustLevel` parameter — skills below the threshold are denied with an informative reason including both current and required trust levels
- Trust ordering: `unsigned < signed < verified`

## Schema migration

- `CURRENT_SCHEMA_VERSION` changed from 10 to 11
- Migration `applySkillTrustChainSchema` (version 11): additive `ALTER TABLE ... ADD COLUMN` with try/catch idempotency pattern for all 5 new columns
- CREATE TABLE for fresh DBs updated to include all new columns
- Migration is backward-compatible: existing rows default to `evidence_examples='[]'`, `content_hash=NULL`, `signature=NULL`, `signed_by=NULL`, `trust_level='unsigned'`

## Files modified

| File | Change |
|------|--------|
| `apps/memroos/src/lib/db-schema.ts` | Schema version 10→11, migration function, CREATE TABLE update |
| `apps/memroos/src/lib/skills/registry.ts` | evidence_examples parsing, crypto functions, updated interfaces and normalizeRegistryEntry |
| `apps/memroos/src/lib/dispatch/skill-lookup.ts` | trust_level in SkillContractSummary, minTrustLevel parameter, trust ordering |
| `apps/memroos/src/app/api/skills/import/route.ts` | SQL INSERT/UPDATE with new columns, auto-signing, GET SELECT updated |
| `apps/memroos/src/lib/skills/__tests__/registry.test.ts` | Updated FULL_SKILL_MD with evidence_examples, new parsing and field tests |
| `.env.example` | Added `MEMROOS_SKILL_SIGNING_KEY` placeholder |

## Files created

| File | Purpose |
|------|---------|
| `apps/memroos/src/lib/skills/__tests__/skill-trust-chain.test.ts` | Phase 148 tests: hash, signing, verification, trust threshold, round-trip |
| `.planning/phases/148-enhanced-contracts-hashing/148-01-SUMMARY.md` | This summary |

## Verification

- `npm run typecheck` — clean (0 errors)
- `cd apps/memroos && npm run lint` — 0 errors
- Phase 148 focused tests — all pass
- MEMSEC-08 regression corpus (25/25) — byte-identical
- `npm run check:contracts` — clean
- `npm run build` — clean

## Hard constraints preserved

- Zero new npm dependencies (Node built-in `crypto` only)
- MEMSEC-08 regression corpus passes byte-identical (25/25)
- Fail-closed defaults: unsigned skills denied when trust threshold is set
- No raw sensitive payloads in receipts or audit rows
- Schema migration is additive and idempotent
- No security policy files changed (`corpus.json`, `manifest.json`, `policy-gate.ts`, `security-policy.ts`)

## Non-blocking findings

- The CHECK constraint on `trust_level` is enforced at the schema layer for fresh DBs but only at the application layer for migrated DBs (SQLite ALTER TABLE cannot add CHECK constraints). All existing rows default to 'unsigned' which satisfies the constraint.
- The `resolveSigningKey` function reads env vars directly; in cloud environments where env validation runs at startup (`validateMemroosEnvAtStartup`), the skill signing key is not yet part of the typed env module. This is a follow-up surface, not a blocker.
- Existing tests in `skill-dispatch.test.ts` and `skillforge` test files that insert into `skill_registry` without the new columns work correctly because all new columns have defaults (NULL or 'unsigned' or '[]').

## Next steps

- Phase 149: SKILLTRUST-03 (quarantine lane) + SKILLTRUST-04 (governed cross-harness auto-sync)
- Phase 150: SKILLTRUST-05 (lifecycle states + deprecation warnings + dependency view)
