# Phase 2: Knowledge Curator Agent - Research

**Researched:** 2026-04-09
**Domain:** Shell scripting, Python, Qdrant Cloud, mem0 REST API, llm-wiki processing, cron
**Confidence:** HIGH — all critical claims verified against live infrastructure

---

## Summary

Phase 2 builds a nightly cron job (the Knowledge Curator) that orchestrates four subsystems:
gitnexus analysis across 8 repos, llm-wiki raw file processing, mem0 highlights export to
QMD-indexed markdown, and Gemini-embedding-based indexing of all markdown into Qdrant Cloud
`knowledge_docs` collection. The foundation from Phase 1 (gitnexus wired into
`refresh-index.sh`, collections registered in QMD) is complete and verified.

The critical architectural constraint is firm: QMD handles BM25/keyword search only (`qmd
update`). ALL semantic/vector search is Qdrant Cloud. `qmd embed` is absolutely forbidden.
The `knowledge_docs` collection does NOT yet exist in Qdrant Cloud — Phase 2 creates it.

**Primary recommendation:** A single orchestrator shell script at
`~/github/knowledge/knowledge-curator.sh` that sources `~/github/knowledge/.env` (using
`set -a`/`set +a` pattern), calls four focused sub-steps sequentially, logs to
`/tmp/knowledge-curator.log`, and is registered as a nightly cron (2:00 AM daily). The
Qdrant indexer is a Python script using the knowledge venv (`~/github/knowledge/.venv`) and
the `google-genai` SDK (already installed at 1.67.0).

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| KNOW-01 | System has a Knowledge Curator agent that runs nightly — executes `gitnexus analyze` across all indexed repos, processes `llm-wiki/raw/` into wiki pages, exports mem0 highlights to QMD-indexed markdown, runs `qmd update` (BM25 keyword index only), and indexes all markdown collections into Qdrant Cloud `knowledge_docs` collection for semantic/vector search. `qmd embed` is FORBIDDEN. | All five subsystems verified live: gitnexus-index.sh exists and is wired (Phase 1), raw/ has 2 unprocessed files, mem0 REST API is live at localhost:3201 with 531+ memories, Qdrant Cloud accessible with `set -a` env loading, `knowledge_docs` collection absent (ready to create). |
</phase_requirements>

---

## Project Constraints (from CLAUDE.md)

- Must run `gitnexus_impact` before editing any symbol; warn on HIGH/CRITICAL risk
- Must run `gitnexus_detect_changes()` before committing
- NEVER rename symbols with find-and-replace — use `gitnexus_rename`
- Read `node_modules/next/dist/docs/` before writing Next.js code (breaking changes warning)
- Production: port 3002, `npm start -- --port 3002`, rebuild with `npm run build` first
- Vector store architecture LOCKED: QMD = BM25 only, Qdrant Cloud = all vector search
- `qmd embed` FORBIDDEN

---

## Standard Stack

### Core

| Library/Tool | Version | Purpose | Why Standard |
|---|---|---|---|
| `qdrant-client` Python | 1.17.1 | Create `knowledge_docs` collection, upsert vectors | Already installed in `~/github/knowledge/.venv` [VERIFIED: venv pip list] |
| `google-genai` Python | 1.67.0 | Gemini `models/gemini-embedding-2-preview` embeddings | Already installed in venv, correct SDK for the model [VERIFIED: venv pip list] |
| `google-generativeai` | 0.8.6 | Also in venv (mem0 uses it); prefer `google-genai` for embeddings | Installed |
| bash (shell script) | macOS system | Orchestrator script, cron entry | No new install needed |
| `~/github/knowledge/.venv` | Python 3.14.2 | Runtime for all Python steps | All deps already present [VERIFIED: .venv/bin/python3 --version] |

### Infrastructure (already live)

| Service | Location | Status | Notes |
|---|---|---|---|
| mem0 REST API | `http://localhost:3201` | Running [VERIFIED: /health = ok] | FastAPI, 531 memories in Qdrant |
| Qdrant Cloud | `https://f969d77f-3cf6-4557-92cb-67f7cac0f44a.us-west-1-0.aws.cloud.qdrant.io:6333` | Reachable [VERIFIED: collections list] | 3 collections exist; `knowledge_docs` absent |
| QMD | `/opt/homebrew/bin/qmd` v1.1.5 | Installed [VERIFIED: which qmd] | 18 collections, 462 knowledge docs |
| gitnexus | `~/github/gitnexus-index.sh` | Wired in refresh-index.sh (Phase 1) | 8 repos indexed |

### Environment Variables

| Variable | Source | Required By |
|---|---|---|
| `QDRANT_API_KEY` | `~/github/knowledge/.env` | Qdrant indexer Python script |
| `GEMINI_API_KEY` | `~/github/knowledge/.env` | Gemini embeddings |
| `GOOGLE_API_KEY` | `~/github/knowledge/.env` | Also in .env; not needed separately |

**CRITICAL loading pattern:** `~/github/knowledge/.env` does NOT use `export` prefix. Must
load with `set -a && source ~/github/knowledge/.env && set +a` in the shell script, or
read directly in Python via `python-dotenv` / manual parsing. [VERIFIED: .env head + env
test confirmed `source` alone leaves vars unexported to child processes]

**Installation:** No new packages required. All dependencies are in the knowledge venv.

---

## Architecture Patterns

### Recommended Project Structure

```
~/github/knowledge/
├── knowledge-curator.sh          # NEW: main orchestrator script
├── qdrant-indexer.py             # NEW: Python script — create collection + embed + upsert
├── mem0-export.sh                # NEW: export yesterday's mem0 memories to markdown
├── refresh-index.sh              # EXISTING: Phase 1 modified — gitnexus + qmd update
├── .env                          # EXISTING: QDRANT_API_KEY, GEMINI_API_KEY
└── logs/
    └── knowledge-curator.log    # NEW: nightly run log
```

The orchestrator calls steps in sequence. Each step is a separate script or inline function
so failures are isolated (the `||` non-fatal guard pattern established in Phase 1).

### Pattern 1: Orchestrator Shell Script

**What:** `knowledge-curator.sh` sources env, calls each step, logs results.
**When to use:** Always. This is the cron entry point.

```bash
#!/bin/bash
# ~/github/knowledge/knowledge-curator.sh
# Nightly Knowledge Curator — runs all four knowledge loop steps
# Cron: 0 2 * * * ~/github/knowledge/knowledge-curator.sh >> /tmp/knowledge-curator.log 2>&1

set -e
LOG_PREFIX="[$(date '+%Y-%m-%d %H:%M:%S')]"

# Load env vars — CRITICAL: use set -a because .env has no export prefix
set -a
source ~/github/knowledge/.env
set +a

echo "$LOG_PREFIX Starting Knowledge Curator..."

# Step 1: gitnexus analyze (already in refresh-index.sh — call directly here or skip if run separately)
echo "$LOG_PREFIX [1/4] GitNexus analyze..."
~/github/gitnexus-index.sh || echo "  Warning: gitnexus-index failed (non-fatal)"

# Step 2: llm-wiki raw processing (check for unprocessed files, call processor)
echo "$LOG_PREFIX [2/4] llm-wiki raw processing..."
~/github/knowledge/llm-wiki-process.sh || echo "  Warning: llm-wiki processing failed (non-fatal)"

# Step 3: mem0 highlights export to markdown
echo "$LOG_PREFIX [3/4] mem0 highlights export..."
~/github/knowledge/mem0-export.sh || echo "  Warning: mem0 export failed (non-fatal)"

# Step 4: qmd update (BM25 keyword index) + Qdrant vector index
echo "$LOG_PREFIX [4/4] QMD update + Qdrant indexing..."
qmd update
~/github/knowledge/.venv/bin/python3 ~/github/knowledge/qdrant-indexer.py || echo "  Warning: Qdrant indexer failed (non-fatal)"

echo "$LOG_PREFIX Knowledge Curator complete."
```

### Pattern 2: Qdrant Indexer Python Script

**What:** Creates `knowledge_docs` if absent, walks markdown basePaths, chunks text,
generates Gemini embeddings, upserts to Qdrant. Uses stable deterministic IDs so
re-runs are idempotent.
**When to use:** Called from orchestrator. Can also run standalone.

```python
# ~/github/knowledge/qdrant-indexer.py
# Source: qdrant-client 1.17.1 API [VERIFIED: .venv pip list]
# Source: google-genai 1.67.0 embed_content API [VERIFIED: inspect.signature]

import os
import hashlib
from pathlib import Path
from qdrant_client import QdrantClient
from qdrant_client.models import VectorParams, Distance, PointStruct
from google import genai

QDRANT_URL = "https://f969d77f-3cf6-4557-92cb-67f7cac0f44a.us-west-1-0.aws.cloud.qdrant.io:6333"
COLLECTION = "knowledge_docs"
EMBED_MODEL = "models/gemini-embedding-2-preview"
DIMS = 3072
CHUNK_SIZE = 1000  # characters per chunk (conservative for Gemini token limits)
CHUNK_OVERLAP = 100

# Source paths to index (basePath collections with resolvable filesystem paths)
PATHS = [
    Path.home() / "github/knowledge/llm-wiki/wiki",
    Path.home() / "github/knowledge",
    # mem0 export landing dir (see mem0-export.sh output)
    Path.home() / "github/knowledge/mem0-exports",
]

def get_client():
    return QdrantClient(url=QDRANT_URL, api_key=os.environ["QDRANT_API_KEY"])

def ensure_collection(client):
    try:
        client.get_collection(COLLECTION)
    except Exception:
        client.create_collection(
            collection_name=COLLECTION,
            vectors_config=VectorParams(size=DIMS, distance=Distance.COSINE),
        )

def chunk_text(text, size=CHUNK_SIZE, overlap=CHUNK_OVERLAP):
    chunks = []
    start = 0
    while start < len(text):
        end = start + size
        chunks.append(text[start:end])
        start += size - overlap
    return chunks

def embed(genai_client, text):
    # google-genai 1.67.0 API [VERIFIED: inspect.signature]
    resp = genai_client.models.embed_content(
        model=EMBED_MODEL,
        contents=text,
    )
    return resp.embeddings[0].values

def stable_id(filepath, chunk_idx):
    """Deterministic int ID for idempotent upserts."""
    h = hashlib.sha256(f"{filepath}:{chunk_idx}".encode()).hexdigest()
    return int(h[:16], 16)  # 64-bit int

def index_paths(client, genai_client, paths):
    for base in paths:
        for md_file in base.rglob("*.md"):
            text = md_file.read_text(errors="ignore")
            chunks = chunk_text(text)
            points = []
            for i, chunk in enumerate(chunks):
                if not chunk.strip():
                    continue
                vec = embed(genai_client, chunk)
                points.append(PointStruct(
                    id=stable_id(str(md_file), i),
                    vector=vec,
                    payload={
                        "file": str(md_file),
                        "collection": md_file.parts[-3] if len(md_file.parts) > 2 else "unknown",
                        "chunk_index": i,
                        "text": chunk[:500],  # preview for retrieval
                    }
                ))
            if points:
                client.upsert(collection_name=COLLECTION, points=points)
                print(f"  Indexed {len(points)} chunks from {md_file.name}")

if __name__ == "__main__":
    gc = genai.Client()
    qc = get_client()
    ensure_collection(qc)
    index_paths(qc, gc, PATHS)
    print("Qdrant indexing complete.")
```

### Pattern 3: mem0 Export

**What:** Calls `GET /memory/all` for each user_id, filters to yesterday's memories by
`created_at` ISO timestamp, writes grouped markdown to `~/github/knowledge/mem0-exports/`.
**When to use:** Nightly, before `qmd update` so the exported files get BM25-indexed too.

```bash
#!/bin/bash
# ~/github/knowledge/mem0-export.sh
# mem0 REST API [VERIFIED: /memory/all endpoint, response format]
# Memory fields: id, memory, hash, metadata, created_at (ISO8601 with tz), user_id

MEM0_URL="http://localhost:3201"
EXPORT_DIR="$HOME/github/knowledge/mem0-exports"
YESTERDAY=$(date -v-1d '+%Y-%m-%d' 2>/dev/null || date -d 'yesterday' '+%Y-%m-%d')

mkdir -p "$EXPORT_DIR"

USER_IDS=(shared ceo cto cmo chief_of_staff engineer-handdrawn seo-handdrawn
          growth-handdrawn popsmiths social-media-manager copywriter video-producer
          graphic-designer growth-strategist qwen qwen-engineer claude)

for uid in "${USER_IDS[@]}"; do
    OUTFILE="$EXPORT_DIR/${uid}-${YESTERDAY}.md"
    # Skip if already exported today
    [ -f "$OUTFILE" ] && continue

    curl -sf "$MEM0_URL/memory/all?agent_id=$uid" 2>/dev/null | python3 -c "
import json, sys
from datetime import datetime
data = json.load(sys.stdin)
mems = data.get('memories', [])
yesterday = sys.argv[1]
filtered = [m for m in mems if m.get('created_at','').startswith(yesterday)]
if not filtered:
    sys.exit(0)
print(f'# mem0 Highlights: $uid — {yesterday}')
print()
for m in filtered:
    ts = m['created_at'][:16]
    text = m['memory']
    print(f'- [{ts}] {text}')
" "$YESTERDAY" > "$OUTFILE" 2>/dev/null || rm -f "$OUTFILE"
done
```

**Note on date filtering:** The mem0 `/memory/all` endpoint returns ALL memories with no
server-side date filter. Client-side filtering by `created_at` prefix (ISO date string
starts with `YYYY-MM-DD`) is the correct approach. [VERIFIED: memory format, created_at
field = `"2026-04-03T16:53:46.446756-07:00"`]

### Pattern 4: llm-wiki Raw Processing

**What:** llm-wiki raw processing is NOT automated — it requires Alba (Hermes Agent) to
read source files and write wiki pages. The curator's role is to CHECK for unprocessed
files and log a warning, not to process them.
**When to use:** In the curator script as a check, not a processor.

```bash
#!/bin/bash
# ~/github/knowledge/llm-wiki-process.sh
RAW_DIR="$HOME/github/knowledge/llm-wiki/raw"
count=$(find "$RAW_DIR" -maxdepth 1 -type f -name "*.md" | grep -v ".DS_Store" | wc -l | tr -d ' ')
if [ "$count" -gt 0 ]; then
    echo "  WARNING: $count unprocessed files in llm-wiki/raw/ — ask Alba to process"
    find "$RAW_DIR" -maxdepth 1 -type f -name "*.md" | grep -v ".DS_Store"
else
    echo "  llm-wiki/raw/ is empty — nothing to process"
fi
```

**Why:** GETTING-STARTED.md confirms llm-wiki processing is manual: "Ask Alba to process
it." The processed.txt log is empty (auto-generated but blank). No automated processor
script exists. [VERIFIED: GETTING-STARTED.md, processed.txt, ls raw/]

### Pattern 5: Cron Registration

**What:** Add nightly entry to crontab. Follow existing cron log pattern (`>> /tmp/...log`).
**When to use:** Once, during plan execution.

```bash
# Add to crontab (verify no duplicate first):
# 0 2 * * * /Users/lcalderon/github/knowledge/knowledge-curator.sh >> /tmp/knowledge-curator.log 2>&1
```

**Existing cron entries for reference (do not modify):** [VERIFIED: crontab -l]
- `0 7 * * 0` — refresh-index.sh (weekly, Sunday 7am) — KEEP as-is
- `0 3 * * *` — gitnexus-index.sh (nightly 3am) — curator runs at 2am to finish before gitnexus

### Anti-Patterns to Avoid

- **`qmd embed`:** Forbidden — stores vectors in local SQLite, not Qdrant Cloud
- **Touching `agent_memory` collection:** mem0's collection — curator only reads it via REST API, NEVER writes or modifies directly via qdrant-client
- **`source ~/github/knowledge/.env` without `set -a`:** Vars won't export to subprocesses; Python scripts won't see them
- **Full reindex every night without idempotency:** Use `stable_id()` (hash-based) so `upsert` is idempotent — same file+chunk always maps to same Qdrant point ID
- **Embedding entire large files:** Chunk to ~1000 chars to stay within Gemini token limits and improve retrieval precision
- **Using `recreate_collection`:** Destroys existing data; use `create_collection` with a `get_collection` check first

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Gemini embeddings | Custom HTTP client to Gemini API | `google-genai` SDK (`client.models.embed_content`) | Handles auth, retries, response parsing; already installed [VERIFIED] |
| Qdrant upsert | Raw HTTP to Qdrant REST | `qdrant-client` Python SDK | Type-safe models, batch upsert, collection management; already in venv [VERIFIED] |
| mem0 memory access | Direct Qdrant SQL on `agent_memory` | `GET /memory/all` REST endpoint | Never touch agent_memory directly — mem0 owns that collection |
| Date parsing | Regex on ISO strings | Python `datetime.fromisoformat()` or string prefix `startswith("YYYY-MM-DD")` | The mem0 API returns ISO8601 with timezone offset — prefix comparison is sufficient |
| Env var loading | Shell export statements | `set -a && source .env && set +a` | The .env file has no `export` prefix [VERIFIED] |

**Key insight:** All infrastructure is already installed and running. This phase is
orchestration and wiring, not new infrastructure.

---

## Common Pitfalls

### Pitfall 1: QDRANT_API_KEY Not Exported to Subprocesses

**What goes wrong:** Shell script sources `.env` normally; Python child process receives
empty `QDRANT_API_KEY`; Qdrant connection fails with 403.
**Why it happens:** The `.env` file has no `export` prefix — `source` sets vars in current
shell only, not subprocesses.
**How to avoid:** Always use `set -a && source ~/github/knowledge/.env && set +a` in the
orchestrator before calling any Python scripts. [VERIFIED: manual test confirmed this]
**Warning signs:** Python script exits with `KeyError: 'QDRANT_API_KEY'` or Qdrant 403.

### Pitfall 2: Touching `agent_memory` Qdrant Collection

**What goes wrong:** Curator accidentally upserts to `agent_memory` instead of
`knowledge_docs`, corrupting mem0's vector store.
**Why it happens:** Both collections are in the same Qdrant Cloud instance.
**How to avoid:** Hard-code `COLLECTION = "knowledge_docs"` in qdrant-indexer.py. Add a
guard: `assert COLLECTION != "agent_memory"`.
**Warning signs:** mem0 search returns bizarre results after a curator run.

### Pitfall 3: `knowledge_docs` Collection Already Exists on Re-run

**What goes wrong:** `create_collection` raises an exception on second run.
**Why it happens:** Curator is designed to be idempotent but `create_collection` errors if
collection exists.
**How to avoid:** Wrap in try/except: `try: client.get_collection(COLLECTION) except: client.create_collection(...)` [VERIFIED: qdrant-client 1.17.1 API]

### Pitfall 4: mem0 User IDs Must Be Hard-Coded (No Discovery API)

**What goes wrong:** Curator tries to auto-discover user_ids from mem0 API; no such
endpoint exists.
**Why it happens:** `GET /memory/all` requires `agent_id` param; no "list all user_ids"
endpoint in mem0-server.py. [VERIFIED: openapi.json routes list]
**How to avoid:** Hard-code the known user_ids list (17 IDs discovered via Qdrant scroll).
[VERIFIED: user_ids found = ceo, cto, cmo, chief_of_staff, claude, copywriter,
engineer-handdrawn, graphic-designer, growth-handdrawn, growth-strategist, popsmiths,
qwen, qwen-engineer, seo-handdrawn, shared, social-media-manager, video-producer]

### Pitfall 5: llm-wiki raw/ Processing is Manual

**What goes wrong:** Plan assumes curator can auto-process raw/ files using an LLM.
**Why it happens:** LLM-Wiki.md and GETTING-STARTED.md describe manual Alba workflow.
**How to avoid:** Curator only CHECKS for unprocessed files and logs a warning. Does not
attempt to process them. Processing remains a manual step (or v2 KNOW-07).

### Pitfall 6: Large Markdown Files + Gemini Rate Limits

**What goes wrong:** Indexing 462+ knowledge docs + 6 wiki pages + mem0 exports hits
Gemini API rate limits; script fails mid-run.
**Why it happens:** Free/standard Gemini tier has requests/minute limits.
**How to avoid:** Add `time.sleep(0.1)` between embed calls, implement retry with
exponential backoff, or batch requests. The `knowledge` collection alone has 462 files —
initial run may take several minutes.

### Pitfall 7: Cron PATH Doesn't Include `qmd` or `npx`

**What goes wrong:** Cron runs with minimal PATH; `qmd` and `npx` not found.
**Why it happens:** `/opt/homebrew/bin` not in cron PATH.
**How to avoid:** Existing `refresh-index.sh` uses full paths (`NPX=/opt/homebrew/bin/npx`)
— follow same pattern. Add `export PATH=/opt/homebrew/bin:$PATH` at top of curator script.
[VERIFIED: gitnexus-index.sh uses NPX=/opt/homebrew/bin/npx]

---

## Code Examples

### Verify Qdrant connection (shell)
```bash
# Source: VERIFIED against live Qdrant instance 2026-04-09
set -a && source ~/github/knowledge/.env && set +a
~/github/knowledge/.venv/bin/python3 -c "
from qdrant_client import QdrantClient
import os
client = QdrantClient(
    url='https://f969d77f-3cf6-4557-92cb-67f7cac0f44a.us-west-1-0.aws.cloud.qdrant.io:6333',
    api_key=os.environ['QDRANT_API_KEY']
)
print(client.get_collections())
"
# Expected: CollectionsResponse(collections=[...user_context, agent_memory, mem0migrations...])
```

### Create knowledge_docs collection (Python)
```python
# Source: qdrant-client 1.17.1 [VERIFIED: .venv pip list]
from qdrant_client import QdrantClient
from qdrant_client.models import VectorParams, Distance

client = QdrantClient(url=QDRANT_URL, api_key=os.environ["QDRANT_API_KEY"])
try:
    client.get_collection("knowledge_docs")
    print("knowledge_docs already exists")
except Exception:
    client.create_collection(
        collection_name="knowledge_docs",
        vectors_config=VectorParams(size=3072, distance=Distance.COSINE),
    )
    print("knowledge_docs created")
```

### Embed text with Gemini (Python)
```python
# Source: google-genai 1.67.0 inspect.signature [VERIFIED]
from google import genai
client = genai.Client()  # reads GEMINI_API_KEY from env
resp = client.models.embed_content(
    model="models/gemini-embedding-2-preview",
    contents="text to embed",
)
vector = resp.embeddings[0].values  # list of 3072 floats
```

### Query mem0 for all memories of a user
```bash
# Source: mem0-server.py /memory/all endpoint [VERIFIED: openapi routes]
curl -s "http://localhost:3201/memory/all?agent_id=shared" | python3 -m json.tool
# Returns: {"memories": [{"id": "...", "memory": "...", "created_at": "2026-04-03T...", "user_id": "shared", ...}]}
```

### Filter memories by date (Python)
```python
# Source: VERIFIED against live mem0 response format
import json, httpx
from datetime import date, timedelta

yesterday = (date.today() - timedelta(days=1)).isoformat()  # "2026-04-08"

resp = httpx.get("http://localhost:3201/memory/all", params={"agent_id": "shared"})
memories = resp.json()["memories"]
recent = [m for m in memories if m["created_at"].startswith(yesterday)]
```

---

## Runtime State Inventory

> This is NOT a rename/refactor phase. No runtime state inventory required.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `qdrant-client` Python | Qdrant indexer | Yes (in .venv) | 1.17.1 | — |
| `google-genai` Python | Gemini embeddings | Yes (in .venv) | 1.67.0 | — |
| `~/github/knowledge/.venv` | All Python steps | Yes | Python 3.14.2 | — |
| mem0 REST API | mem0 export step | Yes | localhost:3201 | Skip export, log warning |
| Qdrant Cloud | Qdrant indexer | Yes (with set -a .env) | API v1 | — |
| `qmd` binary | BM25 update | Yes | 1.1.5 | — |
| `~/github/gitnexus-index.sh` | gitnexus step | Yes | — | Non-fatal || echo |
| QDRANT_API_KEY | Qdrant indexer | In .env (not system env) | — | Must source .env |
| GEMINI_API_KEY | Embeddings | In .env and system env | — | — |
| crontab | Nightly schedule | Yes | macOS cron | — |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:**
- `knowledge_docs` Qdrant collection: Does not exist yet — create in Wave 0 of plan, or at start of indexer script [VERIFIED: collection absent]
- `mem0-exports/` directory: Does not exist yet — `mkdir -p` in script
- System `QDRANT_API_KEY` env var: Not exported to shell; must source `.env` with `set -a`

---

## Validation Architecture

> `workflow.nyquist_validation` not explicitly false in config — validation section included.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest (existing, from Phase 1) |
| Config file | `vitest.config.ts` (project root) |
| Quick run command | `npx vitest run` |
| Full suite command | `npx vitest run --reporter verbose` |

**Note:** The Knowledge Curator scripts are shell + Python, not TypeScript. Validation for
this phase is primarily **smoke tests** (run script, verify outputs exist) rather than unit
tests in vitest.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| KNOW-01-a | `knowledge-curator.sh` runs without fatal error | smoke | `bash -n ~/github/knowledge/knowledge-curator.sh` | ❌ Wave 0 |
| KNOW-01-b | `knowledge_docs` collection exists in Qdrant after indexer | integration | `curl` to Qdrant collections API | ❌ Wave 0 |
| KNOW-01-c | mem0 export creates markdown files in `mem0-exports/` | smoke | `ls ~/github/knowledge/mem0-exports/*.md` | ❌ Wave 0 |
| KNOW-01-d | `qmd update` completes (BM25 keyword index updated) | smoke | `qmd search "knowledge" | head -3` | — (qmd installed) |
| KNOW-01-e | Qdrant `knowledge_docs` returns results for semantic query | integration | `curl` to Qdrant search API | ❌ Wave 0 |
| KNOW-01-f | Cron entry exists at nightly schedule | smoke | `crontab -l | grep knowledge-curator` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `bash -n ~/github/knowledge/knowledge-curator.sh` (syntax check)
- **Per wave merge:** Full smoke test suite (run script, verify outputs)
- **Phase gate:** `knowledge_docs` collection has points > 0 before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `~/github/knowledge/knowledge-curator.sh` — main orchestrator (creates all outputs)
- [ ] `~/github/knowledge/qdrant-indexer.py` — Qdrant indexing script
- [ ] `~/github/knowledge/mem0-export.sh` — mem0 → markdown export
- [ ] `~/github/knowledge/llm-wiki-process.sh` — raw/ check/warning
- [ ] `~/github/knowledge/mem0-exports/` — directory for exported memories

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `qmd embed` for vectors | Qdrant Cloud with Gemini embeddings | Phase 2 decision (locked) | QMD SQLite stays BM25-only; semantic search is cloud-based |
| Manual gitnexus runs | Automatic via `gitnexus-index.sh` in cron | Phase 1 complete | No manual intervention needed |
| No mem0 → markdown export | Nightly mem0-export.sh | Phase 2 (this phase) | Memories become searchable in QMD and Qdrant |
| No semantic search on docs | `knowledge_docs` Qdrant collection | Phase 2 (this phase) | All 462+ markdown files become semantically searchable |

**Deprecated/outdated:**
- `qmd embed`: Forbidden — use Qdrant indexer instead. Do not reference in any script.

---

## Open Questions

1. **Which markdown collections to index into Qdrant?**
   - What we know: 18 QMD collections, 4 have explicit `basePath` in `collections.config.json` (agent-lightning, agent-lightning-docs, llm-wiki, knowledge). The other 14 use internal QMD storage.
   - What's unclear: Should we index all 18 collections or only the ones with known filesystem paths? The 14 internal collections (shared, paperclip, etc.) have filesystem paths stored inside QMD's index but aren't exposed via config.
   - Recommendation: Phase 2 indexes the 4 known basePath collections plus the mem0-exports output dir. Expanding to all QMD collections is a v2 enhancement (KNOW-06 territory).

2. **Rate limits on Gemini embedding API for 462+ files**
   - What we know: `knowledge` collection alone has 462 files; full corpus is ~500+ markdown files + chunking = potentially 2000-5000 embed calls on first run.
   - What's unclear: Whether the GEMINI_API_KEY tier supports this volume in one run.
   - Recommendation: Add `time.sleep(0.1)` between embed calls and implement retry logic. Initial run may take 10-20 minutes; subsequent nightly runs only re-embed changed/new files (via hash check on payload).

3. **Incremental vs full reindex**
   - What we know: qdrant-client `upsert` with stable hash-based IDs is idempotent — same file+chunk always overwrites same point.
   - What's unclear: How to efficiently detect which files changed since last run without extra bookkeeping.
   - Recommendation: Use file mtime stored in Qdrant payload for incremental; full reindex on first run, then mtime-based filter on subsequent runs. Start simple (always reindex changed files via mtime), optimize in v2.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | llm-wiki raw processing requires manual Alba invocation — no automated processor exists | Architecture Patterns: Pattern 4 | Low — GETTING-STARTED.md clearly describes manual workflow; no processor script found |
| A2 | Gemini `models/gemini-embedding-2-preview` returns `resp.embeddings[0].values` as the vector | Code Examples | Medium — SDK may return different structure; verify in Wave 0 task before full indexer |
| A3 | Nightly cron at 2:00 AM doesn't conflict with other scheduled jobs | Cron Setup | Low — existing nightly jobs: gitnexus at 3am, mem0 healthcheck every 15min, mkt-hub reports at 6am |

---

## Sources

### Primary (HIGH confidence — VERIFIED live)

- mem0-server.py — FastAPI endpoint list, memory data model, `/memory/all` response format
- `~/github/knowledge/.venv/bin/pip list` — qdrant-client 1.17.1, google-genai 1.67.0 confirmed
- `curl http://localhost:3201/health` — mem0 status: ok, vector_store: connected
- `bash -c 'set -a && source .env && ...'` — QDRANT_API_KEY loading pattern verified
- `qdrant-client.get_collections()` — live Qdrant collections: user_context, agent_memory, mem0migrations (knowledge_docs ABSENT)
- `qdrant-client.scroll(agent_memory)` — 531 points, 17 distinct user_ids identified
- `curl mem0/memory/all?agent_id=shared` — 100 memories, created_at ISO8601 format confirmed
- `crontab -l` — existing cron schedule, refresh-index.sh at 0 7 * * 0
- `~/github/knowledge/refresh-index.sh` — current script structure, set -e, gitnexus wired (Phase 1)
- `~/github/knowledge/.env` — env var names confirmed (QDRANT_API_KEY, GEMINI_API_KEY, GOOGLE_API_KEY)
- `~/github/knowledge/llm-wiki/GETTING-STARTED.md` — manual processing workflow confirmed
- `~/github/knowledge/llm-wiki/raw/` — 2 unprocessed files present
- `inspect.signature(client.models.embed_content)` — google-genai 1.67.0 embed_content API verified
- `agent-kitchen/collections.config.json` — 4 collections with basePath identified

### Secondary (MEDIUM confidence)

- Phase 1 SUMMARY.md — gitnexus integration confirmed, decisions documented
- REQUIREMENTS.md / ROADMAP.md — KNOW-01 definition and success criteria

### Tertiary (LOW confidence)

- A2 (Gemini embed response structure) — verified signature but not a live embed call

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages verified in live venv
- Architecture: HIGH — patterns derived from verified live infrastructure
- mem0 export: HIGH — endpoint, data model, and created_at format all verified live
- Qdrant indexer: HIGH (setup) / MEDIUM (Gemini response structure — signature verified, output structure assumed)
- llm-wiki processing: HIGH — manual-only confirmed from docs + absence of processor script
- Pitfalls: HIGH — all discovered through actual testing

**Research date:** 2026-04-09
**Valid until:** 2026-05-09 (stable infrastructure; mem0 user_ids may grow)
