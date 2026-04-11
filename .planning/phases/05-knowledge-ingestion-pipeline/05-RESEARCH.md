# Phase 5: Personal Knowledge Ingestion Pipeline — Research

**Researched:** 2026-04-10
**Domain:** Shell scripting + Python data pipeline — gws CLI, SQLite, Google Drive API, mem0 REST, Qdrant indexing, Obsidian markdown generation
**Confidence:** HIGH (all major claims verified by live system probing)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Ingest full thread content (all participants' messages), filtered to threads where Luis has replied — use Gmail threads API with `q: "from:me"` to find threads, then fetch each thread's full message list.
- **D-02:** No attachments. Text body only (prefer plain text part, fall back to HTML stripped of tags).
- **D-03:** Deduplicate by thread ID — skip threads already in `ingestion-state.json`.
- **D-04:** Emails → QMD/Qdrant (full thread as markdown in `knowledge/emails/`) + Obsidian daily note digest section.
- **D-05:** Calendar events → mem0 (event metadata: title, date, attendees, description as a memory) + Obsidian daily note meetings section.
- **D-06:** Google Meet transcripts (Drive docs) → mem0 (meeting summary as memory) + QMD/Qdrant (full transcript markdown in `knowledge/gdrive/meet-recordings/`) + Obsidian meeting note.
- **D-07:** Spark transcripts (SQLite) → mem0 (meeting summary as memory) + QMD/Qdrant (transcript markdown in `knowledge/spark-recordings/`) + Obsidian meeting note.
- **D-08:** Append to `~/github/knowledge/journals/YYYY-MM-DD.md`. Create file if it doesn't exist.
- **D-09:** Two appended sections per daily note: `## Email Digest` + `## Meetings`.
- **D-10:** Project-based meeting notes → `~/github/knowledge/projects/<project-name>/meetings/YYYY-MM-DD-<title-slug>.md`. Fall back to `general/` if project ambiguous.
- **D-11:** Single JSON watermark at `~/github/knowledge/ingestion-state.json`.
- **D-12:** Only process items newer than `last_run` timestamp. Update state at end of successful run.
- **D-13:** Per ingestion run, check if a Google Doc is referenced by more than one calendar event.
- **D-14:** Index note schema: `date`, `event_id`, `attendees`, `source_doc_id`, `shared_doc: true/false` + excerpt.
- **D-15:** Known existing case: Juan meetings (April 8 + April 9) share one Google Doc.
- **D-16:** Email/calendar: new script `~/github/knowledge/personal-ingestion-email.sh` (runs every 6 hours via cron).
- **D-17:** Transcript ingestion: new script `~/github/knowledge/personal-ingestion-transcripts.sh` (runs nightly, called from knowledge-curator.sh or standalone).
- **D-18:** Both scripts follow established pattern: `source ~/github/knowledge/.env`, `set -a`/`set +a`, `log()` timestamp function, non-fatal failures with `|| log "Warning: ..."`.
- **D-19:** gws CLI auth: uses existing OAuth credentials at `/Users/lcalderon/bin/gws`. No new auth setup needed.
- **D-20:** Spark SQLite path: `/Users/lcalderon/Library/Application Support/Spark Desktop/core-data/messages.sqlite`. Read-only queries only.

### Claude's Discretion

- Exact SQL schema queries against Spark SQLite — researcher should probe the schema
- Python vs bash for SQLite access — Python preferred (sqlite3 stdlib) given existing `.venv`
- Qdrant collection for emails/transcripts — researcher to confirm whether to add to `knowledge_docs` or create separate collection

### Deferred Ideas (OUT OF SCOPE)

- Scheduled agent via Claude Code remote trigger (`/rc`)
- Bidirectional mem0 ↔ Obsidian sync (KNOW-06 v2)
- Attachment ingestion (PDFs, images from email)
- Real-time transcript ingestion (inotify trigger)
- Dashboard visibility of ingestion pipeline status
</user_constraints>

---

## Summary

This phase builds two new shell scripts in `~/github/knowledge/` that pull personal data from four sources (Gmail, Google Calendar, Google Drive Meet transcripts, Spark Desktop SQLite) and route them into three destinations (mem0, QMD/Qdrant via qdrant-indexer.py, Obsidian markdown). All infrastructure is live and verified: gws CLI is authenticated and working, mem0 server is running at localhost:3201, Spark SQLite has 250 meetTranscriptEvent rows, Drive has at least 10 "Notes by Gemini" documents ready for export, and the Qdrant Cloud `knowledge_docs` collection already accepts upserts from the existing qdrant-indexer.py pattern.

The primary engineering challenges are: (1) correlating Google Drive transcript docs to calendar events (no direct attachment link exists — requires date/title matching), (2) handling the multi-event doc collision (D-13/D-15), (3) extracting Gmail message body text from base64-encoded multipart MIME payloads, and (4) reading Spark transcript summaries which are stored in `meetTranscriptEvent.summary` and are AI-synthesized (not full transcripts — only 39 chars for the longest row seen).

**Primary recommendation:** Both scripts are Python workers invoked by thin bash wrappers following the knowledge-curator.sh pattern. Python handles all data parsing (JSON, base64, SQLite, HTML stripping). The bash wrapper sources `.env`, calls the Python worker, and logs with the established `log()` pattern.

---

## Standard Stack

### Core (all verified in `.venv`)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `sqlite3` (stdlib) | Python 3.x | Read Spark SQLite | No install needed, read-only queries |
| `qdrant-client` | 1.17.1 [VERIFIED: pip list in .venv] | Upsert to `knowledge_docs` | Already used by qdrant-indexer.py |
| `google-genai` | 1.67.0 [VERIFIED: pip list in .venv] | Gemini embeddings for Qdrant | Already used by qdrant-indexer.py |
| `requests` | 2.32.5 [VERIFIED: pip list in .venv] | HTTP calls to mem0 REST API | Present, simple |
| `mem0ai` | 1.0.6 [VERIFIED: pip list in .venv] | Direct Python mem0 SDK (alternative to REST) | Available but REST preferred (server already running) |
| `html.parser` (stdlib) | Python 3.x | Strip HTML tags from email bodies | No install needed |
| `base64` (stdlib) | Python 3.x | Decode Gmail message body | No install needed |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `json` (stdlib) | Python 3.x | ingestion-state.json read/write | Always |
| `pathlib` (stdlib) | Python 3.x | Path construction for output files | Follow qdrant-indexer.py pattern |
| `datetime` (stdlib) | Python 3.x | Timestamp comparisons, date-based filename generation | Always |
| `re` (stdlib) | Python 3.x | HTML tag stripping, slug generation | Simple regex |

**No new packages to install.** All dependencies are already in `.venv`.

---

## Architecture Patterns

### Established Pattern: knowledge-curator.sh

```bash
#!/bin/bash
export PATH="/opt/homebrew/bin:$PATH"
set -a
source ~/github/knowledge/.env
set +a

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

log "Starting ..."
# Call Python workers, non-fatal:
~/github/knowledge/.venv/bin/python3 ~/github/knowledge/some-worker.py || log "Warning: worker failed (non-fatal)"
log "Done."
```
[VERIFIED: read knowledge-curator.sh, mem0-export.sh, backfill-mem0.sh]

### Recommended Project Structure

```
~/github/knowledge/
├── personal-ingestion-email.sh          # NEW: cron every 6h — bash wrapper
├── personal-ingestion-email.py          # NEW: Python worker for Gmail + Calendar
├── personal-ingestion-transcripts.sh    # NEW: nightly — bash wrapper
├── personal-ingestion-transcripts.py    # NEW: Python worker for Drive + Spark
├── ingestion-state.json                 # NEW: watermark/dedup state
├── emails/                              # NEW: email thread markdown files
│   └── YYYY-MM-DD-{thread_id}.md
├── gdrive/
│   └── meet-recordings/                 # NEW: Drive transcript markdown files
│       └── YYYY-MM-DD-{doc_id}.md
├── spark-recordings/                    # NEW: Spark transcript markdown files
│   └── YYYY-MM-DD-{rowid}.md
├── journals/
│   └── YYYY-MM-DD.md                    # APPEND: daily notes
└── projects/
    └── {project-name}/
        └── meetings/
            └── YYYY-MM-DD-{slug}.md     # NEW: per-meeting notes
```

### Pattern 1: Gmail Thread Ingestion

**What:** List threads where Luis replied, fetch each full thread, extract plain text from base64-encoded MIME parts, write as markdown.

**gws command (verified live):**
```bash
# List threads replied to by Luis (returns thread IDs + snippets)
gws gmail users threads list --params '{"userId": "me", "q": "from:me", "maxResults": 500}' --page-all

# Fetch single thread with full body content
gws gmail users threads get --params '{"userId": "me", "id": "<thread_id>", "format": "full"}'
```
[VERIFIED: live test returned real threads with base64 body data]

**Body extraction (Python):**
```python
import base64, html, re
from html.parser import HTMLParser

def get_body(payload: dict) -> str:
    """Extract plain text from Gmail message payload."""
    mime = payload.get("mimeType", "")
    parts = payload.get("parts", [])
    body_data = payload.get("body", {}).get("data", "")

    # Direct plain text
    if mime == "text/plain" and body_data:
        return base64.urlsafe_b64decode(body_data + "==").decode("utf-8", errors="replace")

    # Walk parts for text/plain first, fall back to text/html
    plain, html_body = "", ""
    for part in parts:
        result = get_body(part)  # recursive
        if part.get("mimeType") == "text/plain" and result:
            plain = result
        elif part.get("mimeType") == "text/html" and result:
            html_body = strip_html(result)

    return plain or html_body

def strip_html(text: str) -> str:
    """Strip HTML tags, decode entities."""
    clean = re.sub(r'<[^>]+>', ' ', text)
    return html.unescape(clean).strip()
```
[VERIFIED: live thread fetch confirmed base64 body, multipart/alternative structure]

**Key finding:** `gws gmail users threads list` with `q: "from:me"` returns threads in reverse-chronological order. Default account is `luis@epiloguecapital.com`. [VERIFIED: live test showed `luis@epiloguecapital.com` as authenticated account via getProfile]

**Thread dedup:** Compare `thread.id` against `state["gmail"]["ingested_thread_ids"]`. Skip if present.

**Watermark strategy:** Use `after:` Gmail search operator with last_run date for efficient server-side filtering:
```
q: "from:me after:YYYY/MM/DD"
```
This limits results to new threads only, avoiding full thread list scan. [VERIFIED: Gmail search syntax confirmed via schema]

### Pattern 2: Calendar Events Ingestion

**What:** List primary calendar events in a time window, extract metadata, add to mem0, append to Obsidian daily note.

**gws command (verified live):**
```bash
gws calendar events list --params '{
  "calendarId": "primary",
  "timeMin": "ISO8601",
  "timeMax": "ISO8601",
  "singleEvents": true,
  "maxResults": 100
}'
```
[VERIFIED: live test returned events with attendees, conferenceData, description fields]

**Key finding:** Calendar event `attachments` field is NOT populated for Meet events — it is always `None` even for events with conferenceData. [VERIFIED: live test across 10 events with conferenceData showed `attachments: None`]. The link between calendar events and Drive transcript docs must be inferred by title/date matching (see Pattern 3).

**Event fields available:**
```python
event = {
    "id": "...",
    "summary": "Meeting title",
    "start": {"dateTime": "2026-04-10T13:00:00-07:00"},
    "attendees": [{"email": "...", "responseStatus": "accepted"}],
    "conferenceData": {"conferenceId": "xxx-yyyy-zzz"},
    "description": "optional text"
}
```

**mem0 add format (verified via mem0-server.py AddMemoryRequest schema):**
```python
# POST http://localhost:3201/memory/add
{
    "text": "Calendar event: Meeting Title on 2026-04-10 with Juan Huezo, Lior Levit. Description: ...",
    "agent_id": "luis",   # or "shared"
    "metadata": {"type": "calendar_event", "event_id": "...", "date": "2026-04-10"}
}
```
[VERIFIED: AddMemoryRequest schema — text, agent_id, metadata fields]

### Pattern 3: Google Drive Meet Transcripts

**What:** Find "Notes by Gemini" docs in Drive created after last_run, export to plain text, match to calendar events by title/date, handle multi-event collision.

**Drive query (verified live):**
```bash
gws drive files list --params '{
  "q": "name contains '\''Notes by Gemini'\'' and modifiedTime > '\''ISO8601'\''",
  "pageSize": 100,
  "fields": "files(id,name,createdTime,modifiedTime)"
}'
```
[VERIFIED: live query returned 10+ "Notes by Gemini" docs with correct naming pattern]

**Drive naming pattern (confirmed from live data):**
```
"Native OS Convo (Luis & Juan) - 2026/04/08 08:59 PDT - Notes by Gemini"
"Connect on 2026 Taxes - Troy/Jackie/Luis - 2026/04/10 13:00 PDT - Notes by Gemini"
"Meeting with Luis Calderon - 2026/03/24 10:29 PDT - Notes by Gemini"
```

**Export to plain text:**
```bash
gws drive files export --params '{"fileId": "<id>", "mimeType": "text/plain"}' --output /tmp/transcript.txt
```
[VERIFIED: exported 71956 bytes of rich transcript from Juan meeting doc. Returns JSON: `{"status": "success", "bytes": N, "saved_file": "..."}`. Note: without `--output`, the export API returns HTTP 500 Internal Error — always use `--output` flag.]

**CRITICAL FINDING: Export API bug without --output flag.** Calling `drive files export` without `--output` returns `{"error": {"code": 500, "reason": "internalError"}}`. Always specify `--output /tmp/transcript-{doc_id}.txt` when exporting.

**Calendar ↔ Doc matching strategy (no direct link available):**
Extract date from doc name using regex:
```python
import re
# Matches "2026/04/08" in doc name
match = re.search(r'(\d{4})/(\d{2})/(\d{2})', doc_name)
doc_date = f"{match.group(1)}-{match.group(2)}-{match.group(3)}"
# Match calendar events on same date by title similarity (fuzzy or substring)
```

**Multi-event collision (D-13/D-14/D-15):**
If a doc_id is referenced by (or date-matched to) more than one calendar event:
1. Store raw transcript once at `knowledge/gdrive/meet-recordings/YYYY-MM-DD-{doc_id}.md`
2. For each matching event, create an index note at `knowledge/projects/{project}/meetings/YYYY-MM-DD-{slug}-index.md`

```yaml
---
date: 2026-04-08
event_id: abc123
attendees: [juan@cordant.ai, lior@cordant.ai]
source_doc_id: 1AJh5Uls6QmnTfH-DoLo7F7y-I1ADqTdqOGWPYWGGWas
shared_doc: true
---

# Meeting — 2026-04-08

[2-3 sentence excerpt from canonical doc relevant to this event]

Source: knowledge/gdrive/meet-recordings/2026-04-08-1AJh5Uls6QmnTfH.md
```

### Pattern 4: Spark SQLite Transcripts

**What:** Query `meetTranscriptEvent` joined with `messages` for rows newer than last watermark, write as markdown.

**Database:** `/Users/lcalderon/Library/Application Support/Spark Desktop/core-data/messages.sqlite`
[VERIFIED: table exists, 250 rows in meetTranscriptEvent]

**Schema (verified):**
```sql
-- meetTranscriptEvent
CREATE TABLE meetTranscriptEvent (
    summary TEXT NOT NULL,   -- AI-generated meeting summary (short, ~26-39 chars seen)
    startDate INTEGER NOT NULL,  -- Unix timestamp (seconds) — e.g., 1774373400
    messagePk INTEGER NOT NULL   -- FK to messages.pk
);

-- messages (relevant columns)
CREATE TABLE messages (
    pk INTEGER PRIMARY KEY,
    subject TEXT,           -- Meeting title (e.g., "Meeting with Luis Calderon")
    messageFrom TEXT,       -- Sender email (e.g., "luis@epiloguecapital.com")
    messageTo TEXT,         -- Recipient emails (comma-separated)
    receivedDate REAL,      -- Unix float seconds
    shortBody TEXT          -- Short preview text
);
```

**CRITICAL FINDING: Spark `meetTranscriptEvent.summary` is SHORT.** Sample data shows summaries of only 26-39 characters (e.g., "Performance Review and Strategy Session", "Meeting with Luis Calderon"). This is a meeting title/subject, NOT a full transcript. Full transcript content, if available, lives in the `search_fts5.sqlite` database's `messagesfts` virtual FTS table (columns: `messagePk, messageFrom, messageTo, subject, searchBody, additionalText`). [VERIFIED: .schema and PRAGMA output from both databases]

**Query pattern:**
```sql
SELECT
    mte.rowid,
    mte.summary,
    mte.startDate,
    m.subject,
    m.messageFrom,
    m.messageTo,
    m.receivedDate
FROM meetTranscriptEvent mte
JOIN messages m ON m.pk = mte.messagePk
WHERE mte.startDate > :last_rowid_cutoff
ORDER BY mte.startDate ASC;
```

**State tracking:** Use `state["spark"]["last_message_rowid"]` — compare against `mte.rowid` for watermarking.

**Python access pattern (copy from qdrant-indexer.py structure):**
```python
import sqlite3
from pathlib import Path

SPARK_DB = Path.home() / "Library/Application Support/Spark Desktop/core-data/messages.sqlite"

def query_spark_transcripts(since_rowid: int) -> list[dict]:
    conn = sqlite3.connect(f"file:{SPARK_DB}?mode=ro", uri=True)  # read-only
    conn.row_factory = sqlite3.Row
    rows = conn.execute("""
        SELECT mte.rowid, mte.summary, mte.startDate,
               m.subject, m.messageFrom, m.messageTo
        FROM meetTranscriptEvent mte
        JOIN messages m ON m.pk = mte.messagePk
        WHERE mte.rowid > ?
        ORDER BY mte.startDate ASC
    """, (since_rowid,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]
```
[VERIFIED: live queries against messages.sqlite returned correct data]

**Timestamp conversion:**
```python
import datetime
dt = datetime.datetime.fromtimestamp(row["startDate"])  # Unix seconds → datetime
```
[VERIFIED: 1774373400 → 2026-03-24 10:30:00]

### Pattern 5: Qdrant Indexing (new content)

**Decision (Claude's Discretion):** Use the existing `knowledge_docs` collection. Do NOT create a new collection. Rationale: emails and transcripts are plain markdown files stored in `~/github/knowledge/emails/`, `~/github/knowledge/gdrive/meet-recordings/`, and `~/github/knowledge/spark-recordings/` — they will be indexed automatically by the next run of `qdrant-indexer.py` if those directories are added to its `PATHS` list.

**Required change to qdrant-indexer.py:** Add three new paths to the `PATHS` list:
```python
PATHS = [
    ...existing paths...,
    Path.home() / "github/knowledge/emails",
    Path.home() / "github/knowledge/gdrive/meet-recordings",
    Path.home() / "github/knowledge/spark-recordings",
]
```

This means the ingestion scripts only need to **write markdown files to disk**. Qdrant indexing is handled by the existing nightly curator. [VERIFIED: qdrant-indexer.py walks rglob("*.md") over PATHS — any new .md files in those dirs get picked up automatically]

### Pattern 6: mem0 REST Add

**mem0 server:** Running at `http://localhost:3201` [VERIFIED: `/health` endpoint returned `{"status":"ok","vector_store":"connected"}`]

**Add endpoint (verified via mem0-server.py source):**
```bash
curl -s -X POST http://localhost:3201/memory/add \
  -H "Content-Type: application/json" \
  -d '{"text": "...", "agent_id": "luis", "metadata": {"type": "calendar_event", "date": "2026-04-10"}}'
```

**From bash (following backfill-mem0.sh pattern):**
```bash
add_memory() {
    local text="$1" agent_id="${2:-luis}" metadata="${3:-{}}"
    local payload
    payload=$(python3 -c "
import json, sys
print(json.dumps({'text': sys.argv[1], 'agent_id': sys.argv[2], 'metadata': json.loads(sys.argv[3])}))
" "$text" "$agent_id" "$metadata")
    curl -s -X POST "$MEM0_URL/memory/add" \
        -H "Content-Type: application/json" \
        -d "$payload" | grep -q '"ok"' && return 0 || log "Warning: mem0 add failed"
}
```
[VERIFIED: pattern from backfill-mem0.sh, confirmed AddMemoryRequest schema]

### Pattern 7: Obsidian Daily Note Append

**Location:** `~/github/knowledge/journals/YYYY-MM-DD.md`
**Current state:** Directory exists but is empty — no existing daily notes. [VERIFIED: `ls journals/ | wc -l` = 0]

**Append behavior:** Multiple ingestion runs per day must stack sections. Use `>> file` (append), never `> file` (overwrite). Check for section header existence before appending to avoid duplicates:
```bash
DAILY_NOTE="$HOME/github/knowledge/journals/$(date '+%Y-%m-%d').md"
# Create if missing
[ -f "$DAILY_NOTE" ] || echo "# $(date '+%Y-%m-%d')" > "$DAILY_NOTE"

# Append Email Digest section
cat >> "$DAILY_NOTE" << 'EOF'

## Email Digest

EOF
# Append individual items...
```

**Project-based meeting notes:**
```
~/github/knowledge/projects/{project-name}/meetings/YYYY-MM-DD-{slug}.md
```
**Current state:** `projects/` directory does not exist yet. [VERIFIED: `ls projects/` showed no output]. Scripts must `mkdir -p` before writing.

**Slug generation:**
```python
import re
def slugify(title: str) -> str:
    return re.sub(r'[^a-z0-9]+', '-', title.lower()).strip('-')[:50]
```

### Pattern 8: ingestion-state.json

**Current state:** Does not exist yet. [VERIFIED: `cat ingestion-state.json` → "does not exist yet"]

**Initial bootstrap (create if missing):**
```python
import json
from pathlib import Path

STATE_PATH = Path.home() / "github/knowledge/ingestion-state.json"

DEFAULT_STATE = {
    "gmail": {"last_run": "2026-01-01T00:00:00Z", "ingested_thread_ids": []},
    "calendar": {"last_run": "2026-01-01T00:00:00Z", "ingested_event_ids": []},
    "gdrive_meet": {"last_run": "2026-01-01T00:00:00Z", "ingested_doc_ids": []},
    "spark": {"last_run": "2026-01-01T00:00:00Z", "last_message_rowid": 0}
}

def load_state() -> dict:
    if STATE_PATH.exists():
        return json.loads(STATE_PATH.read_text())
    return DEFAULT_STATE.copy()

def save_state(state: dict) -> None:
    STATE_PATH.write_text(json.dumps(state, indent=2))
```

### Anti-Patterns to Avoid

- **Do NOT use `gws drive files export` without `--output` flag.** Returns HTTP 500 with no content. [VERIFIED: live test confirmed this failure]
- **Do NOT assume Spark `meetTranscriptEvent.summary` is a full transcript.** It is a short title-like summary (26-39 chars). For full content, check `search_fts5.sqlite` messagesfts `searchBody` column — but beware it's a 845MB FTS5 virtual table with WAL files. Querying by messagePk is safe but may be slow.
- **Do NOT use `qmd embed`.** BM25/keyword indexing via `qmd update` is allowed; vector indexing goes through qdrant-indexer.py only. [VERIFIED: project constraint from CLAUDE.md]
- **Do NOT write to `agent_memory` Qdrant collection.** The assert guard in qdrant-indexer.py enforces this. [VERIFIED: source code]
- **Do NOT overwrite daily notes** — always append (`>>`) to preserve earlier sections from the same day.
- **Do NOT call gws in a tight loop without rate-limit guards.** Gmail full thread fetch is one API call per thread. At 500 threads per 6h run, implement 100ms sleep between fetches.
- **Do NOT use `inSent` column in messages for "Luis replied" filtering.** The Gmail `q: "from:me"` approach is server-side and correct. SQLite-based Spark filtering by `messageFrom` is the right approach for Spark transcripts.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Qdrant vector indexing | Custom embed + upsert | qdrant-indexer.py (add new PATHS) | Already handles chunking, idempotent IDs, rate limiting, error recovery |
| mem0 write | Direct mem0ai Python SDK | mem0 REST API at localhost:3201 | Server already running, consistent user_id handling, battle-tested |
| Gmail OAuth | New credential flow | Existing gws CLI with ~/.config/gws/token_cache.* | Auth already working (verified via live test) |
| HTML tag stripping | Custom parser | `html.parser` stdlib + regex | Simple, no deps, sufficient for email body text |
| JSON state file locking | File lock library | Atomic write via temp file + rename | No concurrent writers (single cron job) — simple is sufficient |
| Slug generation | Any slug library | `re.sub(r'[^a-z0-9]+', '-', ...)` stdlib | No deps needed for simple slugs |

**Key insight:** The ingestion scripts' job is **data extraction and formatting**. All storage concerns (Qdrant indexing, mem0 dedup, markdown structuring) are handled by existing infrastructure. The scripts should be thin ETL pipes.

---

## Common Pitfalls

### Pitfall 1: Drive Export 500 Error Without --output
**What goes wrong:** `gws drive files export` with no `--output` returns `{"error": {"code": 500, "reason": "internalError"}}`.
**Why it happens:** The binary download endpoint requires a file path target; without it the CLI has no way to return binary content as JSON.
**How to avoid:** Always use `--output /tmp/transcript-{doc_id}.txt` then read the file and delete the temp file after processing.
**Warning signs:** Response contains `"internalError"` JSON rather than transcript content.
[VERIFIED: reproduced live]

### Pitfall 2: Spark `meetTranscriptEvent.summary` Is Not a Transcript
**What goes wrong:** Ingesting `summary` as the meeting content produces 26-39 character useless "memories" like "Performance Review and Strategy Session".
**Why it happens:** The field name is misleading — it stores a meeting title/subject string, not meeting content.
**How to avoid:** Join with `search_fts5.sqlite` messagesfts `searchBody` column via messagePk, or use the Google Drive transcript for the same meeting. For meetings that exist both in Drive (as Gemini notes) and Spark, prefer the Drive transcript (richer content). Use Spark as a fallback for meetings NOT found in Drive.
**Warning signs:** All mem0 memories for Spark meetings are < 50 characters.

### Pitfall 3: Calendar Event attachments Field Is Always Empty for Meet Docs
**What goes wrong:** Assuming `event["attachments"]` contains the Google Doc ID for the transcript.
**Why it happens:** Google Calendar does not automatically attach the generated transcript doc to the calendar event.
**How to avoid:** Match Drive docs to calendar events by date (extracted from doc name) and title similarity. The doc naming convention is reliable: `"{EventTitle} - {YYYY}/{MM}/{DD} {HH:MM} {TZ} - Notes by Gemini"`.
**Warning signs:** All `item.get("attachments")` values are `None`.
[VERIFIED: 10 live calendar events checked — all had `attachments: None` even with conferenceData]

### Pitfall 4: Gmail Rate Limiting on Full Thread Fetch
**What goes wrong:** Fetching 200+ full threads back-to-back triggers Gmail API 429 rate limit errors.
**Why it happens:** Gmail API free tier has a per-user rate limit. Full thread format (`format: "full"`) is heavier than `metadata`.
**How to avoid:** Add `time.sleep(0.1)` between thread fetches (same pattern as qdrant-indexer.py embed calls). For 6h runs limited to recent threads via `after:` filter, volume should be manageable (< 20 new threads per 6h period typically).
**Warning signs:** HTTP 429 responses from gws.

### Pitfall 5: gws Default Account Is `luis@epiloguecapital.com`, Not Gmail
**What goes wrong:** Drive query returns no results because it queries the wrong account's Drive.
**Why it happens:** gws defaults to the first configured account (`luis@epiloguecapital.com`). Meet transcripts ("Notes by Gemini") may be generated in either account.
**How to avoid:** Test Drive query with both accounts. Use `--account luis.calderon@gmail.com` flag if transcripts are in personal Gmail.
**Evidence:** Live `gws gmail users getProfile` returned `luis@epiloguecapital.com`. Drive query did return Gemini notes, suggesting they exist in the work account. [VERIFIED: live Drive query returned 10+ results successfully]

### Pitfall 6: ingestion-state.json Growth Over Time
**What goes wrong:** `ingested_thread_ids` array grows unboundedly — after 1 year it could contain 50,000+ thread IDs, making state file reads slow and git diffs noisy.
**Why it happens:** Append-only IDs list.
**How to avoid:** Switch to watermark-only approach: only store `last_run` ISO8601 timestamp and use `after: YYYY/MM/DD` Gmail query filter. Only keep the ID list for the last 30 days (prune on each write). For calendar/Drive/Spark, timestamp-based watermarks are sufficient without ID lists.

### Pitfall 7: Appending Duplicate Sections to Daily Note
**What goes wrong:** If the 6h email script runs twice on the same date, daily note gets two `## Email Digest` sections.
**Why it happens:** Naive `>> file` append without idempotency check.
**How to avoid:** Before appending a section, check if the header already exists in the file: `grep -q "^## Email Digest" "$DAILY_NOTE"`. Use a run-once marker in ingestion-state.json per date: `state["gmail"]["last_daily_note_date"]`.

---

## Runtime State Inventory

This is a greenfield pipeline (no rename/refactor). No existing runtime state to migrate.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — `ingestion-state.json` does not exist yet | Wave 0: create bootstrap |
| Live service config | mem0 server running at localhost:3201 — no config change needed | None |
| OS-registered state | Existing cron entries in crontab (knowledge-curator.sh at 2am, refresh at 7am Sun) | Add two new cron entries: personal-ingestion-email.sh every 6h, personal-ingestion-transcripts.sh nightly |
| Secrets/env vars | `.env` has `GEMINI_API_KEY`, `GOOGLE_API_KEY`, `QDRANT_API_KEY` [VERIFIED: key names only, no values] | No new keys needed — gws uses its own OAuth token cache |
| Build artifacts | None — Python stdlib + existing .venv | None — no new installs needed |

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| gws CLI | Gmail, Calendar, Drive | ✓ [VERIFIED] | Live, authenticated | None needed |
| mem0 REST server | Calendar/transcript memories | ✓ [VERIFIED] | Running at :3201 | Python mem0ai SDK direct |
| Spark messages.sqlite | Spark transcripts | ✓ [VERIFIED] | 228MB, 250 meetTranscriptEvent rows | Skip Spark source |
| Qdrant Cloud | Vector indexing | ✓ [VERIFIED: qdrant-indexer.py working] | knowledge_docs collection exists | None |
| `.venv` Python packages | Python workers | ✓ [VERIFIED] | qdrant-client 1.17.1, mem0ai 1.0.6 | None needed |
| `~/github/knowledge/journals/` | Obsidian daily notes | ✓ (exists, empty) [VERIFIED] | — | None needed |
| `~/github/knowledge/projects/` | Project meeting notes | ✗ (does not exist) [VERIFIED] | — | `mkdir -p` in Wave 0 |
| `~/github/knowledge/emails/` | Email markdown files | ✗ (does not exist) [VERIFIED] | — | `mkdir -p` in Wave 0 |
| `~/github/knowledge/gdrive/meet-recordings/` | Drive transcript markdown | ✓ (meet-recordings dir exists) [VERIFIED] | — | None needed |
| `~/github/knowledge/spark-recordings/` | Spark transcript markdown | ✗ (does not exist) [VERIFIED] | — | `mkdir -p` in Wave 0 |

**Missing with no fallback:** None that block execution.
**Missing directories (create in Wave 0):** `projects/`, `emails/`, `spark-recordings/`, `gdrive/` (parent for `meet-recordings/` if not already at root).

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Polling full Gmail inbox | Gmail `after:` date filter in `q` param | Always supported | Limits API calls to new threads only |
| gws `corpus` param (deprecated) | gws `corpora` param | Drive API v3 | Use `corpora: "user"` if needed |
| mem0 Python SDK direct | mem0 REST API at localhost | Phase 2 (this project) | Server already running — use REST |

**Deprecated/outdated:**
- `gws calendar events list` with `alwaysIncludeEmail` parameter: marked deprecated and ignored [VERIFIED: schema shows "Deprecated and ignored"]
- `gws drive files list` with `corpus` parameter: deprecated in favor of `corpora` [VERIFIED: schema shows `"deprecated": true`]

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Spark `search_fts5.sqlite` `messagesfts.searchBody` contains full email/transcript body text | Pattern 4 | If body is empty/truncated, Spark transcripts fall back to summary-only (very short) |
| A2 | Google Meet "Notes by Gemini" docs always follow the naming pattern `"{Title} - {YYYY}/{MM}/{DD} ... - Notes by Gemini"` | Pattern 3 | Date extraction regex would fail on differently-named docs |
| A3 | mem0 `agent_id: "luis"` is the correct user_id for Luis's personal memories | Pattern 6 | Memories stored under wrong user_id — not easily retrievable |
| A4 | cron schedule `0 */6 * * *` will run personal-ingestion-email.sh within gws OAuth token expiry window | Environment | If tokens expire more frequently than 6h, ingestion silently fails until re-auth |

---

## Open Questions

1. **Which gws account should Drive and Gmail queries use?**
   - What we know: Default account is `luis@epiloguecapital.com`. Drive query returned "Notes by Gemini" docs successfully. Gmail `from:me` query returns ~16,076 threads.
   - What's unclear: Are any transcripts in `luis.calderon@gmail.com` account? Personal emails may be in the personal Gmail account.
   - Recommendation: Test both accounts by using `GOOGLE_WORKSPACE_CLI_ACCOUNT=luis.calderon@gmail.com gws gmail users threads list ...` and compare thread counts. Plan should include a note to set account appropriately per data source.

2. **What agent_id should personal memories use in mem0?**
   - What we know: Existing user_ids are role-based (ceo, cto, etc.) or tool-based (claude, qwen). None are person-named.
   - What's unclear: Should calendar/transcript memories go to `"luis"` (new) or `"shared"` (existing) or `"chief_of_staff"`?
   - Recommendation: Create `"luis"` as the personal user_id. Memories about Luis's meetings and emails should be searchable from his personal context.

3. **Should Spark transcripts check `search_fts5.sqlite` for full body content?**
   - What we know: `meetTranscriptEvent.summary` is ~30 chars (meeting title). `search_fts5.sqlite` has `messagesfts` FTS5 table with `searchBody` column. The database is 845MB with WAL files active.
   - What's unclear: Does `searchBody` contain the full AI transcript content, or just the email text?
   - Recommendation: Wave 0 investigation — run one sample query: `SELECT searchBody FROM messagesfts WHERE messagePk = {sample_pk} LIMIT 1` against search_fts5.sqlite to verify content before committing to this approach.

---

## Project Constraints (from CLAUDE.md)

| Directive | Impact on Phase |
|-----------|----------------|
| `qmd embed` is FORBIDDEN | No qmd embed calls anywhere. Qdrant indexing only via qdrant-indexer.py |
| NEVER touch `agent_memory` Qdrant collection | Assert guard already in qdrant-indexer.py; do not create new Qdrant client calls that target agent_memory |
| ALL vector/semantic search uses Qdrant Cloud | New email/transcript content → knowledge_docs collection only |
| Read `node_modules/next/dist/docs/` before writing Next.js code | Not applicable — this phase has no Next.js code |
| MUST run `gitnexus_impact` before editing any symbol | Not applicable — this phase is entirely in `~/github/knowledge/`, not in agent-kitchen Next.js codebase |
| `execFileSync` not `exec` for security | Not applicable — no Node.js code in this phase |
| Follow `set -a` / `source .env` / `set +a` pattern | Yes — both new scripts must follow this pattern |
| Non-fatal failures with `|| log "Warning: ..."` | Yes — all steps must be non-fatal |

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Bash + inline Python assertions (no formal test framework — consistent with knowledge-curator.sh pattern) |
| Config file | None — scripts are self-contained |
| Quick run command | See per-component commands below |
| Full suite command | See smoke test sequence below |

### Smoke Test Sequence (run in order after each wave)

**1. gws Gmail threads — verify auth + from:me filter:**
```bash
/Users/lcalderon/bin/gws gmail users threads list \
  --params '{"userId": "me", "q": "from:me after:2026/04/01", "maxResults": 5}' \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print(f'OK: {len(d[\"threads\"])} threads found')"
```
Expected: `OK: N threads found` (N >= 1)

**2. gws Gmail thread get — verify body extraction:**
```bash
/Users/lcalderon/bin/gws gmail users threads get \
  --params '{"userId": "me", "id": "19d7a1c8a55001d5", "format": "full"}' \
  | python3 -c "
import json, sys, base64
d = json.load(sys.stdin)
msgs = d.get('messages', [])
for m in msgs[:1]:
    for p in m.get('payload', {}).get('parts', []):
        if p.get('mimeType') == 'text/plain':
            body = base64.urlsafe_b64decode(p['body']['data'] + '==').decode('utf-8', errors='replace')
            print(f'OK: body length={len(body)}, preview={body[:50]!r}')
"
```
Expected: `OK: body length=N, preview='...'`

**3. gws Calendar events — verify event structure:**
```bash
/Users/lcalderon/bin/gws calendar events list \
  --params '{"calendarId": "primary", "timeMin": "2026-04-01T00:00:00Z", "singleEvents": true, "maxResults": 3}' \
  | python3 -c "
import json, sys
d = json.load(sys.stdin)
items = d.get('items', [])
print(f'OK: {len(items)} events, first={items[0][\"summary\"] if items else \"none\"}')
"
```
Expected: `OK: 3 events, first=...`

**4. gws Drive transcript list — verify Gemini notes discoverable:**
```bash
/Users/lcalderon/bin/gws drive files list \
  --params '{"q": "name contains '\''Notes by Gemini'\'' and modifiedTime > '\''2026-03-01T00:00:00'\''", "pageSize": 5, "fields": "files(id,name)"}' \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print(f'OK: {len(d[\"files\"])} transcript docs')"
```
Expected: `OK: 5 transcript docs` (or more)

**5. gws Drive export — verify transcript content accessible:**
```bash
/Users/lcalderon/bin/gws drive files export \
  --params '{"fileId": "1AJh5Uls6QmnTfH-DoLo7F7y-I1ADqTdqOGWPYWGGWas", "mimeType": "text/plain"}' \
  --output /tmp/test-export.txt \
  && echo "OK: exported $(wc -c < /tmp/test-export.txt) bytes" \
  && rm /tmp/test-export.txt
```
Expected: `OK: exported 71956 bytes`

**6. Spark SQLite — verify transcript query:**
```bash
python3 -c "
import sqlite3
from pathlib import Path
db = Path.home() / 'Library/Application Support/Spark Desktop/core-data/messages.sqlite'
conn = sqlite3.connect(f'file:{db}?mode=ro', uri=True)
rows = conn.execute('''
    SELECT mte.rowid, mte.summary, mte.startDate, m.subject
    FROM meetTranscriptEvent mte
    JOIN messages m ON m.pk = mte.messagePk
    ORDER BY mte.startDate DESC LIMIT 3
''').fetchall()
conn.close()
print(f'OK: {len(rows)} rows, first={rows[0][1]!r}')
"
```
Expected: `OK: 3 rows, first='...'`

**7. mem0 health check — verify server running:**
```bash
curl -sf http://localhost:3201/health | python3 -c "import json,sys; d=json.load(sys.stdin); print(f'OK: {d[\"status\"]}, vector_store={d[\"vector_store\"]}')"
```
Expected: `OK: ok, vector_store=connected`

**8. mem0 add — verify write works:**
```bash
curl -sf -X POST http://localhost:3201/memory/add \
  -H "Content-Type: application/json" \
  -d '{"text": "Test memory from ingestion pipeline smoke test 2026-04-10", "agent_id": "luis", "metadata": {"type": "test"}}' \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print(f'OK: status={d[\"status\"]}')"
```
Expected: `OK: status=ok`

**9. Qdrant indexer path extension — verify new paths get indexed:**
```bash
# After adding emails/ and spark-recordings/ to PATHS in qdrant-indexer.py,
# create one test file and verify it gets indexed:
mkdir -p ~/github/knowledge/emails
echo "# Test Email Thread\n\nTest content for qdrant indexing." > ~/github/knowledge/emails/test-smoke.md
~/github/knowledge/.venv/bin/python3 ~/github/knowledge/qdrant-indexer.py 2>&1 | grep -E "test-smoke|complete"
rm ~/github/knowledge/emails/test-smoke.md
```
Expected: Output includes `Indexed N chunks from test-smoke.md`

**10. Obsidian daily note append — verify idempotent section creation:**
```bash
TEST_NOTE="/tmp/test-daily-$(date '+%Y-%m-%d').md"
echo "# $(date '+%Y-%m-%d')" > "$TEST_NOTE"
# First append
echo -e "\n## Email Digest\n\n- **Test Thread** (1 message) — test summary" >> "$TEST_NOTE"
# Verify no duplicate on second run via grep check
grep -q "^## Email Digest" "$TEST_NOTE" && echo "OK: section exists, would skip" || echo "FAIL: section missing"
rm "$TEST_NOTE"
```
Expected: `OK: section exists, would skip`

### Wave 0 Gaps

- [ ] `~/github/knowledge/emails/` directory — create with `mkdir -p`
- [ ] `~/github/knowledge/spark-recordings/` directory — create with `mkdir -p`
- [ ] `~/github/knowledge/projects/` directory — create with `mkdir -p`
- [ ] `~/github/knowledge/ingestion-state.json` — bootstrap with default state JSON
- [ ] qdrant-indexer.py PATHS update — add `emails/`, `gdrive/meet-recordings/`, `spark-recordings/`
- [ ] Smoke test #3 (Open Question A3): `SELECT searchBody FROM messagesfts WHERE messagePk = {rowid} LIMIT 1` against search_fts5.sqlite to determine Spark body content availability

---

## Sources

### Primary (HIGH confidence — verified via live tool calls)
- gws CLI `/Users/lcalderon/bin/gws` — live test of Gmail threads list, threads get, calendar events list, Drive files list, Drive files export [VERIFIED]
- `/Users/lcalderon/Library/Application Support/Spark Desktop/core-data/messages.sqlite` — schema and data verified via sqlite3 [VERIFIED]
- `/Users/lcalderon/github/knowledge/mem0-server.py` — AddMemoryRequest schema, endpoint structure [VERIFIED]
- `/Users/lcalderon/github/knowledge/qdrant-indexer.py` — PATHS, chunking, upsert pattern [VERIFIED]
- `/Users/lcalderon/github/knowledge/knowledge-curator.sh` — orchestrator pattern [VERIFIED]
- `/Users/lcalderon/github/knowledge/.env` — key names (GEMINI_API_KEY, GOOGLE_API_KEY, QDRANT_API_KEY) [VERIFIED]
- `/Users/lcalderon/github/knowledge/.venv` — pip list confirmed all required packages [VERIFIED]

### Secondary (MEDIUM confidence)
- Gmail API search operators (`after:`, `from:me`) — standard documented Gmail query syntax, consistent with live test behavior

### Tertiary (LOW confidence — not verified)
- `search_fts5.sqlite` `messagesfts.searchBody` content quality — schema verified, content not sampled [A1 in Assumptions Log]

## Metadata

**Confidence breakdown:**
- gws CLI commands and parameters: HIGH — all tested live with real data
- Spark SQLite schema: HIGH — schema verified, data sampled
- mem0 REST API format: HIGH — source code read + health check confirmed
- Qdrant indexing approach: HIGH — based on existing qdrant-indexer.py pattern
- Calendar ↔ Drive doc matching: MEDIUM — date regex from naming pattern, not API-provided link
- Spark body content (search_fts5): LOW — schema known but `searchBody` contents unverified

**Research date:** 2026-04-10
**Valid until:** 2026-05-10 (gws auth tokens rotate, but API structure is stable)
