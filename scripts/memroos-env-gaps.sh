#!/usr/bin/env bash
# Report capability gaps on this MemRoOS host.
#
# Why this exists: every gap below was silently absent on cordant-hermes-01 and
# nothing said so. The app started, the UI said "Connected", and memory stayed
# empty — because MEMROOS_EMBEDDING_PROVIDER was unset (so the embedding cycle
# no-op'd), OLLAMA_BASE_URL pointed at localhost (which inside a container is
# the container, not the sibling ollama service), and the connector sync was
# never wired to startup. A capability that is off should announce itself.
#
# Exit 0 = no gaps. Exit 1 = at least one gap. Safe to run anywhere; read-only.
#
# Usage:
#   bash scripts/memroos-env-gaps.sh [--container NAME]

set -euo pipefail

CONTAINER="${CONTAINER_NAME:-memroos-local-memroos-1}"
while [ $# -gt 0 ]; do
  case "$1" in
    --container) CONTAINER="$2"; shift 2 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

HOST_ID="${MEMROOS_HOST_ID:-$(hostname)}"
GAPS=0
ok()   { printf '  \033[0;32mOK\033[0m    %s\n' "$1"; }
gap()  { printf '  \033[0;31mGAP\033[0m   %s\n' "$1"; GAPS=$((GAPS + 1)); }
note() { printf '  \033[1;33m--\033[0m    %s\n' "$1"; }

echo "[env-gaps] host=$HOST_ID container=$CONTAINER"

if ! docker inspect "$CONTAINER" >/dev/null 2>&1; then
  gap "container $CONTAINER not found — is the stack up?"
  exit 1
fi

cenv() { docker exec "$CONTAINER" sh -c "printenv $1 2>/dev/null" 2>/dev/null || true; }

# --- embeddings -------------------------------------------------------------
# The single most consequential gap: without it memory is text-searchable but
# not semantically recallable, and nothing reports the difference.
PROVIDER="$(cenv MEMROOS_EMBEDDING_PROVIDER)"
if [ "$PROVIDER" = "ollama" ]; then
  ok "embedding provider enabled (ollama)"
else
  gap "MEMROOS_EMBEDDING_PROVIDER is '${PROVIDER:-unset}' — embedding cycle will no-op (needs exactly 'ollama')"
fi

OLLAMA_URL="$(cenv OLLAMA_BASE_URL)"
case "$OLLAMA_URL" in
  *localhost*|*127.0.0.1*)
    gap "OLLAMA_BASE_URL=$OLLAMA_URL — inside a container localhost is the container itself, not the ollama service"
    ;;
  "") gap "OLLAMA_BASE_URL unset" ;;
  *)  ok "OLLAMA_BASE_URL=$OLLAMA_URL" ;;
esac

if docker exec "$CONTAINER" sh -c "curl -sf --max-time 8 \"${OLLAMA_URL:-http://ollama:11434}/api/tags\"" >/dev/null 2>&1; then
  ok "ollama reachable from the app container"
  if docker exec "$CONTAINER" sh -c "curl -sf --max-time 8 \"${OLLAMA_URL}/api/tags\"" 2>/dev/null | grep -q "nomic-embed-text"; then
    ok "nomic-embed-text model present"
  else
    gap "nomic-embed-text not pulled — run: docker exec <ollama-container> ollama pull nomic-embed-text"
  fi
else
  gap "ollama NOT reachable from the app container at ${OLLAMA_URL:-unset}"
fi

# --- vector store -----------------------------------------------------------
QDRANT="$(cenv QDRANT_URL)"
case "$QDRANT" in
  *your-qdrant*|*example*|"") gap "QDRANT_URL is a placeholder or unset ('${QDRANT:-unset}') — no vector store" ;;
  *) ok "QDRANT_URL configured" ;;
esac

# --- connectors -------------------------------------------------------------
if [ -n "$(cenv NANGO_SECRET_KEY)" ]; then
  ok "NANGO_SECRET_KEY present (connector sync can run)"
else
  gap "NANGO_SECRET_KEY unset — connector sync will not start, integrations stay unindexed"
fi

# --- indexing actually happening --------------------------------------------
cat > /tmp/env-gap-probe.js <<'JSEOF'
const D = require("better-sqlite3");
const db = new D(process.env.SQLITE_DB_PATH || "/data/conversations.db", { readonly: true });
const q = (s) => { try { return db.prepare(s).get(); } catch { return null; } };
const out = {
  messages: q("SELECT COUNT(*) AS n FROM messages")?.n ?? 0,
  embeddings: q("SELECT COUNT(*) AS n FROM message_embeddings")?.n ?? 0,
  fts: q("SELECT COUNT(*) AS n FROM messages_fts")?.n ?? 0,
  connectorRows: q("SELECT COUNT(*) AS n FROM messages WHERE role = 'connector'")?.n ?? 0,
  syncState: q("SELECT COUNT(*) AS n FROM connector_sync_state")?.n ?? 0,
  agents: q("SELECT COUNT(*) AS n FROM registered_agents WHERE deregistered_at IS NULL")?.n ?? 0,
  agentKeys: q("SELECT COUNT(*) AS n FROM agent_api_keys WHERE revoked_at IS NULL")?.n ?? 0,
  liveAgents: q("SELECT COUNT(*) AS n FROM registered_agents WHERE deregistered_at IS NULL AND last_heartbeat_at IS NOT NULL")?.n ?? 0,
};
console.log(JSON.stringify(out));
JSEOF
docker cp /tmp/env-gap-probe.js "$CONTAINER:/app/env-gap-probe.js" >/dev/null
STATS="$(docker exec "$CONTAINER" sh -c "cd /app && node env-gap-probe.js; rm -f env-gap-probe.js" 2>/dev/null || echo '{}')"
rm -f /tmp/env-gap-probe.js

printf '%s' "$STATS" > /tmp/env-gap-stats.json
STATLINE="$(python3 - <<'PYEOF'
import json
try:
    d = json.load(open("/tmp/env-gap-stats.json"))
except Exception:
    d = {}
keys = ["messages","embeddings","fts","connectorRows","syncState","agents","agentKeys","liveAgents"]
print(" ".join(str(d.get(k, 0)) for k in keys))
PYEOF
)"
rm -f /tmp/env-gap-stats.json
read -r MSGS EMBS FTS CROWS SYNCS AGENTS KEYS LIVE <<< "$STATLINE"

echo "  ---- index state ----"
echo "     messages=$MSGS  embeddings=$EMBS  fts=$FTS  connector_rows=$CROWS  sync_state=$SYNCS"
echo "     agents=$AGENTS  api_keys=$KEYS  with_heartbeat=$LIVE"

if [ "$MSGS" -gt 0 ] && [ "$EMBS" -eq 0 ]; then
  gap "$MSGS messages but 0 embeddings — semantic recall is dead on this host"
fi
if [ "$AGENTS" -gt 0 ] && [ "$KEYS" -eq 0 ]; then
  gap "$AGENTS agents but 0 API keys — they cannot heartbeat (run scripts/sync-host-agents.sh)"
fi
if [ "$AGENTS" -gt 0 ] && [ "$LIVE" -eq 0 ]; then
  gap "no agent has ever heartbeat — install the cron: scripts/memroos-agent-heartbeat.sh --install-cron"
fi
if [ "$CROWS" -eq 0 ] && [ -n "$(cenv NANGO_SECRET_KEY)" ]; then
  note "0 connector rows — sync may not have run a cycle yet (interval is 15m)"
fi

echo
if [ "$GAPS" -eq 0 ]; then
  echo "[env-gaps] no gaps on $HOST_ID"
else
  echo "[env-gaps] $GAPS gap(s) on $HOST_ID" >&2
fi
exit $([ "$GAPS" -eq 0 ] && echo 0 || echo 1)
