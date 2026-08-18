---
title: "MakeMeJedi and TurnedComics: SendGrid Campaign / Lifecycle Email Transition Analysis"
description: "Evidence-backed architecture recommendation and migration plan for moving broadcast campaigns to SendGrid while retaining lifecycle automations in Omnisend or Shopify."
publishedAt: "2026-08-18"
tags: [email, sendgrid, omnisend, shopify, makemejedi, turnedcomics, architecture]
keywords: [broadcast campaigns, abandoned cart, abandoned checkout, consent synchronization, suppressions, lifecycle automation]
author: "Codex"
source_session: "Codex desktop task 2026-08-18"
model: "gpt-5.6"
sources:
  - "local:/home/lac5q/github/mkt-hub/email/national-dog-day-2026/sendgrid/turnedcomics/run.mjs"
  - "local:/home/lac5q/github/mkt-hub/email/national-dog-day-2026/omnisend/prepare-campaigns.mjs"
  - "local:/home/lac5q/github/mkt-hub/paperclip/handdrawn/email/makemejedi-abandoned-cart-sequence.md"
  - "local:/home/lac5q/github/mkt-hub/paperclip/handdrawn/email/turnedcomics-abandoned-cart-sequence.md"
  - "live:SendGrid API read-only configuration and category statistics, 2026-08-18"
  - "live:Omnisend API read-only brand and segment statistics, 2026-08-18"
  - "https://www.twilio.com/docs/sendgrid/api-reference/mail-send/mail-send"
  - "https://www.twilio.com/docs/sendgrid/api-reference/webhooks/create-an-event-webhook"
  - "https://www.twilio.com/docs/sendgrid/ui/account-and-settings/how-to-set-up-link-branding"
  - "https://support.omnisend.com/en/articles/6659889-abandoned-cart-and-abandoned-checkout-automations"
  - "https://support.omnisend.com/en/articles/3175406-connect-your-shopify-store-to-omnisend"
  - "https://help.shopify.com/en/manual/promoting-marketing/create-marketing/shopify-messaging/marketing-automations/create"
  - "https://help.shopify.com/en/manual/promoting-marketing/create-marketing/shopify-email/shopify-email-cost"
derived_from: []
regen_prompt: "Re-audit the live SendGrid, Omnisend, Shopify, and mkt-hub state for MakeMeJedi and TurnedComics, then update the recommended ownership boundary, audience counts, economics, risks, and migration estimate."
---

# Executive recommendation

Move scheduled and one-time promotional campaigns for MakeMeJedi and TurnedComics to SendGrid. Keep transactional order and shipping messages in Shopify. During the first migration stage, keep abandoned browse/cart/checkout, welcome, post-purchase, review, and win-back workflows in Omnisend because the repository's existing lifecycle assets are designed around Omnisend triggers and dynamic commerce blocks.

Do not make the split permanent until consent synchronization is implemented. The hard part is not sending HTML through SendGrid; that already works. The hard part is ensuring that a person who unsubscribes, complains, bounces, purchases, or enters an abandonment flow is treated consistently by SendGrid, Omnisend, and Shopify.

After 30 days of stable hybrid operation, evaluate replacing Omnisend lifecycle with Shopify Messaging. Shopify is the likely lower-cost end state if the brands need email-only, relatively simple lifecycle sequences. Keep Omnisend if the brands materially use SMS, advanced branching, cross-channel orchestration, or richer behavioral segmentation.

## Recommended ownership boundary

| Message class | Owner now | Target owner | Notes |
|---|---|---|---|
| Scheduled promotions, newsletters, seasonal sends | Omnisend / ad hoc | SendGrid | Both brands, isolated sender identity and unsubscribe group |
| Abandoned browse | Omnisend | Omnisend initially; Shopify candidate | Only one active provider per brand |
| Abandoned cart | Omnisend | Omnisend initially; Shopify candidate | Must exit when checkout begins |
| Abandoned checkout | Omnisend | Omnisend initially; Shopify candidate | Must exit immediately on purchase |
| Welcome series | Omnisend | Omnisend initially; Shopify candidate | Exclude checkout subscribers where appropriate |
| Post-purchase, review, cross-sell, win-back | Omnisend | Omnisend initially; Shopify candidate | Keep commerce-event logic outside SendGrid broadcast runner |
| Order, payment, shipping, password, account notifications | Shopify | Shopify | Transactional system of record |

# Verified current state

## SendGrid

Read-only API checks on August 18, 2026 found:

- The account is paid, has a reputation score of 98, and has 500,000 monthly Email API credits. It had used 4,411 credits and had 495,589 remaining for the August cycle.
- `turnedcomics.com` and `makemejedi.com` are both valid authenticated sending domains.
- Both root domains publish DMARC with `p=reject`.
- Only one brand-specific unsubscribe group exists: `TurnedComics Marketing`. A MakeMeJedi marketing group still needs to be created.
- Neither MakeMeJedi nor TurnedComics has valid SendGrid link branding. Their click/open tracking therefore does not use brand-owned tracking domains.
- The active event webhook is PopSmiths-specific. It receives common delivery/engagement events, but `group_unsubscribe` and `group_resubscribe` are disabled.
- The current API key can send email, read suppressions, manage templates, schedule batches, and read statistics, but calls to Marketing Campaigns contacts/lists return 403. The existing working path is therefore Email API, not SendGrid Marketing Campaigns contact storage / Single Sends.

The current monthly capacity is ample. The two current broad subscribed audiences total about 15,854 contacts, so the remaining August quota could support roughly 31 combined full-audience broadcasts, before accounting for unrelated SendGrid traffic.

## TurnedComics SendGrid pilot

The untracked working tree contains a production-capable TurnedComics runner at:

`/home/lac5q/github/mkt-hub/email/national-dog-day-2026/sendgrid/turnedcomics/run.mjs`

It already provides:

- runtime credential retrieval from 1Password;
- authenticated-domain verification;
- Omnisend segment import as the subscribed audience source;
- reconciliation against global, group, bounce, spam, invalid, and block suppressions;
- brand-specific ASM unsubscribe links and physical-address insertion;
- an explicit production approval token, approver, and timestamp;
- a process lock and hashed per-recipient ledger for retry safety;
- campaign categories and custom arguments for analytics.

The August 18 production pilot wrote `queued` and API-accepted `sent` events for 1,365 recipients, with no local failed or uncertain entries. Preliminary SendGrid category statistics included 1,366 requests (including a test), 1,328 delivered, 8 bounces, 27 blocks, 4 invalid emails, no spam reports, 189 unique opens, 3 unique clicks, and 1 unsubscribe. This is an early snapshot, not a mature campaign readout.

The runner's local `sent` state means accepted by SendGrid, not confirmed delivery. A production platform must reconcile Event Webhook outcomes back into durable campaign state.

The entire National Dog Day campaign directory is currently untracked. It should not become the shared campaign system until it is versioned, tested, and generalized.

## Omnisend

Both brand credentials authenticate to separate connected Omnisend brands.

Read-only segment counts on August 18, 2026:

| Brand / segment | Contacts |
|---|---:|
| MakeMeJedi — all subscribed to email | 14,487 |
| MakeMeJedi — engaged subscribers | 7,678 |
| MakeMeJedi — expanded engaged subscribers | 12,696 |
| TurnedComics — active subscribers | 1,367 |
| TurnedComics — engaged subscribers | 0 |

The zero TurnedComics engaged segment appears to reflect missing engagement tags rather than a zero-size audience. Until engagement enrichment exists, TurnedComics can use its active-subscriber segment with conservative deliverability gates.

The repository includes Omnisend-oriented lifecycle plans for both brands: welcome, abandoned cart/checkout, post-purchase, win-back, and review request. These files contain setup instructions and are marked ready for QA or implementation; they do not prove that the corresponding live Omnisend automations are active.

# Omnisend versus Shopify for lifecycle

| Criterion | Omnisend | Shopify Messaging / Flow |
|---|---|---|
| Existing repository assets | Strong: existing sequences and dynamic-block instructions | No current implementation in this repository |
| Commerce data | Connected brand accounts; products/orders/contacts and behavioral events supported | Native store data, no third-party sync |
| Abandonment coverage | Separate browse, product, cart, and checkout workflows; dynamic abandoned-product content | Native browse, cart, and checkout automation templates; customizable with Flow |
| Multi-step sequences | Strong visual automation, filters, exits, SMS/push options | Flow supports sequential actions and waits; sufficient for many email-only sequences |
| Duplicate-send risk | Must manually disable corresponding Shopify flow | Must manually disable corresponding Omnisend flow |
| Cost behavior | Billable contacts include subscribers and non-subscribers who receive automations | 10,000 free marketing emails/store/month; additional email currently $1 per 1,000 up to 300,000; abandoned-checkout emails are free |
| Best fit | Advanced branching, behavioral segmentation, SMS/push, richer lifecycle experimentation | Simpler email-only lifecycle, low operating cost, native data ownership |

Omnisend explicitly advises against running its abandonment reminders alongside the store platform's reminders. Shopify likewise warns that overlapping automations can duplicate customer messages. Every trigger must have a single active owner.

Moving broadcasts out of Omnisend does not automatically reduce the Omnisend bill. Omnisend pricing still counts subscribers and certain non-subscribers who receive automated messages. Cost reduction requires an intentional Omnisend plan/contact strategy or a full lifecycle migration to Shopify.

# Proposed target architecture

```text
Shopify stores (orders, carts, checkout, canonical customer consent)
            |                                      |
            | commerce events                      | consent/audience sync
            v                                      v
Lifecycle owner                            Campaign control plane
(Omnisend initially)                       (versioned mkt-hub service)
            |                                      |
            | abandonment/welcome/etc.             | audience + exclusions
            v                                      v
Customer inbox <------------------------- SendGrid Email API
                                                    |
                                                    v
                                      Event Webhook + durable ledger
                                                    |
                         unsubscribe/bounce/spam/delivery reconciliation
                                                    |
                                                    v
                                  Shopify consent + Omnisend suppression
```

The safest consent contract is:

1. Shopify customer marketing consent is canonical for whether the customer may receive marketing.
2. SendGrid global/group suppressions are always enforced at send time.
3. The lifecycle provider maintains its own behavior-specific eligibility, but never overrides an explicit marketing opt-out.
4. SendGrid unsubscribe and spam events are written back to Shopify and, while Omnisend remains active, to Omnisend.
5. Shopify/Omnisend opt-outs are included in every SendGrid preflight.
6. Broadcast audiences exclude customers with recent high-intent cart/checkout events for a configurable collision window, such as 24 hours.

# Implementation plan and estimate

## Phase 0 — Policy and inventory (0.5–1 engineering day)

- Export active automations from each Shopify store and each Omnisend brand through the UIs.
- Assign one owner for every trigger.
- Choose sender/from/reply-to conventions; current plans use `hello@...` / `support@...`, while the TurnedComics pilot uses `contact@turnedcomics.com` for both.
- Define consent, suppression, collision-window, UTM, approval, and retention rules.

## Phase 1 — Generalize the SendGrid broadcaster (2–3 days)

- Convert the TurnedComics campaign-specific runner into a configuration-driven two-brand package.
- Isolate brand domain, From/Reply-To, physical address, ASM group, audience source, templates, categories, and ledger namespace.
- Add MakeMeJedi configuration and a MakeMeJedi unsubscribe group.
- Batch up to 1,000 personalizations per SendGrid request instead of one request per recipient; SendGrid documents a 1,000-personalization limit.
- Add scheduled batch IDs, pause/cancel support, dry-run manifests, test cohorts, and an explicit production approval gate.
- Add automated HTML/text/unsubscribe/UTM QA.

## Phase 2 — Consent and event reconciliation (2–4 days)

- Build a brand-aware Event Webhook endpoint with signature verification and idempotency.
- Enable group unsubscribe and group resubscribe events.
- Persist processed, delivered, deferred, dropped, bounce, block, spam, global unsubscribe, group unsubscribe, open, and click outcomes.
- Write opt-outs back to Shopify and Omnisend.
- Add a scheduled reverse sync from Shopify/Omnisend into SendGrid suppressions as a backstop.
- Add a campaign preflight report showing source audience, consent exclusions, provider suppressions, lifecycle collision exclusions, and final eligible count.

## Phase 3 — Deliverability and brand setup (0.5–1.5 days plus DNS propagation)

- Add and verify branded tracking-link domains for both brands.
- Confirm alignment, sender/reply-to mailboxes, physical address, preference links, and test rendering.
- Start MakeMeJedi with the 7,678-contact engaged cohort; start TurnedComics conservatively because its engagement segment is empty.
- Monitor bounce, block, spam, unsubscribe, delivery, and domain-specific deferrals before expanding.

## Phase 4 — Lifecycle validation (1–2 days per brand)

- Verify each active abandonment, welcome, post-purchase, review, and win-back flow end-to-end.
- Test exit-on-purchase, cart-to-checkout handoff, dynamic product data, recovery URLs, and suppression behavior.
- Keep only the selected lifecycle provider active.

## Phase 5 — Cutover and observation (2–3 engineering days across 1–2 elapsed weeks)

- Run seed/test sends, then engaged cohort, then broader audience.
- Disable Omnisend broadcast campaigns without disabling selected lifecycle flows.
- Reconcile SendGrid results against GA4/Shopify revenue and provider stats.
- Maintain rollback instructions: pause scheduled SendGrid batch, disable webhook mutations if necessary, and return the next broadcast to the former provider only after suppression reconciliation.

### Overall estimate

- Safe hybrid MVP: **6–10 engineering days**, typically **1–2 elapsed weeks** including DNS and staged observation.
- Hardened reusable campaign platform: **9–14 engineering days** if it includes durable event storage, two-way consent sync, marketer-facing campaign manifests, automated QA, and reporting.
- Later Omnisend-to-Shopify lifecycle migration: **1–3 additional days per brand** for basic flows, more for advanced branching/SMS parity.

# Direct Email API versus SendGrid Marketing Campaigns

The lowest-risk near-term approach is to continue the proven Email API pattern. It preserves Omnisend or Shopify as the audience/consent source and uses the already-paid 500,000-email monthly capacity. It also supports up to 1,000 personalizations per request and scheduled/cancelable batches.

Use SendGrid Marketing Campaigns / Single Sends only if nontechnical users need the SendGrid UI to own lists, segments, design, and scheduling. That route requires confirming the account entitlement, adding Marketing Campaigns API scopes, building contact/list synchronization, and accepting another persistent contact database. The current API key cannot access Marketing Campaigns contacts or lists.

# Primary risks and controls

| Risk | Severity | Control |
|---|---|---|
| Split-brain unsubscribe state across platforms | Critical | Two-way consent/suppression sync and brand-specific ASM groups |
| Duplicate abandonment or welcome messages | High | One lifecycle owner per trigger; cutover checklist and synthetic tests |
| Accepted mail recorded as delivered | High | Event Webhook reconciliation into durable ledger |
| Cross-brand reputation or opt-out leakage | High | Isolated brand config, groups, domains, categories, and preferably subusers if commercially available |
| Missing brand link reputation | Medium | Configure and verify brand-owned SendGrid link domains |
| Audience collision with active checkout recovery | Medium | Exclude recent cart/checkout events from broadcasts |
| Untracked production code or local-only ledger | High | Version code and use durable state/storage |
| Historical OMS brand heuristics misclassify recipients | High | Do not use OMS heuristic exports as canonical consent or brand assignment |
| Omnisend cost does not fall after campaign move | Medium | Model billable lifecycle contacts; downgrade/fixed-tier/migrate only with measured recovery revenue |

# Go-live acceptance criteria

- Separate valid sender domain, link branding, ASM group, From/Reply-To identity, and physical address per brand.
- Preflight counts reconcile source audience to final eligible audience with named exclusion reasons.
- A SendGrid group unsubscribe reaches Shopify and Omnisend within the agreed SLA and blocks the next preflight.
- A Shopify/Omnisend unsubscribe blocks SendGrid before the next send.
- Delivered/bounce/spam/unsubscribe events update durable campaign state idempotently.
- No customer can receive both Omnisend and Shopify versions of the same trigger.
- Abandoned-cart contacts exit on checkout; abandoned-checkout contacts exit on purchase.
- Test cohort passes Gmail, Outlook, Apple Mail, mobile, images-off, link, unsubscribe, and UTM QA.
- Production send can be scheduled, canceled, audited, and safely retried without duplicate recipients.

# Decision

Adopt **SendGrid broadcasts + Omnisend lifecycle** as the immediate transition because the SendGrid pilot already works and the lifecycle assets already target Omnisend. Treat that as an interim control point, not the final architecture.

After one stable month, choose between:

- **Keep Omnisend lifecycle** if advanced behavior, SMS/push, and revenue attribution justify its billable-contact cost; or
- **Move lifecycle to Shopify Messaging/Flow** if the actual requirement is email-only abandonment, welcome, and post-purchase sequences. Shopify can cover those flows natively at materially simpler operating cost, while SendGrid remains the broadcast engine.
