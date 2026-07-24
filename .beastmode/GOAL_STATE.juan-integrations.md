# GOAL STATE — Set up integrations for prod (cordant-hermes-01) per email from Juan

**Created:** 2026-07-23
**Updated:** 2026-07-23 (start of goal)
**Goal ID:** 10b88713-78be-4b6c-9b0b-9ce98999ee25
**Operator:** Luis / lcalderon
**Current branch:** main
**Hosts in scope:**
- **cordant-hermes-01** (PROD, Nango workspace = "prod") — primary target
- oracle-1 (DEV, Nango workspace = "dev") — secondary, used as the safe place to dry-run first

## Goal

Set up the integrations for the prod Nango workspace (cordant-hermes-01) and test them, based on the email from Juan.

## Constraint (hard)

**I cannot read email.** I have no email client, no IMAP, no Gmail API access. I have:
- Tailscale SSH to oracle-1 and cordant-hermes-01
- 1Password CLI (signed in as service account)
- git, file I/O, docker

The first step requires the operator to extract the email content and surface it in chat (paste / summarize / screenshot). Everything after that I can do autonomously.

## Phases

### Phase A — Operator extraction (immediate, blocks me)

Operator (Luis) pastes into chat the relevant content from Juan's email:
- Which integrations to set up (provider keys, e.g. notion / linear / github / circleback / slack / hubspot / salesforce / ...)
- OAuth client_id / client_secret / scopes for each
- Redirect URI convention (per the Nango dev config: `https://api.nango.dev/oauth/callback`)
- Any provider-specific quirks (Notion's internal integration model, Circleback's API key vs OAuth, etc.)
- "Prod" vs "dev" workspace distinction (which is which — confirm Juan's Nango setup)

If the email is long, the operator can summarize + paste just the relevant fields.

### Phase B — Registry update (me, on main)

For each provider Juan specified, I update `apps/memroos/src/lib/tool-auth/providers.ts`:
- Add the entry to the right category (productivity / developer / crm / finance / other)
- Set `providerConfigKey` to the Nango provider key
- Add `scopes` per provider's OAuth scope requirements
- Update the local unit test `apps/memroos/src/lib/tool-auth/__tests__/providers.test.ts` if needed

### Phase C — Build + deploy (me, on main → cordant)

- Build the new memroos image (no-cache, because the build context changed)
- Push to origin/main
- `bash scripts/redeploy-from-ref.sh main` on cordant-hermes-01
- Verify `/api/tools/providers` returns the new providers
- (Skip running the smoke test for Juan's specific providers if the Nango prod workspace hasn't been configured with their OAuth credentials yet — that's still a Nango dashboard task)

### Phase D — Nango workspace configuration (operator task, on Nango dashboard)

The operator configures the OAuth apps on the **prod** Nango workspace for each provider:
- Notion: create internal integration, copy OAuth client_id + client_secret
- Linear: create OAuth app, copy client_id + client_secret
- GitHub: register OAuth app, copy client_id + client_secret
- Circleback (if applicable): API key or OAuth depending on Circleback's auth model
- (any others from the email)

Without this, the connect flow on cordant will 502 with `nango_upstream_error` even though the registry is updated.

### Phase E — End-to-end test (me, on cordant)

1. Login to memroos on cordant (`/api/auth/login` with the prod admin credentials) → get session cookie
2. For each new provider, hit `POST /api/tools/connect/oauth` with the cookie
3. Verify response is **200** (not 502) with a real Nango authorize URL
4. If available, hit `GET /api/tools/connect/oauth/callback?...` (or simulate the popup) to verify the token lands in the vault
5. Verify `/api/tools/connections` shows the new connection
6. `memroos status` should still be green; `memroos doctor` should report no new findings

### Phase F — Validator pass (me, via Claude Opus 4.8 via claude-pro lane)

Have Opus audit the registry + the Nango prod config + the test output. Per the beastmode rules: validator must be independent of the orchestrator (MiniMax-M3).

## Non-goals

- Setting up NEW providers not in Juan's email
- Changing the registry's category structure
- Touching the public host (`memroos.epiloguecapital.com`) — only the local prod Nango
- Reading the email myself (I cannot)

## Acceptance criteria

The goal is done when:
- The Phase B registry changes are committed to main
- cordant-hermes-01 is on the new image
- For each provider in Juan's email: `/api/tools/connect/oauth` on cordant returns 200 with a Nango authorize URL (not 502)
- Opus validator verdict: PASS
- The host mapping in `.beastmode/hosts.md` is up to date

## Status (live)

- [ ] Phase A — email content received from operator
- [ ] Phase B — registry updated on main
- [ ] Phase C — built + deployed to cordant
- [ ] Phase D — Nango prod workspace configured by operator
- [ ] Phase E — end-to-end test green on cordant
- [ ] Phase F — Opus validator PASS
