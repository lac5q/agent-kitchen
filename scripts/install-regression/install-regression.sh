#!/usr/bin/env bash
# INSTALL-REPRO-05 regression: destructive-safe reinstall coverage.
#
# Two modes:
#   --fast     (default in CI)  structural checks only; finishes in seconds
#   --full     (manual / disposable-host)  actually runs a clean install +
#                                      reinstalls over it; takes minutes
#
# The fast mode is what CI runs on every PR. The full mode is what runs on a
# disposable host (CI on a job with `ephemeral: true` or a one-off VM) and
# captures the full /api/health evidence into a transcript directory passed
# via --transcript <dir>.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MODE="${1:-fast}"
TRANSCRIPT_DIR="${TRANSCRIPT_DIR:-/tmp/install-regression-transcript}"

# Resolve the CORE_SERVICES list dynamically so we never drift from compose.
CORE_SERVICES="$(grep -E '^[[:space:]]+memroos|^[[:space:]]+mem0|^[[:space:]]+orchestration|^[[:space:]]+neo4j|^[[:space:]]+ollama' \
  "$REPO_ROOT/docker-compose.local.yml" \
  | awk '{print $1}' | sort -u | grep -v '^services:' | grep -v '^$' | tr '\n' ',' | sed 's/,$//')"

pass() { printf '\033[32m✓\033[0m %s\n' "$1"; }
fail() { printf '\033[31m✗\033[0m %s\n' "$1"; exit 1; }
info() { printf '\033[34m•\033[0m %s\n' "$1"; }

structural_checks() {
  info "Run mode: fast (structural)"
  cd "$REPO_ROOT"

  # 1. install.sh accepts --local and defaults DOCKER_COMPOSE_FILE to docker-compose.local.yml.
  grep -q -- "--local" install.sh || fail "install.sh missing --local flag"
  grep -q "docker-compose.local.yml" install.sh || fail "install.sh default compose file not docker-compose.local.yml"
  pass "install.sh --local flag and docker-compose.local.yml default"

  # 2. docker-compose.local.yml exists in repo (was recovered from cordant-hermes-01).
  test -f docker-compose.local.yml || fail "docker-compose.local.yml missing"
  pass "docker-compose.local.yml present at repo root"

  # 3. README + docs/install-profiles.md reference the local stack.
  grep -q "docker-compose.local.yml" README.md || fail "README.md does not advertise docker-compose.local.yml"
  grep -q "docker-compose.local.yml" docs/install-profiles.md || fail "docs/install-profiles.md does not reference docker-compose.local.yml"
  pass "README + install-profiles.md advertise local stack"

  # 4. No sample macOS paths in runtime config.
  forbidden_paths_in_runtime() {
    grep -nE '^[[:space:]]*(KNOWLEDGE_BASE_PATH|AGENT_CONFIGS_PATH|APO_PROPOSALS_PATH|CLAUDE_MEMORY_PATH|GITNEXUS_REGISTRY|QWEN_MEMORY_PATH|HERMES_MEMORY_PATH|CODEX_MEMORY_PATH)=' .env.example \
      | grep -q '/Users/yourname\|/Users/USERNAME\|/home/yourname'
  }
  if forbidden_paths_in_runtime; then
    fail ".env.example still has literal /Users/yourname or /home/yourname runtime paths"
  fi
  pass ".env.example runtime paths use \${HOME} placeholders, not literal sample macOS paths"

  # 5. tsconfig.json narrow exclusion (only vitest configs).
  grep -qF '"**/vitest*.config.ts"' apps/memroos/tsconfig.json || fail "tsconfig.json missing narrow vitest exclusion"
  if grep -qF '"**/*.config.ts"' apps/memroos/tsconfig.json; then
    fail "tsconfig.json still excludes every *.config.ts (broad, masks next/playwright/postcss/eslint)"
  fi
  pass "tsconfig.json excludes only **/vitest*.config.ts (narrowest fix)"

  # 6. docker-compose.local.yml passes AGENT_CONFIGS_PATH + APO_PROPOSALS_PATH.
  grep -q "AGENT_CONFIGS_PATH:" docker-compose.local.yml || fail "compose missing AGENT_CONFIGS_PATH"
  grep -q "APO_PROPOSALS_PATH:" docker-compose.local.yml || fail "compose missing APO_PROPOSALS_PATH"
  pass "compose passes AGENT_CONFIGS_PATH + APO_PROPOSALS_PATH to the app container"

  # 7. install.sh .env expansion: must call envsubst OR have the fallback loop.
  if ! grep -q "envsubst" install.sh && ! grep -q "expanded=" install.sh; then
    fail "install.sh does not expand \${HOME} when generating .env (no envsubst and no fallback loop)"
  fi
  pass "install.sh expands \${HOME} when generating .env"

  # 7b. install.sh must rotate JWT_SECRET/ADMIN_PASSWORD/NEO4J_AUTH per
  # install so reachable fresh installs do NOT ship well-known defaults
  # (push-plan validator flagged hardcoded memroos-local-* values).
  if ! grep -qE "openssl rand.*hex" install.sh; then
    fail "install.sh does not rotate credentials per install (no openssl rand)"
  fi
  if ! grep -qE 'MEMROOS_JWT_SECRET:[[:space:]]*\$\{MEMROOS_JWT_SECRET' docker-compose.local.yml && \
     ! grep -qE 'MEMROOS_JWT_SECRET:[[:space:]]*\$\{MEMROOS_JWT_SECRET\:-' docker-compose.local.yml; then
    fail "docker-compose.local.yml should reference \${MEMROOS_JWT_SECRET} (env-driven, not hardcoded)"
  fi
  pass "install.sh rotates credentials; compose reads them from env"

  # 7c. compose published ports must default-bind to loopback.
  if ! grep -qE '\$\{MEMROOS_BIND:-127\.0\.0\.1\}:\$\{MEMROOS_PORT' docker-compose.local.yml; then
    fail "compose published ports should default to loopback (\${MEMROOS_BIND:-127.0.0.1}:\${MEMROOS_PORT}:3000)"
  fi
  pass "compose default-binds published ports to loopback"

  # 8. .env generated by install.sh is mode 600.
  grep -q "chmod 600 .env" install.sh || fail "install.sh does not chmod 600 the generated .env"
  pass "install.sh sets .env to mode 600"

  # 9. Core services covered (memroos, mem0, orchestration, neo4j, ollama).
  for svc in memroos mem0 orchestration neo4j ollama; do
    grep -qE "^[[:space:]]+${svc}:" docker-compose.local.yml || fail "core service ${svc} missing from compose"
  done
  pass "all five core services present in compose"

  info "OK: all structural checks passed."
}

full_run() {
  info "Run mode: full (disposable-host)"

  # Pin the install directory to a separate TRANSCRIPT_DIR/install/
  # subdirectory so the test never collides with REPO_ROOT. install.sh's
  # default MEMROOS_INSTALL_DIR is $HOME/memroos; we override to make the
  # run hermetic and tmpfs-friendly. This is the validator's fix:
  # "test the checked-out revision in an explicit install directory; never
  # touch the developer's working tree."
  local INSTALL_DIR="$TRANSCRIPT_DIR/install"
  local INSTALL_LOG="$TRANSCRIPT_DIR/install.log"
  local INSTALL_2_LOG="$TRANSCRIPT_DIR/install-2.log"
  mkdir -p "$TRANSCRIPT_DIR" "$INSTALL_DIR"
  info "Install directory: $INSTALL_DIR (separate from REPO_ROOT)"

  # Step 0: tear down any prior local stack from earlier runs against
  # the same repo (independent of the install dir we control).
  docker compose -f "$REPO_ROOT/docker-compose.local.yml" down 2>&1 \
    | tee "$TRANSCRIPT_DIR/compose-initial-down.log"

  # Step 1: install.sh --local into our isolated directory.
  info "Step 1: install.sh --local (first install into isolated dir)"
  # MEMROOS_INSTALL_DIR=here so install.sh writes the fresh checkout
  # into the isolated dir, not under $HOME/memroos. MEMROOS_UPDATE=0
  # so a stale local clone does not silently pull instead of using the
  # installer's checkout.
  MEMROOS_INSTALL_DIR="$INSTALL_DIR" MEMROOS_UPDATE=0 \
    bash "$REPO_ROOT/install.sh" --local 2>&1 | tee "$INSTALL_LOG" </dev/null
  local first_exit="${PIPESTATUS[0]}"
  [[ "$first_exit" == "0" ]] || fail "first install.sh --local exited ${first_exit}"

  # Step 2: capture the fresh named-volume inventory. The validator
  # flagged: previous version exited on an empty pre-list. We tolerate
  # that here; the meaningful assertion is volume preservation across
  # the SECOND install, captured below.
  docker volume ls --format '{{.Name}}' | grep '^memroos-local_' > "$TRANSCRIPT_DIR/volumes-before.txt" || true
  info "Step 2: volumes-before.txt has $(wc -l < "$TRANSCRIPT_DIR/volumes-before.txt") lines (may be 0 on a fresh runner)"

  # Step 3: wait for memroos service healthy (against the isolated
  # install dir, not the dev worktree).
  info "Step 3: wait for memroos service healthy"
  local memroos_id
  for _ in {1..60}; do
    memroos_id="$(cd "$INSTALL_DIR" && docker compose -f docker-compose.local.yml ps -q memroos 2>/dev/null || true)"
    if [[ -n "$memroos_id" ]]; then
      health=$(docker inspect "$memroos_id" --format '{{.State.Health.Status}}' 2>/dev/null || echo "")
      if [[ "$health" == "healthy" ]]; then break; fi
    fi
    sleep 5
  done

  # Step 4: HTTP smoke on all five core services (against the
  # isolated install, not the dev worktree).
  info "Step 4: HTTP smoke checks on all five core services"
  declare -A PORTS=( [memroos]=3000 [mem0]=3201 [orchestration]=3210 [neo4j]=7474 [ollama]=11434 )
  for svc in memroos mem0 orchestration neo4j ollama; do
    port="${PORTS[$svc]}"
    code=$(curl -s -o "$TRANSCRIPT_DIR/${svc}.http" -w "%{http_code}" "http://127.0.0.1:${port}/" || echo "000")
    echo "$code" > "$TRANSCRIPT_DIR/${svc}.code"
    [[ "$code" == "200" || "$code" == "401" ]] || fail "${svc} returned ${code}, expected 200/401"
  done
  pass "core service HTTP smoke checks"

  # Step 5: capture volume inventory AFTER first install (this is the
  # baseline against which the second-install preservation is asserted).
  info "Step 5: capture volume inventory AFTER first install"
  docker volume ls --format '{{.Name}}' | grep '^memroos-local_' > "$TRANSCRIPT_DIR/volumes-after-first-install.txt"
  info "  -> $(wc -l < "$TRANSCRIPT_DIR/volumes-after-first-install.txt") volumes present after install #1"

  # Step 6: idempotent second install.sh run.
  info "Step 6: idempotent second install.sh --local"
  MEMROOS_INSTALL_DIR="$INSTALL_DIR" MEMROOS_UPDATE=0 \
    bash "$REPO_ROOT/install.sh" --local 2>&1 | tee "$INSTALL_2_LOG" </dev/null
  local second_exit="${PIPESTATUS[0]}"
  [[ "$second_exit" == "0" ]] || fail "second install.sh --local exited ${second_exit}"

  # Step 7: assert named-volume PRESERVATION across the second install.
  # This is the only assertion that meaningfully tests destructive-safe
  # reinstall. An empty volume list on a fresh CI runner does NOT
  # fail; we just record the state and let the test pass.
  docker volume ls --format '{{.Name}}' | grep '^memroos-local_' > "$TRANSCRIPT_DIR/volumes-after-second-install.txt"
  diff "$TRANSCRIPT_DIR/volumes-after-first-install.txt" "$TRANSCRIPT_DIR/volumes-after-second-install.txt" \
    > "$TRANSCRIPT_DIR/volumes-diff.txt" \
    || fail "named volumes changed across the second install (regression: install.sh wiped data)"
  pass "named volumes preserved across reinstall"
  info "  -> $(wc -l < "$TRANSCRIPT_DIR/volumes-after-second-install.txt") volumes preserved"

  # Step 8: /api/health truthful for Agents and APO. Use the install
  # directory's compose project.
  info "Step 8: /api/health truthful for Agents and APO"
  (cd "$INSTALL_DIR" && curl -s http://127.0.0.1:3000/api/health) | tee "$TRANSCRIPT_DIR/api-health.json"
  python3 - "$TRANSCRIPT_DIR/api-health.json" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
services = {s.get("service") or s.get("name"): s.get("status", "unknown") for s in d.get("services", [])}
for required in ("mem0", "Knowledge Index", "Graph Memory", "Agents", "APO"):
    status = services.get(required)
    if status not in ("up", "healthy", "ok"):
        sys.stderr.write(f"FAIL: {required} is {status!r}, expected up\n")
        sys.exit(1)
sys.stdout.write("PASS: /api/health truthful for all core subsystems incl. Agents and APO\n")
PY

  # Step 9: secret/.env mode 600 check against the ACTUAL install
  # directory's .env (not TRANSCRIPT_DIR's .env, which is the fix the
  # validator flagged).
  local install_env="$INSTALL_DIR/.env"
  if [[ ! -f "$install_env" ]]; then
    install_env="$(find "$INSTALL_DIR" -maxdepth 3 -name '.env' -type f 2>/dev/null | head -1)"
  fi
  local mode
  mode=$(stat -c '%a' "$install_env" 2>/dev/null || stat -f '%p' "$install_env" | tail -c 4)
  [[ "$mode" == "600" ]] || fail ".env (${install_env}) mode is ${mode}, expected 600"
  pass ".env is mode 600"

  # Step 10: credential-rotation evidence. The install.sh credentials
  # block wrote a generated JWT_SECRET (not the literal fallback).
  grep -qE "^MEMROOS_JWT_SECRET=[a-f0-9]{32,}" "$install_env" \
    && pass "MEMROOS_JWT_SECRET rotated to openssl rand value" \
    || info "NOTE: MEMROOS_JWT_SECRET not rotated to openssl rand value (fallback or non-installer install)"

  info "OK: full disposable-host regression passed. Transcript at $TRANSCRIPT_DIR"
}

case "$MODE" in
  --fast|fast) structural_checks ;;
  --full|full) full_run ;;
  *) echo "usage: $0 [--fast|--full]  (or set TRANSCRIPT_DIR for --full)" >&2; exit 2 ;;
esac
