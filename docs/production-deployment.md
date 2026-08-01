# MemRoOS Production Deployment

**Document version:** 2.1  
**Created:** 2026-07-01  
**Last updated:** 2026-07-31  
**Creation date/time:** 2026-07-01  
**Update date/time:** 2026-07-31 15:54 PDT  
**Source:** lac5q/memroos cutover to oracle-1; Cordant hermes tunnel `memroos-cordant` live 2026-07-31; live checks against `memroos.epiloguecapital.com` + `memroos-cordant.epiloguecapital.com`

## Production map

| Host | Role | Platform | Deploy path |
|------|------|----------|-------------|
| `memroos.com` | Public marketing / landing | Vercel | Push to `main` → Vercel (`vercel.json`) |
| `memroos.epiloguecapital.com` | **Operator app** (Luis / Epilogue) | **oracle-1** via Cloudflare Tunnel | Deploy on `oracle-1`; tunnel `memroos-oracle` |
| `memroos-cordant.epiloguecapital.com` | **Cordant operator** (Eric) | **cordant-hermes-01** via Cloudflare Tunnel | Deploy on hermes; tunnel `memroos-cordant` |
| Mac (`localhost`) | Dev / burst only | Local `npm run dev` | Not production |

**Canonical operator host:** `oracle-1` (Tailscale hostname `oracle-1`)  
**Public URL:** `https://memroos.epiloguecapital.com`  
**Tunnel:** Cloudflare `memroos-oracle` (`b63251cf-f9d1-41b5-a85e-9d6b792301db`) → `http://127.0.0.1:3000`  
**Shared stores:** Neo4j Aura + Qdrant Cloud (same collections as before)  
**Embeddings:** Ollama `nomic-embed-text` on oracle-1 (`MEMROOS_EMBEDDING_PROVIDER=ollama`)

**Heroku (`memroos-agent-onboarding`):** decommissioned as operator (`web=0`, custom domain removed). Do not treat Heroku or Vercel as the operator brain.

## Do not confuse Vercel with operator production

GitHub PR checks include **Vercel – memroos**. That deploys the **marketing site** and preview builds. It does **not** deploy the operator app.

**Operator production = oracle-1 Docker stack healthy + public tunnel smoke.**

## oracle-1 runtime

The operator runs as a **Docker Compose stack**, not systemd units. `memroos-web.service`
and `memroos-mem0.service` still exist on the host but are **inactive and disabled** —
legacy from before the Docker migration. Restarting them appears to succeed and changes
nothing (verified against the live host 2026-07-27; same finding as commit `dda51060`).

| Container | Role |
|-----------|------|
| `memroos-local-memroos-1` | Next.js operator on `127.0.0.1:3000` |
| `memroos-local-mem0-1` | mem0 HTTP service |
| `memroos-local-orchestration-1` | orchestration service |
| `memroos-local-connmem-1` | connected-memory service |

| systemd unit | State | Role |
|--------------|-------|------|
| `ollama.service` | active | Local embeddings (`nomic-embed-text`) |
| `cloudflared.service` | active | Tunnel `memroos-oracle` only |
| `memroos-disk-watch.timer` | active | Disk watch, every 30m |
| `memroos-web.service` | **inactive + disabled** | legacy — do not use |
| `memroos-mem0.service` | **inactive + disabled** | legacy — do not use |

**App checkout:** `/home/opc/memroos` (**not** `/home/opc/github/memroos` — that path does not exist)
**Env file:** `/home/opc/memroos/.env`, owned `opc:opc`. `/etc/memroos/` holds only
`gh-token` and `host-profile.env`; there is no `web.env` or `mem0.env` there.
**Disk watch:** warns at ≤6G free, critical at ≤4G (`/var/log/memroos/disk-watch.log`, `/run/memroos-disk-watch.state`)

### Deploy / restart on oracle-1

The `memroos` service **builds from source**. `git pull` plus a restart alone leaves the
old image running — the deploy looks successful and ships nothing. Always rebuild.

```bash
ssh oracle-1
cd /home/opc/memroos
git pull --ff-only
docker compose -f docker-compose.local.yml -f docker-compose.override.yml build memroos
./scripts/memroos-restart.sh
```

**Never run plain `docker compose -f docker-compose.local.yml up -d` on oracle-1.**
This host has a git-ignored `docker-compose.override.yml` pointing at the real Neo4j
Aura instance and Qdrant Cloud cluster. Omitting it silently reverts to the empty local
Neo4j container and an unconfigured Qdrant — this has happened once and cost hours.
`scripts/memroos-restart.sh` exists to enforce this; use it rather than raw compose.

## cordant-hermes-01 (second instance)

A separate self-contained MemRoOS instance, **not** a replica of prod. It uses
its own local `memroos-local-neo4j-1` container rather than Aura. It shares the
same `NANGO_SECRET_KEY` as prod, so both resolve to the same Nango environment.

**Public URL (Cordant / Eric):** `https://memroos-cordant.epiloguecapital.com`  
**Tunnel:** Cloudflare `memroos-cordant` (`a5016402-755f-42a5-aebe-be028bdb1660`)
on the host → UI `http://127.0.0.1:3000` plus path `/mcp*` → Streamable HTTP MCP
`http://127.0.0.1:8765` (`memroos-mcp-http.service`; see
`deploy/cordant-hermes-01/cloudflared/memroos-cordant.yml`).  
**Do not** route Cordant traffic through `memroos-oracle` / `memroos.epiloguecapital.com`.
**Do not** confuse docker `knowledge-mcp` on `:3291` with Streamable HTTP MCP on `:8765`.

**Claude Cowork connector (no Tailscale):**
`https://memroos-cordant.epiloguecapital.com/mcp` with
`Authorization: Bearer <MEMROOS_MCP_BEARER_TOKEN>` from
`~/.memroos/memroos-mcp-http.env` on hermes (share out-of-band; never in invite email).
Install/restart: `bash scripts/install-memroos-mcp-systemd.sh`.

**App checkout:** `/home/ubuntu/memroos` · **User:** `ubuntu` · **No** `docker-compose.override.yml`, and no `scripts/memroos-restart.sh`.

```bash
ssh cordant-hermes-01
cd /home/ubuntu/memroos
git pull --ff-only
docker compose -f docker-compose.local.yml build memroos
docker compose -f docker-compose.local.yml up -d memroos
```

The explicit `-f docker-compose.local.yml` matters here for the opposite reason it does
on oracle-1: bare `docker compose` resolves a **different** service set on this host
(it picks up `docker-compose.yml` and adds `knowledge-mcp`, which is not part of the
running stack). There is no override file to lose — the risk is gaining services.

### Tunnel notes

- Use the **dedicated** `memroos-oracle` tunnel for the operator hostname.
- Do **not** share the Mac `ollama-mac` tunnel for `memroos.epiloguecapital.com` (split connectors cause Mac/oracle flip-flops).
- Mac `~/.cloudflared/config.yml` must not advertise `memroos.epiloguecapital.com`.

## Verify production is correct

```bash
bash scripts/verify-onboarding-deploy.sh
```

Or manually:

```bash
# MUST be 403 (handler rejects bad token), NOT 401 (proxy blocks request)
curl -sS -w "\nHTTP:%{http_code}\n" \
  'https://memroos.epiloguecapital.com/api/onboarding/script?token=bad'

# oracle fingerprint: RTK/QMD often down; Graph Memory + mem0 up
curl -sS 'https://memroos.epiloguecapital.com/api/health' | jq '.services[] | {service,status}'

# inventory (browser login or Bearer JWT)
# expect non-zero ingested_message / vector_memory / graph_fact
```

| HTTP | Body | Meaning |
|------|------|---------|
| **401** | `authentication required` | Wrong backend or stale proxy build |
| **403** | `Invalid onboarding token` | **Good** — fixed handler reached |
| **403** | `Invalid onboarding token signature` | Handler reached; **secret mismatch** (see below) |

## Onboarding token signing

Signing secret resolution (`apps/memroos/src/lib/agent-onboarding.ts`):

1. `MEMROOS_ONBOARDING_SECRET`
2. else `MEMROOS_OPERATOR_API_KEY`
3. else `local-dev-memroos-onboarding` (dev only)

Ensure `/home/opc/memroos/.env` on oracle-1 has the same secret used when creating invites, plus:

```bash
MEMROOS_PUBLIC_BASE_URL=https://memroos.epiloguecapital.com
MEMROOS_APP_URL=https://memroos.epiloguecapital.com
```

### Agent bootstrap command

```bash
curl -fsSL 'https://memroos.epiloguecapital.com/api/onboarding/script?token=<TOKEN>' \
  | bash -s -- --platform 'cursor' --mcp-target 'auto'
```

**Success artifacts:**
- `~/.memroos/<agent-id>.env`
- `~/.memroos/<agent-id>.onboarding-report.json`

## Secrets hygiene

If Aura/Qdrant credentials were ever printed via `heroku config:set` or chat logs, **rotate** them in Aura + Qdrant Cloud and update `/home/opc/memroos/.env` on oracle-1, `/home/ubuntu/memroos/.env` on cordant-hermes-01 (and local `.env.local` for Mac dev).

## Agent / CI rules

1. Read this doc before any deploy task.
2. Never treat Vercel green checks as operator production deploy.
3. Do not mark deploy complete until health + onboarding smoke pass on `memroos.epiloguecapital.com`.
4. If code is on `main` but production still returns **401**, check DNS/tunnel routing (must be `memroos-oracle`, not Heroku, not Mac shared tunnel).
5. Mac is **dev only** for the operator app.

## Historical note (pre-2026-07-18)

Operator previously ran on Heroku (`memroos-agent-onboarding`) and briefly via a shared Mac Cloudflare tunnel. That layout is retired for the public operator hostname.
