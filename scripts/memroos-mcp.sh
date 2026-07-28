#!/usr/bin/env bash
# Launch Memroos' knowledge/tool-attention MCP facade.
# Keep stdout clean for MCP JSON-RPC; all setup/status messages go to stderr.
set -euo pipefail

# Agent CLIs (Hermes, etc.) can leak their own venv's PYTHONPATH into this
# process; a py3.11 pydantic under the py3.12 venv breaks fastmcp at import.
# Scrub before any python starts.
unset PYTHONPATH PYTHONHOME

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

export MEMROOS_ROOT="${MEMROOS_ROOT:-$ROOT}"
MEMROOS_MCP_DEP_CHECK_TIMEOUT_SEC="${MEMROOS_MCP_DEP_CHECK_TIMEOUT_SEC:-90}"
MEMROOS_AGENT_KEYS_DIR="${MEMROOS_AGENT_KEYS_DIR:-$HOME/.memroos/agent-keys}"
MEMROOS_MCP_AGENT_ENV_STATUS=0
MEMROOS_MCP_STRICT_MEMORY_CHECK=0
MEMROOS_REQUIRE_SERVER_MEMORY="${MEMROOS_REQUIRE_SERVER_MEMORY:-0}"
MEMROOS_ALLOWED_MEMORY_TIER_STATUSES="${MEMROOS_ALLOWED_MEMORY_TIER_STATUSES:-not_configured}"
MEMROOS_MCP_STRICT_CHECK_ATTEMPTS="${MEMROOS_MCP_STRICT_CHECK_ATTEMPTS:-5}"
MEMROOS_MCP_STRICT_CHECK_RETRY_DELAY_SEC="${MEMROOS_MCP_STRICT_CHECK_RETRY_DELAY_SEC:-2}"
MEMROOS_MCP_STRICT_CHECK_TIMEOUT_SEC="${MEMROOS_MCP_STRICT_CHECK_TIMEOUT_SEC:-25}"

run_with_timeout() {
  local seconds="$1"
  shift

  if command -v timeout >/dev/null 2>&1; then
    timeout "$seconds" "$@"
  elif command -v gtimeout >/dev/null 2>&1; then
    gtimeout "$seconds" "$@"
  else
    "$@"
  fi
}

agent_key_file_for() {
  local agent_id="$1"
  [[ -n "$agent_id" ]] || return 1
  printf "%s/%s.key" "$MEMROOS_AGENT_KEYS_DIR" "$agent_id"
}

first_readable_agent_id() {
  local candidate key_file
  for candidate in "$@"; do
    key_file="$(agent_key_file_for "$candidate")"
    if [[ -r "$key_file" && -s "$key_file" ]]; then
      printf "%s" "$candidate"
      return 0
    fi
  done
  return 1
}

detect_mcp_client() {
  case "${MEMROOS_MCP_CLIENT:-}" in
    ""|auto|detect)
      ;;
    *)
      printf "%s" "$MEMROOS_MCP_CLIENT"
      return 0
      ;;
  esac

  local pid="${PPID:-}" seen=0 process
  while [[ -n "$pid" && "$pid" != "0" && "$seen" -lt 12 ]]; do
    process="$(ps -p "$pid" -o comm= -o args= 2>/dev/null || true)"
    case "$process" in
      *qwen*) printf "qwen"; return 0 ;;
      *gemini*) printf "gemini"; return 0 ;;
      *opencode*) printf "opencode"; return 0 ;;
      *openclaw*) printf "openclaw"; return 0 ;;
      *hermes*) printf "hermes"; return 0 ;;
      *claude*) printf "claude"; return 0 ;;
      *codex*) printf "codex"; return 0 ;;
      *zcode*) printf "zcode"; return 0 ;;
      *droid*|*factory*) printf "droid"; return 0 ;;
      *grok*) printf "grok"; return 0 ;;
      # Cursor Desktop / Cursor Helper / cursor-agent — before bare *pi* so we
      # do not mis-classify Cursor Helper process names.
      *Cursor*|*cursor-agent*|*cursor\ *) printf "cursor"; return 0 ;;
      */pi\ *|*[[:space:]]pi[[:space:]]*|[[:space:]]pi$|*/pi$) printf "pi"; return 0 ;;
    esac
    pid="$(ps -p "$pid" -o ppid= 2>/dev/null | tr -d '[:space:]')"
    seen=$((seen + 1))
  done

  return 1
}

infer_agent_id() {
  local mcp_client
  mcp_client="$(detect_mcp_client || true)"

  case "$mcp_client" in
    codex)
      first_readable_agent_id codex-desktop-luis-mbp codex-cloud-memroos opencode
      ;;
    claude|claude-code)
      first_readable_agent_id claude-code-luis-mbp claudebot
      ;;
    hermes)
      first_readable_agent_id alba maria
      ;;
    cursor)
      first_readable_agent_id cursor-desktop-luis-mbp cursor-cloud-memroos
      ;;
    qwen)
      first_readable_agent_id qwen-cli-luis-mbp
      ;;
    gemini)
      first_readable_agent_id gemini-cli-luis-mbp
      ;;
    opencode)
      first_readable_agent_id opencode
      ;;
    openclaw)
      first_readable_agent_id openclaw-desktop-luis-mbp lucia sophia gwen
      ;;
    zcode)
      first_readable_agent_id zcode-desktop-luis-mbp
      ;;
    pi)
      first_readable_agent_id pi-desktop-luis-mbp
      ;;
    grok)
      first_readable_agent_id grok-desktop-luis-mbp
      ;;
    droid)
      first_readable_agent_id droid-desktop-luis-mbp lcalderon-main-mac oracle-1-droid maeve-u1-droid
      ;;
    *)
      first_readable_agent_id opencode codex-desktop-luis-mbp claude-code-luis-mbp claudebot alba
      ;;
  esac
}

load_local_agent_key() {
  [[ -z "${MEMROOS_AGENT_API_KEY:-}" ]] || return 0

  if [[ -z "${MEMROOS_AGENT_ID:-}" ]]; then
    local inferred
    if inferred="$(infer_agent_id)"; then
      export MEMROOS_AGENT_ID="$inferred"
    fi
  fi

  local key_file="${MEMROOS_AGENT_KEY_FILE:-}"
  if [[ -z "$key_file" && -n "${MEMROOS_AGENT_ID:-}" ]]; then
    key_file="$(agent_key_file_for "$MEMROOS_AGENT_ID")"
  fi

  if [[ -n "$key_file" && -r "$key_file" && -s "$key_file" ]]; then
    local key
    key="$(tr -d '\r\n' < "$key_file")"
    if [[ "$key" == ak_* ]]; then
      export MEMROOS_AGENT_API_KEY="$key"
      export MEMROOS_AGENT_KEY_FILE="$key_file"
    else
      echo "Ignoring malformed MemroOS agent key file: $key_file" >&2
    fi
  fi
}

is_true() {
  case "${1:-}" in
    1|true|TRUE|yes|YES|on|ON) return 0 ;;
    *) return 1 ;;
  esac
}

positive_int_or_default() {
  local raw="$1" default="$2"
  if [[ "$raw" =~ ^[0-9]+$ && "$raw" -gt 0 ]]; then
    printf "%s" "$raw"
  else
    printf "%s" "$default"
  fi
}

nonnegative_int_or_default() {
  local raw="$1" default="$2"
  if [[ "$raw" =~ ^[0-9]+$ ]]; then
    printf "%s" "$raw"
  else
    printf "%s" "$default"
  fi
}

strict_fail() {
  echo "MemRoOS server memory unavailable: $*" >&2
  echo "Unset MEMROOS_REQUIRE_SERVER_MEMORY to allow repo-local MCP tools without server memory." >&2
  exit 78
}

require_server_memory_access() {
  is_true "$MEMROOS_REQUIRE_SERVER_MEMORY" || return 0

  command -v curl >/dev/null 2>&1 || strict_fail "curl is required for strict memory checks"
  command -v jq >/dev/null 2>&1 || strict_fail "jq is required for strict memory checks"

  local app_url agent_id key inbox_file health_file code unhealthy_tiers allowed_tier_statuses
  local attempts delay timeout attempt last_error
  app_url="${MEMROOS_APP_URL:-${MEMROOS_BASE_URL:-http://localhost:3002}}"
  app_url="${app_url%/}"
  agent_id="${MEMROOS_AGENT_ID:-}"
  key="${MEMROOS_AGENT_API_KEY:-}"
  allowed_tier_statuses=",${MEMROOS_ALLOWED_MEMORY_TIER_STATUSES//[[:space:]]/},"
  attempts="$(positive_int_or_default "$MEMROOS_MCP_STRICT_CHECK_ATTEMPTS" 5)"
  delay="$(nonnegative_int_or_default "$MEMROOS_MCP_STRICT_CHECK_RETRY_DELAY_SEC" 2)"
  timeout="$(positive_int_or_default "$MEMROOS_MCP_STRICT_CHECK_TIMEOUT_SEC" 25)"

  [[ -n "$agent_id" ]] || strict_fail "MEMROOS_AGENT_ID could not be resolved"
  [[ -n "$key" ]] || strict_fail "MEMROOS_AGENT_API_KEY could not be loaded for ${agent_id}"

  inbox_file="$(mktemp -t memroos-mcp-agent-context.XXXXXX.json)"
  health_file="$(mktemp -t memroos-mcp-memory-health.XXXXXX.json)"
  trap 'rm -f "$inbox_file" "$health_file"' RETURN

  for attempt in $(seq 1 "$attempts"); do
    code="$(curl -sS -o "$inbox_file" -w "%{http_code}" \
      "${app_url}/api/agent-context/messages?agent=${agent_id}&box=inbox&status=pending&limit=1" \
      -H "Authorization: Bearer ${key}" \
      --max-time "$timeout" 2>/dev/null || true)"
    if [[ ! "$code" =~ ^2 ]]; then
      last_error="agent-context auth check failed for ${agent_id} at ${app_url} (HTTP ${code:-curl_failed})"
    elif ! jq -e '.ok == true' "$inbox_file" >/dev/null; then
      last_error="agent-context auth check returned an unexpected response for ${agent_id}"
    else
      code="$(curl -sS -o "$health_file" -w "%{http_code}" \
        "${app_url}/api/memory/health" \
        -H "Authorization: Bearer ${key}" \
        --max-time "$timeout" 2>/dev/null || true)"
      if [[ ! "$code" =~ ^2 ]]; then
        last_error="memory health check failed at ${app_url}/api/memory/health (HTTP ${code:-curl_failed})"
      elif ! jq -e '.ok == true and (.tiers | type == "array")' "$health_file" >/dev/null; then
        last_error="memory health check returned an unexpected response"
      else
        unhealthy_tiers="$(jq -r --arg allowed "$allowed_tier_statuses" \
          '[.tiers[]?
            | (.status | tostring) as $status
            | select($status != "up" and ($allowed | contains("," + $status + ",") | not))
            | "\(.tier)=\($status)" + (if (.detail|type)=="string" and (.detail|length)>0 then "(\(.detail))" else "" end)
          ] | join(", ")' "$health_file")"
        if [[ -z "$unhealthy_tiers" ]]; then
          if [[ "$attempt" -gt 1 ]]; then
            echo "MemRoOS strict memory check recovered on attempt ${attempt}/${attempts}." >&2
          fi
          return 0
        fi
        last_error="memory tiers are not healthy: ${unhealthy_tiers} (attempt ${attempt}/${attempts}; health HTTP ${code})"
        # Extra compact diagnostics from health JSON (never print API keys / Authorization).
        extra_diag="$(jq -r '
          [
            (.tiers[]? | select(.tier=="vector") | "vector_detail=\(.detail // "none")"),
            (.tiers[]? | select(.tier=="graph") | "graph=\(.status)"),
            (.tiers[]? | select(.tier=="episodic") | "episodic=\(.status)")
          ] | map(select(length>0)) | join("; ")
        ' "$health_file" 2>/dev/null || true)"
        if [[ -n "$extra_diag" && "$extra_diag" != "null" ]]; then
          last_error="${last_error}; ${extra_diag}"
        fi
      fi
    fi

    if [[ "$attempt" -lt "$attempts" ]]; then
      echo "MemRoOS strict memory check attempt ${attempt}/${attempts} failed: ${last_error}; retrying in ${delay}s." >&2
      sleep "$delay"
    fi
  done

  strict_fail "${last_error:-strict memory check failed}"
}

if [[ -z "${KNOWLEDGE_ROOT:-}" ]]; then
  if [[ -d "$HOME/github/knowledge" ]]; then
    export KNOWLEDGE_ROOT="$HOME/github/knowledge"
  else
    export KNOWLEDGE_ROOT="$MEMROOS_ROOT"
  fi
fi

while [[ $# -gt 0 ]]; do
  case "$1" in
    --stdio)
      export MEMROOS_MCP_TRANSPORT="stdio"
      shift
      ;;
    --http|--streamable-http)
      export MEMROOS_MCP_TRANSPORT="streamable-http"
      shift
      ;;
    --sse)
      export MEMROOS_MCP_TRANSPORT="sse"
      shift
      ;;
    --host)
      export MEMROOS_MCP_HOST="${2:?--host requires a value}"
      shift 2
      ;;
    --port)
      export MEMROOS_MCP_PORT="${2:?--port requires a value}"
      shift 2
      ;;
    --path|--mcp-path)
      export MEMROOS_MCP_STREAMABLE_HTTP_PATH="${2:?--path requires a value}"
      shift 2
      ;;
    --knowledge-root)
      export KNOWLEDGE_ROOT="${2:?--knowledge-root requires a value}"
      shift 2
      ;;
    --mem0-url)
      export MEM0_URL="${2:?--mem0-url requires a value}"
      shift 2
      ;;
    --agent-env-status)
      MEMROOS_MCP_AGENT_ENV_STATUS=1
      shift
      ;;
    --strict-memory-check)
      MEMROOS_MCP_STRICT_MEMORY_CHECK=1
      shift
      ;;
    --stateless-http)
      export MEMROOS_MCP_STATELESS_HTTP="true"
      shift
      ;;
    --help|-h)
      cat >&2 <<'HELP'
Usage: scripts/memroos-mcp.sh [--stdio|--http|--sse] [options]

Defaults to stdio for local MCP clients.

Options:
  --http                  Serve Streamable HTTP MCP (default path /mcp)
  --sse                   Serve legacy SSE MCP
  --host HOST             Bind host for HTTP/SSE, e.g. 0.0.0.0 for Tailscale
  --port PORT             Bind port for HTTP/SSE, default 8765
  --path PATH             Streamable HTTP path, default /mcp
  --knowledge-root PATH   Knowledge root to expose; defaults to ~/github/knowledge if present, else repo root
  --mem0-url URL          mem0 base URL for memory_search/memory_save
  --agent-env-status      Print non-secret agent auth status and exit
  --strict-memory-check   Run the strict server-memory gate and exit without starting MCP
  --stateless-http        Enable FastMCP stateless HTTP mode

Examples:
  scripts/memroos-mcp.sh
  scripts/memroos-mcp.sh --http --host 0.0.0.0 --port 8765
HELP
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 2
      ;;
  esac
done

load_local_agent_key

if [[ "$MEMROOS_MCP_AGENT_ENV_STATUS" == "1" ]]; then
  if [[ -n "${MEMROOS_AGENT_API_KEY:-}" ]]; then
    key_status="present"
  else
    key_status="missing"
  fi
  printf 'agent_id=%s\n' "${MEMROOS_AGENT_ID:-}"
  printf 'key_status=%s\n' "$key_status"
  printf 'key_file=%s\n' "${MEMROOS_AGENT_KEY_FILE:-}"
  printf 'app_url=%s\n' "${MEMROOS_APP_URL:-${MEMROOS_BASE_URL:-http://localhost:3002}}"
  printf 'require_server_memory=%s\n' "$MEMROOS_REQUIRE_SERVER_MEMORY"
  printf 'allowed_memory_tier_statuses=%s\n' "$MEMROOS_ALLOWED_MEMORY_TIER_STATUSES"
  exit 0
fi

require_server_memory_access
if [[ "$MEMROOS_MCP_STRICT_MEMORY_CHECK" == "1" ]]; then
  echo "MemRoOS strict memory check passed." >&2
  exit 0
fi

# fastmcp>=2.0 requires Python >=3.10. oracle-1 shipped a venv built by a bare
# `python3` that resolved to 3.9, so every dependency refresh failed with
# "No matching distribution found for fastmcp" and the MCP server never started
# — for months, silently, because the venv was reused unconditionally once it
# existed. Both halves are fixed here: build with a >=3.10 interpreter, and
# refuse to reuse an existing venv that is too old.
MEMROOS_MCP_MIN_PY_MINOR=10

python_is_modern() {
  # $1 = python executable. True when it is CPython >= 3.$MEMROOS_MCP_MIN_PY_MINOR.
  [[ -x "$1" ]] || return 1
  "$1" -c "import sys; sys.exit(0 if sys.version_info >= (3, $MEMROOS_MCP_MIN_PY_MINOR) else 1)" 2>/dev/null
}

find_modern_python() {
  # Prefer the newest explicitly-versioned interpreter available, then bare
  # python3 — which is only acceptable if it is itself new enough.
  local candidate
  for candidate in python3.14 python3.13 python3.12 python3.11 python3.10 python3; do
    local resolved
    resolved="$(command -v "$candidate" 2>/dev/null)" || continue
    if python_is_modern "$resolved"; then
      printf '%s' "$resolved"
      return 0
    fi
  done
  return 1
}

PYTHON="${KNOWLEDGE_PYTHON:-}"
if [[ -z "$PYTHON" ]]; then
  if python_is_modern "$MEMROOS_ROOT/.venv/bin/python"; then
    PYTHON="$MEMROOS_ROOT/.venv/bin/python"
  elif python_is_modern "$HOME/github/knowledge/.venv/bin/python"; then
    PYTHON="$HOME/github/knowledge/.venv/bin/python"
  else
    BUILDER_PYTHON="$(find_modern_python)" || {
      echo "Memroos MCP: no Python >=3.$MEMROOS_MCP_MIN_PY_MINOR found on this host; fastmcp cannot be installed. Install a newer Python (e.g. python3.11) and re-run." >&2
      exit 1
    }
    # An existing-but-too-old venv is the oracle-1 failure mode: it must be
    # replaced, not reused, or the version check above loops forever.
    if [[ -e "$MEMROOS_ROOT/.venv" ]]; then
      echo "Memroos MCP: replacing venv at $MEMROOS_ROOT/.venv (Python <3.$MEMROOS_MCP_MIN_PY_MINOR, cannot run fastmcp)." >&2
      rm -rf "$MEMROOS_ROOT/.venv"
    fi
    "$BUILDER_PYTHON" -m venv "$MEMROOS_ROOT/.venv" >&2
    PYTHON="$MEMROOS_ROOT/.venv/bin/python"
  fi
fi

if ! run_with_timeout "$MEMROOS_MCP_DEP_CHECK_TIMEOUT_SEC" "$PYTHON" - <<'PY' >/dev/null 2>&1
try:
    import fastmcp  # noqa: F401
except Exception:
    import mcp.server.fastmcp  # noqa: F401
import httpx  # noqa: F401
import yaml  # noqa: F401
PY
then
  echo "Memroos MCP dependency check failed or timed out after ${MEMROOS_MCP_DEP_CHECK_TIMEOUT_SEC}s; refreshing requirements." >&2
  "$PYTHON" -m pip install -q -r "$MEMROOS_ROOT/services/knowledge-mcp/requirements.txt" >&2
fi

exec "$PYTHON" "$MEMROOS_ROOT/services/knowledge-mcp/knowledge_system/mcp_server.py"
