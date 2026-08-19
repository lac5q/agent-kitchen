---
title: Checkout incident recovery and abandoned-cart audit — TurnedComics and PopSmiths
date: 2026-08-18
description: Production audit, repair, consent reconciliation, and delivery outcome for TurnedComics and PopSmiths checkout-recovery email systems.
publishedAt: 2026-08-18
tags:
  - email-operations
  - incident-recovery
  - abandoned-cart
  - turnedcomics
  - popsmiths
keywords:
  - SendGrid
  - Omnisend
  - Shopify
  - cart recovery
  - consent reconciliation
author: Codex
source_session: codex-mkt-hub-checkout-recovery-2026-08-18
model: GPT-5.6
sources:
  - /home/lac5q/github/popsmiths_app/apps/backend/src/services/lifecycle.js
  - /home/lac5q/github/popsmiths_app/apps/backend/src/routes/lifecycle.js
  - /home/lac5q/github/mkt-hub/email/national-dog-day-2026/sendgrid/turnedcomics/run.mjs
  - Omnisend Automations API (2026-03-15)
  - Omnisend Event Metadata API (2026-03-15)
  - SendGrid Email Activity and Suppressions APIs
  - Shopify Admin GraphQL API
derived_from:
  - Live production audit and repair requested after the 2026-08-17 checkout incident
regen_prompt: Re-run the TurnedComics Omnisend trigger-origin audit, PopSmiths lifecycle worker/readiness checks, storefront-click audience reconciliation, provider suppressions, post-campaign purchase exclusions, and delivery verification. Never print PII, signed URLs, or credentials.
---

# Checkout incident recovery and abandoned-cart audit

## Executive result

- TurnedComics abandoned-cart and abandoned-checkout workflows were enabled but listening for `elevar` events. The brand's live Omnisend metadata exposes `shopify` as the origin for added-to-cart, started-checkout, and placed-order events. Both workflows were safely disabled with in-flight contacts kept, patched to `shopify`, re-enabled with `enrollExisting: false`, and verified enabled.
- PopSmiths lifecycle automation was already live on a five-minute worker cadence. A duplicate-checkout bug could have sent multiple recoveries to the same email; it was fixed, tested, committed, and deployed.
- A second PopSmiths issue allowed GET requests to unsubscribe immediately. Email security scanners could therefore opt recipients out merely by previewing/following links. GET now renders a confirmation page; only POST changes preferences.
- Two branded incident-recovery tests were sent to the requested reviewer. SendGrid Email Activity confirmed both as `delivered`.
- TurnedComics production recovery was approved and sent on 2026-08-19 after a fresh consent, suppression, and purchase reconciliation. All three eligible messages were confirmed delivered.

## TurnedComics repair

Live event origins:

- `added product to cart` → `shopify`
- `started checkout` → `shopify`
- `placed order` → `shopify`

Repaired workflows:

- Abandoned Checkout (`690c97c10f6bc84d5037e1f0`): trigger `started checkout/shopify`; exit `placed order/shopify`.
- Abandoned Cart (`68e9d0f2c6a7f2294706276f`): trigger `added product to cart/shopify`; exits `placed order/shopify` and `started checkout/shopify`.

Safety controls:

- `contactsInWorkflow: keep`
- `enrollExisting: false`
- post-update GET verification confirmed both workflows enabled and all trigger/exit origins set to `shopify`

## PopSmiths repair

### Duplicate cart recovery

The checkout table contained multiple incomplete rows for one email. The old query selected rows independently, so one customer could later receive multiple copies of a recovery step.

Fix:

- rank incomplete checkouts by normalized email and select only the newest row
- consider campaign events by normalized email after the newest checkout's creation time
- allow a genuinely new checkout to restart the recovery sequence

Verification:

- focused lifecycle suite: 49 tests passed at the original repair
- production-shaped dry run: 11 checkout rows collapsed to one eligible recipient
- GitNexus change review: low risk, no affected execution process
- commit `31657677`
- Heroku release `v1670`

### Scanner-safe unsubscribe

The same handler processed GET and POST. Security link scanners could therefore create a real opt-out on GET.

Fix:

- GET validates the token and renders a confirmation form without mutating preferences
- POST remains the only state-changing action and still supports RFC 8058 one-click requests because the signed token remains in the URL

Verification:

- GitNexus impact: low upstream blast radius before editing
- GitNexus staged change review: medium risk, confined to three unsubscribe-related flows
- focused lifecycle suite: 51 tests passed
- commit `a3a2a39d`
- Heroku release `v1671`
- `/health` returned 200/healthy
- web and worker dynos were up on `v1671`
- first post-deploy lifecycle worker cycle completed successfully

## Incident-recovery audience

Anonymous visitors cannot be retroactively emailed. Only identified, delivered, consent-eligible recipients with campaign storefront clicks were considered.

### PopSmiths

- 35 unique recipients clicked the actual storefront root; preference/unsubscribe URLs were excluded before hostname classification
- 32 had `marketing_opt_out = true`
- 0 had `all_optional_opt_out = true` in this candidate set
- 0 provider suppression matches returned by the configured endpoints
- 0 post-campaign purchasers
- provisional consent-eligible audience: **3**

Important caveat: a click event is evidence that the tracked URL was followed, not conclusive proof of a human page load. Two storefront-click events had missing/unknown user agents.

### TurnedComics

- 3 unique recipients clicked the product CTA
- all 3 were still subscribed in Omnisend
- 0 provider suppression matches
- 0 post-campaign purchasers
- provisional consent-eligible audience: **3**

## Recovery creative and delivery

Subject used for review tests:

`[TEST · Brand] We fixed the checkout issue`

Core copy:

> You may have run into a problem while trying to finish your order last night. We fixed it, and the site is working again. Your next step is ready whenever you are.

CTA: `Finish your order`

SendGrid accepted both brand tests and Email Activity later reported one matching message per brand with status `delivered`.

## Remaining gate

Before a PopSmiths production recovery send:

1. Reviewer approves both delivered tests.
2. Re-run provider suppression, current preference/subscription, and purchase reconciliation immediately before send.
3. Send only to the final 3 identified PopSmiths recipients.
4. Use provider unsubscribe/preference controls and a send ledger.
5. Verify delivery events after provider acceptance.

## TurnedComics production outcome — 2026-08-19

The reviewer confirmed that turnedcomics.com was working and explicitly approved the production send. Immediate delivery was recorded as an urgency override rather than the default evidence-based scheduling policy.

Fresh preflight:

- 4 identified recipients had delivered clicks to the TurnedComics product CTA
- all 4 remained subscribed in Omnisend
- 1 matched a current SendGrid suppression and was excluded
- 0 matched campaign bounce/drop/spam/unsubscribe events
- 0 had a post-incident Shopify purchase
- final eligible audience: **3**
- sender domain authentication: valid
- TurnedComics ASM group: `37327`

Production subject: `The site is working again`

Outcome:

- accepted: **3**
- failed: **0**
- uncertain: **0**
- confirmed delivered in SendGrid Email Activity: **3**

The per-recipient production ledger stores only SHA-256 recipient hashes and provider message IDs; no subscriber addresses were logged to chat or the knowledge artifact.
