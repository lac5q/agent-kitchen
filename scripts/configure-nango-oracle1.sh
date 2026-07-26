#!/usr/bin/env bash
# Configure NANGO_SECRET_KEY on oracle-1 from 1Password, restart the operator,
# and verify. Run from a workstation that has:
#   - the 1Password CLI (`op`) signed in to the vault holding the Nango key
#   - SSH access to oracle-1 (Tailscale)
#
# Usage:
#   OP_ITEM='op://<vault>/<item>/<field>' ORACLE_HOST='opc@<oracle-1 host>' \
#     bash scripts/configure-nango-oracle1.sh
#
# The secret travels op -> stdin -> remote shell; it is never placed on a
# command line (visible in process lists) and never written anywhere except
# /etc/memroos/web.env (mode 600) on oracle-1.

set -euo pipefail

OP_ITEM="${OP_ITEM:?Set OP_ITEM to the 1Password secret reference, e.g. op://Infra/Nango/credential}"
ORACLE_HOST="${ORACLE_HOST:?Set ORACLE_HOST, e.g. opc@<oracle-1 tailscale hostname>}"
ENV_FILE="/etc/memroos/web.env"

command -v op >/dev/null || { echo "1Password CLI (op) not found" >&2; exit 1; }

key="$(op read "$OP_ITEM")"
if [ -z "$key" ]; then
  echo "Empty secret from 1Password ($OP_ITEM)" >&2
  exit 1
fi

printf 'NANGO_SECRET_KEY=%s\n' "$key" | ssh "$ORACLE_HOST" '
  set -euo pipefail
  tmp=$(mktemp)
  cat > "$tmp"
  sudo sh -c "
    touch '"$ENV_FILE"'
    grep -v \"^NANGO_SECRET_KEY=\" '"$ENV_FILE"' > '"$ENV_FILE"'.new || true
    cat \"$tmp\" >> '"$ENV_FILE"'.new
    mv '"$ENV_FILE"'.new '"$ENV_FILE"'
    chmod 600 '"$ENV_FILE"'
  "
  rm -f "$tmp"
  sudo systemctl restart memroos-web
'
unset key

echo "NANGO_SECRET_KEY installed on $ORACLE_HOST and memroos-web restarted."
echo "Verifying operator health..."
sleep 5
curl -sS 'https://memroos.epiloguecapital.com/api/health' >/dev/null \
  && echo "Operator is responding." \
  || echo "Health endpoint not responding yet — check: ssh $ORACLE_HOST 'sudo systemctl status memroos-web --no-pager'"

echo
echo "Next: in the Nango dashboard, ensure provider configs exist for the"
echo "providerConfigKey slugs used by apps/memroos/src/lib/tool-auth/providers.ts"
echo "(notion, linear, circleback-mcp, slack, github, google-calendar,"
echo "google-drive, hubspot, salesforce, xero) — one Nango environment for dev,"
echo "one for prod. Then test a connect from Governance -> Integrations."
