---
title: "TurnedComics SendGrid migration decision for National Dog Day 2026"
description: "Account-specific assessment of whether to resend the failed TurnedComics Omnisend campaign through the existing SendGrid account."
publishedAt: "2026-08-17"
tags: [marketing, email, turnedcomics, sendgrid, omnisend, deliverability]
keywords: [TurnedComics, SendGrid, Omnisend, domain authentication, DMARC, unsubscribe groups]
author: "Codex"
source_session: "01a011c0-cf09-7df0-8800-cf351b5f4d6d"
model: "gpt-5"
sources:
  - "user-supplied Omnisend pricing screenshot, 2026-08-17"
  - "SendGrid account API audit, 2026-08-17"
  - "Namecheap DNS API audit, 2026-08-17"
  - "https://www.twilio.com/docs/sendgrid/ui/account-and-settings/how-to-set-up-domain-authentication"
  - "https://www.twilio.com/docs/sendgrid/ui/sending-email/group-unsubscribes"
  - "https://www.twilio.com/docs/sendgrid/ui/sending-email/index-suppressions"
derived_from:
  - "content/marketing/national-dog-day-audience-audit-2026-08-17.md"
regen_prompt: "Re-audit TurnedComics Omnisend and SendGrid plan, sender-domain authentication, suppression handling, and setup time, then refresh the migration recommendation."
---

# TurnedComics SendGrid migration decision

## Decision

Use SendGrid for TurnedComics if the business expects recurring campaigns. The existing SendGrid account has enough prepaid capacity, so the marginal send cost is effectively zero. For a single urgent campaign, upgrading Omnisend is faster, but the recurring $30 base plan is avoidable once SendGrid is configured correctly.

Do not resend the MakeMeJedi campaign: it completed successfully in Omnisend. This decision applies only to the TurnedComics campaign that entered `error` after Omnisend accepted the send request.

## Verified current state

- TurnedComics Omnisend is on the Free plan: 500 monthly emails and 250 contacts.
- The account has 1,762 billable contacts. The screenshot offered Standard at $30/month plus a selected $5/month personalized-content add-on, for $35 before tax. The add-on is not required for this campaign.
- The intended TurnedComics Omnisend segment contains 1,367 subscribed contacts.
- The existing SendGrid account has a 500,000-email monthly allocation, with 497,022 remaining at audit time.
- `turnedcomics.com` is not yet authenticated in that SendGrid account.
- The SendGrid account currently has no Advanced Suppression Management groups.
- `turnedcomics.com` publishes `DMARC p=reject`; its SPF includes Amazon SES and Mailgun but not SendGrid. Sending from SendGrid before domain authentication would create a high rejection/filtering risk.
- DNS is hosted at Namecheap. Read access through the Namecheap API succeeded and returned the current 15 host records, so the DNS change can be automated without replacing unrelated records.

## Required setup

1. Create a SendGrid authenticated-domain configuration for `turnedcomics.com`.
2. Add the generated SendGrid CNAME/TXT records through Namecheap while preserving all existing DNS hosts.
3. Validate the authenticated domain in SendGrid.
4. Create a brand-specific ASM group such as `TurnedComics Marketing`.
5. Export the 1,367 currently subscribed Omnisend contacts.
6. Exclude Omnisend unsubscribes and SendGrid global/group unsubscribes, bounces, invalid addresses, blocks, and spam reports.
7. Adapt the approved HTML to SendGrid ASM unsubscribe tags and include the required postal address.
8. Send one test to `luis@epiloguecapital.com`, inspect it, then send the production campaign with an idempotent campaign identifier.
9. Monitor accepted, delivered, bounced, blocked, spam, unsubscribe, open, and click events.

## Time estimate

- Domain configuration and automated DNS update: 10–15 minutes.
- ASM group, suppression reconciliation, and audience export: 10–15 minutes.
- HTML adaptation, test, and final QA: 15–20 minutes.
- Production send initiation and verification: 5–10 minutes.

Expected hands-on time: **40–60 minutes**, with approximately **45 minutes** likely if DNS verifies promptly. Twilio documents that DNS verification can take up to 48 hours, so propagation is the only material schedule uncertainty.

## Deliverability guardrails

- Do not use the existing authenticated MakeMeJedi or PopSmiths domains as a substitute sender for TurnedComics.
- Do not bypass SendGrid suppression management.
- Use a TurnedComics-specific ASM group so marketing opt-outs do not suppress transactional mail by default.
- Keep the Omnisend subscribed status as the source-consent gate for this one-time migration.
- Do not send until SendGrid reports `turnedcomics.com` as authenticated and a test passes.
