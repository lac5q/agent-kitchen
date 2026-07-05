#!/usr/bin/env bash
# provision-agent-keys.sh — Register agents from agents.config.json and generate API keys.
#
# Direct schema references:
#   - registered_agents + agent_api_keys: apps/memroos/src/lib/db-schema.ts
#   - agent_context_messages: apps/memroos/src/lib/agent-context-bus.ts (ensureAgentContextBusSchema)
# API key pattern mirrors apps/memroos/src/lib/agent-registry.ts:
#   generateApiKey(agentId) => `ak_${agentId}_${crypto.randomBytes(32).toString("base64url")}`
#   createAgentApiKey(agentId) stores key_prefix=key.slice(0, 12), key_hash=sha256(key)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
AGENTS_CONFIG="${REPO_ROOT}/agents.config.json"
MEMROOS_PORT="${MEMROOS_PORT:-3000}"
MEMROOS_URL="http://localhost:${MEMROOS_PORT}"
KEYS_DIR="${HOME}/.memroos/agent-keys"
LOG_DIR="${REPO_ROOT}/scripts/logs"

# Match apps/memroos/src/lib/env.ts unless caller overrides SQLITE_DB_PATH.
DB_PATH_RAW="${SQLITE_DB_PATH:-data/conversations.db}"
if [[ "${DB_PATH_RAW}" = /* ]]; then
  DB_PATH="${DB_PATH_RAW}"
else
  DB_PATH="${REPO_ROOT}/${DB_PATH_RAW}"
fi

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info() { echo -e "${BLUE}[INFO]${NC}  $*"; }
ok() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC}  $*"; }
err() { echo -e "${RED}[ERROR]${NC} $*" >&2; }

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    err "Required command not found: $1"
    exit 1
  fi
}

health_ok() {
  curl -sf "${MEMROOS_URL}/health" -o /dev/null --max-time 3 2>/dev/null \
    || curl -sf "${MEMROOS_URL}/api/health" -o /dev/null --max-time 3 2>/dev/null
}

ensure_schema_direct() {
  info "Ensuring required DB schema in ${DB_PATH}"
  mkdir -p "$(dirname "${DB_PATH}")"
  sqlite3 "${DB_PATH}" <<'SQL'
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS registered_agents (
  id                TEXT PRIMARY KEY,
  name              TEXT    NOT NULL,
  role              TEXT    NOT NULL,
  company           TEXT,
  platform          TEXT    NOT NULL,
  protocol          TEXT    NOT NULL CHECK(protocol IN ('rest','a2a','ui','local')),
  status            TEXT    NOT NULL DEFAULT 'dormant' CHECK(status IN ('active','idle','dormant','error')),
  current_task      TEXT,
  last_heartbeat_at TEXT,
  location          TEXT    NOT NULL DEFAULT 'local' CHECK(location IN ('local','tailscale','cloudflare')),
  host              TEXT,
  port              INTEGER,
  health_endpoint   TEXT,
  tunnel_url        TEXT,
  latency_ms        INTEGER,
  metadata          TEXT    NOT NULL DEFAULT '{}',
  created_at        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  deregistered_at   TEXT
);
CREATE INDEX IF NOT EXISTS registered_agents_status ON registered_agents(status, last_heartbeat_at DESC);
CREATE INDEX IF NOT EXISTS registered_agents_protocol ON registered_agents(protocol);

CREATE TABLE IF NOT EXISTS agent_api_keys (
  id           INTEGER PRIMARY KEY,
  agent_id     TEXT    NOT NULL REFERENCES registered_agents(id) ON DELETE CASCADE,
  key_prefix   TEXT    NOT NULL,
  key_hash     TEXT    NOT NULL UNIQUE,
  created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  last_used_at TEXT,
  revoked_at   TEXT
);
CREATE INDEX IF NOT EXISTS agent_api_keys_hash ON agent_api_keys(key_hash);
CREATE INDEX IF NOT EXISTS agent_api_keys_agent ON agent_api_keys(agent_id, revoked_at);

CREATE TABLE IF NOT EXISTS agent_capabilities (
  id            INTEGER PRIMARY KEY,
  agent_id      TEXT    NOT NULL REFERENCES registered_agents(id) ON DELETE CASCADE,
  capability_id TEXT    NOT NULL,
  name          TEXT    NOT NULL,
  description   TEXT    NOT NULL DEFAULT '',
  tags          TEXT    NOT NULL DEFAULT '[]',
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  UNIQUE(agent_id, capability_id)
);
CREATE INDEX IF NOT EXISTS agent_capabilities_lookup ON agent_capabilities(capability_id, agent_id);

CREATE TABLE IF NOT EXISTS agent_context_messages (
  id              TEXT PRIMARY KEY,
  thread_id       TEXT    NOT NULL,
  correlation_id  TEXT    NOT NULL,
  parent_id       TEXT,
  from_agent      TEXT    NOT NULL REFERENCES registered_agents(id) ON DELETE CASCADE,
  to_agent        TEXT    NOT NULL REFERENCES registered_agents(id) ON DELETE CASCADE,
  message_type    TEXT    NOT NULL CHECK(message_type IN ('message','request','reply','context_sync','knowledge_save')),
  status          TEXT    NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','delivered','acknowledged','replied','canceled','failed')),
  priority        INTEGER NOT NULL DEFAULT 5,
  subject         TEXT,
  body            TEXT    NOT NULL,
  context_refs    TEXT    NOT NULL DEFAULT '[]',
  artifacts       TEXT    NOT NULL DEFAULT '{}',
  visibility      TEXT    NOT NULL DEFAULT 'internal',
  policy          TEXT    NOT NULL DEFAULT 'agent_visible',
  reply_required  INTEGER NOT NULL DEFAULT 0,
  saved_memory_id TEXT,
  created_at      TEXT    NOT NULL,
  updated_at      TEXT    NOT NULL,
  expires_at      TEXT
);
CREATE INDEX IF NOT EXISTS agent_context_messages_inbox ON agent_context_messages(to_agent, status, priority, created_at);
CREATE INDEX IF NOT EXISTS agent_context_messages_outbox ON agent_context_messages(from_agent, created_at DESC);
CREATE INDEX IF NOT EXISTS agent_context_messages_thread ON agent_context_messages(thread_id, created_at ASC);
CREATE INDEX IF NOT EXISTS agent_context_messages_correlation ON agent_context_messages(correlation_id, created_at ASC);
CREATE INDEX IF NOT EXISTS agent_context_messages_parent ON agent_context_messages(parent_id, created_at ASC);
SQL
  ok "Required tables are present"
}

ensure_app_running() {
  if health_ok; then
    ok "MemroOS app is already running on port ${MEMROOS_PORT}"
    return 0
  fi

  info "Starting MemroOS Next.js dev server on port ${MEMROOS_PORT}"
  mkdir -p "${LOG_DIR}"
  (
    cd "${REPO_ROOT}/apps/memroos"
    nohup env SQLITE_DB_PATH="${DB_PATH}" npm run dev -- --port "${MEMROOS_PORT}" > "${LOG_DIR}/memroos-dev.log" 2>&1 < /dev/null &
    echo $! > "${LOG_DIR}/memroos-dev.pid"
  )

  for _ in $(seq 1 90); do
    if health_ok; then
      ok "MemroOS app is responding"
      return 0
    fi
    sleep 1
  done

  err "MemroOS app did not become healthy within 90s; see ${LOG_DIR}/memroos-dev.log"
  exit 1
}

json_escape_sql() {
  # SQLite single-quote escaping for the simple known agent ids/fields from agents.config.json.
  printf "%s" "$1" | sed "s/'/''/g"
}

register_agent_direct() {
  local id="$1" name="$2" role="$3" platform="$4" location="$5" host="$6" port="$7" health="$8" tunnel="$9"
  local protocol="rest"
  if [[ "${platform}" == "hermes" || "${platform}" == "openclaw" ]]; then
    protocol="a2a"
  fi

  local id_sql name_sql role_sql platform_sql location_sql host_sql health_sql tunnel_sql
  id_sql=$(json_escape_sql "${id}"); name_sql=$(json_escape_sql "${name}"); role_sql=$(json_escape_sql "${role}")
  platform_sql=$(json_escape_sql "${platform}"); location_sql=$(json_escape_sql "${location}"); host_sql=$(json_escape_sql "${host}")
  health_sql=$(json_escape_sql "${health}"); tunnel_sql=$(json_escape_sql "${tunnel}")

  sqlite3 "${DB_PATH}" <<SQL
INSERT INTO registered_agents (
  id, name, role, platform, protocol, status, location, host, port, health_endpoint, tunnel_url, metadata, updated_at, deregistered_at
) VALUES (
  '${id_sql}', '${name_sql}', '${role_sql}', '${platform_sql}', '${protocol}', 'dormant', '${location_sql}', '${host_sql}', ${port}, '${health_sql}', NULLIF('${tunnel_sql}', ''), '{}', strftime('%Y-%m-%dT%H:%M:%SZ','now'), NULL
)
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  role = excluded.role,
  platform = excluded.platform,
  protocol = excluded.protocol,
  location = excluded.location,
  host = excluded.host,
  port = excluded.port,
  health_endpoint = excluded.health_endpoint,
  tunnel_url = excluded.tunnel_url,
  updated_at = excluded.updated_at,
  deregistered_at = NULL;
SQL
}

sync_capabilities_direct() {
  local index="$1" id="$2"
  local cap_count j cap_id cap_name cap_description cap_tags
  local id_sql cap_id_sql cap_name_sql cap_description_sql cap_tags_sql
  cap_count=$(jq ".remoteAgents[$index].capabilities // [] | length" "${AGENTS_CONFIG}")
  [[ "${cap_count}" -gt 0 ]] || return 0

  id_sql=$(json_escape_sql "${id}")
  for j in $(seq 0 $((cap_count - 1))); do
    cap_id=$(jq -r ".remoteAgents[$index].capabilities[$j].id" "${AGENTS_CONFIG}")
    cap_name=$(jq -r ".remoteAgents[$index].capabilities[$j].name" "${AGENTS_CONFIG}")
    cap_description=$(jq -r ".remoteAgents[$index].capabilities[$j].description // \"\"" "${AGENTS_CONFIG}")
    cap_tags=$(jq -c ".remoteAgents[$index].capabilities[$j].tags // []" "${AGENTS_CONFIG}")
    [[ -n "${cap_id}" && "${cap_id}" != "null" && -n "${cap_name}" && "${cap_name}" != "null" ]] || continue

    cap_id_sql=$(json_escape_sql "${cap_id}")
    cap_name_sql=$(json_escape_sql "${cap_name}")
    cap_description_sql=$(json_escape_sql "${cap_description}")
    cap_tags_sql=$(json_escape_sql "${cap_tags}")
    sqlite3 "${DB_PATH}" <<SQL
INSERT INTO agent_capabilities (agent_id, capability_id, name, description, tags, updated_at)
VALUES ('${id_sql}', '${cap_id_sql}', '${cap_name_sql}', '${cap_description_sql}', '${cap_tags_sql}', strftime('%Y-%m-%dT%H:%M:%SZ','now'))
ON CONFLICT(agent_id, capability_id) DO UPDATE SET
  name = excluded.name,
  description = excluded.description,
  tags = excluded.tags,
  updated_at = excluded.updated_at;
SQL
  done
}

hash_api_key() {
  printf "%s" "$1" | shasum -a 256 | awk '{print $1}'
}

active_key_hash_exists() {
  local id="$1" key_hash="$2" id_sql hash_sql count
  id_sql=$(json_escape_sql "${id}")
  hash_sql=$(json_escape_sql "${key_hash}")
  count=$(sqlite3 "${DB_PATH}" "SELECT COUNT(*) FROM agent_api_keys WHERE agent_id='${id_sql}' AND key_hash='${hash_sql}' AND revoked_at IS NULL;" 2>/dev/null || echo 0)
  [[ "${count}" -gt 0 ]]
}

revoke_other_keys_direct() {
  local id="$1" keep_hash="${2:-}" id_sql keep_hash_sql
  id_sql=$(json_escape_sql "${id}")
  if [[ -n "${keep_hash}" ]]; then
    keep_hash_sql=$(json_escape_sql "${keep_hash}")
    sqlite3 "${DB_PATH}" "UPDATE agent_api_keys SET revoked_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE agent_id='${id_sql}' AND revoked_at IS NULL AND key_hash <> '${keep_hash_sql}';"
  else
    sqlite3 "${DB_PATH}" "UPDATE agent_api_keys SET revoked_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE agent_id='${id_sql}' AND revoked_at IS NULL;"
  fi
}

generate_key_direct() {
  local id="$1"
  local key rand key_hash key_prefix id_sql
  # agent-registry.ts uses 32 random bytes encoded base64url. openssl output is converted to base64url.
  rand=$(openssl rand -base64 32 | tr '+/' '-_' | tr -d '=\n')
  key="ak_${id}_${rand}"
  key_prefix="${key:0:12}"
  key_hash=$(hash_api_key "${key}")
  id_sql=$(json_escape_sql "${id}")
  revoke_other_keys_direct "${id}"
  sqlite3 "${DB_PATH}" "INSERT INTO agent_api_keys (agent_id, key_prefix, key_hash) VALUES ('${id_sql}', '${key_prefix}', '${key_hash}');"
  printf "%s" "${key}"
}

select_api_key_direct() {
  local id="$1" key_file="$2" existing existing_hash
  if [[ -f "${key_file}" ]]; then
    existing=$(tr -d '\n' < "${key_file}")
    existing_hash=$(hash_api_key "${existing}")
    if [[ "${existing}" == ak_${id}_* ]] && active_key_hash_exists "${id}" "${existing_hash}"; then
      revoke_other_keys_direct "${id}" "${existing_hash}"
      printf "%s" "${existing}"
      return 0
    fi
  fi
  generate_key_direct "${id}"
}

main() {
  require_cmd jq
  require_cmd sqlite3
  require_cmd openssl
  require_cmd shasum

  [[ -f "${AGENTS_CONFIG}" ]] || { err "Missing ${AGENTS_CONFIG}"; exit 1; }

  info "=== MemroOS Agent Key Provisioning ==="
  info "Repo: ${REPO_ROOT}"
  info "DB:   ${DB_PATH}"
  info "Keys: ${KEYS_DIR}"
  echo ""

  ensure_schema_direct
  ensure_app_running

  mkdir -p "${KEYS_DIR}"
  chmod 700 "${KEYS_DIR}"

  local count success fail
  count=$(jq '.remoteAgents | length' "${AGENTS_CONFIG}")
  success=0
  fail=0

  echo ""
  printf "%-12s %-20s %-25s %-12s %s\n" "AGENT ID" "NAME" "ROLE" "PLATFORM" "KEY PREFIX"
  printf "%-12s %-20s %-25s %-12s %s\n" "--------" "----" "----" "--------" "----------"

  for i in $(seq 0 $((count - 1))); do
    id=$(jq -r ".remoteAgents[$i].id" "${AGENTS_CONFIG}")
    name=$(jq -r ".remoteAgents[$i].name" "${AGENTS_CONFIG}")
    role=$(jq -r ".remoteAgents[$i].role" "${AGENTS_CONFIG}")
    platform=$(jq -r ".remoteAgents[$i].platform" "${AGENTS_CONFIG}")
    location=$(jq -r ".remoteAgents[$i].location // \"local\"" "${AGENTS_CONFIG}")
    host=$(jq -r ".remoteAgents[$i].host // \"localhost\"" "${AGENTS_CONFIG}")
    port=$(jq -r ".remoteAgents[$i].port // 3000" "${AGENTS_CONFIG}")
    health=$(jq -r ".remoteAgents[$i].healthEndpoint // \"/health\"" "${AGENTS_CONFIG}")
    tunnel=$(jq -r ".remoteAgents[$i].tunnelUrl // \"\"" "${AGENTS_CONFIG}")

    if register_agent_direct "${id}" "${name}" "${role}" "${platform}" "${location}" "${host}" "${port}" "${health}" "${tunnel}"; then
      sync_capabilities_direct "${i}" "${id}"
      key_file="${KEYS_DIR}/${id}.key"
      api_key=$(select_api_key_direct "${id}" "${key_file}")
      printf "%s\n" "${api_key}" > "${key_file}"
      chmod 600 "${key_file}"
      printf "%-12s %-20s %-25s %-12s %s\n" "${id}" "${name}" "${role}" "${platform}" "${api_key:0:12}..."
      success=$((success + 1))
    else
      printf "%-12s %-20s %-25s %-12s %s\n" "${id}" "${name}" "${role}" "${platform}" "FAILED"
      fail=$((fail + 1))
    fi
  done

  env_file="${KEYS_DIR}/agent-keys.env"
  {
    echo "# MemroOS Agent API Keys — generated $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    for i in $(seq 0 $((count - 1))); do
      aid=$(jq -r ".remoteAgents[$i].id" "${AGENTS_CONFIG}")
      [[ -f "${KEYS_DIR}/${aid}.key" ]] || continue
      key=$(cat "${KEYS_DIR}/${aid}.key")
      aid_upper=$(printf "%s" "${aid}" | tr '[:lower:]' '[:upper:]')
      echo "MEMROOS_AGENT_API_KEY_${aid_upper}=${key}"
    done
  } > "${env_file}"
  chmod 600 "${env_file}"

  echo ""
  ok "Provisioned ${success}/${count} agents"
  [[ "${fail}" -eq 0 ]] || warn "Failed to provision ${fail} agents"
  ok "Keys stored with 600 permissions in ${KEYS_DIR}"
  info "For the MCP facade, load a key without printing it:"
  echo "  export MEMROOS_AGENT_API_KEY=\"\$(cat ${KEYS_DIR}/<agent-id>.key)\""
  info "Combined env snippet: ${env_file}"
}

main "$@"
