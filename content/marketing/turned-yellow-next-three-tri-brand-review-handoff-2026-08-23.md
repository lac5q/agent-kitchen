---
title: "TurnedYellow next-three campaign replication: tri-brand Penpot and Slack review handoff"
description: "Verified source schedule, creative adaptations, Penpot review boards, Slack routing, QA evidence, and remaining production gates for the August 25, 27, and 29, 2026 EcommerceBoost campaigns."
publishedAt: "2026-08-23"
tags: [marketing, email, ecommerceboost, turnedyellow, makemejedi, turnedcomics, popsmiths, omnisend, sendgrid, penpot, slack]
keywords: [TurnedYellow campaign replication, EcommerceBoost August 2026, MakeMeJedi email, TurnedComics email, PopSmiths email, Penpot review, email scheduling]
author: "Codex"
model: "gpt-5"
sources:
  - "Live TurnedYellow Omnisend campaign and email-content API reads, 2026-08-23"
  - "https://support.omnisend.com/en/articles/1061892-schedule-your-campaigns"
  - "https://api-docs.omnisend.com/reference/campaigns"
  - "https://www.figma.com/design/sNnv6F7ri0clQ08y34LFkZ/Turned-Yellow-Campaigns"
  - "Penpot file 81f57451-85cc-819d-8008-7faf4d3b1f35, page f6037ec1-92a5-801a-8008-86cf41403bb2"
  - "https://turnedyellow.slack.com/archives/C0982PYLYTV/p1787482047737429"
  - "https://turnedyellow.slack.com/archives/C0ACMS863TR/p1787482048492129"
  - "https://turnedyellow.slack.com/archives/C09H9LG0Y85/p1787482083442579"
derived_from:
  - "/home/lac5q/github/mkt-hub/email/ecommerceboost-august-2026/PHASE-CONTRACT.md"
  - "/home/lac5q/github/mkt-hub/email/ecommerceboost-august-2026/makemejedi/"
  - "/home/lac5q/github/mkt-hub/email/ecommerceboost-august-2026/turnedcomics/"
  - "/home/lac5q/github/mkt-hub/email/ecommerceboost-august-2026/popsmiths/"
regen_prompt: "Re-read the live TurnedYellow Omnisend scheduled campaigns and full email content, verify the target-brand static variants and ESP account mappings, re-run all static and audience tests, inspect the Penpot review page, and refresh Slack handoff links plus unresolved seed/compliance gates without sending production email."
---

# TurnedYellow next-three tri-brand review handoff

## Outcome

The next three live TurnedYellow campaigns were replicated as brand-original MakeMeJedi, TurnedComics, and PopSmiths review sets. Each date has separate AU/NZ and US HTML/text variants plus desktop/mobile renders. Nine review boards were placed on a new Penpot page and review handoffs were posted to the relevant internal Slack channels.

This delivery is deliberately **static review only**. No target-brand ESP draft, audience mutation, schedule, or send was created. Seed testing and explicit production approval remain mandatory.

## Verified TurnedYellow source schedule

| Date | Live campaign | Subject | Preheader | Campaign / content IDs | Stored schedule |
|---|---|---|---|---|---|
| 2026-08-25 | `EB: Suprise them- 25.8.26` | A Gift They’ll Never Guess | Surprise Them, Turn Them Yellow | `6a83bc347af9a20e0ba677bd` / `6a83bc349fe48cadbbf5b688` | `2026-08-25T17:30:00.353Z` |
| 2026-08-27 | `EB: Last Chance for Father's Day-27.8.26` | 🚨Emergency in Sector 7G 🚨 | Last Call for Father’s Day! | `6a83c1d9764a807f3d67fd52` / `6a83c1d93e8833733352a087` | `2026-08-27T17:30:00.353Z` |
| 2026-08-29 | `EB: Say Goodbye to August- 29.8.26` | August is almost done | Lock In Your Yellow Memories | `6a83c528274fb891227a81f0` / `6a83c5289fe48cadbbf5ba96` | `2026-08-29T17:00:00.353Z` |

All three campaigns were still `scheduled`, used the email channel, and had timezone optimization enabled on the TurnedYellow brand (`America/Los_Angeles`). The operational clock is therefore 10:30 AM recipient-local on August 25 and 27, and 10:00 AM recipient-local on August 29. Contacts without a known timezone fall back to the store timezone.

The source sequence is: unexpected personalized-gift reveal → AU/NZ Father’s Day urgency → end-of-August memory preservation. The August 27 US adaptations are independently evergreen; they do not imply that US Father’s Day is upcoming and do not use deadline or scarcity language.

## Creative evidence and adaptation boundary

The current Omnisend email-content endpoint returned full source bodies for all three campaigns, superseding the older contract note that the bodies were inaccessible.

- August 25 uses a cream ground, personalized gift framing, and four large visual sections.
- August 27 uses three large Father’s Day visual sections.
- August 29 uses six visual sections plus a three-product grid.

Those concepts and the live sequencing informed the adaptations. TurnedYellow trade dress was not reused. MakeMeJedi uses galactic portrait mission framing, TurnedComics uses comic-panel and cast framing, and PopSmiths uses pet-portrait and pet-dad framing.

An email-specific TurnedYellow Figma file was found, including known August 27 (`2743:114`) and August 29 (`2762:2`) nodes. The authenticated account has a View seat, and the Figma connector refused screenshots because it required edit access. The live Omnisend bodies therefore served as the primary source-of-record creative evidence.

## Static package

The target output lives under:

- `email/ecommerceboost-august-2026/makemejedi/{2026-08-25,2026-08-27,2026-08-29}/`
- `email/ecommerceboost-august-2026/turnedcomics/{2026-08-25,2026-08-27,2026-08-29}/`
- `email/ecommerceboost-august-2026/popsmiths/{2026-08-25,2026-08-27,2026-08-29}/`

For the three future dates, the package contains 18 market variants, 18 HTML files, 18 text files, and 36 desktop/mobile renders, with a manifest and QA record for each brand/date.

Provider routing is MakeMeJedi → Omnisend; TurnedComics and PopSmiths → SendGrid. TurnedYellow segment IDs and unsubscribe identities are source-brand-specific and must not be copied to these brands.

## Penpot delivery

File: `New File 1` (`81f57451-85cc-819d-8008-7faf4d3b1f35`)

Review page: `EcommerceBoost — Aug 25–29, 2026 — Email Review` (`f6037ec1-92a5-801a-8008-86cf41403bb2`)

The page contains nine brand/date review boards. Each board includes editable brand/provider/status metadata, AU/NZ and US subject/preheader framing, intended recipient-local send time, and a composite of both market variants at desktop and mobile widths. All nine preview shapes have image fills and are nested under the correct review boards. Representative August 27 exports for all three brands were visually inspected after upload.

Board IDs:

| Date | MakeMeJedi | TurnedComics | PopSmiths |
|---|---|---|---|
| 2026-08-25 | `f6037ec1-92a5-801a-8008-86cf9d98e4f8` | `f6037ec1-92a5-801a-8008-86cf9dd8a408` | `f6037ec1-92a5-801a-8008-86cf9e47649b` |
| 2026-08-27 | `f6037ec1-92a5-801a-8008-86cfbc0014fd` | `f6037ec1-92a5-801a-8008-86cfbc6bab1b` | `f6037ec1-92a5-801a-8008-86cfbcc19afa` |
| 2026-08-29 | `f6037ec1-92a5-801a-8008-86cfd99e6906` | `f6037ec1-92a5-801a-8008-86cfda1f15c7` | `f6037ec1-92a5-801a-8008-86cfda940721` |

The boards were placed on a review page, not the `Sent Campaign Archive`, because no target-brand production send has occurred.

## Slack handoff

- TurnedComics: posted and read back in `#turned-comics-launch` — https://turnedyellow.slack.com/archives/C0982PYLYTV/p1787482047737429
- PopSmiths: posted and read back in `#popsmiths_launch` — https://turnedyellow.slack.com/archives/C0ACMS863TR/p1787482048492129
- MakeMeJedi: the dedicated `#ecommboost-client-make-me-jedi` channel is Slack Connect and rejected connector-authored messages. The handoff was posted and read back in internal `#ecommerceboost_email_sms` instead — https://turnedyellow.slack.com/archives/C09H9LG0Y85/p1787482083442579

Slack file upload was unavailable to the connector because its installation lacks the required file scope, so the handoffs reference the Penpot file/page and repository paths instead of attaching the overview JPEGs.

## Verification

- MakeMeJedi static verifier: PASS — 4 dates, 8 variants, 16 renders.
- TurnedComics static verifier: PASS — 4 dates, 8 variants, 16 renders, 2 assets, sensitive scan passed.
- PopSmiths static verifier: PASS — 794 contract checks, 8 variants, 16 renders.
- MakeMeJedi audience suite: PASS — 14 tests covering consent, geography, suppressions, pagination, brand identity, MIME evidence, approval binding, and tracked-PII scanning.
- Penpot structure: 9 expected review boards, 9 expected preview composites, 9 image-filled previews.
- Slack: all three final handoff messages were read back from their destination channels.

## Production gates

1. Connect or preflight the actual MakeMeJedi Omnisend brand. The active Omnisend connector in this task was TurnedYellow-only.
2. Fix MakeMeJedi provider-generated text/plain so it contains the physical mailing address; host the local hero asset before seeding; then capture fresh seed MIME evidence.
3. Connect the target SendGrid account before creating TurnedComics or PopSmiths drafts.
4. Rebuild consented target audiences and suppression sets inside each brand/provider. Do not copy TurnedYellow segment IDs or unsubscribe groups.
5. Confirm PopSmiths’ “free preview before checkout” claim before a seed or production send.
6. Keep the August 27 US copy evergreen and free of false urgency.
7. Run seed tests, inspect desktop/mobile and raw MIME, obtain explicit production approval, and only then create schedules or sends.
8. Report provider acceptance separately from delivery outcomes.

## Agent provenance

Three bounded discovery/QA subtasks were delegated through direct Codex subagents. No VibeProxy or relay harness was used.
