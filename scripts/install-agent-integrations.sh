#!/usr/bin/env bash
# MemroOS Agent Integrations Installer
# =====================================
#
# Registers MemroOS as the primary knowledge store on EVERY agent CLI
# found on this machine, in one idempotent pass. This is the single
# install path — there should be no other way to wire MemroOS into
# an agent CLI. If a new agent CLI comes out, add it to this file.
#
# Source of truth:
#   agents/AGENTS_TEMPLATE.md     → AGENTS.md on every agent CLI
#   .agents/skills/memroos-save/  → memroos-save skill on every agent CLI
#   scripts/memroos-mcp.sh        → MemroOS MCP server launcher
#
# Idempotent: re-run safely. Re-converges any drift.
# Works whether the repo lives at:
#   $HOME/github/memroos (canonical)
#   $HOME/memroos (install.sh default)
#   $HOME/agent-kitchen (legacy worktree alias for memroos)
#   anywhere else — pass MEMROOS_ROOT=/path/to/repo
#
# Usage:
#   bash scripts/install-agent-integrations.sh                 # auto-detect
#   bash scripts/install-agent-integrations.sh --local         # force local MCP (solo)
#   bash scripts/install-agent-integrations.sh --uninstall     # remove all
#   bash scripts/install-agent-integrations.sh --check         # dry-run audit
#   MEMROOS_OPERATOR_URL=https://... bash scripts/install-agent-integrations.sh
#   MEMROOS_ROOT=/custom/path bash scripts/install-agent-integrations.sh
#
# ENTOPS-04: when MEMROOS_OPERATOR_URL (or MEMROOS_APP_URL) is set and --local
# is NOT passed, MCP blocks point at scripts/memroos-operator-stub.sh.
# Operator mode NEVER adds a git-clone fallback.

set -euo pipefail

# Resolve repo root (this script lives at <repo>/scripts/install-agent-integrations.sh)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MEMROOS_ROOT="${MEMROOS_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"

if [[ ! -d "$MEMROOS_ROOT/services/knowledge-mcp" ]]; then
  echo "❌ MEMROOS_ROOT does not look like a MemroOS checkout: $MEMROOS_ROOT" >&2
  echo "   Set MEMROOS_ROOT=/path/to/memroos and retry." >&2
  exit 1
fi

TEMPLATE="$MEMROOS_ROOT/agents/AGENTS_TEMPLATE.md"
SKILL_SRC="$MEMROOS_ROOT/.agents/skills/memroos-save/SKILL.md"
MCP_SCRIPT="$MEMROOS_ROOT/scripts/memroos-mcp.sh"
OPERATOR_STUB="$MEMROOS_ROOT/scripts/memroos-operator-stub.sh"

if [[ ! -f "$TEMPLATE" ]]; then
  echo "❌ Canonical AGENTS template not found: $TEMPLATE" >&2
  exit 1
fi
if [[ ! -f "$SKILL_SRC" ]]; then
  echo "❌ Canonical memroos-save skill not found: $SKILL_SRC" >&2
  exit 1
fi
if [[ ! -x "$MCP_SCRIPT" ]]; then
  echo "❌ MemroOS MCP launcher not found or not executable: $MCP_SCRIPT" >&2
  exit 1
fi

HOME_DIR="${HOME:-$(eval echo "~$(whoami)")}"

MODE="install"
FORCE_LOCAL=0
for arg in "$@"; do
  case "$arg" in
    --uninstall) MODE="uninstall" ;;
    --check) MODE="check" ;;
    --local) FORCE_LOCAL=1 ;;
  esac
done

# Operator URL: MEMROOS_OPERATOR_URL preferred; MEMROOS_APP_URL is the alias.
OPERATOR_URL="${MEMROOS_OPERATOR_URL:-${MEMROOS_APP_URL:-}}"
OPERATOR_URL="${OPERATOR_URL%/}"

USE_OPERATOR_STUB=0
if [[ "$FORCE_LOCAL" -eq 1 ]]; then
  USE_OPERATOR_STUB=0
elif [[ -n "$OPERATOR_URL" ]]; then
  USE_OPERATOR_STUB=1
fi

if [[ "$USE_OPERATOR_STUB" -eq 1 ]]; then
  if [[ ! -x "$OPERATOR_STUB" ]]; then
    echo "❌ Operator stub not found or not executable: $OPERATOR_STUB" >&2
    exit 1
  fi
  # printf %q safely embeds the URL for a bash -lc string.
  MCP_EXEC_LINE="export MEMROOS_OPERATOR_URL=$(printf '%q' "$OPERATOR_URL"); exec $(printf '%q' "$OPERATOR_STUB")"
  MCP_MODE_LABEL="operator-stub (${OPERATOR_URL})"
else
  MCP_EXEC_LINE='exec "${MEMROOS_ROOT:-$HOME/github/memroos}/scripts/memroos-mcp.sh"'
  MCP_MODE_LABEL="local (memroos-mcp.sh)"
fi
export MCP_EXEC_LINE

# ENTOPS-04 hard guard: operator mode must never introduce a clone-based corpus fallback.
if [[ "$USE_OPERATOR_STUB" -eq 1 ]]; then
  if grep -En '(^|[[:space:]])git[[:space:]]+clone([[:space:]]|$)' "$OPERATOR_STUB" "$0" 2>/dev/null \
    | grep -Ev '^\s*#' \
    | grep -Ev 'hard guard|never introduce|ENTOPS-04|Refusing|Operator mode MUST|no git' >/dev/null; then
    echo "❌ Refusing operator-stub install: clone-based corpus fallback detected" >&2
    exit 1
  fi
fi

# Operator mode MUST NOT add git-clone fallback (docs/entops-stub-handoff.md).
# Baseline: grep -c "git clone" on this file should stay at documentation mentions only.

# ---- Agent target definitions ----------------------------------------------
#
# Each target is: <name>|<config-file>|<skills-dir>|<mcp-config-section>
# AGENTS.md template is always installed at <config-file>.
# memroos-save skill is installed at <skills-dir>/memroos-save/SKILL.md.
# MemroOS MCP server is registered at <mcp-config-section>.
#
# TOML targets (Claude/Codex/Qwen/Cursor) need a TOML-aware registration.
# YAML targets (Hermes/OpenClaw/etc.) need a YAML-aware registration.
# ZCode uses its own JSON shape under ~/.zcode/cli/config.json.
# Plain markdown targets (AGENTS.md only) just get the file copy.

declare -a TARGETS=(
  # name | AGENTS.md path | skills dir | MCP config style
  "claude|$HOME_DIR/.claude/CLAUDE.md|$HOME_DIR/.claude/skills|yaml"
  "codex|$HOME_DIR/.codex/AGENTS.md|$HOME_DIR/.codex/skills|toml"
  "cursor|$HOME_DIR/.cursorrules|$HOME_DIR/.cursor/skills|cursor-json"
  "gemini|$HOME_DIR/.gemini/GEMINI.md|$HOME_DIR/.gemini/skills|yaml"
  "qwen|$HOME_DIR/.qwen/QWEN.md|$HOME_DIR/.qwen/skills|yaml"
  "zcode|$HOME_DIR/.zcode/AGENTS.md|$HOME_DIR/.zcode/skills|zcode-json"
  "pi|$HOME_DIR/.pi/AGENTS.md|$HOME_DIR/.pi/skills|json"
  "droid|$HOME_DIR/.factory/AGENTS.md|$HOME_DIR/.factory/skills|factory-json"
  "grok|$HOME_DIR/.grok/AGENTS.md|$HOME_DIR/.grok/skills|json"
  "opencode|$HOME_DIR/.config/opencode/instructions.md|$HOME_DIR/.config/opencode/skills|yaml"
  "hermes|$HOME_DIR/.hermes/AGENTS.md|$HOME_DIR/.hermes/skills|yaml"
  # Antigravity: OBSERVE-12. No capture path is verified for this harness
  # (no CLI, no JSONL, no MCP surface we have observed). The TARGETS row
  # below routes its AGENTS.md + skill to a MemRoOS-owned stub directory
  # under ~/.config so it cannot collide with a future Antigravity install
  # and the install run prints a clear honest signal instead of pretending
  # to wire something we have not proven.
  "antigravity|$HOME_DIR/.config/memroos/observe/antigravity/AGENTS.md|$HOME_DIR/.config/memroos/observe/antigravity/skills|none"
)

# OpenClaw workspaces (discovered)
# Layout option 1: ~/.openclaw/workspace/<name>/AGENTS.md
# Layout option 2: ~/.openclaw/workspace-<name>/AGENTS.md (legacy)
OPENCLAW_ROOTS=("$HOME_DIR/.openclaw")
declare -a OPENCLAW_WORKSPACES=()
for d in "${OPENCLAW_ROOTS[@]}"; do
  [[ -d "$d" ]] || continue
  # Layout option 1: workspace/<name>/
  if [[ -d "$d/workspace" ]]; then
    for ws_dir in "$d/workspace"/*/; do
      [[ -d "$ws_dir" ]] || continue
      # Skip nested empty matches (glob returns "/" if no children)
      ws_dir="${ws_dir%/}"
      OPENCLAW_WORKSPACES+=("$ws_dir")
    done
  fi
  # Layout option 2: workspace-<name>/ siblings of workspace/
  for ws_dir in "$d"/workspace-*/; do
    [[ -d "$ws_dir" ]] || continue
    ws_dir="${ws_dir%/}"
    OPENCLAW_WORKSPACES+=("$ws_dir")
  done
  # Layout option 3: bare workspace/ (no children, but with its own AGENTS.md)
  if [[ -f "$d/workspace/AGENTS.md" ]]; then
    OPENCLAW_WORKSPACES+=("$d/workspace")
  fi
done
# Dedupe
if [[ ${#OPENCLAW_WORKSPACES[@]} -gt 0 ]]; then
  printf '%s\n' "${OPENCLAW_WORKSPACES[@]}" | sort -u > /tmp/.memroos-ws-list.$$ 2>/dev/null || true
  OPENCLAW_WORKSPACES=()
  while IFS= read -r ws; do
    [[ -n "$ws" ]] && OPENCLAW_WORKSPACES+=("$ws")
  done < /tmp/.memroos-ws-list.$$
  rm -f /tmp/.memroos-ws-list.$$
fi

if [[ ${#OPENCLAW_WORKSPACES[@]} -gt 0 ]]; then
  for ws_dir in "${OPENCLAW_WORKSPACES[@]}"; do
    # Naming:
    #   ~/.openclaw/workspace/AGENTS.md           → "openclaw"
    #   ~/.openclaw/workspace-<name>/AGENTS.md    → "openclaw-<name>"
    #   ~/.openclaw/workspace/<name>/AGENTS.md    → "openclaw-<name>"
    parent="$(dirname "$ws_dir")"
    base="$(basename "$ws_dir")"
    if [[ "$base" == "workspace" ]]; then
      # Layout option 3: bare workspace/
      name="openclaw"
    elif [[ "$parent" == "$d/workspace" ]]; then
      # Layout option 1: nested under workspace/
      name="openclaw-$base"
    elif [[ "$base" == workspace-* ]]; then
      # Layout option 2: workspace-<name>/ sibling
      name="openclaw-${base#workspace-}"
    else
      name="openclaw-$base"
    fi
    TARGETS+=("$name|$ws_dir/AGENTS.md|$ws_dir/skills|yaml")
  done
fi

# ---- Helpers --------------------------------------------------------------

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log()  { echo -e "${GREEN}✓${NC} $*"; }
warn() { echo -e "${YELLOW}⚠${NC} $*"; }
err()  { echo -e "${RED}✗${NC} $*" >&2; }

upsert_yaml_mcp_block() {
  # Add or update the `memroos:` block under top-level `mcp_servers:`.
  local target_file="$1"
  mkdir -p "$(dirname "$target_file")"
  touch "$target_file"

  if ! grep -q '^mcp_servers:' "$target_file"; then
    cat >> "$target_file" <<'YAML'

mcp_servers:
YAML
  fi

  # Remove existing memroos block (any indentation), then append fresh block
  python3 - "$target_file" <<'PY'
import os, sys, re, json
path = sys.argv[1]
exec_line = os.environ.get("MCP_EXEC_LINE", 'exec "${MEMROOS_ROOT:-$HOME/github/memroos}/scripts/memroos-mcp.sh"')
with open(path) as f:
    text = f.read()
# Drop any memroos block (0+ leading spaces)
text = re.sub(r"^[ \t]*memroos:\n(?:^[ \t]+.*\n?|\n)*", "", text, flags=re.MULTILINE)
# Drop trailing blank lines then ensure single newline
text = text.rstrip() + "\n\n"
block = (
    "memroos:\n"
    "  command: /bin/bash\n"
    "  args:\n"
    "    - -lc\n"
    f"    - {json.dumps(exec_line)}\n"
    "  connect_timeout: 30\n"
    "  timeout: 60\n"
)
with open(path, "w") as f:
    f.write(text + block)
PY
}

upsert_toml_mcp_block() {
  local target_file="$1"
  mkdir -p "$(dirname "$target_file")"
  touch "$target_file"

  python3 - "$target_file" <<'PY'
import os, sys, re
path = sys.argv[1]
exec_line = os.environ.get("MCP_EXEC_LINE", 'exec "${MEMROOS_ROOT:-$HOME/github/memroos}/scripts/memroos-mcp.sh"')
try:
    with open(path) as f:
        text = f.read()
except FileNotFoundError:
    text = ""

# Drop existing [mcp_servers.memroos] section (and any nested [mcp_servers.memroos.*])
text = re.sub(
    r"\[mcp_servers\.memroos(?:\.[^\]]+)?\][^\[]*",
    "",
    text,
    flags=re.DOTALL,
)
text = text.rstrip() + "\n\n"

# TOML string: escape backslashes and quotes for double-quoted value
escaped = exec_line.replace("\\", "\\\\").replace('"', '\\"')
block = f"""[mcp_servers.memroos]
command = "/bin/bash"
args = ["-lc", "{escaped}"]
connect_timeout = 30
timeout = 60
"""
with open(path, "w") as f:
    f.write(text + block)
PY
}

upsert_json_mcp_block() {
  local target_file="$1"
  mkdir -p "$(dirname "$target_file")"
  if [[ ! -f "$target_file" ]]; then
    echo '{}' > "$target_file"
  fi

  python3 - "$target_file" <<'PY'
import os, sys, json
path = sys.argv[1]
exec_line = os.environ.get("MCP_EXEC_LINE", 'exec "${MEMROOS_ROOT:-$HOME/github/memroos}/scripts/memroos-mcp.sh"')
with open(path) as f:
    try:
        data = json.load(f)
    except json.JSONDecodeError:
        data = {}
data.setdefault("mcpServers", {})
data["mcpServers"]["memroos"] = {
    "command": "/bin/bash",
    "args": ["-lc", exec_line],
    "connectTimeout": 30,
    "timeout": 60000,
}
with open(path, "w") as f:
    json.dump(data, f, indent=2)
    f.write("\n")
PY
}

upsert_zcode_mcp_block() {
  local target_file="$1"
  mkdir -p "$(dirname "$target_file")"
  if [[ ! -f "$target_file" ]]; then
    echo '{}' > "$target_file"
  fi

  python3 - "$target_file" <<'PY'
import os, sys, json
path = sys.argv[1]
exec_line = os.environ.get("MCP_EXEC_LINE", 'exec "${MEMROOS_ROOT:-$HOME/github/memroos}/scripts/memroos-mcp.sh"')
with open(path) as f:
    try:
        data = json.load(f)
    except json.JSONDecodeError:
        data = {}
data.setdefault("mcp", {})
data["mcp"].setdefault("servers", {})
data["mcp"]["servers"]["memroos"] = {
    "type": "stdio",
    "command": "/bin/bash",
    "args": ["-lc", exec_line],
    "enabled": True,
    "timeoutMs": 60000,
}
with open(path, "w") as f:
    json.dump(data, f, indent=2)
    f.write("\n")
PY
}

install_agents_md() {
  local target_file="$1"
  mkdir -p "$(dirname "$target_file")"
  cp "$TEMPLATE" "$target_file"
}

install_skill() {
  local skills_dir="$1"
  mkdir -p "$skills_dir/memroos-save"
  cp "$SKILL_SRC" "$skills_dir/memroos-save/SKILL.md"
}

uninstall_agents_md() {
  local target_file="$1"
  [[ -f "$target_file" ]] && rm -f "$target_file"
}

uninstall_skill() {
  local skills_dir="$1"
  rm -rf "$skills_dir/memroos-save"
}

uninstall_yaml_mcp_block() {
  local target_file="$1"
  [[ -f "$target_file" ]] || return 0
  python3 - "$target_file" <<'PY'
import sys, re
path = sys.argv[1]
with open(path) as f:
    text = f.read()
text = re.sub(r"^[ \t]*memroos:\n(?:^[ \t]+.*\n?|\n)*", "", text, flags=re.MULTILINE)
with open(path, "w") as f:
    f.write(text)
PY
}

uninstall_toml_mcp_block() {
  local target_file="$1"
  [[ -f "$target_file" ]] || return 0
  python3 - "$target_file" <<'PY'
import sys, re
path = sys.argv[1]
with open(path) as f:
    text = f.read()
text = re.sub(
    r"\[mcp_servers\.memroos(?:\.[^\]]+)?\][^\[]*",
    "",
    text,
    flags=re.DOTALL,
)
with open(path, "w") as f:
    f.write(text)
PY
}

uninstall_json_mcp_block() {
  local target_file="$1"
  [[ -f "$target_file" ]] || return 0
  python3 - "$target_file" <<'PY'
import sys, json
path = sys.argv[1]
with open(path) as f:
    try:
        data = json.load(f)
    except json.JSONDecodeError:
        sys.exit(0)
data.get("mcpServers", {}).pop("memroos", None)
with open(path, "w") as f:
    json.dump(data, f, indent=2)
    f.write("\n")
PY
}

uninstall_zcode_mcp_block() {
  local target_file="$1"
  [[ -f "$target_file" ]] || return 0
  python3 - "$target_file" <<'PY'
import sys, json
path = sys.argv[1]
with open(path) as f:
    try:
        data = json.load(f)
    except json.JSONDecodeError:
        sys.exit(0)
servers = data.get("mcp", {}).get("servers")
if isinstance(servers, dict):
    servers.pop("memroos", None)
with open(path, "w") as f:
    json.dump(data, f, indent=2)
    f.write("\n")
PY
}

# ---- Main loop ------------------------------------------------------------

echo "MemroOS Agent Integrations Installer"
echo "====================================="
echo "Repo:        $MEMROOS_ROOT"
echo "Template:    $TEMPLATE"
echo "Skill:       $SKILL_SRC"
echo "Mode:        $MODE"
echo "MCP mode:    $MCP_MODE_LABEL"
echo ""

case "$MODE" in
  install)
    echo "Installing MemroOS directives on every detected agent CLI..."
    echo ""
    for target in "${TARGETS[@]}"; do
      IFS='|' read -r name agents_file skills_dir mcp_style <<< "$target"
      case "$mcp_style" in
        none)
          # OBSERVE-12: Antigravity has no installer surface we have verified.
          # Print the honest signal; do not write AGENTS.md/skill for a CLI
          # that does not exist on the host.
          warn "$name: no installer surface; observe via MCP only (verify-by-design)"
          continue
          ;;
        yaml) install_agents_md "$agents_file"; install_skill "$skills_dir"; upsert_yaml_mcp_block "${agents_file%.md}.mcp.yaml" 2>/dev/null || true ;;
        toml) install_agents_md "$agents_file"; install_skill "$skills_dir"; upsert_toml_mcp_block "${agents_file%.md}.mcp.toml" 2>/dev/null || true ;;
        json) install_agents_md "$agents_file"; install_skill "$skills_dir"; upsert_json_mcp_block "${agents_file%.md}.mcp.json" 2>/dev/null || true ;;
        cursor-json) install_agents_md "$agents_file"; install_skill "$skills_dir"; upsert_json_mcp_block "$HOME_DIR/.cursor/mcp.json" 2>/dev/null || true ;;
        zcode-json) install_agents_md "$agents_file"; install_skill "$skills_dir"; upsert_zcode_mcp_block "$HOME_DIR/.zcode/cli/config.json" 2>/dev/null || true ;;
        factory-json) install_agents_md "$agents_file"; install_skill "$skills_dir"; upsert_json_mcp_block "$HOME_DIR/.factory/mcp.json" 2>/dev/null || true ;;
      esac
      log "$name → $agents_file"
    done
    echo ""
    log "All targets converged on canonical AGENTS_TEMPLATE.md + memroos-save skill."
    log "Re-run this script anytime to re-converge. Pass --check to audit, --uninstall to remove."
    ;;

  check)
    echo "Auditing MemroOS directives on every detected agent CLI..."
    echo ""
    missing=0
    for target in "${TARGETS[@]}"; do
      IFS='|' read -r name agents_file skills_dir mcp_style <<< "$target"
      if [[ "$mcp_style" == "none" ]]; then
        warn "$name: no installer surface; verify-by-design (no AGENTS.md/skill expected)"
        continue
      fi
      if [[ ! -f "$agents_file" ]] || ! diff -q "$TEMPLATE" "$agents_file" >/dev/null 2>&1; then
        warn "$name: AGENTS.md missing or drifted ($agents_file)"
        missing=$((missing+1))
      elif [[ ! -f "$skills_dir/memroos-save/SKILL.md" ]] || ! diff -q "$SKILL_SRC" "$skills_dir/memroos-save/SKILL.md" >/dev/null 2>&1; then
        warn "$name: memroos-save skill missing or drifted ($skills_dir/memroos-save/SKILL.md)"
        missing=$((missing+1))
      else
        log "$name: ok"
      fi
    done
    echo ""
    if [[ $missing -gt 0 ]]; then
      err "$missing target(s) drifted. Run install-agent-integrations.sh without --check to re-converge."
      exit 1
    fi
    log "All targets match canonical."
    ;;

  uninstall)
    echo "Removing MemroOS directives from every detected agent CLI..."
    echo ""
    for target in "${TARGETS[@]}"; do
      IFS='|' read -r name agents_file skills_dir mcp_style <<< "$target"
      case "$mcp_style" in
        none)
          warn "$name: no installer surface; nothing to remove"
          continue
          ;;
      esac
      uninstall_agents_md "$agents_file"
      uninstall_skill "$skills_dir"
      case "$mcp_style" in
        yaml) uninstall_yaml_mcp_block "${agents_file%.md}.mcp.yaml" ;;
        toml) uninstall_toml_mcp_block "${agents_file%.md}.mcp.toml" ;;
        json) uninstall_json_mcp_block "${agents_file%.md}.mcp.json" ;;
        cursor-json) uninstall_json_mcp_block "$HOME_DIR/.cursor/mcp.json" ;;
        zcode-json) uninstall_zcode_mcp_block "$HOME_DIR/.zcode/cli/config.json" ;;
        factory-json) uninstall_json_mcp_block "$HOME_DIR/.factory/mcp.json" ;;
      esac
      log "$name: removed"
    done
    echo ""
    log "Uninstall complete."
    ;;
esac

echo ""
echo "Next: run scripts/verify-agent-integrations.sh to verify all agents can load MemroOS."
