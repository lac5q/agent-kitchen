#!/usr/bin/env bash
# Codex Cloud bootstrap for lac5q/memroos development.
#
# Use this as the Codex Cloud environment setup script:
#   bash scripts/setup-codex-cloud.sh
#
# It intentionally avoids ./setup.sh because that path starts local services and
# expects Docker/Qdrant checks that are not required for cloud code work.
set -euo pipefail

MODE="setup"
if [[ "${1:-}" == "--maintenance" ]]; then
  MODE="maintenance"
elif [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  cat <<'HELP'
Codex Cloud setup for MemRoOS

Usage:
  bash scripts/setup-codex-cloud.sh
  bash scripts/setup-codex-cloud.sh --maintenance

Environment knobs:
  CODEX_CLOUD_INSTALL_NODE_DEPS=0  Skip npm ci
  CODEX_CLOUD_INSTALL_MCP_DEPS=0   Skip Python MCP dependency install
  CODEX_CLOUD_INSTALL_GSD=0        Skip GSD Codex skill install
  CODEX_CLOUD_GSD_VERSION=latest   GSD npm version/spec to install
  CODEX_CLOUD_GSD_PROFILE=standard GSD skill profile: core, standard, full
  CODEX_CLOUD_INSTALL_QWEN=0       Skip Qwen executor CLI install
  CODEX_CLOUD_QWEN_VERSION=latest  Qwen CLI npm version/spec to install
  CODEX_CLOUD_QWEN_SMOKE=1         Run a live Qwen smoke check after install
  QWEN_MODEL=qwen3.7-plus          Qwen model used by qwen-agent
  MEMROOS_ROOT=/path/to/memroos    Override repo root
  KNOWLEDGE_ROOT=/path/to/brain    Override skill/wiki root
  DASHSCOPE_API_KEY=...            Qwen executor API key for agent phase
  MEM0_URL=https://...             Optional live main-brain mem0 URL
  MEMROOS_APP_URL=https://...      Optional live MemRoOS app URL
  MEMROOS_OPERATOR_URL=https://... Alias for MEMROOS_APP_URL (ENTOPS-04)
  MEMROOS_AGENT_API_KEY=...        Optional scoped dev agent key
HELP
  exit 0
elif [[ -n "${1:-}" ]]; then
  echo "Unknown option: $1" >&2
  exit 2
fi

ROOT="${MEMROOS_ROOT:-$(pwd)}"
ROOT="$(cd "$ROOT" && pwd)"

# ENTOPS-04: MEMROOS_OPERATOR_URL aliases MEMROOS_APP_URL when the latter is unset.
if [[ -n "${MEMROOS_OPERATOR_URL:-}" && -z "${MEMROOS_APP_URL:-}" ]]; then
  export MEMROOS_APP_URL="$MEMROOS_OPERATOR_URL"
fi
if [[ -n "${MEMROOS_APP_URL:-}" && -z "${MEMROOS_OPERATOR_URL:-}" ]]; then
  export MEMROOS_OPERATOR_URL="$MEMROOS_APP_URL"
fi

if [[ ! -f "$ROOT/package.json" || ! -d "$ROOT/services/knowledge-mcp" ]]; then
  echo "MEMROOS_ROOT does not look like the MemRoOS repo: $ROOT" >&2
  exit 1
fi

PYTHON_BIN="${PYTHON:-}"
if [[ -z "$PYTHON_BIN" ]]; then
  for candidate in python3.11 python3.10 python3; do
    if command -v "$candidate" >/dev/null 2>&1; then
      PYTHON_BIN="$candidate"
      break
    fi
  done
fi

if [[ -z "$PYTHON_BIN" ]]; then
  echo "Python 3.10+ is required for the MemRoOS MCP brain." >&2
  exit 1
fi

export CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"

mkdir -p "$CODEX_HOME" "$HOME/.memroos/skills"

BASHRC="$HOME/.bashrc"
touch "$BASHRC"

if ! grep -q "BEGIN MemRoOS Codex Cloud" "$BASHRC"; then
  cat >>"$BASHRC" <<EOF

# BEGIN MemRoOS Codex Cloud
export CODEX_HOME="${CODEX_HOME}"
export MEMROOS_ROOT="${ROOT}"
export KNOWLEDGE_ROOT="\${KNOWLEDGE_ROOT:-${ROOT}}"
export MEMROOS_AGENT_ID="\${MEMROOS_AGENT_ID:-codex-cloud-dev}"
export START_SERVICES="\${START_SERVICES:-0}"
export INSTALL_MEMORY_RESILIENCE="\${INSTALL_MEMORY_RESILIENCE:-0}"
export INSTALL_MEMORY_SERVICE_DEPS="\${INSTALL_MEMORY_SERVICE_DEPS:-0}"
export SKIP_QDRANT_CHECK="\${SKIP_QDRANT_CHECK:-1}"
# END MemRoOS Codex Cloud
EOF
fi

if ! grep -q "BEGIN MemRoOS Codex Cloud Paths" "$BASHRC"; then
  cat >>"$BASHRC" <<'EOF'

# BEGIN MemRoOS Codex Cloud Paths
export PATH="$HOME/.local/bin:${CODEX_HOME:-$HOME/.codex}/qwen-node/node_modules/.bin:$PATH"
# END MemRoOS Codex Cloud Paths
EOF
fi

if ! grep -q "BEGIN MemRoOS Codex Cloud Secrets" "$BASHRC"; then
  cat >>"$BASHRC" <<'EOF'

# BEGIN MemRoOS Codex Cloud Secrets
if [[ -f "$HOME/.op/service_account_token" ]]; then
  op_service_account_token="$(tr -d '\r\n' < "$HOME/.op/service_account_token")"
  if [[ -n "$op_service_account_token" && ( -z ${OP_SERVICE_ACCOUNT_TOKEN:-} || ${#OP_SERVICE_ACCOUNT_TOKEN} -lt 80 ) ]]; then
    export OP_SERVICE_ACCOUNT_TOKEN="$op_service_account_token"
  fi
  unset op_service_account_token
fi
# END MemRoOS Codex Cloud Secrets
EOF
fi

export MEMROOS_ROOT="$ROOT"
export KNOWLEDGE_ROOT="${KNOWLEDGE_ROOT:-$ROOT}"
export MEMROOS_AGENT_ID="${MEMROOS_AGENT_ID:-codex-cloud-dev}"
export PATH="$HOME/.local/bin:$CODEX_HOME/qwen-node/node_modules/.bin:$PATH"

if [[ -f "$HOME/.op/service_account_token" ]]; then
  op_service_account_token="$(tr -d '\r\n' < "$HOME/.op/service_account_token")"
  if [[ -n "$op_service_account_token" && ( -z "${OP_SERVICE_ACCOUNT_TOKEN:-}" || ${#OP_SERVICE_ACCOUNT_TOKEN} -lt 80 ) ]]; then
    export OP_SERVICE_ACCOUNT_TOKEN="$op_service_account_token"
  fi
  unset op_service_account_token
fi

if [[ "${CODEX_CLOUD_INSTALL_NODE_DEPS:-1}" == "1" ]]; then
  echo "Installing Node dependencies with npm ci..."
  npm ci --prefix "$ROOT" --no-audit --prefer-offline
else
  echo "Skipping Node dependency install."
fi

if [[ "${CODEX_CLOUD_INSTALL_MCP_DEPS:-1}" == "1" ]]; then
  echo "Installing MemRoOS MCP Python dependencies..."
  "$PYTHON_BIN" -m venv "$ROOT/.venv"
  "$ROOT/.venv/bin/python" -m pip install -q --upgrade pip
  "$ROOT/.venv/bin/python" -m pip install -q -r "$ROOT/services/knowledge-mcp/requirements.txt"
else
  echo "Skipping MemRoOS MCP Python dependency install."
fi

if [[ "${CODEX_CLOUD_INSTALL_GSD:-1}" == "1" ]]; then
  GSD_VERSION="${CODEX_CLOUD_GSD_VERSION:-latest}"
  GSD_PROFILE="${CODEX_CLOUD_GSD_PROFILE:-standard}"
  echo "Installing GSD Codex skills (${GSD_VERSION}, profile=${GSD_PROFILE})..."
  GSD_PORTABLE_HOOKS=1 npx --yes "get-shit-done-cc@${GSD_VERSION}" --codex --global --profile="${GSD_PROFILE}" --portable-hooks

  if [[ ! -f "$CODEX_HOME/skills/gsd-help/SKILL.md" || ! -f "$CODEX_HOME/get-shit-done/VERSION" ]]; then
    echo "GSD Codex skill install did not produce expected files under CODEX_HOME=$CODEX_HOME" >&2
    exit 1
  fi
else
  echo "Skipping GSD Codex skill install."
fi

if [[ "${CODEX_CLOUD_INSTALL_PROJECT_SKILLS:-1}" == "1" && -d "$ROOT/docs/codex-cloud/skills" ]]; then
  echo "Installing MemRoOS Codex Cloud skills..."
  mkdir -p "$CODEX_HOME/skills"
  cp -R "$ROOT/docs/codex-cloud/skills/." "$CODEX_HOME/skills/"
fi

if [[ "${CODEX_CLOUD_INSTALL_QWEN:-1}" == "1" ]]; then
  QWEN_VERSION="${CODEX_CLOUD_QWEN_VERSION:-latest}"
  QWEN_PREFIX="${CODEX_CLOUD_QWEN_PREFIX:-$CODEX_HOME/qwen-node}"

  if ! command -v npm >/dev/null 2>&1; then
    echo "npm is required to install the Qwen executor CLI." >&2
    exit 1
  fi

  echo "Installing Qwen executor CLI (${QWEN_VERSION})..."
  mkdir -p "$QWEN_PREFIX" "$HOME/.local/bin" "$HOME/.qwen"
  npm install --prefix "$QWEN_PREFIX" --no-audit --prefer-offline "@qwen-code/qwen-code@${QWEN_VERSION}"
  ln -sf "$QWEN_PREFIX/node_modules/.bin/qwen" "$HOME/.local/bin/qwen"

  cat >"$HOME/.local/bin/qwen-agent" <<'QWEN_AGENT'
#!/usr/bin/env bash
set -euo pipefail

qwen_settings="${HOME}/.qwen/settings.json"

if [[ -z "${DASHSCOPE_API_KEY:-}" && -n "${QWEN_AUTH_TOKEN:-}" ]]; then
  export DASHSCOPE_API_KEY="$QWEN_AUTH_TOKEN"
fi

if [[ -z "${DASHSCOPE_API_KEY:-}" && -f "$qwen_settings" ]]; then
  settings_key="$(node -e '
const fs = require("fs");
const path = process.argv[1];
try {
  const settings = JSON.parse(fs.readFileSync(path, "utf8"));
  process.stdout.write(settings.env?.DASHSCOPE_API_KEY || settings.DASHSCOPE_API_KEY || "");
} catch {}
' "$qwen_settings")"
  if [[ -n "$settings_key" ]]; then
    export DASHSCOPE_API_KEY="$settings_key"
  fi
fi

if [[ -z "${DASHSCOPE_API_KEY:-}" ]]; then
  cat >&2 <<'ERR'
DASHSCOPE_API_KEY is required for qwen-agent.
Set it as a Codex Cloud environment variable available during agent tasks,
or store {"env":{"DASHSCOPE_API_KEY":"..."}} in ~/.qwen/settings.json.
ERR
  exit 2
fi

qwen_bin="${QWEN_CLI_BIN:-qwen}"
if ! command -v "$qwen_bin" >/dev/null 2>&1; then
  echo "qwen CLI is not on PATH. Re-run scripts/setup-codex-cloud.sh." >&2
  exit 1
fi

args=()
approval_seen=0
auth_seen=0
model_seen=0

while (($#)); do
  case "$1" in
    --dangerously-skip-permissions|--yolo|-y)
      args+=(--approval-mode yolo)
      approval_seen=1
      shift
      ;;
    --approval-mode|--auth-type|--model|-m)
      flag="$1"
      args+=("$flag")
      case "$flag" in
        --approval-mode) approval_seen=1 ;;
        --auth-type) auth_seen=1 ;;
        --model|-m) model_seen=1 ;;
      esac
      shift
      if (($#)); then
        args+=("$1")
        shift
      fi
      ;;
    --effort|--reasoning-effort|--session-persistence|--sessionPersistence)
      shift
      if (($#)) && [[ "$1" != --* ]]; then
        shift
      fi
      ;;
    --no-session-persistence|--no-sessionPersistence)
      shift
      ;;
    *)
      args+=("$1")
      shift
      ;;
  esac
done

if [[ "$approval_seen" == "0" ]]; then
  args=(--approval-mode "${QWEN_APPROVAL_MODE:-auto}" "${args[@]}")
fi

if [[ "$auth_seen" == "0" ]]; then
  args=(--auth-type "${QWEN_AUTH_TYPE:-openai}" "${args[@]}")
fi

if [[ "$model_seen" == "0" ]]; then
  args=(--model "${QWEN_MODEL:-qwen3.7-plus}" "${args[@]}")
fi

export QWEN_CODE_SUPPRESS_YOLO_WARNING=1

exec "$qwen_bin" \
  --openai-base-url "${QWEN_OPENAI_BASE_URL:-https://dashscope-intl.aliyuncs.com/compatible-mode/v1}" \
  --openai-api-key "$DASHSCOPE_API_KEY" \
  "${args[@]}"
QWEN_AGENT
  chmod +x "$HOME/.local/bin/qwen-agent"

  "$HOME/.local/bin/qwen" --version >/dev/null

  if [[ "${CODEX_CLOUD_QWEN_SMOKE:-0}" == "1" ]]; then
    echo "Running live Qwen smoke check..."
    "$HOME/.local/bin/qwen-agent" --dangerously-skip-permissions -p "Reply with exactly: QWEN OK"
  else
    echo "Skipping live Qwen smoke check. Set CODEX_CLOUD_QWEN_SMOKE=1 after DASHSCOPE_API_KEY is configured."
  fi
else
  echo "Skipping Qwen executor CLI install."
fi

CODEX_CONFIG="$CODEX_HOME/config.toml"
touch "$CODEX_CONFIG"

if ! grep -q '^\[mcp_servers\.memroos\]' "$CODEX_CONFIG"; then
  cat >>"$CODEX_CONFIG" <<'TOML'

# MemRoOS main-brain MCP for lac5q/memroos development.
[mcp_servers.memroos]
command = "/bin/bash"
args = ["-lc", 'export MEMROOS_MCP_CLIENT="${MEMROOS_MCP_CLIENT:-codex}"; export MEMROOS_REQUIRE_SERVER_MEMORY="${MEMROOS_REQUIRE_SERVER_MEMORY:-1}"; exec "${MEMROOS_ROOT:-$PWD}/scripts/memroos-mcp.sh"']
startup_timeout_sec = 120.0
env_vars = [
  "MEMROOS_ROOT",
  "KNOWLEDGE_ROOT",
  "MEM0_URL",
  "MEMROOS_APP_URL",
  "MEMROOS_OPERATOR_URL",
  "MEMROOS_BASE_URL",
  "MEMROOS_MCP_CLIENT",
  "MEMROOS_REQUIRE_SERVER_MEMORY",
  "MEMROOS_AGENT_KEY_FILE",
  "MEMROOS_AGENT_KEYS_DIR",
  "MEMROOS_AGENT_ID",
  "MEMROOS_AGENT_API_KEY"
]

[mcp_servers.memroos.tools.agent_context_ack]
approval_mode = "approve"

[mcp_servers.memroos.tools.agent_context_inbox]
approval_mode = "approve"

[mcp_servers.memroos.tools.agent_context_reply]
approval_mode = "approve"

[mcp_servers.memroos.tools.agent_context_send]
approval_mode = "approve"

[mcp_servers.memroos.tools.agent_memory_save]
approval_mode = "approve"

[mcp_servers.memroos.tools.agent_tool_outcome_record]
approval_mode = "approve"
TOML
fi

if [[ -x "$ROOT/.venv/bin/python" ]]; then
  PYTHONWARNINGS=ignore "$ROOT/.venv/bin/python" - <<'PY'
import importlib.util
import httpx  # noqa: F401
import yaml  # noqa: F401

if importlib.util.find_spec("fastmcp") is None and importlib.util.find_spec("mcp.server.fastmcp") is None:
    raise SystemExit("fastmcp or mcp.server.fastmcp is required")
PY
fi

# 1Password CLI for scoped secrets access (no-ops unless the environment sets
# OP_SERVICE_ACCOUNT_TOKEN; see scripts/setup-1password-cli.sh).
if [[ "${CODEX_CLOUD_INSTALL_OP:-1}" != "0" && -f "$ROOT/scripts/setup-1password-cli.sh" ]]; then
  bash "$ROOT/scripts/setup-1password-cli.sh" || echo "1Password CLI setup failed (non-fatal)." >&2
fi

echo "Codex Cloud MemRoOS setup complete ($MODE)."
echo "MemRoOS root: $MEMROOS_ROOT"
echo "Knowledge root: $KNOWLEDGE_ROOT"
echo "Agent id: $MEMROOS_AGENT_ID"
