# MCP OAuth / Dynamic Client Registration — scope

*Created: 2026-08-01 · Status: scoped, not started*

## Why this exists

Adding `https://memroos-cordant.epiloguecapital.com/mcp` as a Claude **custom connector**
(Cowork / claude.ai) fails with:

> Couldn't register with Memroos's sign-in service. You can try again, or add an OAuth
> Client ID in the connector settings.

That is Claude attempting **Dynamic Client Registration** (RFC 7591) and finding nothing to
register against.

## Measured architecture (2026-08-01)

Cloudflared on `cordant-hermes-01` routes **by path**:

```
memroos-cordant.epiloguecapital.com/mcp*  -> 127.0.0.1:8765   (Python MCP)
memroos-cordant.epiloguecapital.com/*     -> 127.0.0.1:3000   (Next.js app)
```

`8765` is `memroos-mcp-http.service` — *"MemRoOS Streamable HTTP MCP (Cordant Cowork /
remote connectors)"*. It is a host systemd process, not a container.

| Endpoint | Serving | Result |
|---|---|---|
| `/mcp` | 8765 | **401** + `WWW-Authenticate: Bearer` ✅ correct challenge |
| `/.well-known/oauth-protected-resource` | **3000** (path rule doesn't match) | **307 → `/login`** ❌ |
| `/.well-known/oauth-authorization-server` | **3000** | **307 → `/login`** ❌ |
| `/register` (DCR) on 8765 | 8765 | **404** ❌ |
| `/.well-known/*` on 8765 | 8765 | **404** ❌ |

**The bug in one line:** Claude asks for JSON metadata, the Next app's auth middleware
answers with an HTML login redirect, so discovery never completes.

Worse, the 401 body tells clients *"your client should automatically re-register and obtain
new tokens"* — the service advertises a DCR flow that does not exist. That is why Claude
retries and fails rather than failing cleanly.

## Constraint the operator should know

There is **no bearer-token option** for Cowork / claude.ai connectors — the *Add custom
connector* dialog offers only OAuth Client ID / Secret. Claude Code CLI accepts
`--header "Authorization: Bearer …"`, which is why the Claude Code connector works today and
this one cannot.

So "avoid OAuth" is not achievable on this surface. **Zero-config for end users is**, and it
is the better outcome: implement DCR server-side so Claude self-registers and the user only
clicks **Connect** → signs in with Google → done. Nothing pasted.

## Recommended design: the Next app is the authorization server

Two options were considered.

**A — implement in the Python MCP (8765)** and re-route `.well-known` there in cloudflared.
Rejected: it would need its own user model, session handling, and login UI, duplicating what
already exists.

**B — implement in the Next app (3000); the Python MCP stays a pure resource server.**
Recommended, because the Next app already has:
- **Google OIDC working in production as of 2026-08-01** (`/api/auth/google/*`, Phase 203)
- the `users` / `user_roles` / `user_identities` model
- sessions, JWT signing (`signAccessToken`), refresh tokens
- and `.well-known` paths **already route to it** — no cloudflared change needed for
  discovery

The Python MCP then only has to validate a token the Next app minted.

## Work items

1. **`/.well-known/oauth-protected-resource`** (RFC 9728) on the Next app — returns the
   resource identifier and points at the authorization server.
   **Must be excluded from the login redirect**; today the middleware swallows it. That
   exclusion is the single highest-value change here — without it every other piece is
   unreachable.
2. **`/.well-known/oauth-authorization-server`** (RFC 8414) — issuer, `authorization_endpoint`,
   `token_endpoint`, `registration_endpoint`, supported scopes/PKCE.
3. **Dynamic Client Registration** (RFC 7591) — `POST /register`, issuing a client id per
   Claude installation. Decide retention and whether registration is open or gated.
4. **Authorize + token endpoints** — authorization code + PKCE, layered on the existing
   Google sign-in so the human authenticates with Google and MemroOS mints the MCP token.
5. **Resource-server validation in the Python MCP** — verify the Next app's token, map it to
   a principal, and **stop defaulting to `"shared"`** on the authenticated path.
6. **Fix the 502 on `memroos-mcp.internal.example`** (oracle-1) — separate hostname,
   currently dead. Decide whether it is still wanted.

Items 1–2 are small and independently testable. Items 3–5 are the real work: they make
MemroOS an OAuth authorization server.

## Why this is worth doing beyond the connector

It is the same mechanism the identity roadmap wanted for agents: a short-lived token bound to
a **verified human**, revocable at the IdP, replacing a static bearer token living in a config
file indefinitely. It closes the connector gap and the agent-credential gap with one build.

## Verification

- `curl .../.well-known/oauth-protected-resource` returns **JSON**, not a 307 to `/login`
- `curl .../.well-known/oauth-authorization-server` returns valid RFC 8414 metadata
- Claude *Add custom connector* → **Connect** completes with no client id or secret entered
- The MCP session resolves to the signed-in human, and the audit trail names them
