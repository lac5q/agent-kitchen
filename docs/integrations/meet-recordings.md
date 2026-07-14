# Meeting Recordings Integration

MemRoOS uses a **declarative meet-sync pattern**: every meeting provider
(Google Meet, Spark, Circleback, Fathom, Zoom, …) follows the same pipeline.

```
ingest → ensure QMD collection → collection update → collection embed → status JSON
```

Public contract lives in [`scripts/meet-sync/`](../../scripts/meet-sync/).
Private operator wiring lives in `~/.memroos/meeting-sources.json` (never commit secrets).

## How It Works

1. Provider ingest exports transcripts as dated Markdown
2. `scripts/meet-sync/meet-sync.sh` indexes **only that source’s** QMD collection(s)
3. Agents use MCP **`memory_recall("meeting about X")`** — federates all enabled
   meeting collections + knowledge + mem0 (no need for `qmd -c` collection names)
4. Operators can still use `qmd search … -c <collection>` for debugging one source

Public provider templates (no secrets): [`scripts/meet-sync/providers/`](../../scripts/meet-sync/providers/).

Each provider gets its **own** output directory and QMD collection. Do not reuse
`meet-recordings` for Circleback/Fathom/Zoom — that collection is reserved for
Google Meet / Gemini notes.

| Provider | Output dir | QMD collection |
|----------|------------|----------------|
| Google Meet | knowledge `gdrive/meet-recordings` | `meet-recordings` |
| Spark | knowledge `spark-recordings` | `spark-recordings` |
| Circleback | `data/context/meet-recordings-circleback` | `meet-recordings-circleback` |
| Fathom | `data/context/meet-recordings-epilogue` / `-personal` | matching name |
| Zoom | `data/context/meet-recordings-zoom` | `meet-recordings-zoom` |

Private meeting collections are also listed in [`collections.config.json`](../../collections.config.json)
with `"private": true` — content stays under local `data/context/` (gitignored).

## Quick Start

### Step 1 — Copy the example config

```bash
mkdir -p ~/.memroos
cp scripts/meet-sync/meeting-sources.example.json ~/.memroos/meeting-sources.json
```

Enable the providers you use (`"enabled": true`) and point `envFile` at API keys.
Prefer public ingest commands under `scripts/meet-sync/providers/` (example config
already does for Circleback/Fathom).

### Step 2 — Public providers + private secrets

Public transforms/ingest live in `scripts/meet-sync/providers/`:

- `fathom_ingest.sh` / `fathom_transform.py` — idempotent by `recording_id`
- `circleback_ingest.sh` / `circleback_ingest.py` — idempotent by meeting id
- `zoom_transform.py` — idempotent by Zoom uuid/id

Frontmatter includes `calendar_title`, `share_url`, `meeting_id`, `source`.
Secrets stay in `~/.memroos/agent-keys/*.env` or 1Password — never commit them.

Optional: thin-wrap private scripts under `~/.memroos/integrations/` that `exec`
the public providers so existing LaunchAgents keep working.

### Step 3 — Enable context-source health overlays

Copy patterns from [`context-sources.local.json.example`](../../context-sources.local.json.example)
into `~/.memroos/context-sources.local.json`. Prefer meet-sync for index commands:

```json
{
  "id": "meet-recordings-circleback",
  "enabled": true,
  "indexCommand": "$HOME/github/memroos/scripts/meet-sync/meet-sync.sh --source circleback --skip-ingest"
}
```

### Step 4 — Run, health, and schedule

```bash
./scripts/meet-sync/meet-sync.sh --dry-run
./scripts/meet-sync/meet-sync.sh --health
./scripts/meet-sync/meet-sync.sh --source circleback
./scripts/meet-sync/install-launchd.sh
```

Status files: `~/.memroos/logs/meet-sync/<id>.json`.
`--health` reports freshness, last-run OK, and WARN when an enabled source has
empty output (personal Fathom often empty).

### Step 5 — Verify recall (preferred)

```bash
# Agent path — no collection name required
# MCP: memory_recall("Monaco Cordant")

# Operator debug — one collection
qmd collection show meet-recordings-circleback
qmd search "Monaco" -c meet-recordings-circleback

# Console multi-search includes a qmd meeting lane
# GET /api/memory/multi-search?q=Monaco
```

---

## Google Meet + Spark

Operators who already run
`~/github/knowledge/personal-ingestion-transcripts.sh` should enable the
`google-spark-transcripts` source in `meeting-sources.json`. That source:

1. Runs the existing knowledge ingest (Drive Gemini notes + Spark Desktop DB)
2. Reindexes `meet-recordings` and `spark-recordings` via meet-sync

Do not invent a second Google/Spark pipeline inside MemRoOS.

---

## Other Providers

| Provider | Typical ingest |
|----------|----------------|
| Fireflies | CLI/API → transform → Markdown |
| Otter.ai | export JSON → transform |
| Zoom | Server-to-Server OAuth + VTT download |
| Fathom | `X-Api-Key` meetings API |

Markdown should include a `## Transcript` section when the provider has one so
readiness policies (`artifactCompleteMarker`) keep working.

---

## Troubleshooting

**`meet-sync` says no enabled sources**
→ Edit `~/.memroos/meeting-sources.json` and set `"enabled": true`.

**Agents miss Circleback/Fathom with `knowledge_search` alone**
→ Expected. Use MCP `memory_recall` (or multi-search `qmd` tier). Private
collections are outside KNOWLEDGE_ROOT.

**Circleback meetings never searchable under `meet-recordings`**
→ Expected. Use collection `meet-recordings-circleback` for debug, or
`memory_recall` for federation.

**Still seeing `qmd index …` failures**
→ Replace stale LaunchAgents / overlay `indexCommand` values with
`scripts/meet-sync/meet-sync.sh`. Current QMD uses `update` / `embed`, not `index`.

**`knowledge_health()` shows a meeting source disabled**
→ Enable the matching id in `~/.memroos/context-sources.local.json`.

## See also

- [`scripts/meet-sync/README.md`](../../scripts/meet-sync/README.md)
- [`scripts/meet-sync/meeting-sources.example.json`](../../scripts/meet-sync/meeting-sources.example.json)
- [`scripts/meet-sync/providers/`](../../scripts/meet-sync/providers/)
