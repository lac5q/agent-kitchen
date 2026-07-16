---
phase: 127-write-side-enforcement-exit-tool
plan: 01
subsystem: export, native-memory, compliance
tags: [dsar, export, tombstone, native-memory, cli, entops]

requires:
  - phase: 126-operator-stub-distribution-directive-budgets
    provides: directive-budget.ts (computeDirectiveBudget, directiveDiff)
  - phase: 125-multi-tenant-vaults-central-audit
    provides: knowledge-chain audit + streamAuditEntries userId filter
provides:
  - memroos export --flat CLI with signed manifest
  - per-user DSAR export (vault + audit) and tombstone delete
  - operator native-memory ingest sink (filter + budget + replay contract)
  - erasure_tombstones schema v30
affects: [MEMLIFE erasure pipeline, harness memory hooks, enterprise exit tooling]

tech-stack:
  added: [bin/memroos.mjs CLI]
  patterns: [warn-only directive enforcement, tombstone-not-delete, honest harness stubs]

key-files:
  created:
    - bin/memroos.mjs
    - bin/memroos-bootstrap.mjs
    - apps/memroos/src/lib/export/flat-export.ts
    - apps/memroos/src/lib/export/dsar-export.ts
    - apps/memroos/src/lib/export/cli.ts
    - apps/memroos/src/lib/native-memory/sink.ts
    - apps/memroos/src/lib/native-memory/filter.ts
    - apps/memroos/src/lib/erasure-tombstone.ts
    - apps/memroos/src/app/api/native-memory/ingest/route.ts
    - apps/memroos/src/app/api/dsar/export/route.ts
    - apps/memroos/src/app/api/dsar/delete/route.ts
  modified:
    - apps/memroos/src/lib/db-schema.ts
    - package.json
    - docs/entops-stub-handoff.md

key-decisions:
  - "Schema migration is v30 (not plan-drafted v4) — current PRAGMA was 29"
  - "erasure_tombstones is distinct from memory_erasure_tombstones (MEMLIFE)"
  - "CLI loads TS via module.register(ts-loader) + --experimental-strip-types"
  - "ENTOPS-07 harness wiring documented as NOT built; sink contract only"

patterns-established:
  - "Exit tooling never deletes audit rows — tombstone + scheduled_purge_at only"
  - "Native-memory replay always uses scanContent cleanContent for HIGH secrets"
  - "Honest stub handoff appended to docs/entops-stub-handoff.md"

requirements-completed: [ENTOPS-08]
# ENTOPS-07 operator sink shipped; per-harness wiring remains stubbed

duration: 6min
completed: 2026-07-16
---

# Phase 127 Plan 01: Write-Side Native-Memory Enforcement + Exit Tool Summary

**Flat-export CLI with signed manifests, DSAR vault+audit packages, non-destructive erasure_tombstones (schema v30), and an operator native-memory ingest sink that filters/budgets/replays without harness wiring**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-07-16T20:48:48Z
- **Completed:** 2026-07-16T20:54:14Z
- **Tasks:** 5 commits (+ metadata)
- **Files modified:** 16 created/modified (plan scope)

## Accomplishments

- ENTOPS-08: `memroos export --flat` / `--dsar` / `delete --user` via `bin/memroos.mjs`
- ENTOPS-08: admin `POST /api/dsar/export` + `POST /api/dsar/delete`; tombstones never break knowledge hash chains
- ENTOPS-07 (code slice): `POST /api/native-memory/ingest` — directive_diff warn, secret redact, budget warn, returns `{replay}`
- Honest stubs for Claude/Hermes/Codex interception appended to `docs/entops-stub-handoff.md`

## Task Commits

1. **Task 1: erasure_tombstones migration** - `ae8033f` (feat)
2. **Task 2: flat export + CLI** - `f50006f` (feat)
3. **Task 3: DSAR export/delete APIs** - `ceddf37` (feat)
4. **Task 4: native-memory sink** - `eb301ce` (feat)
5. **Task 5: ENTOPS-07 handoff append** - `3c38920` (docs)

**Plan metadata:** (pending final docs commit)

## Files Created/Modified

- `bin/memroos.mjs` / `bin/memroos-bootstrap.mjs` — CLI launcher
- `apps/memroos/src/lib/export/flat-export.ts` — org vault tarball + signed manifest
- `apps/memroos/src/lib/export/dsar-export.ts` — per-user vault+audit archive + delete
- `apps/memroos/src/lib/native-memory/{filter,sink}.ts` — operator ingest pipeline
- `apps/memroos/src/lib/erasure-tombstone.ts` — DSAR tombstone helpers
- `apps/memroos/src/lib/db-schema.ts` — migration v30 `erasure_tombstones`
- `apps/memroos/src/app/api/{dsar,native-memory}/**` — HTTP surfaces
- `docs/entops-stub-handoff.md` — ENTOPS-07 harness stub list (append)

## Decisions Made

- Used schema **v30** (plan text said “v4”; live `CURRENT_SCHEMA_VERSION` was 29 after Phase 125/federation work).
- Kept `erasure_tombstones` separate from existing `memory_erasure_tombstones` (MEMLIFE subject erasure).
- DSAR archive prefers `zip` when available, else `.tar.gz` with correct extension.
- Did not modify Claude/Hermes/Codex internals or Hermes MEMORY.md skills-routing.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Schema version conflict**
- **Found during:** Task 1
- **Issue:** Plan drafted “migration v4” but repo already at user_version 29
- **Fix:** Additive migration v30 `dsar-erasure-tombstones`
- **Files modified:** `apps/memroos/src/lib/db-schema.ts`
- **Verification:** erasure-tombstone tests assert `CURRENT_SCHEMA_VERSION >= 30`
- **Committed in:** `ae8033f`

**2. [Rule 3 - Blocking] CLI `@/` alias resolution**
- **Found during:** CLI smoke
- **Issue:** `--import ts-loader` alone did not register the resolve hook
- **Fix:** `bin/memroos-bootstrap.mjs` uses `module.register(ts-loader)` then imports CLI
- **Files modified:** `bin/memroos.mjs`, `bin/memroos-bootstrap.mjs`
- **Verification:** fixture `export --flat` produced tar.gz + manifest
- **Committed in:** `f50006f`

---

**Total deviations:** 2 auto-fixed (both Rule 3 blocking)
**Impact on plan:** Necessary for correctness; no scope creep.

## Issues Encountered

None beyond loader/schema fixes above.

## Known Stubs

| Stub | Location | Reason |
|------|----------|--------|
| Claude auto-memory hook | NOT in repo | ENTOPS-07 harness wiring deferred |
| Hermes `memory add` intercept | NOT in repo | Requires running Hermes; MEMORY.md routing untouched |
| Codex `/memory` router | NOT in repo | ENTOPS-07 harness wiring deferred |
| Full MEMLIFE purge (`purged_at`) | `erasure_tombstones.purged_at` stays null | Later milestone |

## Requirements

| ID | Status |
|----|--------|
| ENTOPS-08 | **Closed** (CLI + DSAR + tombstones) |
| ENTOPS-07 | **Partial** — operator sink shipped; per-harness wiring stubbed in handoff |

## Next Phase Readiness

- Exit tooling usable for SOC2/DSAR demos with vault fixtures
- Harness teams can integrate against `/api/native-memory/ingest` contract
- Blockers for full ENTOPS-07: Claude/Hermes/Codex hooks + live Hermes regression

## Self-Check: PASSED

- [x] `bin/memroos.mjs` exists
- [x] flat-export / dsar-export / native-memory / erasure tests exist
- [x] Commits `ae8033f`, `f50006f`, `ceddf37`, `eb301ce`, `3c38920` present
- [x] Vitest 14/14 passed; typecheck passed; CLI smoke passed

---
*Phase: 127-write-side-enforcement-exit-tool*
*Completed: 2026-07-16*
