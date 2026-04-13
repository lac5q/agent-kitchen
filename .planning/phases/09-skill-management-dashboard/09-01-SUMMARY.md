---
phase: 09-skill-management-dashboard
plan: "01"
subsystem: skills-api
tags: [skills, api, tdd, vitest, jsonl, cron]
dependency_graph:
  requires: []
  provides: ["/api/skills", "useSkills()", "SKILLS_PATH", "SKILL_CONTRIBUTIONS_LOG"]
  affects: ["src/lib/constants.ts", "src/lib/api-client.ts"]
tech_stack:
  added: []
  patterns: ["force-dynamic API route", "readdir withFileTypes", "JSONL line parsing", "try/catch graceful fallback"]
key_files:
  created:
    - src/app/api/skills/route.ts
    - src/app/api/skills/__tests__/route.test.ts
  modified:
    - src/lib/constants.ts
    - src/lib/api-client.ts
decisions:
  - "Cron JSON files and skill-sync.py were already updated in a prior session — no code changes needed for Task 1"
  - "Route reads SKILL_SYNC_STATE from ~/.openclaw/skill-sync-state.json for lastPruned/lastUpdated"
  - "recentContributions uses 2-hour sliding window, capped at 20 entries"
  - "staleCandidates counts all pruned events (not contributor-scoped)"
metrics:
  duration: "~8 minutes"
  completed_date: "2026-04-12"
  tasks_completed: 3
  files_changed: 4
---

# Phase 9 Plan 01: Activate JSONL Bridge + /api/skills Route Summary

One-liner: Live skill count route reading directory with withFileTypes plus JSONL contributor stats, graceful zero fallback, TDD 13/13 green.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Activate JSONL bridge — copy script + update cron JSON files | 91b3cb1 | ~/.openclaw/scripts/skill-sync.py (verified identical), ~/.hermes/cron/skill-sync.json (already done), ~/.hermes/cron/skill-prune-weekly.json (already done) |
| 2 | Add SKILLS_PATH, SKILL_CONTRIBUTIONS_LOG constants and useSkills() hook | 91b3cb1 | src/lib/constants.ts, src/lib/api-client.ts |
| 3 | Create /api/skills route with full Vitest test suite | 04c1d5c | src/app/api/skills/route.ts, src/app/api/skills/__tests__/route.test.ts |

## Test Results

**13/13 tests passed**

```
✓ returns HTTP 200
✓ counts skills directories excluding dot-prefixed dirs and non-directories
✓ returns totalSkills=0 when skills directory is inaccessible
✓ returns all contribution zeros when JSONL file does not exist
✓ returns all zeros when JSONL file is empty
✓ counts hermes and gwen contributed events separately
✓ does NOT count pruned/archived events toward hermes or gwen contributed tallies
✓ counts all pruned events as staleCandidates
✓ returns only events from last 2 hours in recentContributions
✓ reads lastPruned from state file last_prune field
✓ returns lastPruned=null when state file is inaccessible
✓ skips malformed JSONL lines without crashing
✓ always includes a timestamp field in the response
```

## Verification

- TypeScript: zero errors (`npx tsc --noEmit` clean)
- Live skill count: 264 directories in ~/github/knowledge/skills/
- JSONL: 235 lines in ~/github/knowledge/skill-contributions.jsonl (pipeline already seeded)
- Cron flags: both cron JSON files had --export-jsonl before this plan (already configured)
- Script copy: diff confirms ~/.openclaw/scripts/skill-sync.py is identical to git source

## Deviations from Plan

**Tasks 1 and 2 were pre-completed in a prior session.**

The cron JSON files already contained `--export-jsonl`, the skill-sync.py was already identical between locations, `constants.ts` already had all three new exports, and `api-client.ts` already had `useSkills()`. These were verified and committed together (91b3cb1) rather than split into two separate commits since there was nothing to change — only to verify.

Task 3 followed the TDD protocol exactly: tests written first (RED — route not found), implementation created, all 13 tests confirmed GREEN.

## Known Stubs

None. The route returns live directory count and JSONL-parsed contributor stats.

## Self-Check: PASSED

- src/app/api/skills/route.ts: EXISTS
- src/app/api/skills/__tests__/route.test.ts: EXISTS
- Commit 91b3cb1: EXISTS (constants + api-client)
- Commit 04c1d5c: EXISTS (route + tests)
- 13/13 tests: PASSED
