#!/bin/bash
# Knowledge stack health monitor — comprehensive
# Checks: disk, SQLite, Mem0, Qdrant cloud, QMD, embeddings,
#         Tailscale peers, Cloudflare tunnel, all agent gateways,
#         Agent-Lightning venv/cron/proposals, GitHub sync
# Alerts via Telegram + Discord on failure

set -uo pipefail

# ── Config ─────────────────────────────────────────────────────────────────
MEM0_URL="http://localhost:3201"
QMD_URL="http://localhost:9472"
KNOWLEDGE_DIR="$HOME/github/knowledge"
ALERT_STATE_DIR="/tmp/knowledge-healthcheck"
COOLDOWN_SECONDS=1800  # 30 min between repeat alerts for same issue
LOG_TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)
NOW=$(date +%s)
LOG_FILE="$KNOWLEDGE_DIR/logs/healthcheck.log"

DISK_CRITICAL_PERCENT=95
DISK_WARNING_PERCENT=90

TG_TOKEN="8115005529:AAHWFB7J6dbvraheKnO-YhDKpoq2Yme23D8"
TG_CHAT_ID="6334964912"
DISCORD_WEBHOOK_URL="${DISCORD_KNOWLEDGE_WEBHOOK:-}"

mkdir -p "$ALERT_STATE_DIR"
mkdir -p "$(dirname "$LOG_FILE")"

# ── Helpers ─────────────────────────────────────────────────────────────────
log() { echo "[$LOG_TS] $1" | tee -a "$LOG_FILE"; }

send_telegram() {
  curl -s --max-time 10 \
    "https://api.telegram.org/bot${TG_TOKEN}/sendMessage" \
    -d chat_id="$TG_CHAT_ID" \
    -d parse_mode="Markdown" \
    -d text="$1" > /dev/null 2>&1
}

send_discord() {
  if [ -z "$DISCORD_WEBHOOK_URL" ]; then return 0; fi
  local msg
  msg=$(echo "$1" | sed 's/\*\([^*]*\)\*/**\1**/g')
  curl -s --max-time 10 -X POST "$DISCORD_WEBHOOK_URL" \
    -H "Content-Type: application/json" \
    -d "{\"content\": $(echo "$msg" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')}" \
    > /dev/null 2>&1
}

notify() { send_telegram "$1"; send_discord "$1"; }

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
    notify "🚨 *Knowledge Stack Alert*
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
    notify "✅ *Knowledge Stack Recovered*
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
MEM0_HEALTH=$(curl -s --max-time 6 "$MEM0_URL/health" 2>/dev/null)
MEM0_STATUS=$(json_field "$MEM0_HEALTH" "status")
if [ "$MEM0_STATUS" = "ok" ]; then
  QDRANT_STATUS=$(json_field "$MEM0_HEALTH" "vector_store")
  log "Mem0: OK (vector_store: $QDRANT_STATUS)"
  recover "mem0_down" "Mem0 is back online"
  recover "mem0_degraded" "Mem0 is no longer degraded"
  if [ "$QDRANT_STATUS" != "connected" ]; then
    alert "qdrant_via_mem0" "Mem0 up but *Qdrant not connected* (status: $QDRANT_STATUS)
- Semantic memory writes will fail
- \`tail -50 $KNOWLEDGE_DIR/logs/mem0-server.log\`"
  else
    recover "qdrant_via_mem0" "Qdrant reconnected via Mem0"
  fi
elif [ "$MEM0_STATUS" = "degraded" ]; then
  alert "mem0_degraded" "Mem0 is *DEGRADED*
- \`tail -50 $KNOWLEDGE_DIR/logs/mem0-server.log\`"
else
  alert "mem0_down" "Mem0 is *DOWN* at \`$MEM0_URL\`
- Restart: \`launchctl kickstart -k gui/\$(id -u)/com.mem0.server\`"
fi

# ── Check 1.5: Mem0 failures ─────────────────────────────────────────────────
FAILURE_LOG="$KNOWLEDGE_DIR/logs/failures.log"
if [ -f "$FAILURE_LOG" ]; then
  RECENT_FAILURES=$(tail -10 "$FAILURE_LOG" 2>/dev/null | grep -c "error" 2>/dev/null || true)
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
QDRANT_CLOUD="https://f969d77f-3cf6-4557-92cb-67f7cac0f44a.us-west-1-0.aws.cloud.qdrant.io:6333"
QDRANT_APIKEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhY2Nlc3MiOiJtIiwic3ViamVjdCI6ImFwaS1rZXk6OTIxY2YwZmQtODBmMS00NmYxLTlmYTAtNzFlY2Q3MmMxOTI2In0.U5YQAYDcIs6ilqp-45_DF6GJ8pbmXCzvJ5epqUbuGbM"
QDRANT_RESP=$(curl -s --max-time 10 -H "api-key: $QDRANT_APIKEY" "$QDRANT_CLOUD/collections" 2>/dev/null)
QDRANT_OK=$(json_field "$QDRANT_RESP" "status")
if [ "$QDRANT_OK" = "ok" ]; then
  COLL_COUNT=$(echo "$QDRANT_RESP" | python3 -c "import sys,json; d=json.loads(sys.stdin.read()); print(len(d.get('result',{}).get('collections',[])))" 2>/dev/null || echo "?")
  log "Qdrant cloud: OK ($COLL_COUNT collections)"
  recover "qdrant_cloud_down" "Qdrant cloud is back online"
else
  alert "qdrant_cloud_down" "Qdrant cloud *unreachable*
- Mem0 vector memory non-functional
- Check Qdrant Cloud dashboard for outage"
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

# ── Check 3: Embeddings (Mem0 add round-trip) ────────────────────────────────
log "Checking embedding pipeline (Mem0 /memory/add round-trip)..."
EMBED_RESP=$(curl -s --max-time 20 -X POST "$MEM0_URL/memory/add" \
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
- Check Gemini API key in \`$KNOWLEDGE_DIR/mem0-config.yaml\`"
else
  log "Embeddings: unexpected response ($EMBED_OK) — not alerting"
fi

# ── Check 4: Tailscale ───────────────────────────────────────────────────────
log "Checking Tailscale..."
TS_STATE=$(tailscale status --json 2>/dev/null | python3 -c "import sys,json; print(json.loads(sys.stdin.read()).get('BackendState','unknown'))" 2>/dev/null || echo "unknown")
if [ "$TS_STATE" = "Running" ]; then
  log "Tailscale: Running"
  recover "tailscale_down" "Tailscale is back online"
  # Check peers
  for peer_def in "sophia:100.101.88.44" "maria:100.109.19.110"; do
    peer_name="${peer_def%%:*}"
    peer_ip="${peer_def##*:}"
    if ping -c 1 -W 3 "$peer_ip" > /dev/null 2>&1; then
      log "Tailscale peer $peer_name ($peer_ip): reachable"
      recover "ts_peer_${peer_name}" "Tailscale peer $peer_name reachable again"
    else
      alert "ts_peer_${peer_name}" "Tailscale peer *$peer_name* ($peer_ip) *UNREACHABLE*"
    fi
  done
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
  # Spot-check a public endpoint
  if check_http "https://gwen.epiloguecapital.com/health"; then
    log "Cloudflare tunnel: public endpoints responding"
    recover "cloudflare_endpoints_down" "Cloudflare public endpoints responding"
  else
    alert "cloudflare_endpoints_down" "Cloudflare running but *public endpoints not responding*
- Endpoints: pc, gwen, alba, nerve, msg all may be down
- \`tail -50 ~/.cloudflared/cloudflared.err\`"
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
check_agent "kiloclaw"   "https://lucia.epiloguecapital.com/health"

# Paperclip local
if check_http "http://localhost:3100/api/health" || check_http "http://localhost:3100/api/companies"; then
  log "Paperclip: OK"
  recover "agent_paperclip" "Paperclip is back online"
else
  alert "agent_paperclip" "Paperclip is *DOWN* at \`localhost:3100\`"
fi

# Lucia - Kilo Claw Paperclip agent status
LUCIA_PC_TOKEN="pcp_b1d5a6eadfc4cf69487598fde4587858f707362e9771f29e"
LUCIA_PC_STATUS=$(python3 -c "
import urllib.request, json, sys
try:
    req = urllib.request.Request(
        'http://localhost:3100/api/agents/87d756ee-ece7-4dde-b1f9-6e0b6c398d28',
        headers={'Authorization': 'Bearer $LUCIA_PC_TOKEN', 'Host': 'pc.epiloguecapital.com'}
    )
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
- Unpause: \`curl -X PATCH http://localhost:3100/api/agents/87d756ee-ece7-4dde-b1f9-6e0b6c398d28 -H 'Authorization: Bearer $LUCIA_PC_TOKEN' -H 'Host: pc.epiloguecapital.com' -H 'Content-Type: application/json' -d '{\"status\":\"active\"}'\`"
elif echo "$LUCIA_STATUS_PART" | grep -q "^error"; then
  log "Lucia (Kilo Claw) Paperclip: status check failed (${LUCIA_PAUSE_PART}) — skipping alert"
else
  log "Lucia (Kilo Claw) Paperclip: status=$LUCIA_PC_STATUS"
fi

# Remote agents via Tailscale
if [ "$TS_STATE" = "Running" ]; then
  check_agent "sophia" "http://100.101.88.44:18889/health"
  check_agent "maria"  "http://100.109.19.110:8644/health"
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
