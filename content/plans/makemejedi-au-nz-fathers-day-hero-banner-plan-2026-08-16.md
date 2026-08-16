---
title: "Make Me Jedi AU/NZ Father's Day Hero Banner Plan"
description: "A production and Shopify deployment plan for responsive MakeMeJedi Father's Day hero artwork modeled on the live TurnedYellow campaign."
publishedAt: "2026-08-16"
tags: [makemejedi, fathers-day, australia, new-zealand, shopify, creative-production, conversion]
keywords: [Make Me Jedi, AU Father's Day, NZ Father's Day, DAD20, Shopify hero banner, responsive campaign]
author: "Codex"
source_session: "SketchPop Codex task 2026-08-16"
model: "gpt-5"
sources:
  - "https://turnedyellow.com/"
  - "https://makemejedi.com/"
  - "https://makemejedi.com/products/fathers-day"
  - "https://www.timeanddate.com/holidays/australia/father-day"
  - "https://publicholidays.org.nz/fathers-day/"
  - "shopify-admin:turned-yellow.myshopify.com/theme/143540387955"
  - "shopify-admin:turnedjedi.myshopify.com/theme/154795540732"
derived_from: []
regen_prompt: "Re-audit the live TurnedYellow and MakeMeJedi storefronts and Shopify themes, then refresh the AU/NZ Father's Day responsive hero-banner plan, offer status, dates, asset specs, rollout, and QA checklist."
---

# Make Me Jedi AU/NZ Father's Day Hero Banner Plan

## Outcome

Launch a responsive MakeMeJedi Father's Day hero treatment that matches the campaign structure already live on TurnedYellow while retaining MakeMeJedi's sci-fi visual identity. The campaign should promote the existing `DAD20` offer and route shoppers to the active Father's Day portrait product.

## Current-state findings

- AU and NZ Father's Day is Sunday, September 6, 2026.
- TurnedYellow already has dedicated AU Father's Day hero artwork:
  - Desktop: `DesktopAUFathersDay26...png`, rendered at 1340×785.
  - Mobile: `MobileAUFathersDay26v2...png`, rendered at 402×504.
  - The artwork includes a before/after transformation, a prominent “Extra 20% Off” badge with `DAD20`, a “Best Dad Ever” badge, and the free animated-video benefit.
- MakeMeJedi's responsive hero is already built and needs an asset swap, not a new section:
  - Live theme: `154795540732`, “Make Me Jedi - v2.5 (Nav Theme to New PDPs).”
  - Homepage section: `index_hero_new_X7LTnc`, type `index-hero-new`.
  - Asset settings: `image` and `image_mb`.
  - Current desktop source: 1580×1261.
  - Current mobile source: 1000×1488; Shopify currently serves an 800×1190 rendition.
- The store already has the supporting promotion infrastructure:
  - `DAD20` is active for 20% off and currently has no end date.
  - The AU Father's Day announcement bar is live.
  - The PDP promo box already contains the matching offer.
  - The active campaign product is `https://makemejedi.com/products/fathers-day`.
- Therefore, the minimum safe launch is two new creative assets, a cloned-theme preview, and a homepage hero settings change.

## Recommended creative direction

Use the same information hierarchy as TurnedYellow, translated into MakeMeJedi's existing teal/black/gold visual system.

### Main visual

- Use an approved MakeMeJedi family portrait with Dad as the visual center.
- Show a small circular source photo and a luminous arrow leading into the finished portrait, preserving the before/after story that works on TurnedYellow.
- Build on the existing MakeMeJedi hero language: teal portal glow, cinematic star field, gold/blue UI trims, and hand-drawn characters.
- Retain the “Free Animated Video Included” value badge because it is already part of MakeMeJedi's evergreen hero and should not disappear during the promotion.
- Do not use official franchise logos, movie stills, or recognizable licensed characters. Keep the art in MakeMeJedi's approved custom sci-fi portrait language.

### Promotion badges

Primary badge:

> AU + NZ FATHER'S DAY  
> EXTRA 20% OFF  
> DIGITAL PORTRAITS  
> CODE DAD20

Secondary badge:

> BEST DAD IN THE GALAXY

Keep “50% off sitewide” in the announcement bar and/or HTML copy rather than crowding the hero artwork. If it must appear in the art, phrase the full offer exactly as “50% Off Sitewide + Extra 20% Off Digital Portraits with Code DAD20” so scope is unambiguous.

### Layout

- Desktop: reserve the left 38–42% as a clean contrast-safe area for the existing HTML headline, description, and CTA. Place the transformation story, Dad-centered portrait, and promo badges in the right 58–62%.
- Mobile: prioritize the discount badge in the upper third, the before/after transformation in the center, and the animated-video benefit near the bottom. Use larger badge type and fewer decorative elements.
- Do not bake the main CTA into either image; keep the theme's real button accessible and measurable.
- Keep every critical badge at least 5% inside the crop boundary.

## Deliverables

1. Desktop hero, transparent PNG or lossless WebP, exactly 1580×1261.
2. Mobile hero, transparent PNG or lossless WebP, exactly 1000×1488.
3. One alternate badge treatment with stronger emotional copy (“Best Dad in the Galaxy”) but the same offer.
4. Editable layered source file with separate groups for characters, before-photo, arrow, offer badge, secondary badge, and animated-video badge.
5. Export checklist confirming dimensions, transparency, spelling, code, offer scope, and safe areas.

Target optimized file weights: under 900 KB desktop and under 650 KB mobile without visible degradation. Use concise alt text such as “Custom family Jedi portrait Father's Day gift offer.”

## Shopify implementation

1. Duplicate live theme `154795540732`; do not edit the live theme first.
2. Upload both approved assets to Shopify Files.
3. In the duplicated theme's homepage section `index_hero_new_X7LTnc`:
   - Set `image` to the new desktop asset.
   - Set `image_mb` to the new mobile asset.
   - Preserve the existing subheading, heading, description, proof points, and button label.
   - Change `button_link` from the generic portrait product to `shopify://products/fathers-day` for campaign relevance.
4. Preserve the live AU Father's Day announcement bar and PDP promo box.
5. Confirm that `DAD20` applies only to the intended digital portrait products. The discount exists and is active, but product scope should be checked before launch.
6. Add an end date to `DAD20`; recommended campaign close is Monday, September 7, 2026 at 11:59 PM AEST (`2026-09-07T13:59:00Z`), unless the marketing calendar specifies a different close.
7. Preview, QA, and publish the duplicated theme. Record the original hero image IDs and button link for instant rollback.

Optional geography improvement: show the AU/NZ campaign only for Australia and New Zealand visitors. If the theme has no existing market-aware switch, ship parity with TurnedYellow first and handle geo-targeting as a separate change rather than adding fragile custom logic during launch.

## Copy alignment

Recommended announcement copy:

> 👔 AU + NZ Father's Day Sale! 50% Off Sitewide + Extra 20% Off Digital Portraits with Code DAD20 👔

Recommended urgency message, only if operations confirms the promise:

> Order by September 3 for your first portrait preview by Father's Day.

Avoid promising final artwork by September 6 without fulfillment confirmation; the storefront currently promises a first preview in 2–3 days.

## QA and acceptance criteria

Test the cloned theme at desktop widths 1440, 1280, and 1024 px and mobile widths 430, 390, and 360 px.

The launch passes when:

- The correct asset switches at the responsive breakpoint with no flash of the wrong image.
- The existing headline and CTA remain readable and unobstructed.
- `DAD20` is legible without zooming on a 390 px mobile screen.
- The badge says “AU + NZ” or “Australia + New Zealand,” not Australia only.
- The CTA reaches `/products/fathers-day`.
- The discount applies correctly to an eligible digital portrait and does not incorrectly discount excluded merchandise.
- Page speed has no material regression; compare hero LCP before and after.
- Alt text is meaningful, and the image does not contain the only copy of the offer.
- Cart, sticky header, announcement bar, and mobile menu remain visually correct.
- Rollback to the original desktop/mobile assets takes less than five minutes.

## Measurement

For AU/NZ sessions, compare the campaign period against the prior matched period on:

- Hero CTA click-through rate.
- Father's Day product views and add-to-cart rate.
- `DAD20` uses, discount revenue, and average order value.
- Mobile versus desktop conversion rate.
- Checkout completion and gross margin after the stacked offer.

If promotion events already exist in GTM/GA4, label the creative `mmj_au_nz_fathers_day_2026`. Do not add new theme JavaScript solely for measurement unless existing tracking cannot identify the hero CTA.

## Suggested timeline

- Day 0: approve copy, choose approved family portrait/source photo, and confirm discount scope/end date.
- Day 1 morning: produce desktop and mobile composites plus one alternate badge treatment.
- Day 1 afternoon: upload to a duplicated theme, perform responsive and discount QA, and secure approval.
- Day 1 end: publish and begin measurement.
- September 3: switch urgency copy only if fulfillment has confirmed the deadline.
- September 7/8: restore evergreen assets, end the code, and export campaign results.

## Recommended decision

Proceed with one campaign concept and two responsive assets. Reuse the existing MakeMeJedi hero section and campaign product rather than building a new Shopify section. This is the fastest, lowest-risk path and keeps the promotion structurally consistent with TurnedYellow.
