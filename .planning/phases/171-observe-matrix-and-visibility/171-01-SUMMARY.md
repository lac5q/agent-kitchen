# Phase 171 — OBSERVE-13..14 matrix drift-check + operator visibility

**Completed:** 2026-07-18
**Branch:** `gsd/v8.16-phase-171-observe-matrix-visibility` (merged to main as part of `0f6c16f9`)
**Commits:** `93b107ab` feat(observe): v8.16 Phase 171 matrix drift-check + operator visibility

## Scope

Closed v8.16 OBSERVE-13 (matrix + drift-check) and OBSERVE-14 (operator visibility + Wave-1 smoke).

## Implementation summary

### OBSERVE-13 — matrix + drift-check automation

- `scripts/check-observe-maturity-drift.mjs` (NEW): parses `ObserveHarness` union + `OBSERVE_HARNESS_PATHS`, installer TARGETS rows, and the matrix section. Exits non-zero if any harness is in catalog but missing from matrix or installer (or vice versa), with per-harness diagnostics. Treats `factory → droid` as an alias bridge.
- `scripts/check-observe-maturity-drift.test.mjs` (NEW): 17 unit tests covering parser, evaluator, synthetic drift fixtures, and committed-source run.
- Wired `check:observe-maturity-drift` into both `package.json` and `apps/memroos/package.json`, plus `.github/workflows/ci.yml` (alongside `check:future-spikes`).
- `docs/runtime-adapter-maturity.md` re-anchored with Phase 171 marker, `Platform key` column, per-wave rows, installer TARGETS sync note, operator visibility section.

### OBSERVE-14 — operator visibility + Wave-1 smoke

- `apps/memroos/src/lib/observe-health.ts`: `ObserveHarnessHealth` extended with `errorCount` (counts `agent_session_captures.status='failed'`) and `agentsByHarness` (counts `registered_agents.platform` with `factory → droid` alias). `platformKeyForHarness` helper exposed.
- `apps/memroos/src/app/api/observe/health/route.ts` exposes the new fields through the existing endpoint.
- `apps/memroos/src/lib/__tests__/observe-wave1-smoke.test.ts` (NEW): drives a tmpdir Pi JSONL through `captureCodingAgentSession` at `depth=relevant`, asserts ≥1 durable candidate appears without any `knowledge_write` call, and verifies `listObserveHarnessHealth` reflects the capture (`captureCount === 1`, `errorCount === 0`, `agentsByHarness === 0`, `notes` matches `/Pi sessions/i`, `lastCaptureAt` is 2026-).

## Verification

- Drift-check on committed sources: OK (catalog=8, matrix=8, installer=12; informational: gemini/grok/opencode/qwen/zcode not in observe catalog by design).
- Drift-check on synthetic drift fixtures: catches both drift directions with per-harness diagnostics.
- Lint: 0 errors.
- Typecheck: clean.
- `test:fast`: all observe-* tests green (8+2+6+1+4 = 21 new/extended tests).

## Constraints honored

- No new runtime npm dependencies.
- MEMSEC-08 regression corpus byte-identical (`security-policy.ts` empty diff; no `policy-gate.ts`).
- Phase 170 tests still pass (8/8 in `observe-sidecar.test.ts`).
- No schema migrations; reused `agent_session_captures.status` enum and `registered_agents.platform` column.

## Follow-ups

- Pre-existing `pulse-strip.test.tsx` failure tracked separately.
- Installer TARGETS for openclaw remains runtime-workspace-discovery (alias bridge handles it).
