# Phase 201: Invite + Multi-Harness Agent Bootstrap - Context

**Gathered:** 2026-07-31
**Status:** Ready for planning
**Milestone:** v8.32 Easy Human + Agent Onboarding
**Goal session:** `/goal` beastmode (local-only; MemRoOS goal API unavailable)

<domain>
## Phase Boundary

Ship one continuous invitee journey:

1. Admin creates a team invite (existing Team UI).
2. Invitee opens `/invite/[token]`, creates account.
3. **Immediately after account create** (option A), invitee sees a **Connect your agents** step.
4. Invitee multi-selects agent harnesses and gets **clear numbered copy-paste commands**.
5. Running a command registers that agent on MemRoOS with `owner_id` = the new user.
6. Admin Team UI also shows a **copyable email draft** (3 easy steps) — draft-only for v1 (no SendGrid dependency).

### In scope
- Invite page post-register UX (multi-step: account → harness picker → commands → done/login)
- API to mint per-harness onboarding commands for the authenticated new user
- Wire `owner_id` on agents registered via this path
- Team page email draft template after invite generate
- Tests for the new API + register→bootstrap handoff
- Easy, non-jargon copy throughout

### Out of scope
- Live SendGrid invite email send (Phase 183b / deferred)
- Admin pre-selecting harnesses on invite create (option B — rejected)
- Fixing oracle-1 `MEMROOS_PUBLIC_BASE_URL=localhost` (separate ops; Eric is **not** on oracle-1)
- Redesigning full Team admin beyond email draft + any tiny helper text
- New agent platforms beyond the existing onboarding `PLATFORMS` set
- Making cordant-hermes-01 share the oracle-1 `memroos-oracle` tunnel (dedicated `memroos-cordant` tunnel only)

</domain>

<decisions>
## Implementation Decisions

### Target host (locked — 2026-07-31 operator correction)
- **D-13:** **Eric (Cordant) onboards to `cordant-hermes-01`, not oracle-1.** Invite, account, agent registry, and Claude Code MCP all live on hermes’s MemRoOS DB/stack. Do not send Eric to `memroos.epiloguecapital.com` for this journey.
- **D-14:** Hermes public reachability for Eric is **Cloudflare Tunnel** `memroos-cordant` → `https://memroos-cordant.epiloguecapital.com` (live 2026-07-31). Eric does **not** need Tailscale.
- **D-15:** Hermes `.env` `MEMROOS_PUBLIC_BASE_URL` / `MEMROOS_APP_URL` / `MEMROOS_BASE_URL` / `MEMROOS_PUBLIC_API_URL` = `https://memroos-cordant.epiloguecapital.com` (set 2026-07-31). Redeploy Phase 201 code to hermes before Eric invite.

### Journey (locked — user chose A)
- **D-01:** Harness selection happens **after** successful registration on the invite flow (same session), not on the admin invite-create form.
- **D-02:** Invitee may select **multiple** harnesses; each gets its own onboarding command.
- **D-03:** After commands are shown, invitee can copy them, mark done, and continue to login (or auto-session if already issued `accessToken`).

### UX / copy (locked)
- **D-04:** Instructions must be “easy easy” — numbered steps, one command block per harness, no internal jargon (no “HMAC”, “TTL”, “MCP target” in primary copy). Secondary “Advanced” can mention restart the app.
- **D-05:** Primary harness labels human-friendly: Cursor, Claude Code, Codex, Hermes, OpenClaw, Pi, Gemini, Qwen, Droid, Cline, ChatGPT, Grok, OpenCode, ZCode (map to existing platform ids).
- **D-06:** Email draft on Team page is copy-paste text: (1) open invite link on `https://memroos-cordant.epiloguecapital.com` (2) create account (3) pick your AI tools and run the one-line commands shown.

### Auth / ownership (locked)
- **D-07:** After register, client keeps the returned `accessToken` (or uses it) to call a new authenticated bootstrap endpoint that mints onboarding commands — do **not** put long-lived agent keys in the invite URL.
- **D-08:** Agents registered through these commands MUST set `registered_agents.owner_id` to the registering human’s `users.id`.
- **D-09:** Reuse `createAgentOnboardingToken` + `/api/onboarding/script` + `/api/onboarding/register`; extend payload/register path only as needed for `ownerUserId` / `owner_id`.
- **D-10:** Default onboarding token TTL may stay short (15m) **or** be raised for invitee bootstrap (planner discretion, prefer ≤60m with clear “commands expire” copy). Refresh button re-mints while session valid.

### Public / fleet URL (locked)
- **D-11:** Commands must use a **non-localhost fleet URL**: prefer `MEMROOS_PUBLIC_BASE_URL` / `MEMROOS_APP_URL` / `MEMROOS_BASE_URL` when set and not localhost; else request origin / forwarded host / Tailscale hostname. On hermes for Eric, that resolves to `http://cordant-hermes-01:3000`. Never mint `http://localhost` when a Tailscale or other non-local host is known.

### Email (locked)
- **D-12:** v1 = **copyable draft only** on Team after invite generate. No SendGrid in this phase. Draft assumes hermes Tailscale URL for Cordant/Eric invites.

### Claude's Discretion
- Exact route shape (`POST /api/onboarding/bootstrap` vs nested under `/api/auth/...`)
- Whether welcome lives as step state on `/invite/[token]` vs `/welcome` redirect
- Agent id naming scheme (e.g. `{slug}-{platform}` vs generated `agt_…`) as long as ids are unique and stable per user+platform
- Whether to show “Skip for now” on harness step
- Test file placement matching existing auth/onboarding suites

</decisions>

<specifics>
## Specific Ideas

- Operator asked for Eric-style onboarding: “email should easily explain onboarding.”
- **2026-07-31 correction:** Eric must be on **cordant-hermes-01**, not oracle-1 / epiloguecapital.
- Mental model: human logs into hermes console; agents connect to hermes with a one-line Terminal command — agents do not “log in as” the human.
- Existing success artifacts remain: `~/.memroos/<agent-id>.env`, onboarding report JSON.

## Eric / Cordant path (operator-visible)

```
Eric opens invite from https://memroos-cordant.epiloguecapital.com/invite/...
  → creates account on hermes SQLite
  → picks Claude Code
  → runs curl|bash against https://memroos-cordant.epiloguecapital.com/...
  → Claude Code MCP points at hermes /mcp with hermes-issued agent key
```

Admin creates the invite on **hermes Team UI**
(`https://memroos-cordant.epiloguecapital.com/team`), not on
`memroos.epiloguecapital.com` (oracle-1).

Tunnel: Cloudflare `memroos-cordant` (`a5016402-755f-42a5-aebe-be028bdb1660`)
on cordant-hermes-01 → `http://127.0.0.1:3000`.

</specifics>

<canonical_refs>
## Canonical References

### Human invite
- `apps/memroos/src/app/team/page.tsx` — admin invite UI
- `apps/memroos/src/app/api/auth/invite/route.ts` — create invite
- `apps/memroos/src/app/invite/[token]/page.tsx` — invitee registration UI
- `apps/memroos/src/app/api/auth/register/route.ts` — consumes invite, returns `accessToken` + `userId`

### Agent onboarding
- `apps/memroos/src/lib/agent-onboarding.ts` — signed onboarding tokens + MCP config helper
- `apps/memroos/src/app/api/onboarding/invite/route.ts` — operator mint command
- `apps/memroos/src/app/api/onboarding/script/route.ts` — bootstrap script
- `apps/memroos/src/app/api/onboarding/register/route.ts` — consumes token, `registerAgent`
- `apps/memroos/src/lib/agent-registry.ts` — registry write (today does **not** set `owner_id`)
- `docs/production-deployment.md` — public operator URL + onboarding smoke
- `docs/rest-api.md` — onboarding API shapes

### Ownership
- `apps/memroos/src/lib/identity/lifecycle.ts` — `onboardUser` already sets `owner_id`
- `apps/memroos/src/lib/db-schema.ts` — `registered_agents.owner_id`, `team_invitations`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `createAgentOnboardingToken` / `verifyAgentOnboardingToken` / `shellQuote` / `buildMemroosMcpConfig`
- Team invite generate + clipboard pattern
- Register already returns `accessToken` (invite page currently ignores it and redirects to login)

### Patterns to Follow
- Role gates: admin for human invites; authenticated user (or operator) for minting own bootstrap commands
- Fail closed on bad/expired onboarding tokens (403)
- Prefer small additive schema/API changes over new parallel systems

### Integration Points
- Invite page must stop blind `router.push("/login?message=account-created")` after success — enter Connect step first
- `registerAgent` / onboarding register must accept and persist `owner_id`
- Team page: after `inviteUrl` shown, also show email draft textarea/pre

</code_context>

<deferred>
## Deferred Ideas

- SendGrid live invite mail
- Admin-side harness preselection (option B)
- oracle-1 `.env` PUBLIC_BASE_URL fix (ops; not Eric’s host)
- Cloudflare public hostname for hermes
- In-app “my agents” ownership dashboard polish beyond what’s needed to verify owner_id

</deferred>
