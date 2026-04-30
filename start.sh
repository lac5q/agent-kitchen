#!/usr/bin/env bash
# Agent Kitchen — start all services
# Usage: ./start.sh
# Kills any existing instances on the same ports first.

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

KITCHEN_DIR="$SCRIPT_DIR/apps/kitchen"
VOICE_DIR="$SCRIPT_DIR/services/voice-server"
NEXTJS_PORT=3002
PIPECAT_PORT=7860
HEALTH_PORT=7861
AGENTMEMORY_PORT=3111
VENV="$VOICE_DIR/.venv/bin/python3.12"

# ── Kill existing processes on our ports ─────────────────────────────────────
for port in $NEXTJS_PORT $PIPECAT_PORT $HEALTH_PORT $AGENTMEMORY_PORT; do
  pids=$(lsof -ti ":$port" 2>/dev/null) || true
  if [ -n "$pids" ]; then
    echo "Killing existing process on port $port..."
    echo "$pids" | xargs kill -9 2>/dev/null || true
  fi
done
sleep 1

# ── Start agentmemory (iii-engine backend on port 3111) ──────────────────────
echo "Starting agentmemory server (port $AGENTMEMORY_PORT)..."
# Use minimal config (6 workers vs default 10)
III_CONFIG="$SCRIPT_DIR/iii-config.yaml" \
  npx @agentmemory/agentmemory >/tmp/agentmemory.log 2>&1 &
AGENTMEMORY_PID=$!
echo "  agentmemory PID: $AGENTMEMORY_PID"

# ── Start Python voice servers ────────────────────────────────────────────────
if [ -x "$VENV" ]; then
  echo "Starting Pipecat voice server (port $PIPECAT_PORT)..."
  PYTHONPATH="$VOICE_DIR" "$VENV" "$VOICE_DIR/server.py" \
    >/tmp/voice-server.log 2>&1 &
  VOICE_PID=$!

  echo "Starting Pipecat health API (port $HEALTH_PORT)..."
  PYTHONPATH="$VOICE_DIR" "$VENV" "$VOICE_DIR/health.py" \
    >/tmp/voice-health.log 2>&1 &
  HEALTH_PID=$!

  echo "  Voice server PID: $VOICE_PID"
  echo "  Health API PID:   $HEALTH_PID"
else
  echo "Warning: Python venv not found at $VENV — skipping voice servers."
  echo "Run: python3.12 -m venv services/voice-server/.venv && services/voice-server/.venv/bin/pip install -r services/voice-server/requirements.txt"
fi

# ── Start Next.js (production) ────────────────────────────────────────────────
echo "Starting Next.js on port $NEXTJS_PORT..."
NEXT_BIN="$KITCHEN_DIR/node_modules/.bin/next"
if [ ! -x "$NEXT_BIN" ]; then
  NEXT_BIN="$SCRIPT_DIR/node_modules/.bin/next"
fi
cd "$KITCHEN_DIR"
exec "$NEXT_BIN" start --port "$NEXTJS_PORT"
