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
  - "gmail-profile: connected account returned luis@epiloguecapital.com"
derived_from: []
regen_prompt: "Using the current MemroOS connection/auth implementation and recent Cordant email context, refresh the concise Nango subscription request and its technical rationale without including secrets or internal host topology."
---

## Request

Request approval for a paid Nango.dev subscription for the agent-memory product being built for Cordant. The product is known to the recipients in concept; MemroOS is the implementation name. The current trial/free allocation is capped at 10 connections and has been exhausted; more capacity is needed as Cordant ramps up users.

## Email draft

Requested sender: Luis Calderon <luis.calderon@cordant.ai>  
To: Lior Levit <lior@cordant.ai>  
Cc: Juan Huezo <juan@cordant.ai>; Eric Rosenthal <eric@cordant.ai>  
Subject: Request: Nango.dev subscription for MemroOS

Hi Lior,

I’m writing to ask for your help approving a paid Nango.dev subscription for the agent-memory product I’ve been building for Cordant. You’ve seen the product in progress; the name used in the implementation is MemroOS.

Nango is the connection layer for the product — it handles OAuth/API-key setup, token refresh, and the connection lifecycle as we connect more of the systems the product needs to work with. I’ve now maxed out the Nango trial/free license at 10 connections, and we’ll need substantially more as we ramp up users.

Could we approve a Nango plan with enough capacity for the next phase? I’m open to an alternative if there’s a better fit on cost or deployment, but my preference is not to build this from scratch because provider authentication, refresh/revocation, scopes, secure credential handling, and multi-user connection management are a complicated surface to own. I also explored Composio; Nango is my preference because it fits the connection layer already wired into MemroOS and has an on-prem option if we want that later.

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

- Gmail draft is saved unsent and includes the DOCX export attachment plus the Google Doc link.
- The requested sender address was supplied to the Gmail draft update, but the connected Gmail profile is luis@epiloguecapital.com; Gmail normalized the draft's From header to that account.
- A Cordant mailbox or configured alias must be connected before this can genuinely send from luis.calderon@cordant.ai.

## Artifacts

- Google Doc: https://docs.google.com/document/d/1aQYNOmjkF2XjAFk9-ALdRB7fvgB4yc3F_F41GQWcosM/edit
- Gmail draft: subject “Request: Nango.dev subscription for MemroOS”; saved unsent with a DOCX export attached.
