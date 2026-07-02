#!/usr/bin/env bash
# start-memroos-agent-bus.sh — Start MemroOS and verify agent-context bus tables.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
MEMROOS_PORT="${MEMROOS_PORT:-3000}"
MEMROOS_URL="http://localhost:${MEMROOS_PORT}"
LOG_DIR="${REPO_ROOT}/scripts/logs"
DEV_LOG="${LOG_DIR}/memroos-dev.log"
PID_FILE="${LOG_DIR}/memroos-dev.pid"
DB_PATH_RAW="${SQLITE_DB_PATH:-data/conversations.db}"
if [[ "${DB_PATH_RAW}" = /* ]]; then DB_PATH="${DB_PATH_RAW}"; else DB_PATH="${REPO_ROOT}/${DB_PATH_RAW}"; fi

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info() { echo -e "${BLUE}[INFO]${NC}  $*"; }
ok() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC}  $*"; }
err() { echo -e "${RED}[ERROR]${NC} $*" >&2; }

STARTED_BY_US=false
DEV_PID=""

health_ok() {
  curl -sf "${MEMROOS_URL}/health" -o /dev/null --max-time 3 2>/dev/null \
    || curl -sf "${MEMROOS_URL}/api/health" -o /dev/null --max-time 3 2>/dev/null
}

ensure_schema_direct() {
  mkdir -p "$(dirname "${DB_PATH}")"
  sqlite3 "${DB_PATH}" <<'SQL'
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS registered_agents (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL, company TEXT,
  platform TEXT NOT NULL, protocol TEXT NOT NULL CHECK(protocol IN ('rest','a2a','ui','local')),
  status TEXT NOT NULL DEFAULT 'dormant' CHECK(status IN ('active','idle','dormant','error')),
  current_task TEXT, last_heartbeat_at TEXT,
  location TEXT NOT NULL DEFAULT 'local' CHECK(location IN ('local','tailscale','cloudflare')),
  host TEXT, port INTEGER, health_endpoint TEXT, tunnel_url TEXT, latency_ms INTEGER,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  deregistered_at TEXT
);
CREATE INDEX IF NOT EXISTS registered_agents_status ON registered_agents(status, last_heartbeat_at DESC);
CREATE INDEX IF NOT EXISTS registered_agents_protocol ON registered_agents(protocol);
CREATE TABLE IF NOT EXISTS agent_api_keys (
  id INTEGER PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES registered_agents(id) ON DELETE CASCADE,
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  last_used_at TEXT,
  revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS agent_api_keys_hash ON agent_api_keys(key_hash);
CREATE INDEX IF NOT EXISTS agent_api_keys_agent ON agent_api_keys(agent_id, revoked_at);
CREATE TABLE IF NOT EXISTS agent_context_messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  parent_id TEXT,
  from_agent TEXT NOT NULL REFERENCES registered_agents(id) ON DELETE CASCADE,
  to_agent TEXT NOT NULL REFERENCES registered_agents(id) ON DELETE CASCADE,
  message_type TEXT NOT NULL CHECK(message_type IN ('message','request','reply','context_sync','knowledge_save')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','delivered','acknowledged','replied','canceled','failed')),
  priority INTEGER NOT NULL DEFAULT 5,
  subject TEXT,
  body TEXT NOT NULL,
  context_refs TEXT NOT NULL DEFAULT '[]',
  artifacts TEXT NOT NULL DEFAULT '{}',
  visibility TEXT NOT NULL DEFAULT 'internal',
  policy TEXT NOT NULL DEFAULT 'agent_visible',
  reply_required INTEGER NOT NULL DEFAULT 0,
  saved_memory_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT
);
CREATE INDEX IF NOT EXISTS agent_context_messages_inbox ON agent_context_messages(to_agent, status, priority, created_at);
CREATE INDEX IF NOT EXISTS agent_context_messages_outbox ON agent_context_messages(from_agent, created_at DESC);
CREATE INDEX IF NOT EXISTS agent_context_messages_thread ON agent_context_messages(thread_id, created_at ASC);
CREATE INDEX IF NOT EXISTS agent_context_messages_correlation ON agent_context_messages(correlation_id, created_at ASC);
CREATE INDEX IF NOT EXISTS agent_context_messages_parent ON agent_context_messages(parent_id, created_at ASC);
SQL
}

start_app() {
  mkdir -p "${LOG_DIR}"
  info "Starting MemroOS Next.js app on port ${MEMROOS_PORT}"
  (
    cd "${REPO_ROOT}/apps/memroos"
    nohup env SQLITE_DB_PATH="${DB_PATH}" npm run dev -- --port "${MEMROOS_PORT}" > "${DEV_LOG}" 2>&1 < /dev/null &
    echo $! > "${PID_FILE}"
  )
  DEV_PID="$(cat "${PID_FILE}")"
  STARTED_BY_US=true
  info "Dev server PID ${DEV_PID}; log ${DEV_LOG}"
}

wait_for_health() {
  for i in $(seq 1 90); do
    if health_ok; then
      ok "Health endpoint responding (${MEMROOS_URL}/health or /api/health)"
      return 0
    fi
    if [[ -n "${DEV_PID}" ]] && ! kill -0 "${DEV_PID}" 2>/dev/null; then
      err "Dev server exited unexpectedly. Last log lines:"
      tail -30 "${DEV_LOG}" >&2 2>/dev/null || true
      return 1
    fi
    sleep 1
    [[ $((i % 10)) -eq 0 ]] && info "Waiting for health endpoint... ${i}s"
  done
  err "Timed out waiting for MemroOS health endpoint"
  return 1
}

verify_tables() {
  local missing=0
  [[ -f "${DB_PATH}" && -s "${DB_PATH}" ]] || { err "DB is missing or empty: ${DB_PATH}"; return 1; }
  for table in agent_context_messages registered_agents agent_api_keys; do
    if sqlite3 "${DB_PATH}" "SELECT 1 FROM sqlite_master WHERE type='table' AND name='${table}';" | grep -q 1; then
      ok "Table exists: ${table}"
    else
      err "Missing table: ${table}"
      missing=1
    fi
  done
  return "${missing}"
}

main() {
  command -v sqlite3 >/dev/null || { err "sqlite3 is required"; exit 1; }
  info "=== MemroOS Agent Bus Startup ==="
  info "Repo: ${REPO_ROOT}"
  info "DB:   ${DB_PATH}"

  ensure_schema_direct

  if health_ok; then
    ok "MemroOS app is already running on port ${MEMROOS_PORT}"
  else
    start_app
    wait_for_health || exit 1
  fi

  verify_tables || exit 1

  agents="$(sqlite3 "${DB_PATH}" "SELECT COUNT(*) FROM registered_agents WHERE deregistered_at IS NULL;" 2>/dev/null || echo 0)"
  keys="$(sqlite3 "${DB_PATH}" "SELECT COUNT(*) FROM agent_api_keys WHERE revoked_at IS NULL;" 2>/dev/null || echo 0)"
  messages="$(sqlite3 "${DB_PATH}" "SELECT COUNT(*) FROM agent_context_messages;" 2>/dev/null || echo 0)"

  echo ""
  ok "Agent bus storage is ready"
  info "Registered agents: ${agents}"
  info "Active API keys:   ${keys}"
  info "Context messages:  ${messages}"
  if [[ "${STARTED_BY_US}" == true ]]; then
    info "Started app PID: ${DEV_PID} (stop with: kill ${DEV_PID})"
  fi
}

main "$@"
