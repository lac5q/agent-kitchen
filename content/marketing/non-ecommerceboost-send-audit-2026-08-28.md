---
title: "Non-EcommerceBoost email send audit — August 28, 2026"
description: "Live provider and local-calendar reconciliation for whether Turned Comics, Make Me Jedi, or PopSmiths should send a campaign email on August 28, 2026."
publishedAt: "2026-08-28"
tags: [email-operations, send-audit, turned-comics, make-me-jedi, popsmiths, sendgrid, omnisend]
keywords: [duplicate prevention, Father’s Day, suppression reconciliation, lifecycle email, production approval]
author: "Codex"
source_session: "mkt-hub non-ecommerceboost Aug 28 send audit"
model: "gpt-5-codex"
sources:
  - "mkt-hub:email/au-fathers-day-2026/"
  - "mkt-hub:email/fall-black-friday-2026/"
  - "live:SendGrid Turned Comics activity and scheduled-send APIs checked 2026-08-28"
  - "live:SendGrid PopSmiths activity and scheduled-send APIs checked 2026-08-28"
  - "live:Make Me Jedi Omnisend campaign and segment APIs checked 2026-08-28"
derived_from:
  - "content/marketing/non-ecommerceboost-send-audit-2026-08-23.md"
  - "content/marketing/fall-black-friday-email-program-2026-08-23.md"
regen_prompt: "Reconcile live SendGrid and Omnisend campaign activity, current schedules, local campaign calendars, recipient eligibility, suppressions, received seeds, approvals, and duplicate state to decide whether any non-EcommerceBoost email should send today; never expose recipient data."
---

# Non-EcommerceBoost email send audit — August 28, 2026

## Decision

Send zero campaign emails today for Turned Comics, Make Me Jedi, and PopSmiths.

The live audit ran on Friday, August 28, 2026, at approximately 15:39–15:53 America/Los_Angeles. No non-EcommerceBoost campaign is due in the local calendar, no accessible provider schedule contains a queued campaign, and no release-ready independent campaign has the required audience, compliance proof, seed, and approval evidence.

TurnedYellow and all EcommerceBoost work were explicitly excluded. No provider mutation, send, or scheduling action was performed. Existing PopSmiths transactional and lifecycle automation remains in operation; those messages are not campaign broadcasts.

## Turned Comics

SendGrid's pending scheduled-send endpoint returned zero rows. No August 28 campaign is due locally. Four activity records updated today belong to messages processed on earlier dates, not new sends:

- `Australia gets another Father’s Day. We’re borrowing it.`
- `National Dog Day: every dog has an origin story`

The Father’s Day campaign already processed 988 non-test messages on August 20: 5 AU/NZ messages were delivered; 983 US messages were processed, with 981 delivered and 2 bounced. The National Dog Day campaign already processed 1,365 recipients. Neither campaign should be duplicated, and bounced recipients must not be retried.

A fresh aggregate pool contained 5 AU/NZ and 977 US candidates, but it is not a release authorization: no current exact audience binding, received test, approval, or schedule exists. Modern Marketing Single Send inventory remains unobservable because the available API key receives HTTP 403 for that endpoint.

Decision: send nothing today.

## Make Me Jedi

The correct Make Me Jedi Omnisend account shows zero campaigns scheduled for today and zero campaigns sent or started today. The only August 29 records are EcommerceBoost-labelled review drafts and are outside scope.

The independent Father’s Day visual campaign remains an unscheduled immediate-strategy draft with no audience attached. Multiple duplicate Father’s Day drafts exist. A fresh aggregate eligibility rebuild found 8 AU/NZ and 12,040 US candidates after current exclusions, but those candidates are not attached to an approved release.

Release remains blocked by duplicate-draft state, absent final approval, and a received-MIME compliance defect: Omnisend's generated `text/plain` part omits the required physical mailing address.

Decision: send nothing today.

## PopSmiths

SendGrid's pending scheduled-send endpoint returned zero rows, and there is no local August 28 PopSmiths campaign. Modern Marketing Single Send inventory remains unobservable because the available API key receives HTTP 403 for that endpoint.

Today's provider activity is normal application lifecycle or transactional traffic rather than a broadcast campaign. Observed subjects include:

- `See your artwork on canvas, framed print, and more`
- `Your video is ready! 🎬`
- `Do not let this one disappear in your camera roll.`

A National Dog Day record with activity today reflects a later interaction with an older message, not a new send. No new broadcast has an approved audience, current suppression proof, exact received seed, or release approval.

Decision: do not launch a campaign today. Allow the existing lifecycle and transactional automation to continue under its normal eligibility gates.

## Next planned campaign work

The next independent calendar concepts begin September 1. They remain static-review-only and are not yet production-ready. Before release they require fresh audience and suppression reconciliation, provider duplicate inventory, exact received-seed verification, and named final approval.
