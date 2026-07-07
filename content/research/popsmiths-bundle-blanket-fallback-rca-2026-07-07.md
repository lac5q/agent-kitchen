---
title: PopSmiths bundle blanket fallback RCA
date: 2026-07-07
model: GPT-5 Codex
sources:
  - apps/web-widget/src/components/bundles/BundleSection.jsx
  - tests/unit/bundle-section-source.test.js
  - heroku releases -a popsmiths-staging --num 3
  - curl https://staging.popsmiths.com/health
  - curl https://staging.popsmiths.com/.vite/manifest.json
derived_from:
  - User screenshot showing Cozy Room Bundle blanket tile displaying the golden retriever sample instead of the current result artwork.
regen_prompt: "Re-check why the PopSmiths result-page bundle blanket preview shows the wrong sample image, patch staging, and verify the deployed bundle."
---

# PopSmiths bundle blanket fallback RCA

## Summary

On 2026-07-07, the result page Cozy Room Bundle blanket preview could show the golden retriever blanket sample after the bundle blanket mockup refresh failed. The console showed `/api/mockup/bring-to-life` returning a 503 HTML response for `blanket-50x60`, which the client tried to parse as JSON.

## Root Cause

`BundleSection` treated catalog/sample product images as acceptable "Your Art" fallbacks when no personalized bundle mockup existed. For blankets, the sample fallback is the staged/POD blanket image, so a failed refresh caused the bundle card to reveal someone else's blanket art instead of the current generated artwork.

The fetch path also called `response.json()` unconditionally, so a Heroku or proxy HTML error page produced the confusing `Unexpected token '<'` console error.

## Fix

- Changed bundle fallback behavior so real cached/provider mockups still win first.
- Removed catalog/placeholder/sample product images from the personalized bundle image resolver.
- When a bundle mockup refresh fails, the tile now falls back to the current generated artwork URL instead of the blanket sample.
- Added content-type and `response.ok` handling for bundle mockup refreshes so non-JSON 503 responses produce a controlled warning.

## Verification

- `npm test -- --runTestsByPath tests/unit/bundle-section-source.test.js` passed.
- `pnpm --filter @popsmiths/web-widget build` passed.
- Deployed staging commit `1e5b21b5` as Heroku release `v683`.
- `https://staging.popsmiths.com/health` returned HTTP 200 with database connected.
- Staging manifest served `assets/ResultScreen-Bq3Y3l7U.js`, the build containing the bundle fallback fix.
