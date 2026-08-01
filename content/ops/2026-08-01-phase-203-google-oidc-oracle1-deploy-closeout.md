# v8.33 / v8.32 close-out — Phases 203, 204, 205

**Date:** 2026-08-01
**Run:** Beastmode, frontier-led. Director Opus 5 (medium) · Executor MiniMax-M3 · Validator Opus (high)
**Harness:** manual git + `cursor-goal` checkpointing
**Milestone:** v8.33 Ledger + Dashboard Data Honesty; Phase 203 belongs to v8.32

---

## Status summary

| Phase | Code on main | Deployed to oracle-1 | Live-verified | Open |
|---|---|---|---|---|
| **203** Google Account Registration | `33aff816` | **Yes — this run** | Route serving (`200 {"configured":false}`) | OAuth client creds + end-to-end smoke |
| **204** Ledger Honesty + RTK Removal + Workflow Render | `60aad51d`, `908c6570` | Yes (prior session) | Yes — Ledger shows real input/output/cacheRead | — |
| **205** Knowledge Vault Point-and-Index | `f6cae0d9` | Yes (prior session) | Yes — 1,436 memories, 350 skills, `knowledge-mcp` healthy | — |

`.planning/ROADMAP.md` rows are consistent with the above (`:3636` for 203, `:3697`/`:3698` for 204/205); no roadmap edit was needed this run.

---

## What this run actually did

### 1. Phase 203 deploy to oracle-1 — DONE

The host was already at `33aff816`, but the **running container predated the pull** — `/api/auth/google/status` returned **404**, i.e. the Google routes were absent from the serving image. This is the exact failure `docs/production-deployment.md:63` warns about ("old image running — the deploy looks successful and ships nothing").

Executed per the documented procedure:

```bash
ssh oracle-1
cd /home/opc/memroos
git pull --ff-only
docker compose -f docker-compose.local.yml -f docker-compose.override.yml build memroos
./scripts/memroos-restart.sh
```

**Evidence the deploy is real, not cache-hit theatre:**

| Check | Before | After |
|---|---|---|
| Image ID on `memroos-local-memroos-1` | `sha256:b6f1e4c2deaf` | `sha256:7b09a67fffc4` |
| Google routes inside image | absent | `/app/apps/memroos/.next/server/app/api/auth/google/{route,status/route,callback/route}.js` |
| `localhost:3000/api/auth/google/status` (on host) | — | `200 {"configured":false}` |
| `https://memroos.epiloguecapital.com/api/auth/google/status` | **404** | **`200 {"configured":false}`** |
| Container health | — | `healthy` |

`configured:false` is the **correct and expected** state: `getGoogleOidcConfig()` returns `null` while `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` are unset, and the UI hides the Continue-with-Google button accordingly. The route existing and answering 200 is the discriminating proof that the new code is serving.

### 2. Roadmap tables — already correct, verified not re-edited

Checked directly rather than assumed. No change made.

### 3. End-to-end smoke (invite → Google → connect) — **BLOCKED**

Not run, and not simulated. It cannot pass until a Google OAuth 2.0 client exists. See the blocker below.

---

## BLOCKER: Google Cloud OAuth 2.0 client (operator action)

This is the single remaining item and it is **not agent-actionable**. Creating a Web-application OAuth 2.0 Client ID is a Google Cloud Console action; there is no general-purpose `gcloud` command that mints one (`gcloud alpha iap oauth-clients` is IAP-brand-scoped and is not this).

Until the creds exist:
- `/api/auth/google/status` stays `configured:false`
- the Continue-with-Google button stays hidden on `/login` and `/invite/[token]`
- the deploy is safe in this state — nothing is half-enabled

## Operator step: create the Google Cloud OAuth 2.0 client

### 1. Configure the OAuth consent screen

1. Open the Google Cloud Console and select the project that hosts the MemRoOS deployment.
2. Navigate to **APIs & Services → OAuth consent screen**.
3. Choose **External** as the user type (or **Internal** if the project is restricted to your Workspace org) and click **Create**.
4. Fill in the required app information:
   - **App name:** MemRoOS
   - **User support email:** an address you monitor
   - **Application home page:** `https://memroos.epiloguecapital.com`
   - **Authorized domains:** `epiloguecapital.com`
   - **Developer contact information:** an address you monitor
5. On the **Scopes** step, add exactly the three the app requests (`apps/memroos/src/app/api/auth/google/route.ts:29-31`):
   - `openid`
   - `email` (listed in console as `.../auth/userinfo.email`)
   - `profile` (listed in console as `.../auth/userinfo.profile`)
6. On the **Test users** step, add the Google accounts that should be able to sign in while the app is in testing mode.
7. **Save and continue** → review → **Back to dashboard**.

### 2. Create the Web application OAuth 2.0 Client ID

1. **APIs & Services → Credentials**.
2. **+ Create credentials → OAuth client ID**.
3. **Application type:** Web application.
4. **Name:** e.g. `MemRoOS Web`.
5. **Authorized JavaScript origins** → Add URI, exactly:
   - `https://memroos.epiloguecapital.com`
6. **Authorized redirect URIs** → Add URI, exactly:
   - `https://memroos.epiloguecapital.com/api/auth/google/callback`
7. **Create**, then copy the **Client ID** and **Client secret**. The secret is shown once.

### 3. Apply the credentials on `oracle-1`

As `opc`. Do **not** commit `.env`.

```bash
cat >> /home/opc/memroos/.env <<'EOF'
GOOGLE_CLIENT_ID=<paste-client-id>
GOOGLE_CLIENT_SECRET=<paste-client-secret>
GOOGLE_REDIRECT_URI=https://memroos.epiloguecapital.com/api/auth/google/callback
EOF
chmod 600 /home/opc/memroos/.env
```

`GOOGLE_REDIRECT_URI` must byte-match the Authorized redirect URI from step 2. If it is omitted entirely, the app falls back to deriving it from `MEMROOS_PUBLIC_BASE_URL` — setting it explicitly is preferred and avoids a silent mismatch.

### 4. Restart

```bash
cd /home/opc/memroos && ./scripts/memroos-restart.sh
```

No rebuild needed — this is an env change only.

### 5. Verify

```bash
curl -s https://memroos.epiloguecapital.com/api/auth/google/status
# expect: {"configured":true}
```

Then the button renders and the smoke test below becomes runnable.

> **Warning:** `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are secrets. Do not paste them into chat, commit them, or log them. `/home/opc/memroos/.env` is a secret file.

---

## Remaining smoke test (run after creds land)

1. `/login` renders the Continue-with-Google button.
2. Issue an invite; open `/invite/<token>`; click Continue with Google.
3. Google consent → callback → lands back on the invite **connect step** with `?google=connected`.
4. Confirm a `user_identities` row exists for the Google `sub`.
5. Re-check `/ledger`, `/flow`, and Memory Inventory counts post-restart.

---

## Beastmode usage report

| Role | Model | Work |
|---|---|---|
| Director | Opus 5 (medium) | Deploy execution + verification, image-provenance checks, scope correction on worker output, this report |
| Executor | MiniMax-M3 (direct API) | Draft of the operator runbook section (~1,700 tokens total) |
| Validator | Opus (high) — advisor lane | Pre-deploy review; caught the stale-image risk and the "don't fake the smoke test" boundary |

- **Lane smoke:** MiniMax-M3 returned exactly `MINIMAX OK` before delegation. No model drift; Codex not used.
- **Director-inline by rule:** the production deploy is auth/security + production, which the standing downshift rule reserves for the director. Only the runbook prose was delegated.
- **Worker correction applied:** MiniMax listed the full `googleapis.com/auth/userinfo.*` scope URLs; the code requests `openid`/`email`/`profile`. Corrected against source before publishing.

## Learnings

- **M3 is a reasoning model.** `max_tokens: 20` was fully consumed by `reasoning_content` and returned an empty `content` — a false failure. Budget ≥256, and ≥2,000 for doc drafts.
- **`git pull` on oracle-1 without a rebuild is a silent no-op deploy.** The host sitting at the right SHA proves nothing. Compare the container's image ID before and after, and grep the built image for the new route — exit code 0 on `build` is not evidence when layers are cached.
- **Verify through both surfaces.** Checking `localhost:3000` on the host and the public Cloudflare URL separates app-layer from tunnel-layer failures.
