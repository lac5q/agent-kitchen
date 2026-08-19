---
title: "PopSmiths Email and Shopify Brand-Routing Audit"
description: "Read-only audit of Portrified routing, lifecycle email paths, duplicate-send risk, and multi-brand migration coupling."
publishedAt: "2026-08-19"
tags: ["popsmiths", "shopify", "email", "sendgrid", "omnisend", "root-cause-analysis"]
keywords: ["Portrified", "PopSmiths", "checkout recovery", "abandoned cart", "multi-brand", "duplicate sends"]
author: "Codex"
source_session: "01a01b81-a237-7eb1-84bf-c6998373bb3a"
model: "gpt-5.6-luna"
sources:
  - "local:/home/lac5q/github/popsmiths_app"
  - "local:/home/lac5q/github/mkt-hub"
derived_from: []
regen_prompt: "Re-audit both repositories for active Shopify domains, lifecycle provider configuration, checkout recovery send paths, and legacy Portrified references; report exact file and line evidence without exposing secrets."
---

# Executive Finding

The screenshot is consistent with Shopify's native abandoned-checkout email being emitted by a store still routed/configured as Portrified. The PopSmiths application has legacy Portrified routing in deployment defaults and checkout fallbacks, while its own lifecycle engine is a separate SendGrid path. A duplicate can therefore be produced by Shopify native recovery plus an Omnisend or PopSmiths lifecycle recovery; repository code alone cannot prove which external automation is currently enabled.

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

1. A checkout is created or rewritten onto `portrified.myshopify.com` due to `app.json`, `.env.example`, `create-checkout.js`, or server store-setting fallback. Shopify's native abandoned-checkout automation then selects the Portrified template shown in the screenshot.
2. Separately, Omnisend may send its PopSmiths cart-recovery automation using the mkt-hub template, or the PopSmiths lifecycle worker may send `cart_recovery_1/2/3` through SendGrid if production flags/database campaign settings are enabled.
3. The recent lifecycle dedupe fix only protects the PopSmiths app's own database-driven sends. It cannot suppress Shopify's native email or Omnisend's independent send because neither is coordinated by the same `campaign_events` ledger.

## Multi-Brand Feasibility and Safest Migration

The lifecycle engine is reusable as a foundation but is not currently multi-brand safe. It couples one brand to global tables (`checkouts`, `customers`, `campaign_events`), a singleton provider/sender, PopSmiths-only custom args and webhook filtering, PopSmiths URLs/copy, one Shopify domain, and one preference-token secret. Adding brands without an explicit brand/store key risks cross-brand audience selection, wrong links, and wrong sender identity.

Recommended phased path:

1. **Containment:** disable Shopify abandoned-checkout automation on the Portrified store and pause the PopSmiths Omnisend cart-recovery automation until one owner is selected. Set and verify one canonical Shopify checkout domain in production; remove Portrified fallbacks only after checking active Heroku config and Shopify admin.
2. **PopSmiths single-brand cutover:** keep the current lifecycle engine as the sole recovery sender, with cart recovery enabled only after a SendGrid test and event-ledger verification. Add a pre-send suppression/holdout check against Shopify order state and a provider-level idempotency key; verify `campaign_events` for one test checkout.
3. **Provider migration:** build a provider adapter around SendGrid/Omnisend with one brand config record containing store domain, app/base URL, sender/reply-to, templates, preference category IDs, and provider credentials. Do not rely on `EMAIL_FROM` singleton state; consume the configured stream-specific names or replace them consistently.
4. **Brand isolation:** add `brand_id`/`store_id` to checkouts, customers/audience joins, campaign events, preference records, and SendGrid custom args; scope every candidate query and webhook lookup. Add per-brand Shopify order/purchase reconciliation before enabling sends.
5. **Pilot sister brand:** migrate one store (for example TurnedComics) with a separate domain-authenticated SendGrid sender and an Omnisend-consent import. Use the existing guarded runner pattern: suppression reconciliation, hashed ledger, explicit approval, lock, and test send. Only after a clean pilot should remaining brands move off Omnisend.

This audit is read-only with respect to both source repositories. No source files or provider settings were changed.
