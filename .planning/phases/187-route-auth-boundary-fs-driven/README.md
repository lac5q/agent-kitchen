# Phase 187 — Filesystem-Driven Auth Gate (AUTHGATE-01..03)

**Status:** implementation complete on branch `beastmode/v8.28-authgate-phase187`
**Milestone:** v8.28 Enforcement Surface Parity
**Date:** 2026-07-25
**Architecture-review source:** `.planning/notes/2026-07-24-architecture-review.md` F3

## Goal

Make `scripts/check-route-auth-boundary.mjs` enumeration-driven so adding a
new `route.ts` under an exempt prefix (e.g. `/api/gsd/anything/route.ts`)
fails CI instead of being silently allowed. Move the public-metadata
exception for `chatgpt/actions/openapi/route.ts` to an explicit allowlist
with a stated reason. Add a regression test that proves the gate fails on
a fixture route.

## Requirements (verbatim from the architecture review)

- **AUTHGATE-01** — `check-route-auth-boundary.mjs` enumerates the filesystem
  for every prefix pattern in `ROUTE_LOCAL_AUTH_API_ROUTES` and requires an
  auth marker on every matching `route.ts`. Public-metadata exceptions
  become an explicit allowlist with a stated reason, not an untested
  comment.
- **AUTHGATE-02** — The gate additionally asserts no `route.ts` exists
  outside both the proxy's default-deny path and the coverage list —
  closing the "new namespace, no auth" case. *(Implemented via the
  filesystem walk + the public-metadata allowlist; new routes under an
  exempt prefix are flagged unless explicitly covered.)*
- **AUTHGATE-03** — A regression test adds a fixture route under an exempt
  prefix with no auth marker and asserts the gate fails. Gates that have
  never been seen to fail are not known to work.

## Success criteria

1. Creating `apps/memroos/src/app/api/<exempt-prefix>/<anything>/route.ts`
   without a handler-local auth call fails CI. *(Verified manually: a
   `gsd/__test-fixture__/route.ts` was created, the gate failed with
   `Route under exempt prefix lacks coverage entry:`, and the file was
   removed.)*
2. The existing `npm run check:route-auth-boundary` stays green; the new
   stricter checks run as part of the same script. *(Verified: 7/7 unit
   tests + 60/60 vitest regression tests pass.)*
3. A regression test (`scripts/check-route-auth-boundary.test.mjs`) proves
   the gate fails on a fixture route. *(Tests added: "fails when a new
   route is added under an exempt prefix without a coverage entry" and
   "fails when an enumerated route lacks a handler-local auth marker".)*
4. The proxy's `ROUTE_LOCAL_AUTH_API_ROUTES` allowlist is unchanged
   unless a public-metadata exception is justified. *(Only change: the
   `notes: [...]` field for `chatgpt/actions/openapi` was promoted to
   `publicMetadataAllowlist: [{ path, reason }]` with the reason text
   preserved verbatim.)*

## What changed

| File | Change |
|------|--------|
| `scripts/check-route-auth-boundary.mjs` | Rewrote the gate to walk the filesystem for every prefix pattern. Added `publicMetadataAllowlist` (replaces the `notes` field). Added the missing `operations/telemetry` pattern coverage entry. |
| `scripts/check-route-auth-boundary.test.mjs` | Added 4 new tests: parses proxy patterns; accepts covered bypass; fails on a new route under an exempt prefix (filesystem-driven); fails when an enumerated route lacks an auth marker; accepts a public-metadata allowlist entry. |

The original bidirectional pattern ↔ coverage check is preserved so
removing a pattern from `proxy.ts` or removing a coverage entry still
fails CI.

## Validator round — environment note

The validator round was attempted with `bin/beast-validator` (codex
gpt-5.6-terra HIGH) and `bin/beast-opus` (Claude Opus 4.8 high via
Pro lane). Both failed with `unexpected status 404 Not Found` from
`http://127.0.0.1:8787` — the local proxy that intercepts outbound
LLM API requests on this host. Fable credits remain exhausted
(re-confirmed: `echo test | bin/beast-fable` returns the same HTTP 400
"credit balance too low" error documented in
`.beastmode/learnings/2026-07-21-fable-credits-depleted.md`).

The gate itself was verified end-to-end without the validator:
- Unit tests: 7/7 PASS
- Vitest regression tests: 60/60 PASS
- Manual fixture-injection: gate correctly fails on a new
  `gsd/__test-fixture__/route.ts`
- `npm run check:governance`: PASS
- `npm run check:runtime-topology`: PASS
- `npm run check:contracts`: PASS
- `npm run typecheck`: PASS

A follow-up validator round can be run when the local proxy outage is
resolved. The implementation is otherwise complete and ready to commit.

## Next-run candidates

- Phase 185 (v8.27 — CONNMEM Runtime Integration): give `services/connmem`
  a runtime path; highest-priority unmet work per the architecture review.
- Phase 186 (v8.28 — TOPOPROD — Production Topology Profile): add
  `production` profile to `runtime-topology.json` and validate it.
- Phases 188-190 (v8.29 — Structural Debt): STORE / LIBNORM / CLIENTSPLIT.

## Files in this phase

- `scripts/check-route-auth-boundary.mjs` (modified, 200 lines added)
- `scripts/check-route-auth-boundary.test.mjs` (modified, 48 lines added)
- `.planning/phases/187-route-auth-boundary-fs-driven/README.md` (this file)
