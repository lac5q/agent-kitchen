---
name: memroos-cordant-google-oauth-alert-routing-2026-08-09
title: Cordant Google OAuth and MemroOS alert-routing verification
description: Live verification of Google OIDC runtime configuration and investigation of unwanted MemroOS alert emails.
publishedAt: 2026-08-09T13:26:08Z
tags:
  - memroos
  - cordant
  - google-oauth
  - alerts
  - incident-review
keywords:
  - GOOGLE_CLIENT_ID
  - GOOGLE_CLIENT_SECRET
  - GOOGLE_REDIRECT_URI
  - SendGrid
  - luis.calderon@cordant.ai
author: Codex
source_session: 019fdac3-ab4e-7a21-bbef-f37ee440470a
model: gpt-5.6-luna
sources:
  - live public HTTP probes for Oracle and Cordant
  - Playwright headless browser smoke against Cordant login
  - Docker runtime environment-name checks on oracle-1 and cordant-hermes-01
  - SendGrid Email Activity metadata query from oracle-1
derived_from:
  - .planning/STATE.md
  - docs/production-deployment.md
regen_prompt: Re-run the public OAuth status/start probes, browser button smoke, host runtime-name checks, and SendGrid recipient audit without exposing secrets.
auto_commit: true
---

# Finding

Google OAuth is configured and live on both operator instances. The earlier “not available” screen was a stale/pre-hydration or pre-runtime-config view, not a current missing-credential state.

## Evidence

- https://memroos-cordant.epiloguecapital.com/api/auth/google/status returned HTTP 200 with {"configured":true,"reason":null} and Cache-Control: no-store.
- The Cordant login page rendered one **Continue with Google** button after hydration. A Playwright smoke recorded no page errors and both status requests returned HTTP 200/no-store.
- The Cordant OAuth start route returned HTTP 302 to Google with the exact callback:
  https://memroos-cordant.epiloguecapital.com/api/auth/google/callback.
- The Cordant container has all three Google runtime variable names set; the secret values were not printed. The configured callback was read back as the exact public URL above.
- Oracle returned the same configured status and carries its own exact callback:
  https://memroos.epiloguecapital.com/api/auth/google/callback.

A signed-in Google consent/callback/session smoke remains intentionally operator-gated because this session has no access to the operator’s Google browser session. The public entry and redirect are green.

## Alert investigation

SendGrid Email Activity returned 100 recent messages. The only MemroOS/health messages were six historical deliveries:

- sender alerts@memroos.com or noreply@memroos.com
- recipient luis@epiloguecapital.com
- latest event 2026-08-09T02:27:08Z
- subjects were legacy Main-Mac memory alerts/recovery or Oracle health failures

No returned message targeted luis.calderon@cordant.ai. The production Cordant and Oracle app/container environments have no MEMROOS_ALERT_EMAIL, ALERT_EMAIL, or ALERT_EMAIL_TO recipient. Cordant cron entries explicitly set an empty canonical recipient, and Oracle's current systemd healthcheck has been green with no email environment.

The remaining delivery to the Cordant mailbox is therefore an external alias/forwarding path from the legacy luis@epiloguecapital.com mailbox, or a historical message already in the mailbox. MemroOS no longer has an enabled production recipient for it. Main-Mac is offline/unreachable from this session, so its mailbox alias/forwarding rule cannot be changed here.

## Closure actions

1. Refresh the Cordant /login page with a hard reload; the Google button appears after the no-store status probe.
2. Complete one operator-signed-in Google consent flow to close the final Phase 203 interactive gate.
3. If the old messages continue after the latest SendGrid event, remove or disable the luis@epiloguecapital.com to luis.calderon@cordant.ai forwarding/alias rule in the mail provider; this is outside the MemroOS production hosts.
