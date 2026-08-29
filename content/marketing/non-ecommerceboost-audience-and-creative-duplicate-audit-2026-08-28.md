---
title: "Non-EcommerceBoost audience and creative-duplicate audit — 2026-08-28"
description: "Corrects AU/NZ market-slice counts, measures overlap with prior sends, and defines the safe U.S. opportunity for Make Me Jedi, Turned Comics, and PopSmiths."
publishedAt: "2026-08-28"
tags: [marketing, email, audience, duplicate-audit, make-me-jedi, turned-comics, popsmiths]
keywords: [SendGrid, Omnisend, AU/NZ, United States, consent, suppression, creative novelty]
author: "Codex"
model: "gpt-5"
sources:
  - "mkt-hub:email/same-day-2026-08-28/RESULTS.md"
  - "mkt-hub:email/same-day-2026-08-28/makemejedi/manifest.json"
  - "mkt-hub:email/same-day-2026-08-28/turnedcomics/manifest.json"
  - "mkt-hub:email/same-day-2026-08-28/popsmiths/manifest.json"
  - "mkt-hub:email/au-fathers-day-2026/mmj/visual-v3"
  - "mkt-hub:email/au-fathers-day-2026/turnedcomics/visual-v3"
  - "provider:Make-Me-Jedi-Omnisend-live-audience-2026-08-29T06:29Z"
  - "provider:SendGrid-live-activity-and-suppressions-2026-08-29T06:29Z"
derived_from:
  - "content/marketing/non-ecommerceboost-au-nz-email-release-2026-08-28.md"
  - "content/marketing/non-ecommerceboost-send-audit-2026-08-28.md"
  - "content/marketing/au-nz-fathers-day-urgency-override-2026-08-23.md"
regen_prompt: "Re-run read-only Omnisend and SendGrid audience, suppression, activity, recipient-overlap, and creative-similarity checks for the managed brands, without exposing recipient addresses or mutating provider state."
---

# Non-EcommerceBoost audience and creative-duplicate audit

## Executive correction

The August 28 production counts of 8 Make Me Jedi and 5 Turned Comics recipients were strict, positively geo-identified AU/NZ slices. They were not the brands' total lists.

The two released messages were not byte-for-byte duplicates: each had a new subject, campaign identity, body hash, copy, and CTA. However, each reused the exact prior Father's Day hero image and went to exactly the same small AU/NZ recipients as the previous Father's Day send. Make Me Jedi also reused the same DAD20/50%-off/free-animation offer, landing page, and numbered three-step structure. They should be described as related follow-ups, not fully fresh campaigns.

No further campaign should reuse these staged concepts or assets. The messages already delivered cannot be changed or unsent.

## Audience reconciliation

| Brand | Verified market/audience | Current usable interpretation | Critical limitation |
|---|---:|---|---|
| Make Me Jedi | 14,474 email subscribers; 12,040 clean positive-U.S. in the expanded-engaged source; 11,790 after current cross-provider suppressions | 8,898 prospect-only; 1,950 clicked-three-times-or-checkout high-intent; 1,325 high-intent non-buyers | Existing U.S. Father's Day concept already reached essentially this audience; new creative is mandatory |
| Turned Comics | 977 positive-U.S. after consent, geography, live suppressions, and verified 72-hour broad-send cap | Three current prior-campaign clickers are a possible narrow follow-up audience | All 977 received the Aug. 20 U.S. Father's Day campaign; buyer identities are redacted, so purchaser exclusion is unresolved |
| PopSmiths | 554 operator-attested opt-ins after test, cadence, and live suppression exclusions | Addressable only as a universal audience | All 554 lack positive geography; 531 received the recent style crossover; current creative is substantively repetitive |

### Why Make Me Jedi showed only eight

The correct Make Me Jedi brand/account was used. The engaged source contained 12,679 records at the live audit. Positive geography observations were overwhelmingly U.S.: 12,634 U.S. versus eight AU/NZ. The eight-person release was therefore the narrow AU/NZ slice, not a small Make Me Jedi list.

Current Make Me Jedi U.S. waterfall:

- 12,040 eligible after Omnisend engagement, consent, geography, and Omnisend suppression rules.
- 250 additional unique intersections with current SendGrid suppressions.
- 11,790 after cross-provider suppression reconciliation.
- 8,898 after excluding 2,892 known buyers.
- 1,950 in the clicked-three-times-or-checkout high-intent union; 1,325 after excluding buyers.

These are audit counts, not authorization to send. A release still requires a fresh snapshot, exact received seed, approval, final duplicate check, and an appropriate local-time window.

## Prior-send and creative overlap

### Make Me Jedi

The Aug. 20 U.S. campaign `Australia gets another Father's Day. Borrow it.` recorded 12,047 requests, 12,031 processed messages, and 11,987 deliveries. The provider's exact-subject activity API caps visible samples at 1,000, but the full campaign/category aggregate establishes the larger release.

The Aug. 28 AU/NZ follow-up used a new subject and body; plaintext three-gram Jaccard similarity to the prior AU version was 17.8%. It nevertheless reused:

- the identical hosted hero image;
- the same DAD20/50%-off/free-animation offer;
- the same Father's Day landing page;
- the same three-step photo/path/reveal structure; and
- all eight prior recipients.

Verdict: do not use the existing U.S. staged variant. Build a different hero, narrative structure, and commercial angle.

### Turned Comics

The Aug. 28 follow-up was not a byte duplicate. Plaintext cosine similarity against the prior Father's Day variants was 0.5625 for AU/NZ and 0.5851 for U.S.; token Jaccard was 0.2485 and 0.2071. The offer and CTA changed, but it reused the exact hosted hero object and the same camera-roll-photo-to-Dad/main-character/comic-issue story.

Recipient overlap was complete:

- AU/NZ: 5 of 5 had received the prior Father's Day send, and all five had also received National Dog Day.
- U.S.: 977 of 977 current eligible contacts were in the Aug. 20 U.S. Father's Day audience. That prior release recorded 983 rows, 981 delivered, and two not delivered.

Verdict: block the staged U.S. creative. Even a three-person clicker follow-up needs a new visual and post-click concept. The 977-person base is not production-ready until purchaser identities can be reconciled or an explicit buyer strategy is approved.

### PopSmiths

The staged subjects have zero exact SendGrid activity matches, but the underlying idea is too repetitive. It repeats the same-photo/three-styles/wall-gallery mechanic and reuses Royal Pet, Watercolor, and Classical Oil directions from National Dog Day and the Aug. 21 style-crossover campaign.

The old roughly 900-person PopSmiths audience must not be reconstructed. Its 990-address database pool mixed 734 TurnedYellow, 66 Make Me Jedi, and two TurnedWizard imports with PopSmiths records and did not establish affirmative PopSmiths consent. The legitimate larger basis is 554 current suppression/cadence-adjusted operator-attested PopSmiths opt-ins, but their geography is unknown.

Verdict: hold the current creative. A co-star/sequel concept is materially more distinct, but it must remain universal until positive country or timezone data is attached to consented identities.

## Future-program creative warning

The current static `email/fall-black-friday-2026` package is review-only and should remain blocked from provider loading. All 31 Make Me Jedi campaign manifests and all 31 Turned Comics campaign manifests reference the same prior Father's Day hero used above. All 31 PopSmiths campaign manifests reference the same Royal Pet hero. Copy changes alone do not create adequate campaign novelty over a two-month program.

Before provider loading, replace the single-hero pattern with a dated asset map, enforce a recent-send image/concept check, and require the release manifest to record subject, hero hash, core concept, offer, CTA, and recipient overlap against recent campaigns.

## U.S. timing and release decision

At the audit time it was late Friday night Pacific time and early Saturday morning Eastern time. No broad U.S. send was defensible then.

- Make Me Jedi: a new U.S. campaign can support a meaningful audience, but not with the prior Father's Day visual/concept. Default to a recipient-local 9–11 a.m. window after new creative, seed, approval, and fresh audience reconciliation.
- Turned Comics: rebuild the concept and resolve purchaser suppression. Tuesday, Sep. 1 at 9 a.m. Pacific / noon Eastern is the safer default if no campaign-specific timing evidence overrides it.
- PopSmiths: do not label or split the 554-person cohort as U.S./non-U.S. until geography is captured. Use a universal campaign only after a fresh concept and standard release gates.

No provider mutation, schedule, seed, or send was performed during this audit.
