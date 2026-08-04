#!/usr/bin/env bash
# Session-start prior-work pointer. It always exits zero: a memory miss or
# timeout must never block the harness session.

set -u
HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=memroos-hook-common.sh
source "$HOOK_DIR/memroos-hook-common.sh"

event="$(memroos_read_event)"
node_bin="$(memroos_node)"
if [[ -z "$node_bin" ]]; then
  memroos_record_receipt "memory-brief" "miss" "node_unavailable" 0
  exit 0
fi

request_body="$(printf '%s' "$event" | "$node_bin" "$HOOK_DIR/memroos-hook-utils.mjs" brief 2>/dev/null || true)"
if [[ -z "$request_body" ]]; then
  memroos_record_receipt "memory-brief" "miss" "invalid_hook_payload" 0
  exit 0
fi

response="$(memroos_post_json "${MEMROOS_BASE_URL%/}/api/memory/prior-work" "$request_body" "1.5" || true)"
if [[ -z "$response" ]]; then
  memroos_record_receipt "memory-brief" "miss" "timeout_or_unavailable" 1500
  exit 0
fi

digest="$(printf '%s' "$response" | "$node_bin" "$HOOK_DIR/memroos-hook-utils.mjs" digest 2>/dev/null || true)"
if [[ -n "$digest" ]]; then
  # stdout is the harness injection channel; no diagnostics are written here.
  printf '%s\n' "$digest"
  memroos_record_receipt "memory-brief" "hit" "pointer_digest" 0
else
  memroos_record_receipt "memory-brief" "miss" "invalid_probe_response" 0
fi
exit 0
