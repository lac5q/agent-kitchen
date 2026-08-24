---
title: "Non-EcommerceBoost email send audit — August 23–24, 2026"
description: "Live provider, ledger, audience, suppression, cadence, seed, and approval audit for whether Turned Comics, Make Me Jedi, or PopSmiths required a send on August 23 or scheduling for August 24."
publishedAt: "2026-08-23"
tags: [email-operations, send-audit, turned-comics, make-me-jedi, popsmiths, sendgrid, omnisend]
keywords: [duplicate prevention, National Dog Day, Father’s Day, suppression reconciliation, production approval]
author: "Codex"
source_session: "mkt-hub non-ecommerceboost Aug 23-24 send audit"
model: "gpt-5-codex"
sources:
  - "mkt-hub:email/national-dog-day-2026/README.md"
  - "mkt-hub:email/national-dog-day-2026/sendgrid/turnedcomics/.send-ledger.ndjson"
  - "mkt-hub:email/checkout-incident-recovery-2026-08-19/turnedcomics/.run-ledger.ndjson"
  - "mkt-hub:email/popsmiths-style-followup-2026/QA.md"
  - "live:SendGrid Turned Comics activity and scheduled-send APIs checked 2026-08-23"
  - "live:SendGrid PopSmiths activity, suppression, and scheduled-send APIs checked 2026-08-23"
  - "live:Make Me Jedi Omnisend campaign and segment APIs checked 2026-08-23"
derived_from:
  - "content/marketing/fall-black-friday-email-program-2026-08-23.md"
  - "mkt-hub:email/au-fathers-day-2026/"
regen_prompt: "Reconcile live SendGrid and Omnisend campaign activity, local idempotency ledgers, current audiences and suppressions, lifecycle candidates, received seeds, approvals, and provider schedules to decide whether any non-EcommerceBoost email must send today or be scheduled tomorrow; never expose recipient data."
---

# Non-EcommerceBoost email send audit — August 23–24, 2026

## Decision

No production email should be sent on Sunday, August 23, and no email should be scheduled for Monday, August 24, 2026, for Turned Comics, Make Me Jedi, or PopSmiths.

The audit ran after 21:00 America/Los_Angeles. There was no evidence-backed same-day obligation, and every nearby campaign was either already processed or failed one or more consent, suppression, duplicate, received-seed, approval, or cadence gates. No provider or repository mutation was performed.

TurnedYellow and all EcommerceBoost campaigns were excluded from scope.

## Turned Comics

### National Dog Day

Subject: `National Dog Day: every dog has an origin story`

The campaign ledger records 1,365 accepted messages on August 18 UTC. Fresh reconciliation found 1,367 subscribed contacts, 62 provider suppressions, all 1,365 campaign recipients already processed, and zero eligible recipients remaining. A capped live activity result contained 975 delivered and 25 not-delivered records among its first 1,000 results; accepted is not treated as delivered.

Decision: already executed. Do not resend.

### AU/NZ Father’s Day visual-v3

Live provider activity showed 988 non-test production messages, exactly matching the prepared audiences:

- AU/NZ: 5 processed, all 5 delivered.
- US: 983 processed, 981 delivered and 2 confirmed bounces.

Decision: already executed. Do not duplicate the campaign and do not retry the two confirmed bounces. The repository QA note still describing production as blocked is stale; live provider activity is authoritative.

SendGrid’s pending Mail Send schedule list was empty. Modern Marketing Single Send inventory remained inaccessible because the available key lacks the relevant scope.

## Make Me Jedi

### National Dog Day

Subject: `National Dog Day, in a galaxy far from ordinary`

Omnisend shows the campaign as sent. It started August 17 at 21:18 PDT and completed about 30 seconds later. Its current included segment is ready with 7,665 contacts, but that dynamic segment is not a safe basis for a new send because it lacks positive geography and current cadence/purchaser exclusions.

Decision: already executed. Do not resend.

### AU/NZ Father’s Day

The current AU/NZ and US visual-v3 campaigns remain drafts with immediate strategy, no schedule, empty included audiences, and empty excluded audiences. Multiple older duplicates also exist.

Release remains blocked by:

- no independent positively geolocated non-EcommerceBoost audience;
- no fresh suppression, purchaser, cadence, and portfolio-cap reconciliation;
- Omnisend-generated `text/plain` omitting the required postal address;
- no compliant exact received MIME proof;
- no named final production approval;
- unresolved duplicate-draft inventory.

Decision: do not send or schedule.

## PopSmiths

### National Dog Day

Subject: `National Dog Day, gallery-ready.`

The campaign ran August 17 PDT: 876 accepted and 860 confirmed delivered. A fresh dry-run found 35 records not in the historical campaign ledger, but 17 are now provider-suppressed and the remaining 18 lack explicit positive consent evidence. The older campaign path also omitted the PopSmiths ASM group, and its old approval is not bound to this new population.

Decision: already executed for the approved audience. Do not expand or resend.

### Other recent programs and lifecycle

- `Australia says pet dads deserve two Father’s Days`: 107 delivered on August 20 PDT.
- Style crossover: 533 delivered on August 20 PDT and formally closed.
- Current lifecycle audit: zero valid art-ready, reminder, nudge, cart, welcome, or post-purchase sends.
- One welcome candidate is opted out.
- Two Monday catch-up candidates match current bounce suppressions and lack positive consent.

The latest broad recipients remain inside the 72-hour cooldown. SendGrid’s pending scheduled-send list is empty. Marketing Single Send inventory remains unavailable because the key lacks Marketing scope.

Decision: do not send or schedule.

## Next planned work

The first unsent calendar concept for each managed brand is September 1. All three remain static-review-only and lack release-time audience reconciliation, received seed/approval evidence, duplicate inventory, and provider schedules. They are not due August 23–24.

## Operational correction

Static repository manifests and QA notes must not be treated as proof that a campaign is unsent. Before every release, reconcile the exact subject/campaign identity against live provider activity and the local idempotency ledger. Live evidence of prior processing blocks duplicate sends, and confirmed bounces must never be retried.

