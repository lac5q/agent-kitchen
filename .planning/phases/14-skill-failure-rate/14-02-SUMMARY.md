---
phase: 14-skill-failure-rate
plan: "02"
subsystem: agent-kitchen-nextjs
tags: [failures-parser, api-skills, react-flow-canvas, tdd, skill-06, observability]
dependency_graph:
  requires: [14-01]
  provides: [parseFailuresLog, aggregateFailures, failuresByAgent-api-field, failuresByErrorType-api-field, cookbooks-failure-count-ui]
  affects: [src/app/api/skills/route.ts, src/components/flow/react-flow-canvas.tsx]
tech_stack:
  added: [src/lib/failures-parser.ts]
  patterns: [brace-depth-streaming-json-extractor, phase-09-primitive-usememo-pattern, vitest-esm-mock-dynamic-import]
key_files:
  created:
    - src/lib/failures-parser.ts
    - src/lib/__tests__/failures-parser.test.ts
  modified:
    - src/lib/constants.ts
    - src/app/api/skills/route.ts
    - src/app/api/skills/__tests__/route.test.ts
    - src/components/flow/react-flow-canvas.tsx
decisions:
  - "failureCount/topErrorType declared before nodeStats useCallback — TypeScript block-scope requires declaration before use"
  - "Phase 09 primitive pattern followed exactly: failureCount is a number, not the full failuresByAgent object, so nodes useMemo deps stay stable"
  - "topErrorType included in Cookbooks nodeStats as 'Top Error' key only when non-null (conditional spread)"
  - "disk_critical filtered at aggregateFailures layer in TypeScript (defense-in-depth; also filtered at Python aggregate layer in Plan 14-01)"
metrics:
  duration: ~35min
  completed: "2026-04-13"
  tasks_completed: 3
  files_changed: 6
---

# Phase 14 Plan 02: Skill Failure Rate API + UI Summary

TypeScript port of the multi-line JSON parser, `/api/skills` route extension with `failuresByAgent` + `failuresByErrorType`, and Cookbooks node failure count display — completing SKILL-06.

## What Was Built

### Final `/api/skills` Response Schema

```typescript
type SkillsApiResponse = {
  // Phase 09 fields (preserved, unchanged)
  totalSkills: number;
  contributedByHermes: number;
  contributedByGwen: number;
  recentContributions: Array<{ skill: string; contributor: string; timestamp: string; action: string }>;
  lastPruned: string | null;
  staleCandidates: number;
  lastUpdated: string | null;

  // Phase 13 field (preserved, unchanged)
  coverageGaps: string[];

  // Phase 14 NEW fields
  failuresByAgent: Record<string, number>;      // {} when failures.log missing/empty
  failuresByErrorType: Record<string, number>;  // {} when failures.log missing/empty

  timestamp: string;
};
```

### src/lib/failures-parser.ts

Brace-depth streaming JSON extractor that handles compact single-line and multi-line pretty-printed JSON objects in the same `failures.log` file. A naive `splitlines() + JSON.parse` approach would miscount multi-line entries (e.g., an 8-line pretty-printed object would attempt to parse 8 partial lines instead of 1 complete object).

**Algorithm:** Walk string character-by-character tracking `depth` (brace depth), `inString` flag, and `escapeNext` flag to correctly ignore braces inside string literals. When depth returns to 0 after being > 0, the substring is a complete JSON object — attempt `JSON.parse` inside try/catch, skip failures.

**Exports:**
- `parseFailuresLog(filepath): Promise<FailureEntry[]>` — returns `[]` on ENOENT or any read error, never rejects
- `aggregateFailures(entries): { failuresByAgent, failuresByErrorType }` — filters `disk_critical` (strict lowercase), buckets missing `agent_id` as `"unknown"`, returns empty objects when input is empty

### src/lib/constants.ts

Added: `FAILURES_LOG = process.env.FAILURES_LOG || ~/.openclaw/failures.log`

### src/app/api/skills/route.ts

Step 5 added after existing JSONL parsing step: calls `parseFailuresLog(FAILURES_LOG)` + `aggregateFailures()`, wraps in defensive try/catch (parser already handles ENOENT internally), adds both fields to `NextResponse.json()` payload.

### src/components/flow/react-flow-canvas.tsx

- `SkillsStats` interface extended with optional `failuresByAgent?` and `failuresByErrorType?` fields
- `failureCount` (number) and `topErrorType` (string | null) computed via `useMemo` declared before `nodeStats` useCallback (TypeScript block-scope constraint)
- Phase 09 primitive pattern applied: `failureCount` is `Object.values(byAgent).reduce(sum)` — a plain number, not the full object — so `nodes` useMemo deps remain stable
- Cookbooks node `nodeStats` adds `"Failures": failureCount` and conditional `"Top Error": topErrorType`
- Cookbooks node `data` prop receives `failureCount` and `topErrorType` for future renderer use
- All accesses use optional chaining (`skillsStats?.failuresByAgent ?? {}`) — safe against stale/legacy API responses

## disk_critical Triple-Layer Defense

Per SKILL-06 requirement — `disk_critical` is filtered at three layers:

| Layer | Location | Mechanism |
|-------|----------|-----------|
| Emit layer | `skill-sync.py` (Plan 14-01) | `_emit_failed_event` returns early when `error_type == "disk_critical"` — not written to JSONL |
| Aggregate layer (Python) | `failures_parser.py` (Plan 14-01) | `aggregate_failures` skips entries where `error_type == "disk_critical"` |
| Aggregate layer (TypeScript) | `src/lib/failures-parser.ts` (Plan 14-02) | `aggregateFailures` skips entries where `entry.error_type === "disk_critical"` |

## gitnexus_impact Result

Ran before editing `react-flow-canvas.tsx`:
- **Target:** `ReactFlowCanvas`
- **Risk:** LOW
- **Direct callers (d=1):** 0 (index stale — actual callers are in dashboard page, but no structural risk)
- **Processes affected:** 0

No HIGH/CRITICAL warnings. Changes were additive only — no restructuring.

## Test Coverage

| File | Tests | All Pass |
|------|-------|----------|
| `src/lib/__tests__/failures-parser.test.ts` | 9 | Yes |
| `src/app/api/skills/__tests__/route.test.ts` | 28 (22 existing + 6 new) | Yes |
| `src/components/flow/__tests__/edge-structure.test.ts` | 4 | Yes |
| **Total** | **41** | **Yes** |

Key test cases:
- **Test 2 (CRITICAL — multi-line):** Verifies a pretty-printed 8-line JSON entry is counted as 1, not 8 — the exact failure mode of naive line parsing
- **Route Test 2 (disk_critical):** Asserts `failuresByErrorType` never contains `disk_critical` key
- **Route Test 3 (missing log):** Route returns HTTP 200 with `{}` fields when `failures.log` absent
- **Route Test 6 (no regression):** All Phase 09 + 13 fields still present with correct values

## Commits

| Commit | Message |
|--------|---------|
| `09d5a55` | test(14-02): add failing tests for failures-parser.ts (RED) |
| `f28a94b` | feat(14-02): implement failures-parser.ts with brace-depth multi-line JSON extractor (GREEN) |
| `a6175ed` | feat(14-02): extend /api/skills with failuresByAgent + failuresByErrorType (GREEN) |
| `cc5ea56` | feat(14-02): render failure counts on Cookbooks node in react-flow-canvas.tsx |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] failureCount/topErrorType declared after nodeStats useCallback**
- **Found during:** Task 3 build (`npm run build`)
- **Issue:** TypeScript block-scope rule — `const failureCount` was declared after the `nodeStats = useCallback(...)` that referenced it. TypeScript error: "Block-scoped variable 'failureCount' used before its declaration."
- **Fix:** Moved both `useMemo` declarations to immediately before `nodeStats` useCallback. Removed the duplicate block that was left after `gapCount`.
- **Files modified:** `src/components/flow/react-flow-canvas.tsx`
- **Commit:** `cc5ea56`

## Known Stubs

None — all fields are wired end-to-end from `failures.log` through the parser, route, and canvas node.

## Threat Flags

No new network endpoints, auth paths, file access patterns, or schema changes beyond those in the plan's threat model. Confirmed mitigations applied:

| Threat | Mitigation Applied |
|--------|--------------------|
| T-14-05 (Info Disclosure — response) | Response includes ONLY aggregate counts — no raw entries, no tracebacks, no filesystem paths |
| T-14-07 (Tampering — parser) | Brace-depth scanner with per-object try/catch — poisoned/malformed entries are skipped, not propagated |
| T-14-08 (Elevation of Privilege — execSync) | Zero shell execution — only `fs/promises.readFile` |
| T-14-09 (Info Disclosure — UI) | UI renders counts and top error_type enum label only — no raw entries |

## Visual QA Note

Per STATE.md pending QA note: full visual QA at `kitchen.example.com` recommended before v1.3 milestone close to verify Cookbooks node failure count renders correctly in production with real `failures.log` data.

## Self-Check: PASSED

- `/Users/yourname/github/agent-kitchen/.claude/worktrees/agent-ac92e0e1/src/lib/failures-parser.ts` — FOUND
- `/Users/yourname/github/agent-kitchen/.claude/worktrees/agent-ac92e0e1/src/lib/__tests__/failures-parser.test.ts` — FOUND
- `/Users/yourname/github/agent-kitchen/.claude/worktrees/agent-ac92e0e1/src/app/api/skills/route.ts` — FOUND (contains `failuresByAgent`)
- `/Users/yourname/github/agent-kitchen/.claude/worktrees/agent-ac92e0e1/src/components/flow/react-flow-canvas.tsx` — FOUND (contains `failuresByAgent?.`)
- Commit `09d5a55` — FOUND
- Commit `f28a94b` — FOUND
- Commit `a6175ed` — FOUND
- Commit `cc5ea56` — FOUND
- 41/41 Vitest tests pass
- `npm run build` succeeds with no TypeScript errors
