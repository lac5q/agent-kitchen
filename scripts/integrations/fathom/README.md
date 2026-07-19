# Meeting Recordings Integration

Memroos has a provider-agnostic `meet-recordings` context source slot. Supported
first-class providers:

| Provider | Status | Keys |
|----------|--------|------|
| **Fathom** | Committed ingest under `scripts/integrations/fathom/` | 1Password (`op read`) or env |
| Circleback | Private reference scripts under `~/.memroos/integrations/` | Circleback CLI login |

The same Markdown + `qmd` pattern also works for Fireflies, Otter, Zoom, or any
meeting tool with a CLI or API.

## How It Works

1. Your provider exports transcripts (Fathom External API, Circleback CLI, …)
2. An ingest script transforms them to dated Markdown files in `data/context/meet-recordings/`
3. `qmd` indexes them → searchable via `knowledge_search("meeting about X")`

The connection is wired through environment variables / `~/.memroos` overlays so
the public repo stays free of API keys.

## Fathom (dual-account, 1Password)

MemRoOS ingests **both**:

- `<you>@epiloguecapital.com`
- `luis.calderon@gmail.com`

Fathom API keys are **per user**. Each key only sees meetings that account
recorded or that were shared to its team. Use a separate 1Password item (or
env var) per account.

### One-shot local install + regular indexing

From the repo root on the operator machine (macOS host with `op` signed in):

```bash
bash scripts/integrations/fathom/install-local.sh --probe
bash scripts/integrations/fathom/install-local.sh --run
bash scripts/integrations/fathom/install-local.sh --schedule
```

This will:

1. Copy `scripts/integrations/fathom/accounts.example.json` → `~/.memroos/integrations/fathom-accounts.json` (if missing)
2. Enable `meet-recordings` in `~/.memroos/context-sources.local.json`
3. Set `MEETINGS_INGEST_COMMAND` to `scripts/integrations/fathom/fathom-ingest.sh`
4. Optionally probe both keys and sync meetings into `data/context/meet-recordings/`
5. Install **`com.memroos.fathom-sync`** via `scripts/install-runtime-services.mjs` — every **3 hours** runs ingest + `qmd index meet-recordings` (under the 360‑minute freshness threshold)

Manual equivalents:

```bash
npm run sync:fathom
npm run install:runtime-services
npm run check:runtime-services
```

`com.memroos.batch-embed` already includes the `meet-recordings` collection for embedding (3am/3pm). Fathom sync keeps the Markdown + qmd index fresh between those runs.

### 1Password item naming

`op://` secret references **cannot contain `@`**. Use titles without the at-sign:

| Account | Suggested 1Password title | Default `op://` ref |
|---------|---------------------------|---------------------|
| `<you>@epiloguecapital.com` | `Fathom API Epilogue` | `op://Private/Fathom API Epilogue/credential` |
| `luis.calderon@gmail.com` | `Fathom API Gmail` | `op://Private/Fathom API Gmail/credential` |

Store the Fathom API key in the item’s **credential** / **password** / **API key** field.
Generate keys in each Fathom account: **Settings → API Access**.

If your vault is not named `Private`, edit the `api_key_op_ref` values in
`~/.memroos/integrations/fathom-accounts.json`. The ingest script will also
auto-discover items titled with `Fathom` plus `Epilogue` / `Gmail` / the email
(with `@` or spaces).

Auth options for `op`:

- Desktop app integration (`op signin`)
- `OP_SERVICE_ACCOUNT_TOKEN` for headless/cron

Override without 1Password by exporting:

```bash
export FATHOM_API_KEY_EPILOGUE='...'
export FATHOM_API_KEY_GMAIL='...'
```

### Manual sync

```bash
source ~/.memroos/memroos-runtime.env
"$MEETINGS_INGEST_COMMAND"
qmd index meet-recordings
```

### Regular schedule (required for freshness)

```bash
bash scripts/integrations/fathom/install-local.sh --schedule
# or
npm run install:runtime-services
launchctl list | grep fathom-sync
```

Interval: **10800s (3h)** — keeps `meet-recordings` under `freshnessThresholdMinutes: 360`.
Logs: `~/.memroos/logs/fathom-sync.log`

### Verify

```bash
python3 scripts/integrations/fathom/fathom_ingest.py --probe
ls data/context/meet-recordings/*fathom*
knowledge_search("last fathom meeting")
```

---

## Quick Start (generic provider)

### Step 1 — Enable the source

The `meet-recordings` source is already in `context-sources.config.json` (disabled by default).
Enable it in your private overlay:

**`~/.memroos/context-sources.local.json`** (create from `context-sources.local.json.example`):
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

### Step 2 — Create your ingest script

Create `~/.memroos/integrations/my-meetings-ingest.sh`:
```bash
#!/usr/bin/env bash
set -euo pipefail
OUTPUT_DIR="${MEMROOS_ROOT:-$HOME/github/memroos}/data/context/meet-recordings"
mkdir -p "$OUTPUT_DIR"
# Your provider CLI command here → transform to Markdown → write to $OUTPUT_DIR
```

### Step 3 — Wire the env var

In `~/.memroos/memroos-runtime.env`:
```bash
MEETINGS_INGEST_COMMAND=$HOME/.memroos/integrations/my-meetings-ingest.sh
```

### Step 4 — Schedule nightly sync (optional)

Copy the Fathom LaunchAgent template above (or the Circleback plist) and adapt the ingest path.

---

## Circleback Reference Implementation

[Circleback](https://circleback.ai) provides a CLI with `--json` output — also a clean
integration path for memroos (historically private scripts only).

### Install the CLI

```bash
npm install -g @circleback/cli
circleback login
```

### Create the ingest script

```bash
mkdir -p ~/.memroos/integrations
cat > ~/.memroos/integrations/circleback-ingest.sh << 'EOF'
#!/usr/bin/env bash
set -euo pipefail
OUTPUT_DIR="${MEMROOS_ROOT:-$HOME/github/memroos}/data/context/meet-recordings"
mkdir -p "$OUTPUT_DIR"
circleback meetings list --json | python3 ~/.memroos/integrations/circleback-transform.py --output-dir "$OUTPUT_DIR"
EOF
chmod +x ~/.memroos/integrations/circleback-ingest.sh
```

### Wire the env var

```bash
echo 'MEETINGS_INGEST_COMMAND=$HOME/.memroos/integrations/circleback-ingest.sh' \
  >> ~/.memroos/memroos-runtime.env
```

### Run a manual sync

```bash
source ~/.memroos/memroos-runtime.env
$MEETINGS_INGEST_COMMAND
qmd index meet-recordings
```

### Verify

```bash
knowledge_search("last meeting with [person]")
# Should return your circleback transcripts
```

---

## Other Providers

| Provider | Export command |
|----------|----------------|
| Fireflies | `fireflies export --json` |
| Otter.ai | `otter export --format json` |
| Zoom | Zoom API `/meetings/{id}/recordings` |
| Fathom | `scripts/integrations/fathom/fathom-ingest.sh` (see above) |

---

## Troubleshooting

**`knowledge_health()` shows meet-recordings as disabled**
→ Check `~/.memroos/context-sources.local.json` has `"enabled": true`

**No meetings appear after running ingest**
→ Run `qmd index meet-recordings` manually after the ingest script
→ Check `data/context/meet-recordings/` for `.md` files

**`MEETINGS_INGEST_COMMAND: command not found`**
→ Verify `source ~/.memroos/memroos-runtime.env` sets the variable
→ Check script path and permissions: `chmod +x scripts/integrations/fathom/fathom-ingest.sh`

**Fathom probe fails with 1Password errors**
→ `op account list` should show an authenticated account, or set `OP_SERVICE_ACCOUNT_TOKEN`
→ Confirm item titles include the account email and a credential field
→ Or export `FATHOM_API_KEY_EPILOGUE` / `FATHOM_API_KEY_GMAIL` as a temporary override

**Only one Fathom account returns meetings**
→ Each API key is user-scoped. Create/share meetings into that account’s team, or ensure both 1Password items have valid keys.
