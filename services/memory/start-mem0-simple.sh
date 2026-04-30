#!/bin/bash
#
# Simple Mem0 Server Starter
# Use this for manual starts or with launchd
#

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

LOG_FILE="$SCRIPT_DIR/logs/mem0-server.log"
mkdir -p "$SCRIPT_DIR/logs"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting Mem0 server..." | tee -a "$LOG_FILE"

# Load environment variables
if [ -f "$SCRIPT_DIR/.env" ]; then
    set -a
    source "$SCRIPT_DIR/.env"
    set +a
fi

# Activate virtual environment
if [ -f "$SCRIPT_DIR/.venv/bin/activate" ]; then
    source "$SCRIPT_DIR/.venv/bin/activate"
elif [ -f "${KNOWLEDGE_VENV:-$HOME/github/knowledge/.venv}/bin/activate" ]; then
    source "${KNOWLEDGE_VENV:-$HOME/github/knowledge/.venv}/bin/activate"
fi

# Start uvicorn (will run in foreground)
exec uvicorn mem0-server:app \
    --host 0.0.0.0 \
    --port 3201 \
    --log-level info \
    >> "$LOG_FILE" 2>&1
