#!/usr/bin/env bash
# update.sh — proper version-bump updater (dependency refresh + migrate).
#
# Usage (on the host):
#   bash scripts/update.sh                    # update to latest on the current branch
#   bash scripts/update.sh --channel stable    # only deploy tags matching stable/*
#   bash scripts/update.sh --allow-major      # allow major version bumps (off by default)
#   bash scripts/update.sh --dry-run          # show what would happen, change nothing
#
# Difference vs scripts/redeploy-from-ref.sh:
#   - update.sh first does `npm install` + `pip install -e .` to refresh
#     language-level dependencies against the new code (not just images).
#   - update.sh runs the memroos migration runner before restart, not
#     after — so a partial deploy can't leave the DB schema ahead of the
#     old code.
#   - update.sh is bounded to in-place upgrades (semver-minor or
#     semver-patch). Major bumps require --allow-major and an operator
#     decision recorded in /var/log/memroos/upgrade-decisions.log.
#
# Safe to re-run. Idempotent. Fail-closed on every step.

set -euo pipefail

CHANNEL="current"
ALLOW_MAJOR=0
DRY_RUN=0
while [ $# -gt 0 ]; do
  case "$1" in
    --channel)        CHANNEL="$2"; shift 2 ;;
    --allow-major)    ALLOW_MAJOR=1; shift ;;
    --dry-run)        DRY_RUN=1; shift ;;
    -h|--help)
      sed -n '2,18p' "$0"
      exit 0 ;;
    *)
      echo "unknown flag: $1" >&2; exit 2 ;;
  esac
done

MEMROOS_DIR="${MEMROOS_DIR:-$HOME/memroos}"
COMPOSE_FILE="${MEMROOS_COMPOSE_FILE:-docker-compose.local.yml}"
DECISION_LOG="/var/log/memroos/upgrade-decisions.log"

red()   { printf '\033[31m✗\033[0m %s\n' "$1"; }
green() { printf '\033[32m✓\033[0m %s\n' "$1"; }
blue()  { printf '\033[34m•\033[0m %s\n' "$1"; }
yellow(){ printf '\033[33m!\033[0m %s\n' "$1"; }

cd "$MEMROOS_DIR"

CURRENT_HEAD="$(git rev-parse HEAD 2>/dev/null || echo unknown)"
CURRENT_TAG="$(git describe --tags --exact-match 2>/dev/null || echo none)"

blue "Repo:    $MEMROOS_DIR"
blue "Compose: $COMPOSE_FILE"
blue "Channel: $CHANNEL"
blue "Current: $CURRENT_HEAD ($CURRENT_TAG)"
echo

# --- 1. resolve target ref -----------------------------------------------
blue "[1/7] resolving target ref"
case "$CHANNEL" in
  current)
    TARGET_REF="$(git symbolic-ref --short HEAD 2>/dev/null || echo main)"
    ;;
  stable)
    TARGET_REF="$(git tag -l 'stable/*' --sort=-v:refname | head -1)"
    [ -z "$TARGET_REF" ] && { red "no stable/* tags found"; exit 1; }
    ;;
  *) red "unknown channel: $CHANNEL"; exit 2 ;;
esac
git fetch origin --prune
TARGET_HEAD="$(git rev-parse "origin/$TARGET_REF")"
green "Target:  $TARGET_HEAD ($TARGET_REF)"
echo

# --- 2. version-bump check -----------------------------------------------
blue "[2/7] version-bump classification"
PREV_VERSION="${CURRENT_TAG#v}"
NEW_VERSION="${TARGET_HEAD}"
# If we have a real version tag at TARGET_HEAD, use it; otherwise treat
# the bump as patch (commit-only).
NEW_TAG="$(git describe --tags --exact-match "$TARGET_HEAD" 2>/dev/null || echo "v$(git rev-list --count "$TARGET_HEAD")")"
NEW_VER="${NEW_TAG#v}"
if [ -n "$PREV_VERSION" ] && [ "$PREV_VERSION" != "none" ]; then
  PREV_MAJOR="${PREV_VERSION%%.*}"; REST="${PREV_VERSION#*.}"
  PREV_MINOR="${REST%%.*}";  PREV_PATCH="${REST#*.}"
  NEW_MAJOR="${NEW_VER%%.*}"; REST2="${NEW_VER#*.}"
  NEW_MINOR="${REST2%%.*}";  NEW_PATCH="${REST2#*.}"
  if [ "$NEW_MAJOR" -gt "$PREV_MAJOR" ] 2>/dev/null; then
    BUMP="major"
  elif [ "$NEW_MINOR" -gt "$PREV_MINOR" ] 2>/dev/null; then
    BUMP="minor"
  elif [ "$NEW_PATCH" -gt "$PREV_PATCH" ] 2>/dev/null; then
    BUMP="patch"
  else
    BUMP="equal"
  fi
  echo "  $PREV_VERSION -> $NEW_VER : $BUMP"
  if [ "$BUMP" = "major" ] && [ "$ALLOW_MAJOR" -ne 1 ]; then
    red "major version bump requires --allow-major"
    exit 1
  fi
else
  BUMP="unknown"
  echo "  (no prior tag; treating as in-place update)"
fi
echo

if [ "$DRY_RUN" = "1" ]; then
  yellow "DRY RUN — not changing anything"
  echo "  would checkout:    $TARGET_REF ($TARGET_HEAD)"
  echo "  would refresh:    npm install / pip install -e ."
  echo "  would migrate:    node scripts/run-migrations.mjs"
  echo "  would restart:    docker compose up -d"
  echo "  would log to:     $DECISION_LOG"
  exit 0
fi

# --- 3. record decision -------------------------------------------------
blue "[3/7] recording upgrade decision"
mkdir -p "$(dirname "$DECISION_LOG")"
{
  echo "---"
  echo "ts:        $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "channel:   $CHANNEL"
  echo "from:      $CURRENT_HEAD ($CURRENT_TAG)"
  echo "to:        $TARGET_HEAD ($TARGET_REF)"
  echo "bump:      $BUMP"
  echo "allow-major: $ALLOW_MAJOR"
  echo "operator:  ${USER:-opc}"
} >> "$DECISION_LOG"
green "decision recorded -> $DECISION_LOG"
echo

# --- 4. checkout + dep refresh -----------------------------------------
blue "[4/7] checkout $TARGET_REF + refresh language deps"
git checkout "$TARGET_REF"
git pull --ff-only origin "$TARGET_REF"
if [ -f package.json ]; then
  if command -v npm >/dev/null; then
    npm ci --no-audit --no-fund --prefer-offline
    green "npm ci complete"
  fi
fi
if [ -f pyproject.toml ] && command -v .venv/bin/python >/dev/null 2>&1; then
  .venv/bin/python -m pip install --upgrade pip >/dev/null
  .venv/bin/python -m pip install -e . >/dev/null
  green "pip install -e . complete"
fi
echo

# --- 5. migration runner (BEFORE restart) -------------------------------
blue "[5/7] memroos migration runner"
if [ -f scripts/run-migrations.mjs ]; then
  node scripts/run-migrations.mjs
  green "migrations complete"
else
  blue "  (no migration runner; skipping)"
fi
echo

# --- 6. restart services ------------------------------------------------
blue "[6/7] docker compose pull + up -d"
docker compose -f "$COMPOSE_FILE" pull
docker compose -f "$COMPOSE_FILE" up -d
green "docker compose up -d complete"
echo

# --- 7. smoke test ------------------------------------------------------
blue "[7/7] /api/health smoke test"
APP_URL="${MEMROOS_APP_URL:-http://localhost:3000}"
HEALTH_OK=0
for i in $(seq 1 30); do
  if curl -sS -m 5 "$APP_URL/api/health" >/dev/null 2>&1; then
    HEALTH_OK=1; break
  fi
  sleep 2
done
if [ "$HEALTH_OK" = "1" ]; then
  green "/api/health reachable after restart"
else
  red "/api/health did not respond after 60s"
  docker compose -f "$COMPOSE_FILE" logs --tail=50 memroos
  exit 1
fi
echo

echo "================================================================"
green "UPDATE COMPLETE"
echo "  channel:  $CHANNEL"
echo "  from:     $CURRENT_HEAD"
echo "  to:       $TARGET_HEAD"
echo "  bump:     $BUMP"
echo "  compose:  $COMPOSE_FILE"
echo "  decision: $DECISION_LOG"
echo "================================================================"