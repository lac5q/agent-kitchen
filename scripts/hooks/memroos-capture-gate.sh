#!/usr/bin/env bash
# Stop/pre-compact structured capture. Every path is fail-open and exits zero.

set -u
HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=memroos-hook-common.sh
source "$HOOK_DIR/memroos-hook-common.sh"

event="$(memroos_read_event)"
node_bin="$(memroos_node)"
if [[ -z "$node_bin" ]]; then
  memroos_record_receipt "capture-gate" "skip" "node_unavailable" 0
  exit 0
fi

body="$(printf '%s' "$event" | "$node_bin" "$HOOK_DIR/memroos-hook-utils.mjs" capture 2>/dev/null || true)"
if [[ -z "$body" ]]; then
  memroos_record_receipt "capture-gate" "skip" "invalid_hook_payload" 0
  exit 0
fi

skip_reason="$(printf '%s' "$body" | "$node_bin" "$HOOK_DIR/memroos-hook-utils.mjs" skip-reason 2>/dev/null || true)"
if [[ -n "$skip_reason" ]]; then
  memroos_record_receipt "capture-gate" "skip" "$skip_reason" 0
  exit 0
fi

response="$(memroos_post_json "${MEMROOS_BASE_URL%/}/api/agent-memory/capture" "$body" "3.5" || true)"
if [[ -n "$response" ]]; then
  memroos_record_receipt "capture-gate" "captured" "durable_receipt" 3500
  exit 0
fi

# Failure is observable but never propagated to the harness. The operator-key
# path also writes cron health so the existing NOC Attention feed surfaces it.
memroos_record_receipt "capture-gate" "failure" "timeout_or_capture_rejected" 4000
memroos_post_noc_attention "capture-gate failed open: timeout or capture rejected"
exit 0
