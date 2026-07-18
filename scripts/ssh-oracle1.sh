#!/usr/bin/env bash
# SSH to oracle-1 via Tailscale.
#
# Prefers Tailscale SSH (`tailscale ssh opc@oracle-1`) when the host has
# `tailscale set --ssh` enabled. Falls back to classic key + `tailscale nc`.
#
# Env:
#   TAILSCALE_API_KEY  optional; used only to mint an auth key if not joined
#   TAILSCALE_SOCKET   default /var/run/tailscale/tailscaled.sock
#   ORACLE1_USER       default opc
#   ORACLE1_SSH_KEY    classic fallback key (opc private key)
set -euo pipefail

SOCK="${TAILSCALE_SOCKET:-/var/run/tailscale/tailscaled.sock}"
USER_NAME="${ORACLE1_USER:-opc}"
HOST="${ORACLE1_HOST:-oracle-1}"
KEY="${ORACLE1_SSH_KEY:-$HOME/.ssh/oracle1_opc_ed25519}"
TS=(tailscale --socket="$SOCK")
if [[ ! -w "$SOCK" ]] && command -v sudo >/dev/null; then
  TS=(sudo tailscale --socket="$SOCK")
fi

if [[ ! -S "$SOCK" ]]; then
  echo "Tailscale socket missing: $SOCK" >&2
  echo "Start userspace tailscaled and join with TAILSCALE_API_KEY auth-key." >&2
  exit 1
fi

if ! "${TS[@]}" status >/dev/null 2>&1; then
  echo "Not connected to Tailscale. Join first (userspace or TUN)." >&2
  exit 1
fi

# Prefer Tailscale SSH
if "${TS[@]}" ssh "${USER_NAME}@${HOST}" -- true >/dev/null 2>&1; then
  exec "${TS[@]}" ssh "${USER_NAME}@${HOST}" -- "$@"
fi

if [[ ! -f "$KEY" ]]; then
  echo "Tailscale SSH unavailable and classic key missing: $KEY" >&2
  echo "Load opc key from 1Password AgentWritable 'oracle-1 opc SSH private key (2026-07-18)'." >&2
  exit 1
fi

exec ssh -i "$KEY" \
  -o "ProxyCommand=${TS[*]} nc %h %p" \
  -o StrictHostKeyChecking=accept-new \
  -o IdentitiesOnly=yes \
  "${USER_NAME}@${HOST}" \
  "$@"
