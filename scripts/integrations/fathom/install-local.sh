#!/usr/bin/env bash
# Install Fathom dual-account meet-recordings wiring for the local MemRoOS operator.
#
# What it does:
# 1. Copies accounts.example.json -> ~/.memroos/integrations/fathom-accounts.json (if missing)
# 2. Enables meet-recordings in ~/.memroos/context-sources.local.json
# 3. Sets MEETINGS_INGEST_COMMAND in ~/.memroos/memroos-runtime.env
# 4. Optionally probes both Fathom accounts via 1Password (`op`)
#
# Usage:
#   bash scripts/integrations/fathom/install-local.sh
#   bash scripts/integrations/fathom/install-local.sh --probe
#   bash scripts/integrations/fathom/install-local.sh --run
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="${MEMROOS_ROOT:-$(cd "$SCRIPT_DIR/../../.." && pwd)}"
MEMROOS_HOME="${MEMROOS_HOME:-$HOME/.memroos}"
INTEGRATIONS_DIR="$MEMROOS_HOME/integrations"
ACCOUNTS_DST="$INTEGRATIONS_DIR/fathom-accounts.json"
ACCOUNTS_SRC="$SCRIPT_DIR/accounts.example.json"
OVERLAY="$MEMROOS_HOME/context-sources.local.json"
RUNTIME_ENV="$MEMROOS_HOME/memroos-runtime.env"
INGEST_CMD="$SCRIPT_DIR/fathom-ingest.sh"

DO_PROBE=0
DO_RUN=0
for arg in "$@"; do
  case "$arg" in
    --probe) DO_PROBE=1 ;;
    --run) DO_RUN=1 ;;
    -h|--help)
      sed -n '1,20p' "$0"
      exit 0
      ;;
  esac
done

mkdir -p "$INTEGRATIONS_DIR" "$MEMROOS_HOME/logs" "$REPO_ROOT/data/context/meet-recordings"
chmod +x "$INGEST_CMD"

if [[ ! -f "$ACCOUNTS_DST" ]]; then
  cp "$ACCOUNTS_SRC" "$ACCOUNTS_DST"
  echo "Created $ACCOUNTS_DST — edit api_key_op_ref paths to match your 1Password vault items."
else
  echo "Keeping existing $ACCOUNTS_DST"
fi

python3 - <<'PY' "$OVERLAY"
import json, sys
from pathlib import Path
overlay = Path(sys.argv[1])
data = {"sources": []}
if overlay.exists():
    try:
        data = json.loads(overlay.read_text())
    except json.JSONDecodeError:
        data = {"sources": []}
sources = data.setdefault("sources", [])
found = False
for source in sources:
    if isinstance(source, dict) and source.get("id") == "meet-recordings":
        source["enabled"] = True
        found = True
        break
if not found:
    sources.append({"id": "meet-recordings", "enabled": True})
overlay.parent.mkdir(parents=True, exist_ok=True)
overlay.write_text(json.dumps(data, indent=2) + "\n")
print(f"Enabled meet-recordings in {overlay}")
PY

touch "$RUNTIME_ENV"
if grep -q '^MEETINGS_INGEST_COMMAND=' "$RUNTIME_ENV" 2>/dev/null; then
  # Replace existing assignment
  tmp="$(mktemp)"
  awk -v cmd="$INGEST_CMD" '
    BEGIN { done=0 }
    /^MEETINGS_INGEST_COMMAND=/ {
      print "MEETINGS_INGEST_COMMAND=" cmd
      done=1
      next
    }
    { print }
    END {
      if (!done) print "MEETINGS_INGEST_COMMAND=" cmd
    }
  ' "$RUNTIME_ENV" > "$tmp"
  mv "$tmp" "$RUNTIME_ENV"
else
  {
    echo ""
    echo "# Fathom dual-account meet-recordings ingest (1Password-backed API keys)"
    echo "MEETINGS_INGEST_COMMAND=$INGEST_CMD"
    echo "FATHOM_ACCOUNTS_CONFIG=$ACCOUNTS_DST"
  } >> "$RUNTIME_ENV"
fi

# Ensure FATHOM_ACCOUNTS_CONFIG is present
if ! grep -q '^FATHOM_ACCOUNTS_CONFIG=' "$RUNTIME_ENV"; then
  echo "FATHOM_ACCOUNTS_CONFIG=$ACCOUNTS_DST" >> "$RUNTIME_ENV"
fi

echo "Wired MEETINGS_INGEST_COMMAND=$INGEST_CMD"

export MEMROOS_ROOT="$REPO_ROOT"
export FATHOM_ACCOUNTS_CONFIG="$ACCOUNTS_DST"

if [[ "$DO_PROBE" -eq 1 ]]; then
  echo "Probing Fathom accounts via 1Password / env..."
  python3 "$SCRIPT_DIR/fathom_ingest.py" --accounts-config "$ACCOUNTS_DST" --probe
fi

if [[ "$DO_RUN" -eq 1 ]]; then
  echo "Running Fathom ingest..."
  bash "$INGEST_CMD"
  if command -v qmd >/dev/null 2>&1; then
    qmd index meet-recordings || true
  else
    echo "qmd not installed in PATH; skip index. Install/qmd later, then: qmd index meet-recordings"
  fi
fi

cat <<EOF

Fathom local wiring complete.

Next:
1. Confirm 1Password items exist for both accounts (or edit $ACCOUNTS_DST):
   - Fathom API Epilogue  (luis@epiloguecapital.com)
   - Fathom API Gmail     (luis.calderon@gmail.com)
   Note: op:// refs cannot contain '@' — do not put the raw email in the secret reference.
2. Authenticate 1Password CLI (op signin) or set OP_SERVICE_ACCOUNT_TOKEN.
3. Probe: bash $SCRIPT_DIR/install-local.sh --probe
4. Sync:  bash $SCRIPT_DIR/install-local.sh --run

EOF
