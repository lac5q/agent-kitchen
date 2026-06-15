#!/usr/bin/env bash
# verify-agent-bus.sh — Verify MemroOS agent-context bus readiness.
# Checks: app health, required DB schemas, and at least one registered agent with an API key.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
MEMROOS_PORT="${MEMROOS_PORT:-3000}"
MEMROOS_URL="http://localhost:${MEMROOS_PORT}"
DB_PATH_RAW="${SQLITE_DB_PATH:-data/memroos.db}"
if [[ "${DB_PATH_RAW}" = /* ]]; then DB_PATH="${DB_PATH_RAW}"; else DB_PATH="${REPO_ROOT}/${DB_PATH_RAW}"; fi
KEYS_DIR="${MEMROOS_AGENT_KEYS_DIR:-${HOME}/.memroos/agent-keys}"
RUN_API_SMOKE="${RUN_API_SMOKE:-1}"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
pass_count=0
fail_count=0
pass() { pass_count=$((pass_count + 1)); echo -e "  ${GREEN}✓${NC} $*"; }
fail() { fail_count=$((fail_count + 1)); echo -e "  ${RED}✗${NC} $*"; }
info() { echo -e "  ${BLUE}ℹ${NC} $*"; }
warn() { echo -e "  ${YELLOW}⚠${NC} $*"; }

health_ok() {
  curl -sf "${MEMROOS_URL}/health" -o /tmp/memroos-agent-bus-health.json --max-time 5 2>/dev/null \
    || curl -sf "${MEMROOS_URL}/api/health" -o /tmp/memroos-agent-bus-health.json --max-time 5 2>/dev/null
}

has_table() {
  sqlite3 "${DB_PATH}" "SELECT 1 FROM sqlite_master WHERE type='table' AND name='$1';" 2>/dev/null | grep -q 1
}

has_column() {
  sqlite3 "${DB_PATH}" "PRAGMA table_info($1);" 2>/dev/null | awk -F'|' '{print $2}' | grep -qx "$2"
}

echo ""
echo -e "${BLUE}MemroOS Agent Bus — Readiness Check${NC}"
echo "========================================"
echo ""

# 1. App running
echo "1. MemroOS App Status"
if health_ok; then
  pass "App is responding on port ${MEMROOS_PORT} (/health or /api/health)"
  if command -v jq >/dev/null 2>&1; then
    ts="$(jq -r '.timestamp // "unknown"' /tmp/memroos-agent-bus-health.json 2>/dev/null || echo unknown)"
    info "Health timestamp: ${ts}"
  fi
else
  fail "App is not responding on port ${MEMROOS_PORT}"
  info "Start it with: bash scripts/start-memroos-agent-bus.sh"
fi
rm -f /tmp/memroos-agent-bus-health.json

echo ""

# 2. DB tables and expected schema
echo "2. Database Schema"
if [[ ! -f "${DB_PATH}" ]]; then
  fail "Database file not found: ${DB_PATH}"
elif [[ ! -s "${DB_PATH}" ]]; then
  fail "Database file is empty: ${DB_PATH}"
else
  db_size="$(du -h "${DB_PATH}" | cut -f1)"
  info "Database: ${DB_PATH} (${db_size})"

  for table in registered_agents agent_api_keys agent_context_messages; do
    if has_table "${table}"; then
      pass "Table exists: ${table}"
    else
      fail "Missing table: ${table}"
    fi
  done

  if has_table registered_agents; then
    has_column registered_agents id && pass "registered_agents.id column present" || fail "registered_agents.id column missing"
    has_column registered_agents platform && pass "registered_agents.platform column present" || fail "registered_agents.platform column missing"
    has_column registered_agents protocol && pass "registered_agents.protocol column present" || fail "registered_agents.protocol column missing"
  fi

  if has_table agent_api_keys; then
    has_column agent_api_keys agent_id && pass "agent_api_keys.agent_id column present" || fail "agent_api_keys.agent_id column missing"
    has_column agent_api_keys key_prefix && pass "agent_api_keys.key_prefix column present" || fail "agent_api_keys.key_prefix column missing"
    has_column agent_api_keys key_hash && pass "agent_api_keys.key_hash column present" || fail "agent_api_keys.key_hash column missing"
  fi

  if has_table agent_context_messages; then
    has_column agent_context_messages from_agent && pass "agent_context_messages.from_agent column present" || fail "agent_context_messages.from_agent column missing"
    has_column agent_context_messages to_agent && pass "agent_context_messages.to_agent column present" || fail "agent_context_messages.to_agent column missing"
    has_column agent_context_messages message_type && pass "agent_context_messages.message_type column present" || fail "agent_context_messages.message_type column missing"
    has_column agent_context_messages status && pass "agent_context_messages.status column present" || fail "agent_context_messages.status column missing"
  fi
fi

echo ""

# 3. Agent registration and API keys
echo "3. Agent Registration"
if [[ -f "${DB_PATH}" && -s "${DB_PATH}" ]] && has_table registered_agents && has_table agent_api_keys; then
  agent_count="$(sqlite3 "${DB_PATH}" "SELECT COUNT(*) FROM registered_agents WHERE deregistered_at IS NULL;" 2>/dev/null || echo 0)"
  key_count="$(sqlite3 "${DB_PATH}" "SELECT COUNT(*) FROM agent_api_keys WHERE revoked_at IS NULL;" 2>/dev/null || echo 0)"
  joined_count="$(sqlite3 "${DB_PATH}" "SELECT COUNT(DISTINCT a.id) FROM registered_agents a JOIN agent_api_keys k ON k.agent_id = a.id WHERE a.deregistered_at IS NULL AND k.revoked_at IS NULL;" 2>/dev/null || echo 0)"

  [[ "${agent_count}" -gt 0 ]] && pass "${agent_count} registered agent(s)" || fail "No registered agents found"
  [[ "${key_count}" -gt 0 ]] && pass "${key_count} active API key(s)" || fail "No active API keys found"
  [[ "${joined_count}" -gt 0 ]] && pass "${joined_count} agent(s) have active keys" || fail "No registered agent has an active API key"

  if [[ "${agent_count}" -gt 0 ]]; then
    info "Agents:"
    sqlite3 -column -header "${DB_PATH}" "SELECT id, name, platform, status FROM registered_agents WHERE deregistered_at IS NULL ORDER BY id LIMIT 10;" 2>/dev/null | while IFS= read -r line; do
      info "  ${line}"
    done
  fi
else
  fail "Cannot check registrations because DB/tables are unavailable"
fi

echo ""

# 4. Optional API round-trip smoke test using local Alba/Sophia keys.
echo "4. API Round Trip"
if [[ "${RUN_API_SMOKE}" != "1" ]]; then
  warn "Skipped because RUN_API_SMOKE=${RUN_API_SMOKE}"
elif ! command -v jq >/dev/null 2>&1; then
  fail "jq is required for API smoke verification"
elif [[ ! -f "${KEYS_DIR}/alba.key" || ! -f "${KEYS_DIR}/sophia.key" ]]; then
  fail "Missing local Alba/Sophia key files in ${KEYS_DIR}; run scripts/provision-agent-keys.sh"
else
  alba_key="$(tr -d '\n' < "${KEYS_DIR}/alba.key")"
  sophia_key="$(tr -d '\n' < "${KEYS_DIR}/sophia.key")"
  subject="Smoke: verify-agent-bus $(date -u +%Y%m%dT%H%M%SZ)"
  send_file="/tmp/memroos-agent-bus-send.json"
  inbox_file="/tmp/memroos-agent-bus-inbox.json"
  ack_file="/tmp/memroos-agent-bus-ack.json"
  reply_file="/tmp/memroos-agent-bus-reply.json"
  fetch_file="/tmp/memroos-agent-bus-fetch.json"

  if curl -sS -X POST "${MEMROOS_URL}/api/agent-context/messages" \
    -H "Authorization: Bearer ${alba_key}" \
    -H "Content-Type: application/json" \
    -d "{\"toAgent\":\"sophia\",\"subject\":\"${subject}\",\"body\":\"Agent bus readiness smoke test.\",\"messageType\":\"request\",\"priority\":5,\"replyRequired\":true}" \
    -o "${send_file}" --max-time 10 2>/dev/null && jq -e '.ok == true and .message.id' "${send_file}" >/dev/null; then
    msg_id="$(jq -r '.message.id' "${send_file}")"
    pass "Alba can send a request to Sophia (${msg_id})"
  else
    fail "Alba could not send a request to Sophia"
    msg_id=""
  fi

  if [[ -n "${msg_id}" ]] && curl -sS "${MEMROOS_URL}/api/agent-context/messages?agent=sophia&box=inbox&status=pending&limit=10" \
    -H "Authorization: Bearer ${sophia_key}" \
    -o "${inbox_file}" --max-time 10 2>/dev/null && jq -e --arg id "${msg_id}" '.ok == true and ([.messages[]?.id] | index($id) != null)' "${inbox_file}" >/dev/null; then
    pass "Sophia can see the message in inbox"
  else
    fail "Sophia could not see the message in inbox"
  fi

  if [[ -n "${msg_id}" ]] && curl -sS -X POST "${MEMROOS_URL}/api/agent-context/messages/${msg_id}/ack" \
    -H "Authorization: Bearer ${sophia_key}" \
    -H "Content-Type: application/json" \
    -d '{"agentId":"sophia"}' \
    -o "${ack_file}" --max-time 10 2>/dev/null && jq -e '.ok == true and .message.status == "acknowledged"' "${ack_file}" >/dev/null; then
    pass "Sophia can acknowledge the message"
  else
    fail "Sophia could not acknowledge the message"
  fi

  if [[ -n "${msg_id}" ]] && curl -sS -X POST "${MEMROOS_URL}/api/agent-context/messages/${msg_id}/reply" \
    -H "Authorization: Bearer ${sophia_key}" \
    -H "Content-Type: application/json" \
    -d '{"fromAgent":"sophia","subject":"Re: smoke","body":"Agent bus readiness smoke reply."}' \
    -o "${reply_file}" --max-time 10 2>/dev/null && jq -e '.ok == true and .reply.fromAgent == "sophia" and .reply.toAgent == "alba"' "${reply_file}" >/dev/null; then
    pass "Sophia can reply to Alba"
  else
    fail "Sophia could not reply to Alba"
  fi

  if [[ -n "${msg_id}" ]] && curl -sS "${MEMROOS_URL}/api/agent-context/messages/${msg_id}?agent=alba&wait_for=reply&wait_ms=1000" \
    -H "Authorization: Bearer ${alba_key}" \
    -o "${fetch_file}" --max-time 10 2>/dev/null && jq -e '.ok == true and .timedOut == false and .reply.fromAgent == "sophia"' "${fetch_file}" >/dev/null; then
    pass "Alba can fetch Sophia's reply"
  else
    fail "Alba could not fetch Sophia's reply"
  fi

  rm -f "${send_file}" "${inbox_file}" "${ack_file}" "${reply_file}" "${fetch_file}"
fi

echo ""
echo "========================================"
echo -e "Results: ${GREEN}${pass_count} passed${NC}, ${RED}${fail_count} failed${NC}"
echo ""

if [[ "${fail_count}" -eq 0 ]]; then
  echo -e "${GREEN}✓ Agent bus is READY${NC}"
  exit 0
fi

echo -e "${RED}✗ Agent bus is NOT ready${NC}"
echo "Quick fix:"
echo "  bash scripts/start-memroos-agent-bus.sh"
echo "  bash scripts/provision-agent-keys.sh"
echo "  bash scripts/verify-agent-bus.sh"
exit 1
