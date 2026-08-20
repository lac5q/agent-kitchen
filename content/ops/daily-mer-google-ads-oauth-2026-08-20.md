---
name: "daily-mer-google-ads-oauth-2026-08-20"
title: "Daily MER Google Ads OAuth and API recovery"
description: "Root cause and verified recovery for Google spend returning zero in the Marketing MER dashboard."
publishedAt: "2026-08-20"
tags: ["operations", "marketing", "google-ads", "oauth", "vercel", "mer"]
keywords: ["Daily MER", "Google Ads", "invalid_grant", "v25", "5597699519", "3758980392", "6340403135"]
author: "Hermes"
model: "gpt-5.6-luna"
sources:
  - "local:~/github/mkt-hub/google-ads-mcp/.env (credential location; secrets not recorded)"
  - "local:~/github/mkt-hub/.env.vercel (deployment environment export; secrets not recorded)"
  - "Google OAuth token endpoint live exchange and refresh recheck on 2026-08-20"
  - "Google Ads REST API v25 live requests on 2026-08-20"
  - "Vercel production health endpoint https://sketchpop-ads-2025.vercel.app/api/mer-data-cached?health=google"
derived_from:
  - "~/github/mkt-hub/06_docs/MER_DASHBOARD_ENV.md"
  - "~/github/mkt-hub/api/_lib/google-ads.js"
regen_prompt: "Recheck the MER Google OAuth token, current Google Ads REST API version, MCC/client-account routing, Vercel production health, and record only non-secret evidence."
---

# Daily MER Google Ads recovery

## Root causes

1. The stored Google Ads refresh token was revoked or expired. Google returned `invalid_grant: Bad Request` for both local credential copies.
2. The MER code used retired Google Ads REST API versions (Python daily script v18; deployed helper v21). Current Google Ads REST API v25 was required; older versions returned HTML 404.
3. The daily Python script queried manager account `5597699519` for metrics. Google rejects metrics on manager accounts with `REQUESTED_METRICS_FOR_MANAGER`; metrics must be requested separately from client accounts.
4. Vercel Hobby deployment initially exceeded the 12 Serverless Function limit because an unused duplicate `api/lib/google-ads.js` was discovered as an extra function.

## Recovery

- Exchanged a user-authorized Google Ads code using the registered redirect URI `http://localhost:8080/` and verified the new refresh token by obtaining a new access token.
- Updated the refresh token in local `google-ads-mcp/.env`, `.env.vercel`, and `.env.production.local`; updated Vercel production environment variable `GOOGLE_ADS_REFRESH_TOKEN`.
- Updated `api/_lib/google-ads.js` and `01_scripts/analysis/daily_mer_last_week.py` to Google Ads REST API v25.
- Updated the daily script to use MCC `5597699519` only as `login-customer-id`, querying TurnedYellow `3758980392` and MakeMeJedi `6340403135` separately.
- Excluded unused `api/lib/` from `.vercelignore` so the production deployment fits the Hobby function limit.

## Verification

Local daily MER run for 2026-08-13 through 2026-08-19 returned Google spend of `$642.81` for TurnedYellow and `$124.49` for MakeMeJedi, totaling `$767.29` locally.

Production focused verification returned HTTP 200 and status `ok`: OAuth access token obtained, TurnedYellow spend `$642.81`, MakeMeJedi spend `$124.49`, combined Google spend `$767.28`, and no API errors.

The repository's broader post-deploy validator still reports a separate pre-existing revenue-gap anomaly on 2026-08-09 and 2026-08-10; that failure is unrelated to Google OAuth and Google spend is now reporting correctly.
