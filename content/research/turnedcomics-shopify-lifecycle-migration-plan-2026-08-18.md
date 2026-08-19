---
title: "TurnedComics Shopify lifecycle migration plan"
date: 2026-08-18
author: "Codex"
model: "gpt-5.6"
reviewers:
  - "claude-fable-5"
status: "implementation plan; cutover blocked on signed live inventory"
tags:
  - turnedcomics
  - shopify
  - shopify-messaging
  - shopify-flow
  - omnisend
  - sendgrid
  - lifecycle-email
derived_from:
  - "content/research/makemejedi-turnedcomics-sendgrid-lifecycle-transition-2026-08-18.md"
sources:
  - "/home/lac5q/github/mkt-hub/paperclip/handdrawn/email/turnedcomics-welcome-sequence.md"
  - "/home/lac5q/github/mkt-hub/paperclip/handdrawn/email/turnedcomics-abandoned-cart-sequence.md"
  - "/home/lac5q/github/mkt-hub/paperclip/handdrawn/email/turnedcomics-post-purchase-sequence.md"
  - "/home/lac5q/github/mkt-hub/paperclip/handdrawn/email/turnedcomics-winback-sequence.md"
  - "/home/lac5q/github/mkt-hub/paperclip/handdrawn/email/turnedcomics-ugc-outreach-template.md"
  - "/home/lac5q/github/mkt-hub/paperclip/handdrawn/email/qa-review-checklist.md"
  - "/home/lac5q/github/mkt-hub/paperclip/handdrawn/reports/lead-engineer-status-2026-03-23.md"
  - "https://help.shopify.com/en/manual/promoting-marketing/create-marketing/shopify-messaging/marketing-automations/create"
  - "https://help.shopify.com/en/manual/promoting-marketing/create-marketing/migrate-abandoned-checkout"
  - "https://help.shopify.com/en/manual/shopify-flow/reference/triggers"
  - "https://help.shopify.com/en/manual/shopify-flow/reference/triggers/customer-abandons-checkout"
  - "https://help.shopify.com/en/manual/shopify-flow/reference/triggers/customer-joined-segment"
  - "https://help.shopify.com/en/manual/shopify-flow/reference/triggers/order-paid"
  - "https://help.shopify.com/en/manual/shopify-flow/reference/triggers/order-fulfilled"
  - "https://help.shopify.com/en/manual/shopify-flow/getting-started/understanding-actions"
  - "https://help.shopify.com/en/manual/shopify-flow/create/troubleshoot"
  - "https://help.shopify.com/en/manual/promoting-marketing/create-marketing/shopify-messaging/marketing-automations/reporting"
  - "https://help.shopify.com/en/manual/promoting-marketing/analyze-marketing/shopify-email-analytics"
  - "https://support.omnisend.com/en/articles/4274532-disable-or-delete-an-automation-workflow"
  - "https://support.omnisend.com/en/articles/3873110-set-up-exit-conditions-for-automations"
  - "https://support.omnisend.com/en/articles/3533018-omnisend-pricing-plans-2026"
  - "https://help.shopify.com/en/manual/promoting-marketing/create-marketing/shopify-email/shopify-email-cost"
  - "https://turnedcomics.com/"
  - "https://turnedcomics.com/pages/faqs"
  - "https://turnedcomics.com/products/turned-comics"
  - "https://turnedcomics.com/pages/contact"
  - "fable-session:112932be-ad07-4da0-8833-ff581a3d27bf"
  - "fable-session:c8fce8c7-be5b-4470-978d-c9cf8aa9b3a5"
regen_prompt: >-
  Re-audit every TurnedComics lifecycle automation and template in mkt-hub and the
  live Omnisend and Shopify admins. Verify current Shopify Messaging/Flow features
  from official documentation. Produce a flow-by-flow Shopify migration contract
  with triggers, consent, filters, waits, content, dynamic data, exits, precedence,
  QA, phased cutover, rollback, metrics, owners, estimates, and MakeMeJedi reuse.
  Keep scheduled broadcasts in SendGrid. Do not mutate live systems.
---

# TurnedComics Shopify lifecycle migration plan

## Executive decision

Move event-driven TurnedComics lifecycle email to **Shopify Messaging + Shopify Flow**. Keep **SendGrid** as the owner of scheduled/broadcast campaigns. Retire Omnisend only after each lifecycle flow passes production-like tests and completes a reversible, flow-by-flow cutover.

The migration is feasible, but not a direct import. The source material is a set of specs and partial HTML, not proof of live Omnisend configuration. Shopify-native templates cover welcome, browse abandonment, cart abandonment, checkout abandonment, post-purchase, and win-back. Two moments require extra work: the custom portrait-ready/download event, and any review/UGC automation.

The recommended boundary is **forward-only by flow**: do not recreate a person's historical position in Shopify. At cutover, disable the Omnisend workflow and choose **Exit from the workflow** for all already-enrolled contacts. Snapshot that canceled cohort for measurement and support, but do not restart or advance it in Shopify. This creates a small, explicit message gap while preserving the stronger invariant that exactly one platform owns each lifecycle flow. Omnisend documents the exit-all option and preserves statistics when a workflow is disabled rather than deleted.

### Economic sanity check

Do not migrate solely because Shopify exists. Omnisend's 2026 free plan is $0 but is limited to 250 reachable contacts and 500 email sends per month. Shopify Messaging includes 10,000 email sends per calendar month with an eligible Shopify plan, then charges $1 per additional 1,000 up to 300,000; abandoned-checkout automation messages are excluded from that quota.

If TurnedComics has a genuinely grandfathered Omnisend plan that supports its full audience and lifecycle volume at $0, retaining Omnisend for lifecycle can be rational, and the migration should be justified by simpler event ownership or operations—not savings. If the last audited audience of roughly 1,367 contacts is representative and the account is on the current free plan, Omnisend cannot reach the full audience or sustain the planned flow volume. In that case, Shopify is likely the lower-cost native lifecycle owner while broadcasts remain in SendGrid. Phase 0 must record the actual Omnisend plan, invoice, contact limit, email-credit limit, current usage, and any grandfathered terms before approving migration on economic grounds.

## Scope contract

### Goal

Produce a testable implementation and cutover contract for all TurnedComics event-driven lifecycle journeys in Shopify, including content, trigger logic, consent, suppression, measurement, cutover, and rollback. The resulting design must be reusable for MakeMeJedi.

### In scope

- Existing welcome, checkout-abandonment, post-purchase, and win-back sequences.
- True browse and cart abandonment, which are missing from the current inventory but were part of the requested abandonment coverage.
- Shopify notification audit to prevent duplicate transactional/order messages.
- Lifecycle consent, precedence, frequency, suppression, attribution, QA, rollback, and operational ownership.
- Explicit disposition for the missing VIP destination and manual UGC outreach.
- SendGrid coordination so broadcasts do not collide with high-intent Shopify lifecycle messages.

### Out of scope for this phase

- Live admin mutations, live sends, credentials, DNS, discount creation, or activation.
- Scheduled/broadcast campaign migration; SendGrid remains its owner.
- MakeMeJedi implementation. Its rollout follows after TurnedComics is stable, using this contract.

### Definition of done

Every flow has a signed inventory record and passes trigger, audience, consent, exits, re-entry, timing, personalization, dynamic content, rendering, links, discounts, event accuracy, attribution, collision, and rollback tests. There must be no duplicate lifecycle ownership between Shopify and Omnisend and no lifecycle/broadcast overlap outside the approved policy.

## Verified current inventory

The repository documents **four lifecycle sequences and 12 emails**:

| Current sequence | Messages and timing | Source readiness | Migration finding |
|---|---|---|---|
| New Subscriber Welcome | 3: immediate, day 2, day 5 | Markdown + three HTML files; spec says ready for QA | Migrate to Shopify welcome series after rewriting claims, links, variables, and discount terms. |
| “Abandoned Cart” | 3: hour 1, hour 24, hour 72 | Markdown + HTML for email 1 only; QA table says ready | The setup trigger is **Started Checkout**, so this is checkout recovery, not cart recovery. Migrate as checkout and create separate native browse/cart flows. |
| Post-Purchase Welcome & Upsell | 4: immediate order, fulfillment, day 5, day 12 | Markdown only; QA table says ready | Split transactional, first-purchase onboarding, portrait-ready, and repeat-purchase logic. Fulfillment is not proven equivalent to portrait delivered. |
| Lapsed Customer Win-Back | 2: day 90, then day 102 | Markdown only; spec says ready for QA | Migrate using a Shopify customer segment and Customer joined segment trigger; test initial enrollment and re-entry. |

The UGC file is a manual cross-brand outreach template aimed at TurnedYellow/MakeMeJedi buyers. It is not a TurnedComics store lifecycle automation and requires a reply, photo submission, usage rights, and human handling. It should remain paused/manual until the audience's cross-brand consent and UGC rights process are approved.

Repository evidence does **not** prove that any TurnedComics Omnisend workflow was imported or activated. A status report says activation was blocked on missing API credentials. The live admin export is therefore the authoritative final inventory gate: active, paused, draft, archived, and app-owned automations must all be listed before build begins.

### Mandatory live-flow disposition register

The plan is not cutover-ready until the operator replaces every `TBD` below and adds any additional active, paused, draft, archived, legacy-Shopify, or app-owned flow discovered in the admins. One source workflow must have exactly one disposition.

| Expected source workflow | Live workflow ID/version/status | Shopify target and trigger | Audience/exits/timing/assets/conversion event | Owner | Cutover action |
|---|---|---|---|---|---|
| New Subscriber Welcome | TBD in Omnisend/admin export | Shopify Messaging welcome template for verified online-store form/Shopify Forms subscription source | Map all three messages, consent source, purchase exit, 0d/2d/5d, welcome conversion order | Lifecycle | Disable + exit all; then enable Shopify after queue proof. |
| “Abandoned Cart” / Started Checkout | TBD | Shopify Messaging Recover abandoned checkout / Customer abandons checkout | Map three messages, subscribed audience, completed-order exit, 1h/24h/72h, recovered order | Lifecycle | Disable + exit all; then enable Shopify after queue proof. |
| Post-Purchase Welcome & Upsell | TBD | Order paid onboarding + approved portrait-ready event + repeat-purchase branch | Map all four source messages to explicit target branches, consent/refund exits, timing, next paid order | Lifecycle + engineering | Disable + exit all; activate only branches whose event contracts pass. |
| Lapsed Customer Win-Back | TBD | Customer joined approved lapse segment | Map two messages, subscribed/non-VIP audience, purchase exit, day 90/day 102, returning order | Lifecycle | Disable + exit all; then enable Shopify after segment-entry proof. |
| Any other live/admin automation | TBD | TBD or retire | Full per-flow mapping required | Named owner | No cutover until disposition is signed. |

For each row, attach exported trigger/filter/branch/exit screenshots, message/template versions, sender/reply-to, currently-in count, baseline metrics, segment IDs, discount IDs, dependency IDs, and approver. “Not found” must be recorded explicitly; absence cannot be inferred from the repository.

## Target ownership and architecture

| Message class | System of record | Rule |
|---|---|---|
| Required order/account/shipping notices | Shopify notifications | Transactional; never replaced by marketing automations and exempt from marketing cooldowns. |
| Event-driven lifecycle | Shopify Messaging + Flow | Sole owner after each flow's cutover. Shopify marketing consent becomes canonical only after the sync blocker below passes. |
| Scheduled promotions/newsletters | SendGrid | Audience must be synced from Shopify consent and apply Shopify lifecycle suppression windows. |
| UGC/review solicitation | Approved review/UGC app connected to Shopify Flow, or manual | Do not activate until consent, rights, review platform, and deduplication are approved. |

Target state: Shopify is the canonical record for email-marketing consent, unsubscribes, and lifecycle eligibility. This is a **Phase 0 activation blocker**, not an assumed current capability. Before any lifecycle or SendGrid activation, name the connector/job, map Shopify customer ID/email/consent state/source/timestamp/market and suppression reason to SendGrid contact/suppression fields, set a maximum sync lag, define retries/dead-letter alerts and fail-closed behavior, and save an audit sample proving unsubscribe propagation in both directions where required. SendGrid must never independently re-subscribe customers. Until this contract passes, suppress SendGrid broadcasts to the affected store audience.

## Flow-by-flow target contract

### 1. New subscriber welcome — migrate

- **Entry:** Shopify Messaging's welcome-new-subscriber automation for the verified online-store form/Shopify Forms subscription source. Do not use Customer created alone; customer creation is not equivalent to subscription.
- **Eligibility:** email subscribed, zero paid orders, not previously tagged/metafielded `tc_welcome_completed`, not in an active higher-priority flow.
- **Sequence:** preserve the current 0-day / 2-day / 5-day skeleton after offer approval.
- **Checks before every delayed message:** still subscribed, still zero paid orders, no active checkout/cart suppression, no fraud/test tag.
- **Exit:** paid order, unsubscribe, suppression, hard bounce, or welcome completion.
- **Re-entry:** none. Set `tc_welcome_completed_at` or equivalent after the final step.
- **Content work:** rebuild all three messages in Shopify Messaging; convert Omnisend variables and preference links to Shopify-supported sections/variables; add `utm_source=shopify&utm_medium=email`; verify fallback for missing first name.
- **Source coverage gate:** inventory online-store forms, Shopify Forms, double-opt-in confirmation, CSV imports, checkout opt-in, Admin/API changes, and third-party app subscriptions. For every source, prove whether the native template fires. Route uncovered but valid new consents through a tested segment/Flow path or explicitly exclude them; never assume all consent changes enter the welcome series.

### 2. Browse abandonment — build net-new

- **Entry:** Shopify Messaging **Convert abandoned product browse** template.
- **Eligibility:** identifiable subscribed customer; product viewed; no subsequent cart, checkout, or paid order; not in cooldown.
- **Recommended sequence:** one message after 4 hours. Start conservative because there is no baseline or existing approved copy.
- **Exit:** cart creation, checkout start, paid order, unsubscribe, or higher-priority flow.
- **Re-entry:** at most once per customer per 7 days; verify the store can enforce this with automation conditions, segment, tag, or metafield.
- **Content:** product reminder and craft/value proposition; no discount initially.
- **Limitation:** anonymous visitors cannot be emailed.

### 3. Cart abandonment — build net-new

- **Entry:** Shopify Messaging **Recover abandoned cart** template.
- **Eligibility:** identifiable subscribed customer with a non-empty available cart; no checkout or order; not in higher-priority flow.
- **Recommended sequence:** 2 messages at 2 hours and 24 hours. Use Shopify's cart/product dynamic block and cart continuation URL.
- **Exit:** checkout start, paid order, unavailable cart, unsubscribe, or suppression.
- **Re-entry:** at most once every 7 days; new activity must not duplicate an active sequence.
- **Content:** first reminder without discount; second may use an approved incentive only after margin/offer validation.

### 4. Checkout abandonment — migrate the existing “cart” sequence

- **Entry:** Shopify Messaging **Recover abandoned checkout**, or the Customer abandons checkout Flow template if the required marketing-email action is available in the store.
- **Channel coverage:** the new automation supports Online Store and Buy Button checkouts, not POS, Shop, or third-party channels. Measure uncovered channel volume before launch.
- **Eligibility default:** subscribed email customers only. Shopify permits “All customers,” but that must remain off unless legal/compliance approves it by market.
- **Sequence:** preserve 1 hour / 24 hours / 72 hours initially to isolate platform effects.
- **Checks before every send:** checkout not completed, no paid order, inventory still available, non-zero value, customer still eligible, no newer checkout sequence.
- **Exit:** completed/recovered order, unsubscribe, inventory failure, or suppression.
- **Re-entry:** newest checkout wins; at most one active checkout sequence per customer.
- **Content work:** rebuild three messages with Shopify recovery link/product sections. Replace the inaccurate “cart” label in reporting. HERO50 is not approved until its economics, stacking, applicability to a second portrait, expiry, and actual Shopify discount configuration are verified.
- **Irreversible platform gate:** Shopify states that after replacing its legacy abandoned-checkout automation with the new Messaging automation, the store cannot revert to the legacy Shopify automation. Record whether the store still uses legacy Shopify recovery, export or screenshot its configuration and reports, obtain owner approval for the irreversible switch, and keep the Omnisend rollback path distinct. Rolling back to Omnisend does not restore the legacy Shopify automation.

### 5. First-purchase onboarding — migrate with redesign

- **Entry:** Order paid, first paid order only. Shopify's native thank-after-purchase/first-purchase automation is the preferred baseline.
- **Timing:** send the marketing thank-you/onboarding message after 1 day, not immediately, so it does not duplicate Shopify's transactional order confirmation.
- **Eligibility:** subscribed, order paid, not cancelled/refunded/charged back, first order, not test/fraud.
- **Content:** set honest expectations for the custom-art process, including first preview in **2–3 days** and revisions until approved. Link to the real contact route. Do not repeat receipt/order-line detail already present in the transactional notification unless the message adds genuine value.
- **Exit:** refund, chargeback, cancellation, unsubscribe, or delivery transition.

### 6. Portrait-ready/delivery — migrate only after event contract exists

The source email says the portrait has arrived and provides a download URL, but its configured trigger is Order fulfilled. Shopify documents that Order fulfilled can fire more than once for partial fulfillments. It is not evidence that the artwork has been approved or that a digital file URL exists.

Required integration contract:

1. The named production/order-management service writes a Shopify order tag such as `tc_portrait_ready` and an order metafield such as `tc.delivery_url`, or invokes an approved app action/event, using a least-privilege Admin API credential owned by ecommerce engineering.
2. The workflow uses that event once, checks consent and a `tc_portrait_ready_sent_at` idempotency field, and validates that the URL exists.
3. Partial physical fulfillment alone must not start the email.
4. The download URL must not expose another customer's asset and must be tested for expiration/auth behavior.

Before launch, engineering must document the writer endpoint/webhook, authentication and authorization model, secret rotation, order/customer binding, URL TTL, revocation behavior, access logging, replay/idempotency key, and failure/retry path. A production-like security test must prove that a customer cannot alter an order/file identifier to access another customer's asset, that expired/revoked links fail safely, and that a replay cannot send twice. Operations owns the readiness event; ecommerce engineering owns the write integration and security controls.

If that integration cannot be implemented, redesign the email as an order-fulfilled/next-steps message without claiming the portrait is delivered and without a custom download link. Do not activate the original copy against Order fulfilled.

### 7. Repeat-purchase upsell — migrate after portrait-ready decision

- **Entry:** first paid order, with waits anchored to the verified portrait-ready/delivery event when possible; otherwise use a conservative order-paid delay.
- **Sequence:** retain two messages as a controlled test, but do not automatically preserve HERO20/HERO25. The source uses multiple conflicting incentives and expiration claims.
- **Checks:** subscribed, not refunded/charged back, no subsequent order, fewer than three paid orders, not in win-back, no active abandonment, offer eligible.
- **Exit:** next paid order, unsubscribe, refund/chargeback, VIP threshold, or suppression.
- **Re-entry:** once per qualifying order with a 30-day customer-level cap.

### 8. Win-back — migrate

- **Entry:** Customer joined segment for subscribed customers with at least one paid order and no paid order in 90 days.
- **Sequence:** day 90 and day 102, matching the existing two-message structure.
- **Checks:** still subscribed, still lapsed, not VIP, no current order/abandonment/post-purchase flow, not previously completed within the cooldown.
- **Exit:** paid order, unsubscribe, VIP membership, or higher-priority flow.
- **Re-entry:** no more than once every 180 days. Test leave/rejoin behavior and how pre-existing members enter before production activation.
- **Offer:** COMEBACK25 must be verified in Shopify with consistent eligibility and expiry; the source alternates between a 14-day validity and 48-hour urgency.

### 9. VIP destination — decision/build gap

The post-purchase and win-back specs exclude customers with three or more purchases and say they should move to a VIP flow, but no TurnedComics VIP asset exists. Before cutover, choose one:

- build a Shopify VIP appreciation flow triggered when a customer joins an `orders_count >= 3` segment; or
- remove the exclusion and keep those customers in a documented standard lifecycle path.

Leaving the exclusion without a destination is not acceptable.

### 10. Review/UGC — hold outside core cutover

No native Shopify Messaging review-request trigger/template was verified, and no TurnedComics review flow exists in the repository. Use an approved review app connector if a review flow is desired. Keep cross-brand UGC outreach manual until cross-brand consent, media release/usage rights, storage, moderation, and deletion processes are approved.

## Global precedence, exclusions, and contact pressure

Recommended priority:

1. Shopify transactional notifications
2. Portrait-ready/service communication
3. Checkout recovery
4. Cart recovery
5. Browse recovery
6. First-purchase onboarding/post-purchase
7. Welcome
8. Review request
9. Win-back
10. SendGrid scheduled broadcast

Rules:

- A paid order immediately exits welcome, browse, cart, checkout, and win-back.
- Checkout entry exits/suppresses cart and browse; cart entry exits/suppresses browse.
- A customer may receive no more than one lifecycle marketing email in 24 hours, excluding transactional/service messages.
- Suppress SendGrid broadcast for 48 hours after checkout/cart abandonment entry and 72 hours after a paid order. Make these values configurable and review after 30 days.
- Before each delayed Shopify send, recheck purchase, consent, higher-priority-flow, refund/cancellation, and cooldown state. Entry filters alone are insufficient.
- Prefer customer/order metafields with timestamps for idempotency and cooldown state. Tags may be used where Messaging requires them, but tags are case-sensitive and can be overwritten by apps; verify ownership.

The 24-hour lifecycle cooldown, 48/72-hour SendGrid suppression, 7-day abandonment re-entry limits, 30-day upsell cap, and priority order are recommended policy—not proven native Shopify guarantees. For every rule, the build record must show the exact enforcing Messaging/Flow condition, wait-time recheck, segment, timestamp metafield, or external integration; its write/read order; concurrent-event race behavior; and a test log. Test two events arriving within seconds and a purchase/unsubscribe occurring during a wait. An unresolved or unenforceable control blocks the affected automation. If the selected native Messaging template cannot enforce a required rule, wrap it with Flow-maintained eligibility, reduce concurrent automations, or do not launch it.

Shopify does not document a universal cross-automation priority/cooldown engine. The operator must prove these controls in the actual store workflow graph and retain the evidence.

## Content and offer remediation

Do not port the copy verbatim. Required edits include:

- Replace unsupported or stale claims such as “50,000+ heroes,” “48-hour delivery,” invented testimonials, “job offers doubled,” and unverified scarcity/queue language.
- Use the current verified service promise: hand-drawn by real artists, first preview in 2–3 days, revisions until approved. Treat physical delivery separately.
- Verify every product/gallery/support/social URL; several source links are placeholders or may not match the live site.
- Change all lifecycle UTMs from `utm_source=omnisend` to `utm_source=shopify`, with stable flow/message names.
- Rebuild personalization and unsubscribe/preference elements using Shopify-supported variables and blocks. Provide safe fallbacks for missing first name/product data.
- Resolve sender identity. Source specs say `hello@turnedcomics.com` with `support@turnedcomics.com`; the live contact page and current SendGrid pilot use `contact@turnedcomics.com`. Pick one verified reply-to route and test it.
- Verify HERO15, HERO50, HERO20, HERO25, and COMEBACK25 in Shopify: existence, percentage/value, product eligibility, minimums, stacking, audience, redemption cap, start/end, and landing-link behavior.
- Resolve contradictions: HERO15 is both “no expiry” and “expires in 48 hours”; COMEBACK25 is both 14 days and 48 hours; HERO25 urgency changes across messages.
- Validate the postal address and footer compliance for every destination market.

## Implementation phases

### Phase 0 — live discovery and freeze (0.5–1.0 day)

Owner: lifecycle lead with Shopify/Omnisend admin access.

- Export every Omnisend automation, status, workflow ID, entry count, currently-in count, templates, versions, exits, filters, stats, and linked segments.
- Inventory Shopify notifications, Messaging automations, Flow workflows, Forms, review apps, and competing apps.
- Confirm Shopify plan/app availability, sender-domain authentication, sender/reply-to, consent capture, markets, store timezone, and permissions.
- Snapshot 30–90 days of Omnisend performance by flow/message where available.
- Freeze lifecycle edits during build/cutover and create the signed inventory/decision log.

Gate: no unowned active/draft/archived flow and no unknown transactional duplicate.

### Phase 1 — foundations and content system (1.5–2.5 days)

Owner: lifecycle builder; approvals from brand, operations, and compliance.

- Define the Shopify consent/suppression schema and SendGrid suppression feed.
- Create idempotency/cooldown fields and naming conventions.
- Build a Shopify-compatible TurnedComics base template and all missing messages.
- Remediate claims, links, sender identity, discounts, footer, dynamic fields, and UTMs.
- Define GA4/Shopify attribution names and a per-flow metric dictionary.

Gate: all copy and offers approved; template tests pass desktop/mobile and major mailbox previews.

### Phase 2 — lower-risk native flows (1.0–1.5 days)

- Build welcome, browse, cart, and checkout in inactive/test state.
- Preserve checkout timing for baseline continuity; start browse/cart conservatively.
- Implement purchase exits, hierarchy, cooldowns, and SendGrid suppression signaling.

Gate: synthetic subscribers complete every positive and negative path without duplicates.

### Phase 3 — post-purchase and custom event (1.5–3.5 days)

- Audit/retain Shopify transactional notifications.
- Build first-purchase onboarding from Order paid.
- Implement and test the portrait-ready event/metafield contract, or approve the reduced fulfillment copy.
- Build repeat-purchase steps only after the event boundary is reliable.

Gate: partial fulfillment, missing URL, refund, chargeback, second order, and non-subscriber cases are safe.

### Phase 4 — win-back, VIP, and review disposition (0.75–1.5 days)

- Build/test win-back segment entry, historical-member behavior, exit, and re-entry.
- Implement the approved VIP destination or remove orphaning exclusions.
- Record review/UGC as an approved app-backed flow or as deferred/manual.

Gate: no eligible customer is silently excluded without a destination.

### Phase 5 — phased cutover and observation (0.5–1.0 day hands-on; at least 7 days observation)

Cut over one flow family at a time: welcome → abandonment → onboarding/post-purchase → win-back. Do not switch all flows simultaneously.

Expected implementation effort: **5.25–9.5 person-days**, plus at least **7 days of observation**. Add **2–5 days** if the portrait-ready event requires new OMS/API engineering or a review app procurement/integration. Confidence is medium until the live admin inventory and custom order pipeline are inspected.

## Cutover runbook

For each flow family:

1. Freeze edits and record approver, timestamp, Omnisend workflow ID/version, Shopify automation ID/version, and expected cohort.
2. Export Omnisend currently-in contacts and capture reports/template screenshots or exports.
3. Place Shopify admission in a cutover hold: automation inactive and eligibility segment/tag/metafield closed. Verify tests are green, required segments/discounts/events exist, and SendGrid suppression import is current.
4. Disable the Omnisend workflow and choose **Exit from the workflow** for all current contacts. Preserve statistics; do not delete. Export the canceled cohort and record the intentional no-send gap.
5. Prove Omnisend has zero currently-in contacts and no queued/scheduled messages for that workflow. During this proof window, Shopify remains closed so no contact can enter either sender.
6. Open Shopify eligibility and enable the Shopify automation as one controlled ownership change. Only events occurring after this timestamp are eligible; canceled Omnisend contacts do not resume mid-sequence.
7. Create a fresh synthetic event and verify entry, wait state, content, links, suppression, event logs, and no Omnisend entry or queued send.
8. Monitor at 1 hour, 24 hours, 72 hours, and 7 days. Compare flow entries, sends, delivered, clicks, exits, orders, revenue, unsubscribes, bounces, complaints, and duplicates using the metric-source contract below.
9. Keep Omnisend disabled—not deleted—for at least 30 days and retain the final export. The canceled cohort remains a documented migration exception, not a delayed Shopify audience.

Never enable Shopify first and disable Omnisend later. Do not let both systems finish the same flow, and do not migrate a contact's historical wait position by guessing.

## Rollback contract

Rollback is flow-specific, not account-wide.

Trigger rollback if any of the following occurs:

- duplicate-send rate above 0.1% or any confirmed transactional/lifecycle double-send pattern;
- purchase/completion exits fail in a production smoke test;
- unsubscribe, hard-bounce, or suppression enforcement fails;
- wrong customer/order/product/download data is exposed;
- complaint rate reaches 0.1% or doubles the comparable Omnisend baseline, whichever is lower;
- flow entry volume differs from expected eligible events by more than 20% after normal event latency;
- checkout recovery link or discount fails for any supported channel/test case.

Rollback steps:

1. Close Shopify admission and disable the affected automation immediately. Export its in-flight/queued cohort and preserve logs.
2. Prove that Shopify has no queued message capable of sending for the rolled-back flow. If Shopify cannot cancel a queued step reliably, quarantine that cohort from Omnisend until the maximum Shopify wait plus 24 hours expires; lifecycle ownership remains Shopify for that cohort during quarantine even though no new entry is allowed.
3. Keep SendGrid suppression in place until lifecycle ownership is restored.
4. As a named, time-bounded exception, re-enable the unchanged Omnisend workflow for **new events only** after the Shopify queue proof/quarantine is recorded. Restore exactly one entry owner. Do not insert Shopify in-flight contacts at guessed positions.
5. Verify one new synthetic event in Omnisend, confirm Shopify rejects new entry, and prove the Shopify in-flight cohort is excluded from Omnisend.
6. Open an incident record with affected cohorts, messages, timestamps, evidence, containment, correction, rollback expiry, and relaunch gate.

For checkout recovery, rollback to Omnisend does not undo Shopify's irreversible migration away from the legacy Shopify abandoned-checkout automation. That platform change requires separate pre-approval and evidence before initial cutover.

Rollback owner: lifecycle lead. Customer-data/security incident escalation: engineering/security owner. Offer/copy incident: brand/commerce owner. Decision window: immediate for privacy, consent, incorrect-recipient, or broken-recovery-link issues; within one hour for other threshold breaches.

## QA test matrix

Use unique tagged synthetic customers and orders. Capture screenshots, workflow logs, received headers, link destinations, and order/segment state.

| Scenario | Required assertion |
|---|---|
| New subscribed customer, no order | Enters welcome once; correct fallback/personalization and timing. |
| Unsubscribed/non-consenting customer | Receives no lifecycle marketing email; Flow failure is understood/monitored. |
| Welcome customer places order during wait | Exits welcome and enters only eligible post-purchase path. |
| Product browse → cart → checkout → paid | Only the highest-priority active recovery remains; purchase stops all recovery. |
| Empty/$0/out-of-stock cart or checkout | No invalid recovery email or broken link. |
| Online Store vs Buy Button vs Shop/POS/third-party | Supported channels recover correctly; unsupported channels are measured and documented. |
| Order authorized but not paid | Does not start Order paid onboarding. |
| First order vs repeat/VIP | Correct branch and no orphaned exclusion. |
| Cancel/refund/chargeback during wait | Delayed marketing exits before send. |
| Partial fulfillment | Does not send portrait-ready twice or expose an invalid URL. |
| Portrait-ready event replay | Idempotency field prevents duplicate message. |
| Missing/expired/mismatched download URL | No send or safe fallback; never another customer's asset. |
| Win-back pre-existing member and leave/rejoin | Defined initial enrollment and cooldown; no repeated loop. |
| Missing first name/product image/order data | Safe copy and layout fallback. |
| Discount stacking/expiry/redemption | Message promise exactly matches Shopify checkout behavior. |
| Mobile Gmail/Apple Mail/Outlook and dark mode | Acceptable rendering, accessible buttons/alt text, plain-text fallback. |
| Unsubscribe/preferences/postal address | Functional and compliant; Shopify consent updates reach SendGrid. |
| SendGrid campaign during lifecycle suppression | Suppressed customer is absent; transactional Shopify mail is unaffected. |
| Cutover with Omnisend contacts currently in waits | Disable + Exit all cancels them; export count matches; Omnisend currently-in and queued-send checks reach zero. |
| Shopify admission during ownership freeze | No production customer enters Shopify while Omnisend queue absence is being proved. |
| Rollback with Shopify contacts currently in waits | Shopify entry closes; queued sends are canceled or cohort is quarantined; no contact enters Omnisend until isolated. |
| Consent-sync outage or stale export | SendGrid fails closed for the affected audience, alerts fire, and no stale re-subscription occurs. |

## Measurement and acceptance

Preserve Omnisend baseline definitions before cutover. Shopify's marketing-automation report is authoritative for Reach, Sessions, Orders, Conversion rate, and Sales. Shopify email analytics/admin export is the candidate source for sent/delivery/open/click/unsubscribe fields, but its exact availability must be verified in the store. Complaint and bounce events require a named Shopify export/API or other approved deliverability source; if unavailable, they are activation-monitoring gaps rather than assumed metrics. Align attribution windows before comparison.

### Metric-source and join contract

| Metric | Authoritative source | Join/audit key | Pre-launch requirement |
|---|---|---|---|
| Eligible trigger events | Shopify Flow/Messaging run history plus source object | workflow/automation ID, run ID, customer ID, checkout/order ID, event timestamp | Exportable sample reconciled to source events. |
| Reach, sessions, orders, conversion rate, sales | Shopify automation report | automation ID and Shopify-attributed session/order | Attribution window documented. |
| Sends/delivery/open/click/unsubscribe | Verified Shopify email analytics/export | automation/message ID, customer ID or privacy-safe recipient key, send timestamp | Exact fields and retention recorded; otherwise mark unavailable. |
| Bounce/complaint | Verified Shopify deliverability report/API/support export | message/recipient key and event timestamp | Named source and alert owner; unavailable fields block the related rollback threshold. |
| Consent/suppression | Shopify customer marketing-consent history and sync audit | Shopify customer ID, normalized email hash, state/source/timestamp/market | Propagation SLA and fail-closed test pass. |
| Recovered/next order | Shopify order record | order ID, customer ID, checkout token where available, landing UTM/discount code | Synthetic order reconciles end to end. |
| SendGrid suppression overlap | SendGrid contact/suppression export plus Shopify sync audit | normalized email hash/Shopify customer ID and suppression timestamp | Sample proves lifecycle-window exclusion. |

Do not join customers solely by mutable email when Shopify customer ID or checkout/order linkage is available. Handle guest checkout and email changes explicitly. Metrics without an authoritative export and join key are labeled unavailable and cannot be used as automatic rollback thresholds.

Canonical event/UTM convention:

- source: `shopify`
- medium: `email`
- campaign: `tc_<flow>`
- content: `<step>_<variant>`

Acceptance after at least seven days and the following minimum evidence: every controlled test case passed, at least 100 eligible production entries per launched high-volume flow or 30 days of observation (whichever occurs first), and at least 20 eligible entries or 30 days for low-volume flows. If volume remains below those thresholds, approve continuation as a limited rollout rather than declaring full stability.

- eligible-event-to-flow-entry reconciliation within 5%, or explained by documented Shopify channel/consent suppression;
- zero consent, wrong-recipient, wrong-order, or duplicate incidents;
- recovery/purchase exits pass 100% of controlled tests;
- delivery/bounce/complaint/unsubscribe rates within approved baseline guardrails;
- revenue attribution reconciles at order level for synthetic and sampled production conversions;
- lifecycle/broadcast suppression sync meets its service-level target and is auditable.

Do not use the source documents' “industry average” tables as migration acceptance thresholds; their provenance is not documented.

## Owners and required decisions

| Decision/deliverable | Accountable owner | Default until approved |
|---|---|---|
| Live Omnisend/Shopify inventory and cutover | Lifecycle lead | No activation without signed inventory. |
| Shopify build, event integration, idempotency | Ecommerce engineering | Forward-only, flow-by-flow. |
| Sender/reply-to and support routing | Support + lifecycle | Use only a monitored, domain-authenticated mailbox. |
| Claims, testimonials, urgency, brand voice | Brand/legal | Remove unsupported claims. |
| Discounts and margin | Commerce/finance | No unverified discount in production. |
| Abandoned checkout “All customers” | Legal/compliance | Subscribed customers only. |
| Portrait-ready event/download URL | Operations + engineering | Block original delivery copy until verified. |
| Review app and UGC rights | CX/legal | Deferred/manual. |
| VIP destination | Lifecycle/commerce | Must decide before win-back/post-purchase cutover. |
| Shopify → SendGrid consent/suppression sync | Data/marketing ops | Broadcast suppressed while sync is unproven. |

## MakeMeJedi replication contract

MakeMeJedi is strictly a post-acceptance reuse phase and is not part of TurnedComics completion. After TurnedComics meets the time **and** minimum-evidence gate above, clone the **logic and QA contract**, not its copy or offers:

1. Export MakeMeJedi's signed live inventory and compare its actual triggers/statuses to repository specs.
2. Reuse Shopify field names, precedence, cooldowns, consent, SendGrid suppression, UTMs, test identities, cutover, and rollback structure.
3. Replace all brand assets, claims, products, discounts, sender/reply-to, timing assumptions, and custom delivery integration based on MakeMeJedi operations.
4. Re-run every capability and compliance gate; do not infer that a passing TurnedComics app/plan/market configuration exists in the MakeMeJedi store.
5. Cut over MakeMeJedi flow-by-flow only after TurnedComics findings are folded into the template.

## Fable independent architecture and security validation

On 2026-08-18, the installed Claude-Pro watcher lane was smoke-tested and returned `claude-fable-5` with complete execution metadata. The review was deliberately split into bounded architecture and webhook-security gates after larger non-interactive prompts returned no execution record; those empty attempts were treated as unverified and did not count.

### Overall verdict: ACCEPT_WITH_CHANGES

Fable found the per-brand split coherent: PopSmiths can retain its custom SendGrid lifecycle engine; TurnedComics and then MakeMeJedi can use Shopify for lifecycle; SendGrid can retain scheduled broadcasts; and the single-owner queue-empty migration boundary is sound.

Required architecture change: Shopify-to-SendGrid consent/suppression synchronization is a permanent runtime dependency, not merely a migration task. Monitor sync freshness continuously and **halt all affected-brand SendGrid broadcasts globally** whenever the suppression dataset is stale or the sync cannot be proven current. Per-address fail-closed behavior is insufficient when the source dataset itself may be stale.

### SendGrid webhook verdict: FIX_NOW, staged

PopSmiths production currently skips SendGrid event-webhook signature verification because `SENDGRID_WEBHOOK_PUBLIC_KEY` is absent. The code also fails open when a configured key is malformed. Fable judged this worth fixing now because an unauthenticated caller can forge delivery, bounce, spam, unsubscribe, click, and related telemetry.

The key must **not** simply be pasted into Heroku. Safe rollout:

1. Change present-but-malformed key handling to fail closed (or refuse startup) and add an explicit `off | observe | enforce` verification mode. Deploy while the key remains absent and behavior remains unchanged.
2. Enable SendGrid Signed Event Webhook and capture its public key. Leave receiver enforcement off so signed and unsigned transition traffic is not lost.
3. Configure the key and switch the receiver to `observe`: verify ECDSA/SHA256 against timestamp plus the exact raw request body and enforce/log the five-minute replay window, but continue processing during observation.
4. Observe 24–48 hours, including retries. Reconcile SendGrid webhook delivery/failure telemetry with application ingestion and investigate every verification failure, clock-skew issue, or raw-body mismatch.
5. Switch to `enforce`, rejecting missing/invalid/stale signatures, and monitor SendGrid retries plus ingestion volume.

Rollback: return the receiver to `observe` while leaving SendGrid signing enabled and retaining the valid key. Do not return to an unsigned sender configuration unless a separately approved emergency procedure requires it.

Evidence required before enforcement:

- the public key is obtained from the authenticated PopSmiths SendGrid signed-webhook configuration and stored without transformation loss;
- test vectors prove valid signature acceptance and invalid, missing, stale, replayed, body-mutated, and malformed-key rejection;
- raw-body capture occurs before JSON parsing and matches the bytes SendGrid signed;
- observation shows near-100% valid signatures across a complete traffic/retry cycle;
- event-volume reconciliation and alerting can detect loss immediately;
- rollback to `observe` is tested and owned;
- forged webhook events are proven unable to directly alter canonical consent/suppression, or that mutation path is separately protected and tested.

## Beastmode phase record

- **Director:** primary Codex agent; owned contract, evidence synthesis, decisions, final verification, persistence, and publication.
- **Executor 1:** lower worker, requested `gpt-5.6-luna` low; audited repository flow/assets and evidence. Actual worker-capacity telemetry was not exposed.
- **Executor 2:** lower worker, requested `gpt-5.6-luna` low; mapped current official Shopify capabilities and gaps. Actual worker-capacity telemetry was not exposed.
- **Reviewer:** separate lower worker, requested `gpt-5.6-luna` medium; adversarially challenged scope, migration boundary, consent, precedence, QA, cutover, rollback, metrics, and estimates. Actual worker-capacity telemetry was not exposed.
- **Review result:** initial draft rejected; all P0/P1 issues corrected; amended full draft accepted with no remaining P0/P1 findings.
- **Fable watcher:** requested and actual `claude-fable-5` through `claude -p --permission-mode plan`; architecture verdict `ACCEPT_WITH_CHANGES`; webhook verdict `FIX_NOW` with staged observe-before-enforce rollout. Recorded Fable costs: USD 0.706245 for the architecture verdict and USD 0.712795 for the webhook verdict. Empty intermediate calls produced no execution record and were excluded from validation.
- **Budget/time telemetry:** no explicit budget, used/remaining token counts, or per-agent wall-clock allocation was exposed by the harness; no unsupported numbers are claimed.
- **Merge boundary:** no live-system or mkt-hub code changes were authorized or performed. The durable output is this MemroOS plan.

## Immediate next action

Run Phase 0 in the live TurnedComics Shopify and Omnisend admins. The first artifact must be the signed live inventory and decision log. Only then should inactive Shopify automations and templates be built.
