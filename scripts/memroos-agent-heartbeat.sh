#!/usr/bin/env bash
# Send a heartbeat for every host-local agent that has an API key.
#
# Why: registering an agent creates a row, but the UI's liveness column reads
# `last_heartbeat_at`. Without something reporting on a schedule, every agent
# shows "liveness: never / last heartbeat: never" forever — accurate, and
# useless. scripts/sync-host-agents.sh records a first heartbeat at onboarding;
# this keeps them live afterwards.
#
# Local by design: agents on this host talk to this host's MemRoOS over
# 127.0.0.1. No tunnel, no Tailscale, nothing leaves the machine. The keys
# never appear in a process list — each is read from its 600 file and piped to
# curl via a config file on stdin.
#
# Install (idempotent):
#   bash scripts/memroos-agent-heartbeat.sh --install-cron
#
# Run once:
#   bash scripts/memroos-agent-heartbeat.sh

set -euo pipefail

MEMROOS_URL="${MEMROOS_URL:-http://127.0.0.1:${MEMROOS_PORT:-3000}}"
KEYS_DIR="${HOME}/.memroos/agent-keys"
SCRIPT_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"

if [ "${1:-}" = "--install-cron" ]; then
  # Every 5 minutes. The liveness classifier treats a heartbeat older than a
  # few minutes as stale, so a slower cadence would flap between live/stale.
  LINE="*/5 * * * * MEMROOS_URL=${MEMROOS_URL} ${SCRIPT_PATH} >/dev/null 2>&1"
  if crontab -l 2>/dev/null | grep -Fq "$SCRIPT_PATH"; then
    echo "[heartbeat] cron entry already present"
  else
    (crontab -l 2>/dev/null || true; echo "$LINE") | crontab -
    echo "[heartbeat] installed: $LINE"
  fi
  exit 0
fi

if [ ! -d "$KEYS_DIR" ]; then
  echo "[heartbeat] no keys at $KEYS_DIR — run scripts/sync-host-agents.sh first" >&2
  exit 1
fi

sent=0
failed=0
for keyfile in "$KEYS_DIR"/*.key; do
  [ -e "$keyfile" ] || continue
  agent_id=$(basename "$keyfile" .key)
  key=$(cat "$keyfile")

  # -K - reads the auth header from stdin so the key never lands in argv.
  code=$(printf 'header = "Authorization: Bearer %s"\n' "$key" | \
    curl -sS -o /dev/null -w '%{http_code}' -K - \
      -X POST "${MEMROOS_URL}/api/heartbeat" \
      -H 'Content-Type: application/json' \
      --max-time 15 \
      -d "{\"agentId\":\"${agent_id}\",\"status\":\"idle\"}" 2>/dev/null || echo "000")

  if [ "$code" = "200" ]; then
    sent=$((sent + 1))
  else
    failed=$((failed + 1))
    echo "[heartbeat] ${agent_id}: HTTP ${code}" >&2
  fi
done

echo "[heartbeat] sent=${sent} failed=${failed} target=${MEMROOS_URL}"
[ "$failed" -eq 0 ]
