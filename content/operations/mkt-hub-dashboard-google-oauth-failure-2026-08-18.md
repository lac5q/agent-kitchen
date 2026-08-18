---
title: "MKT Hub MER dashboard Google Ads OAuth failure RCA"
description: "Evidence-backed diagnosis of the Google Ads invalid_grant errors and zero current-period Google spend in the deployed MKT Hub MER dashboard."
publishedAt: "2026-08-18"
tags: ["mkt-hub", "dashboard", "google-ads", "oauth", "rca"]
keywords: ["invalid_grant", "Google Ads", "MER dashboard", "refresh token", "live overlay"]
author: "Codex"
source_session: "codex-2026-08-18-mkt-hub-dashboard"
model: "gpt-5"
sources:
  - "mkt-hub:api/_lib/google-ads.js"
  - "mkt-hub:api/mer-data-cached.js"
  - "mkt-hub:api/mer-data.js"
  - "mkt-hub:content/daily-mer-dashboard.html"
  - "mkt-hub:06_docs/MER_DASHBOARD_ENV.md"
  - "https://sketchpop-ads-2025.vercel.app/api/mer-data-cached?health=google&start=2026-08-18&end=2026-08-18"
  - "https://sketchpop-ads-2025.vercel.app/api/mer-data-cached?start=2026-07-19&end=2026-08-18"
  - "https://sketchpop-ads-2025.vercel.app/api/mer-data?public=true&start=2026-07-19&end=2026-08-18"
derived_from: []
regen_prompt: "Recheck the deployed MER health and data endpoints, inspect the Google OAuth and overlay code paths, and update this RCA with current evidence and remediation status."
---

# MKT Hub MER dashboard Google Ads OAuth failure RCA

## Summary

The dashboard is not receiving current Google Ads data because Google rejects the configured OAuth refresh token during the token exchange. The deployed health endpoint reports `env_developer_token: ok`, `env_oauth: ok`, and the expected MCC login customer ID (`5597699519`), but `oauth_token` fails with HTTP 400 `invalid_grant` / `Bad Request`. The same failure occurs for both store overlays because each store attempts the same shared OAuth exchange.

This is a credential/authorization problem, not a dashboard calculation or Google customer-ID routing problem. The exact Google-side reason is not exposed beyond `invalid_grant`; common causes are a revoked/expired refresh token or a refresh token paired with a different/deleted OAuth client.

## Production evidence (2026-08-18)

- `/api/mer-data-cached?health=google` returned `status: degraded`.
- `env_developer_token` was true, `env_oauth` was true, and the resolved login customer was `5597699519`.
- `oauth_token` failed with `Google OAuth error 400: {"error":"invalid_grant","error_description":"Bad Request"}`.
- Both `google_ty` and `google_mmj` checks were skipped because no access token was available.
- For `2026-07-19` through `2026-08-18`, the cached endpoint returned errors `overlay_google_oauth_mmj`, `overlay_google_oauth_ty`, and `google_overlay_zero`.
- The same range showed combined current-period totals of `$12,051.14` revenue, approximately `$2,338` spend, `google_spend_2026: 0`, and `google_revenue_2026: 0`; the current spend is Meta-only.
- The direct live endpoint also returned `google_oauth: invalid_grant` and zero current Google spend/revenue.

The cached endpoint reported `source: json+live-overlay`; historical values are coming from bundled JSON while the current window is overlaid from Shopify/Meta/Google. Because the Google overlay is unavailable, the current blended MER is computed without Google spend. The displayed `5.15x` current MER is therefore not a true blended MER if Google ads were running.

## Code path

- `api/_lib/google-ads.js:144-162` posts `grant_type=refresh_token` to Google's token endpoint and throws on a non-2xx response.
- `api/mer-data-cached.js:307-325` requests that token for each store and records `overlay_google_oauth_*` when it fails.
- `api/mer-data-cached.js:342-345` skips Google Ads calls when no access token exists.
- `api/mer-data-cached.js:677-681` emits `google_overlay_zero` when Meta has spend but the Google overlay contributes none.
- `api/mer-data.js:261-280` follows the same shared OAuth path for the non-cached endpoint.
- `content/daily-mer-dashboard.html:1117-1128` renders `meta.errors` as the red banner shown in the UI.

The local `.env.production.local` and `google-ads-mcp/.env` credential sets were also tested without printing secret values; both produced the same `invalid_grant` response. That makes a stale/revoked or client-mismatched token the leading explanation for both local and deployed behavior.

## Remediation

1. Reauthorize Google Ads with the OAuth client that is intended for this dashboard, using the existing token-generation flow (`04_configurations/get-google-ads-token.js`) or the approved Google OAuth flow.
2. Keep the new refresh token paired with its matching client ID and client secret and the Google Ads scope.
3. Update `GOOGLE_ADS_REFRESH_TOKEN` in Vercel (and update client ID/secret too if a new OAuth client was created), then redeploy.
4. Verify `/api/mer-data-cached?health=google` reports `status: ok` and both `google_ty` and `google_mmj` checks pass.
5. Recheck the MER range and confirm `google_spend_2026 > 0` before trusting the blended MER/ROAS cards.

No application-code change is required to fix this incident. The focused Google parsing and dashboard-route tests pass.
