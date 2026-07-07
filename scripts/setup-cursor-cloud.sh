#!/usr/bin/env bash
# Cursor Cloud bootstrap for lac5q/memroos development.
#
# Use this as the Cursor Cloud environment install script (see .cursor/environment.json):
#   bash scripts/setup-cursor-cloud.sh
#
# It intentionally avoids ./setup.sh because that path starts local services and
# expects Docker/Qdrant checks that are not required for cloud code work.
set -euo pipefail

MODE="setup"
if [[ "${1:-}" == "--maintenance" ]]; then
  MODE="maintenance"
elif [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  cat <<'HELP'
Cursor Cloud setup for MemRoOS

Usage:
  bash scripts/setup-cursor-cloud.sh
  bash scripts/setup-cursor-cloud.sh --maintenance

Environment knobs:
  CURSOR_CLOUD_INSTALL_NODE_DEPS=0        Skip npm ci
  CURSOR_CLOUD_INSTALL_MCP_DEPS=0         Skip Python MCP dependency install
  CURSOR_CLOUD_INSTALL_GSD=0              Skip GSD Cursor skill install
  CURSOR_CLOUD_GSD_VERSION=latest         GSD npm version/spec to install
  CURSOR_CLOUD_GSD_PROFILE=full           GSD skill profile: core, standard, full
  CURSOR_CLOUD_INSTALL_PROJECT_SKILLS=0   Skip MemRoOS cloud skills copy
  CURSOR_CLOUD_INSTALL_AGENT_INTEGRATIONS=0 Skip install-agent-integrations.sh
  CURSOR_CLOUD_INSTALL_QWEN=0             Skip Qwen executor CLI install
  CURSOR_CLOUD_QWEN_VERSION=latest        Qwen CLI npm version/spec to install
  CURSOR_CLOUD_QWEN_SMOKE=0               Run a live Qwen smoke check after install
  QWEN_MODEL=qwen3.7-plus                 Qwen model used by qwen-agent
  MEMROOS_ROOT=/path/to/memroos           Override repo root
  KNOWLEDGE_ROOT=/path/to/brain           Override skill/wiki root
  DASHSCOPE_API_KEY=...                   Qwen executor API key for agent phase
  MEM0_URL=https://...                    Optional live main-brain mem0 URL
  MEMROOS_APP_URL=https://...             Optional live MemRoOS app URL
  MEMROOS_AGENT_API_KEY=...               Optional scoped dev agent key
HELP
  exit 0
elif [[ -n "${1:-}" ]]; then
  echo "Unknown option: $1" >&2
  exit 2
fi

ROOT="${MEMROOS_ROOT:-$(pwd)}"
ROOT="$(cd "$ROOT" && pwd)"

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

export CURSOR_CONFIG_DIR="${CURSOR_CONFIG_DIR:-$HOME/.cursor}"
CURSOR_SKILLS_DIR="$CURSOR_CONFIG_DIR/skills"

mkdir -p "$CURSOR_CONFIG_DIR" "$CURSOR_SKILLS_DIR" "$HOME/.memroos/skills" "$HOME/.local/bin"

BASHRC="$HOME/.bashrc"
touch "$BASHRC"

if ! grep -q "BEGIN MemRoOS Cursor Cloud" "$BASHRC"; then
  cat >>"$BASHRC" <<EOF

# BEGIN MemRoOS Cursor Cloud
export CURSOR_CONFIG_DIR="${CURSOR_CONFIG_DIR}"
export MEMROOS_ROOT="${ROOT}"
export KNOWLEDGE_ROOT="\${KNOWLEDGE_ROOT:-${ROOT}}"
export MEMROOS_AGENT_ID="\${MEMROOS_AGENT_ID:-cursor-cloud-memroos}"
export START_SERVICES="\${START_SERVICES:-0}"
export INSTALL_MEMORY_RESILIENCE="\${INSTALL_MEMORY_RESILIENCE:-0}"
export INSTALL_MEMORY_SERVICE_DEPS="\${INSTALL_MEMORY_SERVICE_DEPS:-0}"
export SKIP_QDRANT_CHECK="\${SKIP_QDRANT_CHECK:-1}"
# END MemRoOS Cursor Cloud
EOF
fi

if ! grep -q "BEGIN MemRoOS Cursor Cloud Paths" "$BASHRC"; then
  cat >>"$BASHRC" <<'EOF'

# BEGIN MemRoOS Cursor Cloud Paths
export PATH="$HOME/.local/bin:${CURSOR_CONFIG_DIR:-$HOME/.cursor}/qwen-node/node_modules/.bin:$PATH"
# END MemRoOS Cursor Cloud Paths
EOF
fi

export MEMROOS_ROOT="$ROOT"
export KNOWLEDGE_ROOT="${KNOWLEDGE_ROOT:-$ROOT}"
export MEMROOS_AGENT_ID="${MEMROOS_AGENT_ID:-cursor-cloud-memroos}"
export PATH="$HOME/.local/bin:$CURSOR_CONFIG_DIR/qwen-node/node_modules/.bin:$PATH"

if [[ "${CURSOR_CLOUD_INSTALL_NODE_DEPS:-1}" == "1" ]]; then
  echo "Installing Node dependencies with npm ci..."
  npm ci --prefix "$ROOT" --no-audit --prefer-offline
else
  echo "Skipping Node dependency install."
fi

if [[ "${CURSOR_CLOUD_INSTALL_MCP_DEPS:-1}" == "1" ]]; then
  echo "Installing MemRoOS MCP Python dependencies..."
  "$PYTHON_BIN" -m venv "$ROOT/.venv"
  "$ROOT/.venv/bin/python" -m pip install -q --upgrade pip
  "$ROOT/.venv/bin/python" -m pip install -q -r "$ROOT/services/knowledge-mcp/requirements.txt"
else
  echo "Skipping MemRoOS MCP Python dependency install."
fi

if [[ "${CURSOR_CLOUD_INSTALL_GSD:-1}" == "1" ]]; then
  GSD_VERSION="${CURSOR_CLOUD_GSD_VERSION:-latest}"
  GSD_PROFILE="${CURSOR_CLOUD_GSD_PROFILE:-full}"
  echo "Installing GSD Cursor skills (${GSD_VERSION}, profile=${GSD_PROFILE})..."
  GSD_PORTABLE_HOOKS=1 npx --yes "get-shit-done-cc@${GSD_VERSION}" --cursor --global --profile="${GSD_PROFILE}" --portable-hooks

  if [[ ! -f "$CURSOR_SKILLS_DIR/gsd-help/SKILL.md" || ! -f "$CURSOR_CONFIG_DIR/get-shit-done/VERSION" ]]; then
    echo "GSD Cursor skill install did not produce expected files under CURSOR_CONFIG_DIR=$CURSOR_CONFIG_DIR" >&2
    exit 1
  fi
else
  echo "Skipping GSD Cursor skill install."
fi

if [[ "${CURSOR_CLOUD_INSTALL_PROJECT_SKILLS:-1}" == "1" && -d "$ROOT/docs/codex-cloud/skills" ]]; then
  echo "Installing MemRoOS Cursor Cloud skills..."
  cp -R "$ROOT/docs/codex-cloud/skills/." "$CURSOR_SKILLS_DIR/"
fi

if [[ "${CURSOR_CLOUD_INSTALL_AGENT_INTEGRATIONS:-1}" == "1" ]]; then
  if [[ -f "$ROOT/.agents/skills/memroos-save/SKILL.md" ]]; then
    echo "Installing MemRoOS agent integrations (cursor target)..."
    bash "$ROOT/scripts/install-agent-integrations.sh"
  else
    echo "Skipping install-agent-integrations.sh: .agents/skills/memroos-save/SKILL.md not present in this checkout."
  fi
fi

if [[ "${CURSOR_CLOUD_INSTALL_QWEN:-1}" == "1" ]]; then
  QWEN_VERSION="${CURSOR_CLOUD_QWEN_VERSION:-latest}"
  QWEN_PREFIX="${CURSOR_CLOUD_QWEN_PREFIX:-$CURSOR_CONFIG_DIR/qwen-node}"

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
Set it as a Cursor Cloud environment variable available during agent tasks,
or store {"env":{"DASHSCOPE_API_KEY":"..."}} in ~/.qwen/settings.json.
ERR
  exit 2
fi

qwen_bin="${QWEN_CLI_BIN:-qwen}"
if ! command -v "$qwen_bin" >/dev/null 2>&1; then
  echo "qwen CLI is not on PATH. Re-run scripts/setup-cursor-cloud.sh." >&2
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

  if [[ "${CURSOR_CLOUD_QWEN_SMOKE:-0}" == "1" ]]; then
    echo "Running live Qwen smoke check..."
    "$HOME/.local/bin/qwen-agent" --dangerously-skip-permissions -p "Reply with exactly: QWEN OK"
  else
    echo "Skipping live Qwen smoke check. Set CURSOR_CLOUD_QWEN_SMOKE=1 after DASHSCOPE_API_KEY is configured."
  fi
else
  echo "Skipping Qwen executor CLI install."
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

installed_skill_count="$(find "$CURSOR_SKILLS_DIR" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l | tr -d ' ')"

echo "Cursor Cloud MemRoOS setup complete ($MODE)."
echo "MemRoOS root: $MEMROOS_ROOT"
echo "Knowledge root: $KNOWLEDGE_ROOT"
echo "Agent id: $MEMROOS_AGENT_ID"
echo "Cursor skills installed: ${installed_skill_count:-0} under $CURSOR_SKILLS_DIR"
