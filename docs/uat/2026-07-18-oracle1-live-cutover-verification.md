# oracle-1 Live Cutover Verification

- **Document version:** 2026-07-18.1
- **Creation date/time (UTC):** 2026-07-18T09:06:00Z
- **Update date/time (UTC):** 2026-07-18T09:06:00Z
- **Sources:** Tailscale API + userspace client, Cloudflare API, Heroku API, public operator URL `https://memroos.epiloguecapital.com`, MemRoOS admin session inventory, kickoff ` .planning/milestones/v8.15-always-on-cloud-operator-KICKOFF.md`

## Summary

v8.15 Phases 163–165 operator cutover is **live in production**. This pass joined the Luis tailnet from Cursor Cloud (userspace Tailscale), confirmed `oracle-1` reachability, and re-verified public tunnel / Heroku decommission / inventory. **Interactive SSH shell as `opc` is still blocked** until the Cursor Cloud SSH public key is installed on the host (or Tailscale SSH is enabled on oracle-1).

## Network identity

| Field | Value |
|-------|-------|
| MagicDNS | `oracle-1.tail255306.ts.net` |
| Tailscale IPv4 | `100.90.196.33` |
| Reported hostname | `paperclip-arm-2026` |
| Peer online | yes (DERP sfo) |
| Cloud agent Tailscale IP | `100.76.231.99` (`cursor-cloud-memroos`, ephemeral) |

## Verification matrix

| Check | Result | Evidence |
|-------|--------|----------|
| Tailscale ping oracle-1 | PASS | `pong` via DERP(sfo) ~45ms |
| TCP 22 via `tailscale nc` | PASS | SSH banner / publickey auth offered |
| SSH login `opc@oracle-1` | BLOCKED | `Permission denied (publickey)` — no host private key in agent; Tailscale SSH host keys not advertised |
| Public onboarding bad token | PASS | HTTP **403** `Invalid onboarding token` (`scripts/verify-onboarding-deploy.sh`) |
| Public `/api/health` | PASS | mem0 **up**, Graph Memory **up**, Agents/APO **up**; RTK down / QMD degraded (expected optional) |
| Admin memory inventory | PASS | messages **128,597**; vectors **632**; graph facts **34,507**; insights **2,053** |
| Cloudflare tunnel `memroos-oracle` | PASS | status **healthy**; ingress `memroos.epiloguecapital.com` → `:3000` |
| `ollama-mac` tunnel conflict | PASS | does **not** advertise `memroos.epiloguecapital.com` |
| Heroku `memroos-agent-onboarding` | PASS | `web` quantity **0**; custom domain list is only `*.herokuapp.com` (no `memroos.epiloguecapital.com`) |

## SSH unblock (one host command)

Public key (also in 1Password AgentWritable note `Cursor Cloud oracle-1 SSH pubkey 2026-07-18`):

```text
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIEIkdPLarR4WZK0dOPkOuZzKkymjLQMoo97nNseAx2tG cursor-cloud-memroos-2026-07-18
```

On oracle-1 as `opc`:

```bash
mkdir -p ~/.ssh && chmod 700 ~/.ssh
echo 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIEIkdPLarR4WZK0dOPkOuZzKkymjLQMoo97nNseAx2tG cursor-cloud-memroos-2026-07-18' >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
# optional: sudo tailscale set --ssh
```

Private key for agents: 1Password AgentWritable `oracle-1 cursor-cloud SSH private key 2026-07-18` (do not commit).

After install, deploy latest operator code:

```bash
ssh -o ProxyCommand='tailscale nc %h %p' opc@oracle-1
cd /home/opc/github/memroos
git fetch origin && git checkout cursor/gsd-roadmap-quality-gate-d11d   # or merge to main first
npm --prefix apps/memroos ci
npm --prefix apps/memroos run build
sudo systemctl restart memroos-mem0 memroos-web
sudo systemctl status memroos-web memroos-mem0 ollama cloudflared --no-pager
```

## CLOUDOPS mapping (2026-07-18)

| ID | Status | Notes |
|----|--------|-------|
| CLOUDOPS-01..05 | verified-by-prior-cutover + live inventory/health | On-host systemd/Ollama re-smoke still wants SSH |
| CLOUDOPS-06 | **verified** | CF tunnel healthy + public health/inventory |
| CLOUDOPS-07 | **verified** | Heroku `web=0`, custom domain absent |
| CLOUDOPS-08 | out of scope | Voyage / Phase 166 |

## Residual blocker

Cursor Cloud can join Tailscale and reach port 22, but **cannot complete an interactive SSH session** until Luis installs the pubkey above (or places the existing `opc` private key into AgentWritable and points agents at it).
