---
phase: 05-knowledge-ingestion-pipeline
plan: 02
subsystem: knowledge-ingestion
tags: [gmail, ingestion, python, bash, obsidian, cron]
dependency_graph:
  requires: [05-01]
  provides: [personal-ingestion-email.py, personal-ingestion-email.sh]
  affects: [~/github/knowledge/emails/, ~/github/knowledge/journals/, ~/github/knowledge/ingestion-state.json]
tech_stack:
  added: [gws CLI (Gmail API proxy), email.utils (RFC2822 date parsing)]
  patterns: [subprocess + JSON parse wrapper, set -a/.env sourcing, non-fatal cron step]
key_files:
  created:
    - ~/github/knowledge/personal-ingestion-email.py
    - ~/github/knowledge/personal-ingestion-email.sh
  modified: []
decisions:
  - "Filename uses thread_id (alphanumeric) not subject to prevent path traversal (T-05-08)"
  - "MAX_THREADS_PER_RUN=50 + 100ms rate limit guards against runaway Gmail API usage (T-05-07)"
  - "gws_cmd() returns {} on any failure so ingest_emails() continues to next thread"
  - "email.utils.parsedate_to_datetime() used for RFC2822 Date header parsing with fallback to today"
metrics:
  duration: "~8 minutes"
  completed: "2026-04-11T02:42:05Z"
  tasks_completed: 2
  files_created: 2
---

# Phase 05 Plan 02: Gmail Email Ingestion Pipeline Summary

**One-liner:** Gmail ingestion pipeline using gws CLI — fetches replied-to threads, decodes base64 MIME bodies, writes per-thread markdown files, appends Email Digest to Obsidian daily note, deduplicates by thread ID in state file.

## What Was Built

Two files in `~/github/knowledge/`:

**`personal-ingestion-email.py`** — Python worker (270 lines) that:
- Calls `gws gmail users threads list` with `from:me after:YYYY/MM/DD` server-side filter
- Fetches each full thread via `gws gmail users threads get --format full`
- Decodes base64 MIME bodies and strips HTML using shared `get_body()` from ingestion_utils
- Writes one markdown file per thread to `emails/` with YAML frontmatter (thread_id, subject, date, participants) and per-message sections
- Appends an Email Digest bullet list to today's Obsidian daily note via `append_daily_note()`
- Deduplicates by checking `state["gmail"]["ingested_thread_ids"]` before fetching
- Caps at 50 threads per run + 100ms rate limit between fetches

**`personal-ingestion-email.sh`** — Bash wrapper that:
- Sources `.env` with `set -a/set +a` pattern for cron context
- Calls Python worker non-fatally (`|| log "Warning: ... (non-fatal)"`)
- Ready for cron: `0 */6 * * *`

## Threat Mitigations Applied

| Threat ID | Mitigation | Implementation |
|-----------|-----------|----------------|
| T-05-06 | HTML stripped before writing | `get_body()` from ingestion_utils strips `<tags>` |
| T-05-07 | Unbounded fetch prevented | `MAX_THREADS_PER_RUN=50` + `time.sleep(0.1)` |
| T-05-08 | Path traversal prevented | Filename = `{date}-{thread_id}.md` (no subject in path) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical Functionality] Added RFC2822 date parsing for filename**
- **Found during:** Task 1 implementation
- **Issue:** Plan spec said "Extract date from first message for filename" but didn't specify parsing strategy for Gmail's RFC2822 Date headers (e.g. "Mon, 10 Apr 2026 12:34:56 +0000")
- **Fix:** Used `email.utils.parsedate_to_datetime()` (stdlib) with fallback to `today_str` on parse failure
- **Files modified:** `personal-ingestion-email.py`

**2. [Rule 2 - Missing Critical Functionality] Added `_get_header()` helper**
- **Found during:** Task 1 implementation
- **Issue:** Plan showed inline header extraction but repeated in 3+ places — extracted to `_get_header(headers, name)` for correctness
- **Files modified:** `personal-ingestion-email.py`

## Commits

| Task | Commit | Message |
|------|--------|---------|
| Task 1: Python worker | `b472bcd` | feat(05-02): create personal-ingestion-email.py |
| Task 2: Bash wrapper | `c29e09b` | feat(05-02): create personal-ingestion-email.sh |

## Known Stubs

None. Both files are fully implemented. No placeholders or TODO markers.

## Self-Check

- [x] `~/github/knowledge/personal-ingestion-email.py` exists
- [x] `~/github/knowledge/personal-ingestion-email.sh` exists and is executable
- [x] Python module loads without errors
- [x] All required functions present: `ingest_emails`, `list_threads`, `fetch_thread`, `thread_to_markdown`, `build_digest_entry`, `gws_cmd`
- [x] All required patterns: `from ingestion_utils import`, `after:`, `ingested_thread_ids`, `time.sleep`, `append_daily_note`
- [x] Commits b472bcd and c29e09b exist in knowledge repo

## Self-Check: PASSED
