#!/usr/bin/env bash
# memroos-bootstrap-agent.sh
# Bootstrap a MemRoOS agent host so future Cursor agent shells load
# ~/.memroos/agent-env automatically. Idempotent.
#
# What it does on each host:
#   1. Installs ~/.local/bin/memroos-set-secret (silent prompt → chmod 600 env file)
#   2. Appends a source-line for ~/.memroos/agent-env to ~/.bashrc (idempotent)
#   3. Pushes secrets via op://... (Minimax) and a silent local prompt (OP_SA)
#   4. Verifies lengths only, never values
#   5. Smoke tests op + minimax API
#
# Usage:
#   bin/memroos-bootstrap-agent.sh maeve-u1
#   bin/memroos-bootstrap-agent.sh oracle-1
#   bin/memroos-bootstrap-agent.sh          # defaults: maeve-u1 oracle-1
#
# Env overrides:
#   VAULT=Clawdbot                  # 1Password vault
#   MINIMAX_ITEM=vksc4rfngcnjeuhw7byf4lwwp4   # "Minimax Coding Plan API Key"
#   SKIP_OP=0 / SKIP_MINIMAX=0 / SKIP_VERIFY=0
#
# Safe: never prints secret values; only lengths and op whoami metadata.

set -euo pipefail

VAULT="${VAULT:-Clawdbot}"
MINIMAX_ITEM="${MINIMAX_ITEM:-vksc4rfngcnjeuhw7byf4lwwp4}"  # Minimax Coding Plan API Key
SKIP_OP="${SKIP_OP:-0}"
SKIP_MINIMAX="${SKIP_MINIMAX:-0}"
SKIP_VERIFY="${SKIP_VERIFY:-0}"

HOSTS=("$@")
if [[ ${#HOSTS[@]} -eq 0 ]]; then
  HOSTS=(maeve-u1 oracle-1)
fi

# --- Helpers (local) --------------------------------------------------------

bold() { printf '\n\033[1m== %s ==\033[0m\n' "$*"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
err()  { printf '  \033[31m✗\033[0m %s\n' "$*" >&2; }

sshq() {
  # Quiet ssh with sane defaults
  ssh -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new -o LogLevel=ERROR "$@"
}

remote_install_helper() {
  local host="$1"
  # Base64-encode the helper locally so we don't fight nested-shell/heredoc quoting.
  local helper_b64
  helper_b64=$(base64 <<'HELPER_EOF'
#!/usr/bin/env bash
set -euo pipefail
usage() {
  cat >&2 <<USAGE
Usage: memroos-set-secret VAR_NAME
Prompts for a secret without echoing it and stores it in ~/.memroos/agent-env
with owner-only permissions.
USAGE
}
name="${1:-}"
if [[ -z "$name" || "$name" == "--help" || "$name" == "-h" ]]; then usage; exit 2; fi
if [[ ! "$name" =~ ^[A-Z_][A-Z0-9_]*$ ]]; then echo "Invalid env var name: $name" >&2; exit 2; fi
env_dir="$HOME/.memroos"; env_file="$env_dir/agent-env"
mkdir -p "$env_dir"; chmod 700 "$env_dir"
touch "$env_file"; chmod 600 "$env_file"
# Allow empty stdin pipe (read returns non-zero on EOF without newline)
read -rsp "$name: " value || true; echo
tmp="$(mktemp)"; trap "rm -f \"$tmp\"" EXIT
# Drop any existing lines for this var (both "export FOO=" and "FOO=" forms)
if [[ -s "$env_file" ]]; then
  grep -v -E "^[[:space:]]*(export[[:space:]]+)?$(printf "%s" "$name" | sed "s/[][\.*^$/]/\\&/g")=" "$env_file" > "$tmp" || true
fi
escaped="$(printf "%q" "$value")"
printf "export %s=%s\n" "$name" "$escaped" >> "$tmp"
mv "$tmp" "$env_file"; chmod 600 "$env_file"; trap - EXIT
unset value escaped
echo "Saved $name to $env_file"
HELPER_EOF
)
  sshq "$host" "mkdir -p \"\$HOME/.local/bin\" && echo '$helper_b64' | base64 -d > \"\$HOME/.local/bin/memroos-set-secret\" && chmod 700 \"\$HOME/.local/bin/memroos-set-secret\" && echo helper-installed"
}

remote_wire_bashrc() {
  local host="$1"
  # Always reduce the bashrc to a single canonical MemRoos agent-env source line.
  # Uses base64-shipped awk to remove ANY block (single-line or multi-line if/then/fi)
  # that touches agent-env, so we can replace legacy installers cleanly.
  local awk_b64
  awk_b64=$(base64 <<'AWK_EOF'
BEGIN { skip=0 }
# Skip the line that mentions agent-env and any following lines that are
# part of the same conditional block (until we hit a matching fi).
{
  if (skip==1) {
    # Looking for the closing "fi" of an if-block.
    if ($0 ~ /^[[:space:]]*fi[[:space:]]*(#|$)/) { skip=0; next }
    next
  }
  if ($0 ~ /agent-env/) {
    # Did this line OPEN a conditional (ends with `then` or `; then`)?
    # If so, skip until matching fi. Otherwise just drop this one line.
    if ($0 ~ /;[[:space:]]*then[[:space:]]*(#|$)/) { skip=1 }
    next
  }
  print
}
AWK_EOF
)
  sshq "$host" "set -euo pipefail
    bashrc=\"\$HOME/.bashrc\"
    touch \"\$bashrc\"
    tmp=\"\$(mktemp)\"
    echo '$awk_b64' | base64 -d | awk -f - \"\$bashrc\" > \"\$tmp\"
    {
      cat \"\$tmp\"
      printf '\n# MemRoOS agent secrets (owner-only, 600)\n'
      printf '[ -f \"\$HOME/.memroos/agent-env\" ] && source \"\$HOME/.memroos/agent-env\"\n'
    } > \"\$bashrc.new\"
    rm -f \"\$tmp\"
    mv \"\$bashrc.new\" \"\$bashrc\"
    echo bashrc-canonicalised
    bash -n \"\$bashrc\" && echo bashrc-syntax-ok"
}

push_minimax() {
  local host="$1"
  if [[ "$SKIP_MINIMAX" == "1" ]]; then warn "SKIP_MINIMAX=1, skipping"; return 0; fi
  if ! command -v op >/dev/null 2>&1; then
    err "local 'op' not on PATH; cannot fetch minimax key"; return 1
  fi
  # op read returns the credential to stdout. Pipe straight into SSH.
  op read "op://$VAULT/$MINIMAX_ITEM/credential" \
    | { cat; printf '\n'; } \
    | sshq "$host" '$HOME/.local/bin/memroos-set-secret MINIMAX_API_KEY >/dev/null && echo pushed:MINIMAX_API_KEY' \
    || warn "minimax push exited non-zero on $host"
  ok "pushed MINIMAX_API_KEY"
}

push_op_sa() {
  local host="$1"
  if [[ "$SKIP_OP" == "1" ]]; then warn "SKIP_OP=1, skipping"; return 0; fi
  local t
  read -rsp "OP_SERVICE_ACCOUNT_TOKEN for $host (silent): " t; echo
  if [[ -z "$t" ]]; then
    err "OP_SERVICE_ACCOUNT_TOKEN for $host is empty -- aborting push (was read -rsp run non-interactively?)"
    unset t
    return 1
  fi
  printf '%s\n' "$t" | sshq "$host" '$HOME/.local/bin/memroos-set-secret OP_SERVICE_ACCOUNT_TOKEN >/dev/null && echo pushed:OP_SERVICE_ACCOUNT_TOKEN' \
    || { warn "op SA push exited non-zero on $host"; unset t; return 1; }
  unset t
  ok "pushed OP_SERVICE_ACCOUNT_TOKEN"
}

remote_verify() {
  local host="$1"
  if [[ "$SKIP_VERIFY" == "1" ]]; then warn "SKIP_VERIFY=1, skipping"; return 0; fi
  # CRITICAL: never expand $VAR locally; the script body runs entirely on the remote side
  # with vars sourced from agent-env. Stdout must contain names + lengths + http codes only.
  sshq "$host" 'set +e
    [ -f "$HOME/.memroos/agent-env" ] && . "$HOME/.memroos/agent-env"
    echo "--- env load ---"
    for v in OP_SERVICE_ACCOUNT_TOKEN MINIMAX_API_KEY; do
      eval "n=\${#${v}}"
      if [ -n "$n" ] && [ "$n" -gt 0 ]; then
        echo "$v: SET (len=$n)"
      else
        echo "$v: MISSING"
      fi
      unset n
    done
    echo "--- agent-env perms ---"
    ls -la ~/.memroos/agent-env 2>/dev/null || echo no-agent-env
    echo "--- op whoami ---"
    if command -v op >/dev/null; then op whoami 2>&1 | head -5 || echo op-failed; else echo op-not-installed; fi
    echo "--- minimax smoke ---"
    if [ -n "$MINIMAX_API_KEY" ]; then
      curl -sS -o /dev/null -w "minimax: HTTP %{http_code}\n" \
        -H "Authorization: Bearer $MINIMAX_API_KEY" \
        "https://api.minimaxi.chat/v1/models" 2>&1 || echo minimax: curl-failed
    else
      echo minimax: no-key
    fi
  '
}

# --- Main --------------------------------------------------------------------

for host in "${HOSTS[@]}"; do
  bold "host: $host"
  echo "  remote_install_helper"
  if remote_install_helper "$host" | grep -q helper-installed; then
    ok "helper installed"
  else
    err "helper install failed on $host"
    continue
  fi
  echo "  remote_wire_bashrc"
  if remote_wire_bashrc "$host" | grep -qE 'bashrc-canonicalised|bashrc-already-wired|bashrc-patched'; then
    ok "bashrc wired"
  else
    err "bashrc wire failed on $host"
    continue
  fi
  echo "  push_minimax"
  push_minimax "$host" || warn "minimax push had issues on $host"
  echo "  push_op_sa"
  push_op_sa "$host" || warn "op SA push had issues on $host"
  echo "  remote_verify"
  remote_verify "$host"
done

bold "done"
echo "Re-open any Cursor agent session on those hosts (or run: source ~/.memroos/agent-env)"
