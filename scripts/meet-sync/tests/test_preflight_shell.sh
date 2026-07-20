#!/usr/bin/env bash
# Integration shell tests for preflight.sh. Verifies the Cordant false-healthy
# defect is killed at the bash layer too.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_SCRIPTS="$(cd "$SCRIPT_DIR/.." && pwd)"
WRAPPER="$REPO_SCRIPTS/preflight.sh"

fail() { echo "FAIL: $1" >&2; exit 1; }
ok()   { echo "ok: $1"; }

# 1. Google with no env vars must be blocked.
set +e
OUTPUT=$(bash "$WRAPPER" google 2>/dev/null)
RC=$?
set -e
[[ "$RC" -ne 0 ]] || fail "google blocked expected rc!=0, got $RC"
[[ "$OUTPUT" == BLOCKED:*provider_auth_blocked* ]] || fail "google BLOCKED status missing: $OUTPUT"
ok "google missing-env returns blocked"

# 2. Fathom with no API key must be blocked with missingEnv reason.
set +e
OUTPUT=$(bash "$WRAPPER" fathom 2>/dev/null)
RC=$?
set -e
[[ "$RC" -ne 0 ]] || fail "fathom blocked expected rc!=0, got $RC"
[[ "$OUTPUT" == *"FATHOM_API_KEY"* ]] || fail "fathom missing-env reason absent: $OUTPUT"
ok "fathom missing-key returns blocked with reason"

# 3. Unknown provider is provider_absent (caller bug, not a healthy preflight).
set +e
OUTPUT=$(bash "$WRAPPER" fireflies 2>/dev/null)
RC=$?
set -e
[[ "$RC" -ne 0 ]] || fail "fireflies missing-provider expected rc!=0, got $RC"
[[ "$OUTPUT" == BLOCKED:*provider_absent* ]] || fail "fireflies BLOCKED status missing: $OUTPUT"
ok "unknown provider returns provider_absent"

# 4. Empty provider arg is rejected.
set +e
OUTPUT=$(bash "$WRAPPER" 2>/dev/null)
RC=$?
set -e
[[ "$RC" -ne 0 ]] || fail "empty provider expected rc!=0, got $RC"
ok "empty provider rejected"

echo "ALL PREFLIGHT SHELL TESTS PASSED"
