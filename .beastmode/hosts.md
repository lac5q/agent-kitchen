# Memroos hosts + their Nango integrations

Authoritative mapping for the multi-host setup. Both hosts run
the same memroos code (main branch) but are separate Nango integrations
on purpose — dev on oracle-1, prod on cordant-hermes-01 — so a
config mistake on one doesn't leak into the other.

| Host                  | Tailscale SSH                 | Public? | Nango workspace  | Nango secret env var          | memroos role                |
|-----------------------|-------------------------------|---------|------------------|--------------------------------|-----------------------------|
| `oracle-1`            | `ssh opc@oracle-1`            | yes     | **dev**          | `NANGO_SECRET_KEY`             | always-on cloud operator     |
| `cordant-hermes-01`   | `ssh ubuntu@cordant-hermes-01` | no      | **prod**         | `NANGO_SECRET_KEY`             | personal dev box / staging   |

Why this split:
- Nango workspaces are independent — connections made on `oracle-1`'s dev
  workspace are invisible from `cordant-hermes-01` and vice versa.
- This is **desired** for dev/prod separation: a misconfigured connection
  on dev can't accidentally hit a real upstream (Notion workspace,
  Linear org, Circleback account).
- Cost: each new provider connection (Notion, Linear, Circleback, …)
  must be OAuth-authorized **twice**, once against each Nango workspace.
  Re-running the OAuth flow on a different host is a 30-second click.

## How to wire the keys (run on operator's Mac, not on the pi session)

The 1Password vault lives on the operator's Mac, not on the hosts. **Do
not paste the raw Nango secrets in chat** — that creates a permanent
copy in the conversation log. Use the `op` CLI to pipe the key straight
into the host's `.env`, where it lives only in 1Password + the host
file.

```bash
# oracle-1: dev Nango key
ssh opc@oracle-1 '
  grep -v "^NANGO_SECRET_KEY=" ~/memroos/.env > /tmp/.env.tmpl
  NANGO_SECRET_KEY="$(op read "op://Personal/Nango dev")" \
    envsubst < /tmp/.env.tmpl > ~/memroos/.env
  cd ~/memroos && bash scripts/redeploy-from-ref.sh main
'

# cordant-hermes-01: prod Nango key
ssh ubuntu@cordant-hermes-01 '
  grep -v "^NANGO_SECRET_KEY=" ~/memroos/.env > /tmp/.env.tmpl
  NANGO_SECRET_KEY="$(op read "op://Personal/Nango prod")" \
    envsubst < /tmp/.env.tmpl > ~/memroos/.env
  cd ~/memroos && bash scripts/redeploy-from-ref.sh main
'
```

The `grep -v "^NANGO_SECRET_KEY="` line is important — it removes any
prior NANGO_SECRET_KEY from `.env` so the new one wins cleanly without
leaving a stale orphan line.

## What changes when the key is in place

`/api/tools/connect/oauth` stops returning 503 and starts returning a
real Nango authorize URL. The `/settings/tools` UI on each host can
now actually open the "Connect" popup for the providers on that
host's Nango workspace (Notion, Linear, Circleback, …).

## Verification command (post-deploy, run from anywhere with SSH)

```bash
for h in opc@oracle-1 ubuntu@cordant-hermes-01; do
  echo "=== $h ==="
  ssh $h "curl -sS http://localhost:3000/api/tools/connect/oauth \
    -X POST -H 'Content-Type: application/json' \
    -d '{\"providerKey\":\"github\",\"returnOrigin\":\"http://localhost:3000\"}' | head -c 300"
  echo
done
```

Both should return `HTTP 200` with a body that includes an
`authorizeUrl` pointing to `connect.nango.dev`. If either still 503s,
the key wasn't injected (or the host needs a `docker compose restart`
to pick up the new env var).

## What does NOT live in this file

- Secrets themselves. This file documents the **mapping** and the
  **wiring recipe**; the actual keys live only in 1Password + each
  host's `.env`.
- Per-host Docker compose overrides. Those are in
  `docker-compose.local.yml` and are the same on both hosts.
- Per-provider connection state. That's in the Nango dashboards
  (dev for oracle-1, prod for cordant-hermes-01), not in this repo.
