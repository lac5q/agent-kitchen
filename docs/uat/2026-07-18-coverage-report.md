# Coverage Report — MemRoOS Quality Gate

- **Document version:** 2026-07-18.1
- **Creation date/time (UTC):** 2026-07-18T07:24:42Z
- **Update date/time (UTC):** 2026-07-18T07:24:42Z
- **Sources:** vitest `--coverage` on quality-gate modules (2026-07-18); full fast suite log `/tmp/test-fast-full.log`

## Measured (focused quality-gate surface)

| Metric | Value |
|--------|-------|
| Statements | 61.82% (1090/1763) |
| Branches | 43.14% (705/1634) |
| Functions | 62.28% (180/289) |
| Lines | 65.53% (1040/1587) |

Scope: `wiki-*`, `observe-*`, `graph-catchup`, `agent-memory-continuity` and their direct deps pulled into the coverage graph.

### High coverage modules
- `observe-capture-depth.ts` ~97% statements
- `agent-memory-continuity.ts` ~90% statements
- `observe-sidecar.ts` ~82% statements
- `wiki-digest.ts` ~74% statements

## App-wide 100% status

**Blocked / not met.** Achieving 100% statement coverage across the entire Next.js monorepo (211 API routes + UI) is not complete in this pass. Honest gap list:

1. Python services / knowledge-mcp / voice / Pipecat not in vitest v8 surface
2. Many API routes lack dedicated route tests beyond auth-boundary checks
3. Optional integrations (RTK, QMD, Neo4j live, oracle-1) require host credentials
4. E2E browser UAT against seeded fixtures not executed in this cloud agent (no interactive browser session mandated)

## Next coverage increments
1. Expand route-level tests for `/api/wiki/*`, `/api/observe/health`, `/api/wiki/digest`
2. Raise wiki-digest failure-path + mem0 fetch error coverage
3. Add component tests for `/wiki` page empty-vault and graph panel states
4. Keep fast+slow gates green as the regression floor

## Verification commands
```bash
cd apps/memroos && npx vitest run --coverage src/lib/__tests__/wiki-surface.test.ts src/lib/__tests__/observe-*.test.ts src/lib/memory/__tests__/graph-catchup.test.ts
npm test -- --run
npm run test:slow -- --run
```
