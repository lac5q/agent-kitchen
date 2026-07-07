# Beastmode Learning: Phase 125 Multi-Tenant Vaults + Central Audit

Date: 2026-07-07
Task: MEMROOS v8.1 Phase 125 (ENTOPS-02/03) takeover

## Role Routing

- Director: Droid (upgraded routed model) in the Factory CLI session.
- Worker: none dispatched — implementation already present on main but unpromoted; Director acted as reviewer/hardener.
- Watcher: Tier 1 Claude Opus (`claude -p --model opus`), GLM-5.2 fallback not needed.
- Harness: manual Beastmode orchestration with local shell checks.

## Watcher Invocation Fix (important)

- `claude -p --model opus` with a file-reading task TIMES OUT (multi-turn tool use inside the CLI) — the recurring "watcher quota" symptom is often just multi-turn latency, not a hard quota.
- FIX: pipe file contents inline via stdin and force `--max-turns 1` so the model evaluates in a single turn without reading files itself. This produced a decisive verdict in ~one turn.
- Caveat: very large inline payloads can still push it to attempt a tool call and hit max-turns. Keep payload tight (grep evidence + the specific changed blocks) and allow `--max-turns 2`.

## What The Watcher Caught (real, verified)

- C5 (blocking): `POST /api/audit/knowledge` did chain-tip read (`buildKnowledgeAuditEntry`) then `writeAuditEntry` with no enclosing transaction — TOCTOU fork under concurrent same-tenant writes.
- C1 (blocking): `KnowledgeStore.effective_root()` returned the unscoped shared root in operator mode when no tenant bound — fail-OPEN.
- Both independently confirmed against the real route handler + store before fixing (never act on watcher verdict without Director verification).

## Fixes

- Route: `db.transaction(() => { insert-tenant; build; write; }).immediate()` — IMMEDIATE acquires the write lock at BEGIN, serializing the read+append across connections.
- Store: `_operator_scope_ok()` fail-closed guard on read/write/delete/search; operator mode + no bound tenant now refuses instead of falling back to shared root. `effective_root()`/manifest/health left intact (operator-level metadata only).
- Added `test_operator_mode_no_bound_tenant_fails_closed`.

## Verification

- `test_tenant_isolation.py` 13/13, `knowledge-chain.test.ts` + `route.test.ts` 21/21, `npm run check:route-auth-boundary` 49/49.
- Re-validation watcher verdict: PASS.

## Routing Rule To Change

Yes: default the watcher to inline-context single-turn (`claude -p --model opus --max-turns 1` with files piped on stdin) instead of letting the CLI read files across turns. This converts the "watcher unavailable" failure mode into a reliable one-turn verdict.
