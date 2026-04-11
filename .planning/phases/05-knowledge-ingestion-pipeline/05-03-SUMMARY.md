---
phase: 05-knowledge-ingestion-pipeline
plan: "03"
subsystem: knowledge-ingestion
tags: [ingestion, calendar, google-meet, transcripts, mem0, multi-event-collision, obsidian]
dependency_graph:
  requires: [05-01-foundation-layer]
  provides: [personal-ingestion-transcripts.py, personal-ingestion-transcripts.sh]
  affects: [05-05-cron-wiring]
tech_stack:
  added: []
  patterns: [gws-cli-json-parsing, drive-export-output-flag, multi-event-collision-index-notes, project-meeting-notes, slugify-path-safety]
key_files:
  created:
    - ~/github/knowledge/personal-ingestion-transcripts.py
    - ~/github/knowledge/personal-ingestion-transcripts.sh
  modified: []
decisions:
  - "Drive export uses --output flag to temp file (not stdout) to avoid HTTP 500 on large transcripts"
  - "Multi-event collision (D-13/D-14): single canonical markdown in meet-recordings, per-event index notes in projects/ with shared_doc:true"
  - "Project name inferred via known keyword list + attendee domain heuristic, falls back to 'general'"
  - "slugify() applied to all path components before filesystem use (T-05-12 mitigation)"
  - "500ms sleep between Drive exports to stay within API rate limits (T-05-11 mitigation)"
metrics:
  duration: "~2 minutes"
  completed: "2026-04-11"
  tasks_completed: 2
  files_created: 2
---

# Phase 05 Plan 03: Calendar + Google Meet Transcript Ingestion Summary

**One-liner:** Python worker with ingest_calendar (GCal events to mem0), ingest_drive_transcripts (Notes by Gemini export with --output flag, multi-event collision handling via index notes), project meeting note creation, and Obsidian daily note Meetings section; plus bash cron wrapper following knowledge-curator.sh pattern.

## Tasks Completed

| # | Task | Commit (knowledge repo) | Files |
|---|------|------------------------|-------|
| 1 | Create personal-ingestion-transcripts.py | 356036b | personal-ingestion-transcripts.py |
| 2 | Create personal-ingestion-transcripts.sh | 1e99a86 | personal-ingestion-transcripts.sh |

## What Was Built

### personal-ingestion-transcripts.py

Python worker at `~/github/knowledge/personal-ingestion-transcripts.py`. Key functions:

- **`gws_cmd(args)`** — subprocess wrapper for gws CLI; parses JSON stdout, returns `{}` on failure with timeout handling
- **`ingest_calendar(state)`** — fetches GCal events in [last_run, now] window, dedupes via `ingested_event_ids`, adds each as mem0 memory with `type=calendar_event` metadata, returns state + event list for Drive matching
- **`ingest_drive_transcripts(state, calendar_events)`** — lists Drive docs matching `"Notes by Gemini"` modified since last_run; exports each via `gws drive files export --output /tmp/transcript-{id}.txt` (avoids HTTP 500); saves canonical transcript once to `meet-recordings/{date}-{id[:15]}.md`; performs multi-event collision check; creates per-event index notes when shared_doc=true; adds mem0 memory per transcript
- **`_match_event_for_doc(doc_date, doc_title, events)`** — date + title/conferenceId matching for Drive→Calendar correlation
- **`_infer_project_name(title, attendees)`** — keyword + domain heuristic for project directory routing
- **`create_project_meeting_note(...)`** — writes `projects/{project}/meetings/{date}-{slug}.md` with frontmatter
- **`build_meetings_section(events, titles)`** — formats Obsidian daily note Meetings section
- **`ingest_transcripts()`** — main entry: ensure_dirs, load_state, ingest_calendar, ingest_drive_transcripts, append_daily_note, update last_run, save_state

**Multi-event collision (D-13/D-14/D-15):**
- Canonical raw transcript stored exactly once in `gdrive/meet-recordings/`
- If one doc maps to multiple events: per-event index notes created in `projects/{project}/meetings/{date}-{slug}-index.md` with `shared_doc: true` frontmatter
- Motivating case: Juan meetings April 8 + April 9 sharing one Google Doc

### personal-ingestion-transcripts.sh

Bash wrapper at `~/github/knowledge/personal-ingestion-transcripts.sh`. Mirrors `knowledge-curator.sh` pattern:
- PATH set for cron context
- `set -a && source ~/github/knowledge/.env && set +a` for env loading
- Python worker called non-fatally: `... || log "Warning: transcript ingestion failed (non-fatal)"`
- Standalone cron comment included for reference

## Verification Results

```
bash -n personal-ingestion-transcripts.sh → SYNTAX OK
test -x personal-ingestion-transcripts.sh → EXECUTABLE
Python import → IMPORT OK
All acceptance criteria checks: 12/12 passed
```

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all functions are fully implemented. Live test (Drive API + Calendar API connectivity) requires running with real credentials; logic gates on API responses are in place.

## Threat Flags

None — all trust boundaries in plan's threat model are addressed: slugify() on all path components (T-05-12), 500ms sleep + pageSize=100 cap (T-05-11), temp files deleted after read.

## Self-Check: PASSED

- `~/github/knowledge/personal-ingestion-transcripts.py` — FOUND
- `~/github/knowledge/personal-ingestion-transcripts.sh` — FOUND
- Commit 356036b (knowledge repo) — FOUND
- Commit 1e99a86 (knowledge repo) — FOUND
