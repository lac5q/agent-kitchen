#!/usr/bin/env bash
# Install the 1Password CLI (op) for cloud agent sessions.
#
# Intended to run from cloud environment setup scripts (Cursor Cloud, Codex
# Cloud, Claude Code Remote). Secrets access uses a 1Password *service
# account*: create one scoped read-only to a dedicated infra vault, then set
# OP_SERVICE_ACCOUNT_TOKEN in the cloud environment's env settings. With that
# token present, any session can run e.g.
#   op read 'op://<vault>/<item>/<field>'
# non-interactively — no connector, no OAuth, no human in the loop.
#
# Behavior:
#   - OP_SERVICE_ACCOUNT_TOKEN unset and OP_CLI_INSTALL_FORCE!=1 -> no-op exit 0
#     (keeps setup fast for environments that don't use secrets).
#   - Installs to ~/.local/bin without sudo; honors OP_CLI_VERSION.
#   - Verifies with `op whoami` when a token is present; warns (not fails) if
#     1password.com is unreachable, since restricted network policies may
#     block it — the CLI is still installed for environments that allow it.

set -euo pipefail

log() { echo "[setup-1password-cli] $*"; }

if [ -z "${OP_SERVICE_ACCOUNT_TOKEN:-}" ] && [ "${OP_CLI_INSTALL_FORCE:-0}" != "1" ]; then
  log "OP_SERVICE_ACCOUNT_TOKEN not set; skipping op CLI install (set OP_CLI_INSTALL_FORCE=1 to install anyway)."
  exit 0
fi

if command -v op >/dev/null 2>&1; then
  log "op already installed: $(op --version)"
else
  version="${OP_CLI_VERSION:-2.31.1}"
  case "$(uname -m)" in
    x86_64) arch="amd64" ;;
    aarch64 | arm64) arch="arm64" ;;
    *)
      log "Unsupported architecture: $(uname -m)" >&2
      exit 1
      ;;
  esac

  url="https://cache.agilebits.com/dist/1P/op2/pkg/v${version}/op_linux_${arch}_v${version}.zip"
  tmpdir="$(mktemp -d)"
  trap 'rm -rf "$tmpdir"' EXIT

  log "Downloading op v${version} (${arch})..."
  if ! curl -fsSL "$url" -o "$tmpdir/op.zip"; then
    log "Download failed (network policy may block cache.agilebits.com); op CLI not installed." >&2
    exit 1
  fi

  if command -v unzip >/dev/null 2>&1; then
    unzip -oq "$tmpdir/op.zip" -d "$tmpdir"
  else
    python3 -m zipfile -e "$tmpdir/op.zip" "$tmpdir"
  fi

  install_dir="${OP_CLI_INSTALL_DIR:-$HOME/.local/bin}"
  mkdir -p "$install_dir"
  install -m 755 "$tmpdir/op" "$install_dir/op"
  log "Installed op to $install_dir/op ($("$install_dir/op" --version))"

  case ":$PATH:" in
    *":$install_dir:"*) ;;
    *) log "NOTE: add $install_dir to PATH for later steps." ;;
  esac
  export PATH="$install_dir:$PATH"
fi

if [ -n "${OP_SERVICE_ACCOUNT_TOKEN:-}" ]; then
  if op whoami >/dev/null 2>&1; then
    log "Service account verified: $(op whoami --format=json 2>/dev/null | tr -d '\n' | cut -c1-120)"
  else
    log "WARNING: op installed but 'op whoami' failed — check the token and whether this environment's network policy allows 1password.com." >&2
  fi
fi
