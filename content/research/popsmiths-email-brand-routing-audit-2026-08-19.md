---
title: "PopSmiths Email and Shopify Brand-Routing Audit"
description: "Read-only audit of Portrified routing, lifecycle email paths, duplicate-send risk, and multi-brand migration coupling."
publishedAt: "2026-08-19"
tags: ["popsmiths", "shopify", "email", "sendgrid", "omnisend", "root-cause-analysis"]
keywords: ["Portrified", "PopSmiths", "checkout recovery", "abandoned cart", "multi-brand", "duplicate sends"]
author: "Codex"
source_session: "01a01b81-a237-7eb1-84bf-c6998373bb3a"
model: "gpt-5.6-sol with gpt-5.6-luna subagents"
sources:
  - "local:/home/lac5q/github/popsmiths_app"
  - "local:/home/lac5q/github/mkt-hub"
  - "https://help.shopify.com/en/manual/promoting-marketing/create-marketing/migrate-abandoned-checkout"
  - "https://help.shopify.com/en/manual/promoting-marketing/create-marketing/shopify-messaging/marketing-automations/create"
  - "https://api-docs.omnisend.com/v2026-preview/reference/automations"
derived_from: []
regen_prompt: "Re-audit both repositories for active Shopify domains, lifecycle provider configuration, checkout recovery send paths, and legacy Portrified references; report exact file and line evidence without exposing secrets."
---

# Executive Finding

The screenshot is consistent with Shopify's native abandoned-checkout email being emitted by the PopSmiths store, which is the original Portrified Shopify store renamed in place. The immutable Shopify identity is still `portrified.myshopify.com`, even though the current store name is PopSmiths and the primary storefront domain is `shop.popsmiths.com`. The PopSmiths application separately runs a SendGrid lifecycle worker. Shopify, Flow, an installed Omnisend app, and the PopSmiths worker can therefore operate as independent send owners unless they are explicitly reconciled.

The wrong email is not the PopSmiths SendGrid template. Its Portrified logo, `LOGO20` offer, `Last chance...` subject, and `Canvas Vertical - PS` row are external to the application repository. The immediate containment action is to turn off the legacy Shopify abandoned-checkout/cart automation in Shopify Admin and retain PopSmiths SendGrid as the sole marketing automation owner.

## Live Production State

- Shopify shop ID `55094018232` reports name `PopSmiths`, immutable domain `portrified.myshopify.com`, primary domain `shop.popsmiths.com`, Basic plan, and `America/New_York` store time zone.
- The live PopSmiths Heroku app sets `SHOPIFY_STORE_DOMAIN=popsmiths.myshopify.com` and `SHOPIFY_CHECKOUT_DOMAIN=shop.popsmiths.com`; both resolve to the same Shopify shop above.
- `LIFECYCLE_ENABLED=true` and `LIFECYCLE_SCHEDULED_WORKER=true`. The production database marks all three `cart_recovery_1/2/3` campaigns active and enabled, along with 20 other lifecycle campaign settings.
- SendGrid is configured in production; Resend and Omnisend provider keys are not configured in the PopSmiths app.
- The Shopify store has Flow, Omnisend, and Klaviyo installed. Shopify's public Admin API does not expose a documented mutation to toggle Shopify Messaging/Flow automation state, so containment requires Shopify Admin UI.
- A direct read of the PopSmiths application database found no app-owned checkout for the screenshot recipient in the prior seven days. That supports the conclusion that this checkout and email were created inside Shopify's native storefront path rather than the app's checkout table.

## Evidence

- `/home/lac5q/github/popsmiths_app/.env.example:31-36` labels the Shopify Storefront API as the Portrified store and defaults `SHOPIFY_STORE_DOMAIN=portrified.myshopify.com`.
- `/home/lac5q/github/popsmiths_app/app.json:21-22` deploys `SHOPIFY_STORE_DOMAIN` as `portrified.myshopify.com`.
- `/home/lac5q/github/popsmiths_app/apps/backend/tools/create-checkout.js:202-207` defaults the API store to `popsmiths.myshopify.com`, but `:276-290` uses `SHOPIFY_CHECKOUT_DOMAIN || SHOPIFY_STORE_DOMAIN || 'portrified.myshopify.com'` when normalizing the customer-facing checkout host. This split is a direct path to a PopSmiths-created checkout being rewritten to a Portrified checkout host.
- `/home/lac5q/github/popsmiths_app/apps/backend/server.js:4613-4623` rewrites checkout URLs from Shopify hosts to the database `checkout_domain`; `/home/lac5q/github/popsmiths_app/apps/backend/server.js:9811-9825` falls back to `portrified.myshopify.com` for that setting.
- `/home/lac5q/github/popsmiths_app/apps/backend/server.js:3365-3375` uses `popsmiths.myshopify.com` as the redirect fallback, so different checkout paths have inconsistent defaults.
- `/home/lac5q/github/popsmiths_app/apps/backend/src/services/lifecycle-config.js:275-353` defines `cart_recovery_1/2/3`, but all three default to `draft` and `defaultEnabled: false`; production sends require explicit lifecycle configuration.
- `/home/lac5q/github/popsmiths_app/apps/backend/src/services/lifecycle.js:2382-2541` queries incomplete checkouts and schedules recovery at 2h, 24h, and 72h. `/home/lac5q/github/popsmiths_app/apps/backend/scripts/lifecycle-worker.js:30-46` only runs when `LIFECYCLE_ENABLED` and `LIFECYCLE_SCHEDULED_WORKER=true`; `/home/lac5q/github/popsmiths_app/app.json` does not set either flag.
- `/home/lac5q/github/popsmiths_app/apps/backend/src/services/lifecycle.js:1911-1931` sends lifecycle mail through the shared email service with `customArgs.app='popsmiths'` and campaign metadata. `/home/lac5q/github/popsmiths_app/apps/backend/src/services/email.js:40-75,1137-1224` selects Resend first, then SendGrid, and uses a singleton sender.
- `/home/lac5q/github/popsmiths_app/apps/backend/src/services/email.js:44` reads `EMAIL_FROM`, while `/home/lac5q/github/popsmiths_app/app.json:43-50` configures `TRANSACTIONAL_EMAIL_FROM`, `LIFECYCLE_EMAIL_FROM`, and `EMAIL_REPLY_TO`. Those app.json stream-specific settings are not consumed by the shown email service, so a migration must reconcile config names before relying on stream separation.
- `/home/lac5q/github/popsmiths_app/apps/backend/src/routes/webhooks.js:170-227` filters SendGrid webhook events using PopSmiths tokens/app names; the database event schema and lookup at `:261-300` have no brand/store dimension.
- `/home/lac5q/github/popsmiths_app/apps/backend/src/services/lifecycle.js:321-400,1581-1621,1623-1754` hardcode PopSmiths runtime/base URLs, preference URLs, and rendered copy. `/home/lac5q/github/popsmiths_app/apps/backend/src/services/lifecycle.js:1933-1952` records campaign events globally by email/campaign, without store isolation.
- Git history shows `/home/lac5q/github/popsmiths_app` commit `31657677` (2026-08-18), titled `fix: deduplicate lifecycle cart recovery sends`; it changed cart recovery queries from checkout-ID checks to latest-checkout-per-email plus campaign-event checks. This confirms an internal duplicate-send defect existed recently, independent of Shopify native automation.

## Marketing Repository Findings

- `/home/lac5q/github/mkt-hub/01_scripts/omnisend/templates/popsmiths-cart-recovery-no-image.html:1-5,13-93` is a PopSmiths-specific Omnisend cart-recovery template, with `{{ cart_url }}` and PopSmiths branding.
- `/home/lac5q/github/mkt-hub/01_scripts/omnisend/README.md:155-163` calls that template a safe replacement cart-recovery draft. This is an external Omnisend automation/template path, separate from the Popsmiths app lifecycle engine.
- `/home/lac5q/github/mkt-hub/01_scripts/daily_profit_report/config.py:57-63` maps separate Omnisend keys only for TurnedYellow and MakeMeJedi. `/home/lac5q/github/mkt-hub/04_config/environment/omnisend.env.example:6-15` documents the same two-account split. This is not a managed multi-brand lifecycle runtime.
- `/home/lac5q/github/mkt-hub/email/checkout-incident-recovery-2026-08-19/turnedcomics/run.cjs:17-28,350-382,404-444` is a TurnedComics-only, explicitly approved SendGrid recovery runner. It reads Omnisend subscription state, Shopify purchasers, SendGrid suppressions, and a hashed send ledger before sending. Its `.run-ledger.ndjson` records 3 eligible and 3 accepted on 2026-08-19; it is not the PopSmiths screenshot path.
- `/home/lac5q/github/mkt-hub/email/national-dog-day-2026/omnisend/prepare-campaigns.mjs:41-89,261-284,343-371` supports MakeMeJedi and TurnedComics only, creates/reuses Omnisend segments/templates/drafts, and deliberately has no production-send call. `/home/lac5q/github/mkt-hub/email/national-dog-day-2026/README.md:41-69` documents this plus the separate TurnedComics SendGrid migration.
- The mkt-hub repository contains many legacy Portrified references, but the highest-risk operational ones are PopSmiths reporting scripts `/home/lac5q/github/mkt-hub/scripts/popsmiths-daily-revenue.sh:10-13` and `scripts/popsmiths-weekly-report.sh:10-12`, and older application defaults/templates in the PopSmiths app. These references do not themselves send email, but demonstrate brand/store configuration drift.

## Duplicate-Send Model

1. A checkout is created in the PopSmiths Shopify store, whose immutable shop identity remains `portrified.myshopify.com`. Shopify's native abandoned-checkout/cart automation selects the old Portrified template shown in the screenshot.
2. Separately, Omnisend may send its PopSmiths cart-recovery automation using the mkt-hub template, or the PopSmiths lifecycle worker may send `cart_recovery_1/2/3` through SendGrid if production flags/database campaign settings are enabled.
3. The recent lifecycle dedupe fix only protects the PopSmiths app's own database-driven sends. It cannot suppress Shopify's native email or Omnisend's independent send because neither is coordinated by the same `campaign_events` ledger.

## Live Omnisend Inventory

| Store | Enabled automations | Main risk |
|---|---:|---|
| TurnedYellow | 19 | Multiple cart, checkout, browse, site-abandonment, welcome, and Aimerce/Elevar flows overlap. |
| MakeMeJedi | 13 | Duplicate native and Aimerce abandonment flows plus multiple welcome/post-purchase paths. |
| TurnedWizard | 4 | Lowest-complexity migration pilot. |
| TurnedComics | 6 | Abandoned cart and abandoned checkout paths coexist; SendGrid is already used for guarded campaigns. |
| PopSmiths | 23 active SendGrid lifecycle settings | Audit Shopify/Flow ownership; do not migrate this store from Omnisend because its canonical engine is already SendGrid. |

These counts are configuration state, not proof that every enabled workflow is delivering. Before cutover, export each workflow's trigger, audience, delays, messages, sender, consent rules, and in-flight recipients.

## SendGrid Readiness

The shared SendGrid account already has valid authenticated domains for `popsmiths.com`, `turnedyellow.com`, `makemejedi.com`, `turnedwizard.com`, and `turnedcomics.com`. Domain authentication is therefore not the migration blocker.

Only one brand-specific unsubscribe group currently exists: `TurnedComics Marketing` (group 37327). Each additional brand must receive its own marketing suppression group before production sends. Transactional messages must remain separate from marketing and must not be used to carry discounts, recommendations, or recovery promotions.

## Multi-Brand Feasibility and Safest Migration

The lifecycle engine is reusable as a foundation but is not currently multi-brand safe. It couples one brand to global tables (`checkouts`, `customers`, `campaign_events`), a singleton provider/sender, PopSmiths-only custom args and webhook filtering, PopSmiths URLs/copy, one Shopify domain, and one preference-token secret. Adding brands without an explicit brand/store key risks cross-brand audience selection, wrong links, and wrong sender identity.

Recommended phased path:

1. **Containment:** turn off Shopify Messaging/legacy abandoned-checkout, abandoned-cart, and relevant Flow sends for PopSmiths. Retain the PopSmiths SendGrid lifecycle engine. Rebrand the Shopify template/catalog data that still says Portrified.
2. **Freeze and export:** make no Omnisend workflow edits while exporting active workflow definitions, consent state, suppressions, and queued/in-flight recipients for every brand.
3. **Build brand isolation:** introduce `brand_id/store_id` into checkouts, customers/audience joins, campaign events, preferences, provider custom arguments, and webhook lookups. Configure per-brand store domain, site URL, sender/reply-to, templates, suppression group, and credentials.
4. **Create brand suppression groups:** create one SendGrid marketing ASM group per store and import Omnisend unsubscribes, bounces, spam reports, and invalid addresses before any replacement can send.
5. **Pilot TurnedWizard:** replace its four Omnisend workflows with one consented welcome flow and one canonical abandonment state machine; keep Shopify transactional messages. Run in shadow mode, then cut over in one controlled window.
6. **Migrate TurnedComics:** use the existing guarded SendGrid runner pattern and choose checkout or cart as the canonical abandonment event, never both.
7. **Migrate MakeMeJedi, then TurnedYellow:** consolidate duplicated Aimerce/Elevar/native workflows before enabling replacements. TurnedYellow moves last because its 19 enabled workflows create the largest overlap risk.
8. **Cutover gate:** immediately before each send, reconcile current order state, brand consent/suppressions, and provider idempotency key `store + customer + event/checkout + flow step`. Stop the old Omnisend flow and in-flight contacts before enabling the SendGrid replacement. Monitor at least one full sequence cycle before deleting legacy configuration.

### Omnisend Disable Semantics

Use the current versioned API, not the repository's older v3/v5 reporting client:

```http
POST /api/automations/{id}/disable
Authorization: Omnisend-API-Key <key>
Omnisend-Version: 2026-03-15
Content-Type: application/json

{"contactsInWorkflow":"exit"}
```

For abandonment migrations, `exit` is required so delayed Omnisend messages cannot land after the SendGrid replacement is enabled. Do not delete the old workflow. On rollback, re-enable with `enrollExisting: false`; retroactive enrollment can produce another message burst. Add a migration cutoff timestamp or imported sent-history suppression before enabling a replacement against historical carts.

This audit is read-only with respect to both source repositories. No source files or provider settings were changed.
