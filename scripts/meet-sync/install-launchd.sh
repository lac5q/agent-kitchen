#!/usr/bin/env bash
# Generate and load LaunchAgents for enabled meet-sync sources.
#
# Usage:
#   install-launchd.sh              # install + load enabled sources
#   install-launchd.sh --unload     # unload generated agents
#   install-launchd.sh --dry-run    # print what would be installed
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MEMROOS_ROOT="${MEMROOS_ROOT:-$(cd "$SCRIPT_DIR/../.." && pwd)}"
RUNNER="$SCRIPT_DIR/meet-sync.sh"
LAUNCH_DIR="${MEMROOS_LAUNCH_AGENTS_DIR:-$HOME/Library/LaunchAgents}"
LABEL_PREFIX="com.memroos.meet-sync"
LOG_DIR="${MEMROOS_MEET_SYNC_STATUS_DIR:-$HOME/.memroos/logs/meet-sync}"
UID_DOMAIN="gui/$(id -u)"

PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
export PATH

DRY_RUN=0
UNLOAD=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=1; shift ;;
    --unload) UNLOAD=1; shift ;;
    -h|--help)
      sed -n '2,10p' "$0"
      exit 0
      ;;
    *) echo "Unknown arg: $1" >&2; exit 2 ;;
  esac
done

resolve_config() {
  if [[ -n "${MEMROOS_MEETING_SOURCES_CONFIG:-}" && -f "$MEMROOS_MEETING_SOURCES_CONFIG" ]]; then
    echo "$MEMROOS_MEETING_SOURCES_CONFIG"
    return
  fi
  if [[ -f "$HOME/.memroos/meeting-sources.json" ]]; then
    echo "$HOME/.memroos/meeting-sources.json"
    return
  fi
  echo "$SCRIPT_DIR/meeting-sources.example.json"
}

CONFIG_PATH="$(resolve_config)"
mkdir -p "$LAUNCH_DIR" "$LOG_DIR"

if [[ "$UNLOAD" -eq 1 ]]; then
  for plist in "$LAUNCH_DIR"/${LABEL_PREFIX}.*.plist; do
    [[ -f "$plist" ]] || continue
    label="$(basename "$plist" .plist)"
    echo "unload $label"
    if [[ "$DRY_RUN" -eq 0 ]]; then
      launchctl bootout "$UID_DOMAIN" "$plist" 2>/dev/null || true
    fi
  done
  exit 0
fi

python3 - "$CONFIG_PATH" "$LAUNCH_DIR" "$LABEL_PREFIX" "$RUNNER" "$LOG_DIR" "$HOME" "$DRY_RUN" <<'PY'
import json, os, sys, plistlib
from pathlib import Path

config_path, launch_dir, prefix, runner, log_dir, home, dry = sys.argv[1:8]
dry = dry == "1"
cfg = json.load(open(config_path))
sources = [s for s in (cfg.get("sources") or []) if s.get("enabled")]
if not sources:
    print("No enabled sources in", config_path)
    sys.exit(0)

legacy = [
    "com.memroos.fathom-epilogue-sync",
    "com.memroos.fathom-personal-sync",
    "com.memroos.fathom-sync",
    "com.memroos.circleback-sync",
]
print("Legacy agents to unload (if present):", ", ".join(legacy))

written = []
for s in sources:
    sid = s["id"]
    sched = s.get("schedule") or {}
    hour = int(sched.get("hour", 6))
    minute = int(sched.get("minute", 0))
    label = f"{prefix}.{sid}"
    plist_path = Path(launch_dir) / f"{label}.plist"
    cmd = (
        f'source "$HOME/.memroos/memroos-runtime.env" 2>/dev/null; '
        f'"{runner}" --source "{sid}"'
    )
    payload = {
        "Label": label,
        "ProgramArguments": ["/bin/bash", "-c", cmd],
        "StartCalendarInterval": {"Hour": hour, "Minute": minute},
        "StandardOutPath": str(Path(log_dir) / f"{sid}.log"),
        "StandardErrorPath": str(Path(log_dir) / f"{sid}.error.log"),
        "EnvironmentVariables": {
            "PATH": "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin",
            "HOME": home,
            "MEMROOS_ROOT": str(Path(runner).resolve().parents[2]),
        },
        "RunAtLoad": False,
    }
    print(f"{'DRY ' if dry else ''}write {plist_path} @ {hour:02d}:{minute:02d}")
    if not dry:
        with open(plist_path, "wb") as f:
            plistlib.dump(payload, f)
        os.chmod(plist_path, 0o644)
    written.append(str(plist_path))

Path(log_dir).joinpath("_install-manifest.json").write_text(
    json.dumps({"config": config_path, "plists": written, "legacy": legacy}, indent=2) + "\n"
)
print(f"Prepared {len(written)} LaunchAgent(s)")
PY

if [[ "$DRY_RUN" -eq 1 ]]; then
  exit 0
fi

# Unload legacy meeting sync agents
for label in com.memroos.fathom-epilogue-sync com.memroos.fathom-personal-sync com.memroos.fathom-sync com.memroos.circleback-sync; do
  plist="$LAUNCH_DIR/${label}.plist"
  if [[ -f "$plist" ]]; then
    echo "bootout legacy $label"
    launchctl bootout "$UID_DOMAIN" "$plist" 2>/dev/null || true
  fi
done

# Load generated agents
for plist in "$LAUNCH_DIR"/${LABEL_PREFIX}.*.plist; do
  [[ -f "$plist" ]] || continue
  label="$(basename "$plist" .plist)"
  echo "bootstrap $label"
  launchctl bootout "$UID_DOMAIN" "$plist" 2>/dev/null || true
  launchctl bootstrap "$UID_DOMAIN" "$plist"
done

launchctl list | rg "${LABEL_PREFIX}\\." || true
echo "install-launchd complete"
