#!/bin/bash
# CFGDUR-05 regression tests. Stubs systemctl/logger/curl on PATH so the
# watchdog's failure branches can be driven on any machine.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CHECK="$ROOT/scripts/memroos-scheduler-liveness.sh"
PASS=0; FAIL=0

setup() {
  TMP=$(mktemp -d); mkdir -p "$TMP/bin" "$TMP/root" "$TMP/state"
  cat > "$TMP/bin/systemctl" <<'STUB'
#!/bin/bash
case "$1" in
  list-unit-files) [ -f "$STUB_DIR/timer_installed" ] && exit 0 || exit 1 ;;
  list-timers)     cat "$STUB_DIR/timer_row" 2>/dev/null ;;
  is-enabled)      echo enabled ;;
esac
exit 0
STUB
  printf '#!/bin/bash\nexit 0\n' > "$TMP/bin/logger"
  printf '#!/bin/bash\nexit 0\n' > "$TMP/bin/curl"
  chmod +x "$TMP/bin/"*
  touch "$TMP/timer_installed"
  # Default: armed timer, fresh artifact.
  echo "Mon 2026-07-27 00:00:00 GMT 10min left Sun ... memroos-healthcheck.timer x" > "$TMP/timer_row"
  touch "$TMP/state/health.log"
}

run() {
  STUB_DIR="$TMP" PATH="$TMP/bin:$PATH" \
  MEMROOS_ROOT="$TMP/root" MEMROOS_HEALTH_STATE_DIR="$TMP/state" \
  MEMROOS_WATCHED_TIMERS="memroos-healthcheck.timer" \
  MEMROOS_WATCHED_ARTIFACTS="$TMP/state/health.log" \
  bash "$CHECK" >/dev/null 2>&1
  echo $?
}

assert() { local n="$1" want="$2" got; got=$(run)
  if [ "$got" = "$want" ]; then PASS=$((PASS+1)); echo "  ✓ $n"
  else FAIL=$((FAIL+1)); echo "  ✗ $n (expected $want, got $got)"; fi
  rm -rf "$TMP"; }

echo "CFGDUR-05 scheduler-liveness tests:"

setup; assert "armed timer + fresh artifact passes" 0

# THE 2026-07-23 FAILURE: enabled, but NEXT is "-".
setup; echo "- - - - memroos-healthcheck.timer x" > "$TMP/timer_row"
assert "enabled-but-unarmed timer FAILS (the real outage)" 1

setup; : > "$TMP/timer_row"
assert "timer absent from list-timers FAILS" 1

setup; rm -f "$TMP/timer_installed"
assert "timer not installed on host is skipped, not failed" 0

setup; touch -d "3 hours ago" "$TMP/state/health.log" 2>/dev/null || touch -t "$(date -v-3H +%Y%m%d%H%M 2>/dev/null)" "$TMP/state/health.log"
assert "stale cron artifact FAILS" 1

setup; rm -f "$TMP/state/health.log"
assert "missing cron artifact FAILS" 1

echo ""; echo "  $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
