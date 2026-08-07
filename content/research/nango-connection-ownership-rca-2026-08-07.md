---
name: "nango-connection-ownership-rca-2026-08-07"
title: "Nango connection ownership RCA and fail-closed fix"
description: "Root-cause record for cross-user Nango connection materialization and the local ownership verification patch."
publishedAt: "2026-08-07"
tags: [memroos, security, nango, oauth, governance]
keywords: [end_user, ownership, tool_connections, OAuth callback, shared connection]
author: "Codex"
source_session: "019fdac3-ab4e-7a21-bbef-f37ee440470a"
model: "gpt-5.6"
sources:
  - "https://docs.nango.dev/reference/api/connect/sessions/create"
  - "https://docs.nango.dev/guides"
  - "repo:/home/lac5q/github/memroos-product/apps/memroos/src/lib/tool-auth/tool-connections.ts"
  - "repo:/home/lac5q/github/memroos-product/apps/memroos/src/app/api/tools/connect/oauth/callback/route.ts"
derived_from:
  - "content/research/connmem-runtime-luna-preflight-2026-08-07.md"
regen_prompt: "Re-audit the Nango OAuth callback and local tool-connection scope against current Nango end-user authorization semantics and the repository ownership tests."
---

# RCA

## Root cause

The authenticated OAuth callback accepted a browser-supplied Nango connection id without verifying its Nango end-user identity. Separately, the visible connection-list chokepoint imported every connection returned by the Nango installation-wide list and inserted unknown rows as admin-owned, shared, and needs-owner. This combined an installation-wide provider list with tenant/user visibility and could expose another user's connection to viewers or system workers.

Nango documents connections as user-level or organization-level authorization and requires the application to store the connection id for later use. The Nango connect-session request carries an explicit end_user identity; that identity is the ownership proof the callback must reconcile.

## Fix

- The callback now reconciles the returned connection id and provider against Nango's live list and requires end_user.id to equal the authenticated MemroOS user id before persisting.
- The callback uses Nango-owned account metadata rather than trusting browser-supplied account email.
- The connection-list chokepoint no longer materializes unknown Nango rows as shared. It only refreshes metadata for rows already created by an authenticated callback or explicit migration.
- Regression tests cover foreign-owner rejection, verified metadata, and the no-unowned-import invariant.

## Verification

- Tool-auth, Nango-client, ownership-route, and callback tests: 25 passed.
- Typecheck: passed.
- Targeted ESLint: passed.
- Local commits: f856a070 (security fix), 630b83b3 (adoption telemetry prerequisite).
- Production rollout and live Nango reconciliation remain pending explicit GO.
