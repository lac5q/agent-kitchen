#!/usr/bin/env bash
# Regression checks for memory degradation visibility.
# Covers UI/API status, mem0 queue degradation, launchd monitor config, and shell syntax.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
PYTHON_BIN="${PYTHON_BIN:-$ROOT_DIR/.venv/bin/python3}"
if [ ! -x "$PYTHON_BIN" ]; then
  PYTHON_BIN="$(command -v python3)"
fi
PYTEST_CMD=("$PYTHON_BIN" -m pytest)
if ! "$PYTHON_BIN" -m pytest --version >/dev/null 2>&1; then
  SYSTEM_PYTHON_BIN="$(command -v python3)"
  if [ -n "$SYSTEM_PYTHON_BIN" ] && "$SYSTEM_PYTHON_BIN" -m pytest --version >/dev/null 2>&1; then
    PYTHON_BIN="$SYSTEM_PYTHON_BIN"
    PYTEST_CMD=("$PYTHON_BIN" -m pytest)
  elif command -v uv >/dev/null 2>&1; then
    PYTEST_CMD=(uv run --with pytest --with httpx -- python -m pytest)
  fi
fi

echo "[memory-degradation] checking shell and launchd configs"
bash -n services/memory/healthcheck.sh
node scripts/install-memory-resilience.mjs check
node --test scripts/check-knowledge-indexing.test.mjs
node --test scripts/check-knowledge-save-contract.test.mjs
node scripts/check-knowledge-save-contract.mjs --fixture evals/knowledge-save-contract/cases.json
node --test scripts/check-recall-anchors.test.mjs

echo "[memory-degradation] checking mem0 queue and health degradation"
"${PYTEST_CMD[@]}" services/memory/tests/test_mem0_queue.py
if [ -n "${MEMROOS_RECALL_ANCHORS_PATH:-}" ] || [ -f evals/memory-recall/critical-anchors.local.json ]; then
  node scripts/check-recall-anchors.mjs --require-mem0
else
  node scripts/check-recall-anchors.mjs --skip-mem0
fi

echo "[memory-degradation] checking Memroos memory health UI/API"
npm --prefix apps/memroos run test -- --run \
  src/app/api/health/__tests__/route.test.ts \
  src/app/api/memory/__tests__/tier-routes.test.ts \
  src/components/ledger/__tests__/memory-intelligence-panel.test.tsx

echo "[memory-degradation] complete"
