---
title: "Fall to Black Friday 2026 email program"
description: "Research-backed September-to-Black-Friday campaign calendar, brand adaptations, delivery-claim guardrails, QA evidence, and provider release holds for Turned Comics, Make Me Jedi, and PopSmiths."
publishedAt: "2026-08-23"
tags: [email-marketing, ecommerceboost, turned-comics, make-me-jedi, popsmiths, black-friday, campaign-operations]
keywords: [fall 2026, Halloween, Black Friday, Father’s Day, Omnisend, SendGrid, audience segmentation, email QA]
author: "Codex"
source_session: "mkt-hub fall-black-friday-2026 build"
model: "gpt-5-codex"
sources:
  - "mkt-hub:email/fall-black-friday-2026/PROGRAM-CONTRACT.md"
  - "mkt-hub:email/fall-black-friday-2026/calendar.json"
  - "mkt-hub:email/fall-black-friday-2026/qa/report.json"
  - "mkt-hub:02_reports/2025-12/Dec_2025_War_Room/email_performance_deep_dive.json"
  - "https://turnedyellow.com/"
  - "https://makemejedi.com/products/gift-card"
  - "https://turnedcomics.com/products/gift-card"
  - "https://www.popsmiths.com/blog/how-long-custom-wall-art-delivery"
  - "https://www.usa.gov/holidays"
  - "https://www.fec.gov/documents/5910/2026pdates.pdf"
  - "https://support.omnisend.com/en/articles/1061892-schedule-your-campaigns"
derived_from:
  - "mkt-hub:email/ecommerceboost-august-2026/PHASE-CONTRACT.md"
  - "mkt-hub:email/fall-black-friday-2026/"
regen_prompt: "Re-audit current first-party delivery promises, ESP state, recent audiences, and prior campaign performance, then rebuild and QA the Sep 1–Black Friday 2026 AU/NZ and US email program for Turned Comics, Make Me Jedi, and PopSmiths without inventing offers or delivery claims."
---

# Fall to Black Friday 2026 email program

## Outcome

A complete static-review package now covers September 1 through Black Friday, November 27, 2026, for Turned Comics, Make Me Jedi, and PopSmiths. It contains 31 campaign slots across 30 unique dates, 93 brand campaign manifests, 186 exact AU/NZ and US HTML/text variants, and 372 desktop/mobile render proofs.

The package lives at `mkt-hub/email/fall-black-friday-2026/`. It is review creative, not production authorization. No provider campaign was scheduled or sent, no offer value was invented, and no future audience snapshot was treated as release-ready.

## Calendar strategy

- September: nine broad or market-split education, occasion, family, style, and early-gift-planning touches.
- October: nine slots, limited to two broad Halloween sends with two behavior-only follow-ups; the rest teaches photo selection, formats, sequel use cases, and recipient-based gifting.
- November: twelve dated slots plus a same-day Black Friday high-intent follow-up. November 3 and November 11 are intentionally avoided. There is one broad Black Friday send at 12:15 recipient-local and one mutually exclusive, converter-suppressed high-intent follow-up at 19:15.
- All AU/NZ and US rows remain independent. Unknown geography is excluded rather than inferred.

Default schedule hypotheses are recipient-local, with Make Me Jedi generally using an evening slot and Turned Comics/PopSmiths generally using midday. These are approval hypotheses, not active provider schedules.

## Performance evidence applied

The connected TurnedYellow 2025 history showed that clear value, VIP framing, and genuine deadlines produced the strongest conversion, while humor and gift-guide concepts often earned clicks without comparable orders. Halloween underperformed, and Black Friday/Cyber Monday saturation produced a much higher unsubscribe rate. Four November 28 bodies also retained stale Halloween/free-blanket alt text under Black Friday subjects.

The 2026 program therefore avoids an October full-list Black Friday launch, limits Halloween frequency, uses one broad Black Friday email, makes any second Black Friday touch behavior-only, and requires fresh render/MIME review rather than cloning 2025 bodies.

## Delivery and claim guardrails

These are internal conservative guardrails derived from published maximum paths plus a safety buffer, not customer guarantees.

- AU/NZ Father’s Day is September 6. Physical-gift claim windows have already passed for all three brands. September 1 is the final defensible digital-portrait timing-claim date for Make Me Jedi and Turned Comics; later Father’s Day touches must use a verified gift card or make no arrival claim.
- Halloween is October 31. Turned Comics physical claims close around October 6 unless live operations substantiate a later date. PopSmiths published timing supports later US paths than AU/NZ, but live checkout and exact SKU eligibility must still be rechecked.
- Black Friday is November 27. Make Me Jedi cannot promise Christmas physical arrival at that point. Turned Comics physical viability is conditional on live capacity and market. PopSmiths US physical timing may remain viable under published timing, while AU/NZ physical claims are closed by Black Friday.
- No discount percentage, dollar amount, coupon code, stock level, deadline, or arrival promise appears in the review copy without an approval/live-landing gate.

## Audience and release contract

Audience classes are defined semantically rather than frozen into stale provider IDs:

- `BE180`: positively consented, market-proven engaged subscribers within 180 days.
- `PB`: verified past buyers with campaign-relevant purchaser rules.
- `HI30` and `HI7`: positively consented high-intent contacts within the stated window.
- `BF-HI`: Black Friday same-day high intent, mutually exclusive from the broad audience and suppressing converters.

Every production release must be rebuilt within 48 hours, use current brand-specific suppressions, exclude unknown geography, apply a 72-hour broad-send cadence guard, suppress campaign-relevant purchasers where appropriate, and reconcile counts plus a recipient-set hash. Multi-brand subscribers require a portfolio frequency cap.

## Provider status and blockers

- Turned Comics → SendGrid. The current key lacks `marketing.read`; live Marketing Contacts, Segments v2, and Single Send duplicate inventory are unknown. Do not create or schedule until scoped inventory access, fresh audience proof, received seed QA, and named approval exist.
- Make Me Jedi → Omnisend. The exact brand credential and sender were independently preflighted, but received branded HTML campaigns have not yet proven a compliant `text/plain` alternative containing both the physical postal address and unsubscribe. Do not schedule or send until the received MIME is fixed and verified.
- PopSmiths → SendGrid. The current key lacks Marketing Campaigns inventory access, and current production data does not positively evidence AU/NZ or US geography for the eligible cohort. Do not infer location or send a generic cohort under market- or pet-specific creative.

Future provider segments were deliberately not created months early because their recipient sets would be stale at release. `audience-contract.json` and `provider-draft-index.json` preserve the exact release definitions and zero-action state.

## Review delivery

- Turned Comics handoff posted to `#turned-comics-launch`: https://turnedyellow.slack.com/archives/C0982PYLYTV/p1787525944676209
- PopSmiths handoff posted to `#popsmiths_launch`: https://turnedyellow.slack.com/archives/C0ACMS863TR/p1787525945988439
- Make Me Jedi’s target channel is Slack Connect, so the connector blocked automated sending. The paste-ready handoff is stored in `mkt-hub/email/fall-black-friday-2026/CHANNEL-HANDOFF.md`.
- Penpot page creation is documented in `PENPOT-HANDOFF.md`, but the Penpot MCP had no active connected session. No Penpot object was changed.

## Verification

Final local verification on 2026-08-23 passed with zero failures:

- 31 campaign slots / 30 unique dates
- 3 brands / 2 market variants
- 93 manifests
- 186 HTML/text variants
- 372 desktop/mobile renders
- US spelling scan passed
- `git diff --check` passed
- Representative desktop and mobile renders from each brand and major phase were visually inspected

Before release, repeat exact-content link checks, desktop/mobile render inspection, received-seed MIME review, audience reconciliation, live offer/landing-page verification, and named approval.

