# Phase 203 — Easy account registration (Google) vs Cowork connector auth

**Version:** 2026-07-31.2  
**Created:** 2026-07-31 18:24 PDT  
**Updated:** 2026-07-31 18:31 PDT  
**Sources:** Operator clarification 2026-07-31 (Google = account registration, not Cowork MCP); Anthropic connector auth; Phase 202 SUMMARY.

## Locked split (operator clarification)

| Surface | Job | Auth |
|---------|-----|------|
| **MemRoOS invite / login / register** | Create a human account on Cordant/oracle console | **Google OAuth for registration/login** (goal) — easier than email+password for non-technical users |
| **Claude Cowork → MemRoOS `/mcp`** | Remote MCP tools from Anthropic cloud | **Not Google on the Invite screen.** Admin adds connector once (`static_headers` bearer today); members only **Connect**. Per-user MCP OAuth is optional later, separate from console Google. |

Do **not** put a “Sign in with Google” affordance on the Cowork connector panel as if it authenticates Claude → `/mcp`. That confused the Phase 202 screenshot review.

## What already shipped (202 / follow-up UX)

- Members never paste MCP bearer tokens (Connect-only copy).
- Cowork URL prefers Cordant `https://memroos-cordant.epiloguecapital.com/mcp`.
- Shared bearer remains **admin-only** for Claude Team connector Request headers until/unless MCP OAuth is a later phase.

## Google for account registration (this phase’s real product work)

**End state:** On `/invite/[token]` and `/login`, non-technical users can **Continue with Google**, land in an authenticated MemRoOS session bound to the invite (role + ownership), then proceed to Connect agents / Cowork steps without inventing a password if they prefer Google.

**Current code:** `apps/memroos` auth is email/password (`/api/auth/register`, `/api/auth/login`). Research mentioned `arctic` for Google/GitHub — **not implemented**.

**Suggested slice:**

1. Google OIDC via `arctic` (or equivalent) with PKCE.
2. Routes: `/api/auth/google` + `/api/auth/google/callback`.
3. On success with valid invite token: create/link user, set role from invite, issue same session cookies as register.
4. Buttons on invite register + login pages only.
5. Env: `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / redirect URI per host (Cordant + oracle).

**Out of scope for this phase:** Cowork MCP OAuth, Cloudflare Access on `/mcp`, SendGrid.

## Cowork remains (ops, not Google UI)

```
Admin (once): Claude Admin → Add connector → Cordant /mcp + Request header bearer
Member: Invite → (Google or password) account → Pick Claude Cowork → Connect in Claude
```

## Verification

- Cowork member copy has no bearer paste; Cordant `/mcp` URL.
- Unauth `/mcp` stays 401.
- When Google registration ships: invite → Google → session + Connect step works without password form.
