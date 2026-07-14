# Meet Sync (public MemRoOS pattern)

Declarative meeting ingestion for MemRoOS: one config, one runner, LaunchAgent installer.

## Contract

1. Provider ingest writes dated Markdown (with `## Transcript` when available)
2. `meet-sync.sh` ensures a QMD collection, reindexes it, and embeds that collection only
3. Secrets stay in private `envFile` / 1Password — never in the JSON config
4. Operator enables sources in `~/.memroos/meeting-sources.json` (copy from example)
5. Agents recall via MCP `memory_recall` (federated) — not by guessing `qmd -c` names

Public transforms: `providers/` (`fathom_*`, `circleback_*`, `zoom_transform.py`).

## Quick start

```bash
# 1. Private config
mkdir -p ~/.memroos
cp scripts/meet-sync/meeting-sources.example.json ~/.memroos/meeting-sources.json
# edit: set enabled=true for your providers, wire envFile paths

# 2. Dry-run / health
./scripts/meet-sync/meet-sync.sh --dry-run
./scripts/meet-sync/meet-sync.sh --health

# 3. One source
./scripts/meet-sync/meet-sync.sh --source circleback

# 4. Schedule
./scripts/meet-sync/install-launchd.sh
```

## Collection naming

| Provider | Output dir | QMD collection |
|----------|------------|----------------|
| Google Meet | knowledge `gdrive/meet-recordings` | `meet-recordings` |
| Spark | knowledge `spark-recordings` | `spark-recordings` |
| Circleback | `data/context/meet-recordings-circleback` | `meet-recordings-circleback` |
| Fathom | `data/context/meet-recordings-epilogue` / `-personal` | matching name |
| Zoom | `data/context/meet-recordings-zoom` | `meet-recordings-zoom` |

Do **not** point Circleback at the `meet-recordings` collection — that name is reserved for Google Meet notes.

## Status

Each run writes `~/.memroos/logs/meet-sync/<id>.json`.

## See also

- [Meeting recordings integration](../../docs/integrations/meet-recordings.md)
- [context-sources.local.json.example](../../context-sources.local.json.example)
