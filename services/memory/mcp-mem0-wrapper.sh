#!/bin/bash
# Wrapper for mcp-mem0.py that prevents zombie accumulation.
# Kills any existing instance before spawning a fresh one.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$SCRIPT_DIR/mcp-mem0.py"

if [ -x "$SCRIPT_DIR/.venv/bin/python" ]; then
  PYTHON="$SCRIPT_DIR/.venv/bin/python"
elif [ -x "/Users/lcalderon/github/knowledge/.venv/bin/python" ]; then
  PYTHON="/Users/lcalderon/github/knowledge/.venv/bin/python"
else
  PYTHON="python3"
fi

# Kill any orphaned instances (previous sessions)
pkill -f "mcp-mem0.py" 2>/dev/null
sleep 0.3

exec "$PYTHON" "$SCRIPT"
