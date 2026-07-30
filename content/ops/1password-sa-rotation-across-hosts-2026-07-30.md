---
name: 1password-sa-rotation-across-hosts-2026-07-30
model: MiniMax-M3
sources:
  - ~/.op/service_account_token (A7RNGIAJ3ZECVGGGDTV7SXGMEM, e4co45kfx64ty predecessor rotated)
  - ~/.agents/skills/1password/references/creating-service-account.md
  - ~/.hermes/profiles/alba/skills/agent-operations/agent-operations/references/1password-service-account-rotation.md
derived_from: direct setup work for Luis on 2026-07-30
regen_prompt: Recreate the 1Password service account config across main-mac, maeve-u1, and oracle-1 after a token rotation. Steps: copy SA token from main-mac to each host at ~/.op/service_account_token (mode 0600), append auto-export block to ~/.bashrc and ~/.bash_profile, create cache at ~/.cache/shell/zsh_secrets, append OP_SERVICE_ACCOUNT_TOKEN to each Hermes profile .env (~/.hermes/profiles/{name}/.env), and replace any __ROTATE_1PASSWORD_SERVICE_ACCOUNT__ placeholder in ~/.openclaw/.env.1password. Verify each host via 'bash -lc' then 'op whoami' + 'op vault list' to confirm both AgentWritable and Clawdbot appear.
---

# 1Password Service Account Rotation Across Three Hosts (2026-07-30)

## Active integration

- **Integration ID**: `A7RNGIAJ3ZECVGGGDTV7SXGMEM`
- **Vaults accessible**: `AgentWritable` (writeable for agents) + `Clawdbot` (legacy read-only)
- **User Type**: `SERVICE_ACCOUNT`
- **Sign-in address**: `https://my.1password.com`

## What was wrong (in plain terms)

Luis got "1Password access" errors when 1Password CLI authentication failed in
agent contexts. Three failure points were found:

1. **oracle-1 had a *deleted* service account** at `~/.op/service_account_token`
   returning `403 Forbidden (Service Account Deleted)` from `op whoami`.
2. **Hermes profiles (`alba`, `contentpublisher`, `maria`) were missing
   `OP_SERVICE_ACCOUNT_TOKEN`** in their `.env` files — only `OP_VAULT` was set.
3. **`~/.openclaw/.env.1password` had a placeholder**
   `__ROTATE_1PASSWORD_SERVICE_ACCOUNT__` that nobody replaced after a prior
   rotation. Backup at `~/.openclaw/.env.1password.bak`.

## What was done

### Per-host

| Host | Token file | Mode | Auto-export | Cache | Result |
|---|---|---|---|---|---|
| `main-mac` (lcalderon) | `~/.op/service_account_token` | 0600 | `~/.zshenv` (already) | `~/.cache/shell/zsh_secrets` | working |
| `maeve-u1` (lac5q, WSL2) | `~/.op/service_account_token` | 0600 | appended to `~/.bashrc` | generated `~/.cache/shell/zsh_secrets` | working |
| `oracle-1` (opc, Oracle ARM) | `~/.op/service_account_token` (old DELETED token backed up to `~/.op/service_account_token.deleted-20260730-195349.bak`) | 0600 | appended to `~/.bashrc` AND `~/.bash_profile` (replacing a malformed literal line 28) | generated `~/.cache/shell/zsh_secrets` | working |

### Local Hermes profile .env files

Appended `OP_SERVICE_ACCOUNT_TOKEN` (852 bytes, mode 0600 .env files) to:

- `~/.hermes/profiles/alba/.env`
- `~/.hermes/profiles/contentpublisher/.env`
- `~/.hermes/profiles/maria/.env`

### OpenClaw .env replacement

`~/.openclaw/.env.1password`: placeholder replaced with live token (backup at
`.env.1password.bak`). This file said `vault access: Clawdbot only` but the
working SA actually has both Clawdbot AND AgentWritable access — the comment
in the env file is stale and can be updated.

## Auto-export block (canonical)

Appended to `~/.bashrc` (and `~/.bash_profile` on oracle-1):

```sh
# 1Password service account token (auto-export for services and shells)
# Source of truth: ~/.op/service_account_token (mode 0600)
# Cache: ~/.cache/shell/zsh_secrets (regenerated)
if [[ -z ${OP_SERVICE_ACCOUNT_TOKEN:-} ]]; then
  if [[ -r "$HOME/.op/service_account_token" ]]; then
    export OP_SERVICE_ACCOUNT_TOKEN="$(tr -d '\r\n' < "$HOME/.op/service_account_token")"
  fi
  if [[ -r "$HOME/.cache/shell/zsh_secrets" ]]; then
    # shellcheck source=/dev/null
    source "$HOME/.cache/shell/zsh_secrets"
  fi
fi
```

## Verification across all three hosts

```sh
bash -lc "op whoami; op vault list"
```

Expected output on each host:

```
URL:               https://my.1password.com
Integration ID:    A7RNGIAJ3ZECVGGGDTV7SXGMEM
User Type:         SERVICE_ACCOUNT
ID                            NAME
w5ifeubgyjyjldpsxdwgltb55m    AgentWritable
67zvfafjjdz2ukpicmlrte3hwa    Clawdbot
```

## Pitfalls / Things to remember

- `--reveal` does NOT bypass SA CONCEALED field masking. Use **Text** field type
  when creating new items; change existing CONCEALED API keys to Text if
  `op read` returns `...`.
- 1Password MCP server (npm `@1password/mcp-server`) does NOT exist on the public
  registry. The "1Password MCP" pattern in this stack is the `op` CLI + SA token
  injected as `OP_SERVICE_ACCOUNT_TOKEN` env var. Future wrapping should use
  `@1password/connect` (which is published).
- Running services (Hermes gateway pid 7643 on main-mac, pid 580907 on
  maeve-u1) do NOT inherit newly-added env vars until they are restarted. A
  service-restart policy should run after each token rotation.
- The `~/.openclaw/.env.1password` rotation directive says "vault access:
  Clawdbot only" — stale comment; the actual SA has AgentWritable + Clawdbot
  access.
- oracle-1 had a previously broken `~/.bashrc` line 28 that contained a literal
  malformed export. It was neutralized (replaced with comment) and the canonical
  block appended cleanly.

## Open decisions (require Luis)

1. **Per-agent SA scoping**: The user wants agents to "have access to specific
   service accounts without constant approval". Currently every agent shares
   one SA with access to both `AgentWritable` (223 items, broad set) and
   `Clawdbot` (legacy). If the user wants narrower scopes per agent
   (e.g., one SA per Hermes profile), 1Password.com → Integrations → Service
   Accounts → new SA + vault scope set per-agent is the right pattern.
2. **Revoking the dead integration**: the old `e4co45kfx64ty` SA on oracle-1
   was already deleted server-side. The local file backup at
   `~/.op/service_account_token.deleted-20260730-195349.bak` is harmless but
   should be retired once Luis confirms it's not needed for audit.
3. **MCP wrapper**: if user wants 1Password exposed as an MCP tool to specific
   agents (rather than `bash` calling `op read`), the path is to wrap
   `@1password/connect` in a thin MCP server. Out of scope for this task but
   flagged for future plan.
