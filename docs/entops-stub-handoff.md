# EntOps Stub Handoff — Phase 126

**Creation date:** 2026-07-16  
**Update date:** 2026-07-16  
**Document version:** 2026-07-16.1  
**Source:** `.planning/phases/126-operator-stub-distribution-directive-budgets/126-01-PLAN.md`, `.planning/REQUIREMENTS.md` (ENTOPS-04/05/06), ROADMAP S9/S10  
**Data gathered:** 2026-07-16 (code-slice delivery; no live MDM/IdP lab)

## Purpose

Phase 126 ships the **code slices** for operator-stub distribution, first-day verification, and directive budgets. Several enterprise surfaces remain **honest stubs** — documented here so operators do not mistake them for finished product.

## Shipped in this phase (code)

| ID | What shipped |
|----|----------------|
| ENTOPS-06 | `directive-budget.ts`, admin `POST/GET /api/directives/budget`, warn-only `GET /api/directives/diff` — **never auto-trims** |
| ENTOPS-04 (installer half) | `install-agent-integrations.sh` operator-stub mode via `MEMROOS_OPERATOR_URL` / `MEMROOS_APP_URL`; `--local` solo escape hatch; `memroos-operator-stub.sh`; **no git-clone fallback** in operator mode |
| ENTOPS-05 (script half) | `scripts/verify-first-day-onboarding.sh` pass/fail checklist |

## NOT built (honest stubs)

| Item | Requirement / scenario | Status | Follow-up |
|------|------------------------|--------|-----------|
| IdP / OAuth device-flow auth | ENTOPS-04 IdP half | **NOT built** — installer uses existing API-key / operator URL only | Device-flow OAuth against corporate IdP |
| MDM-deployable installer / signed `.pkg` | ENTOPS-05 | **NOT built** — no MDM packaging or signed Mac installer | Operator infra: MDM profile + pkg signing |
| Locked-down corporate Mac (no admin) proof | ENTOPS-05 / S9 | **NOT built** — no lab Mac verification in this slice | Run S9 on a real managed Mac |
| S9 live demo | ROADMAP S9 | **NOT built** — invite → MDM → verification end-to-end | Needs hosted operator + MDM + locked-down Mac |
| S10 live demo (operator outage at 50 seats) | ROADMAP S10 | **NOT built** — installer guards git-clone in operator mode only | Load/failover exercise on hosted operator |
| Fake OAuth / fake MDM | — | **Explicitly refused** — do not simulate IdP tokens or MDM installs in CI as “green” | Keep stubs documented until real infra exists |

## Operator mode hard rules (shipped)

1. When `MEMROOS_OPERATOR_URL` (or `MEMROOS_APP_URL`) is set and `--local` is **not** passed, MCP config points at `scripts/memroos-operator-stub.sh`.
2. Operator mode **must not** add a `git clone` fallback (exfiltration path under the guise of resilience).
3. `--local` restores today’s local `memroos-mcp.sh` behavior for solo developers.
4. Directive budgets are **warn + diff only** — no silent deletion of user directive content.

## Verification commands

```bash
cd apps/memroos && npx vitest run src/lib/__tests__/directive-budget.test.ts && npm run typecheck
bash scripts/verify-first-day-onboarding.sh --local
grep -c "git clone" scripts/install-agent-integrations.sh   # expect 0 (or docs-only mentions; operator mode must not add a fallback)
```

## Handoff owners

- **Platform / IdP:** OAuth device flow + token exchange into `MEMROOS_AGENT_API_KEY` (or successor).
- **Desktop / MDM:** Signed installer distribution, non-admin install path, first-boot verification.
- **SRE:** S10 outage drill proving honest degrade without laptop corpus pulls.

---

# EntOps Stub Handoff — Phase 127 (append)

**Creation date:** 2026-07-16  
**Update date:** 2026-07-16  
**Document version:** 2026-07-16.2  
**Source:** `.planning/phases/127-write-side-enforcement-exit-tool/127-01-PLAN.md`, `.planning/REQUIREMENTS.md` (ENTOPS-07/08)  
**Data gathered:** 2026-07-16 (operator sink + exit tool code slice; no harness wiring)

## Purpose

Phase 127 ships **ENTOPS-08** (exit/DSAR tooling) fully in code, and the **operator-side half of ENTOPS-07** (native-memory ingest sink/filter/budget/replay contract). Per-harness interception of Claude auto-memory, Hermes `memory add`, and Codex `/memory` is **NOT built** — documented here so operators do not mistake the sink API for finished write-side enforcement.

## Shipped in this phase (code)

| ID | What shipped |
|----|----------------|
| ENTOPS-08 | `bin/memroos.mjs` (`export --flat`, `export --dsar`, `delete --user`); `lib/export/flat-export.ts` + `dsar-export.ts`; `POST /api/dsar/export` + `POST /api/dsar/delete`; `erasure_tombstones` migration (schema v30) — tombstone only, never deletes audit rows |
| ENTOPS-07 (operator sink) | `lib/native-memory/filter.ts` + `sink.ts`; `POST /api/native-memory/ingest` — `directive_diff` alert (never deletes) → secret filter → directive budget warn → returns `{replay}` |

## NOT built — ENTOPS-07 per-harness wiring (honest stubs)

| Item | Harness | Status | Follow-up |
|------|---------|--------|-----------|
| Claude Code auto-memory → MemRoOS ingest | Claude | **NOT built** — no Claude memory-write hook / plugin | Wire Claude memory writes to `POST /api/native-memory/ingest`, then write `replay` to local auto-memory file |
| Hermes `memory add` → MemRoOS first | Hermes | **NOT built** — Hermes runtime not modified; MEMORY.md skills-routing layer **untouched** | Intercept `memory add` before local write; stub directive body only after sink returns replay |
| Codex `/memory` routing → MemRoOS first | Codex | **NOT built** — no Codex memory router change | Route `/memory` writes through ingest, then replay under budget |
| Live harness regression (Hermes running) | Hermes | **NOT built** — no live Hermes lab in this slice | Integration test with running Hermes proving MEMORY.md skills routing intact + directive body stubbed |
| Fake harness “green” in CI | — | **Explicitly refused** — do not simulate harness interception as shipped | Keep stubs documented until real hooks exist |

## Operator sink contract (shipped)

1. Auth: operator session **or** `MEMROOS_OPERATOR_API_KEY` / `MEMROOS_AGENT_API_KEY` bearer.
2. Body: `{source, agentId, userId, content, memoryPath, tenantId?, canonicalContent?}`.
3. Pipeline is warn-only on budgets/diffs; HIGH secrets are redacted from `replay` via `scanContent`.
4. Caller (future harness hook) owns writing `replay` to the local file — MemRoOS does not touch harness internals.

## Verification commands

```bash
cd apps/memroos && npx vitest run src/lib/export/__tests__/ src/lib/native-memory/__tests__/ src/lib/__tests__/erasure-tombstone.test.ts && npm run typecheck
cd ../.. && node bin/memroos.mjs export --flat --tenant default-tenant --vault-root /path/to/fixture --out /tmp/memroos-export-test
```
