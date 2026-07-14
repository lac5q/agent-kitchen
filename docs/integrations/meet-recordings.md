# Meeting Recordings Integration

Memroos has a provider-agnostic `meet-recordings` context source slot.

**Preferred provider (dual Luis accounts):** [Fathom via 1Password](../../scripts/integrations/fathom/README.md)

Also supported: Circleback (private scripts), Fireflies, Otter, Zoom, or any meeting tool with a CLI/API.

## How It Works

1. Provider exports transcripts (Fathom External API, Circleback CLI, …)
2. An ingest script writes dated Markdown under `data/context/meet-recordings/`
3. `qmd` indexes them → `knowledge_search("meeting about X")`

Secrets stay out of git: 1Password (`op`) / env vars / `~/.memroos` overlays.

## Fathom (both accounts)

Ingests meetings for:

- `luis@epiloguecapital.com`
- `luis.calderon@gmail.com`

```bash
bash scripts/integrations/fathom/install-local.sh --probe
bash scripts/integrations/fathom/install-local.sh --run
```

API keys resolve from 1Password items titled like `Fathom API - <email>` (or env
`FATHOM_API_KEY_EPILOGUE` / `FATHOM_API_KEY_GMAIL`). Full details:
[`scripts/integrations/fathom/README.md`](../../scripts/integrations/fathom/README.md).

## Enable the source (any provider)

`meet-recordings` is in `context-sources.config.json` (disabled by default). Enable via
`~/.memroos/context-sources.local.json`:

```json
{
  "sources": [
    {
      "id": "meet-recordings",
      "enabled": true
    }
  ]
}
```

Wire the ingest command in `~/.memroos/memroos-runtime.env`:

```bash
MEETINGS_INGEST_COMMAND=$MEMROOS_ROOT/scripts/integrations/fathom/fathom-ingest.sh
# or: MEETINGS_INGEST_COMMAND=$HOME/.memroos/integrations/circleback-ingest.sh
```

## Circleback (private reference)

[Circleback](https://circleback.ai) CLI remains supported via private scripts:

```bash
mkdir -p ~/.memroos/integrations
# circleback-ingest.sh + circleback-transform.py live under ~/.memroos/integrations/
echo 'MEETINGS_INGEST_COMMAND=$HOME/.memroos/integrations/circleback-ingest.sh' \
  >> ~/.memroos/memroos-runtime.env
```

## Other Providers

| Provider | Export command |
|----------|----------------|
| Fathom | `scripts/integrations/fathom/fathom-ingest.sh` |
| Fireflies | `fireflies export --json` |
| Otter.ai | `otter export --format json` |
| Zoom | Zoom API `/meetings/{id}/recordings` |
| Circleback | `circleback meetings list --json` |

## Troubleshooting

**`knowledge_health()` shows meet-recordings as disabled**
→ Enable it in `~/.memroos/context-sources.local.json`

**No meetings after ingest**
→ Run `qmd index meet-recordings` and check `data/context/meet-recordings/`

**Fathom 1Password failures**
→ See [Fathom README](../../scripts/integrations/fathom/README.md) troubleshooting
