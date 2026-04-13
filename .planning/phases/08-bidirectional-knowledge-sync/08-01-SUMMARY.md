---
phase: 08-bidirectional-knowledge-sync
plan: "01"
subsystem: knowledge-sync
tags: [mem0, obsidian, journals, tdd, dedup, idempotency]
dependency_graph:
  requires: []
  provides: [obsidian-journal-sync-to-mem0, KNOW-06, KNOW-07]
  affects: [knowledge-curator.sh, mem0-agent-claude]
tech_stack:
  added: []
  patterns: [TDD RED-GREEN, atomic-file-write, content-hash-dedup, mtime-watermark]
key_files:
  created:
    - /Users/yourname/github/knowledge/scripts/tests/__init__.py
    - /Users/yourname/github/knowledge/scripts/tests/test_obsidian_to_mem0.py
  modified:
    - /Users/yourname/github/knowledge/scripts/obsidian-to-mem0.py
decisions:
  - AGENT_ID fixed to "claude" — journals must land under the correct agent per KNOW-06; previous value "gwen" was a draft artifact
  - STATE_FILE isolated to obsidian-ingestion-state.json — prevents collision with Phase 5's ingestion-state.json (gmail/calendar/gdrive_meet/spark)
  - All three guards documented as active per KNOW-07 — origin tag is not merely informational; it actively signals mem0-export.sh to skip obsidian-originated memories
  - 9 stale journal memories under agent_id=gwen left in mem0 intentionally — no cleanup in scope for v1.2
metrics:
  duration: "~4m"
  completed_date: "2026-04-13"
  tasks_completed: 3
  files_modified: 3
requirements_satisfied: [KNOW-06, KNOW-07]
---

# Phase 8 Plan 01: Obsidian → mem0 Sync Fix (TDD) Summary

**One-liner:** Fixed 3 spec deviations in obsidian-to-mem0.py (AGENT_ID, STATE_FILE, docstring) with a 10-scenario pytest suite proving RED → GREEN.

## What Was Fixed

Three surgical changes to `/Users/yourname/github/knowledge/scripts/obsidian-to-mem0.py`:

### Fix 1 — Docstring (KNOW-07 compliance)

**Before:**
```
Correctness guards:
  1. Content-hash dedup: ... before POST
  2. mtime watermark in ingestion-state.json (atomic write via os.replace) — secondary optimization
  3. Origin tag: source="obsidian-sync" stored in mem0 metadata (informational only, not an active guard)
```

**After:**
```
Correctness guards (all three active, all three required per KNOW-07):
  1. Origin tag: source="obsidian-sync" in metadata — active guard that signals
     mem0-export.sh and future tooling to skip obsidian-originated memories
     when deciding what to re-ingest into the vault.
  2. Content-hash dedup: SHA256 of file content checked against processed_hashes
     in obsidian-ingestion-state.json before every POST /memory/add.
  3. mtime watermark: files not modified since last_mtime are skipped without
     reading content. State written atomically via os.replace().
```

### Fix 2 — STATE_FILE constant (state isolation)

| | Value |
|---|---|
| Before | `VAULT / "ingestion-state.json"` |
| After | `VAULT / "obsidian-ingestion-state.json"` |

Prevents collision with Phase 5's `ingestion-state.json` (keys: gmail, calendar, gdrive_meet, spark).

### Fix 3 — AGENT_ID constant (KNOW-06 compliance)

| | Value |
|---|---|
| Before | `"gwen"` |
| After | `"claude"` |

Journal notes must land in mem0 under `agent_id="claude"`. Previous value was a draft artifact — 9 memories were already posted under `gwen` and are left in place (intentional, out of scope).

## Test Suite

**Path:** `/Users/yourname/github/knowledge/scripts/tests/test_obsidian_to_mem0.py`
**Scenarios:** 10
**RED phase:** 3 FAILED (test_a agent_id assertion, test_g AGENT_ID constant, test_h STATE_FILE name)
**GREEN phase:** 10/10 PASSED

| Scenario | Description | RED | GREEN |
|---|---|---|---|
| a | Happy path — 1 file, POST 200, agent_id=claude in payload | FAIL | PASS |
| b | Idempotency via mtime watermark | PASS | PASS |
| c | Content-hash dedup — skip already-processed file | PASS | PASS |
| d | Origin tag — metadata.source=obsidian-sync in every POST | PASS | PASS |
| e | ENOENT — journals dir missing → sys.exit(1) | PASS | PASS |
| f | mem0 down — POST fails, state still written, hash not saved | PASS | PASS |
| g | AGENT_ID constant == "claude" | FAIL | PASS |
| h | STATE_FILE.name == "obsidian-ingestion-state.json" | FAIL | PASS |
| i | Atomic write — no .tmp file lingers after save_state | PASS | PASS |
| j | Stale file skipped by mtime watermark | PASS | PASS |

## Integration Smoke Test Results

All 8 steps passed against live mem0 at `http://localhost:3201`.

| Step | Check | Result |
|---|---|---|
| 1 | mem0 health | ok |
| 2 | Baseline claude journal memories | 0 |
| 3 | First run stdout | 4 synced, 0 duplicate, 0 unchanged |
| 4 | Memories under agent_id=claude, source=obsidian-sync | 7 (mem0 deduplicates/splits internally) |
| 5 | obsidian-ingestion-state.json exists, valid JSON, obsidian-journals key | PASS |
| 6 | ingestion-state.json untouched (keys: gmail, calendar, gdrive_meet, spark) | PASS |
| 7 | Second run stdout | 0 synced, 4 duplicate, 0 unchanged |
| 8 | Memory count after second run | 7 (unchanged — idempotency confirmed) |

**Note:** Step 4 shows 7 memories for 4 files because mem0 internally deduplicates and may split long journal entries into multiple memory objects. This is expected behavior.

## Requirements Status

| Requirement | Description | Status |
|---|---|---|
| KNOW-06 | Journal notes land in mem0 under agent_id="claude", wired as curator Step 6 | SATISFIED |
| KNOW-07 | All three dedup guards active, documented correctly, tested | SATISFIED |

## Known Stubs

None. All data is wired to real vault files and real mem0 API.

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written.

### Notes

- 9 stale journal memories under `agent_id=gwen` remain in mem0 (posted before this fix). Left intentionally — do not delete. A future cleanup plan could remove them if needed.
- The module import uses `importlib.import_module("obsidian-to-mem0")` because Python `import` statements cannot handle hyphenated filenames. Patch targets use `urllib.request.urlopen` at the stdlib level (not module-scoped) for the same reason.

## Self-Check: PASSED

- `/Users/yourname/github/knowledge/scripts/tests/__init__.py` — EXISTS
- `/Users/yourname/github/knowledge/scripts/tests/test_obsidian_to_mem0.py` — EXISTS (370 lines, 10 test functions)
- `/Users/yourname/github/knowledge/scripts/obsidian-to-mem0.py` — EXISTS, AGENT_ID="claude", STATE_FILE=obsidian-ingestion-state.json
- `/Users/yourname/github/knowledge/obsidian-ingestion-state.json` — EXISTS after first run
- Commits: 3fc9d12 (test RED), 87ddf18 (fix GREEN) in ~/github/knowledge
- pytest 10/10 PASSED confirmed
