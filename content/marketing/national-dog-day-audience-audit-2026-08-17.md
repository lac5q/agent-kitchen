---
title: "National Dog Day 2026 audience audit — MakeMeJedi, TurnedComics, and PopSmiths"
description: "Consent-safe audience counts and targeting recommendation for the August 2026 National Dog Day campaigns."
publishedAt: "2026-08-17"
tags: [marketing, email, audience, consent, omnisend, shopify, national-dog-day]
keywords: [MakeMeJedi, TurnedComics, PopSmiths, Omnisend, Shopify, email audience, consent]
author: "Codex"
model: "gpt-5"
sources:
  - "https://api-docs.omnisend.com/reference/get_contacts"
  - "https://api-docs.omnisend.com/reference/post_campaigns"
  - "https://shopify.dev/docs/api/admin-graphql/latest/objects/CustomerEmailMarketingConsentState"
  - "https://shopify.dev/docs/api/admin-graphql/latest/queries/customerscount"
  - "MakeMeJedi Omnisend brand:68d6bddb656d7043634a21e6"
  - "TurnedComics Shopify Admin API read-only audience audit"
  - "PopSmiths production database consent and suppression audit"
derived_from:
  - "content/marketing/popsmiths-national-dog-day-subject-line-research-2026-08-17.md"
regen_prompt: "Re-audit consent-safe National Dog Day email audiences for MakeMeJedi, TurnedComics, and PopSmiths from current Omnisend, Shopify, and PopSmiths sources; report subscribed, excluded, and sendable counts without exposing addresses or credentials."
---

# National Dog Day 2026 audience audit

Audit performed on August 17, 2026 (America/Los_Angeles). Counts are point-in-time and must be rechecked immediately before an audience send.

## Recommendation

- **MakeMeJedi:** Target a new transparent **Engaged Subscribers** segment: email subscription status `subscribed` AND engagement tag `engagement_high` or `engagement_medium`. Identifier-level validation finds **7,824 unique subscribed contacts** in this cohort: 3,978 high engagement plus 3,846 medium engagement, with zero overlap. Do not describe historical segment `6937e74a6309f67af1bc42a0` as pet-interest; it is reused across unrelated campaigns and its rules are not readable with the current credential.
- **TurnedComics:** Target active Omnisend email subscribers, but reconcile the count against Shopify before sending. Shopify contains **1,042 customers with explicit SUBSCRIBED email-marketing consent and valid email formats**. It also contains **32 UNSUBSCRIBED** and **60 NOT_SUBSCRIBED** customers, which must remain excluded. The final Omnisend sendable count can be lower because of provider suppressions or synchronization differences.
- **PopSmiths:** The completed production send used the compliant union of customers and OMS imports, then applied local and provider suppression checks. **876 messages were accepted with 0 failures**. An additional **80 unique addresses** exist across auxiliary tables, but those tables do not contain explicit marketing-consent evidence, so the addresses were excluded.

## MakeMeJedi evidence

- Omnisend brand verified as `Make Me Jedi` (`68d6bddb656d7043634a21e6`).
- The convenience query parameter `status=subscribed` returned only 313 records and materially undercounted the active audience. It is not suitable for campaign sizing in this account.
- Identifier-level validation controls the recommendation: `engagement_high` contains **3,978** contacts whose email identifier is subscribed; `engagement_medium` contains **3,846**; their intersection is zero, producing a **7,824-contact engaged union**.
- `engagement_low` contains another **5,018** contacts whose email identifier is subscribed. High, medium, and low together account for at least **12,842** subscribed contacts, before any unclassified subscribers.
- Historical segment `6937e74a6309f67af1bc42a0` contains **7,569 total contacts**, including **6,313** whose email identifiers are subscribed and have recorded email consent. Because the segment appears on unrelated campaigns and its rules cannot be read with the current key, it is not a defensible pet-interest proxy.
- The most recent listed campaign was sent July 21, 2026, so this August 17 preparation does not conflict with a same-day campaign in the accessible history.

## TurnedComics evidence

The Omnisend key configured in the mkt-hub MCP returns HTTP 403 and no dedicated TurnedComics Omnisend credential is present in the checked 1Password vaults. Therefore the live Omnisend population and segment inventory could not be audited.

A read-only Shopify Admin GraphQL audit covered all 1,134 customers:

| Email marketing state | Count | Treatment |
|---|---:|---|
| SUBSCRIBED with valid format | 1,042 | Eligible source population |
| UNSUBSCRIBED | 32 | Exclude |
| NOT_SUBSCRIBED | 60 | Exclude |

Before an Omnisend production send, compare Omnisend active subscribers with the Shopify 1,042 consented-customer ceiling and investigate any material surplus rather than assuming consent.

## Credential and execution blockers

- The MakeMeJedi 1Password Omnisend key can read contacts and campaigns but lacks `segments.read`, `segments.write`, `email-templates.read`, and `email-templates.write`. Omnisend rejected segment creation and HTML template import with HTTP 403. No MakeMeJedi draft or test email was created from that key.
- The TurnedComics mkt-hub Omnisend key returns HTTP 403 even for brand verification, and no valid TurnedComics Omnisend key was found in the checked 1Password vaults. No TurnedComics draft or test email was created.
- No audience send endpoint was called for either MakeMeJedi or TurnedComics.

## Required next action

Create or replace brand-specific Omnisend keys with these scopes:

- `campaigns.read`
- `campaigns.write`
- `email-templates.read`
- `email-templates.write`
- `contacts.read`
- `segments.read`
- `segments.write`
- `images.write` (needed to host the TurnedComics dog-specific campaign hero)

Store the TurnedComics key in the CLI-visible `AgentWritable` vault, and update the MakeMeJedi item with the missing segment and template scopes. Then create the engaged-subscriber segment, import the reviewed HTML templates, create draft campaigns with the audiences above, and send tests only to the approved test address before requesting production-send approval.

## Correction log

An earlier pass inferred that historical segment `6937e74a6309f67af1bc42a0` represented pet interest because it appeared on a copied pet campaign and because `GET /contacts?segmentID=...&status=subscribed` returned 277 records. Broader campaign-history review showed the segment was reused on unrelated campaigns, and identifier-level reads showed the status filter materially undercounted subscribers. The temporary classification tags based on that inference were removed. No campaign or email was sent from the incorrect interpretation.
