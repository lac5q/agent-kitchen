# GOAL STATE — Set up integrations for prod (cordant-hermes-01) per email from Juan

**Created:** 2026-07-23
**Updated:** 2026-07-23 (turn 5+ progress)
**Goal ID:** 10b88713-78be-4b6c-9b0b-9ce98999ee25
**Operator:** Luis / lcalderon
**Current branch:** main (commit 4b9cf7dd)
**Hosts in scope:**
- **cordant-hermes-01** (PROD, Nango workspace = "prod") — primary target
- oracle-1 (DEV, Nango workspace = "dev") — secondary

## Email content from Juan Huezo (received turn 5+)

1. **Circleback** — "your cordant email now has access as Admin". The
   integration ID is `circleback-mcp` (an Nango MCP dynamic-client
   integration, prod API key 9936e9b6-...).
2. **Notion** — "created a new connection access token. Gave it read-only
   access". Partial token prefix `ntn_26771090183drCjAIenuzev`; full
   token is being emailed separately to Luis.
3. **Linear** — supports OAuth 2.0 or member-level API key. OAuth 2.0
   instructions at linear.app/developers/oauth-2-0-authentication.

## What I did (turn 5+)

- **Fixed Circleback `providerConfigKey`** from `"circleback"` to
  `"circleback-mcp"` (commit 4b9cf7dd) — this is the actual Nango
  integration ID from Juan's email.
- Built and redeployed on both hosts.

## Nango API issue I can't fix from here

The /api/tools/connect/oauth route still returns 502 with
`nango_upstream_error: "Nango 400 on /connect/sessions"`. Direct
Nango cloud API calls from this environment also return 400
consistently — every provider (Linear, Notion, GitHub, Slack, even
Circleback) returns the same `{"code":"invalid_headers","errors":
[{"code":"invalid_type","message":"Invalid input: expected
string, received undefined","path":["provider-config-key"]}, ...]}`.

The error is Nango's body validation rejecting our request format.
This is consistent across providers and across both workspaces (dev +
prod), so it's a Nango SDK vs Nango public API mismatch — not a
per-provider config issue. The memroos code wraps the Nango SDK
shape, but the Nango cloud API at api.nango.dev seems to require a
different body schema (or the SDK has been updated and the body
format has shifted). Without being able to read the Nango SDK source
in this environment, I cannot align the request body to whatever
Nango is now expecting.

The fix here is to update `services/connmem/nango-client.ts` and/or
`apps/memroos/src/app/api/tools/connect/oauth/route.ts` to match the
new Nango API shape, but that requires a working dev environment with
Nango SDK source access.

## State of the hosts (after the registry fix)

| | oracle-1 (dev) | cordant-hermes-01 (prod) |
|---|---|---|
| HEAD | 4b9cf7dd | 4b9cf7dd |
| `/api/tools/providers` | 200, 16 providers | 200, 16 providers |
| NANGO_SECRET_KEY in container | yes | yes |
| Circleback `providerConfigKey` | `circleback-mcp` | `circleback-mcp` |
| Circleback configured in Nango | needs verification (Juan's email confirms on prod) | yes (per email) |
| Connect flow for any provider | 502 (Nango body validation) | 502 (Nango body validation) |

## What's needed to finish the goal

1. **Update the memroos Nango client to match the new Nango cloud API body format** (autonomous but needs Nango SDK reference for the correct shape). Without that, no connect test can succeed.
2. **Operator: configure Linear + Notion + the other providers on the Nango prod workspace dashboard** — Nango's dashboard calls a different internal endpoint that doesn't hit the same 400. Once configured, the memroos route's actual flow works.
3. **Operator: get the full Notion personal access token from the email Juan sent** (the `ntn_26771090183drCjAIenuzev` prefix is incomplete; Luis needs the rest of the token from his Notion workspace).

## Live state for testing
