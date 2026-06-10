# Deferred Items — Phase 114 Plan 01

## Pre-existing Build Failure (Out of Scope)

**File:** `apps/memroos/src/app/api/dispatch/route.ts:28`
**Error:** `TS2554: Expected 2-3 arguments, but got 1` — `z.record(z.unknown()).optional()` fails with current zod version.
**Status:** Pre-existing before this phase. Confirmed by reverting all changes and reproducing the error on the base commit.
**Owner:** Future phase — fix zod schema to use `z.record(z.string(), z.unknown()).optional()`.
