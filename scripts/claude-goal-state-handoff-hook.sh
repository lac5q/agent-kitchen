#!/usr/bin/env bash
# Claude hook wrapper for durable MemRoOS GOAL_STATE handoffs.
# Reads Claude hook JSON from stdin, detects a project goal-state file, and
# posts it through the audited MemRoOS agent-context bus. Safe to run often.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MEMROOS_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DRY_RUN="${MEMROOS_GOAL_STATE_HANDOFF_DRY_RUN:-0}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --help|-h)
      cat <<'HELP'
Usage: scripts/claude-goal-state-handoff-hook.sh [--dry-run]

Reads Claude hook JSON on stdin. If cwd contains .beastmode/GOAL_STATE.md,
GOAL_STATE.md, or .planning/GOAL_STATE.md, sends it via MemRoOS.
HELP
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 2
      ;;
  esac
done

read_hook_payload() {
  local payload
  payload="$(cat 2>/dev/null || true)"
  printf "%s" "$payload"
}

json_field() {
  local payload="$1" field="$2"
  HOOK_PAYLOAD="$payload" python3 - "$field" <<'PY'
import json
import os
import sys

field = sys.argv[1]
try:
    payload = json.loads(os.environ.get("HOOK_PAYLOAD", "") or "{}")
except Exception:
    payload = {}
value = payload.get(field, "")
print(value if isinstance(value, str) else "")
PY
}

state_file_for_repo() {
  local repo="$1" candidate
  for candidate in ".beastmode/GOAL_STATE.md" "GOAL_STATE.md" ".planning/GOAL_STATE.md"; do
    if [[ -f "$repo/$candidate" ]]; then
      printf "%s/%s" "$repo" "$candidate"
      return 0
    fi
  done
  return 1
}

repo_cache_key() {
  local repo="$1"
  printf "%s" "$repo" | shasum -a 256 | awk '{print $1}'
}

state_fingerprint() {
  local repo="$1" state_path="$2" head bytes digest
  head="$(git -C "$repo" rev-parse HEAD 2>/dev/null || echo unknown)"
  bytes="$(wc -c < "$state_path" | tr -d ' ')"
  digest="$(shasum -a 256 "$state_path" | awk '{print $1}')"
  printf "repo=%s\nhead=%s\nstate=%s\nbytes=%s\nsha256=%s\n" "$repo" "$head" "$state_path" "$bytes" "$digest"
}

payload="$(read_hook_payload)"
repo="$(json_field "$payload" cwd)"
if [[ -z "$repo" ]]; then
  repo="$PWD"
fi
if [[ ! -d "$repo" ]]; then
  exit 0
fi

state_path="$(state_file_for_repo "$repo" || true)"
if [[ -z "$state_path" ]]; then
  exit 0
fi

fingerprint="$(state_fingerprint "$repo" "$state_path")"
cache_dir="${MEMROOS_GOAL_STATE_HANDOFF_CACHE_DIR:-$HOME/.memroos/goal-state-handoff-cache}"
cache_file="$cache_dir/$(repo_cache_key "$repo").fingerprint"
if [[ "$DRY_RUN" != "1" && -f "$cache_file" ]] && cmp -s <(printf "%s" "$fingerprint") "$cache_file"; then
  exit 0
fi

case "$state_path" in
  "$repo"/*) rel_state="${state_path#"$repo"/}" ;;
  *) rel_state="$state_path" ;;
esac

if [[ "$DRY_RUN" == "1" ]]; then
  echo "Goal-state handoff hook dry run"
  echo "  repo: $repo"
  echo "  state_file: $rel_state"
  echo "  from_agent: ${MEMROOS_AGENT_ID:-claude-code-luis-mbp}"
  echo "  to_agent: ${MEMROOS_HANDOFF_TO_AGENT:-codex-desktop-luis-mbp}"
  exit 0
fi

mkdir -p "$cache_dir"
if MEMROOS_AGENT_ID="${MEMROOS_AGENT_ID:-claude-code-luis-mbp}" \
  MEMROOS_HANDOFF_TO_AGENT="${MEMROOS_HANDOFF_TO_AGENT:-codex-desktop-luis-mbp}" \
  MEMROOS_HANDOFF_SUBJECT="${MEMROOS_HANDOFF_SUBJECT:-Claude goal-state handoff}" \
  "$MEMROOS_ROOT/scripts/memroos-goal-state-handoff.sh" \
    --repo "$repo" \
    --state-file "$state_path" >/dev/null; then
  printf "%s" "$fingerprint" > "$cache_file"
else
  echo "MemRoOS goal-state handoff hook failed for $repo" >&2
fi

exit 0
