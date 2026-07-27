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
# MCP wiring: each TARGETS row declares the REAL config file the agent
# CLI reads (e.g. ~/.claude/settings.json, ~/.codex/config.toml). The
# script upserts the memroos block into that file directly. Earlier
# versions of this script wrote to synthetic ${agents_file%.md}.mcp.*
# sibling files that no CLI actually read; those siblings (and any
# matching uninstall logic) are now obsolete and are removed on install
# by the cleanup step at the end of the install loop.
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

# ENTOPS-13 (2026-07-22): extra skills to fan out alongside memroos-save.
# Format: "name|source-dir" (space-separated pairs). Source-dir must contain
# SKILL.md at the top level. Installed to <skills-dir>/<name>/SKILL.md on
# every target that has a skills dir (skip the `none` Antigravity row).
# Use case: upstream skill integration (e.g. petergyang/no-ai-slop) that the
# operator wants shipped to every agent CLI without forking the canonical repo.
# Examples:
#   EXTRA_SKILLS="no-ai-slop|$HOME_DIR/github/no-ai-slop" bash scripts/install-agent-integrations.sh
EXTRA_SKILLS="${EXTRA_SKILLS:-}"

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
  # name | AGENTS.md path | skills dir | real MCP file | real MCP format
  #
  # REAL MCP FILE: the file the agent CLI actually reads for MCP config
  # (not a synthetic AGENTS.mcp.* sibling that no CLI implements).
  # REAL MCP FORMAT: json (mcpServers in JSON), toml ([mcp_servers.*] in TOML),
  # yaml (mcp_servers: in YAML), or none (no verified MCP surface).
  #
  # This 5th column replaces the old mcp_style / "${agents_file%.md}.mcp.yaml"
  # convention, which created sibling files nothing read and accumulated
  # broken YAML/TOML across every install run.
  "claude|$HOME_DIR/.claude/CLAUDE.md|$HOME_DIR/.claude/skills|$HOME_DIR/.claude/settings.json|json"
  "codex|$HOME_DIR/.codex/AGENTS.md|$HOME_DIR/.codex/skills|$HOME_DIR/.codex/config.toml|toml"
  "cursor|$HOME_DIR/.cursorrules|$HOME_DIR/.cursor/skills|$HOME_DIR/.cursor/mcp.json|json"
  "gemini|$HOME_DIR/.gemini/GEMINI.md|$HOME_DIR/.gemini/skills|$HOME_DIR/.gemini/settings.json|json"
  "qwen|$HOME_DIR/.qwen/QWEN.md|$HOME_DIR/.qwen/skills|$HOME_DIR/.qwen/settings.json|json"
  "zcode|$HOME_DIR/.zcode/AGENTS.md|$HOME_DIR/.zcode/skills|$HOME_DIR/.zcode/cli/config.json|zcode-json"
  "pi|$HOME_DIR/.pi/AGENTS.md|$HOME_DIR/.pi/skills|$HOME_DIR/.pi/AGENTS.mcp.json|json"
  "droid|$HOME_DIR/.factory/AGENTS.md|$HOME_DIR/.factory/skills|$HOME_DIR/.factory/mcp.json|json"
  # GROK: no confirmed MCP file path yet (the @xai/grok CLI does not publish
  # an MCP config location we've verified). We still write AGENTS.md + skill
  # so direct user edits pick up MemRoOS conventions; MCP wiring is skipped
  # (mcp_file empty, format none) and we print an honest signal.
  "grok|$HOME_DIR/.grok/AGENTS.md|$HOME_DIR/.grok/skills||none"
  "opencode|$HOME_DIR/.config/opencode/instructions.md|$HOME_DIR/.config/opencode/skills|$HOME_DIR/.config/opencode/opencode.json|json"
  # Cline: VS Code extension (saoudrizwan.claude-dev) reads project-level .clinerules;
  # we also seed ~/.cline/AGENTS.md as a MemRoOS-owned home so the canonical template
  # is reachable from any Cline workspace without colliding with user-authored rules.
  # MCP file path differs between macOS and Linux.
  "cline|$HOME_DIR/.cline/AGENTS.md|$HOME_DIR/.cline/skills|__cline_mcp__|json"
  "hermes|$HOME_DIR/.hermes/AGENTS.md|$HOME_DIR/.hermes/skills|$HOME_DIR/.hermes/config.yaml|yaml"
  # Antigravity: OBSERVE-12. No capture path is verified for this harness
  # (no CLI, no JSONL, no MCP surface we have observed). The TARGETS row
  # below routes its AGENTS.md + skill to a MemRoOS-owned stub directory
  # under ~/.config so it cannot collide with a future Antigravity install
  # and the install run prints a clear honest signal instead of pretending
  # to wire something we have not proven.
  "antigravity|$HOME_DIR/.config/memroos/observe/antigravity/AGENTS.md|$HOME_DIR/.config/memroos/observe/antigravity/skills||none"
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
    # OpenClaw workspaces: AGENTS.md + skill only. MCP config for OpenClaw
    # goes through the central OpenClaw mcpServers (managed by OpenClaw itself,
    # not by this script). 4 trailing fields = no real MCP file.
    TARGETS+=("$name|$ws_dir/AGENTS.md|$ws_dir/skills||none")
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

# Resolve a TARGETS-row mcp_file token. "__cline_mcp__" is a placeholder
# because the Cline MCP settings file lives at a different path on macOS
# vs. Linux. Any other value is taken literally.
resolve_mcp_file() {
  local token="$1"
  if [[ "$token" == "__cline_mcp__" ]]; then
    if [[ "$(uname -s)" == "Darwin" ]]; then
      echo "$HOME_DIR/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json"
    else
      echo "$HOME_DIR/.config/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json"
    fi
  else
    echo "$token"
  fi
}

# Upsert the memroos entry into the real MCP config file, dispatching on format.
# No-op if mcp_file is empty (target has no verified MCP surface, e.g. grok).
upsert_mcp_for_target() {
  local mcp_file="$1" mcp_format="$2"
  if [[ -z "$mcp_file" ]]; then
    return 0
  fi
  case "$mcp_format" in
    json)     upsert_json_mcp_block "$mcp_file" ;;
    toml)     upsert_toml_mcp_block "$mcp_file" ;;
    yaml)     upsert_yaml_mcp_block "$mcp_file" ;;
    zcode-json) upsert_zcode_mcp_block "$mcp_file" ;;
    none|"")  return 0 ;;
    *)        err "unknown mcp_format: $mcp_format"; return 1 ;;
  esac
}

# Verify the real MCP config file has a memroos entry under the right key.
# Returns 0 if present (and parseable), 1 if missing/broken.
mcp_file_has_memroos() {
  local mcp_file="$1" mcp_format="$2"
  if [[ -z "$mcp_file" ]]; then
    return 0  # no MCP file expected, consider it "ok"
  fi
  case "$mcp_format" in
    json|zcode-json)
      python3 - "$mcp_file" <<'PY'
import json, sys
try:
    with open(sys.argv[1]) as f:
        data = json.load(f)
except (FileNotFoundError, json.JSONDecodeError):
    raise SystemExit(1)
# Cursor / Claude / Gemini / Qwen / Pi / Factory / Cline all use mcpServers.
# Zcode uses mcp.servers; OpenCode uses mcp; both are still JSON files.
servers = data.get("mcpServers") or {}
if not isinstance(servers.get("memroos"), dict):
    # Try zcode shape: mcp.servers
    servers = data.get("mcp", {}).get("servers", {}) if isinstance(data.get("mcp"), dict) else {}
raise SystemExit(0 if isinstance(servers.get("memroos"), dict) else 1)
PY
      ;;
    toml)
      python3 - "$mcp_file" <<'PY'
import tomllib, sys
try:
    with open(sys.argv[1], 'rb') as f:
        data = tomllib.load(f)
except (FileNotFoundError, Exception):
    raise SystemExit(1)
servers = data.get("mcp_servers", {}) if isinstance(data.get("mcp_servers"), dict) else {}
raise SystemExit(0 if isinstance(servers.get("memroos"), dict) else 1)
PY
      ;;
    yaml)
      python3 - "$mcp_file" <<'PY'
import yaml, sys
try:
    with open(sys.argv[1]) as f:
        data = yaml.safe_load(f) or {}
except (FileNotFoundError, Exception):
    raise SystemExit(1)
# memroos may be correctly nested under mcp_servers, OR incorrectly
# present as an orphan top-level key (the old broken state). Accept
# both so the check doesn't lie about a working install.
servers = data.get("mcp_servers", {}) if isinstance(data.get("mcp_servers"), dict) else {}
if isinstance(servers.get("memroos"), dict):
    raise SystemExit(0)
if isinstance(data.get("memroos"), dict):
    raise SystemExit(0)
raise SystemExit(1)
PY
      ;;
    none|"") return 0 ;;
    *) return 1 ;;
  esac
}

upsert_yaml_mcp_block() {
  # Add or update the `memroos:` block under top-level `mcp_servers:`.
  # Idempotent: parse with PyYAML, set mcp_servers.memroos, dump back.
  # This avoids the line-walker pitfalls (duplicated mcp_servers: keys,
  # wrong indent on re-write, single-quote vs double-quote churn) and
  # preserves all sibling content exactly.
  local target_file="$1"
  mkdir -p "$(dirname "$target_file")"
  touch "$target_file"

  python3 - "$target_file" <<'PY'
import os, sys
path = sys.argv[1]
exec_line = os.environ.get("MCP_EXEC_LINE", 'exec "${MEMROOS_ROOT:-$HOME/github/memroos}/scripts/memroos-mcp.sh"')

try:
    import yaml
except ImportError:
    print(f"WARN: PyYAML not installed; skipping YAML upsert for {path}", file=sys.stderr)
    raise SystemExit(0)

try:
    with open(path) as f:
        text = f.read()
    if text.strip():
        data = yaml.safe_load(text) or {}
    else:
        data = {}
except (FileNotFoundError, yaml.YAMLError) as e:
    print(f"WARN: could not parse {path}: {e}; aborting upsert to avoid clobbering", file=sys.stderr)
    raise SystemExit(1)

if not isinstance(data, dict):
    print(f"WARN: {path} top-level is not a mapping; aborting upsert", file=sys.stderr)
    raise SystemExit(1)

# If a previous broken install left an orphan top-level `memroos:` key,
# migrate it into mcp_servers.memroos before we touch anything else.
if 'memroos' in data and 'mcp_servers' not in data:
    data['mcp_servers'] = {'memroos': data.pop('memroos')}
elif 'memroos' in data and isinstance(data.get('mcp_servers'), dict):
    # Orphan `memroos:` sibling of `mcp_servers:` — drop the orphan, prefer
    # the nested one if it exists.
    if 'memroos' not in data['mcp_servers']:
        data['mcp_servers']['memroos'] = data.pop('memroos')
    else:
        del data['memroos']

servers = data.setdefault('mcp_servers', {})
if not isinstance(servers, dict):
    print(f"WARN: {path} has mcp_servers that is not a mapping; aborting", file=sys.stderr)
    raise SystemExit(1)

servers['memroos'] = {
    'command': '/bin/bash',
    'args': ['-lc', exec_line],
    'connect_timeout': 30,
    'timeout': 60,
}

# Use default_flow_style=False + sort_keys=False to preserve key order and
# use block style. width=160 keeps long values on one line.
class _IndentDumper(yaml.SafeDumper):
    def increase_indent(self, flow=False, indentless=False):
        return super().increase_indent(flow, False)

with open(path, 'w') as f:
    yaml.dump(data, f, Dumper=_IndentDumper, default_flow_style=False, sort_keys=False, width=160)
PY
}

upsert_toml_mcp_block() {
  # Add or update the `[mcp_servers.memroos]` table. Idempotent: parse
  # with tomllib, set mcp_servers.memroos, preserve all other tables
  # (e.g. `[mcp_servers.memroos.tools.X]`), dump back with tomli_w.
  # Earlier versions used a regex to strip+re-append, which lost nested
  # tables and accumulated duplicate `args = [...]` lines on repeated runs.
  local target_file="$1"
  mkdir -p "$(dirname "$target_file")"
  touch "$target_file"

  python3 - "$target_file" <<'PY'
import os, sys
path = sys.argv[1]
exec_line = os.environ.get("MCP_EXEC_LINE", 'exec "${MEMROOS_ROOT:-$HOME/github/memroos}/scripts/memroos-mcp.sh"')

try:
    import tomllib
    import tomli_w
except ImportError as e:
    print(f"WARN: tomllib/tomli_w missing ({e}); skipping TOML upsert for {path}", file=sys.stderr)
    raise SystemExit(0)

try:
    with open(path, 'rb') as f:
        data = tomllib.load(f)
except (FileNotFoundError, tomllib.TOMLDecodeError) as e:
    print(f"WARN: could not parse {path}: {e}; aborting upsert to avoid clobbering", file=sys.stderr)
    raise SystemExit(1)

# Strip any orphan top-level `memroos` table from previous broken runs
# (mirrors the YAML migration path).
data.pop('memroos', None)

servers = data.setdefault('mcp_servers', {})
if not isinstance(servers, dict):
    print(f"WARN: {path} has mcp_servers that is not a table; aborting", file=sys.stderr)
    raise SystemExit(1)

# Preserve nested tables (e.g. tools.X) that the user configured; only
# replace the top-level command/args/timeouts.
existing = servers.get('memroos')
nested = {}
if isinstance(existing, dict):
    nested = {k: v for k, v in existing.items() if k not in {'command', 'args', 'startup_timeout_sec', 'connect_timeout', 'timeout'}}

servers['memroos'] = {
    'command': '/bin/bash',
    'args': ['-lc', exec_line],
    'startup_timeout_sec': 120.0,
    'connect_timeout': 30,
    'timeout': 60,
    **nested,
}

with open(path, 'wb') as f:
    tomli_w.dump(data, f)
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
  # ENTOPS-13: also install any EXTRA_SKILLS (name|source-dir pairs).
  if [[ -n "$EXTRA_SKILLS" ]]; then
    local pair name src
    for pair in $EXTRA_SKILLS; do
      name="${pair%%|*}"
      src="${pair#*|}"
      if [[ -f "$src/SKILL.md" ]]; then
        mkdir -p "$skills_dir/$name"
        cp "$src/SKILL.md" "$skills_dir/$name/SKILL.md"
        echo "  + $name skill installed to $skills_dir/$name/"
      else
        warn "$name: SKILL.md not found at $src/SKILL.md, skipping"
      fi
    done
  fi
}

uninstall_agents_md() {
  local target_file="$1"
  [[ -f "$target_file" ]] && rm -f "$target_file"
}

uninstall_skill() {
  local skills_dir="$1"
  rm -rf "$skills_dir/memroos-save"
  # ENTOPS-13: also remove any EXTRA_SKILLS that were installed.
  if [[ -n "$EXTRA_SKILLS" ]]; then
    local pair name
    for pair in $EXTRA_SKILLS; do
      name="${pair%%|*}"
      rm -rf "$skills_dir/$name"
    done
  fi
}

uninstall_yaml_mcp_block() {
  # Remove the `memroos:` block from the real MCP config (either under
  # `mcp_servers:` or as an orphan sibling). Idempotent: parse with
  # PyYAML, drop the key, dump back. Preserves all other content.
  local target_file="$1"
  [[ -f "$target_file" ]] || return 0
  python3 - "$target_file" <<'PY'
import sys
path = sys.argv[1]
try:
    import yaml
except ImportError:
    sys.exit(0)
try:
    with open(path) as f:
        text = f.read()
    if not text.strip():
        sys.exit(0)
    data = yaml.safe_load(text) or {}
except (yaml.YAMLError, OSError):
    sys.exit(0)

if not isinstance(data, dict):
    sys.exit(0)

# Strip both nesting locations.
data.pop('memroos', None)
if isinstance(data.get('mcp_servers'), dict):
    data['mcp_servers'].pop('memroos', None)
    if not data['mcp_servers']:
        # Don't leave an empty `mcp_servers:` key — remove it entirely.
        data.pop('mcp_servers', None)

with open(path, 'w') as f:
    yaml.safe_dump(data, f, default_flow_style=False, sort_keys=False, width=160)
PY
}

uninstall_toml_mcp_block() {
  # Remove the `[mcp_servers.memroos]` table from the real MCP config.
  # Idempotent: parse with tomllib, drop the table, preserve any nested
  # `tools.X` subtables (we only remove the parent), dump back. The
  # previous regex-based version left orphan body lines behind when the
  # table body contained `[` characters (e.g. `args = ["-lc", ...]`).
  local target_file="$1"
  [[ -f "$target_file" ]] || return 0
  python3 - "$target_file" <<'PY'
import sys
path = sys.argv[1]
try:
    import tomllib
    import tomli_w
except ImportError:
    sys.exit(0)
try:
    with open(path, 'rb') as f:
        data = tomllib.load(f)
except (tomllib.TOMLDecodeError, OSError):
    sys.exit(0)

# Drop the orphan top-level `memroos` table from broken installs.
data.pop('memroos', None)

if isinstance(data.get('mcp_servers'), dict):
    data['mcp_servers'].pop('memroos', None)
    if not data['mcp_servers']:
        data.pop('mcp_servers', None)

with open(path, 'wb') as f:
    tomli_w.dump(data, f)
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
      IFS='|' read -r name agents_file skills_dir mcp_file mcp_format <<< "$target"
      install_agents_md "$agents_file"
      install_skill "$skills_dir"
      mcp_file_resolved="$(resolve_mcp_file "$mcp_file")"
      if [[ -n "$mcp_file_resolved" ]]; then
        if ! upsert_mcp_for_target "$mcp_file_resolved" "$mcp_format"; then
          warn "$name: failed to write MCP config to $mcp_file_resolved"
        fi
      else
        # No real MCP file for this target (grok, antigravity). Print the
        # honest signal so a future operator knows the gap is by design.
        warn "$name: no verified MCP config surface; AGENTS.md + skill only"
      fi
      log "$name → $agents_file"
    done
    echo ""
    log "All targets converged on canonical AGENTS_TEMPLATE.md + memroos-save skill."
    log "Re-run this script anytime to re-converge. Pass --check to audit, --uninstall to remove."

    # Clean up legacy AGENTS.mcp.* sibling files that earlier versions of
    # this script wrote to but no agent CLI actually reads. They contained
    # broken YAML (orphan memroos: keys) and malformed TOML (15x duplicated
    # args = [...] lines). Leaving them on disk does no harm but is
    # confusing for anyone reading those files by hand. Idempotent.
    legacy_siblings=(
      "$HOME_DIR/.claude/CLAUDE.mcp.yaml"
      "$HOME_DIR/.codex/AGENTS.mcp.toml"
      "$HOME_DIR/.gemini/GEMINI.mcp.yaml"
      "$HOME_DIR/.qwen/QWEN.mcp.yaml"
      "$HOME_DIR/.hermes/AGENTS.mcp.yaml"
      "$HOME_DIR/.hermes/AGENTS.mcp.toml"
      "$HOME_DIR/.grok/AGENTS.mcp.json"
      "$HOME_DIR/.config/opencode/instructions.mcp.yaml"
    )
    removed_legacy=0
    for f in "${legacy_siblings[@]}"; do
      if [[ -f "$f" ]]; then
        rm -f "$f"
        removed_legacy=$((removed_legacy + 1))
      fi
    done
    if [[ $removed_legacy -gt 0 ]]; then
      log "Removed $removed_legacy legacy AGENTS.mcp.* sibling file(s) no agent reads."
    fi
    ;;

  check)
    echo "Auditing MemroOS directives on every detected agent CLI..."
    echo ""
    missing=0
    for target in "${TARGETS[@]}"; do
      IFS='|' read -r name agents_file skills_dir mcp_file mcp_format <<< "$target"
      mcp_file_resolved="$(resolve_mcp_file "$mcp_file")"
      mcp_ok=1
      if [[ -n "$mcp_file_resolved" ]]; then
        if mcp_file_has_memroos "$mcp_file_resolved" "$mcp_format"; then
          mcp_ok=1
        else
          mcp_ok=0
        fi
      else
        # No real MCP file expected (grok, antigravity). This is verify-by-
        # design, not a drift. Skip the MCP check for these targets.
        mcp_ok=1
      fi
      if [[ ! -f "$agents_file" ]] || ! diff -q "$TEMPLATE" "$agents_file" >/dev/null 2>&1; then
        warn "$name: AGENTS.md missing or drifted ($agents_file)"
        missing=$((missing+1))
      elif [[ ! -f "$skills_dir/memroos-save/SKILL.md" ]] || ! diff -q "$SKILL_SRC" "$skills_dir/memroos-save/SKILL.md" >/dev/null 2>&1; then
        warn "$name: memroos-save skill missing or drifted ($skills_dir/memroos-save/SKILL.md)"
        missing=$((missing+1))
      elif [[ $mcp_ok -eq 0 ]]; then
        warn "$name: MemroOS MCP entry missing or unparseable in $mcp_file_resolved"
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
      IFS='|' read -r name agents_file skills_dir mcp_file mcp_format <<< "$target"
      uninstall_agents_md "$agents_file"
      uninstall_skill "$skills_dir"
      mcp_file_resolved="$(resolve_mcp_file "$mcp_file")"
      if [[ -n "$mcp_file_resolved" ]]; then
        case "$mcp_format" in
          json)     uninstall_json_mcp_block "$mcp_file_resolved" ;;
          toml)     uninstall_toml_mcp_block "$mcp_file_resolved" ;;
          yaml)     uninstall_yaml_mcp_block "$mcp_file_resolved" ;;
          zcode-json) uninstall_zcode_mcp_block "$mcp_file_resolved" ;;
          none|"")  ;;
        esac
      fi
      log "$name: removed"
    done
    echo ""
    log "Uninstall complete."
    ;;
esac

echo ""
echo "Next: run scripts/verify-agent-integrations.sh to verify all agents can load MemroOS."
