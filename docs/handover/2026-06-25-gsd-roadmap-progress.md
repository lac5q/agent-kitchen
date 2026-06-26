# GSD Roadmap Progress — 2026-06-25

## Completed in this checkpoint

- Added the first deterministic Phase 118 proactive recollection implementation slice.
- Implemented trigger decisions for `before_plan`, `before_tool_use`, `before_dispatch`, and `before_final` gates.
- Implemented bounded tier-aware query planning with healthy-tier filtering and no implicit cross-project recall.
- Implemented candidate ranking with relevance, recency, salience, source freshness, prior usefulness, policy risk, and authorization denial handling.
- Implemented context pack assembly with injected/ignored candidate receipts.
- Added focused unit coverage for skip receipts, required recollection, query planning, ranking, thresholding, and policy-denied ignored reasons.
- Added `npm run check:roadmap-priority` as a guardrail so deferred spike requirements cannot be marked approved while the active Phase 115 and Phase 117 steps remain incomplete.

## Roadmap mapping

This checkpoint covers the deterministic library foundation for `RECOLLECT-01` through `RECOLLECT-04` from `.planning/notes/2026-06-23-proactive-recollection-gsd-requirement.md`:

- `RECOLLECT-01`: trigger policy and skip/search receipts.
- `RECOLLECT-02`: bounded task/entity/source query planning and scoped tiers.
- `RECOLLECT-03`: ranking signals for relevance, recency, salience, freshness, prior usefulness, and policy risk.
- `RECOLLECT-04`: context pack assembler with threshold-cleared injection receipts.

## Mandatory order before spikes

Finish the roadmap-prioritized steps 1-4 before starting or approving bounded spikes:

1. Phase 115 trust-boundary hardening.
2. Phase 115 runtime and config hardening.
3. Public evidence refresh.
4. Phase 117 NOC efficiency telemetry.

Deferred spike requirements (`MEMGEN-FOLLOWUP-02`, `COCOINDEX-FOLLOWUP-01`, `FASTCONTEXT-FOLLOWUP-01`, and `ADKA2A-FOLLOWUP-01`) must remain unapproved until the active `ARCHREV-*` and `EFFTEL-*` requirements are complete or a future planning update explicitly changes that priority.

## Remaining recommended next work

- Finish the Phase 115 trust-boundary and runtime/config hardening steps before any spike work.
- Reconcile public evidence surfaces after Phase 115 hardening is demonstrable.
- Implement the Phase 117 NOC telemetry seam before wiring proactive recollection into dispatch/route runtime gates.
- Persist recollection receipts to the existing trace/audit surfaces for `RECOLLECT-05` only after the telemetry seam exists.
- Surface recollection/no-recollection receipts in operator UI or NOC telemetry for `RECOLLECT-06` and Phase 117 metrics after the telemetry event contract is live.
- Add memory-eval fixtures for recent low-value, old critical, stale source, operator re-ask, and rediscovered fact scenarios.
- Re-run focused Vitest after restoring the missing Rolldown optional native binding in `node_modules`.

## Verification status

- Focused Vitest was attempted with `npm --prefix apps/memroos run test -- src/lib/gsd/__tests__/proactive-recollection.test.ts`.
- The test runner could not start because the local install is missing `@rolldown/binding-linux-x64-gnu`, an optional native dependency required by Vitest/Rolldown in this environment.
- Roadmap priority can be checked with `npm run check:roadmap-priority`.
