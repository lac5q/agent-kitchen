#!/usr/bin/env bash
# Prefer a modern bash when available (macOS /bin/bash is 3.2).
if [[ -z "${MEMROOS_MEET_SYNC_BASH:-}" && -x /opt/homebrew/bin/bash && "$BASH" != "/opt/homebrew/bin/bash" ]]; then
  export MEMROOS_MEET_SYNC_BASH=1
  exec /opt/homebrew/bin/bash "$0" "$@"
fi
# MemRoOS meeting sync runner — public pattern.
#
# Pipeline per source:
#   ingest → ensure QMD collection → collection update → collection embed → status JSON
#
# Usage:
#   meet-sync.sh                         # all enabled sources
#   meet-sync.sh --source circleback     # one source
#   meet-sync.sh --dry-run
#   meet-sync.sh --skip-ingest           # QMD refresh only
#   meet-sync.sh --skip-embed
#   meet-sync.sh --list
#
# Config (first match wins):
#   $MEMROOS_MEETING_SOURCES_CONFIG
#   ~/.memroos/meeting-sources.json
#   <repo>/scripts/meet-sync/meeting-sources.example.json
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MEMROOS_ROOT="${MEMROOS_ROOT:-$(cd "$SCRIPT_DIR/../.." && pwd)}"
QMD_UPDATE="$SCRIPT_DIR/qmd-update-collection.sh"
STATUS_DIR="${MEMROOS_MEET_SYNC_STATUS_DIR:-$HOME/.memroos/logs/meet-sync}"
LOG_PREFIX="[meet-sync]"

PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
export PATH

SOURCE_FILTER=""
DRY_RUN=0
SKIP_INGEST=0
SKIP_EMBED=0
LIST_ONLY=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --source) SOURCE_FILTER="$2"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    --skip-ingest) SKIP_INGEST=1; shift ;;
    --skip-embed) SKIP_EMBED=1; shift ;;
    --list) LIST_ONLY=1; shift ;;
    -h|--help)
      sed -n '2,18p' "$0"
      exit 0
      ;;
    *)
      echo "$LOG_PREFIX Unknown arg: $1" >&2
      exit 2
      ;;
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

expand_path() {
  local raw="$1"
  if [[ -z "$raw" || "$raw" == "null" ]]; then
    echo ""
    return
  fi
  # shellcheck disable=SC2086
  eval echo "$raw"
}

CONFIG_PATH="$(resolve_config)"
mkdir -p "$STATUS_DIR"

if [[ ! -f "$CONFIG_PATH" ]]; then
  echo "$LOG_PREFIX ERROR: config not found: $CONFIG_PATH" >&2
  exit 1
fi

echo "$LOG_PREFIX config=$CONFIG_PATH"

SOURCES_JSON="$(python3 - "$CONFIG_PATH" "$SOURCE_FILTER" "$LIST_ONLY" <<'PY'
import json, sys
path, filt, list_only = sys.argv[1], sys.argv[2], sys.argv[3] == "1"
cfg = json.load(open(path))
sources = cfg.get("sources") or []
defaults = cfg.get("defaults") or {}
out = []
for s in sources:
    if filt and s.get("id") != filt:
        continue
    # --list shows every source; normal runs only enabled (unless --source forces one)
    if not list_only and not filt and not s.get("enabled", False):
        continue
    item = dict(s)
    item["_defaults"] = defaults
    out.append(item)
json.dump({"sources": out, "defaults": defaults}, sys.stdout)
PY
)"

SOURCE_COUNT="$(python3 -c 'import json,sys; print(len(json.loads(sys.argv[1])["sources"]))' "$SOURCES_JSON")"
if [[ "$SOURCE_COUNT" -eq 0 ]]; then
  if [[ -n "$SOURCE_FILTER" ]]; then
    echo "$LOG_PREFIX ERROR: source not found: $SOURCE_FILTER" >&2
    exit 1
  fi
  echo "$LOG_PREFIX no enabled sources"
  exit 0
fi

if [[ "$LIST_ONLY" -eq 1 || "$DRY_RUN" -eq 1 ]]; then
  python3 - "$SOURCES_JSON" <<'PY'
import json, sys
data = json.loads(sys.argv[1])
for s in data["sources"]:
    cols = ", ".join(s.get("qmdCollections") or [])
    sched = s.get("schedule") or {}
    print(
        f"{s.get('id')}\tenabled={s.get('enabled')}\tprovider={s.get('provider')}\t"
        f"collections=[{cols}]\tschedule={sched.get('hour')}:{sched.get('minute', 0):02d}\t"
        f"ingest={s.get('ingestCommand')}"
    )
PY
  [[ "$LIST_ONLY" -eq 1 ]] && exit 0
  echo "$LOG_PREFIX dry-run complete ($SOURCE_COUNT source(s))"
  exit 0
fi

ensure_collection() {
  local name="$1"
  local path="$2"
  if [[ -z "$name" ]]; then
    return 0
  fi
  if qmd collection show "$name" >/dev/null 2>&1; then
    return 0
  fi
  if [[ -z "$path" ]]; then
    echo "$LOG_PREFIX WARN: collection '$name' missing and no outputDir to create it" >&2
    return 1
  fi
  mkdir -p "$path"
  echo "$LOG_PREFIX creating QMD collection $name → $path"
  qmd collection add "$path" --name "$name"
}

write_status() {
  local id="$1"
  local exit_code="$2"
  local detail_json="$3"
  python3 - "$STATUS_DIR/$id.json" "$id" "$exit_code" "$detail_json" <<'PY'
import json, sys
from datetime import datetime, timezone
path, sid, code, detail = sys.argv[1], sys.argv[2], int(sys.argv[3]), sys.argv[4]
payload = {
    "id": sid,
    "exitCode": code,
    "ok": code == 0,
    "finishedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "detail": json.loads(detail),
}
open(path, "w").write(json.dumps(payload, indent=2) + "\n")
print(f"status → {path}")
PY
}

run_source() {
  local src_json="$1"
  local id provider ingest env_file output_dir
  id="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["id"])' "$src_json")"
  provider="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1]).get("provider") or "")' "$src_json")"
  ingest="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1]).get("ingestCommand") or "")' "$src_json")"
  env_file="$(python3 -c 'import json,sys; v=json.loads(sys.argv[1]).get("envFile"); print(v or "")' "$src_json")"
  output_dir="$(python3 -c 'import json,sys; v=json.loads(sys.argv[1]).get("outputDir"); print(v or "")' "$src_json")"
  local embed_default
  embed_default="$(python3 -c 'import json,sys; d=json.loads(sys.argv[1]).get("_defaults") or {}; print("1" if d.get("embed", True) else "0")' "$src_json")"

  COLLECTIONS=()
  while IFS= read -r col; do
    [[ -n "$col" ]] && COLLECTIONS+=("$col")
  done < <(python3 -c 'import json,sys; print("\n".join(json.loads(sys.argv[1]).get("qmdCollections") or []))' "$src_json")

  ingest="$(expand_path "$ingest")"
  env_file="$(expand_path "$env_file")"
  output_dir="$(expand_path "$output_dir")"

  echo "$LOG_PREFIX === $id (provider=$provider) ==="

  local started
  started="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  local exit_code=0
  local ingest_rc=0
  local qmd_lines=()

  if [[ -n "$env_file" && -f "$env_file" ]]; then
    # shellcheck disable=SC1090
    set -a
    # shellcheck disable=SC1090
    source "$env_file"
    set +a
  elif [[ -n "$env_file" ]]; then
    echo "$LOG_PREFIX WARN: envFile missing: $env_file" >&2
  fi

  if [[ "$SKIP_INGEST" -eq 0 ]]; then
    if [[ -z "$ingest" ]]; then
      echo "$LOG_PREFIX ERROR: $id has no ingestCommand" >&2
      exit_code=1
    elif [[ ! -x "$ingest" && ! -f "$ingest" ]]; then
      echo "$LOG_PREFIX ERROR: ingestCommand not found: $ingest" >&2
      exit_code=1
    else
      if [[ -n "$output_dir" ]]; then
        mkdir -p "$output_dir"
      fi
      echo "$LOG_PREFIX ingest: $ingest"
      set +e
      if [[ -n "$output_dir" ]] && grep -q -- '--output-dir' "$ingest" 2>/dev/null; then
        bash "$ingest" --output-dir "$output_dir"
      else
        bash "$ingest"
      fi
      ingest_rc=$?
      set -e
      if [[ $ingest_rc -ne 0 ]]; then
        echo "$LOG_PREFIX ERROR: ingest failed for $id (exit $ingest_rc)" >&2
        exit_code=$ingest_rc
      fi
    fi
  else
    echo "$LOG_PREFIX skip ingest"
  fi

  if [[ $exit_code -eq 0 ]]; then
    if [[ ${#COLLECTIONS[@]} -eq 0 ]]; then
      echo "$LOG_PREFIX WARN: $id has no qmdCollections" >&2
    fi
    for col in "${COLLECTIONS[@]+"${COLLECTIONS[@]}"}"; do
      [[ -z "$col" ]] && continue
      if ! ensure_collection "$col" "$output_dir"; then
        exit_code=1
        break
      fi
      echo "$LOG_PREFIX qmd update: $col"
      set +e
      update_out="$("$QMD_UPDATE" "$col" 2>&1)"
      update_rc=$?
      set -e
      echo "$update_out"
      qmd_lines+=("$col:$update_out")
      if [[ $update_rc -ne 0 ]]; then
        exit_code=$update_rc
        break
      fi
      if [[ "$SKIP_EMBED" -eq 0 && "$embed_default" == "1" ]]; then
        echo "$LOG_PREFIX qmd embed: $col"
        set +e
        QMD_FORCE_CPU="${QMD_FORCE_CPU:-1}" qmd embed -c "$col"
        embed_rc=$?
        set -e
        if [[ $embed_rc -ne 0 ]]; then
          echo "$LOG_PREFIX WARN: embed failed for $col (exit $embed_rc)" >&2
        fi
      fi
    done
  fi

  local detail
  local cols_joined qmd_joined
  cols_joined="${COLLECTIONS[*]}"
  qmd_joined="${qmd_lines[*]}"
  detail="$(python3 - "$id" "$provider" "$started" "$ingest_rc" "$output_dir" "$cols_joined" "$qmd_joined" <<'PY'
import json, sys, os
from pathlib import Path
sid, provider, started, ingest_rc, output_dir, cols, qmd = sys.argv[1:8]
doc_count = 0
if output_dir and Path(output_dir).is_dir():
    doc_count = sum(1 for p in Path(output_dir).glob("*.md"))
print(json.dumps({
    "provider": provider,
    "startedAt": started,
    "ingestExitCode": int(ingest_rc),
    "outputDir": output_dir or None,
    "documentCount": doc_count,
    "qmdCollections": [c for c in cols.split() if c],
    "qmdUpdate": qmd,
}))
PY
)"

  write_status "$id" "$exit_code" "$detail"
  return "$exit_code"
}

FAILURES=0
while IFS= read -r src; do
  [[ -z "$src" ]] && continue
  if ! run_source "$src"; then
    FAILURES=$((FAILURES + 1))
  fi
done < <(python3 -c 'import json,sys; [print(json.dumps(s)) for s in json.loads(sys.argv[1])["sources"]]' "$SOURCES_JSON")

if [[ "$FAILURES" -gt 0 ]]; then
  echo "$LOG_PREFIX finished with $FAILURES failure(s)" >&2
  exit 1
fi

echo "$LOG_PREFIX done ($SOURCE_COUNT source(s))"
