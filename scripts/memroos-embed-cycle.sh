#!/bin/bash
# STORECON-05 (Phase 198) — drain the embedding backlog.
#
# The in-process embedding job (startEmbeddingJob) logs no error but its
# setInterval does not survive in the Next.js server runtime. The pipeline
# itself works (Ollama returns valid 768-dim vectors), so the cycle is driven
# externally by cron.
#
# The cycle script lives ON THE HOST and is copied into the container each
# run. An earlier version left it only inside the container, where the next
# restart deleted it — the exact "does not survive restarts" failure class
# Phase 196 exists to prevent.
#
# Idempotent: selects only messages with no embedding row. Safe to overlap.
set -uo pipefail
LOG=/home/opc/memroos/.health/embed.log
mkdir -p "$(dirname "$LOG")"
docker cp /home/opc/memroos/scripts/embed-cycle.js memroos-local-memroos-1:/tmp/embed-cycle.js >/dev/null 2>&1
RESULT=$(docker exec -e NODE_PATH=/app/node_modules -e EMBED_LIMIT="${EMBED_LIMIT:-300}" \
  memroos-local-memroos-1 node /tmp/embed-cycle.js 2>&1 | tail -1)
echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $RESULT" >> "$LOG"
