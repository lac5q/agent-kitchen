---
title: PopSmiths Funnel Analysis (Mar 19 → Jul 5, 2026) + Organic Social Plan
date: 2026-07-05
model: claude-fable-5
sources:
  - PopSmiths production PostgreSQL (Heroku popsmiths-art-app) — sessions, image_generations, checkouts, events tables
  - Shopify Admin API popsmiths.myshopify.com — orders since 2026-03-19
  - Prior audit: mkt-hub/paperclip/popsmiths/content/conversion-audit-results-popsmiths.md (2026-03-19)
  - mkt-hub/paperclip/popsmiths/organic-marketing-strategy-2026.md (2026-03-15)
derived_from: conversion-audit-results-popsmiths.md (2026-03-19 baseline)
regen_prompt: >
  Query PopSmiths production Postgres (DATABASE_URL via heroku config -a popsmiths-art-app)
  for monthly sessions/image_generations/checkouts and events-table funnel stages since the
  prior audit date; verify completed checkouts against Shopify Admin API orders
  (popsmiths.myshopify.com); compare to prior audit baseline; rank conversion leaks by
  magnitude; produce hypotheses and an organic social plan grounded in pet-first positioning.
---

# PopSmiths Funnel Analysis — March 19 → July 5, 2026

## TL;DR

Since the last audit (Mar 19), PopSmiths generated **8 orders / ~$563 total revenue**. The March audit's "~1.8% conversion" baseline was fiction — actual overall conversion is **~0.24%** (7 orders / ~2,900 June sessions). The funnel does NOT die where the March audit assumed (homepage social proof). It dies at **checkout completion: only 5.3% of created checkouts become orders** (131 → 7 in June; industry norm 45–65%). Verified against Shopify — this is real abandonment, not broken tracking.

## Actual funnel (June 2026, unique sessions per stage)

| Stage | Sessions | Step conversion |
|---|---|---|
| Session start | 2,900 (~21% bot-like UA) | — |
| Image upload | 327 | 11.3% |
| Generation success | 282 | 86% of uploads |
| Checkout created | 131 | **46% of successful generations** (strong!) |
| **Order completed** | **7** | **5.3%** ← the leak |

Monthly context: Mar 10,582 sessions / 502 checkouts / 1 order → Apr 944 / 101 / 0 → May 667 / 14 / 1 → Jun 3,250 / 113 / 7. The week of Jun 15 (Father's Day push) created 77 checkouts → 3 orders. AOV actual: ~$58 (assumed baseline was $120).

## Ranked hypotheses for non-conversion (NEW — evidence-based)

**H1 — The Shopify checkout handoff is hostile (biggest leak, ~10x upside).**
46% of people who see their art click Buy — intent is proven. Then they're redirected from popsmiths.com to `shop.popsmiths.com` (Shopify draft-order cart): domain change, likely generic cart page, possible loss of their artwork preview, shipping cost revealed late, unknown-brand trust hit at payment. Fixing completion from 5% to even 30% = ~6x revenue with zero new traffic. **Test the full flow on mobile end-to-end and screen-record it.** Check: does the cart show their actual art? Is shipping shown before payment? Express pay (Shop Pay/Apple Pay) enabled? Does the draft order expire?

**H2 — Generation failures are burning the highest-intent users (~30% of June generations failed).**
314 June failures were "Generation interrupted (server restart or timeout)" — Heroku dyno restarts/timeouts killing in-flight jobs. Pet styles (the strategic bet) fail worst: pet_royalty 43%, oil_painting 52%, pet_sketch 41%, south_park 48%. Simpsons (2.4–7.9% fail) proves the infra can work. A user who uploads a beloved pet photo and gets an error doesn't retry — they leave. Fix: move generation off web dynos to worker + queue with resume, or at minimum auto-retry on restart.

**H3 — Top of funnel doesn't start the experience (11% upload rate).**
89% of visitors never upload a photo. Hypotheses within: homepage sells "40+ styles" breadth instead of one emotional outcome; no instant demo (try with a sample pet photo, zero commitment); traffic quality (bot share ~21%, and paid/social clicks may be curiosity, not intent).

**H4 — The credits paywall converts at 8%.**
151 credit-modal opens → 85 plan views → 7 plans selected. If the wall appears before the user has seen their own art, it's killing the magic moment. Sequence: show the reveal first, charge at print time.

**H5 — The email fallback captures but doesn't recover.**
85 sessions submitted email for "art ready" notification, only 35 `campaign_returned` events all month. Verify the SendGrid art-ready + abandoned-checkout flows actually send, and that abandoned-checkout email exists at all (131 abandoned checkouts/month × $58 AOV = ~$7.6k/month sitting in that flow at even a 10% recovery).

**Retired hypotheses from March audit:** homepage social proof, choice paralysis, and A/B-testing tooling are now third-order problems. Don't invest there until H1/H2 are fixed — an A/B test needs ~100x current order volume to read out.

---

# Organic Social Plan — Free Visits That Convert

**Sequencing rule: fix H1 (checkout) and H2 (pet-style failures) in week 1, before scaling traffic.** June proved the failure mode: the Father's Day push drove 77 checkouts into a 4% completion funnel. Driving organic traffic now wastes the content.

**North star:** 5,000 organic sessions/month and 50 orders/month by Sep 30 (assumes checkout completion fixed to ≥30%).

## Positioning: Pet-first
Pet styles are already ~60% of June generation volume despite their failure rates. Pet content is the most shareable organic category on every platform. Lead with **"Turn your pet into a masterpiece"** — one outcome, not 40 styles. (Aligns with popsmiths_app/docs/marketing/pet-first-positioning.md and the pet-styles creative folder already in mkt-hub.)

## Channel plan (effort-ranked)

**1. Pinterest — the compounding engine (5 pins/week).**
Purchase-intent platform; pins pay rent for months. Board structure: Pet Portrait Ideas, Royal Pet Portraits, Dog Mom Gifts, Cat Lover Wall Art, Memorial Pet Portraits (high-emotion, high-intent niche). Every pin: lifestyle-staged POD mockup (canvas on wall / blanket on bed — **never bare style previews**, per standing brand rule), popsmiths.com destination URL, keyword-rich description. All pins pass the three-gate rule: real artwork on disk → popsmiths.com URL → marketing-qa signoff. Builds on existing Pinterest-SEO-Strategy-2026.md.

**2. Instagram Reels + TikTok — the reveal engine (3–4/week, same asset both platforms via upload-post).**
The transformation reveal is the native viral format. Faceless production (per faceless-content-launch-guide): pet photo → generation timelapse → staged product reveal. Hooks from the existing pet-styles hooks file: "POV: your dog was royalty in a past life", "I turned my cat into a Renaissance painting and I can't stop laughing", memorial angle ("I made this of my dog who passed — the frame arrives Friday"). CTA: comment keyword → link (comment-to-DM automation later; link-in-bio now).

**3. Reddit — high-trust seeding (2–3/week, no links in posts).**
r/aww, r/dogpictures, r/cats, r/WhatsWrongWithYourDog + gift subs seasonally. Post genuinely good transformations of OUR OWN pets as content, mention the tool only when asked or in profile. One "I made free pet portraits for the first 20 commenters" thread per month = UGC engine + goodwill (each free portrait costs ~$0.10 in API and produces shareable content).

**4. Blog SEO on popsmiths.com/blog (1/week, popsmiths_app blog — NOT Shopify).**
Bottom-funnel keywords: "royal pet portrait custom", "turn dog photo into painting", "pet memorial portrait ideas", "gifts for dog moms 2026". Every post embeds the upload widget inline — the blog IS the funnel entry, not a detour. Add to blog-content.json + seo-meta.js + Heroku deploy per standing process.

**5. UGC flywheel (built into product, week 2–3 dev task).**
Post-purchase email (SendGrid): "Share a photo of your art on the wall, get 50% off your next print." Order confirmation page: pre-composed share card of their artwork (watermarked "made at popsmiths.com"). 8 orders/month won't seed this yet — it activates as volume grows.

## Weekly cadence (steady state, ~6 focused hours/week)
- Mon: 5 Pinterest pins (batch), 1 blog post published
- Tue/Thu/Sat: 1 reveal Reel → IG + TikTok via upload-post
- Wed: 2 Reddit posts
- Fri: metrics check — sessions by source (GA4), uploads, checkouts, orders; kill formats with 0 saves/shares after 6 posts, double down on anything >5% save rate

## Measurement
Track weekly in the existing Baseline-Metrics tracker: organic sessions by channel, session→upload rate (target 20%+ from organic, it's pre-qualified traffic), upload→checkout, checkout→order (the H1 fix metric, target ≥30%), orders. Guardrail: if checkout completion is still <15% by Jul 19, pause all traffic pushes and escalate the checkout rebuild.

## 30-day plan
- **Week 1 (Jul 6–12):** Fix checkout handoff (H1) + pet-style generation failures (H2). Record mobile checkout walkthrough. Set up abandoned-checkout SendGrid flow. Batch-produce 20 pins + 6 reels from existing pet-styles creative folder.
- **Week 2 (Jul 13–19):** Launch Pinterest + Reels cadence. First Reddit free-portraits thread. Publish 2 blog posts.
- **Week 3–4:** Full cadence. First metrics review Jul 24: verify organic sessions arriving and completion rate ≥30% before scaling volume.
