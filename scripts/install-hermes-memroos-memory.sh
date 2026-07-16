#!/usr/bin/env bash
# Install or check the MemRoOS Hermes memory provider (opt-in dual-mode).
#
# Default Hermes MEMORY.md behavior is unchanged until the user sets:
#   memory.provider: memroos
# in ~/.hermes/config.yaml (or via `hermes memory setup`).
#
# Usage:
#   bash scripts/install-hermes-memroos-memory.sh           # symlink into Hermes
#   bash scripts/install-hermes-memroos-memory.sh --check   # verify link + files
#   bash scripts/install-hermes-memroos-memory.sh --uninstall
#   HERMES_AGENT_ROOT=/path/to/hermes-agent bash scripts/install-hermes-memroos-memory.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MEMROOS_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SRC="$MEMROOS_ROOT/integrations/hermes/plugins/memory/memroos"

MODE="install"
[[ "${1:-}" == "--check" ]] && MODE="check"
[[ "${1:-}" == "--uninstall" ]] && MODE="uninstall"

resolve_hermes_agent_root() {
  if [[ -n "${HERMES_AGENT_ROOT:-}" ]]; then
    echo "$HERMES_AGENT_ROOT"
    return
  fi
  local candidates=(
    "$HOME/github/hermes-agent"
    "$HOME/.hermes/hermes-agent"
    "$HOME/hermes-agent"
  )
  for c in "${candidates[@]}"; do
    if [[ -d "$c/plugins/memory" ]]; then
      echo "$c"
      return
    fi
  done
  return 1
}

if ! HERMES_ROOT="$(resolve_hermes_agent_root)"; then
  echo "❌ Could not find Hermes agent checkout with plugins/memory/." >&2
  echo "   Set HERMES_AGENT_ROOT=/path/to/hermes-agent" >&2
  exit 1
fi

DEST="$HERMES_ROOT/plugins/memory/memroos"

if [[ ! -d "$SRC" ]]; then
  echo "❌ MemRoOS plugin source missing: $SRC" >&2
  exit 1
fi
if [[ ! -f "$SRC/__init__.py" || ! -f "$SRC/plugin.yaml" ]]; then
  echo "❌ MemRoOS plugin incomplete under $SRC" >&2
  exit 1
fi

case "$MODE" in
  check)
    echo "MemRoOS root:  $MEMROOS_ROOT"
    echo "Hermes root:   $HERMES_ROOT"
    echo "Plugin source: $SRC"
    echo "Plugin dest:   $DEST"
    if [[ -L "$DEST" ]]; then
      target="$(readlink "$DEST")"
      echo "Link:          $DEST -> $target"
      if [[ "$(cd "$DEST" && pwd -P)" == "$(cd "$SRC" && pwd -P)" ]]; then
        echo "✅ Symlink OK (points at MemRoOS plugin)"
      else
        echo "⚠️  Symlink exists but does not resolve to MemRoOS source"
        exit 1
      fi
    elif [[ -d "$DEST" ]]; then
      echo "⚠️  Dest is a directory (not symlink). Prefer reinstall to symlink."
      exit 1
    else
      echo "❌ Not installed"
      exit 1
    fi
    if [[ -f "$HOME/.hermes/config.yaml" ]] && grep -qE 'provider:\s*memroos' "$HOME/.hermes/config.yaml" 2>/dev/null; then
      echo "Config:        memory.provider=memroos (opt-in ACTIVE)"
    else
      echo "Config:        memory.provider not memroos (built-in MEMORY.md only — safe default)"
    fi
    ;;
  uninstall)
    if [[ -L "$DEST" || -d "$DEST" ]]; then
      rm -rf "$DEST"
      echo "✅ Removed $DEST"
    else
      echo "Nothing to remove at $DEST"
    fi
    echo "Note: leave memory.provider unset or run: hermes memory off"
    ;;
  install)
    mkdir -p "$(dirname "$DEST")"
    if [[ -e "$DEST" && ! -L "$DEST" ]]; then
      echo "❌ Refusing to overwrite non-symlink directory: $DEST" >&2
      exit 1
    fi
    ln -sfn "$SRC" "$DEST"
    echo "✅ Linked MemRoOS Hermes memory plugin:"
    echo "   $DEST -> $SRC"
    echo
    echo "Default remains built-in MEMORY.md only."
    echo "To test dual-mode observe mirror locally:"
    echo "  1. export MEMROOS_AGENT_API_KEY=...   # or MEMROOS_OPERATOR_API_KEY"
    echo "  2. export MEMROOS_HERMES_DRY_RUN=1    # optional: receipts only, no HTTP"
    echo "  3. Write ~/.hermes/memroos-memory.json with mode=observe + operator_url"
    echo "  4. hermes config set memory.provider memroos   # or hermes memory setup"
    echo "  5. Use Hermes normally; check \$HERMES_HOME/memroos-memory/observe-receipts.jsonl"
    echo "  6. hermes memory off   # return to built-in-only"
    ;;
esac
