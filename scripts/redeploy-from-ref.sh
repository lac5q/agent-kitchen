#!/usr/bin/env bash
# redeploy-from-ref.sh — pull a ref, restart services, smoke-test.
#
# Usage (on the host):
#   bash scripts/redeploy-from-ref.sh <ref> [compose-file]
#   bash scripts/redeploy-from-ref.sh main
#   bash scripts/redeploy-from-ref.sh beastmode/v8.23-tool-auth-plane
#   bash scripts/redeploy-from-ref.sh main docker-compose.local.yml
#
# Behavior:
#   1. cd into the repo (assumes $HOME/memroos; override with MEMROOS_DIR)
#   2. git fetch origin + checkout the ref + pull --ff-only
#   3. confirm we're on the right commit
#   4. (optional) run install-regression --fast for structural safety
#   5. docker compose pull + up -d for the chosen compose file
#   6. smoke-test /api/health and the new /api/tools/providers
#   7. print a single-line verdict + the new commit list
#
# Safe to re-run. Idempotent. Fail-closed on every step.

set -euo pipefail

REF="${1:-main}"
COMPOSE_FILE="${2:-${MEMROOS_COMPOSE_FILE:-docker-compose.local.yml}}"
MEMROOS_DIR="${MEMROOS_DIR:-$HOME/memroos}"
PREVIOUS_HEAD="$(cd "$MEMROOS_DIR" 2>/dev/null && git rev-parse HEAD 2>/dev/null || echo unknown)"

cd "$MEMROOS_DIR"

red()   { printf '\033[31m✗\033[0m %s\n' "$1"; }
green() { printf '\033[32m✓\033[0m %s\n' "$1"; }
blue()  { printf '\033[34m•\033[0m %s\n' "$1"; }
yellow(){ printf '\033[33m!\033[0m %s\n' "$1"; }

blue "Repo:     $MEMROOS_DIR"
blue "Ref:      $REF"
blue "Compose:  $COMPOSE_FILE"
blue "Previous: $PREVIOUS_HEAD"
echo

# Step 1 — fetch + checkout
blue "[1/6] git fetch origin && checkout $REF"
git fetch origin --prune
if ! git checkout "$REF" 2>/dev/null; then
  git checkout -B "$REF" "origin/$REF"
fi
git pull --ff-only origin "$REF"
NEW_HEAD="$(git rev-parse HEAD)"
green "Now on: $NEW_HEAD"
echo

# Step 2 — list new commits since the prior deploy
blue "[2/6] commits since $PREVIOUS_HEAD"
if [ "$NEW_HEAD" != "$PREVIOUS_HEAD" ]; then
  git log --oneline "$PREVIOUS_HEAD..$NEW_HEAD" || true
else
  echo "(no new commits — re-running the same build)"
fi
echo

# Step 3 — install-regression --fast for structural safety
blue "[3/6] install-regression --fast"
if [ -x scripts/install-regression/install-regression.sh ]; then
  if bash scripts/install-regression/install-regression.sh fast; then
    green "install-regression fast: PASS"
  else
    red "install-regression fast: FAIL — refusing to continue"
    exit 1
  fi
else
  blue "  (install-regression.sh not present; skipping)"
fi
echo

# Step 4 — pull images + restart services
blue "[4/6] docker compose pull + up -d"
docker compose -f "$COMPOSE_FILE" pull
docker compose -f "$COMPOSE_FILE" up -d
green "docker compose up -d complete"

# Step 4b — install the operator CLI on PATH so `memroos` works.
blue "[4b/6] install bin/memroos on PATH"
if [ -f bin/memroos ]; then
  if install -m 0755 bin/memroos /usr/local/bin/memroos 2>/dev/null; then
    green "memroos installed at /usr/local/bin/memroos"
  elif install -m 0755 bin/memroos "$HOME/.local/bin/memroos" 2>/dev/null; then
    green "memroos installed at $HOME/.local/bin/memroos (no sudo for /usr/local/bin)"
  else
    yellow "could not install bin/memroos on PATH; run as $PWD/bin/memroos"
  fi
  if command -v memroos >/dev/null 2>&1; then
    memroos --help 2>&1 | head -1 | sed 's/^/    /' || true
  fi
else
  yellow "  (bin/memroos not present in this checkout; skipping)"
fi
echo

# Step 5 — wait for app to come up (bounded)
blue "[5/6] waiting for app /api/health"
APP_URL="${MEMROOS_APP_URL:-http://localhost:3000}"
HEALTH_URL="$APP_URL/api/health"
TOOLS_URL="$APP_URL/api/tools/providers"
HEALTH_OK=0
for i in $(seq 1 30); do
  if curl -sS -m 5 "$HEALTH_URL" >/tmp/memroos-health.json 2>/dev/null; then
    HEALTH_OK=1
    break
  fi
  sleep 2
done
if [ "$HEALTH_OK" = "1" ]; then
  green "/api/health reachable"
else
  red "/api/health did not respond after 60s"
  echo "Last 50 lines of app container logs:"
  docker compose -f "$COMPOSE_FILE" logs --tail=50 memroos 2>&1 | tail -50 || true
  exit 1
fi
echo

# Step 6 — smoke test the new surface
blue "[6/6] smoke-testing /api/tools/providers (Phase 179)"
if curl -sS -m 5 -o /tmp/memroos-tools.json -w "HTTP %{http_code}\n" "$TOOLS_URL" 2>&1 | grep -q "HTTP 200"; then
  TOOL_COUNT="$(python3 -c "import json; d=json.load(open('/tmp/memroos-tools.json')); print(sum(len(c['providers']) for c in d.get('categories', [])))" 2>/dev/null || echo unknown)"
  green "/api/tools/providers reachable — ${TOOL_COUNT} providers across categories"
else
  red "/api/tools/providers not reachable; the new tool-auth API may not be exposed"
  echo "  (Check that $COMPOSE_FILE was the compose file the host was running.)"
  exit 1
fi
echo

# Final verdict
echo "================================================================"
green "REDEPLOY COMPLETE"
echo "  ref:       $REF"
echo "  commit:    $NEW_HEAD"
echo "  compose:   $COMPOSE_FILE"
echo "  health:    $HEALTH_URL"
echo "  tool-auth: $TOOLS_URL"
echo "================================================================"