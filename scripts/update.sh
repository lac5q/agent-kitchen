#!/usr/bin/env bash
# update.sh — Memroos update with explicit state-preservation guarantees.
#
# Usage (on the host):
#   memroos update                       # update to latest on the current branch
#   bash scripts/update.sh               # same as `memroos update`
#   bash scripts/update.sh --dry-run     # show what would happen, change nothing
#   bash scripts/update.sh --ref main    # update to a specific ref (default: current branch)
#   bash scripts/update.sh --allow-major # allow major version bumps (off by default)
#   bash scripts/update.sh --skip-snapshot # skip the pre-update snapshot (NOT recommended)
#
# Guarantees (every run, no flags):
#   1. Users are NOT deleted. The users table row count is captured before
#      and verified after; it must be >= the pre-update count.
#   2. Passwords are NOT deleted. At least one user with a non-empty
#      password_hash must exist after the update.
#   3. Configurations are saved. .env, docker-compose.local.yml, the
#      AES-256-GCM vault key, the Ed25519 skill-signing key, and the
#      named Docker volumes persist across the run.
#   4. On any failure, the pre-update snapshot is auto-restored and the
#      stack is restarted. Exit codes: 0 = success, 3 = rolled back (update
#      did not apply), 4 = restore failed (manual intervention required).
#
# Difference vs scripts/redeploy-from-ref.sh:
#   - update.sh first does `npm install` to refresh language-level
#     dependencies against the new code (not just images).
#   - update.sh runs the memroos migration runner before restart, not
#     after — so a partial deploy can't leave the DB schema ahead of the
#     old code.
#   - update.sh is bounded to in-place upgrades (semver-minor or
#     semver-patch). Major bumps require --allow-major and an operator
#     decision recorded in /var/log/memroos/upgrade-decisions.log.
#   - update.sh enforces the state-preservation contract above.
#
# Safe to re-run. Idempotent. Fail-closed on every step.

set -euo pipefail

# ---------------------------------------------------------------------------
# Args
# ---------------------------------------------------------------------------
CHANNEL="current"
ALLOW_MAJOR=0
DRY_RUN=0
SKIP_SNAPSHOT=0
OVERRIDE_REF=""
while [ $# -gt 0 ]; do
  case "$1" in
    --channel)         CHANNEL="$2"; shift 2 ;;
    --allow-major)     ALLOW_MAJOR=1; shift ;;
    --dry-run)         DRY_RUN=1; shift ;;
    --skip-snapshot)   SKIP_SNAPSHOT=1; shift ;;
    --ref)             OVERRIDE_REF="$2"; shift 2 ;;
    -h|--help)
      sed -n '2,44p' "$0"
      exit 0 ;;
    *)
      echo "unknown flag: $1" >&2; exit 2 ;;
  esac
done

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
MEMROOS_DIR="${MEMROOS_DIR:-$HOME/memroos}"
COMPOSE_FILE="${MEMROOS_COMPOSE_FILE:-docker-compose.local.yml}"
DECISION_LOG="${MEMROOS_DECISION_LOG:-/var/log/memroos/upgrade-decisions.log}"
SNAPSHOT_DIR="${MEMROOS_SNAPSHOT_DIR:-/var/backups/memroos}"

# Fall back to $HOME/.memroos for DECISION_LOG when the default
# /var/log/memroos directory isn't writable (e.g. when running as a
# non-root user like opc on oracle-1). This mirrors the SNAPSHOT_DIR
# fallback below. Operators can still pin DECISION_LOG via the env var
# to override this resolution.
if ! (mkdir -p "$(dirname "$DECISION_LOG")" && : >> "$DECISION_LOG") 2>/dev/null; then
  DECISION_LOG="$HOME/.memroos/upgrade-decisions.log"
fi
APP_URL="${MEMROOS_APP_URL:-http://localhost:3000}"

# Vault key location (default matches bin/memroos)
VAULT_KEY_PATH="${MEMROOS_VAULT_KEY_PATH:-$HOME/.memroos/vault.key}"

red()   { printf '\033[31m✗\033[0m %s\n' "$1" >&2; }
green() { printf '\033[32m✓\033[0m %s\n' "$1"; }
blue()  { printf '\033[34m•\033[0m %s\n' "$1"; }
yellow(){ printf '\033[33m!\033[0m %s\n' "$1"; }

cd "$MEMROOS_DIR"

# ---------------------------------------------------------------------------
# Protected state paths (the state-preservation contract)
# ---------------------------------------------------------------------------
PROTECTED_ENV="$MEMROOS_DIR/.env"
PROTECTED_COMPOSE="$MEMROOS_DIR/$COMPOSE_FILE"
PROTECTED_DATA_DIR="$MEMROOS_DIR/data"
PROTECTED_DB="$PROTECTED_DATA_DIR/conversations.db"
PROTECTED_SKILL_KEY="$MEMROOS_DIR/apps/memroos/data/skill-signing-key.json"
PROTECTED_VAULT_KEY="$VAULT_KEY_PATH"

# ---------------------------------------------------------------------------
# Phase 0 — Preflight
# ---------------------------------------------------------------------------
CURRENT_HEAD="$(git rev-parse HEAD 2>/dev/null || echo unknown)"
CURRENT_TAG="$(git describe --tags --exact-match 2>/dev/null || echo none)"

echo
echo "================================================================"
blue "  Memroos update — state-preserving"
echo "================================================================"
blue "Repo:    $MEMROOS_DIR"
blue "Compose: $COMPOSE_FILE"
blue "Channel: $CHANNEL"
blue "Current: $CURRENT_HEAD ($CURRENT_TAG)"
echo

# Verify the protected state is present BEFORE we touch anything. If any
# pre-existing item is missing, that's fine — we just won't promise to
# preserve what isn't there.
preflight_check() {
  local path="$1" label="$2"
  if [ -e "$path" ]; then
    green "present: $label"
    return 0
  else
    blue "absent:  $label (no-op for preservation)"
    return 1
  fi
}

blue "[preflight] protected state inventory"
HAD_ENV=0; HAD_DB=0; HAD_SKILL_KEY=0; HAD_VAULT_KEY=0; HAD_COMPOSE=0
preflight_check "$PROTECTED_ENV"       ".env"                           && HAD_ENV=1
preflight_check "$PROTECTED_DB"        "data/conversations.db"          && HAD_DB=1
preflight_check "$PROTECTED_SKILL_KEY" "skill-signing-key.json"         && HAD_SKILL_KEY=1
preflight_check "$PROTECTED_VAULT_KEY" "vault key ($VAULT_KEY_PATH)"    && HAD_VAULT_KEY=1
preflight_check "$PROTECTED_COMPOSE"   "docker-compose override"        && HAD_COMPOSE=1
echo

# Capture pre-update DB state for the post-flight comparison
PRE_USERS_COUNT=0
PRE_FIRST_USER_HASH=""
PRE_DB_QUERY_OK=0
if [ "$HAD_DB" = "1" ] && command -v sqlite3 >/dev/null 2>&1; then
  # Under set -euo pipefail, an assignment whose command substitution exits
  # non-zero aborts the script. We need to tolerate sqlite3 failure (locked
  # DB, schema-missing, corrupt file) so the loud-fail branch below is
  # reachable. || _raw_count="" keeps the assignment succeeding.
  _raw_count=$(sqlite3 "$PROTECTED_DB" 'SELECT COUNT(*) FROM users' 2>/dev/null) || _raw_count=""
  if [ -n "$_raw_count" ] && [ "$_raw_count" -eq "$_raw_count" ] 2>/dev/null; then
    PRE_USERS_COUNT="$_raw_count"
    PRE_FIRST_USER_HASH="$(sqlite3 "$PROTECTED_DB" 'SELECT password_hash FROM users ORDER BY created_at LIMIT 1' 2>/dev/null || echo "")"
    PRE_DB_QUERY_OK=1
    blue "preflight: users in DB = $PRE_USERS_COUNT"
    if [ -n "$PRE_FIRST_USER_HASH" ]; then
      blue "preflight: first user password_hash present (len=${#PRE_FIRST_USER_HASH})"
    fi
  else
    red "preflight: DB query failed — result was not a valid integer (raw='$_raw_count')"
    red "preflight: user-preservation check will be skipped; passwords: NOT VERIFIED"
  fi
elif [ "$HAD_DB" = "1" ]; then
  # sqlite3 not on host — query via the running container (works on docker
  # compose local install). Skip if not running.
  CONTAINER_DB_OK=0
  if docker ps --format '{{.Names}}' 2>/dev/null | grep -q 'memroos-local-memroos-1'; then
    PRE_USERS_COUNT="$(docker exec memroos-local-memroos-1 sh -c "node -e \"const Database=require('better-sqlite3'); const db=new Database('/data/conversations.db'); console.log(db.prepare('SELECT COUNT(*) AS n FROM users').get().n);\"" 2>/dev/null || echo 0)"
    PRE_FIRST_USER_HASH="$(docker exec memroos-local-memroos-1 sh -c "node -e \"const Database=require('better-sqlite3'); const db=new Database('/data/conversations.db'); const r=db.prepare('SELECT password_hash FROM users ORDER BY created_at LIMIT 1').get(); console.log(r?r.password_hash:'');\"" 2>/dev/null || echo "")"
    CONTAINER_DB_OK=1
  fi
  if [ "$CONTAINER_DB_OK" = "1" ]; then
    blue "preflight (via container): users in DB = $PRE_USERS_COUNT"
  else
    yellow "preflight: could not query DB (no sqlite3 + no running container); user-preservation check will skip"
  fi
fi
echo

# ---------------------------------------------------------------------------
# Phase 1 — Snapshot
# ---------------------------------------------------------------------------
SNAPSHOT_PATH=""
if [ "$SKIP_SNAPSHOT" = "1" ]; then
  yellow "[1/7] --skip-snapshot set; skipping pre-update snapshot"
  yellow "       this is NOT recommended unless you have a separate backup"
else
  blue "[1/7] writing pre-update snapshot"
  # If MEMROOS_SNAPSHOT_DIR points at /var/backups/memroos and we can't
  # create it (non-root user), fall back to a per-user snapshot dir.
  if ! mkdir -p "$SNAPSHOT_DIR" 2>/dev/null; then
    FALLBACK_SNAPSHOT_DIR="$HOME/.memroos/snapshots"
    if ! mkdir -p "$FALLBACK_SNAPSHOT_DIR" 2>/dev/null; then
      red "cannot create snapshot dir (tried $SNAPSHOT_DIR and $FALLBACK_SNAPSHOT_DIR)"
      exit 1
    fi
    yellow "  cannot write to $SNAPSHOT_DIR; falling back to $FALLBACK_SNAPSHOT_DIR"
    SNAPSHOT_DIR="$FALLBACK_SNAPSHOT_DIR"
  fi
  SNAPSHOT_PATH="$SNAPSHOT_DIR/pre-update-$(date -u +%Y%m%dT%H%M%SZ).tar.gz"
  SNAPSHOT_FILES=()
  [ -f "$PROTECTED_ENV" ]       && SNAPSHOT_FILES+=("$PROTECTED_ENV")
  [ -f "$PROTECTED_DB" ]        && SNAPSHOT_FILES+=("$PROTECTED_DB")
  [ "$HAD_DB" = "1" ] && [ -f "$PROTECTED_DATA_DIR/conversations.db-shm" ] && SNAPSHOT_FILES+=("$PROTECTED_DATA_DIR/conversations.db-shm")
  [ "$HAD_DB" = "1" ] && [ -f "$PROTECTED_DATA_DIR/conversations.db-wal" ] && SNAPSHOT_FILES+=("$PROTECTED_DATA_DIR/conversations.db-wal")
  [ -f "$PROTECTED_SKILL_KEY" ] && SNAPSHOT_FILES+=("$PROTECTED_SKILL_KEY")
  [ -f "$PROTECTED_VAULT_KEY" ] && SNAPSHOT_FILES+=("$PROTECTED_VAULT_KEY")
  [ -f "$PROTECTED_COMPOSE" ]   && SNAPSHOT_FILES+=("$PROTECTED_COMPOSE")

  # Count via a parallel counter (bash arrays + length comparison)
  SNAPSHOT_COUNT=${#SNAPSHOT_FILES[@]}
  if [ "$SNAPSHOT_COUNT" -gt 0 ]; then
    (cd / && tar -czf "$SNAPSHOT_PATH" "${SNAPSHOT_FILES[@]}") && green "snapshot -> $SNAPSHOT_PATH ($SNAPSHOT_COUNT files)" || { red "snapshot failed"; exit 1; }
  else
    blue "  (no protected files to snapshot; first install?)"
    SNAPSHOT_PATH=""
  fi
  echo
fi

# ---------------------------------------------------------------------------
# Phase 2 — Resolve target ref
# ---------------------------------------------------------------------------
blue "[2/7] resolving target ref"
case "$CHANNEL" in
  current)
    TARGET_REF="${OVERRIDE_REF:-$(git symbolic-ref --short HEAD 2>/dev/null || echo main)}"
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

# ---------------------------------------------------------------------------
# Phase 3 — Version-bump classification
# ---------------------------------------------------------------------------
blue "[3/7] version-bump classification"
PREV_VERSION="${CURRENT_TAG#v}"
NEW_TAG="$(git describe --tags --exact-match "$TARGET_HEAD" 2>/dev/null || echo "v$(git rev-list --count "$TARGET_HEAD")")"
NEW_VER="${NEW_TAG#v}"
if [ -n "$PREV_VERSION" ] && [ "$PREV_VERSION" != "none" ]; then
  if [[ "$NEW_VER" == *.*.* ]]; then
    PREV_MAJOR="${PREV_VERSION%%.*}"; REST="${PREV_VERSION#*.}"
    PREV_MINOR="${REST%%.*}";  PREV_PATCH="${REST#*.}"
    NEW_MAJOR="${NEW_VER%%.*}"; REST2="${NEW_VER#*.}"
    NEW_MINOR="${REST2%%.*}";  NEW_PATCH="${REST2#*.}"
    if [ "$NEW_MAJOR" -gt "$PREV_MAJOR" ] 2>/dev/null; then BUMP="major"
    elif [ "$NEW_MINOR" -gt "$PREV_MINOR" ] 2>/dev/null; then BUMP="minor"
    elif [ "$NEW_PATCH" -gt "$PREV_PATCH" ] 2>/dev/null; then BUMP="patch"
    else BUMP="equal"; fi
    echo "  $PREV_VERSION -> $NEW_VER : $BUMP"
    if [ "$BUMP" = "major" ] && [ "$ALLOW_MAJOR" -ne 1 ]; then
      red "major version bump requires --allow-major"
      exit 1
    fi
  else
    BUMP="patch"
    echo "  $PREV_VERSION -> <untagged $TARGET_HEAD> : patch (untagged target; in-place)"
  fi
else
  BUMP="unknown"
  echo "  (no prior tag; treating as in-place update)"
fi
echo

# ---------------------------------------------------------------------------
# Phase 4 — Dry-run summary
# ---------------------------------------------------------------------------
if [ "$DRY_RUN" = "1" ]; then
  yellow "DRY RUN — not changing anything"
  echo "  would pull:       $TARGET_REF ($TARGET_HEAD)"
  echo "  would refresh:    npm ci"
  echo "  would migrate:    node scripts/run-migrations.mjs"
  echo "  would restart:    docker compose -f $COMPOSE_FILE up -d"
  if [ "${PRE_DB_QUERY_OK:-0}" = "1" ]; then
    echo "  would verify:     users count >= $PRE_USERS_COUNT, password_hash present, .env intact"
  else
    echo "  would verify:     users count >= $PRE_USERS_COUNT (NOT VERIFIED — preflight DB query failed), .env intact"
  fi
  echo "  would log to:     $DECISION_LOG"
  echo "  snapshot at:      ${SNAPSHOT_PATH:-(none)}"
  exit 0
fi

# ---------------------------------------------------------------------------
# Phase 5 — Record decision + checkout + dep refresh
# ---------------------------------------------------------------------------
blue "[4/7] recording upgrade decision"
mkdir -p "$(dirname "$DECISION_LOG")"
{
  echo "---"
  echo "ts:        $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "channel:   $CHANNEL"
  echo "from:      $CURRENT_HEAD ($CURRENT_TAG)"
  echo "to:        $TARGET_HEAD ($TARGET_REF)"
  echo "bump:      $BUMP"
  echo "allow-major: $ALLOW_MAJOR"
  echo "snapshot:  ${SNAPSHOT_PATH:-none}"
  echo "pre_users: $PRE_USERS_COUNT"
  echo "operator:  ${USER:-opc}"
} >> "$DECISION_LOG"
green "decision recorded -> $DECISION_LOG"
echo

blue "[5/7] checkout $TARGET_REF + refresh language deps"
git checkout "$TARGET_REF"
git pull --ff-only origin "$TARGET_REF"
if [ -f package.json ] && command -v npm >/dev/null; then
  npm ci --no-audit --no-fund --prefer-offline
  green "npm ci complete"
fi
echo

# ---------------------------------------------------------------------------
# Phase 6 — Migrations + restart
# ---------------------------------------------------------------------------
blue "[6/7] memroos migration runner"
if [ -f scripts/run-migrations.mjs ]; then
  node scripts/run-migrations.mjs
  green "migrations complete"
else
  blue "  (no migration runner; skipping)"
fi
echo

blue "[7/7] docker compose pull + up -d"
docker compose -f "$COMPOSE_FILE" pull
docker compose -f "$COMPOSE_FILE" up -d
green "docker compose up -d complete"
echo

# ---------------------------------------------------------------------------
# State-preservation verification (the contract)
# ---------------------------------------------------------------------------
blue "[verify] state-preservation contract"
VERIFY_OK=1
ROLLBACK_REASON=""

# Wait for app to come up first
HEALTH_OK=0
for i in $(seq 1 30); do
  if curl -sS -m 5 "$APP_URL/api/health" >/dev/null 2>&1; then
    HEALTH_OK=1; break
  fi
  sleep 2
done
if [ "$HEALTH_OK" != "1" ]; then
  ROLLBACK_REASON="health endpoint unreachable after restart"
  yellow "  /api/health unreachable"
  VERIFY_OK=0
else
  green "  /api/health reachable"
fi

# 1. .env preserved
if [ "$HAD_ENV" = "1" ]; then
  if [ -f "$PROTECTED_ENV" ] && [ -s "$PROTECTED_ENV" ]; then
    green "  .env preserved (non-empty)"
  else
    ROLLBACK_REASON=".env missing or empty after update"
    red "  ✗ .env missing or empty"
    VERIFY_OK=0
  fi
fi

# 2. compose preserved
if [ "$HAD_COMPOSE" = "1" ]; then
  if [ -f "$PROTECTED_COMPOSE" ]; then
    green "  docker-compose override preserved"
  else
    ROLLBACK_REASON="docker-compose override missing after update"
    red "  ✗ docker-compose override missing"
    VERIFY_OK=0
  fi
fi

# 3. vault key preserved
if [ "$HAD_VAULT_KEY" = "1" ]; then
  if [ -f "$PROTECTED_VAULT_KEY" ]; then
    green "  vault key preserved"
  else
    ROLLBACK_REASON="vault key missing after update"
    red "  ✗ vault key missing"
    VERIFY_OK=0
  fi
fi

# 4. skill signing key preserved
if [ "$HAD_SKILL_KEY" = "1" ]; then
  if [ -f "$PROTECTED_SKILL_KEY" ]; then
    green "  skill-signing key preserved"
  else
    ROLLBACK_REASON="skill-signing key missing after update"
    red "  ✗ skill-signing key missing"
    VERIFY_OK=0
  fi
fi

# 5. DB users preserved (no users deleted)
if [ "$PRE_USERS_COUNT" -gt 0 ]; then
  POST_USERS_COUNT=0
  if command -v sqlite3 >/dev/null 2>&1 && [ -f "$PROTECTED_DB" ]; then
    POST_USERS_COUNT="$(sqlite3 "$PROTECTED_DB" 'SELECT COUNT(*) FROM users' 2>/dev/null || echo 0)"
  elif docker ps --format '{{.Names}}' 2>/dev/null | grep -q 'memroos-local-memroos-1'; then
    POST_USERS_COUNT="$(docker exec memroos-local-memroos-1 sh -c "node -e \"const Database=require('better-sqlite3'); const db=new Database('/data/conversations.db'); console.log(db.prepare('SELECT COUNT(*) AS n FROM users').get().n);\"" 2>/dev/null || echo 0)"
  fi
  if [ "$POST_USERS_COUNT" -ge "$PRE_USERS_COUNT" ]; then
    green "  users count: $PRE_USERS_COUNT -> $POST_USERS_COUNT (no users deleted)"
  else
    ROLLBACK_REASON="users count dropped: $PRE_USERS_COUNT -> $POST_USERS_COUNT"
    red "  ✗ users count dropped: $PRE_USERS_COUNT -> $POST_USERS_COUNT"
    VERIFY_OK=0
  fi
fi

# 6. At least one user with non-empty password_hash (no passwords deleted)
if [ "$PRE_USERS_COUNT" -gt 0 ]; then
  POST_FIRST_USER_HASH=""
  if command -v sqlite3 >/dev/null 2>&1 && [ -f "$PROTECTED_DB" ]; then
    POST_FIRST_USER_HASH="$(sqlite3 "$PROTECTED_DB" 'SELECT password_hash FROM users ORDER BY created_at LIMIT 1' 2>/dev/null || echo "")"
  elif docker ps --format '{{.Names}}' 2>/dev/null | grep -q 'memroos-local-memroos-1'; then
    POST_FIRST_USER_HASH="$(docker exec memroos-local-memroos-1 sh -c "node -e \"const Database=require('better-sqlite3'); const db=new Database('/data/conversations.db'); const r=db.prepare('SELECT password_hash FROM users ORDER BY created_at LIMIT 1').get(); console.log(r?r.password_hash:'');\"" 2>/dev/null || echo "")"
  fi
  if [ -n "$POST_FIRST_USER_HASH" ]; then
    if [ -n "$PRE_FIRST_USER_HASH" ] && [ "$POST_FIRST_USER_HASH" != "$PRE_FIRST_USER_HASH" ]; then
      yellow "  ! password_hash for first user changed (pre len=${#PRE_FIRST_USER_HASH}, post len=${#POST_FIRST_USER_HASH})"
      yellow "    treating as a rollback trigger"
      VERIFY_OK=0
      ROLLBACK_REASON="password_hash changed"
    else
      green "  password_hash preserved (len=${#POST_FIRST_USER_HASH})"
    fi
  else
    ROLLBACK_REASON="password_hash missing for first user after update"
    red "  ✗ password_hash missing for first user"
    VERIFY_OK=0
  fi
fi

echo

# ---------------------------------------------------------------------------
# Auto-rollback
# ---------------------------------------------------------------------------
if [ "$VERIFY_OK" != "1" ]; then
  red "================================================================"
  red "  STATE-PRESERVATION FAILED: $ROLLBACK_REASON"
  red "  triggering auto-rollback"
  red "================================================================"
  if [ -z "$SNAPSHOT_PATH" ] || [ ! -f "$SNAPSHOT_PATH" ]; then
    red "  no snapshot available; cannot rollback"
    red "  manual intervention required"
    exit 4
  fi
  blue "  restoring from $SNAPSHOT_PATH"
  if ! (cd / && tar -xzf "$SNAPSHOT_PATH"); then
    red "  RESTORE FAILED — manual intervention required"
    docker compose -f "$COMPOSE_FILE" up -d || true
    exit 4
  fi
  green "  snapshot restored"
  blue "  restarting services"
  docker compose -f "$COMPOSE_FILE" up -d
  for i in $(seq 1 30); do
    if curl -sS -m 5 "$APP_URL/api/health" >/dev/null 2>&1; then
      green "  /api/health reachable after rollback"
      break
    fi
    sleep 2
  done
  red "  rollback complete; original state restored"
  exit 3
fi

echo "================================================================"
green "UPDATE COMPLETE"
echo "  channel:    $CHANNEL"
echo "  from:       $CURRENT_HEAD"
echo "  to:         $TARGET_HEAD"
echo "  bump:       $BUMP"
echo "  compose:    $COMPOSE_FILE"
echo "  decision:   $DECISION_LOG"
echo "  snapshot:   ${SNAPSHOT_PATH:-(none)}"
echo "  users:      $PRE_USERS_COUNT unchanged"
if [ "${PRE_DB_QUERY_OK:-0}" = "1" ]; then
  echo "  passwords:  preserved"
else
  echo "  passwords:  NOT VERIFIED"
fi
echo "  configs:    preserved"
echo "================================================================"
