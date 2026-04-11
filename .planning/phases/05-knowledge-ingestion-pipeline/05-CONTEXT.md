# Phase 5: Personal Knowledge Ingestion Pipeline - Context

**Gathered:** 2026-04-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Build a personal knowledge ingestion pipeline that pulls emails (threads Luis replied to), calendar events, Google Meet transcripts (Drive), and Spark meeting transcripts (SQLite) into mem0, QMD/Qdrant, and Obsidian.

- Email/calendar: runs every 6 hours via scheduled agent using gws CLI
- Transcripts: runs nightly (folded into existing knowledge-curator.sh or separate script)
- Obsidian: gets daily notes (email digest + meetings section) and project-based meeting notes

No new UI. No new API routes in agent-kitchen. This is pure data pipeline work in `~/github/knowledge/`.

</domain>

<decisions>
## Implementation Decisions

### Email Ingestion Scope
- **D-01:** Ingest full thread content (all participants' messages), filtered to threads where Luis has replied — use Gmail threads API with `q: "from:me"` to find threads, then fetch each thread's full message list.
- **D-02:** No attachments. Text body only (prefer plain text part, fall back to HTML stripped of tags).
- **D-03:** Deduplicate by thread ID — skip threads already in `ingestion-state.json`.

### Destination Routing
- **D-04:** Emails → QMD/Qdrant (full thread as markdown in `knowledge/emails/`) + Obsidian daily note digest section.
- **D-05:** Calendar events → mem0 (event metadata: title, date, attendees, description as a memory) + Obsidian daily note meetings section.
- **D-06:** Google Meet transcripts (Drive docs) → mem0 (meeting summary as memory) + QMD/Qdrant (full transcript markdown in `knowledge/gdrive/meet-recordings/`) + Obsidian meeting note.
- **D-07:** Spark transcripts (SQLite) → mem0 (meeting summary as memory) + QMD/Qdrant (transcript markdown in `knowledge/spark-recordings/`) + Obsidian meeting note.

### Obsidian Daily Note Format
- **D-08:** Append to `~/github/knowledge/journals/YYYY-MM-DD.md`. Create the file if it doesn't exist for that date.
- **D-09:** Two appended sections per daily note run:
  - `## Email Digest` — bulleted list of threads ingested: `- **[Subject]** (N messages) — [1-line summary]`
  - `## Meetings` — per meeting: `### [Title] (YYYY-MM-DD)` with attendees list + 2-3 sentence summary
- **D-10:** Project-based meeting notes → `~/github/knowledge/projects/<project-name>/meetings/YYYY-MM-DD-<title-slug>.md`. Project name inferred from calendar event title or attendees heuristic; fall back to `general/` if ambiguous.

### State & De-duplication
- **D-11:** Single JSON watermark file at `~/github/knowledge/ingestion-state.json`. Structure:
  ```json
  {
    "gmail": { "last_run": "ISO8601", "ingested_thread_ids": [] },
    "calendar": { "last_run": "ISO8601", "ingested_event_ids": [] },
    "gdrive_meet": { "last_run": "ISO8601", "ingested_doc_ids": [] },
    "spark": { "last_run": "ISO8601", "last_message_rowid": 0 }
  }
  ```
- **D-12:** On each run, only process items newer than `last_run` timestamp (or not in the ingested IDs list). Update state file at end of successful run.

### Meeting Note Normalization (from NOTES.md — already decided)
- **D-13:** Per ingestion run, check if a Google Doc is referenced by more than one calendar event. If one doc → one event: ingest normally. If one doc → multiple events: create a normalized index note per event pointing to the canonical raw doc.
- **D-14:** Index note schema (per NOTES.md): `date`, `event_id`, `attendees`, `source_doc_id`, `shared_doc: true/false`, plus excerpt from canonical doc relevant to this event. Raw canonical file stored exactly once.
- **D-15:** Known existing case: Juan meetings (April 8 + April 9) share one Google Doc — motivating example for this requirement.

### Script Architecture
- **D-16:** Email/calendar ingestion: new script `~/github/knowledge/personal-ingestion-email.sh` (runs every 6 hours via cron, uses gws CLI).
- **D-17:** Transcript ingestion: new script `~/github/knowledge/personal-ingestion-transcripts.sh` (runs nightly, folded into knowledge-curator.sh or called from it).
- **D-18:** Both scripts follow the established pattern: source `~/github/knowledge/.env`, use `set -a` / `set +a`, log with timestamp function, non-fatal failures with `|| log "Warning: ..."`.
- **D-19:** gws CLI auth: uses existing OAuth credentials already configured at `/Users/yourname/bin/gws`. No new auth setup needed.
- **D-20:** Spark SQLite path: `/Users/yourname/Library/Application Support/Spark Desktop/core-data/messages.sqlite` (confirmed exists). Read-only queries only.

### Claude's Discretion
- Exact SQL schema queries against Spark SQLite — researcher should probe the schema to determine which tables/columns map to threads and messages
- Python vs bash for SQLite access — Python preferred (sqlite3 stdlib) given existing `.venv` in knowledge repo
- Qdrant collection for emails/transcripts — researcher to confirm whether to add to `knowledge_docs` or create a separate collection

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing Infrastructure
- `~/github/knowledge/knowledge-curator.sh` — Nightly orchestrator pattern to follow/extend
- `~/github/knowledge/mem0-config.yaml` — mem0 + Qdrant Cloud config (agent_memory collection, Gemini embedder)
- `~/github/knowledge/qdrant-indexer.py` — Existing Qdrant indexer for knowledge_docs collection
- `~/github/knowledge/.env` — API keys and env vars (source with `set -a` pattern)

### Data Sources
- gws CLI: `/Users/yourname/bin/gws` — Gmail threads, Calendar events, Drive files
- Spark SQLite: `/Users/yourname/Library/Application Support/Spark Desktop/core-data/messages.sqlite`
- Google Drive Meet transcripts: accessible via `gws drive files list` with Meet-related queries

### Obsidian Vault
- `~/github/knowledge/journals/` — Daily notes location
- `~/github/knowledge/` — Root of Obsidian vault and QMD collections

### Pre-Planning Notes
- `.planning/phases/05-knowledge-ingestion-pipeline/NOTES.md` — Meeting note normalization requirement (MUST read — multi-event collision handling already decided)

### Requirements
- `.planning/REQUIREMENTS.md` — No v1.1 requirement formally assigned yet (TBD)

</canonical_refs>

<specifics>
## Specific Details

- Spark has multiple SQLite databases: `messages.sqlite`, `threadSummary.sqlite`, `search_fts5.sqlite` — researcher should determine which to query for transcript content
- gws threads query: `gws gmail users threads list --params '{"userId": "me", "q": "from:me"}'`
- ingestion-state.json approach prevents re-ingesting on every 6-hour run — critical for email given volume
- Daily note append pattern (not overwrite) — multiple runs per day should stack sections

</specifics>

<deferred>
## Deferred Ideas

- Scheduled agent via Claude Code remote trigger (`/rc`) — out of scope for this phase; cron + bash is sufficient
- Bidirectional mem0 ↔ Obsidian sync (KNOW-06 v2 requirement)
- Attachment ingestion (PDFs, images from email) — deferred, text-only for now
- Real-time transcript ingestion (inotify trigger) — deferred, nightly cron is sufficient
- Dashboard visibility of ingestion pipeline status (new Library card) — could be a later phase

</deferred>

---

*Phase: 05-knowledge-ingestion-pipeline*
*Context gathered: 2026-04-10*
