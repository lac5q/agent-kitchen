#!/usr/bin/env bash
# Public Fathom.ai meeting transcript ingest for MemRoOS.
# Secrets: FATHOM_API_KEY from env or envFile (never commit keys).
#
# Usage:
#   fathom_ingest.sh --output-dir PATH
#   fathom_ingest.sh --output-dir PATH --from 2026-01-01 --to 2026-07-01
#   fathom_ingest.sh --output-dir PATH --dry-run
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TRANSFORM="$SCRIPT_DIR/fathom_transform.py"
LOG_PREFIX="[fathom-ingest]"
DRY_RUN=0
FROM_DATE=""
TO_DATE=""
OUTPUT_DIR=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --from) FROM_DATE="$2"; shift 2 ;;
    --to) TO_DATE="$2"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    --output-dir) OUTPUT_DIR="$2"; shift 2 ;;
    -h|--help)
      sed -n '2,10p' "$0"
      exit 0
      ;;
    *) echo "Unknown arg: $1" >&2; exit 1 ;;
  esac
done

if [[ -z "${FATHOM_API_KEY:-}" ]]; then
  echo "$LOG_PREFIX ERROR: FATHOM_API_KEY not set (source envFile first)." >&2
  exit 1
fi

if [[ -z "$OUTPUT_DIR" ]]; then
  echo "$LOG_PREFIX ERROR: --output-dir is required" >&2
  exit 1
fi

if [[ -z "$FROM_DATE" ]]; then
  FROM_DATE=$(date -u -v-7d +%Y-%m-%d 2>/dev/null || date -u --date="7 days ago" +%Y-%m-%d)
fi
if [[ -z "$TO_DATE" ]]; then
  TO_DATE=$(date -u +%Y-%m-%d)
fi

WORK_DIR="$(mktemp -d -t fathom-ingest.XXXXXX)"
trap 'rm -rf "$WORK_DIR"' EXIT
mkdir -p "$OUTPUT_DIR"
echo "$LOG_PREFIX window: $FROM_DATE → $TO_DATE (dry_run: $DRY_RUN) → $OUTPUT_DIR"

JSONL="$WORK_DIR/all-meetings.jsonl"
: > "$JSONL"
CURSOR=""

while : ; do
  URL="https://api.fathom.ai/external/v1/meetings?limit=100&include_transcript=true&include_summary=true&include_action_items=true"
  [[ -n "$CURSOR" ]] && URL="${URL}&cursor=${CURSOR}"

  RESP="$WORK_DIR/page.json"
  HTTP_CODE=$(curl -s -o "$RESP" -w "%{http_code}" \
    -H "X-Api-Key: ${FATHOM_API_KEY}" \
    -H "Content-Type: application/json" \
    "$URL")

  if [[ "$HTTP_CODE" != "200" ]]; then
    echo "$LOG_PREFIX ERROR: API returned HTTP $HTTP_CODE" >&2
    cat "$RESP" >&2
    exit 1
  fi

  python3 <<PY >> "$JSONL"
import json
with open("$RESP") as f:
    page = json.load(f)
for m in page.get("items", []):
    print(json.dumps(m))
PY

  CURSOR=$(python3 -c "
import json
with open('$RESP') as f:
    page = json.load(f)
print(page.get('next_cursor') or '')
")
  [[ -z "$CURSOR" ]] && break
done

RAW_JSON="$WORK_DIR/all-meetings.json"
python3 <<PY
import json
from datetime import datetime
with open("$JSONL") as f:
    lines = [json.loads(line) for line in f if line.strip()]
def parse_dt(s):
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return None
start = datetime.fromisoformat("${FROM_DATE}T00:00:00+00:00")
end = datetime.fromisoformat("${TO_DATE}T23:59:59+00:00")
filtered = []
for m in lines:
    dt = parse_dt(m.get("recording_start_time") or m.get("scheduled_start_time") or m.get("actual_start_time") or m.get("created_at"))
    if dt and start <= dt <= end:
        filtered.append(m)
print(f"Total fetched: {len(lines)}, in window $FROM_DATE..$TO_DATE: {len(filtered)}", file=__import__("sys").stderr)
with open("$RAW_JSON", "w") as f:
    json.dump({"items": filtered}, f)
PY

TOTAL=$(python3 -c "import json; d=json.load(open('$RAW_JSON')); print(len(d['items']))")
echo "$LOG_PREFIX found $TOTAL meetings in window"

if [[ $DRY_RUN -eq 1 ]]; then
  python3 -c "
import json
with open('$RAW_JSON') as f:
    d = json.load(f)
for m in d['items']:
    when = (m.get('scheduled_start_time') or m.get('created_at') or '?')[:10]
    print(f'  {when}  {m.get(\"title\",\"?\")[:60]}')
"
  exit 0
fi

python3 "$TRANSFORM" --output-dir "$OUTPUT_DIR" --input "$RAW_JSON"
echo "$LOG_PREFIX done"
