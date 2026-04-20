# Phase 20: Hive Mind Coordination — Validation Map

**Created:** 2026-04-17
**Phase:** 20-hive-mind-coordination
**Framework:** Vitest

---

## Requirements → Test Coverage Map

| Req ID | Behavior | Test File | Test Description | Automated Command |
|--------|----------|-----------|-----------------|-------------------|
| HIVE-01 | POST writes valid action to hive_actions | `src/app/api/hive/__tests__/route.test.ts` | POST with valid action body returns {ok:true, id} | `npx vitest run src/app/api/hive/__tests__/route.test.ts` |
| HIVE-01 | POST rejects invalid action_type with 400 | `src/app/api/hive/__tests__/route.test.ts` | POST with invalid action_type returns 400 | same |
| HIVE-01 | artifacts field stores as JSON string | `src/app/api/hive/__tests__/route.test.ts` | POST with artifacts object round-trips through GET | same |
| HIVE-02 | GET filters by agent_id | `src/app/api/hive/__tests__/route.test.ts` | GET ?agent=claude returns only that agent's rows | same |
| HIVE-02 | GET performs FTS keyword search | `src/app/api/hive/__tests__/route.test.ts` | GET ?q=keyword returns FTS-matched results | same |
| HIVE-02 | GET combines agent + keyword filters | `src/app/api/hive/__tests__/route.test.ts` | GET ?agent=X&q=Y applies both filters | same |
| HIVE-02 | GET handles malformed FTS query gracefully | `src/app/api/hive/__tests__/route.test.ts` | GET ?q=<bad-syntax> returns 200 with empty results, not 500 | same |
| HIVE-03 | Delegation UPSERT on task_id conflict | `src/app/api/hive/__tests__/route.test.ts` | POST delegation twice with same task_id updates status | same |
| HIVE-03 | Delegation GET retrieves delegation rows | `src/app/api/hive/__tests__/route.test.ts` | POST delegation then GET ?type=delegation returns it | same |
| HIVE-03 | Checkpoint JSON round-trips | `src/app/api/hive/__tests__/route.test.ts` | checkpoint with completedSteps, lastStepAt, resumeFrom preserved | same |
| HIVE-04 | Feed auto-refreshes at 5s interval | `src/components/kitchen/__tests__/hive-feed.test.tsx` | useHiveFeed hook has refetchInterval=5000 | `npx vitest run src/components/kitchen/__tests__/hive-feed.test.tsx` |
| HIVE-04 | Feed renders action rows | `src/components/kitchen/__tests__/hive-feed.test.tsx` | HiveFeed renders agent_id, action_type chip, summary, timestamp | same |
| HIVE-04 | Feed handles empty state | `src/components/kitchen/__tests__/hive-feed.test.tsx` | HiveFeed shows "No hive activity yet" when actions=[] | same |
| HIVE-04 | Feed handles loading state | `src/components/kitchen/__tests__/hive-feed.test.tsx` | HiveFeed shows spinner when isLoading=true | same |
| HIVE-05 | Paperclip agent_id round-trips | `src/app/api/hive/__tests__/route.test.ts` | POST with agent_id="paperclip" appears in GET results | `npx vitest run src/app/api/hive/__tests__/route.test.ts` |
| DASH-02 | HiveFeed wired into Kitchen Floor | `src/app/page.tsx` (structural) | grep HiveFeed src/app/page.tsx | `grep -q "HiveFeed" src/app/page.tsx` |

---

## Schema Verification

| Check | Command |
|-------|---------|
| busy_timeout pragma added | `grep -q "busy_timeout" src/lib/db.ts` |
| hive_actions table DDL present | `grep -q "hive_actions" src/lib/db-schema.ts` |
| hive_delegations table DDL present | `grep -q "hive_delegations" src/lib/db-schema.ts` |
| POLL_INTERVALS.hive defined | `grep -q "hive" src/lib/constants.ts` |
| useHiveFeed exported | `grep -q "useHiveFeed" src/lib/api-client.ts` |

---

## Phase Gate Commands

```bash
# Wave 1 gate
npx vitest run src/app/api/hive/__tests__/route.test.ts

# Wave 2 gate
npx vitest run src/components/kitchen/__tests__/hive-feed.test.tsx

# Full phase gate (before /gsd-verify-work)
npx vitest run
npm run build
```

---

## Known Gaps at Plan Time

All test files are new (Wave 0 gap). They are created as part of execution:
- `src/app/api/hive/__tests__/route.test.ts` — created in Plan 20-01 Task 2
- `src/components/kitchen/__tests__/hive-feed.test.tsx` — created in Plan 20-02 Task 1
