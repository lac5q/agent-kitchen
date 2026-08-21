---
title: "PopSmiths successful-video consent and OMS-import audit"
description: "Read-only reconciliation of PopSmiths video recipients, front-end capture evidence, marketing-consent fields, and cross-brand OMS imports."
publishedAt: "2026-08-20"
tags: [popsmiths, email-consent, audience, oms, audit]
keywords: [successful-video, art-ready, loading_gate, loading_slow, transform_start, marketing_opt_out]
author: "Codex"
source_session: "/root/pops_video_style_audit"
model: "gpt-5"
sources:
  - "local:/home/lac5q/github/popsmiths_app/apps/web-widget/src/components/EmailCaptureScreen.jsx"
  - "local:/home/lac5q/github/popsmiths_app/apps/web-widget/src/components/LoadingScreen.jsx"
  - "local:/home/lac5q/github/popsmiths_app/apps/web-widget/src/App.jsx"
  - "local:/home/lac5q/github/popsmiths_app/apps/backend/server.js"
  - "local:/home/lac5q/github/popsmiths_app/docs/OMS-INTEGRATION-GUIDE.md"
  - "label:production-heroku-postgres-read-only-query-2026-08-20"
derived_from:
  - "label:prior-popsmiths-video-style-and-audience-audit"
regen_prompt: "Re-run the same read-only joins in production Heroku Postgres and re-inspect the PopSmiths capture and OMS-import code paths; report aggregate counts only."
---

# Scope and method

Read-only audit of the production PopSmiths Heroku Postgres database and the checked-in PopSmiths app code. No PII, provider writes, sends, or schema changes were performed. Video joins use `creation_videos.creation_id -> image_generations.id`, then resolve the email through the linked customer/session metadata. OMS joins use `image_generations.metadata->>'import_id' -> oms_imports.id`.

# Front-end consent evidence

The current email-reveal form is an email-only form. `EmailCaptureScreen.jsx` says “Enter your email to reveal,” “We'll save your artwork so you can access it anytime,” and “We respect your privacy. No spam, ever.” It has no marketing checkbox or affirmative marketing language. The active `LoadingScreen.jsx` form likewise asks “WHERE SHOULD WE SEND YOUR MASTERPIECE?”, collects only an email, and says “No spam, ever. Unsubscribe anytime.” The “Who is this artwork for?” survey is a product-intent question, not a consent control.

The normal loading-gate handler records `source: 'loading_gate'`; the slow-render notification handler records `source: 'loading_slow'`. Separately, `/api/v1/transform/start` automatically registers an `art_ready` record with `source: 'transform_start'` whenever a customer email is already present. Therefore, `transform_start` is not proof that the user typed the email into the form.

The OMS path supplies the email before the widget opens: the integration guide describes an OMS redirect with `order_id`, `email`, `brand`, and `image_url`; the widget applies `data.email` to `userEmail`; and the pre-generation request sends the imported email and OMS import ID. This permits video creation without a PopSmiths email-reveal submission.

# Production aggregate results (queried 2026-08-20)

| Measure | Distinct emails | Video rows / notes |
|---|---:|---|
| Successful videos with a URL | 644 | 1,321 rows |
| Successful-video emails with `customers.source='oms'` | 630 | 1,294 rows |
| Successful-video emails linked to an OMS import ID | 634 | 1,306 rows; all matching OMS emails were pre-populated in `oms_imports.email` |
| Linked OMS video emails with a PopSmiths-branded OMS import | 0 | The observed OMS brands were Turned Yellow, Make Me Jedi, and Turned Wizard; 12 email groups had no current matching OMS row |
| Linked OMS video emails that are cross-brand-only | 634 | Includes the 630 `oms` customer-source emails plus 4 existing customers with another customer source; grouped brand counts can overlap when one email has multiple imports |

## Form/subscription reconciliation

The strict count for **successful video + verified user-entered form submission** is **1 distinct email**: one successful-video recipient has a matched `email_capture_submitted` / `art_ready_subscriptions` record with the user-entered `loading_slow` source. There were **0** successful-video matches with the current `loading_gate` source.

A broader, non-consent count is **10 distinct emails** with any matched `art_ready_subscriptions` row (8 exact-generation `transform_start`, 1 session-level `transform_start`, and 1 session-level `loading_slow`). The nine `transform_start` rows are automatic lifecycle records and should not be labeled form submissions.

Across all capture events, the database has 648 `email_capture_submitted` rows / 121 distinct emails: 520 `transform_start`, 108 `loading_gate`, and 20 `loading_slow`. Only 3 distinct successful-video emails had any generation/session-linked capture event; only 1 had a form-specific source (`loading_slow`).

## Explicit marketing consent/subscribed state

Confirmed explicit marketing opt-in among successful-video emails: **0**. The schema has opt-out columns (`marketing_opt_out`, `all_optional_opt_out`, etc.) but no affirmative `marketing_opt_in`, `consent`, or `subscribed` field. A metadata-key scan across customers, OMS imports, image generations, art-ready subscriptions, and campaign events found no consent/opt-in/subscribed/marketing keys.

For context only, 358 of the 644 video emails have an `email_preferences` row; 277 have both `marketing_opt_out=false` and `all_optional_opt_out=false`. Those false values are predominantly lifecycle defaults (263), transform-start defaults (11), and other non-consent records; they are not evidence of affirmative subscription. 81 video emails have an opt-out flag set and 286 have no preference row.

# Decision and safe audience logic

The assertion “everyone who received a video opted in through the PopSmiths front end” is not supported by the current evidence. OMS-import contacts can have a pre-supplied email, enter the PopSmiths widget, and receive a pre-generated video without submitting the email-reveal form. The strongest current evidence is 1 form-specific successful-video match, 10 broad art-ready matches, and 0 explicit marketing opt-ins.

Do not use successful-video status, `customers.source='oms'`, presence of an email, `marketing_opt_out=false`, or an art-ready subscription as a PopSmiths marketing-consent proxy. A safe PopSmiths marketing audience should require an independently recorded affirmative PopSmiths opt-in (provider consent record or a new checkbox-backed record with brand, timestamp, source URL, policy/version, and consent value), followed by global/brand suppression checks. Treat the 634 cross-brand-only video contacts as a re-permission/consent-gap segment, not as an automatically marketable audience.
