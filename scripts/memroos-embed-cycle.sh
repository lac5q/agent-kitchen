#!/bin/bash
# STORECON-05 (Phase 198) — drain the embedding backlog.
#
# The in-process embedding job (startEmbeddingJob) logs no error but its
# setInterval does not survive in the Next.js server runtime: after a restart
# it embedded one batch and then stopped. The pipeline itself is fine — Ollama
# returns valid 768-dim vectors and writes succeed. So the cycle is driven
# externally where a scheduler is reliable.
#
# Idempotent: selects only messages with no embedding row. Safe to overlap.
set -uo pipefail
LOG=/home/opc/memroos/.health/embed.log
mkdir -p "$(dirname "$LOG")"
RESULT=$(docker exec -e NODE_PATH=/app/node_modules -e EMBED_LIMIT="${EMBED_LIMIT:-300}" \
  memroos-local-memroos-1 node /app/embed-cycle.js 2>&1 | tail -1)
echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $RESULT" >> "$LOG"
