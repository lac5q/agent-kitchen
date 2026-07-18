# MemRoOS Production Deployment

**Document version:** 2.0  
**Created:** 2026-07-01  
**Last updated:** 2026-07-18  
**Creation date/time:** 2026-07-01  
**Update date/time:** 2026-07-18 21:42 PDT  
**Source:** lac5q/memroos cutover to oracle-1; live checks against `memroos.epiloguecapital.com`

## Production map

| Host | Role | Platform | Deploy path |
|------|------|----------|-------------|
| `memroos.com` | Public marketing / landing | Vercel | Push to `main` → Vercel (`vercel.json`) |
| `memroos.epiloguecapital.com` | **Operator app** (login, APIs, agent onboarding) | **oracle-1** via Cloudflare Tunnel | Deploy on `oracle-1`; tunnel `memroos-oracle` |
| Mac (`localhost`) | Dev / burst only | Local `npm run dev` | Not production |

**Canonical operator host:** `oracle-1` (Tailscale `100.90.196.33`)  
**Public URL:** `https://memroos.epiloguecapital.com`  
**Tunnel:** Cloudflare `memroos-oracle` (`b63251cf-f9d1-41b5-a85e-9d6b792301db`) → `http://127.0.0.1:3000`  
**Shared stores:** Neo4j Aura + Qdrant Cloud (same collections as before)  
**Embeddings:** Ollama `nomic-embed-text` on oracle-1 (`MEMROOS_EMBEDDING_PROVIDER=ollama`)

**Heroku (`memroos-agent-onboarding`):** decommissioned as operator (`web=0`, custom domain removed). Do not treat Heroku or Vercel as the operator brain.

## Do not confuse Vercel with operator production

GitHub PR checks include **Vercel – memroos**. That deploys the **marketing site** and preview builds. It does **not** deploy the operator app.

**Operator production = oracle-1 systemd units healthy + public tunnel smoke.**

## oracle-1 runtime

| Unit | Role |
|------|------|
| `memroos-web.service` | Next.js operator on `:3000` |
| `memroos-mem0.service` | mem0 HTTP service |
| `ollama.service` | Local embeddings (`nomic-embed-text`) |
| `cloudflared.service` | Tunnel `memroos-oracle` only |

**Env files (host):** `/etc/memroos/web.env`, `/etc/memroos/mem0.env`  
**App checkout:** `/home/opc/github/memroos`  
**SQLite:** `SQLITE_DB_PATH` → `/home/opc/github/memroos/data/conversations.db`  
**Disk watch:** `memroos-disk-watch.timer` every 30m — warns at ≤6G free, critical at ≤4G (`/var/log/memroos/disk-watch.log`, `/run/memroos-disk-watch.state`)

### Deploy / restart on oracle-1

```bash
ssh oracle-1
cd /home/opc/github/memroos
git pull --ff-only   # or rsync schema-compatible code
npm --prefix apps/memroos ci
# arm64 natives if needed after npm ci
npm --prefix apps/memroos run build
sudo systemctl restart memroos-mem0 memroos-web
sudo systemctl status memroos-web memroos-mem0 ollama cloudflared --no-pager
```

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

Ensure `/etc/memroos/web.env` on oracle-1 has the same secret used when creating invites, plus:

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

If Aura/Qdrant credentials were ever printed via `heroku config:set` or chat logs, **rotate** them in Aura + Qdrant Cloud and update `/etc/memroos/*.env` (and local `.env.local` for Mac dev).

## Agent / CI rules

1. Read this doc before any deploy task.
2. Never treat Vercel green checks as operator production deploy.
3. Do not mark deploy complete until health + onboarding smoke pass on `memroos.epiloguecapital.com`.
4. If code is on `main` but production still returns **401**, check DNS/tunnel routing (must be `memroos-oracle`, not Heroku, not Mac shared tunnel).
5. Mac is **dev only** for the operator app.

## Historical note (pre-2026-07-18)

Operator previously ran on Heroku (`memroos-agent-onboarding`) and briefly via a shared Mac Cloudflare tunnel. That layout is retired for the public operator hostname.
