#!/usr/bin/env bash
# Stable scheduler entrypoint. Secrets/configuration may be supplied through
# ~/.memroos/observe.env; the repo never writes secret values into scheduler
# manifests.

set -euo pipefail
ROOT="${MEMROOS_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
ENV_FILE="${MEMROOS_SCHEDULE_ENV:-${HOME:-/tmp}/.memroos/observe.env}"
if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  set -a
  source "$ENV_FILE"
  set +a
fi

NODE_BIN="${MEMROOS_NODE_BIN:-$(command -v node)}"
LOG_DIR="${MEMROOS_HOOK_ROOT:-${HOME:-/tmp}/.memroos}/logs"
mkdir -p "$LOG_DIR"
exec "$NODE_BIN" "$ROOT/scripts/run-observe-sidecar.mjs" >>"$LOG_DIR/observe-sidecar.log" 2>&1
