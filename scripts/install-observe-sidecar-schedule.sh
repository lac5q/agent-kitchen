#!/usr/bin/env bash
# Install/check/remove the observe sidecar scheduler without touching
# unrelated launchd, systemd, or cron entries.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="${MEMROOS_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"
HOME_DIR="${HOME:-$(eval echo "~$(whoami)")}"
MODE="install"
for arg in "$@"; do
  case "$arg" in
    --install) MODE="install" ;;
    --check) MODE="check" ;;
    --uninstall) MODE="uninstall" ;;
  esac
done

PLATFORM="${MEMROOS_SCHEDULE_PLATFORM:-}"
if [[ -z "$PLATFORM" ]]; then
  case "$(uname -s)" in
    Darwin) PLATFORM="launchd" ;;
    Linux) PLATFORM="systemd" ;;
    *) PLATFORM="cron" ;;
  esac
fi

RUNNER="$ROOT/scripts/run-observe-sidecar-scheduled.sh"
LOG_FILE="${MEMROOS_HOOK_ROOT:-$HOME_DIR/.memroos}/logs/observe-sidecar.log"
LAUNCHD_FILE="$HOME_DIR/Library/LaunchAgents/com.memroos.observe-sidecar.plist"
SYSTEMD_DIR="$HOME_DIR/.config/systemd/user"
SYSTEMD_SERVICE="$SYSTEMD_DIR/memroos-observe-sidecar.service"
SYSTEMD_TIMER="$SYSTEMD_DIR/memroos-observe-sidecar.timer"
CRON_FILE="$HOME_DIR/.config/memroos/observe-sidecar.cron"

render_template() {
  local source="$1" target="$2"
  mkdir -p "$(dirname "$target")"
  python3 - "$source" "$target" "$RUNNER" "$LOG_FILE" "$ROOT" <<'PY'
import pathlib
import sys

source, target, runner, log_file, root = sys.argv[1:]
text = pathlib.Path(source).read_text()
text = text.replace("__RUNNER__", runner).replace("__LOG__", log_file).replace("__ROOT__", root)
pathlib.Path(target).write_text(text)
PY
}

activate_launchd() {
  command -v launchctl >/dev/null 2>&1 || return 0
  local domain="gui/$(id -u)"
  launchctl bootout "$domain" "$LAUNCHD_FILE" >/dev/null 2>&1 || true
  launchctl bootstrap "$domain" "$LAUNCHD_FILE" >/dev/null 2>&1 || echo "WARN: launchctl bootstrap failed; plist is installed at $LAUNCHD_FILE" >&2
}

activate_systemd() {
  command -v systemctl >/dev/null 2>&1 || return 0
  systemctl --user daemon-reload >/dev/null 2>&1 || true
  systemctl --user enable --now memroos-observe-sidecar.timer >/dev/null 2>&1 || echo "WARN: systemd user timer activation failed; units are installed under $SYSTEMD_DIR" >&2
}

case "$MODE:$PLATFORM" in
  install:launchd)
    render_template "$ROOT/deploy/launchd/com.memroos.observe-sidecar.plist.template" "$LAUNCHD_FILE"
    activate_launchd
    echo "installed launchd schedule: $LAUNCHD_FILE"
    ;;
  install:systemd)
    render_template "$ROOT/deploy/systemd/memroos-observe-sidecar.service" "$SYSTEMD_SERVICE"
    render_template "$ROOT/deploy/systemd/memroos-observe-sidecar.timer" "$SYSTEMD_TIMER"
    activate_systemd
    echo "installed systemd user schedule: $SYSTEMD_TIMER"
    ;;
  install:cron)
    render_template "$ROOT/deploy/cron/memroos-observe-sidecar.cron.template" "$CRON_FILE"
    echo "installed cron template: $CRON_FILE"
    ;;
  check:launchd)
    [[ -f "$LAUNCHD_FILE" ]] || { echo "missing launchd schedule: $LAUNCHD_FILE" >&2; exit 1; }
    ;;
  check:systemd)
    [[ -f "$SYSTEMD_SERVICE" && -f "$SYSTEMD_TIMER" ]] || { echo "missing systemd schedule under $SYSTEMD_DIR" >&2; exit 1; }
    ;;
  check:cron)
    [[ -f "$CRON_FILE" ]] || { echo "missing cron template: $CRON_FILE" >&2; exit 1; }
    ;;
  uninstall:launchd)
    if command -v launchctl >/dev/null 2>&1; then launchctl bootout "gui/$(id -u)" "$LAUNCHD_FILE" >/dev/null 2>&1 || true; fi
    rm -f "$LAUNCHD_FILE"
    ;;
  uninstall:systemd)
    if command -v systemctl >/dev/null 2>&1; then systemctl --user disable --now memroos-observe-sidecar.timer >/dev/null 2>&1 || true; fi
    rm -f "$SYSTEMD_SERVICE" "$SYSTEMD_TIMER"
    ;;
  uninstall:cron)
    rm -f "$CRON_FILE"
    ;;
  *)
    echo "unknown scheduler platform: $PLATFORM" >&2
    exit 1
    ;;
esac
