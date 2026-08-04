#!/usr/bin/env bash
# Shared fail-open helpers for the repo-shipped session hooks.
# Diagnostics go to receipts/stderr; hook stdout is reserved for the brief digest.

set -u

MEMROOS_HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MEMROOS_HOOK_ROOT="${MEMROOS_HOOK_ROOT:-${HOME:-/tmp}/.memroos}"
MEMROOS_HOOK_RECEIPT_DIR="${MEMROOS_HOOK_RECEIPT_DIR:-$MEMROOS_HOOK_ROOT/hook-receipts}"
MEMROOS_HOOK_RECEIPT_FILE="${MEMROOS_HOOK_RECEIPT_FILE:-$MEMROOS_HOOK_RECEIPT_DIR/session-hooks.jsonl}"
MEMROOS_BASE_URL="${MEMROOS_OPERATOR_URL:-${MEMROOS_APP_URL:-http://127.0.0.1:3000}}"

memroos_node() {
  command -v "${MEMROOS_NODE_BIN:-node}" 2>/dev/null || true
}

memroos_now() {
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

memroos_read_event() {
  # Harness hook payloads are bounded so a malformed stdin stream cannot turn
  # the hook into an unbounded reader.
  head -c "${MEMROOS_HOOK_MAX_INPUT_BYTES:-262144}" 2>/dev/null || true
}

memroos_record_receipt() {
  local hook="$1" status="$2" reason="$3" duration_ms="${4:-0}"
  mkdir -p "$MEMROOS_HOOK_RECEIPT_DIR" 2>/dev/null || true
  python3 - "$MEMROOS_HOOK_RECEIPT_FILE" "$hook" "$status" "$reason" "$duration_ms" <<'PY' 2>/dev/null || true
import json
import sys
from datetime import datetime, timezone

path, hook, status, reason, duration_ms = sys.argv[1:]
receipt = {
    "receiptType": f"{hook.replace('-', '_')}_{status}",
    "hook": hook,
    "status": status,
    "reason": reason,
    "durationMs": int(duration_ms) if duration_ms.isdigit() else 0,
    "recordedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
}
with open(path, "a", encoding="utf-8") as fh:
    fh.write(json.dumps(receipt, separators=(",", ":")) + "\n")
PY
}

memroos_post_json() {
  local url="$1" body="$2" max_time="$3"
  local -a headers=(
    -H "Content-Type: application/json"
    -H "Accept: application/json"
  )
  if [[ -n "${MEMROOS_AGENT_API_KEY:-}" ]]; then
    headers+=(-H "Authorization: Bearer ${MEMROOS_AGENT_API_KEY}")
  elif [[ -n "${MEMROOS_OPERATOR_API_KEY:-}" ]]; then
    headers+=(-H "x-memroos-operator-key: ${MEMROOS_OPERATOR_API_KEY}")
  fi
  curl -fsS --connect-timeout 0.75 --max-time "$max_time" \
    "${headers[@]}" -X POST "$url" --data-binary "$body" 2>/dev/null
}

memroos_post_noc_attention() {
  local warning="$1" now body
  [[ -n "${MEMROOS_OPERATOR_API_KEY:-}" ]] || return 0
  now="$(memroos_now)"
  body="$(python3 - "$now" "$warning" <<'PY' 2>/dev/null || true
import json
import sys

now, warning = sys.argv[1:]
print(json.dumps({
    "id": "observe-capture-gate",
    "name": "Session capture gate",
    "sourceFamily": "observe",
    "schedule": "on session stop",
    "expectedIntervalMinutes": 5,
    "lastRunAt": now,
    "lastFailureAt": now,
    "warning": warning[:500],
    "metadata": {"attention": "NOC", "hook": "capture-gate"},
}, separators=(",", ":")))
PY
)"
  [[ -n "$body" ]] || return 0
  curl -fsS --connect-timeout 0.25 --max-time 0.5 \
    -H "Content-Type: application/json" \
    -H "x-memroos-operator-key: ${MEMROOS_OPERATOR_API_KEY}" \
    -X POST "${MEMROOS_BASE_URL%/}/api/cron-health" \
    --data-binary "$body" >/dev/null 2>&1 || true
}
