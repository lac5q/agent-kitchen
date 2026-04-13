---
phase: 13-skill-coverage-gaps
plan: "01"
subsystem: skills-api
tags: [tdd, skills, observability, coverage-gaps]
dependency_graph:
  requires: []
  provides: [coverageGaps-api, cookbooks-gap-count]
  affects: [react-flow-canvas, api-skills-route]
tech_stack:
  added: []
  patterns: [skill-usage-cross-reference, primitive-dep-array, epoch-ms-timestamp-support]
key_files:
  created: []
  modified:
    - src/app/api/skills/route.ts
    - src/app/api/skills/__tests__/route.test.ts
    - src/components/flow/react-flow-canvas.tsx
decisions:
  - "Boundary semantics: strictly > 30 days (not >=) — test 3 confirms 30.000d is fresh, 30.001d is stale"
  - "gapCount derived as primitive before nodes useMemo (not skillsStats object) — follows Phase 09 pattern to avoid adding skillsStats to nodes deps"
  - "coverageGaps only renders .length (number) in canvas — never the string array (T-13-04 XSS guard)"
  - "Malformed timestamps treated as stale (gap) — Number.isFinite guard after Date/number parse"
  - "Epoch-ms numeric timestamps supported alongside ISO strings via typeof check"
metrics:
  duration: "~3 minutes"
  completed: "2026-04-13"
  tasks_completed: 3
  files_modified: 3
---

# Phase 13 Plan 01: Skill Coverage Gaps Summary

**One-liner:** TDD-implemented coverageGaps field on /api/skills — cross-references skill_usage dict against readdir to surface 30-day-dark skills, rendered as count in Cookbooks Flow node.

## What Was Built

Extended `GET /api/skills` with a `coverageGaps: string[]` field that identifies skills unused in the last 30 days. The Cookbooks node in the Flow canvas now shows the gap count in its hover stats ("Stale 30d+: N") and conditionally in its subtitle ("skillshare · X · N stale") when N > 0.

## Response Shape (jq keys)

```json
[
  "contributedByHermes",
  "contributedByGwen",
  "coverageGaps",
  "lastPruned",
  "lastUpdated",
  "recentContributions",
  "staleCandidates",
  "timestamp",
  "totalSkills"
]
```

## TDD Sequence

| Commit   | Type  | Description                                        | Tests    |
|----------|-------|----------------------------------------------------|----------|
| 5084e8e  | RED   | 9 failing tests for coverageGaps                   | 9F / 13P |
| 65f61eb  | GREEN | Implement coverageGaps in route.ts                 | 22P / 0F |
| bdb0396  | FEAT  | Wire gapCount into Cookbooks node subtitle + stats | 22P / 0F |

## Key Implementation Notes

**Boundary semantics:** `(now - ts) > THIRTY_DAYS_MS` — strictly greater than 30 days. A skill used exactly 30 days ago is NOT a gap. Test 3 encodes this with two sub-cases.

**Timestamp dual-format support:**
```typescript
const ts = typeof raw === "number" ? raw : new Date(String(raw)).getTime();
if (!Number.isFinite(ts)) return true;  // malformed → treat as stale
```
Handles both ISO strings (`"2026-04-10T12:34:56Z"`) and epoch-ms numbers (`1743000000000`).

**Cookbooks node dep-array pattern (STATE.md Phase 09 decision):**
`gapCount` is derived as a `number` primitive before `useMemo`, not by passing `skillsStats` object into the memo deps. This keeps the nodes memo deps stable and avoids unnecessary re-renders on unrelated skillsStats field changes.

**Security (T-13-04):** Only `coverageGaps.length` is rendered in the canvas — never the string array members. The type is `number`, so no XSS risk. No `execSync`/`exec` introduced (T-13-05).

## Pre-plan Observation

Skill-sync-state.json and skill_usage dict are read at every poll cycle by the route. On a fresh system (or test env), `coverageGaps` equals the full skill dir list. On a well-exercised system with recent usage, it reflects genuinely stale skills.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — coverageGaps is computed from live data (readdir + skill_usage dict). No hardcoded values or placeholders.

## Threat Surface Scan

No new network endpoints, auth paths, or schema changes introduced beyond what was planned. `coverageGaps` string array is already scoped as accepted disclosure (T-13-03 — skill dir names not secret). Count-only rendering enforced (T-13-04).

## Self-Check

### Files exist:
- src/app/api/skills/route.ts: FOUND
- src/app/api/skills/__tests__/route.test.ts: FOUND
- src/components/flow/react-flow-canvas.tsx: FOUND

### Commits exist:
- 5084e8e: test(13-01) — FOUND
- 65f61eb: feat(13-01) route — FOUND
- bdb0396: feat(13-01) UI — FOUND

## Self-Check: PASSED
