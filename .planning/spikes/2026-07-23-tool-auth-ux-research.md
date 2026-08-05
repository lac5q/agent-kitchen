# Tool Authentication UX for Memroos — Research Spike

**Date:** 2026-07-23 (revised 2026-07-23 v2 after validator REVISE)
**Author:** Beastmode orchestrator (MiniMax-M3, this pi session)
**Validation:** `.planning/spikes/2026-07-23-tool-auth-ux-validation.md` (REVISE — additive fixes only; resolved in this v2)
**Status:** v2 — post-revision. Roadmap-ready after operator constraint noted.
**Operator constraint (2026-07-23):** Easiest + cheapest path for ≤10 users per installation. Willing to pay if a product exceeds 10 users. Has already created a Nango API key in 1Password. This resolves the ELv2/AGPL contradiction the validator flagged — memroos's own OAuth use is not the ELv2 managed-service clause scenario; the clause only bites if memroos resells Nango features to its own customers.

---

## Problem

Memroos already has *user/login* auth (`/api/auth/*`, HS256 JWT, MEMROOS_OPERATOR_API_KEY, per-agent bearer keys, AES-256-GCM vault via `MEMROOS_VAULT_KEY_PATH`). What's missing is a **general-purpose third-party tool auth UX**: per-installation OAuth + API-key management for Slack, Linear, Circleback, GitHub, Notion, HubSpot, QuickBooks, Google Drive, etc.

Phase 176 (v8.20 Connected Work Memory, CONNMEM-01..10) currently hacks this for Linear/Circleback specifically. Phase 178 (v8.22, MEMCLIP-01..05) does it for Paperclip's `toolConnections`. Every future integration will repeat the same OAuth dance unless memroos ships a generic tool-auth plane.

Goal: pick the right approach so future integrations stop reinventing the wheel. The user has signaled:
1. Easiest + cheapest for ≤10 users per installation.
2. Willing to pay per-connection (or per-tier) once an installation crosses 10.
3. OAuth or API-key support required (real production tools need both).

## Memroos install + auth surface (ground truth from local read)

- **Local-first install:** `install.sh --local`, `docker-compose.local.yml`, single-binary / single-container
- **User auth:** `/api/auth/{login,register,logout,refresh,password-reset,invite}`, HS256 JWT, `MEMROOS_JWT_SECRET`
- **Operator key:** `MEMROOS_OPERATOR_API_KEY` for registry writes (env)
- **Agent keys:** `ak_<agentId>_<32bytes-base64url>`, SHA-256 hashed in `agent_api_keys`
- **Vault:** AES-256-GCM, `MEMROOS_VAULT_KEY_PATH` → `~/.memroos/vault.key` (0600)
- **MCP server topology:** memroos exposes tools via MCP; agents consume
- **Single-tenant per installation** — one operator per memroos deployment

**Tool-auth UX must plug into this:** vault for credential storage, MCP for tool consumption, settings UI at `apps/memroos/src/app/settings`.

## Resolving the validator's three findings

| Validator finding | Resolution |
|---|---|
| ELv2 / AGPL contradiction (ToolJet rejected on AGPL grounds but Nango waved through on ELv2) | **Resolved by operator decision: hosted SaaS is fine, paid scale is fine.** ELv2's managed-service clause applies to memroos reselling Nango features to its customers (out of scope for v8.23); memroos using Nango internally for its own OAuth is permitted. ToolJet AGPL rejection is also soft-resolved because per-installation self-hosting memroos never forks or modifies AGPL code — it merely connects. |
| Nango self-host is heavy (server + workers + Postgres + Redis) | **Acknowledged.** The decision is therefore to use hosted Nango for ≤10 users (Luis already has the API key) and revisit self-host only if memroos's customer mix shifts to enterprise self-host with strict on-host credential custody. |
| MCP axis is wrong (Nango wins on catalog, not on memroos's actual axis) | **Klavis added as a candidate** (MCP-first, OSS, smaller catalog). Decision: ship Nango for the 10-user scale because (a) free tier fits exactly, (b) catalog is biggest, (c) memroos has the API key. Track Klavis as a "swap candidate" if memroos's MCP needs grow. |
| Phase block hard-codes Nango/Better-Auth | **Removed.** Phase 179 block now specifies requirements; implementation pick is the spike's recommendation, not the phase's commitment. |

## Candidate survey (v2: Klavis + Scalekit/Stytch/Descope added, pricing column)

All data current as of 2026-07-23 via Exa MCP web search + local GitHub README scraping. "Last activity" is last-push date on the main repo unless noted. License-uncertain cells marked ⚠. **Pricing**: 2026 published free-tier limits relevant to the operator's ≤10-users-per-installation constraint.

| Project | License | Repo | Stars | Last activity | OAuth + refresh | Pre-built | MCP story | Self-host | Free tier (≤10 users) | Memroos fit note |
|---|---|---|---|---|---|---|---|---|---|---|
| **Nango** | Elastic License v2 ⚠ | [NangoHQ/nango](https://github.com/NangoHQ/nango) | 11.2k | 2026-07-22 | Yes — OAuth 1/2 + API key + Basic + custom, refresh handled | 900+ APIs | Adapter (MCP support added; not first-class) | Yes — Free self-host = Auth + Proxy only; Enterprise self-host = full catalog (requires subscription) | **10 connections, 100k proxy requests, 2 envs — exactly fits 10 users** | **Primary pick.** Exact 10-user fit on free tier. Hosted = tokens off-host. Self-host = stack of server + workers + Postgres + Redis (heavy). |
| **Composio** | MIT | [ComposioHQ/composio](https://github.com/ComposioHQ/composio) | 29.3k | 2026-07-20 | Yes — managed OAuth + BYO OAuth app, refresh | 1,000+ toolkits | **Native** — exposes itself as a remote MCP server | **No** — Enterprise tier only | **20K tool calls/mo, no credit card, 100/min rate limit, 1k premium tool calls** | Strong alternative. Most generous free tier. Managed OAuth = hosted only. Best growth-pricing curve. |
| **Klavis AI** ⚠ *NEW* | Apache-2.0 (per repo) | [Klavis-AI/klavis](https://github.com/Klavis-AI/klavis) | ⚠ (not extracted) | 2026 | Yes — built-in OAuth flows + API key management; OAuth support via Docker wrapper | 100+ MCP servers (Linear, GitHub, Slack, Gmail, Notion, Jira, Salesforce, …) | **First-class** — klavis.ai is an MCP integrations platform; Strata MCP server aggregates multiple tools | Yes — self-hosted MCP servers with API-key OAuth support (Docker images at `ghcr.io/klavis-ai`) | Free API key at klavis.ai/home/api-keys; exact limits need measurement | **Strongest MCP-first fit.** OSS, self-hostable with API key, MCP-native by design. Smaller catalog (100 vs Nango 900). **Worth a prototype to compare integration ergonomics before committing at scale.** |
| **Arcade.dev (arcade-mcp)** | MIT | [ArcadeAI/arcade-mcp](https://github.com/ArcadeAI/arcade-mcp) | 953 (arcade-mcp) | 2026-07-09 | Yes — `requires_auth=GitHub(scopes=[...])` decorator, refresh | 21 OAuth providers in TS SDK, 7,500+ prebuilt tools across 81 MCP servers | **First-class** — `arcade-mcp` is a framework for building MCP servers with managed auth | Standalone supported; "managed auth" is via Arcade Cloud | (pricing not extracted — Arcade Cloud SaaS) | Strong if MCP-first matters most. Managed OAuth runtime is closed-source Arcade Cloud. |
| **Pipedream (Connect)** | Pipedream Source Available License ⚠ | [PipedreamHQ/pipedream](https://github.com/PipedreamHQ/pipedream) | 11.6k | 2026-07-23 | Yes — managed OAuth + custom OAuth clients, refresh | 1,000+ apps | Pipedream MCP server exposes 10,000+ tools | Limited self-host | (SaaS-first) | License forbids competitive SaaS reuse. Not viable. |
| **n8n** | Sustainable Use License ⚠ | [n8n-io/n8n](https://github.com/n8n-io/n8n) | (large) | 2026-07-22 | Yes — 400+ nodes handle OAuth, refresh | 400+ nodes | n8n ships an MCP server (1k+ tools) | Yes — self-host fully featured | Self-host = free (SUL fair-code) | Wrong layer: workflow engine, not tool-auth plane. |
| **ToolJet** | AGPL-3.0 | [ToolJet/ToolJet](https://github.com/ToolJet/ToolJet) | 38.2k | 2026-07-17 | Yes — 80+ data sources | 80+ data sources | `tooljet-mcp` exposes ToolJet to AI assistants | Yes — Community Edition | Community Edition free; Basic/Paid tiers license-gated | Wrong layer: internal-tools builder. AGPL risk resolved if memroos is per-installation self-host only. |
| **Activepieces** | MIT (Community) + commercial `ee/` | [activepieces/activepieces](https://github.com/activepieces/activepieces) | 23.4k | 2026-07-21 | Yes — pieces framework, OAuth via pieces | 280+ pieces (≈400 MCP servers) | **First-class** — pieces auto-published as MCP servers | Yes — Community Edition | Community Edition = free MIT | Wrong layer: workflow engine. Open-core `ee/` mixing has been a community concern. |
| **Auth.js (NextAuth)** ⚠ | ISC | [nextauthjs/next-auth](https://github.com/nextauthjs/next-auth) | 28.3k | 2026-06-12 | Yes — many OAuth providers, refresh in v5+ | Provider list (not "tool" list) | Not MCP-focused | Library | n/a | **Wrong fit & maintenance mode.** Auth.js is now part of Better Auth. |
| **Better Auth** | MIT ✅ | [better-auth/better-auth](https://github.com/better-auth/better-auth) | 29.2k | 2026-07-19 | Yes — generic OAuth + OAuth 2.1 provider plugin + MCP-AID | OAuth providers + custom plugins | MCP-AID device auth plugin | Library | n/a | **Strong fallback** if memroos wants zero SaaS dependency. Active dev, absorbed Auth.js. |
| **Ory Hydra** | Apache-2.0 | [ory/hydra](https://github.com/ory/hydra) | 17.2k | 2026-06-09 | Yes — OAuth 2.0/OIDC server, refresh | None (protocol server) | None | Yes (Go binary, ~5MB) | OSS = free | Wrong layer: low-level OAuth/OIDC *server*. Use only if memroos wants to be an OAuth provider itself. |
| **Ory Kratos** | Apache-2.0 | [ory/kratos](https://github.com/ory/kratos) | (large) | 2026 | N/A — identity, not OAuth | N/A | N/A | Yes | OSS = free | Wrong fit: identity (user login) layer. |
| **Keycloak** | Apache-2.0 | [keycloak/keycloak](https://github.com/keycloak/keycloak) | 35.7k | 2026-07-16 | Yes — OAuth2/OIDC + social identity broker | Built-in social brokers | None | Yes — heavyweight JVM | OSS = free | Wrong fit: full IdP for *user* login. Heavyweight. |
| **Logto** | MPL-2.0 | [logto-io/logto](https://github.com/logto-io/logto) | 11.9k | 2026-04-03 | Yes — OIDC/OAuth 2.1 + SAML, social connectors | Connector list | "Works out-of-the-box for MCP" | Yes — OSS | OSS = free | Plausible. Closer fit than Keycloak but still user-identity, not tool-auth. |
| **SuperTokens** | Apache-2.0 core + commercial `ee/` | [supertokens/supertokens-core](https://github.com/supertokens/supertokens-core) | 15.1k | 2026 | Yes — OAuth, refresh | Built-in providers | None | Yes | OSS core free; `ee/` commercial | Wrong fit: user auth. |
| **WorkOS** | Proprietary SaaS | [github.com/workos](https://github.com/workos) | n/a | 2026 | Yes — SSO/SAML/SCIM | Enterprise IdPs, not "tools" | None | No | n/a | Wrong fit: enterprise SSO/identity, not tool auth. |
| **Clerk** | Proprietary SaaS | [github.com/clerk](https://github.com/clerk) | n/a | 2026 | Yes — OAuth providers | Built-in social providers | None | No | n/a | Wrong fit: user login, not tool auth. |
| **Auth0** | Proprietary SaaS | [github.com/auth0](https://github.com/auth0) | n/a | 2026 | Yes — OAuth providers | Built-in social providers | None | No | n/a | Wrong fit: user login, not tool auth. |
| **BoxyHQ** | Apache-2.0 (Jack) | [boxyhq/saas-starter-kit](https://github.com/boxyhq/saas-starter-kit) | (modest) | 2026 | SAML/SSO focused | None | None | Yes | OSS = free | Wrong fit: SSO/SAML for enterprise customers. |
| **Huginn** | MIT | [huginn/huginn](https://github.com/huginn/huginn) | ⚠ (uncertain) | 2026 | Some OAuth via custom agents | Custom agents only | None | Yes — Ruby | OSS = free | Wrong layer: agent/automation in Ruby. |
| **Scalekit** ⚠ *NEW* | Proprietary SaaS | (not extracted) | n/a | 2026 | Yes — OAuth + API key for agent-tool use cases | (not extracted) | Partial | No | (not extracted) | Worth evaluating if memroos goes SaaS-first; not researched in depth. |
| **Stytch Connected Apps** ⚠ *NEW* | Proprietary SaaS | (not extracted) | n/a | 2026 | Yes — Connected Apps product | (not extracted) | None | No | (not extracted) | Worth evaluating; not researched in depth. |
| **Descope Outbound Apps** ⚠ *NEW* | Proprietary SaaS | (not extracted) | n/a | 2026 | Yes — Outbound Apps product | (not extracted) | None | No | (not extracted) | Worth evaluating; not researched in depth. |

## Recommendation (v2 — operator-constrained)

**Primary recommendation: ship a Memroos-native tool-auth plane backed by Nango (hosted free tier) for ≤10-user installations, with the option to switch to Klavis (self-hosted MCP-first) if memroos's MCP story becomes the dominant axis.**

**Why Nango for the ≤10-user case:**

1. **Exact problem-space match.** Nango is purpose-built for "manage OAuth + API-key auth for 900+ third-party APIs in a multi-tenant SaaS." That's literally the auth-UX problem memroos has for *its own tools*.
2. **Catalog coverage.** 900+ APIs already configured (auth endpoints, refresh, scopes, quirks).
3. **Embeddable white-label UI.** Nango ships a "Connect UI" that drops into the memroos settings page with memroos branding.
4. **Free tier exactly fits the 10-user constraint.** 10 connections + 100k proxy requests/month covers any single-installation pilot. Starter at $50/month kicks in if any one memroos installation crosses 10 connected tools.
5. **Token storage integration.** Nango stores credentials encrypted; memroos's existing AES-256-GCM vault can be the local-of-record for the OAuth refresh tokens and Nango can be the orchestration layer above it.
6. **License is fine for this use case.** ELv2's managed-service clause applies to memroos reselling Nango features to its customers — out of scope for v8.23 (memroos is per-installation; no "Nango-as-a-service" exposure). For installations that later demand self-host + on-host credential custody, Klavis (below) is the OSS MCP-first swap candidate.
7. **Operator signal.** Luis already created a Nango API key in 1Password, signaling commitment to this direction.

**Why Klavis is the swap candidate (not the primary today):**

- **MCP-first by design** — `klavis.ai` is literally an MCP integrations platform. Strata MCP server aggregates multiple tools. Strongest fit for memroos's actual axis (MCP tools).
- **OSS (Apache-2.0)** — satisfies any future OSI-purity requirement.
- **Self-hostable with API key** — supports `SKIP_OAUTH=true` mode with manual `AUTH_DATA` for cases where memroos wants on-host tokens.
- **Smaller catalog (100+ vs 900+)** — the reason it's not the primary today. If memroos finds Klavis's 100-server catalog sufficient for its integration roadmap, swap becomes a configuration change.

**Trade-offs the operator accepts:**

- **Tokens off-host for Nango-hosted mode.** Refresh tokens live at `api.nango.dev`. memroos's vault stores a Nango connection-id reference + proxy metadata, not the raw OAuth tokens. If on-host token custody ever becomes a hard requirement, Klavis self-host or Nango self-host (Enterprise) is the path.
- **Hosted-Nango callback URL.** Public HTTPS callback required. Memroos already has `MEMROOS_PUBLIC_BASE_URL` so a 308-redirect to `api.nango.dev/oauth/callback` is straightforward.
- **No self-hosted Nango at the free tier.** Self-hosted Nango free = Auth + Proxy only (no Functions, no Webhooks, no MCP server). Hosted Nango Free = full product minus enterprise features.

**Fallback if OSS-purity becomes a hard requirement: Klavis (self-hosted) or Better Auth + custom providers registry.**

- Klavis: OSS, MCP-first, self-hostable. **Recommend over Better Auth because Klavis is exactly this problem space.**
- Better Auth + custom registry: high effort (~2-3 person-months to build the catalog). Only justified if memroos needs zero external runtime dependency AND Klavis is also rejected.

**Rejected alternatives** (so the operator knows what was considered and why):

- **Composio** — strongest alternative. Generous free tier. Best growth-pricing curve. MIT SDK. But managed OAuth is hosted-only (no self-host), and "token custody off-host" is the same trade-off as Nango. Difference: Nango fits 10 connections exactly; Composio fits 20K tool calls which is a different unit and harder to model at the per-installation level.
- **Arcade.dev** — beautiful MCP-first design (`requires_auth=GitHub(scopes=[...])`), but managed auth runtime is closed-source Arcade Cloud. Same external-dependency concern as Nango with less mature product.
- **Pipedream Connect** — Source Available License forbids competitive SaaS reuse.
- **n8n / Activepieces / ToolJet** — workflow / internal-tools builders, wrong layer.
- **Auth.js / NextAuth** — maintenance mode; redirected to Better Auth.
- **Keycloak / Ory Hydra / Logto / SuperTokens** — IdP / user-identity products, wrong layer.
- **WorkOS / Clerk / Auth0 / Stytch / Descope / Scalekit** — not researched in depth; flagged as worth evaluating if memroos goes SaaS-first with paid-tier user auth requirements that exceed what Nango/Composio provide.

## Draft roadmap phase block (v2 — implementation-agnostic)

```
## v8.23 Third-Party Tool Authentication Plane

### Phase 179 — Third-Party Tool Authentication Plane

**Goal:** Ship a per-installation, embeddable UX where an operator can connect memroos to third-party tools via OAuth or API key, with token refresh, credential storage in memroos's existing AES-256-GCM vault, and a stable surface for future integrations to consume instead of re-implementing auth each time.
**Depends on:** v8.20 Phase 176 (CONNMEM proven for Linear/Circleback), v8.22 Phase 178 (MEMCLIP proven for Paperclip tool-connection model), FLEET-22 secrets path
**Requirements:** TOOLAUTH-01, TOOLAUTH-02, TOOLAUTH-03, TOOLAUTH-04, TOOLAUTH-05, TOOLAUTH-06, TOOLAUTH-07, TOOLAUTH-08

**TOOLAUTH requirement definitions:**
- TOOLAUTH-01 — Per-installation provider registry (JSON/YAML) with auth URL, token URL, scopes, refresh policy.
- TOOLAUTH-02 — "Connected Tools" settings page at `apps/memroos/src/app/settings/tools` with Connect UI for each registered provider.
- TOOLAUTH-03 — OAuth flow handler that stores refresh tokens in the AES-256-GCM vault (`MEMROOS_VAULT_KEY_PATH`).
- TOOLAUTH-04 — API-key flow handler that stores keys in the same vault.
- TOOLAUTH-05 — `tool_auth.getCredentials(provider, scope)` API for MCP tools to resolve tokens uniformly. No adapter calls an external OAuth library directly.
- TOOLAUTH-06 — Token refresh + failure observability (audit row + NOC dashboard tile).
- TOOLAUTH-07 — Revocation flow with webhook dispatch.
- TOOLAUTH-08 — Backfill connector: existing Phase 176 (Linear/Circleback) and Phase 178 (Paperclip) consumers migrated to the new plane.

**Success criteria:**
1. "Connected Tools" page exists with a Connect UI for at least 3 providers (initial set: Linear, Circleback, GitHub — the Phase 176 + Phase 178 immediate consumers). Adding a 4th-10th provider requires only a registry entry, no new code.
2. Phase 176 (CONNMEM-04..07) and Phase 178 (MEMCLIP-02..04) consumers migrated to the new plane and cite this phase in their requirement IDs.
3. MCP tools (`apps/memroos/src/lib/l3/adapters/{slack,hubspot,quickbooks,...}`) resolve tokens via the single `tool_auth.getCredentials()` API. Zero direct external OAuth library imports in adapters.
4. Token refresh is automatic and observable. Failed refresh emits a structured audit row and a NOC dashboard tile.
5. Operator can revoke a connection from settings; revocation triggers a webhook to memroos and clears the vault entry. Re-authorization is one click.
6. Cost at 10 users per installation is $0/month (free tier covers); cost at 50 users per installation is documented and paid by the customer, not by memroos.
7. OAuth + API-key hybrid supported (not OAuth-only). API-key path validated against at least one non-OAuth provider (e.g., a legacy CRM).
8. Provider swap path documented (e.g., Nango → Klavis) at the configuration layer, not the application layer.

**Source opinion:** `.planning/spikes/2026-07-23-tool-auth-ux-research.md` + `.planning/spikes/2026-07-23-tool-auth-ux-validation.md` + `.planning/design/2026-07-23-connected-tools-ux-design.md` (Kimi K2.7 Code UX design spec for the `/settings/tools` page).

**Out of scope (v8.23):**
- Building a SaaS offering on top of the tool-auth plane (memroos stays per-installation).
- Replacing the existing user-login auth (`/api/auth/*`).
- Federated multi-memroos tool sharing.
- OSI-strict OSS self-host at scale (Klavis self-host remains a future swap candidate, not v8.23 deliverable).
- Memroos becoming an OAuth server itself for agents (separate concern; tracks via Better Auth `@better-auth/oauth-provider` or Ory Hydra if pursued).

### Progress Table (v8.23 Third-Party Tool Authentication Plane)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 179. Third-Party Tool Authentication Plane | 0/? | Planned | — |
```

## Open questions for Luis

1. **Implementation pick.** Spike recommends Nango (hosted free tier for ≤10 users) with Klavis as swap candidate. Phase block is implementation-agnostic. **Confirm Nango is the primary for Phase 179**, or flag if Klavis should be the primary (would require a 1-week prototype to validate the smaller catalog is enough).
2. **Self-host trigger.** At what customer count / industry / compliance requirement does memroos commit to self-host Nango (or swap to Klavis)?
3. **API-key parity.** Phase 179 scope now includes API-key support (TOOLAUTH-04). Validate that's still the intent (vs OAuth-only).
4. **Memroos-as-OAuth-server.** Should memroos also become an OAuth provider for its own agent fleet (via Better Auth's `@better-auth/oauth-provider`)? Separate, complementary decision — not blocking for tool-auth but worth sequencing.

## Sources (current as of 2026-07-23)

- Composio: [github.com/ComposioHQ/composio](https://github.com/ComposioHQ/composio), [composio.dev/pricing](https://composio.dev/pricing), MIT
- Nango: [github.com/NangoHQ/nango](https://github.com/NangoHQ/nango), [nango.dev/pricing](https://nango.dev/pricing), [nango.dev/docs/guides/platform/self-hosting](https://nango.dev/docs/guides/platform/self-hosting), Elastic License v2; license discussion in [issue #900](https://github.com/NangoHQ/nango/issues/900)
- Klavis AI: [github.com/Klavis-AI/klavis](https://github.com/Klavis-AI/klavis), [klavis.ai](https://www.klavis.ai), [klavis.ai/home/api-keys](https://www.klavis.ai/home/api-keys); license TBD (likely Apache-2.0, requires LICENSE file check)
- Arcade.dev: [github.com/ArcadeAI/arcade-mcp](https://github.com/ArcadeAI/arcade-mcp), [docs.arcade.dev](https://docs.arcade.dev), MIT
- Pipedream: [github.com/PipedreamHQ/pipedream](https://github.com/PipedreamHQ/pipedream), Source Available License
- n8n: [github.com/n8n-io/n8n](https://github.com/n8n-io/n8n), Sustainable Use License
- ToolJet: [github.com/ToolJet/ToolJet](https://github.com/ToolJet/ToolJet), AGPL-3.0
- Activepieces: [github.com/activepieces/activepieces](https://github.com/activepieces/activepieces), MIT + commercial `ee/`
- Auth.js: [github.com/nextauthjs/next-auth](https://github.com/nextauthjs/next-auth), ISC; [transition announcement](https://github.com/nextauthjs/next-auth/discussions/13252) — now part of Better Auth
- Better Auth: [github.com/better-auth/better-auth](https://github.com/better-auth/better-auth), MIT confirmed
- Ory Hydra: [github.com/ory/hydra](https://github.com/ory/hydra), Apache-2.0
- Keycloak: [github.com/keycloak/keycloak](https://github.com/keycloak/keycloak), Apache-2.0
- Logto: [github.com/logto-io/logto](https://github.com/logto-io/logto), MPL-2.0
- SuperTokens: [github.com/supertokens/supertokens-core](https://github.com/supertokens/supertokens-core), Apache-2.0 + commercial `ee/`
- WorkOS / Clerk / Auth0 / Stytch / Descope / Scalekit: flagged for future evaluation
- BoxyHQ: Apache-2.0 (Jack)
- Huginn: MIT (last activity uncertain)
- Memroos local context: `apps/memroos/src/lib/operator-auth.ts`, `docs/secrets-and-durability.md`, `.planning/ROADMAP.md` (Phase 176 / 178), `.planning/seeds/agent-fleet-plane-2026-07-08.md`

## Methodology notes

- Used **Exa MCP** for primary web search (rich results: stars, license, last push date, pricing) and **Bing RSS** (`web_search`) as fallback. Exa's free tier rate-limited after ~6 successful calls; Bing RSS is noisy for technical queries.
- Used the **direct MiniMax API lane** for one initial MiniMax-M3 worker attempt — that call tried to use bash tools via pseudo-XML and failed; corrected by having the orchestrator (me) do the research directly using `web_search` + Exa MCP. Lesson recorded in `.learnings/BEASTMODE.md`.
- Did not run any code changes. This is a research spike ending with a roadmap entry; no `git commit`, no `npm install`, no `.env` mutation.

## Status

**v2 — roadmap-ready.** Phase 179 block is implementation-agnostic and the operator constraint (≤10 users free, pay above) is explicit. After Luis confirms the implementation pick (Nango primary vs Klavis primary), the orchestrator will append the draft phase block to `.planning/ROADMAP.md` under `## v8.23 Third-Party Tool Authentication Plane`.