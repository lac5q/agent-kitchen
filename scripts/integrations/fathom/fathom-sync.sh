#!/usr/bin/env bash
# Regular Fathom meet-recordings sync + qmd index (launchd / cron entrypoint).
# Ingests both configured accounts, then indexes the meet-recordings collection.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MEMROOS_ROOT="${MEMROOS_ROOT:-$(cd "$SCRIPT_DIR/../../.." && pwd)}"
MEMROOS_HOME="${MEMROOS_HOME:-$HOME/.memroos}"
LOG_DIR="${FATHOM_LOG_DIR:-$MEMROOS_HOME/logs}"
RUNTIME_ENV="${MEMROOS_RUNTIME_ENV:-$MEMROOS_HOME/memroos-runtime.env}"
ACCOUNTS_CONFIG="${FATHOM_ACCOUNTS_CONFIG:-$MEMROOS_HOME/integrations/fathom-accounts.json}"
SKIP_INDEX="${FATHOM_SKIP_INDEX:-0}"

mkdir -p "$LOG_DIR" "$MEMROOS_ROOT/data/context/meet-recordings"

if [[ -f "$RUNTIME_ENV" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$RUNTIME_ENV" || true
  set +a
fi

export MEMROOS_ROOT
export FATHOM_ACCOUNTS_CONFIG="$ACCOUNTS_CONFIG"

ts() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }

echo "[$(ts)] fathom-sync start root=$MEMROOS_ROOT"

# Soft-skip when credentials are not resolvable (avoid launchd crash loops).
set +e
probe_out="$(python3 "$SCRIPT_DIR/fathom_ingest.py" --accounts-config "$ACCOUNTS_CONFIG" --probe 2>&1)"
probe_rc=$?
set -e
echo "$probe_out"

if [[ "$probe_rc" -ne 0 ]]; then
  if echo "$probe_out" | grep -Eqi 'Could not resolve Fathom API key|No accounts configured|OP_SERVICE_ACCOUNT_TOKEN|invalid secret reference|not authenticated'; then
    echo "[$(ts)] fathom-sync skip: Fathom credentials not available yet"
    exit 0
  fi
  echo "[$(ts)] fathom-sync probe failed rc=$probe_rc" >&2
  exit "$probe_rc"
fi

set +e
bash "$SCRIPT_DIR/fathom-ingest.sh"
ingest_rc=$?
set -e

if [[ "$ingest_rc" -ne 0 ]]; then
  echo "[$(ts)] fathom-sync ingest failed rc=$ingest_rc" >&2
fi

if [[ "$SKIP_INDEX" == "1" ]]; then
  echo "[$(ts)] fathom-sync skip index (FATHOM_SKIP_INDEX=1)"
  exit "$ingest_rc"
fi

if command -v qmd >/dev/null 2>&1; then
  echo "[$(ts)] fathom-sync indexing meet-recordings"
  set +e
  (
    cd "$MEMROOS_ROOT"
    env QMD_FORCE_CPU="${QMD_FORCE_CPU:-1}" qmd index meet-recordings
  )
  index_rc=$?
  set -e
  if [[ "$index_rc" -ne 0 ]]; then
    echo "[$(ts)] fathom-sync index failed rc=$index_rc" >&2
    exit "$index_rc"
  fi
else
  echo "[$(ts)] fathom-sync warn: qmd not in PATH; meetings written but not indexed" >&2
fi

echo "[$(ts)] fathom-sync done ingest_rc=$ingest_rc"
exit "$ingest_rc"
