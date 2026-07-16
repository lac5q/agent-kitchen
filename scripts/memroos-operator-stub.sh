#!/usr/bin/env bash
# MemRoOS operator-stub MCP launcher (ENTOPS-04)
# ================================================
#
# Used when MEMROOS_OPERATOR_URL (or MEMROOS_APP_URL) is set.
# Points agent CLIs at the hosted operator instead of a local
# knowledge-mcp process. Does NOT fall back to cloning the corpus.
#
# Stdio MCP transport: proxies JSON-RPC lines to the operator
# HTTP MCP facade when available; otherwise fails closed with a
# clear stderr message (honest degrade — no corpus pull).
#
# Env:
#   MEMROOS_OPERATOR_URL / MEMROOS_APP_URL  Required operator base URL
#   MEMROOS_AGENT_API_KEY                   Optional bearer for authenticated calls
#
set -euo pipefail

OPERATOR_URL="${MEMROOS_OPERATOR_URL:-${MEMROOS_APP_URL:-}}"
OPERATOR_URL="${OPERATOR_URL%/}"

if [[ -z "$OPERATOR_URL" ]]; then
  echo "memroos-operator-stub: MEMROOS_OPERATOR_URL (or MEMROOS_APP_URL) is not set" >&2
  echo "  Solo/local mode: use scripts/memroos-mcp.sh or re-run installer with --local" >&2
  exit 1
fi

# Soft reachability probe (non-fatal for long-lived stdio; fatal if probe hard-fails DNS).
PROBE_URL="${OPERATOR_URL}/api/health"
if command -v curl >/dev/null 2>&1; then
  if ! curl -sSf -m 5 -o /dev/null "$PROBE_URL" 2>/dev/null; then
    # Health may 404 on some deploys — try root.
    if ! curl -sS -m 5 -o /dev/null -w "" "$OPERATOR_URL/" 2>/dev/null; then
      echo "memroos-operator-stub: operator unreachable at ${OPERATOR_URL}" >&2
      echo "  Degrading honestly — no corpus-pull fallback in operator mode." >&2
      exit 1
    fi
  fi
fi

AUTH_HEADER=()
if [[ -n "${MEMROOS_AGENT_API_KEY:-}" ]]; then
  AUTH_HEADER=(-H "Authorization: Bearer ${MEMROOS_AGENT_API_KEY}")
fi

MCP_URL="${OPERATOR_URL}/api/mcp"
echo "memroos-operator-stub: proxying stdio → ${MCP_URL}" >&2

# Line-oriented JSON-RPC proxy: each stdin line POSTed to operator MCP HTTP facade.
# If the operator has no HTTP MCP yet, respond with an MCP error so the client
# sees a clear failure instead of hanging or cloning knowledge.
while IFS= read -r line || [[ -n "$line" ]]; do
  [[ -z "$line" ]] && continue
  if ! command -v curl >/dev/null 2>&1; then
    printf '%s\n' '{"jsonrpc":"2.0","id":null,"error":{"code":-32000,"message":"curl required for operator-stub"}}'
    continue
  fi
  response="$(
    curl -sS -m 60 \
      -H "Content-Type: application/json" \
      "${AUTH_HEADER[@]}" \
      -d "$line" \
      "$MCP_URL" 2>/dev/null || true
  )"
  if [[ -z "$response" ]]; then
    printf '%s\n' '{"jsonrpc":"2.0","id":null,"error":{"code":-32000,"message":"operator MCP unreachable (no git fallback)"}}'
  else
    printf '%s\n' "$response"
  fi
done
