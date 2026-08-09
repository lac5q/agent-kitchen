---
name: "memroos-alert-delivery-followup-2026-08-09"
title: "MemroOS alert delivery follow-up and Google OAuth verification"
description: "Follow-up RCA for legacy MemroOS alert mail and live verification that Google OAuth is configured on both production hosts."
publishedAt: "2026-08-09"
tags: [operations, alerts, oauth, production, rca]
keywords: [SendGrid, main-mac, oracle-1, cordant-hermes-01, Google OAuth, alert routing]
author: "Codex"
source_session: "019fd5b9-558f-72f1-9ca4-ac23f294db7e"
model: "gpt-5.6-luna:max"
sources:
  - "Gmail API metadata and message headers for MemroOS alert messages"
  - "https://memroos-cordant.epiloguecapital.com/api/auth/google/status"
  - "https://memroos.epiloguecapital.com/api/auth/google/status"
  - "label:production-host-crontab-and-healthcheck"
derived_from:
  - "content/ops/memroos-cordant-google-oauth-alert-routing-2026-08-09.md"
regen_prompt: "Recheck both production Google OAuth status endpoints, inspect redacted alert recipients and monitor schedules on Oracle and Cordant, and search Gmail for new MemroOS deliveries."
---

# Findings

## Google OAuth

Both production status endpoints returned HTTP 200 with `{"configured":true,"reason":null}` and `Cache-Control: no-store`. Headless Playwright rendered an enabled `Continue with Google` button on both login pages with no page errors. The OAuth start route returned HTTP 302 to Google with the exact host callback:

- Cordant: `https://memroos-cordant.epiloguecapital.com/api/auth/google/callback`
- Oracle: `https://memroos.epiloguecapital.com/api/auth/google/callback`

The only remaining OAuth step is an interactive signed-in Google consent/session smoke; this session has no signed-in browser profile.

## Email root cause

Gmail search and full message headers show the recent MemroOS alerts were delivered by SendGrid from `alerts@memroos.com` or `noreply@memroos.com` to `luis@epiloguecapital.com`. The headers contain `Delivered-To: luis@epiloguecapital.com`; no MemroOS message in the connected mailbox was addressed to `luis.calderon@cordant.ai`. The messages are primarily legacy Main-Mac health-monitor alerts (stale Gmail ingestion, Mem0/embedding failures, and recovery notices), plus one historical Oracle monitor failure. This explains why they may appear in a Cordant mailbox through an external alias/forwarding rule even though the application recipient is the legacy Epilogue address.

## Changes verified

- Cordant cron entries explicitly set an empty `MEMROOS_ALERT_EMAIL=`.
- Oracle health and Connmem services are healthy; the Connmem release gate passes all checks and the ledger is empty.
- Oracle's liveness cron was hardened in place to explicitly set `MEMROOS_ALERT_EMAIL=`, preventing a restored SendGrid key from re-enabling delivery through that watchdog.
- Oracle healthcheck logs are green through the latest run. A Gmail search at 2026-08-09T14:36Z found no MemroOS messages newer than the last historical deliveries.

## Remaining external action

The Main-Mac launchd health monitor and any mailbox alias/forwarding rule cannot be changed from this session: Main-Mac SSH is unavailable and the connected Gmail account is `luis@epiloguecapital.com`, not the Cordant mailbox. The repository healthcheck code now requires the explicit canonical `MEMROOS_ALERT_EMAIL` opt-in and ignores legacy recipient aliases. To eliminate historical Main-Mac deliveries at the source, stop/reconfigure `com.memroos.memory-healthcheck` on Main-Mac or disable the SendGrid key used by that host; then remove any forwarding/alias rule in the Cordant mailbox if those historical messages should not be copied there.
