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
