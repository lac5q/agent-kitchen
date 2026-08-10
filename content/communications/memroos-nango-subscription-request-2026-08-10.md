---
name: "memroos-nango-subscription-request-2026-08-10"
title: "MemroOS Nango subscription request"
description: "Email draft and technical context requesting a paid Nango.dev subscription for Cordant's agent-memory product."
publishedAt: "2026-08-10"
tags: [communications, memroos, nango, connected-tools]
keywords: [Nango, MemroOS, agent memory, OAuth, API keys, connections, Composio, Cordant]
author: "Codex"
source_session: "2026-08-10"
model: "gpt-5"
sources:
  - "connected-email: Temporary access for Cordant Memory integrations"
  - "connected-email: Could you enable custom connectors for Eric in Claude Cowork?"
  - "repo: apps/memroos/src/lib/tool-auth/nango-client.ts"
  - "repo: docs/connmem-runtime.md"
  - "repo: .env.example"
  - "repo: .planning/ROADMAP.md"
  - "official pricing: https://nango.dev/pricing"
  - "gmail-profile: connected account returned luis@epiloguecapital.com"
derived_from: []
regen_prompt: "Using the current MemroOS connection/auth implementation, official Nango pricing, and recent Cordant email context, refresh the concise Nango subscription request and its technical rationale without including secrets or internal host topology."
---

## Request

Ask Lior for help purchasing a paid Nango.dev subscription for the agent-memory product being built for Cordant. Eric suggested reaching out to Lior for purchasing help. The product is known to the recipients in concept; MemroOS is the implementation name. The current trial/free allocation is capped at 10 connections and has been exhausted.

## Plan sizing

Nango's current pricing page lists the Starter plan from $50/month with 20 API-auth connections included and additional connections at $1 per connection. Nango defines a connection as one authorized user account, so 20 connections is not automatically 20 users if each user connects multiple systems. For the initial rollout, 20 is a reasonable target because it provides a 2x buffer over the exhausted 10-connection free tier while adoption is measured; usage should be monitored and the plan upgraded if needed.

Source: [Nango pricing](https://nango.dev/pricing)

## Email draft

Requested sender: Luis Calderon <luis.calderon@cordant.ai>  
To: Lior Levit <lior@cordant.ai>  
Cc: Juan Huezo <juan@cordant.ai>; Eric Rosenthal <eric@cordant.ai>  
Subject: Request: Nango.dev subscription for MemroOS

Hi Lior,

Eric suggested I reach out to you for help purchasing a Nango.dev subscription for MemroOS, the agent-memory product I’ve been building for Cordant.

Nango is the connection layer for the product—it handles OAuth/API-key setup, token refresh, and the connection lifecycle as we connect the systems MemroOS needs to work with. I’ve now maxed out the Nango trial/free license at 10 connections, and we’ll need more as we ramp up users.

I checked Nango’s current pricing. The Starter plan is listed from $50/month and includes 20 API-auth connections; additional connections are $1 per connection. Nango counts each authorized user account as one connection, so this is not automatically equivalent to 20 users if each user connects multiple systems. That seems like a reasonable initial capacity because it gives us a 2x buffer over the 10-connection free-tier limit while we measure adoption. [Nango pricing page](https://nango.dev/pricing)

Could you help me purchase that plan? I’m open to an alternative if there’s a better fit on cost or deployment, but my preference is not to build this from scratch. Provider authentication, token refresh/revocation, scopes, secure credential handling, and multi-user connection management are a complicated surface to own. I also explored Composio; Nango is my preference because it fits the connection layer already wired into MemroOS and offers an on-prem option if we want that in the future.

I attached a short technical overview with more detail: [MemroOS + Nango technical context](https://docs.google.com/document/d/1aQYNOmjkF2XjAFk9-ALdRB7fvgB4yc3F_F41GQWcosM/edit)

Thanks,
Luis

## Technical rationale

- MemroOS already has a connection/authentication plane for OAuth and API-key connections, including a Nango client, provider registry, credential store, and user-facing connection lifecycle.
- Connected-memory adapters cover Linear, Circleback, and Notion with bounded sync, a sync ledger, downstream recall, and ownership/sharing/retention/deletion controls.
- The Nango boundary keeps provider-specific OAuth setup, refresh, credentials, scopes, revocation, retries, and error handling out of the core product.
- Composio was considered as an alternative. The preference for Nango is based on its fit with the existing MemroOS path, hosted capacity now, and a self-hosted/on-prem option later.
- Building an equivalent connection layer in-house would create a large ongoing maintenance and security surface.
- No credentials, secrets, or internal host topology are included in the request or technical note.

## Current draft status

- Gmail draft is saved unsent and includes the refreshed DOCX export attachment plus the Google Doc link.
- The requested sender address was supplied to the Gmail draft update, but the connected Gmail profile is luis@epiloguecapital.com; Gmail normalized the draft’s actual From header to that account.
- A Cordant mailbox or configured alias must be connected before this can genuinely send from luis.calderon@cordant.ai.

## Artifacts

- Google Doc: https://docs.google.com/document/d/1aQYNOmjkF2XjAFk9-ALdRB7fvgB4yc3F_F41GQWcosM/edit
- Gmail draft: subject “Request: Nango.dev subscription for MemroOS”; saved unsent with a DOCX export attached.


## Sender shim diagnosis — 2026-08-10

- The Gmail app connector is authenticated as `luis@epiloguecapital.com`; setting `from_address` to `luis.calderon@cordant.ai` on the existing draft is accepted but Gmail normalizes the saved From header back to the epilogue account.
- The local Google Workspace (`gws`) shim is authenticated as `luis.calderon@cordant.ai`; `users.getProfile` returns that address and Gmail Send-As settings report it as the primary identity.
- The current shim token has Gmail read-only scopes, so compose authorization is required before creating or sending a Cordant draft. OAuth compose authorization was initiated but is waiting for browser consent.
- No message has been sent. Before sending, the final To/Cc/body must be shown and the user must explicitly say GO.


## Permanent gws shim repair — 2026-08-10

- Changed `~/.local/bin/gws` to route through the existing `gws-account` multi-account wrapper instead of bypassing it via `gws-real`.
- Changed `~/.config/gws/accounts.json` default from `luis@epiloguecapital.com` to `luis.calderon@cordant.ai`.
- Verified the repaired `gws` path resolves Gmail profile and Send-As identity to `luis.calderon@cordant.ai`.
- The per-account OAuth token still has `gmail.readonly` but not `gmail.compose`; a one-time compose-scope consent is active at the time of this note. Once approved, the scope is stored in the Cordant account credentials and should stop recurring prompts.


## Finalized OAuth, routing, and draft verification — 2026-08-10

- Wrapper-bound OAuth consent completed for `luis.calderon@cordant.ai` with `gmail.compose`, `gmail.readonly`, profile, email, and OpenID scopes.
- `gws auth status`, Gmail profile, and Send-As verification all resolve to `luis.calderon@cordant.ai`; the Cordant Send-As identity is primary/default.
- Hardened `~/.local/bin/gws-account`: the `gws` entrypoint remains routed through the multi-account wrapper; Cordant is the resilient default when configured, while `--account` and `GOOGLE_WORKSPACE_CLI_ACCOUNT` continue to select Gmail or Epilogue explicitly.
- Hardened account switching so interrupted OAuth preserves real credential files and token caches are retained per account after API calls.
- Verified explicit account routing against the existing Epilogue and Gmail credentials without sending mail.
- Created and read back a new unsent Cordant Gmail draft with the requested From/To/Cc/Subject, exact body, Google Doc link, and DOCX attachment. No email has been sent; explicit GO remains required.
