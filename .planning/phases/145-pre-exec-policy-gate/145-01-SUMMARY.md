# Phase 145 Summary — Pre-Execution Policy Gate (OPA/Rego)

**Phase:** 145  
**Milestone:** v8.5 Agent Fleet Plane  
**Requirements:** FLEET-13..16  
**Status:** COMPLETE / LOCKED  
**Date:** 2026-07-09  
**Validator:** beastmode-validator (GLM-5.2 BYOK) — **PASS**

## Goal
Add a pre-execution policy evaluation at the GSD adapter boundary so governance is not only post-hoc audit. The gate runs after the GSD safety check and before the adapter action is executed.

## Deliverables

1. **`apps/memroos/src/lib/gsd/adapter-policy-gate.ts`** — Thin, fail-closed wrapper around the existing POLGOV `evaluatePolicy` engine. Synthesizes a minimal `RemoteAgentConfig` for the adapter boundary and returns the full `PolicyEvaluation` (receipt + capability decision). Engine exceptions are caught and returned as a deny receipt.
2. **`apps/memroos/src/app/api/gsd/adapter/route.ts`** — Wired the gate on the `POST /api/gsd/adapter` Hermes/T1 path:
   - `runGsdAdapterSafetyCheck` → `runGsdAdapterPolicyGate` → `executeGsdAdapterAction`.
   - Denied actions return HTTP 403 with an operator-visible policy receipt (`policyVersion`, `domain`, `action`, `ruleMatched`, `outcome`, `reason`, `actorId`, `createdAt`).
   - `detail` and other internal fields are deliberately omitted from the HTTP response.
3. **Unit tests** (`apps/memroos/src/lib/gsd/__tests__/adapter-policy-gate.test.ts`) — 7 tests covering:
   - Allow when target declares dispatch capability.
   - Deny when target lacks capability.
   - POLICY_DECISION audit row is written.
   - No raw payload content leaks into the receipt detail.
   - Fail-closed when `evaluatePolicy` throws.
   - Works without a database handle.
   - Every GSD adapter id maps to a valid `RemoteAgentConfig` shape.
4. **Integration tests** (`apps/memroos/src/app/api/gsd/adapter/__tests__/route.test.ts`) — 2 tests covering:
   - Denied action returns 403 with a policy receipt.
   - Allowed action proceeds to execute.

## Requirement Coverage

| Requirement | How it is satisfied |
|-------------|---------------------|
| **FLEET-13** | Gate runs before tool execution on the Hermes/T1 `POST /api/gsd/adapter` path. |
| **FLEET-14** | Deny blocks execution and returns a policy receipt including policy version, rule matched, and reason; POLGOV emits a `POLICY_DECISION` audit row. |
| **FLEET-15** | Gate is fail-closed: exceptions return deny, and `isGsdAdapterPolicyAllowed` requires `outcome === "allow"`. No silent-allow or last-used bypass. |
| **FLEET-16** | MEMSEC-08 security regression corpus remains green (25/25 pass); corpus file and policy manifest are untouched. |

## Verification

- `npm test -- --run src/lib/gsd/__tests__/adapter-policy-gate.test.ts src/app/api/gsd/adapter/__tests__/route.test.ts` → **9/9 passed** (7 gate + 2 route).
- `npm run typecheck` → **clean** (exit 0).
- `npm run lint` → **0 errors**, 37 pre-existing warnings (none in new files).
- MEMSEC-08 regression corpus → **25/25 passed**.
- Independent adversarial validation (GLM-5.2 BYOK) → **PASS** with no blocking findings.

## Design Notes / Guardrails

- **No policy logic reimplemented.** The gate only builds the `PolicyRequest` shape and delegates to `evaluatePolicy` in `@/lib/policy/engine`.
- **No new runtime dependencies.** All imports are in-repo `@/lib/*` modules.
- **Receipt hygiene.** The HTTP response cherry-picks 8 safe receipt fields; `detail`, `actorRole`, and `tenantId` are kept out of the wire response.
- **Exception safety.** `runGsdAdapterPolicyGate` catches engine errors and returns a synthetic deny receipt so the adapter route never crashes on policy-engine failure.

## Non-blocking Findings (from validator)

1. `adapterPlatform` maps `discord` and `telegram` to `"hermes"` by default; platform is not used by the capability decision today. Tighten if POLGOV ever keys off `platform`.
2. The adapter target uses a type cast for `protocol: "gsd"` because `gsd` is not in the `AgentProtocol` enum; `checkDispatchPolicy` does not inspect `protocol`, so this is functionally inert.
3. Exception-path receipts use `policyVersion: "unknown"` and `ruleMatched: "gate.error"`, making them distinguishable from engine-produced denies.
4. `route.test.ts` prints a pre-existing `[Memroos] No users exist...` seeding message to stderr; it is cosmetic and does not affect test results.

## Deferred / Out of Scope

- Shadow/dry-run mode was listed as optional in the plan; it is not implemented in this first ship. The gate is enforce-mode by default.
- Paperclip tenant/cost delegation remains for Phase 146 (FLEET-17..20).
