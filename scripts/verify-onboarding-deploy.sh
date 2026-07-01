#!/usr/bin/env bash
# Verify operator production serves onboarding routes through token auth, not JWT proxy.
set -euo pipefail

BASE="${MEMROOS_PUBLIC_URL:-https://memroos.epiloguecapital.com}"
SCRIPT_URL="${BASE}/api/onboarding/script?token=bad"

code="$(curl -fsS -o /tmp/memroos-onboarding-verify.txt -w "%{http_code}" "$SCRIPT_URL" || true)"
body="$(tr '\n' ' ' < /tmp/memroos-onboarding-verify.txt | head -c 200)"

if [[ "$code" == "403" ]]; then
  echo "OK: onboarding script reachable (HTTP 403 for bad token): ${body}"
  exit 0
fi

if [[ "$code" == "401" ]]; then
  echo "FAIL: proxy still requires JWT (HTTP 401). Deploy or DNS may be stale." >&2
  echo "body: ${body}" >&2
  exit 1
fi

echo "FAIL: unexpected HTTP ${code} from ${SCRIPT_URL}" >&2
echo "body: ${body}" >&2
exit 1
