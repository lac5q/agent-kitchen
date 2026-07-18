# Coverage Report — MemRoOS Quality Gate

- **Document version:** 2026-07-18.2
- **Creation date/time (UTC):** 2026-07-18T07:24:42Z
- **Update date/time (UTC):** 2026-07-18T15:12:00Z
- **Sources:** vitest `--coverage` on quality-gate modules (2026-07-18); focused suite log `/tmp/cov-gate-surface.log`; fast `/tmp/test-fast-coverage.log`; slow `/tmp/test-slow-coverage.log`

## Measured (focused quality-gate surface)

| Metric | Value |
|--------|-------|
| Statements | 68.75% (1452/2112) |
| Branches | 51.44% (1015/1973) |
| Functions | 63.51% (235/370) |
| Lines | 71.88% (1368/1903) |

Scope: `wiki-*` (vault/digest/scheduler/graph/API/page), `observe-*`, `agent-memory-continuity`, `graph-catchup`, policy helpers, and their direct deps pulled into the coverage graph.

Delta vs 2026-07-18.1: statements **61.82% → 68.75%** (+6.93pp) after expanding wiki/observe/graph-catchup/page/continuity tests.

### High coverage modules
- `noc-filters.ts` 100% statements
- `wiki-graph.ts` ~97% statements
- `app/api/wiki/route.ts` ~96% statements
- `wiki-digest.ts` ~90% statements
- `wiki-digest-scheduler.ts` ~90% statements
- `wiki-vault.ts` ~90% statements
- `cron-health.ts` ~90% statements
- `observe-sidecar.ts` ~88% statements
- `app/wiki/page.tsx` ~87% statements
- `graph-catchup.ts` ~72% statements

## App-wide 100% status

**Blocked / not met.** Achieving 100% statement coverage across the entire Next.js monorepo (211 API routes + UI) is not complete in this pass. Honest gap list:

1. Python services / knowledge-mcp / voice / Pipecat not in vitest v8 surface
2. Many API routes lack dedicated route tests beyond auth-boundary checks
3. Optional integrations (RTK, QMD, Neo4j live, oracle-1) require host credentials
4. Incidental deps pulled into the graph (`db.ts`, `backends.ts`, `policy-gate.ts`, shared UI widgets) dilute the focused surface percentage

## Next coverage increments
1. Raise `graph-catchup` remaining vector/legacy branches (~72% → 85%+)
2. Cover wiki digest HTTP catch path + observe health auth miss
3. Add route tests for non-wiki quality-gate APIs still without handlers tests
4. Keep fast+slow gates green as the regression floor

## Verification commands
```bash
cd apps/memroos && npx vitest run --coverage \
  src/lib/__tests__/wiki-surface.test.ts \
  src/lib/__tests__/wiki-digest-scheduler.test.ts \
  src/lib/__tests__/policy-helpers.test.ts \
  src/lib/__tests__/observe-*.test.ts \
  src/lib/__tests__/agent-memory-continuity.test.ts \
  src/lib/memory/__tests__/graph-catchup.test.ts \
  src/app/api/wiki/__tests__/route.test.ts \
  src/app/wiki/__tests__/page.test.tsx
npm test -- --run
npm run test:slow -- --run
```
