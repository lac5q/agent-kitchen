---
name: memroos-oauth-alert-routing-rca-2026-08-09
title: MemroOS Cordant Google OAuth and legacy alert-routing RCA
description: Live verification of Cordant Google OIDC and root-cause analysis of unexpected MemroOS alert email delivery.
publishedAt: 2026-08-09T05:55:00Z
tags:
  - memroos
  - oauth
  - cordant
  - alerts
  - incident-response
keywords:
  - Google OAuth
  - Cordant
  - SendGrid
  - Main-Mac
  - alert opt-in
author: codex-gpt-5.6
source_session: 019fdac3-ab4e-7a21-bbef-f37ee440470a
model: gpt-5.6
sources:
  - live public OAuth status and redirect probes
  - live SendGrid message metadata queried without message bodies
  - Cordant and Oracle host environment key-presence checks
  - Main-Mac launchd and checkout inspection
  - repository commit 8a18ae44
derived_from:
  - user-reported missing Cordant Google sign-in
  - user-reported unexpected MemroOS alert email
regen_prompt: Re-run public OAuth status/start probes, host alert-recipient checks, and recent SendGrid metadata without printing credentials or message bodies; compare against the alert opt-in contract.
---

# Findings

## Google OAuth

Cordant and Oracle both report `{"configured":true,"reason":null}`. Cordant's start route returns HTTP 302 and carries the exact callback `https://memroos-cordant.epiloguecapital.com/api/auth/google/callback`. Public health is HTTP 200 on both instances. The login page discovers availability client-side through `/api/auth/google/status`; a static HTML fetch will not contain the button until hydration completes. The signed-in Google consent/session assertion still requires the operator's interactive browser consent.

## Alert email root cause

Recent SendGrid metadata showed the MemroOS messages were sent by the Main-Mac `com.memroos.memory-healthcheck` launchd job from `alerts@memroos.com` to the legacy `luis@epiloguecapital.com` alias. A second pair was an older Oracle health-check alert using the same legacy recipient. There was no direct MemroOS recipient of `luis.calderon@cordant.ai`; forwarding/aliasing explains the Cordant mailbox delivery. No new MemroOS messages appeared after the production alert-sink containment.

## Remediation

- Cordant and Oracle retain SendGrid credentials for explicitly opted-in notifications but have empty `ALERT_EMAIL`/ `MEMROOS_ALERT_EMAIL` host-profile recipients; health failures remain in logs/syslog.
- The legacy local healthcheck now ignores historical `ALERT_EMAIL_TO` and `ALERT_EMAIL` values and only reads `MEMROOS_ALERT_EMAIL`.
- Main-Mac's active launchd checkout was updated to the same fail-closed recipient rule; its SendGrid key is disabled.
- Regression, shell syntax, public deployment, health, and liveness checks passed. The broader degradation runner still reports the pre-existing missing QMD recall fixture, which remains an open ANN/indexing item.

## Reproduction/verification

- `GET https://memroos-cordant.epiloguecapital.com/api/auth/google/status` → configured true.
- `GET https://memroos-cordant.epiloguecapital.com/api/auth/google` → 302 to Google with Cordant callback.
- `GET https://memroos-cordant.epiloguecapital.com/api/health` → 200.
- `bash services/memory/tests/test_healthcheck_policy.sh` → pass.
- `bash scripts/verify-onboarding-deploy.sh` → pass (public probes; loopback intentionally skipped).
- Cordant and Oracle health/liveness scripts → exit 0.


## Follow-up hardening (2026-08-09)

The remaining profile-conformance cron path was hardened in repository commit `d6ae215f` and deployed to both operator hosts. It now accepts only the canonical `MEMROOS_ALERT_EMAIL` opt-in and ignores legacy `ALERT_EMAIL`/ `ALERT_EMAIL_TO` aliases. A regression fixture proves a legacy profile recipient cannot trigger SendGrid delivery even when a SendGrid key is present. The Main-Mac memory environment was backed up and its stale `ALERT_EMAIL_TO` entry replaced with an empty `MEMROOS_ALERT_EMAIL`.

Post-deploy evidence:
- Cordant and Oracle checkouts are at `d6ae215f` and clean.
- Cordant and Oracle health-check and scheduler-liveness runs exit 0.
- Public Google OAuth status is configured on both hosts; both start routes redirect to Google with the correct host-specific callback.
- Public onboarding verifier exits 0.


## 2026-08-09 — Post-deploy browser verification and recipient hardening

- Source commit `3241d858` adds an explicit empty-recipient guard to the legacy `services/memory/healthcheck.sh` SendGrid path; the policy regression test now asserts the guard.
- The same guard was applied to the active Main-Mac checkout after creating a recoverable timestamped backup. Main-Mac reports an empty `SENDGRID_API_KEY` and empty `MEMROOS_ALERT_EMAIL`.
- Cordant-hermes-01 and oracle-1 rebuilt/restarted from `3241d858`; both source checkouts are clean.
- Browser smoke against both public login pages found a visible `Continue with Google` link and `/forgot-password`. Clicking Google reached `accounts.google.com` with the exact host callback:
  - Cordant: `https://memroos-cordant.epiloguecapital.com/api/auth/google/callback`
  - Oracle: `https://memroos.epiloguecapital.com/api/auth/google/callback`
- Public checks after deployment: onboarding invalid-token and signature-error cases returned 403; `/api/health` returned 200; `/api/auth/google/status` returned `configured:true` on both hosts.
- Conclusion: Google OAuth was a stale/pre-hydration display issue, not missing runtime configuration. The unwanted alert route was the historical Main-Mac alias; health-check email is now opt-in and cannot send without an explicit recipient. Interactive Google account consent remains an operator/browser action.
