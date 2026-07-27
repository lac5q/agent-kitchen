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
# oracle-1 runs the operator as a Docker Compose stack whose `memroos` service
# declares `env_file: .env` (relative to the repo). /etc/memroos/web.env belongs
# to the legacy memroos-web.service, which is present but inactive+disabled —
# writing there installs the key somewhere the container never reads.
# Verified against the live host 2026-07-27.
ENV_FILE="${MEMROOS_ENV_FILE:-/home/opc/memroos/.env}"
MEMROOS_DIR="${MEMROOS_DIR:-/home/opc/memroos}"

command -v op >/dev/null || { echo "1Password CLI (op) not found" >&2; exit 1; }

key="$(op read "$OP_ITEM")"
if [ -z "$key" ]; then
  echo "Empty secret from 1Password ($OP_ITEM)" >&2
  exit 1
fi

# The privileged remote shell reads the secret from stdin and never writes it
# outside $ENV_FILE's own directory: the scratch file is created root-only
# (umask 077) next to the destination and removed by an EXIT trap, so an
# interrupted run cannot strand a plaintext key in a world-readable /tmp.
remote_script="
set -eu
umask 077
env_file='$ENV_FILE'
tmp=\"\$env_file.new\"
trap 'rm -f \"\$tmp\"' EXIT
secret_line=\$(cat)
touch \"\$env_file\"
grep -v '^NANGO_SECRET_KEY=' \"\$env_file\" > \"\$tmp\" || true
printf '%s\n' \"\$secret_line\" >> \"\$tmp\"
chmod 600 \"\$tmp\"
chown --reference=\"\$env_file\" \"\$tmp\" 2>/dev/null || true
mv \"\$tmp\" \"\$env_file\"
"

# The script travels base64-encoded and is passed as a positional argument, so
# stdin stays free for the secret and no quoting/newline handling depends on the
# remote shell being bash (oracle-1's /bin/sh is POSIX).
script_b64="$(printf '%s' "$remote_script" | base64 | tr -d '\n')"

printf 'NANGO_SECRET_KEY=%s\n' "$key" |
  ssh "$ORACLE_HOST" "sudo sh -c 'eval \"\$(printf %s \"\$1\" | base64 -d)\"' _ '$script_b64'"
unset key

# Restart through the wrapper, never a bare `docker compose up`: this host
# needs docker-compose.override.yml layered or it silently reverts to the local
# Neo4j container and an unconfigured Qdrant (CFGDUR-02).
ssh "$ORACLE_HOST" "cd '$MEMROOS_DIR' && ./scripts/memroos-restart.sh >/dev/null"

echo "NANGO_SECRET_KEY installed on $ORACLE_HOST and the operator restarted."
echo "Verifying operator health..."
sleep 25   # the container needs longer than a systemd unit to become healthy
# -f so an HTTP 5xx from the operator counts as a failed health check.
curl -fsS 'https://memroos.epiloguecapital.com/api/health' >/dev/null \
  && echo "Operator is responding." \
  || echo "Health endpoint unhealthy or unreachable — check: ssh $ORACLE_HOST 'sudo systemctl status memroos-web --no-pager'"

echo
echo "Next: in the Nango dashboard, ensure provider configs exist for the"
echo "providerConfigKey slugs used by apps/memroos/src/lib/tool-auth/providers.ts"
echo "(notion, linear, circleback-mcp, slack, github, google-calendar,"
echo "google-drive, hubspot, salesforce, xero) — one Nango environment for dev,"
echo "one for prod. Then test a connect from Governance -> Integrations."
