---
title: "Brand Email Automation Status"
description: "Live-readiness matrix for Shopify Messaging, SendGrid, and Omnisend across PopSmiths, TurnedYellow, MakeMeJedi, TurnedWizard, and TurnedComics."
publishedAt: "2026-08-21"
tags: ["email", "automation", "sendgrid", "omnisend", "shopify", "operations"]
keywords: ["PopSmiths", "TurnedYellow", "MakeMeJedi", "TurnedWizard", "TurnedComics", "delivery readiness"]
author: "Codex"
model: "gpt-5.6-sol with gpt-5.6-luna subagents"
sources:
  - "SendGrid shared-account API, read-only audit, 2026-08-21"
  - "Omnisend current API, read-only audit, 2026-08-21"
  - "Shopify Admin PopSmiths Messaging screenshot, 2026-08-21"
  - "https://api-docs.omnisend.com/v2026-preview/reference/automations"
  - "https://help.shopify.com/en/manual/promoting-marketing/create-marketing/shopify-messaging/marketing-automations/create"
derived_from:
  - "content/research/popsmiths-email-brand-routing-audit-2026-08-19.md"
regen_prompt: "Re-query the live Omnisend automation APIs, SendGrid account configuration, PopSmiths Shopify Messaging status, and the PopSmiths lifecycle deployment; produce a brand-by-brand matrix separating enabled configuration from verified delivery."
---

# Executive Summary

No brand has end-to-end delivery proved solely by this audit; enabled automations and valid API credentials show that a provider can process events, but not that a recipient received a message. The immediate status is:

| Brand | Current marketing automation owner | Working configuration | Delivery readiness | Main finding |
|---|---|---|---|---|
| PopSmiths | SendGrid lifecycle application | Yes, production lifecycle flags and 23 campaign settings were verified on 2026-08-19 | Needs current delivery-event verification | Shopify Messaging has no activated automation; legacy Checkout setting remains unverified. |
| TurnedYellow | Omnisend | Yes, 19 of 19 automations enabled | Eligible to process events; delivery not proved | Nine overlapping cart, checkout, browse, site-abandonment, Aimerce, and Elevar flows create a high duplicate-send risk. |
| MakeMeJedi | Omnisend | Yes, 13 of 15 automations enabled | Eligible to process events; delivery not proved | Seven active abandonment paths overlap across Shopify, Elevar, and Aimerce. |
| TurnedWizard | Omnisend | Yes, 4 of 4 automations enabled | Eligible to process events; delivery not proved | Lowest-complexity Omnisend brand; one active Shopify abandoned-checkout flow. |
| TurnedComics | Omnisend, with a separate guarded SendGrid recovery runner | Yes, 5 of 9 automations enabled | Eligible to process events for enabled flows; delivery not proved | Three active abandonment paths remain; Checkout, Welcome, Order Confirmation, and one Elevar cart flow are paused. |

## Provider Findings

### Shopify Messaging

The PopSmiths Shopify Messaging page shows `0 of 5 tasks complete`: only onboarding templates are visible. No active Shopify Messaging automation was found in that view. Do not activate its abandoned-checkout, abandoned-cart, browse, welcome, or thank-you templates while SendGrid owns PopSmiths lifecycle mail.

This does not prove that the older Shopify checkout-level abandoned-checkout email is off. That setting must still be inspected in Shopify Admin under **Settings > Checkout**. It is the most likely source of the Portrified-branded email reported on 2026-08-19.

Native Shopify Checkout/Flow status for TurnedYellow and MakeMeJedi could not be verified because the available Shopify credentials were invalid. Treat this as an open duplicate-send risk wherever Omnisend abandoned-cart or checkout flows are enabled.

### SendGrid

The shared account has a reputation score of 97 and valid domain authentication (mail and DKIM records) for `popsmiths.com`, `makemejedi.com`, `turnedcomics.com`, `turnedwizard.com`, and `turnedyellow.com`. This removes sender-domain authentication as a migration blocker.

Marketing suppression groups exist for PopSmiths, MakeMeJedi, and TurnedComics. They do not yet exist for TurnedYellow or TurnedWizard, so those brands are not ready to move marketing automation to SendGrid. SendGrid's current API credential lacks access to sender identities, Marketing single sends, automations, lists, and aggregate campaign metrics; active SendGrid automations and delivery totals are therefore unverified.

### Omnisend

All four Omnisend credentials authenticated successfully and report their stores as connected. This proves API and account connectivity, not message delivery, sender authentication, event ingestion, consent, suppression reconciliation, or inbox placement.

| Brand | Total | Enabled | Paused | Active abandonment coverage |
|---|---:|---:|---:|---|
| TurnedYellow | 19 | 19 | 0 | 9 flows across Shopify cart/checkout/browse, Elevar cart, and Aimerce cart/checkout/browse/site. |
| MakeMeJedi | 15 | 13 | 2 | 7 active flows across Shopify checkout, Elevar cart, and Aimerce cart/checkout/browse/site. |
| TurnedWizard | 4 | 4 | 0 | 1 Shopify abandoned-checkout flow. |
| TurnedComics | 9 | 5 | 4 | 3 active flows: Shopify checkout/cart plus Elevar product abandonment. |

The paused MakeMeJedi flows are `Customer Reactivation Split No.2` and `EB - Sunset Unengaged`. The paused TurnedComics flows are `Elevar Copy Abandoned Cart`, `Order Confirmation`, `Abandoned Checkout`, and `Welcome`.

No dedicated PopSmiths Omnisend credential was found. The connected Omnisend app session resolves to TurnedYellow, not PopSmiths.

## Conclusions

1. **PopSmiths is not using active Shopify Messaging automations.** Keep all onboarding templates off. Confirm the legacy checkout-level abandoned-checkout setting is off, then make SendGrid the sole marketing owner.
2. **TurnedYellow is configured but unsafe to call healthy.** Its 19 enabled flows and nine overlapping abandonment paths make duplicate or competing messages likely until the event ownership is consolidated.
3. **MakeMeJedi is configured but also overlapping.** It needs an abandonment-flow consolidation before any provider migration.
4. **TurnedWizard is the clean migration pilot.** Its active configuration is small enough to model and replace safely.
5. **TurnedComics has partial automation coverage.** Five workflows are enabled, four are paused, and it already has a guarded SendGrid recovery runner. It is the next-best pilot after TurnedWizard.

## Required Verification Before Calling a Brand Fully Working

For each brand, run a seed checkout/cart test and verify: event ingestion, one and only one message sequence, authenticated From domain, unsubscribe/suppression behavior, provider accepted status, and receipt in a monitored inbox. Record results separately from the configuration counts above.

## Recommended Next Actions

1. In PopSmiths Shopify Admin, inspect **Settings > Checkout > Abandoned checkout emails** and turn the legacy automatic email off if it is enabled.
2. Build a one-page per-brand event-ownership map: Shopify transactional, Omnisend or SendGrid marketing, never both for the same cart/checkout step.
3. Create dedicated SendGrid marketing suppression groups for TurnedYellow and TurnedWizard before migration.
4. Pilot TurnedWizard with one welcome and one canonical abandonment sequence; exit contacts from the old Omnisend workflow before enabling its SendGrid replacement.
5. Consolidate TurnedYellow's nine overlapping abandonment flows before attempting a SendGrid cutover.

No provider, store, or workflow settings were changed by this audit.
