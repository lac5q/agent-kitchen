# memroos-bootstrap-agent.sh

Idempotent bootstrap that prepares a MemRoOS agent host so any future
Cursor agent shell (interactive login or `bash -lc`) automatically
loads `~/.memroos/agent-env` as a sourceable file of `export FOO=bar`
lines, with each secret stored at `chmod 600`.

## What it does per host

1. **Installs** `~/.local/bin/memroos-set-secret` — silent-prompt helper
   that writes/overwrites a single `export VAR=value` line into
   `~/.memroos/agent-env` (drops any prior line for that var).
2. **Wires** `~/.bashrc` to source `~/.memroos/agent-env` early
   (canonicalises to a single line; strips legacy installer blocks).
3. **Wires login-shell files** (`~/.bash_profile`, `~/.bash_login`,
   `~/.profile`) — whichever exists — so `bash -lc "cmd"` and SSH
   command shells also see the secrets. Login shells do not source
   `~/.bashrc` by default, so this is required for tools that invoke
   `bash -lc` (including this script's own verify step).
4. **Pushes** `MINIMAX_API_KEY` from local `op` (vault `Clawdbot`,
   item `Minimax Coding Plan API Key`) without ever printing it.
5. **Pushes** `OP_SERVICE_ACCOUNT_TOKEN` via a local silent prompt
   (`read -rsp`), since a service account cannot self-fetch its own
   token from a 1Password vault. Aborts loudly if the prompt returns
   empty (e.g. when invoked from a non-interactive shell).
6. **Verifies** lengths only, perms are `600`, runs `op whoami`, and
   smoke-tests `https://api.minimaxi.chat/v1/models` with the key.

## Usage

```bash
# Default: both hosts
bin/memroos-bootstrap-agent.sh

# Specific host
bin/memroos-bootstrap-agent.sh maeve-u1
bin/memroos-bootstrap-agent.sh oracle-1

# Skip steps (useful for re-runs / partial bootstraps)
SKIP_OP=1          bin/memroos-bootstrap-agent.sh maeve-u1   # no SA prompt
SKIP_MINIMAX=1     bin/memroos-bootstrap-agent.sh oracle-1   # no op push
SKIP_VERIFY=1      bin/memroos-bootstrap-agent.sh maeve-u1   # install/wire only
```

## Env overrides

| Var               | Default                            | Notes                                |
| ----------------- | ---------------------------------- | ------------------------------------ |
| `VAULT`           | `Clawdbot`                         | 1Password vault containing secrets   |
| `MINIMAX_ITEM`    | `vksc4rfngcnjeuhw7byf4lwwp4`       | Minimax Coding Plan API Key item ID  |
| `SKIP_OP`         | `0`                                | Skip `OP_SERVICE_ACCOUNT_TOKEN`      |
| `SKIP_MINIMAX`    | `0`                                | Skip Minimax key fetch + push        |
| `SKIP_VERIFY`     | `0`                                | Skip the per-host verify step        |

## Safety

- Secret values are never echoed, never written to disk outside the
  agent's `~/.memroos/agent-env` file (chmod 600, owner-only dir 700).
- `memroos-set-secret` drops any prior line for the same var before
  appending the new one (idempotent re-runs are safe).
- Bash history is untouched (no `export` of literal values).
- Push uses `op read` (single-use stdout, not a file) piped straight
  into SSH so the key never lands on this machine's filesystem.
- Local terminal uses `read -rsp` for the OP SA token (silent) and
  `unset`s it immediately after.
- `push_op_sa` aborts loudly if `read -rsp` returns empty (e.g. when
  invoked from a non-interactive shell); it never silently writes
  `export FOO=''`.
- `remote_wire_bashrc` rewrites `~/.bashrc` to a single canonical
  source line, removing ALL prior installer variants (including
  multi-line `if/fi` blocks) so the bashrc stays clean on re-runs.
- `remote_verify` computes variable lengths via `eval "n=\${#${v}}"`
  and only echoes the name + length, never the value.

## After bootstrap

In any new shell on the host:

```bash
source ~/.memroos/agent-env
# or just open a fresh login shell — ~/.bashrc handles it
```

## Files created on each host

```
~/.local/bin/memroos-set-secret              700, root-only
~/.memroos/                                   700, owner-only
~/.memroos/agent-env                          600, owner-only
~/.bashrc                                     +1 canonical source line
~/.bash_profile / ~/.bash_login / ~/.profile  +1 canonical source line
                                              (whichever exists, idempotent)
```
