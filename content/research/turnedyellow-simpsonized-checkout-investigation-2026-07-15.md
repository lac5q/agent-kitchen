---
title: "TurnedYellow Simpsonized Checkout Investigation"
description: "Read-only validation of the claimed zero-purchase funnel for two identically named Shopify products."
publishedAt: "2026-07-15"
tags: [turnedyellow, shopify, ga4, checkout, conversion, investigation]
keywords: [simpsonized, checkout, item funnel, a-b test, purchase tracking]
author: "Codex"
source_session: "codex-desktop-2026-07-15"
model: "gpt-5"
sources:
  - "ga4:properties/331675071"
  - "shopify:turned-yellow.myshopify.com"
  - "https://turnedyellow.com/products/turn-me-yellow-hand-drawn-digital-portrait"
  - "https://turnedyellow.com/products/turn-me-yellow-hand-drawn-digital-portrait-1"
  - "/Users/lcalderon/Marketing/01_scripts/analysis/ga4_item_conversion_funnel.py"
derived_from:
  - "/Users/lcalderon/Marketing/02_reports/2026-07/15_Sami_Top_SKUs/report.md"
  - "/Users/lcalderon/.claude/projects/-Users-lcalderon-Marketing--claude-worktrees-kind-mahavira-11cb07/5e69b7ca-3df9-4661-abef-48bbfcb97fd7.jsonl"
regen_prompt: "Re-run the GA4 item and landing-page reports, query the two exact Shopify product IDs and their orders, and retest both live product flows through the payment page without placing an order."
---

# TurnedYellow Simpsonized Checkout Investigation

## Verdict

The checkout path is not broken. Both live product URLs completed the customer flow from product configuration through add-to-cart and into the hosted Shopify payment page on 2026-07-15. The original claim of zero purchases is false: Shopify contains one paid, non-test web order for the exact product during the 90-day window.

The page still underperforms and deserves a lower-priority conversion/measurement review, but this is not a production checkout outage.

## Why the original conclusion was wrong

The GA4 script reports item quantities grouped only by `itemName`. Those metrics are neither unique shoppers nor a sequenced funnel. The exact same title is used by two active Shopify products, so the script merges both A/B variants:

- Product `8138408034419`, handle `turn-me-yellow-hand-drawn-digital-portrait`, starting at $12.99.
- Product `8138408099955`, handle `turn-me-yellow-hand-drawn-digital-portrait-1`, starting at $19.99.

The landing URLs contain `abtr=true` and `eab_tests` parameters, consistent with an active A/B testing setup. GA4's combined 90-day item metrics were 211 items viewed, 43 items added, 142 items checked out, and zero items purchased. Since checked-out quantity exceeds added quantity, these values cannot be read as a literal funnel of 43 carts. Sitewide, GA4 recorded 59,137 `begin_checkout` events for 19,220 users and 19,059 `checkout_abandoners` events, which also indicates repeated or inflated checkout instrumentation.

## Shopify truth

All 28 variants on each active product were `availableForSale: true`, published to Online Store, and configured with `inventoryPolicy: CONTINUE`. Negative inventory therefore does not make the products sold out.

Shopify order `TY#208120` was placed on 2026-04-27 as a real web order, was paid, was not a test, and was not cancelled. Its landing page was the `-1` product URL and it purchased variant `44110871855219` (`6 / Full Body`) for $171.81, plus a $15 fast-turnaround add-on. This purchase did not appear as an item purchase in GA4, most likely because the single transaction was not observed by GA4 or the purchase instrumentation did not preserve the item identity.

## Live flow reproduction

Using an isolated automation Chrome profile, both active URLs succeeded through:

1. Select `No Background`.
2. Select one person and `Shoulders Up`.
3. Add the configured product to cart.
4. Open `Secure Checkout`.
5. Reach `Checkout - Turned Yellow` with the correct product, variant, line-item properties, and price in the order summary.

No order was placed and no store configuration was changed.

Claude's earlier `Continue didn't advance` observation was caused by clicking Continue before selecting the required background. After a background is selected, the stepper advances normally.

One markup defect exists but did not block the tested customer flow: a hidden quantity input has value `1` with minimum `7`, making the HTML form's native `checkValidity()` false. The storefront uses a JavaScript button flow that still added the item successfully on both pages. This is worth cleanup but is not evidence of checkout failure.

## What is actually worth investigating

- Correct the marketing report language from "likely broken funnel" to "low-converting A/B product pair; GA4 misses the one confirmed Shopify purchase."
- Audit why GA4 emits more checked-out item quantity than added quantity and why the paid order was absent from `itemsPurchased`.
- Confirm that the two-product price test is intentional and still actively governed; do not unpublish either product based on this investigation alone.
- Treat the page as a CRO concern. GA4 shows 187 landing sessions across the two base paths, while Shopify shows one exact-product purchase, about 0.5% observed conversion. That is below the 2.45% item purchase/view baseline cited for the main portrait, but the sample is small and the traffic is heavily fragmented by paid-ad and experiment query strings.

## Decision

Do not escalate as a broken-checkout incident. Open a bounded analytics/CRO follow-up if desired, focused on A/B-test intent, purchase-event identity, and checkout-event inflation.
