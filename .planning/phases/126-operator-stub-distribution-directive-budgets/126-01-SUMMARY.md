---
phase: 126-operator-stub-distribution-directive-budgets
plan: 01
subsystem: infra
tags: [directive-budget, operator-stub, onboarding, entops, warn-only]

requires:
  - phase: 125-multi-tenant-vaults-central-audit
    provides: operator API-key auth pattern for admin endpoints
provides:
  - Warn-only per-tenant directive budgets + diff API
  - Operator-stub installer mode without corpus-clone fallback
  - First-day onboarding verification script
  - Honest stub handoff for IdP/MDM/S9/S10
affects: [127-write-side-native-memory, day-1-onboarding, enterprise-operator]

tech-stack:
  added: []
  patterns:
    - skill-budget ok/watch/over status model reused for directives
    - warn-only enforcement (never auto-trim)
    - MEMROOS_OPERATOR_URL aliases MEMROOS_APP_URL

key-files:
  created:
    - apps/memroos/src/lib/directive-budget.ts
    - apps/memroos/src/lib/__tests__/directive-budget.test.ts
    - apps/memroos/src/app/api/directives/budget/route.ts
    - apps/memroos/src/app/api/directives/diff/route.ts
    - scripts/memroos-operator-stub.sh
    - scripts/verify-first-day-onboarding.sh
    - docs/entops-stub-handoff.md
  modified:
    - scripts/install-agent-integrations.sh
    - scripts/setup-codex-cloud.sh

key-decisions:
  - "Directive enforcement is warn_only — no trim/delete write path"
  - "Operator MCP uses memroos-operator-stub.sh proxy rather than inlining curl in every config"
  - "IdP/MDM/S9/S10 remain documented stubs, not faked green paths"

patterns-established:
  - "Operator stub mode: MEMROOS_OPERATOR_URL set + not --local → operator stub; --local → memroos-mcp.sh"
  - "Budget APIs accept admin session or MEMROOS_OPERATOR_API_KEY / MEMROOS_AGENT_API_KEY"

requirements-completed: [ENTOPS-06]
requirements-code-slice: [ENTOPS-04, ENTOPS-05, ENTOPS-06]
requirements-still-open: [ENTOPS-04 IdP/OAuth half, ENTOPS-05 MDM/locked-down Mac, S9, S10]

duration: 4min
completed: 2026-07-16
---

# Phase 126 Plan 01: Operator-Stub Distribution + Directive Budgets Summary

**Warn-only directive budgets (default 200 lines), operator-stub installer without corpus-clone fallback, and first-day verification with explicit IdP/MDM/S9/S10 handoff stubs**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-07-16T20:43:12Z
- **Completed:** 2026-07-16T20:47:34Z
- **Tasks:** 4
- **Files modified:** 9 created/changed (plan deliverables)

## Accomplishments

- ENTOPS-06: `computeDirectiveBudget` + `directiveDiff` with structural no-auto-trim tests; admin budget/diff APIs
- ENTOPS-04 code: installer operator-stub mode + `memroos-operator-stub.sh`; `--local` solo escape; setup-codex-cloud URL alias
- ENTOPS-05 code: `verify-first-day-onboarding.sh` pass/fail checklist; `docs/entops-stub-handoff.md` lists what is NOT built

## Task Commits

1. **Task 1: Directive budget library** — `c17098d` (feat)
2. **Task 2: Budget + diff API routes** — `567eb81` (feat)
3. **Task 3: Operator-stub installer** — `9e3ec14` (feat)
4. **Task 4: First-day verifier + handoff** — `251bd0d` (feat)

**Plan metadata:** (pending docs commit)

## Files Created/Modified

- `apps/memroos/src/lib/directive-budget.ts` — budget + warn-only diff + tenant overrides
- `apps/memroos/src/lib/__tests__/directive-budget.test.ts` — 11 tests including structural no-trim
- `apps/memroos/src/app/api/directives/budget/route.ts` — admin GET/POST
- `apps/memroos/src/app/api/directives/diff/route.ts` — warn-only GET diff
- `scripts/install-agent-integrations.sh` — operator-stub / `--local`
- `scripts/memroos-operator-stub.sh` — operator MCP proxy
- `scripts/setup-codex-cloud.sh` — `MEMROOS_OPERATOR_URL` ↔ `MEMROOS_APP_URL`
- `scripts/verify-first-day-onboarding.sh` — day-1 checklist
- `docs/entops-stub-handoff.md` — honest stubs list

## What is stubbed (NOT built)

See `docs/entops-stub-handoff.md`:

- IdP / OAuth device-flow (ENTOPS-04 IdP half)
- MDM packaging / signed `.pkg` / locked-down Mac proof (ENTOPS-05)
- S9 and S10 live demos

## Verification Results

```text
cd apps/memroos && npx vitest run src/lib/__tests__/directive-budget.test.ts
  → 11 passed

npm run typecheck
  → passed

bash scripts/verify-first-day-onboarding.sh --local
  → PASS (first-day checklist)

grep -c "git clone" scripts/install-agent-integrations.sh
  → documentation mention only; operator mode adds no clone fallback (GUARD_OK)
```

## Decisions Made

- Reused skill-budget status vocabulary (`ok`/`watch`/`over`) for directives
- Auth on budget/diff routes mirrors audit/knowledge: admin role or operator/agent API key
- GitNexus impact on `authenticateUser` / `authorizeRegistryWrite` was CRITICAL — those symbols were **not** modified; new routes only call them

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Operator-mode self-grep false positive**
- **Found during:** Task 3
- **Issue:** Guard grepped installer for `git clone` including its own error string / comments
- **Fix:** Narrowed guard to executable-line patterns; reworded stub messages to avoid false positives
- **Files modified:** `scripts/install-agent-integrations.sh`, `scripts/memroos-operator-stub.sh`
- **Committed in:** `9e3ec14`

**2. [Rule 2 - Missing Critical] MEMROOS_APP_URL alias wiring**
- **Found during:** Task 3
- **Issue:** Plan required setup-codex-cloud to honor `MEMROOS_OPERATOR_URL`
- **Fix:** Bidirectional alias with `MEMROOS_APP_URL` + env_vars list update
- **Files modified:** `scripts/setup-codex-cloud.sh`
- **Committed in:** `9e3ec14`

---

**Total deviations:** 2 auto-fixed  
**Impact on plan:** Correctness only; no scope creep.

## Issues Encountered

- Full `install-agent-integrations.sh` end-to-end install cannot run in this checkout because `.agents/skills/memroos-save/SKILL.md` is gitignored and absent — pre-existing. MCP upsert logic verified in isolation; `--local` verifier passed against real `~/.memroos`.

## Requirements

| ID | Status |
|----|--------|
| ENTOPS-06 | **Closed** (code + tests) |
| ENTOPS-04 | **Code slice closed**; IdP/OAuth device-flow still open |
| ENTOPS-05 | **Code slice closed**; MDM / locked-down Mac / S9 still open |

## User Setup Required

None for local solo. Operator mode needs `MEMROOS_OPERATOR_URL` (or `MEMROOS_APP_URL`) and optionally `MEMROOS_AGENT_API_KEY`.

## Next Phase Readiness

- Phase 127 can consume `directive_diff` and budget APIs for write-side native-memory enforcement
- IdP/MDM remain blocked on operator infrastructure (handoff doc)

## Self-Check: PASSED

- FOUND: `apps/memroos/src/lib/directive-budget.ts`
- FOUND: `apps/memroos/src/lib/__tests__/directive-budget.test.ts`
- FOUND: `apps/memroos/src/app/api/directives/budget/route.ts`
- FOUND: `apps/memroos/src/app/api/directives/diff/route.ts`
- FOUND: `scripts/install-agent-integrations.sh`
- FOUND: `scripts/memroos-operator-stub.sh`
- FOUND: `scripts/verify-first-day-onboarding.sh`
- FOUND: `docs/entops-stub-handoff.md`
- FOUND commits: `c17098d`, `567eb81`, `9e3ec14`, `251bd0d`

---
*Phase: 126-operator-stub-distribution-directive-budgets*
*Completed: 2026-07-16*
