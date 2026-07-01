# MemRoOS Production Deployment

**Document version:** 1.0  
**Created:** 2026-07-01  
**Last updated:** 2026-07-01  
**Source:** lac5q/memroos `main` branch, Heroku app `memroos-agent-onboarding`, live checks against `memroos.epiloguecapital.com`

## Production map

| Host | Role | Platform | Deploy path |
|------|------|----------|-------------|
| `memroos.com` | Public marketing / landing | Vercel | Push to `main` → Vercel (`vercel.json`) |
| `memroos.epiloguecapital.com` | **Operator app** (login, APIs, agent onboarding) | **Heroku** | GitHub Actions: `Deploy MemRoOS to Heroku` |
| `*.cfargotunnel.com` | **Do not use** — legacy Cloudflare Tunnel served stale builds | — | Decommissioned |

**Heroku app:** `memroos-agent-onboarding`  
**Heroku URL:** `https://memroos-agent-onboarding-a2d2c751bb04.herokuapp.com`  
**Custom domain:** `https://memroos.epiloguecapital.com`  
**DNS:** Cloudflare `memroos` CNAME → `protected-shallot-*.herokudns.com` (DNS-only while Heroku ACM is active)

## Do not confuse Vercel with operator production

GitHub PR checks include **Vercel – memroos**. That deploys the **marketing site** and preview builds. It does **not** deploy the operator app used for agent onboarding.

**Operator production deploy = Heroku workflow success + onboarding smoke test.**

## Code merged on `main` (agent onboarding fix)

### 1. Proxy auth fix (PR #18)

**Problem:** `apps/memroos/src/proxy.ts` required human JWT for all `/api/*` routes. Agent onboarding uses signed invite tokens:

| Route | Auth |
|-------|------|
| `POST /api/onboarding/invite` | Operator JWT (still protected) |
| `GET /api/onboarding/script` | Signed invite token |
| `POST /api/onboarding/register` | Signed invite token |

**Fix:** Added script + register to `ROUTE_LOCAL_AUTH_API_ROUTES` in `proxy.ts`.

**Files:**
- `apps/memroos/src/proxy.ts`
- `apps/memroos/src/__tests__/proxy.test.ts`
- `scripts/check-route-auth-boundary.mjs`
- `scripts/check-route-auth-boundary.test.mjs`
- `docs/next-trust-boundary-upgrade.md`

### 2. Heroku deploy plumbing

**Files:**
- `Procfile` — `web: npm --workspace apps/memroos run start -- --hostname 0.0.0.0 --port ${PORT:-3000}`
- `package.json` — `heroku-postbuild`, Node 22 engines
- `.github/workflows/heroku-deploy.yml` — git push to Heroku on `main`

**GitHub secrets required:**
- `HEROKU_API_KEY`
- `HEROKU_APP_NAME` (`memroos-agent-onboarding`)
- `HEROKU_EMAIL`

### 3. Infrastructure fix (outside repo)

Cloudflare `memroos` pointed at an old tunnel (`*.cfargotunnel.com`), serving a stale build that returned **401** even after code was fixed. Repointed to Heroku + enabled ACM.

## Verify production is correct

```bash
bash scripts/verify-onboarding-deploy.sh
```

Or manually:

```bash
# MUST be 403 (handler rejects bad token), NOT 401 (proxy blocks request)
curl -sS -w "\nHTTP:%{http_code}\n" \
  'https://memroos.epiloguecapital.com/api/onboarding/script?token=bad'

# Should show Heroku serving traffic
curl -sSI 'https://memroos.epiloguecapital.com/login' | grep -i server
```

| HTTP | Body | Meaning |
|------|------|---------|
| **401** | `authentication required` | Wrong backend or stale proxy build |
| **403** | `Invalid onboarding token` | **Good** — fixed handler reached |
| **403** | `Invalid onboarding token signature` | Handler reached; **secret mismatch** (see below) |

## Open issue: invalid onboarding token signature

If invites return **403 Invalid onboarding token signature**, the UI created the token with a different secret than production verifies.

Signing secret resolution (`apps/memroos/src/lib/agent-onboarding.ts`):

1. `MEMROOS_ONBOARDING_SECRET`
2. else `MEMROOS_OPERATOR_API_KEY`
3. else `local-dev-memroos-onboarding` (dev only)

### Fix on Heroku

Ensure the same secret is used for **invite creation** and **token verification**:

```bash
heroku config -a memroos-agent-onboarding | grep -E 'ONBOARDING|OPERATOR'
```

Set explicitly (recommended):

```bash
heroku config:set MEMROOS_ONBOARDING_SECRET='<long-random-secret>' -a memroos-agent-onboarding
```

Also set public URL vars so invites embed the correct host:

```bash
heroku config:set \
  MEMROOS_PUBLIC_BASE_URL='https://memroos.epiloguecapital.com' \
  MEMROOS_APP_URL='https://memroos.epiloguecapital.com' \
  -a memroos-agent-onboarding
```

Then **generate a fresh invite** from the Agents UI and run the bootstrap command immediately (tokens expire in ~15 minutes).

### Agent bootstrap command

```bash
curl -fsSL 'https://memroos.epiloguecapital.com/api/onboarding/script?token=<TOKEN>' \
  | bash -s -- --platform 'cursor' --mcp-target 'auto'
```

**Success artifacts:**
- `~/.memroos/<agent-id>.env`
- `~/.memroos/<agent-id>.onboarding-report.json`

## Deploy operator app to Heroku

Automatic: push to `main` triggers `.github/workflows/heroku-deploy.yml`.

Manual:

```bash
heroku git:remote -a memroos-agent-onboarding
git push heroku main
bash scripts/verify-onboarding-deploy.sh
```

## Agent / CI rules

1. Read this doc before any deploy task.
2. Never treat Vercel green checks as operator production deploy.
3. Do not mark deploy complete until `verify-onboarding-deploy.sh` passes.
4. If code is on `main` but production still returns **401**, check DNS/tunnel routing — not “wait for cache.”
