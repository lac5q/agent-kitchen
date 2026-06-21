#!/usr/bin/env bash
# launchd entrypoint for MemroOS.
# Runs the real Next server as the launchd-tracked process. Avoid npm wrapper
# chains here: if next-server exits but npm survives, launchd thinks Memroos is
# still healthy while nothing is listening on :3002.

set -u
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$REPO_DIR/logs"
mkdir -p "$LOG_DIR"
export USER="${USER:-$(id -un)}"
export HOME="${HOME:-/Users/$USER}"
export LOGNAME="${LOGNAME:-$USER}"
export TMPDIR="${TMPDIR:-/tmp}"
RUNTIME_ENV_FILE="${MEMROOS_RUNTIME_ENV_FILE:-$HOME/.memroos/memroos-runtime.env}"
if [ -f "$RUNTIME_ENV_FILE" ]; then
  set -a
  . "$RUNTIME_ENV_FILE"
  set +a
fi
NODE_BIN="${MEMROOS_NODE_BIN:-}"
if [ -z "$NODE_BIN" ]; then
  if [ -x /opt/homebrew/opt/node@22/bin/node ]; then
    NODE_BIN=/opt/homebrew/opt/node@22/bin/node
  else
    NODE_BIN=/opt/homebrew/bin/node
  fi
fi

runtime_topology_port() {
  "$NODE_BIN" "$REPO_DIR/scripts/check-runtime-topology.mjs" port "$1" "$2" 2>/dev/null
}

DEFAULT_PORT="${MEMROOS_LAUNCHD_DEFAULT_PORT:-$(runtime_topology_port memroos-app launchd-next-http || printf '3002')}"
PORT="${PORT:-$DEFAULT_PORT}"

# Next.js patches incomplete optional SWC lockfile entries during local starts.
# This repo is npm-workspace/package-lock based, but if no package-lock exists in
# apps/memroos, Next can fall through to a globally installed pnpm and fail with
# ENOWORKSPACES. Pin npm in the process env before Next inspects package manager.
export npm_config_user_agent="${npm_config_user_agent:-npm/11.12.1 node/v22 darwin arm64 workspaces/false}"
export npm_config_workspaces=false
export npm_config_registry="${npm_config_registry:-https://registry.npmjs.org/}"
export NEXT_TELEMETRY_DISABLED="${NEXT_TELEMETRY_DISABLED:-1}"
# Under launchd on macOS 26, Node 22 can spend minutes serializing V8 compile
# cache before Next binds the port. Disable it for the always-on local service.
export NODE_DISABLE_COMPILE_CACHE="${NODE_DISABLE_COMPILE_CACHE:-1}"
# The launchd service is the local web origin for Cloudflare. It must bind the
# login/UI port first; local agent workers can be started separately when needed.
if [ "${MEMROOS_LAUNCHD_ALLOW_OPENCODE:-0}" != "1" ]; then
  export MEMROOS_ENABLE_OPENCODE=false
fi

# Preflight 1: stale scheduler lock.
# instrumentation.ts uses an O_EXCL lockfile to ensure only one memroos process
# runs the in-process schedulers. The release handler is on `process.on('exit')`,
# which does NOT fire on SIGKILL (used by the watchdog when the event loop wedges).
# A stale lock owned by a long-dead pid blocks new boots from starting schedulers,
# and in observed incidents has correlated with full boot wedges. Reap it here.
LOCK_PATH="${MEMROOS_SCHEDULER_LOCK:-$HOME/.memroos/run/scheduler.lock}"
if [ -f "$LOCK_PATH" ]; then
  lock_pid=$(cat "$LOCK_PATH" 2>/dev/null | tr -d '[:space:]')
  if [ -n "$lock_pid" ] && ! kill -0 "$lock_pid" 2>/dev/null; then
    rm -f "$LOCK_PATH"
    printf '[%s] preflight: removed stale scheduler.lock (dead pid %s)\n' \
      "$(date '+%Y-%m-%dT%H:%M:%S%z')" "$lock_pid" \
      | tee -a "$LOG_DIR/launchd.log" >&2
  fi
fi

# Preflight 2: if something already listens on $PORT, log and exit 1.
# Exit 1 (error) so launchd's ThrottleInterval=60 kicks in and retries after 60s,
# by which time the old socket's TIME_WAIT will have expired and the port will be free.
# Do NOT exit 0 — that tells launchd it was a clean exit and it won't retry.
if existing_pid=$(lsof -nP -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null | head -1); then
  if [ -n "$existing_pid" ]; then
    cmd=$(ps -o command= -p "$existing_pid" 2>/dev/null | head -1)
    printf '[%s] preflight: port %s already held by pid %s (%s) — exiting 1 (retry in 60s)\n' \
      "$(date '+%Y-%m-%dT%H:%M:%S%z')" "$PORT" "$existing_pid" "$cmd" \
      | tee -a "$LOG_DIR/launchd.log" >&2
    exit 1
  fi
fi

printf '[%s] preflight: clean — exec next start on port %s\n' \
  "$(date '+%Y-%m-%dT%H:%M:%S%z')" "$PORT" >> "$LOG_DIR/launchd.log"

cd "$REPO_DIR/apps/memroos"
exec "$NODE_BIN" "$REPO_DIR/node_modules/next/dist/bin/next" start --port "$PORT"
