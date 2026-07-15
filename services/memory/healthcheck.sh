#!/bin/bash
# Knowledge stack health monitor — comprehensive
# Checks: disk, SQLite, Mem0, Qdrant cloud, QMD, embeddings,
#         Tailscale peers, Cloudflare tunnel, all agent gateways,
#         Agent-Lightning venv/cron/proposals, GitHub sync,
#         mem0-server CPU runaway
# Alerts via Email (SendGrid) + Telegram + Discord on failure

set -uo pipefail

# ── Config ─────────────────────────────────────────────────────────────────
MEM0_URL="http://localhost:3201"
QMD_URL="http://localhost:9472"
KNOWLEDGE_DIR="$HOME/github/knowledge"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MEMROOS_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
MEM0_ENV_FILE="${MEM0_ENV_FILE:-$SCRIPT_DIR/.env}"
if [ -f "$MEM0_ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$MEM0_ENV_FILE"
  set +a
fi
MEM0_LOG_DIR="${MEM0_LOG_DIR:-$SCRIPT_DIR/logs}"
ALERT_STATE_DIR="/tmp/knowledge-healthcheck"
COOLDOWN_SECONDS=1800  # 30 min between repeat alerts for same issue
LOG_TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)
NOW=$(date +%s)
LOG_FILE="$KNOWLEDGE_DIR/logs/healthcheck.log"
TAILSCALE_PEERS="${TAILSCALE_PEERS:-}"
REMOTE_AGENT_HEALTH_URLS="${REMOTE_AGENT_HEALTH_URLS:-}"
CLOUDFLARE_HEALTH_URL="${CLOUDFLARE_HEALTH_URL:-}"
KILOCLAW_HEALTH_URL="${KILOCLAW_HEALTH_URL:-}"
LUCIA_PC_TOKEN="${LUCIA_PC_TOKEN:-}"
LUCIA_PC_AGENT_URL="${LUCIA_PC_AGENT_URL:-http://localhost:3100/api/agents/87d756ee-ece7-4dde-b1f9-6e0b6c398d28}"
LUCIA_PC_HOST="${LUCIA_PC_HOST:-}"

DISK_CRITICAL_PERCENT=95
DISK_WARNING_PERCENT=90

TG_TOKEN="${TELEGRAM_BOT_TOKEN:-}"
TG_CHAT_ID="${TELEGRAM_CHAT_ID:-}"
DISCORD_WEBHOOK_URL="${DISCORD_KNOWLEDGE_WEBHOOK:-}"
SENDGRID_API_KEY="${SENDGRID_API_KEY:-}"
ALERT_EMAIL_FROM="${ALERT_EMAIL_FROM:-alerts@memroos.ai}"
ALERT_EMAIL_TO="${ALERT_EMAIL_TO:-${ALERT_EMAIL:-alerts@example.com}}"
MEM0_CPU_ALERT_THRESHOLD="${MEM0_CPU_ALERT_THRESHOLD:-200}"  # % — triggers at 2+ cores

mkdir -p "$ALERT_STATE_DIR"
mkdir -p "$(dirname "$LOG_FILE")"

# ── Helpers ─────────────────────────────────────────────────────────────────
log() { echo "[$LOG_TS] $1" | tee -a "$LOG_FILE"; }

send_telegram() {
  if [ -z "$TG_TOKEN" ] || [ -z "$TG_CHAT_ID" ]; then return 1; fi
  curl -s --max-time 10 \
    "https://api.telegram.org/bot${TG_TOKEN}/sendMessage" \
    -d chat_id="$TG_CHAT_ID" \
    -d parse_mode="Markdown" \
    -d text="$1" > /dev/null 2>&1
}

send_discord() {
  if [ -z "$DISCORD_WEBHOOK_URL" ]; then return 1; fi
  local msg
  msg=$(echo "$1" | sed 's/\*\([^*]*\)\*/**\1**/g')
  curl -s --max-time 10 -X POST "$DISCORD_WEBHOOK_URL" \
    -H "Content-Type: application/json" \
    -d "{\"content\": $(echo "$msg" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')}" \
    > /dev/null 2>&1
}

send_email() {
  if [ -z "$SENDGRID_API_KEY" ]; then return 1; fi
  local subject="$1"
  local body="$2"
  # Rate limit: max 5 emails per hour using a rolling counter file
  local rate_file="$ALERT_STATE_DIR/email_rate.json"
  local allowed
  allowed=$(python3 - "$rate_file" <<'PY'
import sys, json, time, os
path = sys.argv[1]
now = time.time()
window = 3600  # 1 hour
limit = 5
try:
    data = json.loads(open(path).read())
except Exception:
    data = {"sends": []}
# Drop timestamps outside the rolling window
data["sends"] = [t for t in data["sends"] if now - t < window]
if len(data["sends"]) >= limit:
    print("blocked")
    sys.exit(0)
data["sends"].append(now)
os.makedirs(os.path.dirname(path), exist_ok=True)
open(path, "w").write(json.dumps(data))
print("ok")
PY
)
  if [ "$allowed" != "ok" ]; then
    log "Email rate limit hit (max 5/hr) — suppressing: $subject"
    return 1
  fi
  python3 - "$SENDGRID_API_KEY" "$ALERT_EMAIL_FROM" "$ALERT_EMAIL_TO" "$subject" "$body" <<'PY' >/dev/null 2>&1
import sys, json, urllib.request, urllib.error
api_key, from_email, to_email, subject, body = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5]
plain = body.replace('*', '').replace('`', '')
payload = json.dumps({
    "personalizations": [{"to": [{"email": to_email}]}],
    "from": {"email": from_email, "name": "Memroos Alerts"},
    "subject": subject,
    "content": [{"type": "text/plain", "value": plain}],
}).encode()
req = urllib.request.Request(
    "https://api.sendgrid.com/v3/mail/send",
    data=payload,
    headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
    method="POST",
)
try:
    urllib.request.urlopen(req, timeout=10)
    sys.exit(0)
except urllib.error.HTTPError:
    sys.exit(1)
PY
}

send_macos_notification() {
  local title="$1"
  local message="$2"
  local body
  body=$(echo "$message" | sed 's/[*`]//g' | head -6 | tr '\n' ' ')
  /usr/bin/osascript \
    -e "display notification $(printf '%s' "$body" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))') with title $(printf '%s' "$title" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')" \
    >/dev/null 2>&1 || true
}

notify() {
  local title="$1"
  local message="$2"
  local sent=0
  if send_email "$title" "$message"; then sent=1; fi
  if send_telegram "$message"; then sent=1; fi
  if send_discord "$message"; then sent=1; fi
  if [ "$sent" -eq 0 ]; then
    send_macos_notification "$title" "$message"
  fi
}

should_alert() {
  local state_file="${ALERT_STATE_DIR}/${1}.last"
  if [ -f "$state_file" ]; then
    local elapsed=$(( NOW - $(cat "$state_file") ))
    [ "$elapsed" -lt "$COOLDOWN_SECONDS" ] && return 1
  fi
  echo "$NOW" > "$state_file"
  return 0
}

clear_alert() { rm -f "${ALERT_STATE_DIR}/${1}.last"; }

alert() {
  local alert_id="$1"
  local message="$2"
  if should_alert "$alert_id"; then
    log "ALERT: $message"
    notify "Memroos Memory Alert" "🚨 *Knowledge Stack Alert*
$message

_$(date '+%Y-%m-%d %H:%M:%S')_"
  else
    log "SUPPRESSED (cooldown): $message"
  fi
}

recover() {
  local state_file="${ALERT_STATE_DIR}/${1}.last"
  if [ -f "$state_file" ]; then
    log "RECOVERED: $2"
    notify "Memroos Memory Recovered" "✅ *Knowledge Stack Recovered*
$2

_$(date '+%Y-%m-%d %H:%M:%S')_"
    clear_alert "$1"
  fi
}

check_http() {
  local code
  code=$(curl -s --max-time 6 -o /dev/null -w "%{http_code}" "$1" 2>/dev/null)
  [[ "$code" =~ ^[23] ]]
}

json_field() {
  # json_field <json_string> <field>
  echo "$1" | python3 -c "import sys,json; d=json.loads(sys.stdin.read()); print(d.get('$2','unknown'))" 2>/dev/null || echo "parse_error"
}

# ── Check 0: Disk Space ─────────────────────────────────────────────────────
log "--- healthcheck start ---"
log "Checking disk space..."
DISK_FREE=$(df -g ~ 2>/dev/null | tail -1 | awk '{print $4}')
DISK_PERCENT=$(df -h ~ 2>/dev/null | tail -1 | awk '{print $5}' | tr -d '%')

if [ -n "$DISK_PERCENT" ] && [ "$DISK_PERCENT" -ge "$DISK_CRITICAL_PERCENT" ]; then
  alert "disk_critical" "Disk is *${DISK_PERCENT}% full* (${DISK_FREE}GB free)
- SQLite → readonly; Mem0 cannot save memories
- \`du -sh ~/Library/* | sort -hr | head -20\`"
elif [ -n "$DISK_PERCENT" ] && [ "$DISK_PERCENT" -ge "$DISK_WARNING_PERCENT" ]; then
  alert "disk_warning" "Disk is *${DISK_PERCENT}% full* (${DISK_FREE}GB free) — cleanup soon"
else
  log "Disk: OK (${DISK_PERCENT}% used, ${DISK_FREE}GB free)"
  recover "disk_critical" "Disk space recovered: ${DISK_FREE}GB free"
  recover "disk_warning" "Disk space is now healthy"
fi

# ── Check 0.5: SQLite ────────────────────────────────────────────────────────
log "Checking SQLite (~/.mem0/history.db)..."
SQLITE_DB="$HOME/.mem0/history.db"
if [ -f "$SQLITE_DB" ]; then
  if [ ! -w "$SQLITE_DB" ]; then
    alert "sqlite_readonly" "SQLite is *READONLY*
- Fix: \`chmod u+w $SQLITE_DB\`"
  else
    recover "sqlite_readonly" "SQLite is writable again"
    INTEGRITY=$(sqlite3 "$SQLITE_DB" "PRAGMA integrity_check;" 2>&1)
    if [ "$INTEGRITY" != "ok" ]; then
      alert "sqlite_corrupt" "SQLite integrity check *FAILED*: $INTEGRITY"
    else
      log "SQLite: OK"
      recover "sqlite_corrupt" "SQLite integrity restored"
    fi
  fi
else
  log "SQLite: not found (will be created on first use)"
fi

# ── Check 1: Mem0 ────────────────────────────────────────────────────────────
log "Checking Mem0 ($MEM0_URL)..."
MEM0_RESTART_COOLDOWN_SECONDS="${MEM0_RESTART_COOLDOWN_SECONDS:-1800}"
MEM0_LIVEZ=$(curl -s --max-time 3 "$MEM0_URL/livez" 2>/dev/null || true)
MEM0_LIVEZ_STATUS=$(json_field "$MEM0_LIVEZ" "status")
MEM0_HEALTH=$(curl -s --max-time 6 "$MEM0_URL/health" 2>/dev/null || true)
MEM0_STATUS=$(json_field "$MEM0_HEALTH" "status")

maybe_restart_hung_mem0() {
  local reason="$1"
  local cooldown_file="${ALERT_STATE_DIR}/mem0_restart.cooldown"
  local elapsed=999999
  if [ -f "$cooldown_file" ]; then
    elapsed=$(( NOW - $(cat "$cooldown_file" 2>/dev/null || echo 0) ))
  fi
  if [ "$elapsed" -lt "$MEM0_RESTART_COOLDOWN_SECONDS" ]; then
    log "Mem0 restart suppressed (cooldown ${elapsed}s < ${MEM0_RESTART_COOLDOWN_SECONDS}s): $reason"
    return 0
  fi
  echo "$NOW" > "$cooldown_file"
  log "Attempting Mem0 restart (hung/unreachable): $reason"
  alert "mem0_auto_restart" "Mem0 *auto-restart* triggered
- Reason: $reason
- Cooldown: ${MEM0_RESTART_COOLDOWN_SECONDS}s
- Command: \`launchctl kickstart -k gui/\$(id -u)/com.mem0.server\`"
  if command -v launchctl >/dev/null 2>&1; then
    launchctl kickstart -k "gui/$(id -u)/com.mem0.server" 2>/dev/null \
      || log "launchctl kickstart failed; start Mem0 manually via services/memory/start-mem0.sh"
  else
    log "launchctl unavailable; start Mem0 manually via services/memory/start-mem0.sh"
  fi
}

if [ "$MEM0_STATUS" = "ok" ]; then
  QDRANT_STATUS=$(json_field "$MEM0_HEALTH" "vector_store")
  QUEUED_MEMORIES=$(echo "$MEM0_HEALTH" | python3 -c "import sys,json; d=json.loads(sys.stdin.read()); print((d.get('queue') or {}).get('queued', 0) or 0)" 2>/dev/null || echo "unknown")
  log "Mem0: OK (vector_store: $QDRANT_STATUS)"
  recover "mem0_down" "Mem0 is back online"
  recover "mem0_degraded" "Mem0 is no longer degraded"
  recover "mem0_hung" "Mem0 health/livez responding again"
  if [ "$QDRANT_STATUS" != "connected" ]; then
    alert "qdrant_via_mem0" "Mem0 up but *Qdrant not connected* (status: $QDRANT_STATUS)
- Semantic memory writes will fail
- \`tail -50 $MEM0_LOG_DIR/mem0-server.log\`"
  else
    recover "qdrant_via_mem0" "Qdrant reconnected via Mem0"
  fi
  if [ "$QUEUED_MEMORIES" != "unknown" ] && [ "$QUEUED_MEMORIES" -gt 0 ] 2>/dev/null; then
    alert "mem0_queue_backlog" "Mem0 has *${QUEUED_MEMORIES} queued memory saves*
- Writes are preserved but not searchable yet
- \`sqlite3 $MEM0_LOG_DIR/queue.db 'select count(*) from queued_requests;'\`"
  else
    recover "mem0_queue_backlog" "Mem0 memory queue drained"
  fi
elif [ "$MEM0_STATUS" = "degraded" ]; then
  QUEUED_MEMORIES=$(echo "$MEM0_HEALTH" | python3 -c "import sys,json; d=json.loads(sys.stdin.read()); print((d.get('queue') or {}).get('queued', 'unknown'))" 2>/dev/null || echo "unknown")
  alert "mem0_degraded" "Mem0 is *DEGRADED*
- Queued memory saves: ${QUEUED_MEMORIES}
- \`tail -50 $MEM0_LOG_DIR/mem0-server.log\`"
  # Alive enough to answer /health — do not auto-restart on degraded alone.
elif [ "$MEM0_LIVEZ_STATUS" != "ok" ]; then
  alert "mem0_hung" "Mem0 appears *HUNG or DOWN* at \`$MEM0_URL\`
- /livez status: ${MEM0_LIVEZ_STATUS}
- /health status: ${MEM0_STATUS}
- Restart: \`launchctl kickstart -k gui/\$(id -u)/com.mem0.server\`"
  maybe_restart_hung_mem0 "livez=${MEM0_LIVEZ_STATUS} health=${MEM0_STATUS}"
else
  alert "mem0_down" "Mem0 is *DOWN* at \`$MEM0_URL\`
- /livez ok but /health not responding with status
- Restart: \`launchctl kickstart -k gui/\$(id -u)/com.mem0.server\`"
  maybe_restart_hung_mem0 "livez=ok but health=${MEM0_STATUS}"
fi

# ── Check 1.5: Mem0 failures ─────────────────────────────────────────────────
FAILURE_LOG="$MEM0_LOG_DIR/failures.log"
if [ -f "$FAILURE_LOG" ]; then
  RECENT_FAILURES=$(python3 - "$FAILURE_LOG" <<'PY' 2>/dev/null || echo "0"
import datetime as dt
import json
import sys
from pathlib import Path

path = Path(sys.argv[1])
now = dt.datetime.now(dt.timezone.utc)
count = 0
for line in path.read_text(errors="replace").splitlines()[-200:]:
    if " | ERROR | " not in line:
        continue
    try:
        payload = json.loads(line.split(" | ERROR | ", 1)[1])
        timestamp = payload.get("timestamp", "")
        when = dt.datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
    except Exception:
        continue
    traceback = str(payload.get("traceback", ""))
    if "/tests/" in traceback:
        continue
    if (now - when).total_seconds() <= 3600:
        count += 1
print(count)
PY
)
  RECENT_FAILURES="${RECENT_FAILURES:-0}"
  if [ "${RECENT_FAILURES}" -gt 5 ] 2>/dev/null; then
    alert "mem0_failures" "Mem0 has *${RECENT_FAILURES} recent failures*
- \`tail -20 $FAILURE_LOG\`"
  else
    log "Mem0 failures: $RECENT_FAILURES recent (OK)"
  fi
fi

# ── Check 2: Qdrant cloud (direct) ───────────────────────────────────────────
log "Checking Qdrant cloud (direct)..."
QDRANT_CLOUD="${QDRANT_URL:-https://f969d77f-3cf6-4557-92cb-67f7cac0f44a.us-west-1-0.aws.cloud.qdrant.io:6333}"
QDRANT_APIKEY="${QDRANT_API_KEY:-}"
if [ -z "$QDRANT_APIKEY" ]; then
  log "Qdrant cloud: skipped direct check (QDRANT_API_KEY unset)"
else
  QDRANT_RESP=$(curl -s --max-time 10 -H "api-key: $QDRANT_APIKEY" "$QDRANT_CLOUD/collections" 2>/dev/null)
  QDRANT_OK=$(json_field "$QDRANT_RESP" "status")
  if [ "$QDRANT_OK" = "ok" ]; then
    COLL_COUNT=$(echo "$QDRANT_RESP" | python3 -c "import sys,json; d=json.loads(sys.stdin.read()); print(len(d.get('result',{}).get('collections',[])))" 2>/dev/null || echo "?")
    log "Qdrant cloud: OK ($COLL_COUNT collections)"
    recover "qdrant_cloud_down" "Qdrant cloud is back online"
  elif [ "${QDRANT_STATUS:-unknown}" = "connected" ]; then
    log "Qdrant cloud direct check failed, but Mem0 reports vector_store connected"
  else
    alert "qdrant_cloud_down" "Qdrant cloud *unreachable*
- Mem0 vector memory non-functional
- Check Qdrant Cloud dashboard for outage"
  fi
fi

# ── Check 2.5: QMD ───────────────────────────────────────────────────────────
log "Checking QMD ($QMD_URL)..."
QMD_BODY=$(curl -s --max-time 6 "$QMD_URL/health" 2>/dev/null)
QMD_STATUS=$(json_field "$QMD_BODY" "status")
if [ "$QMD_STATUS" = "ok" ] || [ "$QMD_STATUS" = "healthy" ] || [ "$QMD_STATUS" = "running" ]; then
  log "QMD: OK"
  recover "qmd_down" "QMD is back online"
else
  alert "qmd_down" "QMD is *DOWN* at \`$QMD_URL\`
- Status: $QMD_STATUS"
fi

# ── Check 2.55: Source → QMD indexing contract ───────────────────────────────
log "Checking source-to-QMD indexing contract..."
INDEX_CHECK_SCRIPT="$MEMROOS_ROOT/scripts/check-knowledge-indexing.mjs"
if [ ! -f "$INDEX_CHECK_SCRIPT" ]; then
  alert "qmd_index_contract_missing" "MemroOS indexing contract checker is *missing*
- Expected: \`$INDEX_CHECK_SCRIPT\`"
else
  INDEX_CHECK_OUTPUT=$(KNOWLEDGE_DIR="$KNOWLEDGE_DIR" node "$INDEX_CHECK_SCRIPT" \
    --days="${MEMORY_INDEX_DAYS:-2}" \
    --max-pending-embeddings="${QMD_MAX_PENDING_EMBEDDINGS:-10000}" 2>&1)
  INDEX_CHECK_STATUS=$?
  if [ "$INDEX_CHECK_STATUS" -eq 0 ]; then
    log "Source-to-QMD indexing: OK"
    recover "qmd_index_contract_missing" "MemroOS indexing contract checker restored"
    recover "qmd_index_contract" "Recent knowledge sources are indexed in QMD again"
  else
    INDEX_CHECK_SUMMARY=$(printf '%s\n' "$INDEX_CHECK_OUTPUT" | tail -25)
    alert "qmd_index_contract" "Recent knowledge sources are *NOT agent-searchable*
- Source files may exist on disk while agents cannot retrieve them
- Run: \`KNOWLEDGE_DIR=\"$KNOWLEDGE_DIR\" node $INDEX_CHECK_SCRIPT --days=${MEMORY_INDEX_DAYS:-2}\`

\`\`\`
$INDEX_CHECK_SUMMARY
\`\`\`"
  fi
fi

# ── Check 2.6: Email context ingestion freshness ─────────────────────────────
log "Checking Gmail context ingestion..."
EMAIL_LAST_RUN=$(python3 - "$KNOWLEDGE_DIR/ingestion-state.json" <<'PY' 2>/dev/null || echo "missing"
import datetime as dt
import json
import sys
from pathlib import Path

path = Path(sys.argv[1])
if not path.exists():
    print("missing")
    raise SystemExit
state = json.loads(path.read_text())
last_run = (state.get("gmail") or {}).get("last_run")
if not last_run:
    print("missing")
    raise SystemExit
when = dt.datetime.fromisoformat(last_run.replace("Z", "+00:00"))
age_hours = (dt.datetime.now(dt.timezone.utc) - when).total_seconds() / 3600
print(f"{age_hours:.2f}|{last_run}")
PY
)
if [ "$EMAIL_LAST_RUN" = "missing" ]; then
  alert "email_ingestion_missing" "Gmail context ingestion state is *missing*
- Check: \`$KNOWLEDGE_DIR/personal-ingestion-email.sh\`"
else
  EMAIL_AGE_HOURS="${EMAIL_LAST_RUN%%|*}"
  EMAIL_LAST_RUN_ISO="${EMAIL_LAST_RUN#*|}"
  if python3 - "$EMAIL_AGE_HOURS" <<'PY' >/dev/null 2>&1
import sys
raise SystemExit(0 if float(sys.argv[1]) > 8 else 1)
PY
  then
    alert "email_ingestion_stale" "Gmail context ingestion is *STALE*
- Last run: ${EMAIL_LAST_RUN_ISO}
- Run: \`$KNOWLEDGE_DIR/personal-ingestion-email.sh\`"
  else
    log "Gmail context ingestion: OK (last run ${EMAIL_LAST_RUN_ISO})"
    recover "email_ingestion_missing" "Gmail context ingestion state restored"
    recover "email_ingestion_stale" "Gmail context ingestion is fresh"
  fi
fi

# ── Check 3: Embeddings (Mem0 add round-trip) ────────────────────────────────
log "Checking embedding pipeline (Mem0 /memory/add round-trip)..."
MEM0_WRITE_TIMEOUT_SECONDS="${MEM0_WRITE_TIMEOUT_SECONDS:-45}"
EMBED_RESP=$(curl -s --max-time "$MEM0_WRITE_TIMEOUT_SECONDS" -X POST "$MEM0_URL/memory/add" \
  -H "Content-Type: application/json" \
  -d '{"agent_id":"healthcheck","text":"healthcheck ping test"}' \
  2>/dev/null)
EMBED_OK=$(echo "$EMBED_RESP" | python3 -c "
import sys,json
try:
    d=json.loads(sys.stdin.read())
except:
    print('parse_error'); sys.exit()
# success shapes: {\"memory_id\": ...} or {\"message\": \"Memory added\"} or list
if isinstance(d, list):
    print('ok')
elif d.get('status') == 'queued':
    print('error:memory save queued; backend write path is not completing')
elif d.get('status') == 'ok' or d.get('memory_id') or d.get('message') or d.get('id') or d.get('result') is not None:
    print('ok')
elif d.get('detail') or d.get('error'):
    print('error:' + str(d.get('detail') or d.get('error'))[:100])
else:
    print('unknown:' + str(d)[:80])
" 2>/dev/null || echo "no_response")
if [ "$EMBED_OK" = "ok" ]; then
  log "Embeddings: OK"
  recover "embeddings_fail" "Embedding pipeline restored"
elif echo "$EMBED_OK" | grep -q "^error:"; then
  alert "embeddings_fail" "Embedding pipeline *FAILING*
- Error: ${EMBED_OK#error:}
- Check Ollama is running and local models are pulled: \`qwen2.5:3b\`, \`nomic-embed-text\`"
else
  alert "embeddings_fail" "Embedding pipeline returned *unexpected/no response*
- Result: ${EMBED_OK}
- Timeout: ${MEM0_WRITE_TIMEOUT_SECONDS}s
- Check \`tail -50 $MEM0_LOG_DIR/mem0-server.log\`"
fi

# ── Check 1.9: mem0-server CPU runaway ──────────────────────────────────────
log "Checking mem0-server CPU usage..."
MEM0_PID=$(pgrep -f "uvicorn mem0-server" | head -1 || echo "")
if [ -z "$MEM0_PID" ]; then
  alert "mem0_process_missing" "mem0-server process *NOT FOUND*
- It may have crashed or was never started
- Restart: \`launchctl kickstart -k gui/\$(id -u)/com.mem0.server\`"
else
  recover "mem0_process_missing" "mem0-server process is running again (PID $MEM0_PID)"
  MEM0_CPU=$(ps -p "$MEM0_PID" -o %cpu= 2>/dev/null | tr -d ' ' | cut -d. -f1)
  MEM0_CPU="${MEM0_CPU:-0}"
  if [ "${MEM0_CPU:-0}" -ge "${MEM0_CPU_ALERT_THRESHOLD:-200}" ] 2>/dev/null; then
    alert "mem0_cpu_runaway" "mem0-server *CPU RUNAWAY: ${MEM0_CPU}%* (PID $MEM0_PID)
- Qdrant reconnect + Ollama model-pull loop burning CPU
- Check: \`tail -50 $MEM0_LOG_DIR/mem0-server.log\`
- Safe to kill and restart: \`kill $MEM0_PID\`
- Then: \`launchctl kickstart -k gui/\$(id -u)/com.mem0.server\`"
  else
    log "mem0-server CPU: ${MEM0_CPU}% (PID $MEM0_PID, OK)"
    recover "mem0_cpu_runaway" "mem0-server CPU normalized: ${MEM0_CPU}%"
  fi
fi

if [ "${MEMORY_HEALTHCHECK_ONLY:-0}" = "1" ]; then
  log "--- memory healthcheck complete ---"
  exit 0
fi

# ── Check 4: Tailscale ───────────────────────────────────────────────────────
log "Checking Tailscale..."
TS_STATE=$(tailscale status --json 2>/dev/null | python3 -c "import sys,json; print(json.loads(sys.stdin.read()).get('BackendState','unknown'))" 2>/dev/null || echo "unknown")
if [ "$TS_STATE" = "Running" ]; then
  log "Tailscale: Running"
  recover "tailscale_down" "Tailscale is back online"
  if [ -n "$TAILSCALE_PEERS" ]; then
    # Space-separated name:host entries, e.g. "sophia:$SOPHIA_TS_HOST maria:$MARIA_TS_HOST".
    for peer_def in $TAILSCALE_PEERS; do
      peer_name="${peer_def%%:*}"
      peer_host="${peer_def#*:}"
      if ping -c 1 -W 3 "$peer_host" > /dev/null 2>&1; then
        log "Tailscale peer $peer_name: reachable"
        recover "ts_peer_${peer_name}" "Tailscale peer $peer_name reachable again"
      else
        alert "ts_peer_${peer_name}" "Tailscale peer *$peer_name* *UNREACHABLE*"
      fi
    done
  else
    log "Tailscale peer checks skipped; set TAILSCALE_PEERS to enable"
  fi
else
  log "Tailscale: $TS_STATE (may take time to connect)"
  # Don't alert for Tailscale - it often shows "unknown" briefly
fi

# ── Check 5: Cloudflare Tunnel ───────────────────────────────────────────────
log "Checking Cloudflare tunnel..."
CF_PID=$(pgrep -f "cloudflared tunnel" 2>/dev/null | head -1 || echo "")
if [ -n "$CF_PID" ]; then
  log "Cloudflare tunnel: running (PID $CF_PID)"
  recover "cloudflare_process_down" "Cloudflare tunnel process running again"
  # Spot-check a configured public endpoint without storing private domains in source.
  if [ -n "$CLOUDFLARE_HEALTH_URL" ] && check_http "$CLOUDFLARE_HEALTH_URL"; then
    log "Cloudflare tunnel: public endpoints responding"
    recover "cloudflare_endpoints_down" "Cloudflare public endpoints responding"
  elif [ -n "$CLOUDFLARE_HEALTH_URL" ]; then
    alert "cloudflare_endpoints_down" "Cloudflare running but *public endpoints not responding*
- Endpoints: pc, gwen, alba, nerve, msg all may be down
- \`tail -50 ~/.cloudflared/cloudflared.err\`"
  else
    log "Cloudflare endpoint check skipped; set CLOUDFLARE_HEALTH_URL to enable"
  fi
else
  alert "cloudflare_process_down" "Cloudflare tunnel *NOT RUNNING*
- All public endpoints offline (pc, gwen, alba, nerve, msg)
- Restart: \`launchctl kickstart -k gui/\$(id -u)/com.cloudflare.cloudflared\`"
fi

# ── Check 6: Agent Connectivity ──────────────────────────────────────────────
log "Checking agent gateways..."

check_agent() {
  local name="$1"
  local url="$2"
  local alert_id="agent_${name}"
  local body status
  body=$(curl -s --max-time 6 "$url" 2>/dev/null)
  status=$(echo "$body" | python3 -c "import sys,json; d=json.loads(sys.stdin.read()); print(d.get('status',d.get('ok','?')))" 2>/dev/null || echo "no_json")
  if [ "$status" = "ok" ] || [ "$status" = "True" ] || [ "$status" = "healthy" ] || [ "$status" = "running" ] || [ "$status" = "live" ]; then
    log "Agent $name: OK"
    recover "$alert_id" "Agent $name is back online"
  elif [ "$status" = "no_json" ] && check_http "$url"; then
    log "Agent $name: responding (non-JSON)"
    recover "$alert_id" "Agent $name is back online"
  else
    alert "$alert_id" "Agent *$name* is *DOWN* at \`$url\`"
  fi
}

check_agent "gateway"    "http://localhost:18789/health"
check_agent "nerve"      "http://localhost:3080/health"
if [ -n "$KILOCLAW_HEALTH_URL" ]; then
  check_agent "kiloclaw" "$KILOCLAW_HEALTH_URL"
else
  log "KiloClaw health check skipped; set KILOCLAW_HEALTH_URL to enable"
fi

# Paperclip local
if check_http "http://localhost:3100/api/health" || check_http "http://localhost:3100/api/companies"; then
  log "Paperclip: OK"
  recover "agent_paperclip" "Paperclip is back online"
else
  alert "agent_paperclip" "Paperclip is *DOWN* at \`localhost:3100\`"
fi

# Lucia - Kilo Claw Paperclip agent status
if [ -n "$LUCIA_PC_TOKEN" ]; then
  export LUCIA_PC_TOKEN LUCIA_PC_AGENT_URL LUCIA_PC_HOST
  LUCIA_PC_STATUS=$(python3 -c "
import os, urllib.request, json
try:
    headers = {'Authorization': 'Bearer ' + os.environ['LUCIA_PC_TOKEN']}
    host = os.environ.get('LUCIA_PC_HOST', '')
    if host:
        headers['Host'] = host
    req = urllib.request.Request(os.environ['LUCIA_PC_AGENT_URL'], headers=headers)
    resp = urllib.request.urlopen(req, timeout=6)
    a = json.loads(resp.read())
    status = a.get('status', '?')
    pause = a.get('pauseReason', '')
    print(f'{status}:{pause}' if pause else status)
except Exception as e:
    print(f'error:{e}')
" 2>/dev/null || echo "error:unreachable")
  LUCIA_STATUS_PART="${LUCIA_PC_STATUS%%:*}"
  LUCIA_PAUSE_PART="${LUCIA_PC_STATUS#*:}"
  if [ "$LUCIA_STATUS_PART" = "active" ] || [ "$LUCIA_STATUS_PART" = "idle" ]; then
    log "Lucia (Kilo Claw) Paperclip: $LUCIA_STATUS_PART"
    recover "lucia_paperclip_bad" "Lucia Kilo Claw agent is active again"
  elif [ "$LUCIA_STATUS_PART" = "paused" ] || [ "$LUCIA_STATUS_PART" = "terminated" ]; then
    alert "lucia_paperclip_bad" "Lucia (Kilo Claw) Paperclip agent is *${LUCIA_STATUS_PART}*
- Reason: ${LUCIA_PAUSE_PART:-none}
- Unpause: \`curl -X PATCH \"\$LUCIA_PC_AGENT_URL\" -H 'Authorization: Bearer $LUCIA_PC_TOKEN' -H \"Host: \$LUCIA_PC_HOST\" -H 'Content-Type: application/json' -d '{\"status\":\"active\"}'\`"
  elif echo "$LUCIA_STATUS_PART" | grep -q "^error"; then
    log "Lucia (Kilo Claw) Paperclip: status check failed (${LUCIA_PAUSE_PART}) — skipping alert"
  else
    log "Lucia (Kilo Claw) Paperclip: status=$LUCIA_PC_STATUS"
  fi
else
  log "Lucia (Kilo Claw) Paperclip check skipped; set LUCIA_PC_TOKEN to enable"
fi

# Remote agents via Tailscale
if [ "$TS_STATE" = "Running" ]; then
  if [ -n "$REMOTE_AGENT_HEALTH_URLS" ]; then
    # Space-separated name:url entries. Keep private hosts in local env, not source.
    for agent_def in $REMOTE_AGENT_HEALTH_URLS; do
      agent_name="${agent_def%%:*}"
      agent_url="${agent_def#*:}"
      check_agent "$agent_name" "$agent_url"
    done
  else
    log "Remote agent checks skipped; set REMOTE_AGENT_HEALTH_URLS to enable"
  fi
else
  log "Skipping remote agents (Tailscale not running)"
fi

# launchd gateway service state
# Note: com.openclaw.nerve is the main gateway service
for svc in "com.openclaw.nerve" "ai.hermes.gateway"; do
  SVC_LINE=$(launchctl list 2>/dev/null | grep "$svc" || echo "")
  if [ -z "$SVC_LINE" ]; then
    # Only alert for hermes gateway, not nerve (nerve is optional)
    if [ "$svc" = "ai.hermes.gateway" ]; then
      alert "launchd_${svc//[.-]/_}" "launchd service *$svc* not found
- Load: \`launchctl load ~/Library/LaunchAgents/${svc}.plist\`"
    else
      log "launchd $svc: not loaded (optional)"
    fi
  else
    SVC_PID=$(echo "$SVC_LINE" | awk '{print $1}')
    if [ "$SVC_PID" = "-" ]; then
      if [ "$svc" = "ai.hermes.gateway" ]; then
        alert "launchd_${svc//[.-]/_}" "launchd service *$svc* has no PID (not running)
- Restart: \`launchctl kickstart -k gui/\$(id -u)/$svc\`"
      fi
    else
      log "launchd $svc: running (PID $SVC_PID)"
      recover "launchd_${svc//[.-]/_}" "launchd service $svc is running again"
    fi
  fi
done

# ── Check 7: Agent-Lightning ─────────────────────────────────────────────────
log "Checking Agent-Lightning..."

# 7a: venv exists
AL_DIR="$HOME/github/agent-lightning"
AL_VENV="$AL_DIR/.venv"
if [ ! -d "$AL_VENV" ]; then
  alert "al_venv_missing" "Agent-Lightning *venv missing* at \`$AL_VENV\`
- Rebuild: \`cd $AL_DIR && python3 -m venv .venv && .venv/bin/pip install -e .\`"
else
  log "Agent-Lightning: venv OK"
  recover "al_venv_missing" "Agent-Lightning venv restored"
fi

# 7b: cron ran recently (check log modified time, max 8h ago since it runs every 6h)
AL_LOG="$HOME/.openclaw/logs/agent-lightning-cron.log"
if [ -f "$AL_LOG" ]; then
  LOG_MTIME=$(stat -f %m "$AL_LOG" 2>/dev/null || echo "0")
  LOG_AGE=$(( NOW - LOG_MTIME ))
  if [ "$LOG_AGE" -gt 28800 ]; then  # >8h
    alert "al_cron_stale" "Agent-Lightning cron *has not run in ${LOG_AGE}s* (>8h)
- Check cron: \`crontab -l | grep agent-lightning\`
- Run manually: \`bash ~/.openclaw/scripts/agent-lightning-cron.sh\`"
  else
    log "Agent-Lightning: cron last ran ${LOG_AGE}s ago (OK)"
    recover "al_cron_stale" "Agent-Lightning cron running again"
  fi
else
  alert "al_cron_stale" "Agent-Lightning cron log *not found* at \`$AL_LOG\`
- Cron may never have run
- Check: \`crontab -l | grep agent-lightning\`"
fi

# 7c: check for stale unprocessed proposals (>2 means executor is stuck)
AL_PROPOSALS="$HOME/.openclaw/skills/proposals"
if [ -d "$AL_PROPOSALS" ]; then
  PENDING=$(ls "$AL_PROPOSALS"/APO_PROPOSAL_*.md 2>/dev/null | wc -l | tr -d ' ')
  if [ "$PENDING" -gt 3 ]; then
    alert "al_proposals_stuck" "Agent-Lightning has *${PENDING} unprocessed proposals* — executor may be stuck
- Check: \`ls ~/.openclaw/skills/proposals/\`
- Run executor: \`source $AL_VENV/bin/activate && python3 ~/.openclaw/scripts/agent-lightning-apo-executor.py\`"
  else
    log "Agent-Lightning: $PENDING pending proposals (OK)"
    recover "al_proposals_stuck" "Agent-Lightning proposal backlog cleared"
  fi
fi

# 7d: check last cron log for errors
if [ -f "$AL_LOG" ]; then
  RECENT_ERRORS=$(tail -30 "$AL_LOG" | grep -ci "error\|traceback\|exception" 2>/dev/null || true)
  RECENT_ERRORS="${RECENT_ERRORS//[^0-9]/}"
  RECENT_ERRORS="${RECENT_ERRORS:-0}"
  if [ "$RECENT_ERRORS" -gt 0 ]; then
    LAST_ERR=$(tail -30 "$AL_LOG" | grep -i "error\|traceback\|exception" | tail -1)
    alert "al_cron_errors" "Agent-Lightning cron has *${RECENT_ERRORS} recent errors*
- Last: $LAST_ERR
- Log: \`tail -50 $AL_LOG\`"
  else
    log "Agent-Lightning: no recent errors in cron log"
    recover "al_cron_errors" "Agent-Lightning cron errors resolved"
  fi
fi

# ── Check 8: GitHub remote sync ───────────────────────────────────────────────
log "Checking GitHub remote (lac5q/agent-knowledge)..."
if [ -d "$KNOWLEDGE_DIR/.git" ]; then
  if git -C "$KNOWLEDGE_DIR" ls-remote --exit-code origin HEAD > /dev/null 2>&1; then
    recover "github_unreachable" "GitHub remote is reachable again"
    git -C "$KNOWLEDGE_DIR" fetch origin --quiet 2>/dev/null || true
    LOCAL=$(git -C "$KNOWLEDGE_DIR" rev-parse HEAD 2>/dev/null)
    REMOTE=$(git -C "$KNOWLEDGE_DIR" rev-parse origin/master 2>/dev/null || \
             git -C "$KNOWLEDGE_DIR" rev-parse origin/main 2>/dev/null || echo "unknown")
    if [ "$LOCAL" = "$REMOTE" ]; then
      log "Knowledge repo: in sync"
      recover "knowledge_drift" "Knowledge repo back in sync"
      recover "knowledge_unpushed" "Knowledge repo commits pushed"
    else
      BEHIND=$(git -C "$KNOWLEDGE_DIR" rev-list --count HEAD..origin/master 2>/dev/null || echo "0")
      AHEAD=$(git -C "$KNOWLEDGE_DIR" rev-list --count origin/master..HEAD 2>/dev/null || echo "0")
      [ "$BEHIND" != "0" ] && alert "knowledge_drift" "Knowledge repo *${BEHIND} commits behind* remote
- Fix: \`cd $KNOWLEDGE_DIR && git pull\`"
      [ "$AHEAD" != "0" ] && alert "knowledge_unpushed" "Knowledge repo has *${AHEAD} unpushed commits*
- Fix: \`cd $KNOWLEDGE_DIR && git push origin master\`"
    fi
  else
    alert "github_unreachable" "GitHub remote \`lac5q/agent-knowledge\` *UNREACHABLE*"
  fi
fi

log "--- healthcheck complete ---"
