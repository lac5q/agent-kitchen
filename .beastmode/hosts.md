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

## Latest state (2026-07-23)

| Host | Nango env in container | `connect/oauth` status |
|------|------------------------|------------------------|
| oracle-1 | ✅ dev key | 502 — Nango dev workspace not configured for github/linear/notion yet |
| cordant-hermes-1 | ✅ prod key | 502 — Nango prod workspace not configured for github/linear/notion yet |

Both hosts reachable to Nango (DNS + gVisor sandbox fixed by switching the
memroos service to `runtime: runc` + adding `dns: [1.1.1.1, 8.8.8.8]`).
Connection attempts return 502 with `nango_upstream_error` because the
Nango workspaces don't have OAuth app credentials configured for those
specific providers — that's a Nango dashboard task, not a memroos fix.

## Compose patch (commit c0de6193)

The `memroos` service in `docker-compose.local.yml` now has:
```yaml
memroos:
  env_file: .env
  runtime: runc
  dns:
    - 1.1.1.1
    - 8.8.8.8
  build: ...
  ports: ...
  environment: ...
```

Why each line:
- `env_file: .env` — without this, the host's `.env` (with NANGO_SECRET_KEY) was NOT passed to the container, so Nango integration was dead on every host.
- `runtime: runc` — the host's docker daemon defaults to gVisor (`runsc`) with `--network=sandbox`, which fully isolates the container's network namespace. DNS lookups via 127.0.0.11 never reach the host's upstream DNS. Switching just the memroos service to `runc` restores network. (The other services keep gVisor — they don't need outbound.)
- `dns: [1.1.1.1, 8.8.8.8]` — belt-and-suspenders. With gVisor gone, Docker's embedded DNS at 127.0.0.11 should forward, but pinning public resolvers means DNS works even if the host's embedded resolver is misconfigured.

## To finish wiring the integrations (operator task)

For each Nango workspace (dev for oracle-1, prod for cordant):
1. Log in to https://nango.dev
2. Go to the matching integration (dev or prod)
3. For each provider you want to support on that host (Notion, Linear, GitHub, Circleback, etc.):
   - Add the provider in Nango's UI
   - Configure the OAuth app credentials (Notion's integration token, Linear's API key, GitHub's OAuth app, etc.)
4. Re-run the connect flow from `/settings/tools` on the host

The memroos side is complete. The remaining work is in the Nango dashboard, not in the memroos code.
