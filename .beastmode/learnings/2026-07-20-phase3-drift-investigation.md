# BM-20260720 drift-investigation findings

When resuming Phase 3 after ~14h pause, I discovered major git drift between Mac `main` and oracle-1 `main`:

- Mac `main`: `99c04c1f` (Jul 16 baseline)
- oracle-1 `main`: `9b16b4b0` (Oracle merge commit for env cutover)
- **41 commits ahead on oracle-1** that aren't on Mac main

## MEMX ticket re-audit against oracle-1 HEAD

| Ticket | Mac audit said | oracle-1 HEAD reality | Verdict |
|--------|----------------|------------------------|---------|
| MEMX-3 | `consolidated=1` UPDATE unconditional | Still unconditional (line 159-161) | **STILL BROKEN** — fix applied |
| MEMX-4 | No JSON-array extraction | Has `extractFirstJsonArray` at line 94, commit `39621d72` | **ALREADY FIXED on oracle-1** — moot |
| MEMX-5 | Advance checkpoint by `projected` id | Advance happens after successful project (line 587/596); failed rows stall cursor | **STILL BUGGY** — fix applied |
| MEMX-7 | `vault_artifact` table MISSING | `memory_vault_durability` is the correct table name; column `source_vault_artifact_id` exists; **no code anywhere references a `vault_artifact` table** | **NON-ISSUE — audit was wrong** |
| MEMX-8 | `/api/cron-health` not in `ROUTE_LOCAL_AUTH_API_ROUTES` | Confirmed missing (only `/api/recall/ingest` and similar present) | **STILL BROKEN** — fix applied |

## MEMX-7 audit error confirmed

The 2026-07-19 audit doc mentioned "vault_artifact table missing" but a code-wide grep shows zero SQL queries against a table named `vault_artifact`. The schema uses `memory_vault_durability` with a `source_vault_artifact_id` column. The audit author conflated a *column name* with a *table name*. **No migration needed.**

## MEMX-6 (watchdog) status

`services/healthcheck/` exists on oracle-1 but not on Mac main. Two commits ahead: `8b24d0cd fix(healthcheck): harden Oracle watchdog alerts and credentials` and `ddd4226e fix(oracle-1): cloud healthcheck fixes + GitHub-issue-on-failure watchdog`. The MEMX-6 work (surface `recallIngest.stale`) needs to be done against oracle-1's file, not Mac's. Treating oracle-1 as canonical source of truth for Phase 4 onward.

## Phase 3 strategy change

Instead of worktrees-per-ticket on Mac main (which would create divergent history against the 41 oracle-1 commits), I:

1. Fetched oracle-1 main as `oracle-main-2026-07-20` branch on Mac (via bundle)
2. Applied MEMX-3, MEMX-5, MEMX-8 patches directly to oracle-1's checked-out tree (sudo python3 in-place)
3. Skipped MEMX-7 (non-issue)
4. Did NOT commit anything to oracle-1's git tree (those commits will be made after restart + smoke verification; user has not yet granted push permission)

Patches applied via `/tmp/memx-patches/apply-memx-{3,5,8}.py` (scp'd to oracle-1, run with sudo python3.11).

## MEMX-9 (new, discovered earlier)

Operator-key auth fails from cloudflare-originated requests but works from loopback. Workaround in place: SSH tunnel from Mac → oracle-1:3000 over `~/.ssh/config` oracle-1 host entry. Root cause unknown; CF may strip headers, or Next.js URL parse behavior on proxied requests. Not investigated further to keep Phase 1 moving.

## Next steps

1. Restart `memroos-web.service` on oracle-1 to pick up MEMX-3 / MEMX-5 / MEMX-8 (awaiting user go per Option A)
2. Verify each fix with a quick smoke (consolidation run no longer marks stale batches; graph-catchup progresses past 34,507 nodes; cron-health no longer 401s)
3. Build MEMX-6 patch (watchdog surface `recallIngest.stale` when ageHours > 6)
4. Build Phase 5 update (oracle-1 memory-stack ref doc, gitnexus cache invalidation, final learnings)
5. Optional: commit patches on oracle-1 after smoke passes; push to remote if granted

