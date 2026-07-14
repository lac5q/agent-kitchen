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
3. `knowledge_search("meeting about X")` / `qmd query` can search the collection

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

## Quick Start

### Step 1 — Copy the example config

```bash
mkdir -p ~/.memroos
cp scripts/meet-sync/meeting-sources.example.json ~/.memroos/meeting-sources.json
```

Enable the providers you use (`"enabled": true`) and point `ingestCommand` /
`envFile` at your private scripts and API keys.

### Step 2 — Private ingest scripts

Keep provider CLIs/API keys under `~/.memroos/integrations/` and
`~/.memroos/agent-keys/` (gitignored). A minimal Circleback example:

```bash
mkdir -p ~/.memroos/integrations
cat > ~/.memroos/integrations/circleback-ingest.sh << 'EOF'
#!/usr/bin/env bash
set -euo pipefail
OUTPUT_DIR="${1:-${MEMROOS_ROOT:-$HOME/github/memroos}/data/context/meet-recordings-circleback}"
# Prefer --output-dir from meet-sync when provided
while [[ $# -gt 0 ]]; do
  case "$1" in
    --output-dir) OUTPUT_DIR="$2"; shift 2 ;;
    *) shift ;;
  esac
done
mkdir -p "$OUTPUT_DIR"
TMP="$(mktemp)"
circleback meetings list --json > "$TMP"
python3 "$HOME/.memroos/integrations/circleback-transform.py" --output-dir "$OUTPUT_DIR" < "$TMP"
rm -f "$TMP"
EOF
chmod +x ~/.memroos/integrations/circleback-ingest.sh
```

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

### Step 4 — Run and schedule

```bash
./scripts/meet-sync/meet-sync.sh --dry-run
./scripts/meet-sync/meet-sync.sh --source circleback
./scripts/meet-sync/install-launchd.sh
```

Status files: `~/.memroos/logs/meet-sync/<id>.json`.

### Step 5 — Verify

```bash
qmd collection show meet-recordings-circleback
qmd search "last meeting" -c meet-recordings-circleback
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

**Circleback meetings never searchable under `meet-recordings`**
→ Expected. Use collection `meet-recordings-circleback`.

**Still seeing `qmd index …` failures**
→ Replace stale LaunchAgents / overlay `indexCommand` values with
`scripts/meet-sync/meet-sync.sh`. Current QMD uses `update` / `embed`, not `index`.

**`knowledge_health()` shows a meeting source disabled**
→ Enable the matching id in `~/.memroos/context-sources.local.json`.

## See also

- [`scripts/meet-sync/README.md`](../../scripts/meet-sync/README.md)
- [`scripts/meet-sync/meeting-sources.example.json`](../../scripts/meet-sync/meeting-sources.example.json)
