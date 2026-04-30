#!/bin/bash
# Start Mem0 agent memory service
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

if [ -f .venv/bin/activate ]; then
  source .venv/bin/activate
elif [ -f /Users/lcalderon/github/knowledge/.venv/bin/activate ]; then
  source /Users/lcalderon/github/knowledge/.venv/bin/activate
fi

# Load API keys from .env file
if [ -f .env ]; then
    set -a
    source .env
    set +a
fi

echo "Starting Mem0 server on port 3201..."
uvicorn mem0-server:app --host 0.0.0.0 --port 3201
