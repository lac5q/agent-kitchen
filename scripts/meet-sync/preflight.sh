#!/usr/bin/env bash
# Meet-sync pre-flight shell wrapper. Reads env from a provider envFile (if
# any), then invokes scripts/meet-sync/providers/preflight.py.
#
# Emits one of:
#   OK
#   BLOCKED:<status>:<repair-hint>
#
# Exit codes:
#   0 = healthy / proceeds
#   1 = blocked / skip ingest
#
# MEETREL-FOLLOWUP-05 invariant: when scopes are insufficient this returns
# non-zero and the caller MUST NOT proceed to ingest.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROVIDERS_DIR="$SCRIPT_DIR/providers"
PROVIDER="${1:-}"
ENV_FILE="${2:-}"

if [[ -z "$PROVIDER" ]]; then
  echo "BLOCKED:provider_absent:usage: preflight.sh <provider> [envFile]" >&2
  exit 1
fi

# Build a tmp env file: source envFile (if any) and persist ONLY the keys the
# preflight cares about. This avoids leaking secrets into argv or stdout.
TMP_ENV="$(mktemp -t meet-sync-preflight.XXXXXX)"
trap 'rm -f "$TMP_ENV"' EXIT
touch "$TMP_ENV"

if [[ -n "$ENV_FILE" && -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE" || true
  set +a
fi
{
  for key in \
    FATHOM_API_KEY \
    CIRCLEBACK_API_TOKEN \
    ZOOM_ACCOUNT_ID ZOOM_CLIENT_ID ZOOM_CLIENT_SECRET \
    GOOGLE_OAUTH_CLIENT_ID GOOGLE_OAUTH_CLIENT_SECRET GOOGLE_OAUTH_REFRESH_TOKEN
  do
    if [[ -n "${!key+x}" ]]; then
      printf '%s=%q\n' "$key" "${!key}" >> "$TMP_ENV"
    fi
  done
} >/dev/null

# Build the env-prefix array. When TMP_ENV is empty we don't pass --args.
ENV_ARGS=()
if [[ -s "$TMP_ENV" ]]; then
  while IFS= read -r line; do
    ENV_ARGS+=("$line")
  done < "$TMP_ENV"
fi

set +e
if [[ ${#ENV_ARGS[@]} -gt 0 ]]; then
  OUT="$(env -i PATH="$PATH" PYTHONPATH="$PROVIDERS_DIR" "${ENV_ARGS[@]}" \
    python3 - "$PROVIDER" <<'PY'
import os, sys
from preflight import preflight as _pf  # type: ignore
result = _pf(sys.argv[1])
if result.get("ok"):
    print("OK")
else:
    print("BLOCKED:" + str(result.get("status") or "provider_auth_blocked") + ":" + str(result.get("repairHint") or ""))
PY
  )"
else
  OUT="$(env -i PATH="$PATH" PYTHONPATH="$PROVIDERS_DIR" \
    python3 - "$PROVIDER" <<'PY'
import os, sys
from preflight import preflight as _pf  # type: ignore
result = _pf(sys.argv[1])
if result.get("ok"):
    print("OK")
else:
    print("BLOCKED:" + str(result.get("status") or "provider_auth_blocked") + ":" + str(result.get("repairHint") or ""))
PY
  )"
fi
RC=$?
set -e

# Surface the result so callers can log/trace it.
echo "$OUT"
if [[ "$RC" -ne 0 ]]; then
  echo "BLOCKED:provider_auth_blocked:preflight probe failed (rc=$RC)" >&2
  exit 1
fi
case "$OUT" in
  OK)
    exit 0
    ;;
  BLOCKED:*)
    exit 1
    ;;
  *)
    echo "BLOCKED:provider_auth_blocked:unexpected preflight output" >&2
    exit 1
    ;;
esac
