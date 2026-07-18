#!/usr/bin/env bash
# SSH to oracle-1 via Tailscale (userspace-safe ProxyCommand).
# Requires: tailscaled running, key at ~/.ssh/oracle1_ed25519 (or ORACLE1_SSH_KEY),
# and pubkey installed on opc@oracle-1 authorized_keys.
set -euo pipefail

HOST="${ORACLE1_HOST:-100.90.196.33}"
USER_NAME="${ORACLE1_USER:-opc}"
KEY="${ORACLE1_SSH_KEY:-$HOME/.ssh/oracle1_ed25519}"
SOCK="${TAILSCALE_SOCKET:-/var/run/tailscale/tailscaled.sock}"

if [[ ! -f "$KEY" ]]; then
  echo "Missing SSH key: $KEY" >&2
  echo "Load from 1Password AgentWritable item 'oracle-1 cursor-cloud SSH private key 2026-07-18'" >&2
  exit 1
fi

if [[ ! -S "$SOCK" ]]; then
  echo "Tailscale socket missing: $SOCK (start userspace tailscaled first)" >&2
  exit 1
fi

exec ssh -i "$KEY" \
  -o ProxyCommand="tailscale --socket=${SOCK} nc %h %p" \
  -o StrictHostKeyChecking=accept-new \
  -o IdentitiesOnly=yes \
  "${USER_NAME}@${HOST}" \
  "$@"
