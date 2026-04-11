---
phase: 05-knowledge-ingestion-pipeline
plan: "04"
subsystem: knowledge-ingestion
tags: [spark, sqlite, transcripts, qdrant, vector-indexing, obsidian]
dependency_graph:
  requires: [05-01, 05-03]
  provides: [spark-ingestion, qdrant-paths-updated]
  affects: [nightly-ingestion-cron, qdrant-knowledge-docs]
tech_stack:
  added: [sqlite3 (stdlib read-only URI mode)]
  patterns: [SQLite read-only URI connection, watermark-by-rowid state tracking, project meeting note per transcript]
key_files:
  modified:
    - ~/github/knowledge/personal-ingestion-transcripts.py
    - ~/github/knowledge/qdrant-indexer.py
decisions:
  - slugify applied to inferred project name before filesystem use (T-05-17 mitigation, project_name already slugified by _infer_project_name but double-applied for defense-in-depth)
metrics:
  duration: "~10 minutes"
  completed: "2026-04-11"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 2
---

# Phase 05 Plan 04: Spark SQLite Ingestion + Qdrant PATHS Summary

Spark Desktop SQLite transcript ingestion added to personal-ingestion-transcripts.py with read-only URI mode access, and qdrant-indexer.py PATHS expanded to 8 entries covering emails, meet-recordings, and spark-recordings directories.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add Spark SQLite ingestion to personal-ingestion-transcripts.py | 7e5841c | ~/github/knowledge/personal-ingestion-transcripts.py |
| 2 | Update qdrant-indexer.py PATHS with new content directories | 8a5e46c | ~/github/knowledge/qdrant-indexer.py |

## What Was Built

### Task 1: Spark SQLite Ingestion

Added `ingest_spark(state)` to `personal-ingestion-transcripts.py`:

- Reads `meetTranscriptEvent JOIN messages` from Spark Desktop's SQLite database at `/Users/lcalderon/Library/Application Support/Spark Desktop/core-data/messages.sqlite`
- Connects read-only via `sqlite3.connect(f"file:{SPARK_DB}?mode=ro", uri=True)` — T-05-14 mitigation
- Queries rows newer than `state["spark"]["last_message_rowid"]` watermark (incremental ingestion)
- Writes markdown to `~/github/knowledge/spark-recordings/{date}-{rowid}.md` with frontmatter: rowid, title, date, attendees, source: spark_desktop
- Adds mem0 memory per transcript event with type=spark_transcript metadata
- Calls `create_project_meeting_note()` for each event — D-07 Obsidian meeting note requirement
- Returns meetings_text for caller to `append_daily_note(today, "Meetings", spark_meetings_text)`
- Updates `state["spark"]["last_message_rowid"]` and `state["spark"]["last_run"]`

New constants added:
- `SPARK_DB = Path("/Users/lcalderon/Library/Application Support/Spark Desktop/core-data/messages.sqlite")`
- `SPARK_DIR = KNOWLEDGE_ROOT / "spark-recordings"`

`ingest_transcripts()` updated to call `ingest_spark` after Drive ingestion and fold Spark meetings into the daily note Meetings section.

### Task 2: qdrant-indexer.py PATHS Update

Added 3 new entries to PATHS list (total: 8 entries):
- `Path.home() / "github/knowledge/emails"`
- `Path.home() / "github/knowledge/gdrive/meet-recordings"`
- `Path.home() / "github/knowledge/spark-recordings"`

The existing `rglob("*.md")` + `EXCLUDED_DIRS` logic automatically picks up markdown files in these new directories on nightly runs.

## Verification Results

All acceptance criteria passed:
- `def ingest_spark` — present
- `SPARK_DB` constant — present
- `mode=ro` URI connection — present (T-05-14 mitigated)
- `last_message_rowid` watermark — present
- `spark-recordings` directory reference — present
- `import sqlite3` — present
- `source: spark_desktop` frontmatter marker — present
- `create_project_meeting_note` called within `ingest_spark` — present (D-07 satisfied)
- `append_daily_note` called for both Drive and Spark meetings — 2 call sites at lines 593, 599
- Python import of `ingest_spark` succeeds
- qdrant-indexer.py: emails, meet-recordings, spark-recordings all present
- qdrant-indexer.py: 8 `Path.home()` entries (5 original + 3 new)

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written.

One minor implementation note: `_infer_project_name()` already returns a slugified string (calls `slugify()` internally), so the explicit `project_name = slugify(project_name)` call in `ingest_spark` is defense-in-depth for T-05-17 (Tampering via unsanitized project name in filesystem path). This is consistent with the threat model mitigation intent.

## Known Stubs

None — all data flows are wired. Spark ingestion reads from live SQLite DB, writes to real directories, adds real mem0 memories, creates real project meeting notes.

## Threat Flags

No new trust boundaries introduced beyond those documented in the plan's threat model.

## Self-Check: PASSED

- `~/github/knowledge/personal-ingestion-transcripts.py` — FOUND (modified, committed at 7e5841c)
- `~/github/knowledge/qdrant-indexer.py` — FOUND (modified, committed at 8a5e46c)
- Commit 7e5841c — FOUND in knowledge repo
- Commit 8a5e46c — FOUND in knowledge repo
