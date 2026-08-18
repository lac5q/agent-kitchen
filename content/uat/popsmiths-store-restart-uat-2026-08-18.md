---
title: "PopSmiths Store Restart UAT"
description: "Live production smoke test and Shopify checkout verification after the PopSmiths store restart."
publishedAt: "2026-08-18"
tags: [popsmiths, uat, shopify, checkout, production]
keywords: [store restart, checkout pricing, mobile UAT, Shopify handoff]
author: "Codex"
source_session: "codex-desktop-2026-08-18"
model: "gpt-5.6-sol"
sources:
  - "https://www.popsmiths.com"
  - "https://www.popsmiths.com/create"
  - "https://www.popsmiths.com/gallery"
  - "https://shop.popsmiths.com"
  - "repo:popsmiths_app/tests/uat/production-uat.spec.js"
  - "repo:popsmiths_app/tests/e2e/regression/customer-journeys.spec.js"
derived_from: []
regen_prompt: "Re-run mobile and desktop PopSmiths production UAT from homepage through gallery, product selection, cart, and Shopify checkout without completing a purchase; compare displayed product/cart prices with the Shopify checkout line item."
---

# PopSmiths Store Restart UAT

## Outcome

The production storefront and Shopify checkout infrastructure are online, but the purchase funnel is **not fully healthy** because the selected product price changes during checkout handoff.

## Verified working

- `popsmiths.com` redirects to `www.popsmiths.com` and returns HTTP 200.
- Homepage, `/create`, `/gallery`, and `shop.popsmiths.com` return HTTP 200.
- Homepage loaded with no first-party JavaScript page errors.
- Mobile Create navigation works and displays populated style collections, 194 images, upload controls, and room/style/product tabs.
- Internal Studio navigation loads the Community Gallery with 27 artwork images.
- Gallery artwork detail opens and exposes Order Print and Try This Style actions.
- Order Print reaches the result/product screen with canvas, mug, framed print, bundles, cart, and checkout controls.
- `/health`, the products endpoint, and the public gallery endpoint passed the existing regression checks.
- `POST /api/v1/checkout` returned HTTP 200 with a Shopify checkout URL in `shop.popsmiths.com`.
- Shopify checkout loaded contact, delivery, shipping, card payment, Shop Pay, PayPal, Google Pay, and Venmo surfaces. No purchase was submitted.

## Blocking defect: checkout price mismatch

Reproduction on the mobile journey:

1. Open Create, navigate internally to Studio, and select the first gallery artwork.
2. Choose **Order Print**.
3. Select **Canvas Print 18\"×24\"** and add it to cart.
4. The product card shows **From $37**, **4 × $12.75 with Shop Pay**, and the free-shipping meter says **Add $49.00**, which implies a $51 cart subtotal.
5. Continue to Shopify checkout.
6. Shopify receives **Canvas Vertical - PS, 18×24** at **$75.00**, with subtotal and total both $75.00 and no discount applied.

The checkout API cost snapshot also reports a $75 unit and line price. This is a customer-visible pricing/promotion handoff defect, not a rendering-only problem.

## Automated test notes

- Legacy production UAT: 12/15 passed. The three failures expected retired `WELCOME15` and `#offer-section` campaign elements and appear stale relative to the redesigned pet-portrait homepage.
- Selected customer-journey/API suite: 7 passed, 3 failed, 6 skipped. The three failures expected old copy/selectors such as `Pick a style`, `Rooms/Styles` text, and `Start Creating Free`; direct inspection confirmed the current Create and Studio experiences are functional.
- A blocked cross-origin Shopify product image request and a headless Shop-login 401/403 were observed, but the checkout itself rendered and remained usable in the test browser.

## Recommendation

Treat the store restart as operationally successful but commerce UAT as failed until the storefront/cart promotional price and the Shopify variant price agree. Re-test at least canvas 18×24, mug 11 oz, and framed print 18×24 after correcting the price/discount handoff. Update the stale UAT selectors separately so future restart checks do not mix real defects with retired campaign UI.
