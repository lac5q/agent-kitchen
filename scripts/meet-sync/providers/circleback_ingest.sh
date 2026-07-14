#!/usr/bin/env bash
# Public Circleback.ai meeting transcript ingest for MemRoOS.
# Requires `circleback` CLI authenticated on the operator machine.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MEMROOS_ROOT="${MEMROOS_ROOT:-$(cd "$SCRIPT_DIR/../../.." && pwd)}"
OUTPUT_DIR="${OUTPUT_DIR:-$MEMROOS_ROOT/data/context/meet-recordings-circleback}"
FROM_DATE="${FROM_DATE:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --output-dir) OUTPUT_DIR="$2"; shift 2 ;;
    --from) FROM_DATE="$2"; shift 2 ;;
    -h|--help)
      echo "Usage: circleback_ingest.sh [--output-dir PATH] [--from YYYY-MM-DD]"
      exit 0
      ;;
    *) shift ;;
  esac
done

if [[ -z "$FROM_DATE" ]]; then
  FROM_DATE=$(date -u -v-30d +%Y-%m-%d 2>/dev/null || date -u --date="30 days ago" +%Y-%m-%d)
fi

export FROM_DATE OUTPUT_DIR
python3 "$SCRIPT_DIR/circleback_ingest.py" --output-dir "$OUTPUT_DIR" --from-date "$FROM_DATE"
echo "Circleback ingest complete: $(ls "$OUTPUT_DIR"/*.md 2>/dev/null | wc -l | tr -d ' ') meeting files"
