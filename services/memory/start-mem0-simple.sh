#!/bin/bash
#
# Simple Mem0 Server Starter
# Use this for manual starts or with launchd
#

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

LOG_FILE="$SCRIPT_DIR/logs/mem0-server.log"
mkdir -p "$SCRIPT_DIR/logs"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting Mem0 server..." | tee -a "$LOG_FILE"

# Load .env without clobbering secrets already injected by launchd/runtime.
# Observed failure mode (2026-07-16): a stale/short QDRANT_API_KEY in .env
# overwrote the working launchd JWT and Qdrant Cloud returned 403 Forbidden.
if [ -f "$SCRIPT_DIR/.env" ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      ''|\#*) continue ;;
    esac
    key="${line%%=*}"
    value="${line#*=}"
    case "$key" in
      ''|*[!A-Za-z0-9_]* ) continue ;;
    esac
    # Only set if unset or empty — preserve launchd EnvironmentVariables.
    if [ -z "${!key+x}" ] || [ -z "${!key}" ]; then
      export "$key=$value"
    fi
  done < "$SCRIPT_DIR/.env"
fi

# Activate virtual environment — prefer memroos venv, fall back to knowledge venv for backward compat
if [ -f "$SCRIPT_DIR/../../.venv/bin/activate" ]; then
    # shellcheck disable=SC1091
    source "$SCRIPT_DIR/../../.venv/bin/activate"
elif [ -f "${KNOWLEDGE_VENV:-$HOME/github/knowledge/.venv}/bin/activate" ]; then
    # shellcheck disable=SC1091
    source "${KNOWLEDGE_VENV:-$HOME/github/knowledge/.venv}/bin/activate"
fi

PYTHON_BIN="${PYTHON_BIN:-$(command -v python3 || command -v python)}"
MEM0_DEP_CHECK_TIMEOUT_SEC="${MEM0_DEP_CHECK_TIMEOUT_SEC:-30}"

run_with_timeout() {
    local seconds="$1"
    shift

    if command -v timeout >/dev/null 2>&1; then
        timeout "$seconds" "$@"
    elif command -v gtimeout >/dev/null 2>&1; then
        gtimeout "$seconds" "$@"
    else
        # macOS often lacks GNU timeout — use Python so dep checks cannot hang forever.
        "$PYTHON_BIN" - "$seconds" "$@" <<'PY'
import subprocess
import sys

seconds = float(sys.argv[1])
cmd = sys.argv[2:]
try:
    raise SystemExit(subprocess.call(cmd, timeout=seconds))
except subprocess.TimeoutExpired:
    print(f"dependency check timed out after {seconds:.0f}s", file=sys.stderr)
    raise SystemExit(124)
PY
    fi
}

# Lightweight check only — avoid importing heavy mem0/qdrant at boot (slow + flaky).
if ! run_with_timeout "$MEM0_DEP_CHECK_TIMEOUT_SEC" "$PYTHON_BIN" - <<'PY' >> "$LOG_FILE" 2>&1
import importlib.util
import sys

missing = [name for name in ("fastapi", "uvicorn", "yaml", "httpx") if importlib.util.find_spec(name) is None]
if missing:
    print("Mem0 service dependency check failed:")
    for item in missing:
        print(f"- {item}: not installed")
    sys.exit(1)
PY
then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: memory service dependency check failed or timed out after ${MEM0_DEP_CHECK_TIMEOUT_SEC}s." | tee -a "$LOG_FILE"
    echo "Run: cd \"$SCRIPT_DIR/../..\" && .venv/bin/python3 -m pip install -r services/memory/requirements.txt" | tee -a "$LOG_FILE"
    exit 1
fi

# Start uvicorn (will run in foreground)
exec "$PYTHON_BIN" -m uvicorn mem0-server:app \
    --host 0.0.0.0 \
    --port 3201 \
    --log-level info \
    >> "$LOG_FILE" 2>&1
