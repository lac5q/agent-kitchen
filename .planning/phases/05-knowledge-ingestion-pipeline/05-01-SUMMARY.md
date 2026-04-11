---
phase: 05-knowledge-ingestion-pipeline
plan: "01"
subsystem: knowledge-ingestion
tags: [ingestion, state-management, python-utilities, smoke-test, mem0, qdrant]
dependency_graph:
  requires: []
  provides: [ingestion-state.json, ingestion_utils.py, personal-ingestion-smoke.sh]
  affects: [05-02-email-ingestion, 05-03-calendar-ingestion, 05-04-transcripts-ingestion, 05-05-cron-wiring]
tech_stack:
  added: [requests (stdlib+), ingestion_utils.py module]
  patterns: [atomic-write-via-os.replace, base64url-body-decode, multipart-mime-recursion]
key_files:
  created:
    - ~/github/knowledge/ingestion-state.json
    - ~/github/knowledge/ingestion_utils.py
    - ~/github/knowledge/personal-ingestion-smoke.sh
  modified: []
decisions:
  - "Atomic state write via temp file + os.replace() — prevents corruption on interrupted runs (T-05-02)"
  - "get_body() recursion prefers text/plain over text/html in multipart/alternative — avoids HTML noise in ingested content"
  - "ensure_dirs() called explicitly rather than inline — callers can invoke once at script start"
metrics:
  duration: "~2 minutes"
  completed: "2026-04-11"
  tasks_completed: 2
  files_created: 3
---

# Phase 05 Plan 01: Foundation Layer — State, Utilities, Smoke Test Summary

**One-liner:** Shared Python utility module with 7 functions (state I/O, mem0 REST, Gmail body extraction, slugify, Obsidian daily note append) plus JSON watermark file and connectivity smoke test passing all 7 dependency checks.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Create ingestion-state.json and ingestion_utils.py | 47538c9 | ingestion-state.json, ingestion_utils.py |
| 2 | Create smoke test script | c4a42d6 | personal-ingestion-smoke.sh |

## What Was Built

### ingestion-state.json
Watermark state file at `~/github/knowledge/ingestion-state.json`. Tracks per-source last_run timestamps and ingested IDs to prevent duplicate ingestion across 6-hour cron runs. Four sources: gmail, calendar, gdrive_meet, spark.

### ingestion_utils.py
Shared Python module at `~/github/knowledge/ingestion_utils.py`. Exports 7 functions used by all subsequent ingestion scripts:

- `load_state()` — reads STATE_PATH, returns DEFAULT_STATE copy on missing/corrupt file
- `save_state(state)` — atomic write via `os.replace()` (T-05-02 mitigation)
- `add_mem0(text, agent_id, metadata)` — POST to localhost:3201/memory/add with 10s timeout, returns bool
- `get_body(payload)` — recursive Gmail MIME extractor, prefers text/plain, strips HTML tags, decodes base64url
- `slugify(title)` — lowercase, replace non-alphanumeric with hyphens, max 50 chars
- `append_daily_note(date_str, section, content)` — creates journal file if missing, appends `## section` to end
- `ensure_dirs()` — mkdir -p for emails/, gdrive/meet-recordings/, spark-recordings/, projects/, journals/

### personal-ingestion-smoke.sh
Connectivity verification script at `~/github/knowledge/personal-ingestion-smoke.sh`. Tests 7 external dependencies. Smoke test run result: **ALL CHECKS PASSED (7/7)** in under 5 seconds.

| Check | Status | Detail |
|-------|--------|--------|
| Gmail auth | PASS | emailAddress present in gws response |
| Calendar auth | PASS | items/etag present in gws response |
| Drive auth | PASS | user field present in gws response |
| Spark SQLite | PASS | 250 transcript events readable |
| mem0 health | PASS | localhost:3201 returns HTTP 200 |
| Qdrant Cloud | PASS | knowledge_docs collection has 3136 points |
| State file | PASS | ingestion-state.json exists |

## Verification Results

```
ALL IMPORTS OK
load_state() → dict with 4 keys: gmail, calendar, gdrive_meet, spark
jq . ingestion-state.json → valid JSON
bash personal-ingestion-smoke.sh → exit 0, ALL CHECKS PASSED (7/7)
```

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — foundation layer has no UI rendering or data display paths.

## Threat Flags

None — no new network endpoints or auth paths introduced beyond what the plan's threat model covers.

## Self-Check: PASSED

- `~/github/knowledge/ingestion-state.json` — FOUND
- `~/github/knowledge/ingestion_utils.py` — FOUND
- `~/github/knowledge/personal-ingestion-smoke.sh` — FOUND
- Commit 47538c9 — FOUND (knowledge repo master)
- Commit c4a42d6 — FOUND (knowledge repo master)
