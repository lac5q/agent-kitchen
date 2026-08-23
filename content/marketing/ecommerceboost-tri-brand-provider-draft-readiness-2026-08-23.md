---
title: "EcommerceBoost August 2026 tri-brand provider draft readiness"
description: "Live audience reconciliation, MakeMeJedi Omnisend segment/template/draft creation, SendGrid access blockers, PopSmiths qualification gaps, and release gates for the August 25, 27, and 29 campaigns."
publishedAt: "2026-08-23"
tags: [marketing, email, ecommerceboost, makemejedi, turnedcomics, popsmiths, omnisend, sendgrid, audience, compliance]
keywords: [EcommerceBoost August 2026, Omnisend drafts, SendGrid Marketing Campaigns, MakeMeJedi segments, TurnedComics audience, PopSmiths consent]
author: "Codex"
model: "gpt-5"
sources:
  - "Live Make Me Jedi Omnisend API reads and writes, 2026-08-23"
  - "Live Turned Comics Omnisend consent and SendGrid suppression reads, 2026-08-23"
  - "Live PopSmiths production database, site, and SendGrid suppression reads, 2026-08-23"
  - "https://api-docs.omnisend.com/reference/post_contacts-tags"
  - "https://api-docs.omnisend.com/reference/post_segments"
  - "https://api-docs.omnisend.com/reference/post_images-upload"
  - "https://api-docs.omnisend.com/docs/how-to-send-email-campaign"
  - "https://www.twilio.com/docs/sendgrid/api-reference/api-key-permissions"
  - "https://www.twilio.com/docs/sendgrid/api-reference/single-sends/create-single-send"
  - "https://www.popsmiths.com/"
  - "https://turnedyellow.slack.com/archives/C09H9LG0Y85/p1787486687708099"
  - "https://turnedyellow.slack.com/archives/C0982PYLYTV/p1787486686881339"
  - "https://turnedyellow.slack.com/archives/C0ACMS863TR/p1787486685965269"
derived_from:
  - "content/marketing/turned-yellow-next-three-tri-brand-review-handoff-2026-08-23.md"
  - "/home/lac5q/github/mkt-hub/email/ecommerceboost-august-2026/PHASE-CONTRACT.md"
  - "/home/lac5q/github/mkt-hub/email/ecommerceboost-august-2026/makemejedi/"
  - "/home/lac5q/github/mkt-hub/email/ecommerceboost-august-2026/turnedcomics/"
  - "/home/lac5q/github/mkt-hub/email/ecommerceboost-august-2026/popsmiths/"
regen_prompt: "Re-read every listed provider resource and suppression source, regenerate exact consent-safe audiences within 48 hours of each intended send, compare provider draft/template/segment IDs for duplicates, verify sender and compliance state, and report changes without calling any send or schedule endpoint."
---

# EcommerceBoost tri-brand provider draft readiness

## Outcome

MakeMeJedi is loaded in its own Omnisend account for final creative review: two market review segments, one hosted first-party image, six templates, and six audience-attached campaign drafts now exist. All six campaigns independently read back as `draft`. Their intended schedule settings are stored in the draft objects, but no campaign send, test-email, or scheduling endpoint was called.

TurnedComics and PopSmiths were not loaded into SendGrid. The only available SendGrid credential lacks all Marketing Campaigns scopes, the modern list/segment/Single Send inventories return HTTP 403, and no Marketing sender ID is visible. Expanding that key would be a credential-scope escalation. PopSmiths also lacks positive country and pet-qualification evidence for the current market-specific pet creative, so access alone would not make its audience safe.

## MakeMeJedi live provider state

Brand: Make Me Jedi (`68d6bddb656d7043634a21e6`), `America/Los_Angeles`.

Sender: `Make Me Jedi <contact@makemejedi.com>`.

### Hosted image

- Image ID: `6a8adce5bb7c87eee29bc1df`
- Source asset SHA-256: `a6763aae2d3e3f3f6d099a1ced7cd56846a7697306a7879f39951fe27cb4e090`
- The six imported HTML templates reference the Omnisend-hosted copy rather than the unusable repository-relative image path.

### Review audiences

| Market | Segment ID | Exact member readback | Recipient-set hash | Contact-ID set/file hash |
|---|---|---:|---|---|
| AU/NZ | `6a8add17ed80e9688a850901` | 8 | `2642b8faacdcdc39d566aeb8d88f6219a10e2b85808c6d3e9603c96dc05f8e41` | `b5d6f0f8ee790b3bd5e36006b7335061598b93908096cf820e34c67a30a04a67` |
| US | `6a8add3861da0421f84b8b2c` | 12,044 | `839cebbc859021f2b133105c6eee8c502a8e1de979f903a45c5a028836bcb6cd` | `c49aad5699f862b61fffa277915c06f0d08d191909a8c76c22eb1bec00e7786e` |

Each segment requires current email subscription status plus a unique, snapshot-bound tag applied only to the reconciled contact IDs. Every draft also excludes suppression segment `6922e33ac3dd23a40047f29f` (`Email Spam or Bounce Once`).

The Omnisend US statistics endpoint reports 12,168 while the segment member endpoint returned exactly 12,044 unique locked IDs in two independent full traversals: zero extras, zero missing IDs, and zero duplicates. This is provider statistics-cache drift. Do not use the statistics total as release evidence; member enumeration is authoritative until the cache converges.

### Draft and template inventory

| Date | Market | Template ID | Campaign ID | Content ID | Planned UTC | State |
|---|---|---|---|---|---|---|
| 2026-08-25 | AU/NZ | `6a8ae17ee68709ba049372c2` | `6a8ae17f9f86af1574263d18` | `6a8ae17f34d1a3f692e74a83` | `2026-08-25T17:30:00.353Z` | draft |
| 2026-08-25 | US | `6a8ae180e68709ba049372c7` | `6a8ae1809f86af1574263d19` | `6a8ae18034d1a3f692e74a84` | `2026-08-25T17:30:00.353Z` | draft |
| 2026-08-27 | AU/NZ | `6a8ae181e68709ba049372cc` | `6a8ae182acf7f941f7da7f73` | `6a8ae1828ea9310ccc28d72e` | `2026-08-27T17:30:00.353Z` | draft |
| 2026-08-27 | US | `6a8ae182f60edf5d1732c858` | `6a8ae1839f86af1574263d1a` | `6a8ae18334d1a3f692e74a89` | `2026-08-27T17:30:00.353Z` | draft |
| 2026-08-29 | AU/NZ | `6a8ae184e68709ba049372d1` | `6a8ae1849f86af1574263d1b` | `6a8ae18434d1a3f692e74a8a` | `2026-08-29T17:00:00.353Z` | draft |
| 2026-08-29 | US | `6a8ae185f60edf5d1732c85d` | `6a8ae1859f86af1574263d1c` | `6a8ae18534d1a3f692e74a8b` | `2026-08-29T17:00:00.353Z` | draft |

Every readback proved the correct subject, preheader, sender identity, nonempty included market segment, suppression exclusion, `scheduled` strategy, stored UTC time, and timezone optimization. A stored schedule configuration does not schedule an Omnisend draft; status changes only after the separate send endpoint is called.

### MakeMeJedi release gates

The review snapshot was generated at `2026-08-23T11:36:10.496Z`, about 54 hours before the August 25 target. It is valid for review, not release. Create a fresh date-specific release tag/segment and patch the matching draft within 48 hours of every send, then repeat full membership and suppression reconciliation.

The received-MIME compliance blocker remains open. Prior Omnisend HTML-import seeds passed SPF, DKIM, DMARC, and one-click unsubscribe, but Omnisend-generated `text/plain` omitted the postal address. Omnisend's documented text-only theme creates a separate text-only campaign and does not prove a compliant plain-text alternative for the visual campaign. Do not send until an actual received seed proves the postal address and unsubscribe content in both MIME alternatives, followed by named approval.

## TurnedComics live readiness

Current consent- and suppression-adjusted review audiences:

| Market | Eligible | Audience hash |
|---|---:|---|
| AU/NZ | 5 | `e506148557dfb6434b58e73da426494c6ac8383eaa13651e86219e34fe43f898` |
| US | 978 | `fb186ca5fc80caff6bb86c231e16617a17f27e9d0824898440dc3d0311ef1d6f` |

Live SendGrid suppression union: 829, fingerprint `f19745dc72c624153fcce228ea2df54378126d476543981dae8c9f57e62d0fb7`.

Identity is otherwise valid: authenticated domain `turnedcomics.com` ID `32419984`, ASM group `37327`, and intended sender `Turned Comics <contact@turnedcomics.com>`. The available key has 208 scopes but no `marketing.*`; lists, contacts, Segments V2, and Single Sends all return 403. The verified-senders endpoint returns zero rows, and the sender inventory endpoint is itself blocked.

No TurnedComics provider resource was created. A separate owner-approved least-privilege Marketing Campaigns key plus sender inventory is required. Cadence approval is also required: all 983 currently eligible recipients overlap the August 18 provider-accepted National Dog Day audience. Provider acceptance is not delivery evidence.

## PopSmiths live readiness

The attestation-bounded consent-safe cohort is 543. The current executable market-specific audience is nevertheless zero:

- Positive AU/NZ country evidence: 0.
- Positive US country evidence: 0.
- Explicit pet-qualified overlap for the pet-specific creative: 0.

The production database has no relevant country/timezone field, and IP addresses were not sent to a third-party geolocation service. The live PopSmiths site still supports the claim `Free preview before checkout`, but claim validity does not cure audience qualification.

Identity is valid: authenticated domain `popsmiths.com` ID `29501036`, ASM group `37361`, intended sender `PopSmiths <hello@popsmiths.com>`. Live suppression union: 816, hash `83179f94777594b86837b4af8dab9ef1a36caba847bfcd3c7c855c615f9e8b79`.

No PopSmiths provider resource was created. Before loading, obtain first-party country evidence plus pet qualification, or approve a market-neutral/general-copy revision with a separately justified audience. SendGrid Marketing Campaigns access and sender inventory are also still required.

## Slack review updates

- MakeMeJedi loaded-state reply: https://turnedyellow.slack.com/archives/C09H9LG0Y85/p1787486687708099
- TurnedComics access-blocker reply: https://turnedyellow.slack.com/archives/C0982PYLYTV/p1787486686881339
- PopSmiths qualification-blocker reply: https://turnedyellow.slack.com/archives/C0ACMS863TR/p1787486685965269

All three updates remain tied to the existing Penpot review handoff. No seed, production send, or schedule activation occurred.

## Required next decisions

1. Approve creating a separate least-privilege SendGrid Marketing Campaigns credential and complete sender inventory for TurnedComics. Do not broaden the current send key implicitly.
2. Decide how PopSmiths will obtain first-party country and pet evidence, or approve a general-copy/audience change.
3. For MakeMeJedi, approve creative updates in the existing drafts, then resolve the received-plaintext compliance issue before any release action.
4. Regenerate every final audience and suppression set inside the 48-hour release window, bind approval to the exact content/audience hashes, and keep draft creation, seed, schedule activation, and production send as distinct gates.
