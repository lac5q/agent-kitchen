---
phase: 01
plan: 01
subsystem: knowledge-library
tags: [collections, config, ui, tdd, cron, gitnexus]
dependency_graph:
  requires: []
  provides: [KNOW-02, KNOW-03, KNOW-04]
  affects: [library-view, refresh-cron, collection-card]
tech_stack:
  added: []
  patterns: [TDD red-green, conditional JSX rendering, dual-registry config]
key_files:
  created:
    - src/test/collection-card.test.tsx
  modified:
    - collections.config.json
    - src/components/library/collection-card.tsx
    - ~/github/knowledge/refresh-index.sh
decisions:
  - Use destructured `lastUpdated` from collection in CollectionCard for consistency with existing pattern
  - basePath uses absolute /Users/yourname/ prefix (consistent with agent-lightning entries in same file)
  - Non-fatal gitnexus call via `|| echo` to satisfy threat model T-01-04 (set -e would abort qmd update on failure)
  - knowledge vault registered as single top-level collection, not split by subdir
metrics:
  duration: 4m 11s
  completed: 2026-04-09T19:36:48Z
  tasks_completed: 3
  files_changed: 4
requirements: [KNOW-02, KNOW-03, KNOW-04]
---

# Phase 01 Plan 01: Knowledge Sources Registration Summary

**One-liner:** Registered Obsidian vault + fixed llm-wiki path in `collections.config.json`, added freshness date to `CollectionCard` with TDD, and wired `gitnexus-index.sh` into the weekly cron.

---

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | CollectionCard unit test — TDD RED | `9a844ea` | `src/test/collection-card.test.tsx` |
| 2 | Wire collections config + freshness date — TDD GREEN | `5a6f798` | `collections.config.json`, `src/components/library/collection-card.tsx` |
| 3 | Add gitnexus-index.sh to weekly refresh cron | `34555ec` (knowledge repo) | `~/github/knowledge/refresh-index.sh` |

---

## What Was Built

### KNOW-02: Obsidian Vault in Library View
- Added `{ "name": "knowledge", "category": "other", "basePath": "/Users/yourname/github/knowledge" }` to `collections.config.json` (entry 19 of 19)
- `CollectionCard` now destructures and renders `lastUpdated` as a locale date string with an ISO timestamp `title` tooltip
- Freshness date styling: `text-xs text-slate-500 mt-1` — matches UI-SPEC.md contract

### KNOW-03: llm-wiki Wiki Pages
- Fixed `llm-wiki` entry in `collections.config.json` to add `"basePath": "/Users/yourname/github/knowledge/llm-wiki/wiki"` — previously pointed at repo root (3 docs), now correctly points at `wiki/` subdir (6+ pages)

### KNOW-04: gitnexus in Weekly Cron
- Added gitnexus block to `refresh-index.sh` before `qmd update`:
  ```bash
  echo "Running GitNexus analyze across indexed repos..."
  ~/github/gitnexus-index.sh || echo "  Warning: gitnexus-index failed (non-fatal)"
  ```
- Non-fatal `||` guard satisfies threat T-01-04 (script uses `set -e`)
- Committed to `~/github/knowledge` repo at `34555ec`

---

## Verification Results

| Check | Result |
|-------|--------|
| `npx vitest run` — all 5 tests pass | PASS |
| `collections.length === 19` | PASS |
| `knowledge.basePath === /Users/yourname/github/knowledge` | PASS |
| `llm-wiki.basePath` ends in `/wiki` | PASS |
| `grep gitnexus-index refresh-index.sh` | PASS |
| `bash -n refresh-index.sh` — syntax OK | PASS |

---

## Deviations from Plan

None — plan executed exactly as written.

---

## Post-Plan Manual Steps (user_setup)

These steps require the user to run manually after this plan completes (BM25 keyword indexing only — `qmd embed` is forbidden per vector store architecture):

```bash
qmd collection add --path ~/github/knowledge --name knowledge
qmd update
```

Then start dev server and verify Library view:
```bash
npm start -- --port 3002
```
- Library view should show `knowledge` collection with docCount > 0 and freshness date
- Library view should show `llm-wiki` with docCount >= 6 (wiki pages)

---

## Known Stubs

None — all data flows are wired. `lastUpdated` is nullable by design; the conditional render is correct behavior, not a stub.

---

## Threat Flags

No new security-relevant surface introduced. All changes are:
- Static config file edits (no user input, no new endpoints)
- Additive UI rendering (nullable conditional, no new network calls)
- Shell script addition (calls existing script with non-fatal guard)

---

## Self-Check: PASSED

- `src/test/collection-card.test.tsx` exists: FOUND
- `collections.config.json` has 19 entries with knowledge + fixed llm-wiki: VERIFIED
- `src/components/library/collection-card.tsx` has lastUpdated rendering: VERIFIED
- `~/github/knowledge/refresh-index.sh` has gitnexus-index.sh call: VERIFIED
- Commits `9a844ea`, `5a6f798` in agent-kitchen git log: FOUND
- Commit `34555ec` in knowledge repo git log: FOUND
