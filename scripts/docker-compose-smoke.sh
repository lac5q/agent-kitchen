#!/usr/bin/env bash
set -euo pipefail

MODE="${1:---config-only}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"

export QDRANT_URL="${QDRANT_URL:-https://example-qdrant.invalid}"
export QDRANT_API_KEY="${QDRANT_API_KEY:-ci-placeholder}"
export GEMINI_API_KEY="${GEMINI_API_KEY:-ci-placeholder}"
export MEMROOS_OPERATOR_API_KEY="${MEMROOS_OPERATOR_API_KEY:-ci-operator-placeholder}"
export MEMROOS_JWT_SECRET="${MEMROOS_JWT_SECRET:-ci-jwt-secret-change-me-32chars}"
export MEMROOS_DOCKER_NEO4J_PASSWORD="${MEMROOS_DOCKER_NEO4J_PASSWORD:-ci-neo4j-placeholder}"

compose() {
  if docker compose version >/dev/null 2>&1; then
    docker compose -f "$COMPOSE_FILE" "$@"
  elif command -v docker-compose >/dev/null 2>&1; then
    docker-compose -f "$COMPOSE_FILE" "$@"
  else
    echo "Docker Compose is required for smoke checks" >&2
    exit 1
  fi
}

case "$MODE" in
  --config-only)
    compose config --quiet
    ;;
  --build)
    compose config --quiet
    compose build memroos
    ;;
  --up)
    trap 'compose down --remove-orphans -v >/dev/null 2>&1 || true' EXIT
    compose config --quiet
    compose up -d --build memroos
    timeout 120 bash -c 'until curl -fsS "http://127.0.0.1:${MEMROOS_PORT:-3000}/" >/dev/null; do sleep 3; done'
    ;;
  *)
    echo "Usage: $0 [--config-only|--build|--up]" >&2
    exit 2
    ;;
esac
