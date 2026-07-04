#!/usr/bin/env bash
# Persist a project GOAL_STATE file through the audited MemRoOS agent-context bus.
# The body is also saved to agent memory by the app when the message is accepted.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

APP_URL="${MEMROOS_APP_URL:-${MEMROOS_BASE_URL:-http://127.0.0.1:3002}}"
KEYS_DIR="${MEMROOS_AGENT_KEYS_DIR:-$HOME/.memroos/agent-keys}"
FROM_AGENT="${MEMROOS_AGENT_ID:-codex-desktop-luis-mbp}"
TO_AGENT="${MEMROOS_HANDOFF_TO_AGENT:-$FROM_AGENT}"
STATE_FILE="${MEMROOS_GOAL_STATE_FILE:-}"
SUBJECT="${MEMROOS_HANDOFF_SUBJECT:-Goal state handoff}"
MAX_BYTES="${MEMROOS_HANDOFF_MAX_BYTES:-3000}"
DRY_RUN=0

usage() {
  cat <<'HELP'
Usage: scripts/memroos-goal-state-handoff.sh [options]

Options:
  --repo PATH           Repository containing GOAL_STATE.md. Defaults to current repo.
  --state-file PATH     Explicit goal-state file. Defaults to .beastmode/GOAL_STATE.md,
                        GOAL_STATE.md, then .planning/GOAL_STATE.md under --repo.
  --from-agent ID       Sending registered agent id. Defaults to MEMROOS_AGENT_ID or codex-desktop-luis-mbp.
  --to-agent ID         Recipient registered agent id. Defaults to sender.
  --subject TEXT        Message subject.
  --app-url URL         MemRoOS app URL. Defaults to http://127.0.0.1:3002.
  --max-bytes N         Maximum bytes of state file to include. Defaults to 3000.
  --dry-run             Validate and print a non-secret summary without sending.
  --help                Show this help.
HELP
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo)
      REPO_ROOT="$(cd "${2:?--repo requires a path}" && pwd)"
      shift 2
      ;;
    --state-file)
      STATE_FILE="${2:?--state-file requires a path}"
      shift 2
      ;;
    --from-agent)
      FROM_AGENT="${2:?--from-agent requires an id}"
      shift 2
      ;;
    --to-agent)
      TO_AGENT="${2:?--to-agent requires an id}"
      shift 2
      ;;
    --subject)
      SUBJECT="${2:?--subject requires text}"
      shift 2
      ;;
    --app-url)
      APP_URL="${2:?--app-url requires a URL}"
      shift 2
      ;;
    --max-bytes)
      MAX_BYTES="${2:?--max-bytes requires a number}"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Required command not found: $1" >&2
    exit 1
  fi
}

sanitize_handoff_content() {
  # Keep the security scanner strict on the API route. Handoff state is downgraded
  # to plain text before posting so markdown code spans and token-shaped strings
  # do not trip high-severity transport guards.
  sed -E \
    -e "s/\`/'/g" \
    -e 's/AKIA[0-9A-Z]{16}/[REDACTED_AWS_ACCESS_KEY]/g' \
    -e 's/gh[pous]_[A-Za-z0-9]{36}/[REDACTED_GITHUB_TOKEN]/g' \
    -e 's/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/[REDACTED_JWT]/g' \
    -e 's/[A-Za-z0-9]{40,}/[REDACTED_LONG_TOKEN]/g'
}

resolve_state_file() {
  if [[ -n "$STATE_FILE" ]]; then
    if [[ "$STATE_FILE" = /* ]]; then
      printf "%s" "$STATE_FILE"
    else
      printf "%s/%s" "$REPO_ROOT" "$STATE_FILE"
    fi
    return
  fi

  local candidate
  for candidate in ".beastmode/GOAL_STATE.md" "GOAL_STATE.md" ".planning/GOAL_STATE.md"; do
    if [[ -f "$REPO_ROOT/$candidate" ]]; then
      printf "%s/%s" "$REPO_ROOT" "$candidate"
      return
    fi
  done
}

load_agent_key() {
  if [[ -n "${MEMROOS_AGENT_API_KEY:-}" ]]; then
    printf "%s" "$MEMROOS_AGENT_API_KEY"
    return 0
  fi

  local key_file="${MEMROOS_AGENT_KEY_FILE:-$KEYS_DIR/$FROM_AGENT.key}"
  if [[ -r "$key_file" && -s "$key_file" ]]; then
    tr -d '\r\n' < "$key_file"
    return 0
  fi

  echo "Missing MemRoOS agent key for $FROM_AGENT. Set MEMROOS_AGENT_API_KEY or MEMROOS_AGENT_KEY_FILE." >&2
  exit 1
}

require_cmd curl
require_cmd jq

STATE_PATH="$(resolve_state_file)"
if [[ -z "$STATE_PATH" || ! -f "$STATE_PATH" ]]; then
  echo "No GOAL_STATE file found under $REPO_ROOT" >&2
  exit 1
fi

if ! [[ "$MAX_BYTES" =~ ^[0-9]+$ ]] || [[ "$MAX_BYTES" -lt 1000 ]]; then
  echo "--max-bytes must be a number >= 1000" >&2
  exit 1
fi

BRANCH="$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
HEAD_SHA="$(git -C "$REPO_ROOT" rev-parse HEAD 2>/dev/null || echo unknown)"
STATUS_SHORT="$(git -C "$REPO_ROOT" status --short 2>/dev/null || true)"
case "$STATE_PATH" in
  "$REPO_ROOT"/*) REL_STATE="${STATE_PATH#"$REPO_ROOT"/}" ;;
  *) REL_STATE="$STATE_PATH" ;;
esac
STATE_BYTES="$(wc -c < "$STATE_PATH" | tr -d ' ')"
TRUNCATED=false
if [[ "$STATE_BYTES" -gt "$MAX_BYTES" ]]; then
  TRUNCATED=true
fi

if [[ "$TRUNCATED" == "true" && "$MAX_BYTES" -ge 2000 ]]; then
  HEAD_BYTES=$((MAX_BYTES / 3))
  TAIL_BYTES=$((MAX_BYTES - HEAD_BYTES))
  STATE_SNIPPET="$(head -c "$HEAD_BYTES" "$STATE_PATH")

[MemRoOS handoff note: middle of GOAL_STATE truncated to stay below agent-context scanner limits; read ${STATE_PATH} for full local state.]

$(tail -c "$TAIL_BYTES" "$STATE_PATH")"
else
  STATE_SNIPPET="$(head -c "$MAX_BYTES" "$STATE_PATH")"
fi
if [[ "$TRUNCATED" == "true" ]]; then
  STATE_SNIPPET="${STATE_SNIPPET}

[MemRoOS handoff note: GOAL_STATE content truncated at ${MAX_BYTES} bytes; read ${STATE_PATH} for full local state.]"
fi
STATE_SNIPPET="$(printf "%s" "$STATE_SNIPPET" | sanitize_handoff_content)"

if [[ -n "$STATUS_SHORT" ]]; then
  STATUS_BLOCK="$STATUS_SHORT"
else
  STATUS_BLOCK="clean"
fi

BODY="$(cat <<EOF
MemRoOS goal-state handoff

Repo: ${REPO_ROOT}
Branch: ${BRANCH}
HEAD: ${HEAD_SHA}
State file: ${REL_STATE}
State bytes: ${STATE_BYTES}
Truncated: ${TRUNCATED}

Git status:
${STATUS_BLOCK}

--- BEGIN GOAL STATE ---
${STATE_SNIPPET}
--- END GOAL STATE ---
EOF
)"

if [[ "$DRY_RUN" == "1" ]]; then
  echo "Goal-state handoff dry run"
  echo "  app_url: ${APP_URL}"
  echo "  from_agent: ${FROM_AGENT}"
  echo "  to_agent: ${TO_AGENT}"
  echo "  state_file: ${STATE_PATH}"
  echo "  state_bytes: ${STATE_BYTES}"
  echo "  truncated: ${TRUNCATED}"
  exit 0
fi

AGENT_KEY="$(load_agent_key)"
REQUEST_FILE="$(mktemp -t memroos-goal-state-handoff.XXXXXX.json)"
RESPONSE_FILE="$(mktemp -t memroos-goal-state-handoff-response.XXXXXX.json)"
trap 'rm -f "$REQUEST_FILE" "$RESPONSE_FILE"' EXIT

jq -n \
  --arg fromAgent "$FROM_AGENT" \
  --arg toAgent "$TO_AGENT" \
  --arg subject "$SUBJECT" \
  --arg body "$BODY" \
  --arg repo "$REPO_ROOT" \
  --arg branch "$BRANCH" \
  --arg head "$HEAD_SHA" \
  --arg stateFile "$REL_STATE" \
  --arg statePath "$STATE_PATH" \
  --argjson truncated "$TRUNCATED" \
  --argjson stateBytes "$STATE_BYTES" \
  '{
    fromAgent: $fromAgent,
    toAgent: $toAgent,
    subject: $subject,
    body: $body,
    messageType: "context_sync",
    priority: 2,
    replyRequired: false,
    saveToMemory: true,
    memoryType: "handoff",
    memoryMetadata: {
      repo: $repo,
      branch: $branch,
      head: $head,
      state_file: $stateFile,
      state_path: $statePath,
      state_bytes: $stateBytes,
      truncated: $truncated,
      source: "goal_state_handoff"
    },
    contextRefs: [
      {type: "repo", value: $repo},
      {type: "git_head", value: $head},
      {type: "goal_state_file", value: $statePath}
    ],
    artifacts: {
      repo: $repo,
      branch: $branch,
      head: $head,
      stateFile: $stateFile,
      statePath: $statePath,
      truncated: $truncated
    }
  }' > "$REQUEST_FILE"

if curl -sS -X POST "${APP_URL%/}/api/agent-context/messages" \
  -H "Authorization: Bearer ${AGENT_KEY}" \
  -H "Content-Type: application/json" \
  --data-binary "@${REQUEST_FILE}" \
  -o "$RESPONSE_FILE" \
  --max-time 20; then
  if jq -e '.ok == true and .message.id' "$RESPONSE_FILE" >/dev/null; then
    msg_id="$(jq -r '.message.id' "$RESPONSE_FILE")"
    saved_memory_id="$(jq -r '.message.savedMemoryId // "none"' "$RESPONSE_FILE")"
    echo "Goal-state handoff recorded: ${msg_id}"
    echo "Saved memory id: ${saved_memory_id}"
    exit 0
  fi
fi

echo "Goal-state handoff failed:" >&2
jq -c '{ok, error, code, detail}' "$RESPONSE_FILE" >&2 2>/dev/null || cat "$RESPONSE_FILE" >&2
exit 1
