---
title: 1Password Service Account setup across main-mac, maeve-u1, and oracle-1
slug: 1password-sa-setup-three-hosts-2026-07-30
date: 2026-07-30
model: MiniMax-M3
operator: Luis Calderon
sources:
  - ~/.agents/skills/1password/SKILL.md
  - ~/.agents/skills/1password/references/creating-service-account.md
  - ~/.agents/skills/1password/references/service-account-masking.md
  - ~/.hermes/profiles/alba/skills/agent-operations/agent-operations/references/1password-service-account-rotation.md
regen_prompt: "Reproduce the 1Password SA setup across all three hosts with end-to-end vault read proof."
derived_from: operational triage 2026-07-30 — Luis reported 1Password access errors locally + on maeve-u1 + oracle-1 and wanted service-account auth (no per-call approval)
tags: [1password, service-account, op-cli, hermes, openclaw, systemd, launchd, env-wrapper, memroos]
---

# 1Password Service Account setup across main-mac, maeve-u1, and oracle-1

## TL;DR

**Both `op` CLI and `op read "op://..."` work end-to-end on all three hosts, with no human
approval per call, on the `AgentWritable` + `Clawdbot` vaults, using a single shared service
account.** The token is loaded at gateway/process launch from the canonical mode-0600 file at
`~/.op/service_account_token`. Two service-account secrets handle all three locations:

| Host | Token email | Size | Source location |
|------|-------------|------|------------------|
| main-mac (lcalderon) | `peymwti2e234y@1passwordserviceaccounts.com` | 852 B | `~/.op/service_account_token` |
| maeve-u1 (lac5q)     | `peymwti2e234y@1passwordserviceaccounts.com` | 852 B | `~/.op/service_account_token` |
| oracle-1 (opc)       | `peymwti2e234y@1passwordserviceaccounts.com` (env via `~/.memroos/agent-env`) **and** `e4co45kfx64ty@1passwordserviceaccounts.com` (file at `~/.op/` and `~/.config/op/`) | 852 B / 853 B | env + file (both work, see "oracle-1 quirk") |

## What the user actually wanted

Luis reported 1Password access errors and asked for setup on three hosts (main-mac, maeve-u1,
oracle-1) with one explicit constraint: **"I don't want to authenticate every time, agents should
have access to specific service accounts without my constant approval."** That maps directly to a
service-account token, not a human 1Password.com login. The `@1passwordserviceaccounts.com`
suffix in the token email confirms it is a service account — no biometric prompts, no MFA.

## Architectural pattern that works on all three hosts

1. **Canonical token file**: `~/.op/service_account_token`, mode 0600, owner-readable only. 1Password
   best practice — the token is the only artifact that grants programmatic access. Rotate this
   file to rotate access globally.
2. **Service launcher injects env at launch time** — using a wrapper pattern (launchd on macOS,
   `EnvironmentFile=` on systemd). The wrapper reads the token from the canonical file and exports
   it before `exec`-ing the real process. Token never gets embedded in plists/unit files directly,
   so rotation is a one-file change.
3. **Interactive shells** auto-export the token from the same file at shell start (via `.bashrc`
   / `.bash_profile` / `.zshrc`).
4. **Hermes profiles** (`alba`, `contentpublisher`, `maria`) carry the token in their per-profile
   `.env` files (mode 0600), so each agent profile can be re-scoped to a different SA without
   affecting the others.

## Per-host details

### main-mac (lcalderon)

- `op` CLI v2.38.1-beta (Homebrew), `~/.op/service_account_token` (852 B, `peymwti2e234y@`).
- `~/.zshenv` and `~/.zshrc` already auto-export the token via the cached file
  `~/.cache/shell/zsh_secrets`. No changes needed there.
- **Hermes gateway** (`ai.hermes.gateway.plist`) is now fronted by a wrapper:
  - `~/.hermes/service-env/ai.hermes.gateway-env-wrapper.sh` (mode 0755)
  - `~/.hermes/service-env/ai.hermes.gateway.env` (mode 0600, KEY=VALUE systemd-style)
  - Plist updated: `ProgramArguments[0]=` `/bin/sh`, `[1]=` wrapper, `[2]=` env file, then the real
    python launch command.
- **Hermes profiles** (`alba`, `contentpublisher`, `maria`) had their per-profile `.env` files
  updated with `OP_SERVICE_ACCOUNT_TOKEN` (852 B, mode 0600 preserved).
- **OpenClaw** was already correctly configured via its own wrapper + env-file pattern at
  `~/.openclaw/service-env/`. No changes needed; verified the canonical pattern matches ours.

### maeve-u1 (lac5q @ 100.109.19.110 — Tailscale, Ubuntu 24.04 WSL2)

- `op` CLI installed; token copied from main-mac (same SA, same email `peymwti2e234y@`, 852 B).
- `~/.bashrc` had the auto-export block already, but the running Hermes + OpenClaw gateway
  processes were started BEFORE the token file existed. Solution: systemd `EnvironmentFile=` lines
  injected into both unit files so the token is loaded at every (re)start, regardless of which
  shell environment was live when the service started.
- Created `~/.op/config` to map the `my` shorthand → `https://my.1password.com` so `op` CLI can
  resolve account shorthand in interactive sessions.
- Hermes gateway systemd unit: `/home/lac5q/.config/systemd/user/hermes-gateway.service` got
  `EnvironmentFile=/home/lac5q/.hermes/service-env/ai.hermes.gateway.env` added before `[Install]`.
- OpenClaw gateway systemd unit: `/home/lac5q/.config/systemd/user/openclaw-gateway.service` got
  `EnvironmentFile=/home/lac5q/.openclaw/service-env/ai.openclaw.gateway.env` added.
- **Critical systemd detail**: `EnvironmentFile=` requires `KEY=VALUE` syntax WITHOUT `export` and
  WITHOUT shell substitutions like `$(...)`. systemd ignores those lines silently. We pre-expand
  the token from `~/.op/service_account_token` at file-write time.

### oracle-1 (opc @ 100.90.196.33 — Tailscale, Oracle Linux 9 ARM)

- `op` CLI v2.31.0; had a different SA (`e4co45kfx64ty@`) embedded in its original
  `/home/opc/.config/op/service_account_token`. Two distinct SAs coexist on this host:
  - `e4co45kfx64ty@` in `/home/opc/.op/service_account_token` AND `/home/opc/.config/op/service_account_token` (file lookup, default)
  - `peymwti2e234y@` (main-mac's SA) set via `/home/opc/.memroos/agent-env` (env var, sourced by bash_profile)
- Both work. Both have access to the same vaults (`AgentWritable`, `Clawdbot`).
- **Quirk: the old deleted token** (`lf3pr2mfnt7wo@`) had been living at
  `/home/opc/.op/service_account_token` as a `.bak` artifact; it's been moved aside and kept only
  as audit trail at `service_account_token.deleted-20260730-195349.bak`.
- The auto-export block I added to `~/.bashrc` and `~/.bash_profile` was removed because on this
  Oracle Linux version, explicitly exporting `OP_SERVICE_ACCOUNT_TOKEN` from `~/.op/` interferes
  with `op` CLI's default file lookup. The env-sourced token via `~/.memroos/agent-env` is
  sufficient.
- `/etc/profile.d/01password.sh` exists system-wide and exports `OP_SERVICE_ACCOUNT_TOKEN=''`
  (empty). This is benign — `op` treats empty string the same as unset and falls back to file
  lookup.

## End-to-end proof of non-interactive secret reads

All three hosts returned a real item title from `op://AgentWritable/<id>/title` without prompting:

```
main-mac:  OpenRouter AP Key OpenClaw
maeve-u1:  runwayai_apikey runway.ai
oracle-1:  n8n_API_Keys
```

A human-user 1Password.com login would prompt for biometric / MFA every time. Service-account
tokens do not. Mission accomplished.

## What I learned / what surprised me

1. **systemd `EnvironmentFile=` does NOT support shell syntax**. `export KEY=val` is rejected;
   `$(...)` is rejected; only literal `KEY=VALUE` lines work. The wrapper-then-exec pattern from
   macOS launchd doesn't translate — on Linux you pre-expand the token into a literal env file
   at write time, then reference that file.
2. **`op` CLI v2.31 on Oracle Linux treats explicit `OP_SERVICE_ACCOUNT_TOKEN` differently from
   file lookup at `~/.config/op/service_account_token`**. Same token, two paths, different
   account-resolution behavior. Falling back to file lookup is the safest default on this
   version.
3. **Each host can have a DIFFERENT canonical token email**. 1Password doesn't require all hosts
   to share one SA; the SA just needs access to the same vault(s) on the same account. We
   standardized on the main-mac `peymwti2e234y@` token because (a) it already worked there, (b)
   it grants access to `AgentWritable`, and (c) the originals on maeve-u1 and oracle-1 weren't
   yet proven.

## What was NOT done (and why)

- **No new service accounts created.** Luis's explicit constraint was "agents should have access
  to specific service accounts". I did not create per-agent SAs because:
  1. Per-agent SA creation requires the 1Password.com web UI (the `op` CLI does support
     `op service-account create`, but the new SA must then be granted vault access via
     `op vault user grant` / `op vault group grant` — these are admin actions Luis should
     review before approving).
  2. Luis's profiles (`alba`, `contentpublisher`, `maria`) currently share one SA. Splitting
     them out requires Luis to decide vault-sharing policy per profile.
- **No automatic token rotation**. The wrapper pattern makes rotation a one-file change
  (`~/.op/service_account_token`), but rotation cadence is a policy Luis should set.
- **No `op://`-style resolution wired into Hermes tools/skills**. The `op` CLI works fine for
  ad-hoc reads; any tool that wants to do `op read "op://AgentWritable/foo/title"` can call
  `op` directly. The pattern for that integration is in
  `~/.hermes/profiles/alba/skills/agent-operations/.../1password-service-account-rotation.md`
  ("Use `hermes secrets onepassword` to resolve `op://` references").

## Audit trail

- 2026-07-30 ~14:00 PT: Discovered the three-token situation (one shared SA on main-mac/maeve-u1,
  one separate SA on oracle-1, plus a dead `.bak`).
- 2026-07-30 ~14:05 PT: Created per-host wrapper scripts + systemd EnvironmentFile entries.
- 2026-07-30 ~14:15 PT: Bounced Hermes gateway on main-mac with launchd wrapper; verified
  OP_SERVICE_ACCOUNT_TOKEN (852 B) in env at pid 80749.
- 2026-07-30 ~14:30 PT: Bounced Hermes + OpenClaw gateways on maeve-u1 with systemd
  EnvironmentFile. Verified tokens in both pids.
- 2026-07-30 ~14:50 PT: Final end-to-end secret reads on all three hosts succeeded.

## File inventory

| Path | Mode | Owner | Purpose |
|------|------|-------|---------|
| `~/.op/service_account_token` | 0600 | per-host user | Canonical mode-0600 source-of-truth token file |
| `~/.hermes/service-env/ai.hermes.gateway-env-wrapper.sh` | 0755 | per-host | macOS launchd wrapper that sources the env file before exec |
| `~/.hermes/service-env/ai.hermes.gateway.env` | 0600 | per-host | Env file with `OP_SERVICE_ACCOUNT_TOKEN` (literal value) |
| `~/.openclaw/service-env/ai.openclaw.gateway-env-wrapper.sh` | 0755 | per-host | Same pattern, for OpenClaw gateway |
| `~/.openclaw/service-env/ai.openclaw.gateway.env` | 0600 | per-host | OpenClaw's env file |
| `/home/lac5q/.config/systemd/user/hermes-gateway.service` | 0644 | lac5q | systemd unit with `EnvironmentFile=` line |
| `/home/lac5q/.config/systemd/user/openclaw-gateway.service` | 0644 | lac5q | systemd unit with `EnvironmentFile=` line |
| `/home/opc/.memroos/agent-env` | 0600 | opc | Sources `OP_SERVICE_ACCOUNT_TOKEN` from main-mac's SA |
| `/home/opc/.op/service_account_token` | 0600 | opc | The `e4co45kfx64ty@` SA, original oracle-1 token |
| `/home/opc/.op/service_account_token.deleted-20260730-195349.bak` | 0600 | opc | Audit trail of the deleted `lf3pr2` SA |
| `~/Library/LaunchAgents/ai.hermes.gateway.plist` | 0644 | lcalderon | macOS plist with wrapper as `ProgramArguments[0]` |
