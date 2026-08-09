---
name: "memroos-connector-oauth-failure-rca-2026-08-08"
title: "MemroOS connector OAuth failure RCA and recovery"
description: "Root-cause analysis and deployment record for connector OAuth HTML errors, Circleback hangs, and the Pi Agent integration report attribution."
publishedAt: "2026-08-08"
tags: [memroos, connectors, oauth, rca, pi-agent, production]
keywords: [Nango, OAuth, Circleback, HTML parser error, popup blocked, Pi Agent]
author: "Codex director"
source_session: "019fdac3-ab4e-7a21-bbef-f37ee440470a"
model: "gpt-5.6"
sources:
  - "repo:apps/memroos/src/app/api/tools/connect/oauth"
  - "repo:apps/memroos/src/components/settings/ConnectedToolsPage.tsx"
  - "repo:.planning/ROADMAP.md"
  - "repo:.planning/STATE.md"
derived_from:
  - ".planning/ROADMAP.md"
  - ".planning/STATE.md"
regen_prompt: "Re-run the connector OAuth smoke tests on Oracle and Cordant, inspect the route and UI error handling, and update this RCA with any new provider or Nango findings."
---

# RCA

## Incident

The settings connector page showed `Unexpected token '<', "<!DOCTYPE ..."` for Slack, Google, Drive, Gmail, GitHub, and other OAuth providers. Circleback could remain in a loading state. The browser received an HTML proxy error from `/api/tools/connect/oauth`, while the UI assumed every response was JSON.

The supplied integration transcript is attributed to the **Pi Agent**, not Prime Agent. It reported successful onboarding, authenticated health/memory checks, loopback mailbox tests, and security rejection tests; it also reported missing episodic-memory capability, MCP OAuth mismatch, and infrastructure symptoms. No credentials were included in the report.

## Root cause

1. The OAuth route handled typed Nango failures but allowed untyped network/fetch failures to escape. The proxy then returned an HTML 502 page.
2. The settings client called `response.json()` unconditionally, so an HTML error became the parser exception shown in the screenshot.
3. Popup-blocked flows did not always clear the pending state, which made a provider appear to hang.
4. Local development has no `NANGO_SECRET_KEY` in `apps/memroos/.env.local`; production hosts do have a Nango key and twelve provider configurations. The local missing key is therefore a configuration gap, not a connector-provider implementation failure.

## Remediation shipped

Commit `09082336`:

- Normalize unknown route exceptions to a stable JSON 502 response with `error: nango_connect_failed`, a safe message, and `retryable: true`.
- Parse connector responses as text first, then JSON when possible; preserve actionable HTTP/status text for HTML or empty responses.
- Clear the pending state when a popup is blocked and tell the operator to allow popups.
- Add route tests covering typed and untyped Nango failures.
- Rebuild and restart Oracle and Cordant; host-local required-service and onboarding verifiers pass.
- Public smoke passes for `/api/health`, invalid onboarding-token 403, `/forgot-password`, and `/reset-password/*`.

## Verification

- OAuth route plus callback tests: 4/4 passed.
- MemroOS workspace typecheck and lint: passed.
- Root launcher/knowledge guard tests: passed.
- Oracle and Cordant Nango `/info`: HTTP 200; twelve integrations configured on each host.
- Production runtime images rebuilt from `09082336`; both services healthy.

## Remaining actions

- Add a local Nango secret through the operator's 1Password service-account/session and restart the local app; never commit the secret.
- Complete provider backfill/reconciliation and configure the Connmem adapter registry.
- Obtain the LangSmith data-plane trace-writer role/key; control-plane access works but trace POST remains 401.
- Complete centralized knowledge-plane remote-first and cross-box proof (Phase 238); the local root guard is only the regression slice.
- Keep Pi/Prime attribution separate in future onboarding reports.
