---
title: "TurnedComics SendGrid setup status and MakeMeJedi migration recommendation"
description: "Verified post-setup state for TurnedComics and an account-specific recommendation for avoiding the September MakeMeJedi Omnisend renewal."
publishedAt: "2026-08-17"
tags: [marketing, email, turnedcomics, makemejedi, sendgrid, omnisend, deliverability]
keywords: [SendGrid migration, Omnisend renewal, MakeMeJedi, TurnedComics, consent migration, email automations]
author: "Codex"
source_session: "01a011c0-cf09-7df0-8800-cf351b5f4d6d"
model: "gpt-5"
sources:
  - "SendGrid account and API audit, 2026-08-17"
  - "Omnisend brand APIs and user-provided September renewal amount, 2026-08-17"
  - "Namecheap DNS API verification, 2026-08-17"
  - "Gmail received-message header audit, 2026-08-17"
  - "https://www.twilio.com/docs/sendgrid/api-reference/domain-authentication/authenticate-a-domain"
  - "https://www.twilio.com/docs/sendgrid/api-reference/suppressions-unsubscribe-groups/create-a-new-suppression-group"
  - "https://www.twilio.com/docs/sendgrid/for-developers/sending-email/suppressions"
  - "https://api-docs.omnisend.com/reference/get_contacts"
derived_from:
  - "content/marketing/turnedcomics-sendgrid-migration-decision-2026-08-17.md"
  - "content/marketing/national-dog-day-audience-audit-2026-08-17.md"
regen_prompt: "Re-audit TurnedComics and MakeMeJedi domain authentication, SendGrid quota, Omnisend audiences, suppressions, automations, and current pricing, then refresh the platform migration recommendation."
---

# Email platform migration status and recommendation

## Decision

Move MakeMeJedi broadcast campaigns to the existing SendGrid account before the September Omnisend renewal. At the stated $300 monthly renewal, the avoidable annual platform cost is **$3,600**, assuming the existing SendGrid allocation remains sufficient.

Do not cancel MakeMeJedi Omnisend solely because broadcast sending has moved. First migrate the contact/consent source of truth and either rebuild, replace, or explicitly retire every revenue-producing automation.

## TurnedComics verified setup state

- SendGrid authenticated domain `turnedcomics.com` was created as domain ID `32419984` with `em.turnedcomics.com` as its return path.
- Three SendGrid CNAME records were appended through the Namecheap API. All 15 pre-existing DNS records were preserved; the post-write zone contained 18 records.
- SendGrid validated the return-path CNAME and both rotating DKIM CNAMEs. Domain authentication is valid under the existing `DMARC p=reject` policy.
- The brand-specific `TurnedComics Marketing` ASM group was created as group ID `37327`.
- The source audience remains Omnisend segment `6a83cae66556c429fe55ccfb`, which contains 1,367 subscribed contacts.
- SendGrid suppression reconciliation excluded two members of that source audience, leaving 1,365 currently eligible recipients.
- A SendGrid test from `contact@turnedcomics.com` to `luis@epiloguecapital.com` was accepted with message ID `_6SOb8c0RyqjUygzo33JUQ` and arrived in Gmail's inbox under Promotions.
- The received test passed SPF, DKIM, and DMARC. Gmail showed both `List-Unsubscribe` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click` headers generated from the attached ASM group.
- Production was explicitly approved as a critical same-day urgency override. SendGrid accepted all 1,365 preflight-eligible recipients with zero Mail Send API failures.
- Accepted is not equivalent to delivered. Provider delivery, bounce, block, spam, unsubscribe, click, and conversion events must be monitored separately.

## Post-send hardening

An independent Luna Max review identified and the primary agent corrected three future-run issues:

- SendGrid group suppressions are returned as email strings and are not paginated; the runner now parses the correct response and avoids an infinite pagination loop.
- The Omnisend credential now verifies the `Turned Comics` brand, and contacts must also have explicit `status: subscribed` even though the source segment already encodes that condition.
- A production lock now prevents concurrent runs. Network errors and provider 5xx responses remain `uncertain` and cannot be retried until reconciled; only definite 4xx failures are retryable.

The completed campaign's hashed ledger causes the next preflight to report zero eligible recipients, preventing an accidental resend.

## MakeMeJedi economics and readiness

- The user reports a $300/month Omnisend charge beginning in September.
- The current SendGrid account had 497,022 of 500,000 monthly credits remaining at audit time.
- `makemejedi.com` is already authenticated and valid in the same SendGrid account, eliminating the DNS propagation step required for TurnedComics.
- The prepared MakeMeJedi Omnisend audiences were 7,824 high/medium-engagement subscribers and 12,842 high/medium/low-engagement subscribers.
- At either audience size, normal broadcast volume fits comfortably inside the already-paid SendGrid allocation.

## Migration boundary

There are two distinct projects:

1. **Move broadcast sending.** Create a MakeMeJedi ASM group, adapt the approved template/runner, reconcile provider suppressions, send a test, and send with an explicit production gate. Expected hands-on time: approximately 30–45 minutes because the sender domain is already valid.
2. **Exit Omnisend.** Export contacts plus subscription status into a durable first-party store, preserve consent evidence, ingest SendGrid unsubscribe/bounce/spam events, and audit every Omnisend automation and form dependency. The contact/suppression foundation is likely a few hours; automation parity must be estimated only after inventorying the live workflows.

## Cancellation checklist

- Export every MakeMeJedi contact with current email subscription state and the available consent metadata.
- Choose the durable audience store that will replace Omnisend as the source of truth.
- Create a MakeMeJedi-specific SendGrid ASM group; do not share the TurnedComics group.
- Reconcile SendGrid global unsubscribes, group unsubscribes, bounces, invalid addresses, blocks, and spam reports before each broadcast.
- Configure webhook processing so new provider suppressions update the durable consent store.
- Inventory welcome, abandoned-cart, browse-abandonment, post-purchase, win-back, form, and segmentation dependencies.
- Rebuild or deliberately retire each live automation, then compare revenue and delivery behavior.
- Send seed tests, verify authentication and unsubscribe behavior, and run one controlled production broadcast.
- Retain Omnisend until the replacement has passed the controlled send and automation audit.

## Recommendation

Proceed with the MakeMeJedi SendGrid broadcast migration now. Treat the September cancellation as a separate gated milestone: cancel only after the consent store and active automations no longer depend on Omnisend. This captures the likely $3,600 annual savings without risking unsubscribes, compliance state, or lifecycle revenue.
