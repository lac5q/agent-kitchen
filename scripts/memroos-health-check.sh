#!/bin/bash
# CFGDUR-03 (Phase 196) — profile-conformance health check.
#
# Verifies that a memroos host is actually running the backends its host
# profile says it should, that those backends are reachable, and that user and
# agent data has not silently disappeared.
#
# This exists because oracle-1 ran for months with graph writes going to a
# throwaway local container instead of Neo4j Aura. The app was healthy, served
# traffic, and wrote data — to the wrong place. Nothing alerted. It was found
# by accident.
#
# HOST-AWARE BY DESIGN: expectations come from a profile file, not from
# hardcoded values. oracle-1 must use Aura; cordant-hermes-01 deliberately uses
# local Neo4j. A check tuned for one would alert continuously on the other and
# get muted, which is worse than no check.
#
# Usage:
#   MEMROOS_HOST_PROFILE=scripts/host-profiles/oracle-1.env scripts/memroos-health-check.sh
# Falls back to /etc/memroos/host-profile.env, then $MEMROOS_ROOT/host-profile.env.

set -uo pipefail

MEMROOS_ROOT="${MEMROOS_ROOT:-$HOME/memroos}"
STATE_DIR="${MEMROOS_HEALTH_STATE_DIR:-$MEMROOS_ROOT/.health}"
LOG="$STATE_DIR/health.log"
mkdir -p "$STATE_DIR"

ts() { date -u +%Y-%m-%dT%H:%M:%SZ; }

# stat(1) differs on GNU (-c %Y) vs BSD/macOS (-f %m).
mtime() { stat -c %Y "$1" 2>/dev/null || stat -f %m "$1" 2>/dev/null || echo 0; }

# ── load the host profile ────────────────────────────────────────────────────
PROFILE="${MEMROOS_HOST_PROFILE:-}"
if [ -z "$PROFILE" ]; then
  for candidate in /etc/memroos/host-profile.env "$MEMROOS_ROOT/host-profile.env"; do
    [ -f "$candidate" ] && PROFILE="$candidate" && break
  done
fi

if [ -z "$PROFILE" ] || [ ! -f "$PROFILE" ]; then
  echo "$(ts) FAIL: no host profile found (set MEMROOS_HOST_PROFILE, or place one at /etc/memroos/host-profile.env). Cannot verify config conformance without knowing what this host is supposed to be." >> "$LOG"
  exit 1
fi
# shellcheck disable=SC1090
. "$PROFILE"

HOST_ID="${MEMROOS_HOST_ID:-unknown}"
CONTAINER="${CONTAINER_NAME:-memroos-local-memroos-1}"
EXPECT_GRAPH="${EXPECT_GRAPH_BACKEND:-aura}"
EXPECT_VECTOR="${EXPECT_VECTOR_BACKEND:-qdrant-cloud}"
EXPECT_LOCAL_NEO4J="${EXPECT_LOCAL_NEO4J_RUNNING:-no}"
TO_EMAIL="${ALERT_EMAIL:-}"

FAILURES=0

fail() {
  FAILURES=$((FAILURES + 1))
  echo "$(ts) [$HOST_ID] FAIL: $1" >> "$LOG"
  [ -z "$TO_EMAIL" ] && return 0
  [ -f "$MEMROOS_ROOT/.env" ] || return 0
  SG_KEY=$(grep '^SENDGRID_API_KEY=' "$MEMROOS_ROOT/.env" | cut -d= -f2-)
  FROM=$(grep '^MEMROOS_EMAIL_FROM=' "$MEMROOS_ROOT/.env" | cut -d= -f2-)
  [ -n "${SG_KEY:-}" ] && [ -n "${FROM:-}" ] || return 0
  # One alert per distinct failure per hour, so a persistent fault does not
  # become an inbox flood that gets filtered.
  LAST_SENT="$STATE_DIR/last_alert_$(echo "$1" | md5sum | cut -d' ' -f1)"
  if [ ! -f "$LAST_SENT" ] || [ $(( $(date +%s) - $(mtime "$LAST_SENT") )) -gt 3600 ]; then
    curl -s -X POST https://api.sendgrid.com/v3/mail/send \
      -H "Authorization: Bearer $SG_KEY" -H 'Content-Type: application/json' \
      -d "{\"personalizations\":[{\"to\":[{\"email\":\"$TO_EMAIL\"}]}],\"from\":{\"email\":\"$FROM\"},\"subject\":\"[memroos $HOST_ID] health check FAILED\",\"content\":[{\"type\":\"text/plain\",\"value\":\"$1\"}]}" > /dev/null
    touch "$LAST_SENT"
  fi
}

ok() { echo "$(ts) [$HOST_ID] OK: $1" >> "$LOG"; }

# ── graph backend conformance ────────────────────────────────────────────────
ENV_URL=$(docker exec "$CONTAINER" sh -c 'echo $NEO4J_HTTP_URL' 2>/dev/null)
case "$EXPECT_GRAPH" in
  aura)
    if [[ "$ENV_URL" != *databases.neo4j.io* ]]; then
      fail "Graph drift: profile says 'aura' but NEO4J_HTTP_URL is '$ENV_URL'. The compose override is missing or was bypassed — see CFGDUR-02."
    else
      ok "graph backend = aura (as declared)"
    fi
    ;;
  local)
    if [[ "$ENV_URL" == *databases.neo4j.io* ]]; then
      fail "Graph drift: profile says 'local' but NEO4J_HTTP_URL points at Aura ('$ENV_URL'). Unintended cloud write path."
    else
      ok "graph backend = local (as declared)"
    fi
    ;;
  *) fail "Profile error: EXPECT_GRAPH_BACKEND='$EXPECT_GRAPH' is not 'aura' or 'local'." ;;
esac

# ── vector backend conformance ───────────────────────────────────────────────
QURL=$(docker exec "$CONTAINER" sh -c 'echo $QDRANT_URL' 2>/dev/null)
case "$EXPECT_VECTOR" in
  none) ok "vector backend = none (as declared)" ;;
  qdrant-cloud|local)
    if [[ -z "$QURL" || "$QURL" == *your-qdrant-cloud-endpoint* ]]; then
      fail "Vector drift: profile expects '$EXPECT_VECTOR' but QDRANT_URL is '$QURL' (placeholder or unset)."
    else
      QKEY=$(docker exec "$CONTAINER" sh -c 'echo $QDRANT_API_KEY' 2>/dev/null)
      QCODE=$(curl -s -o /dev/null -w '%{http_code}' -H "api-key: $QKEY" "$QURL/collections")
      if [ "$QCODE" != "200" ]; then
        fail "Qdrant unreachable: HTTP $QCODE from $QURL/collections"
      else
        ok "vector backend reachable ($EXPECT_VECTOR)"
      fi
    fi
    ;;
  *) fail "Profile error: EXPECT_VECTOR_BACKEND='$EXPECT_VECTOR' is not recognized." ;;
esac

# ── scheduler activity ───────────────────────────────────────────────────────
if [ -z "$(docker logs "$CONTAINER" --since 20m 2>&1 | grep -i 'graph-catchup' | tail -5)" ]; then
  fail "graph-catchup: no scheduler activity in 20 min. Expected every 30m, but total silence is suspicious."
else
  ok "graph-catchup active"
fi

# ── data integrity ───────────────────────────────────────────────────────────
# Compares against the PREVIOUS run, not an all-time floor. A floor never rises
# to track legitimate growth, so a wipe from a recent high down to just above
# the floor would go undetected.
COUNTS=$(docker exec -e NODE_PATH=/app/node_modules "$CONTAINER" node -e '
  const db = require("better-sqlite3")("/data/conversations.db", { readonly: true });
  const u = db.prepare("SELECT COUNT(*) c FROM users").get().c;
  const a = db.prepare("SELECT COUNT(*) c FROM registered_agents").get().c;
  console.log(u + " " + a);
' 2>/dev/null)
USERS_COUNT=$(echo "$COUNTS" | awk '{print $1}')
AGENTS_COUNT=$(echo "$COUNTS" | awk '{print $2}')
PREV_STATE="$STATE_DIR/min_counts"

if [ -z "$USERS_COUNT" ] || [ -z "$AGENTS_COUNT" ]; then
  fail "Integrity check could not query conversations.db (container down, DB missing, or query error)."
elif [ "$USERS_COUNT" -eq 0 ]; then
  fail "users table is EMPTY. This looks like a fresh or wiped DB — check the bind mount and SQLITE_DB_PATH before restarting again."
else
  if [ -f "$PREV_STATE" ]; then
    read -r PREV_USERS PREV_AGENTS < "$PREV_STATE"
  else
    PREV_USERS=$USERS_COUNT; PREV_AGENTS=$AGENTS_COUNT
  fi
  if [ "$USERS_COUNT" -lt "$PREV_USERS" ] || [ "$AGENTS_COUNT" -lt "$PREV_AGENTS" ]; then
    fail "Data loss: users $PREV_USERS -> $USERS_COUNT, registered_agents $PREV_AGENTS -> $AGENTS_COUNT."
  else
    ok "users=$USERS_COUNT registered_agents=$AGENTS_COUNT (prev: $PREV_USERS/$PREV_AGENTS)"
  fi
  # Re-baseline every run: a legitimate deletion alerts once, then becomes the
  # new floor automatically.
  echo "$USERS_COUNT $AGENTS_COUNT" > "$PREV_STATE"
fi

# ── local neo4j container conformance ────────────────────────────────────────
RUNNING_NEO4J=$(docker ps --format '{{.Names}}' | grep -c 'neo4j' || true)
if [ "$EXPECT_LOCAL_NEO4J" = "no" ] && [ "$RUNNING_NEO4J" != "0" ]; then
  fail "A local neo4j container is running but the profile says it should not be. A compose run without the override likely happened."
elif [ "$EXPECT_LOCAL_NEO4J" = "yes" ] && [ "$RUNNING_NEO4J" = "0" ]; then
  fail "No local neo4j container is running but the profile requires one. Graph writes are going nowhere."
else
  ok "local neo4j container state matches profile (expected running: $EXPECT_LOCAL_NEO4J)"
fi

if [ "$FAILURES" -eq 0 ]; then
  exit 0
fi
exit 1
