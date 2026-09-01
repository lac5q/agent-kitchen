---
title: "Daily MER 2026 zero-series transient overlay incident"
description: "RCA note for a Daily MER dashboard view that showed zero 2026 values after July 8 even though prior-year data continued."
publishedAt: "2026-09-01"
tags: [daily-mer, dashboard, incident, shopify, live-overlay]
keywords: ["Daily MER", "2026 zero series", "mer-data-cached", "Shopify live overlay", "SketchPop Ads"]
author: "Codex"
model: "gpt-5"
sources:
  - "user-provided screenshot: Daily MER YTD chart showing zero 2026 values on 2026-07-28"
  - "https://sketchpop-ads-2025.vercel.app/daily-mer"
  - "https://sketchpop-ads-2025.vercel.app/api/mer-data-cached?start=2026-07-28&end=2026-07-28"
  - "mkt-hub:api/mer-data-cached.js"
  - "mkt-hub:content/daily-mer-dashboard.html"
derived_from:
  - "content/ops/daily-mer-google-ads-oauth-2026-08-20.md"
  - "content/research/recovered-context-6c88b1-2026-07-18.md"
regen_prompt: "Recheck the production Daily MER route and cached API for zero-filled current-year gaps, compare the screenshot date with the live response, and trace the JSON plus live-overlay merge path."
---

# Daily MER 2026 zero-series transient overlay incident

## Incident

On 2026-09-01, a user screenshot of the YTD Daily MER dashboard showed the 2026 TurnedYellow series at zero on July 28 and across a long range after July 8. The screenshot reported YTD Shopify revenue of `$202,196`, blended spend of `$73,884`, and YTD blended MER of `2.74x`.

The historical 2025 series remained populated. That pattern indicates missing current-year source rows rather than a chart-scale or MER-formula error.

## Current production verification

Later the same day, the production cached endpoint had recovered:

- YTD through 2026-09-01: Shopify revenue `$236,988.39`, blended spend `$107,109.36`, MER `2.21x`.
- All 244 combined rows from 2026-01-01 through 2026-09-01 contained current-year activity; no fully zero current-year rows remained.
- July 28 TurnedYellow returned Shopify revenue `$35.88`, spend `$150.90`, and MER `0.24x` instead of the earlier zero.
- A headless Chrome render of `/daily-mer` showed the populated current-year line through September 1 with no visible error banner.

## Root cause assessment

The production route combines bundled monthly JSON with a live API overlay. Bundled 2026 data ends on July 8. For missing dates, `api/mer-data-cached.js` expands the overlay window from the first missing date and fetches Shopify, Meta, and Google data.

When a source fetch fails, `fetchLiveOverlayRows()` still returns date rows initialized to zeros and records an error in response metadata. With no bundled row after July 8, those empty overlay rows are assembled as literal zero values. The dashboard charts those zeros, so a transient live-overlay failure can look like real zero performance. A later successful request repopulates the same dates, which matches the observed recovery.

The original failing response was not retained, so the exact upstream source error cannot be proven retrospectively. Shopify/live-overlay unavailability is the strongest explanation because Shopify revenue and blended MER were both missing while the prior-year series remained intact.

## Operational response

No code change was made during this investigation because production had already recovered. Refreshing the dashboard now retrieves the repaired response. If the symptom returns, capture `meta.errors` from `/api/mer-data-cached` before refreshing so the failing source is attributable.

## Hardening opportunity

Treat source-fetch failures as missing data rather than observed zero values. The API should preserve null/missing state for failed overlay dates, and the dashboard should render a gap plus a visible warning. Reserve numeric zero for a successful source fetch that actually returned zero.
