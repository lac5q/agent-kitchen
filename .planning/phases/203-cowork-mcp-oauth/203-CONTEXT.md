# Phase 203 — Cowork MCP Auth without Shared Bearer (draft)

**Version:** 2026-07-31.1  
**Created:** 2026-07-31 18:24 PDT  
**Updated:** 2026-07-31 18:24 PDT  
**Sources:** Anthropic connector auth docs (2026); Phase 202 SUMMARY (bearer D-09a); invite UX screenshot on `memroos.epiloguecapital.com`; repo auth routes (password-only).

## Why the design shows a bearer (and no Google button)

Phase **202** deliberately shipped **D-09a: shared `MEMROOS_MCP_BEARER_TOKEN`** so public `/mcp` was not anonymous. Cloudflare Access / OAuth were **deferred** in SUMMARY.

The “Google OAuth we created” is **not** wired to Claude Cowork:

| Thing that exists | What it is | Visible in Invite Cowork UI? |
|-------------------|------------|------------------------------|
| Research plan for `arctic` Google/GitHub login | Stack research for console SSO | No — not implemented in `apps/memroos` auth routes (login is email/password) |
| Nango / GWS Google OAuth | Connector vault for Drive/Meet etc. | No — different product surface |
| Claude Cowork connector auth | Remote MCP OAuth (`oauth_dcr` / CIMD) or Team admin `static_headers` | Bearer-only today |

**Important Anthropic rule:** if each person should use their own account, use **OAuth**, not a shared request-header bearer. Shared bearer is for org-admin `static_headers` (beta) — entered **once by an admin**, not by every invitee.

## Target UX (non-technical)

```
Member (Eric/CEO coworker)
  → Opens invite → Create account → Pick Claude Cowork
  → Sees: deep link / “Enable MemRoOS in Claude” (no token)
  → Claude → Connect → Sign in with Google (MemRoOS consent)
  → Tools appear

Admin (Luis / Cordant Team owner) — one-time
  → Adds custom connector URL once (Team/Enterprise Owner)
  → Until OAuth ships: admin pastes bearer in Claude Request headers (never email)
  → After OAuth ships: no bearer; Google consent only
```

## Auth architecture options (pick for plan)

### A — Preferred end state: MCP OAuth + Google IdP (`oauth_dcr` or CIMD)

1. Streamable HTTP `/mcp` returns **401** with `WWW-Authenticate: Bearer resource_metadata="…"`.
2. Serve RFC 9728 protected-resource metadata + authorization-server discovery.
3. Authorization server uses **Google** as IdP (or MemRoOS session that itself used Google later).
4. Redirect URI for Cowork/web: `https://claude.ai/api/mcp/auth_callback`.
5. Per-user access token → map to MemRoOS `owner_id` / space membership.

**Effort:** new auth surface on hermes (or Next.js routes in front of MCP). Highest UX match to “Sign in with Google.”

### B — Cloudflare Access Managed OAuth (Google) in front of `/mcp`

Faster ops path: Access policy “allow @cordant… Google accounts” on `/mcp*`.  
Claude’s connector must still complete Access’s challenge — verify Claude supports Access hop; may need MCP OAuth that sits behind Access, or Access service tokens (not Google UX).

**Risk:** Claude cloud egress + Access interactive login may not equal “one tap Google” inside Cowork.

### C — Interim (ship now): Team-admin static header; members never see bearer

Matches Anthropic’s `static_headers` model:

- **Invitee copy:** “Ask your admin if MemRoOS isn’t listed → then Connect.” No token field.
- **Admin runbook:** paste bearer once in Claude Admin → Connectors → Request headers.
- Cordant URL must be `https://memroos-cordant.epiloguecapital.com/mcp` (not oracle).

## Screenshot defects to fix immediately

1. Instructions told **every user** to paste a Team-admin bearer → wrong for non-technical members.
2. URL showed **`memroos.epiloguecapital.com`** (oracle). Eric’s brain is **Cordant**. Invite on wrong host or origin-based URL without Cordant preference.

## Honesty / sequencing

- Do **not** mark Google OAuth “done” until live Cowork Connect → Google consent → tools list.
- Phase 202 stays closed for bearer+reachability; this is **203** (or 202b) follow-up.
- Console “Sign in with Google” (`arctic`) is related branding but **insufficient alone** — Claude never hits `/login`; it hits `/mcp` OAuth.

## Verification

- Unauth `/mcp` remains 401.
- Invite Cowork steps for members contain **no** `Bearer <token…>` wording.
- Cordant invites resolve MCP URL hostname `memroos-cordant.epiloguecapital.com`.
- Later: OAuth discovery endpoints + Cowork Connect smoke.
