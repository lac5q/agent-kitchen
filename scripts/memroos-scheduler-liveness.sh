#!/bin/bash
# CFGDUR-05 (Phase 196) — monitor the monitors.
#
# On 2026-07-23 both memroos-healthcheck.timer and memroos-disk-watch.timer
# stopped firing, at almost exactly the moment the disk hit its critical
# threshold. They sat dead for three days. Nobody noticed.
#
# The reason nobody noticed is the important part: `systemctl is-enabled`
# returned "enabled" for both the entire time. Enabled is a persistence
# setting, not a runtime fact. The timers were enabled AND not scheduled —
# `systemctl list-timers` showed NEXT as "-". A check asserting is-enabled
# would have reported healthy throughout.
#
# So this asserts RECENCY OF LAST RUN, which is the only property that
# actually distinguishes a working scheduler from a dead one:
#   - systemd timers: NEXT must be a real timestamp, not "-"
#   - cron jobs: the artifact they write must have a recent mtime
#
# The alert path deliberately does not depend on the health check, because
# the thing being monitored is the health check.

set -uo pipefail

MEMROOS_ROOT="${MEMROOS_ROOT:-$HOME/memroos}"
STATE_DIR="${MEMROOS_HEALTH_STATE_DIR:-$MEMROOS_ROOT/.health}"
LOG="$STATE_DIR/liveness.log"
mkdir -p "$STATE_DIR"

# A 15-min cron job is stale after 45 min (three missed runs). A 30-min timer
# is stale after 90. Tolerates one blip; catches a real stop quickly.
CRON_STALE_SECONDS="${MEMROOS_CRON_STALE_SECONDS:-2700}"

ts() { date -u +%Y-%m-%dT%H:%M:%SZ; }

# stat(1) is not portable: GNU uses -c %Y, BSD/macOS uses -f %m. Getting this
# wrong silently yields 0, which makes every file look infinitely stale.
mtime() { stat -c %Y "$1" 2>/dev/null || stat -f %m "$1" 2>/dev/null || echo 0; }
FAILURES=0

alert() {
  FAILURES=$((FAILURES + 1))
  echo "$(ts) FAIL: $1" >> "$LOG"
  # syslog first: it works even when the network and SendGrid do not.
  logger -t memroos-scheduler-liveness -p user.err "$1" 2>/dev/null || true
  [ -f "$MEMROOS_ROOT/.env" ] || return 0
  SG_KEY=$(grep '^SENDGRID_API_KEY=' "$MEMROOS_ROOT/.env" | cut -d= -f2-)
  FROM=$(grep '^MEMROOS_EMAIL_FROM=' "$MEMROOS_ROOT/.env" | cut -d= -f2-)
  TO="${MEMROOS_ALERT_EMAIL:-luis@epiloguecapital.com}"
  [ -n "${SG_KEY:-}" ] && [ -n "${FROM:-}" ] || return 0
  LAST="$STATE_DIR/last_liveness_$(echo "$1" | md5sum | cut -d' ' -f1)"
  if [ ! -f "$LAST" ] || [ $(( $(date +%s) - $(mtime "$LAST") )) -gt 21600 ]; then
    curl -s -X POST https://api.sendgrid.com/v3/mail/send \
      -H "Authorization: Bearer $SG_KEY" -H 'Content-Type: application/json' \
      -d "{\"personalizations\":[{\"to\":[{\"email\":\"$TO\"}]}],\"from\":{\"email\":\"$FROM\"},\"subject\":\"[memroos] a monitor stopped running\",\"content\":[{\"type\":\"text/plain\",\"value\":\"$1\"}]}" > /dev/null
    touch "$LAST"
  fi
}

ok() { echo "$(ts) OK: $1" >> "$LOG"; }

# ── systemd timers: armed, not merely enabled ────────────────────────────────
for timer in ${MEMROOS_WATCHED_TIMERS:-memroos-healthcheck.timer memroos-disk-watch.timer}; do
  if ! systemctl list-unit-files "$timer" >/dev/null 2>&1; then
    ok "$timer not installed on this host (skipped)"
    continue
  fi
  NEXT=$(systemctl list-timers "$timer" --all --no-pager --no-legend 2>/dev/null | awk '{print $1}')
  if [ -z "$NEXT" ] || [ "$NEXT" = "-" ] || [ "$NEXT" = "n/a" ]; then
    ENABLED=$(systemctl is-enabled "$timer" 2>/dev/null || echo unknown)
    alert "$timer is NOT ARMED (next run: none). is-enabled reports '$ENABLED' — this is the exact state that hid a three-day outage on 2026-07-23. Re-arm with: sudo systemctl start $timer"
  else
    ok "$timer armed (next: $NEXT)"
  fi
done

# ── cron artifacts: recent, not merely present ───────────────────────────────
for artifact in ${MEMROOS_WATCHED_ARTIFACTS:-$STATE_DIR/health.log}; do
  if [ ! -f "$artifact" ]; then
    alert "Expected cron artifact missing: $artifact. The job writing it has never run, or the path changed."
    continue
  fi
  AGE=$(( $(date +%s) - $(mtime "$artifact") ))
  if [ "$AGE" -gt "$CRON_STALE_SECONDS" ]; then
    alert "Cron artifact $artifact is stale: last written ${AGE}s ago (threshold ${CRON_STALE_SECONDS}s). The job that writes it has stopped."
  else
    ok "$(basename "$artifact") fresh (${AGE}s old)"
  fi
done

if [ "$FAILURES" -eq 0 ]; then
  exit 0
fi
exit 1
