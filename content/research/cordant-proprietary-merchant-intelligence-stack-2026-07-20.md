---
title: "Cordant proprietary merchant-intelligence stack"
description: "A compliant, evidence-first plan for using third-party proprietary API databases to deepen merchant checkout-readiness research."
publishedAt: "2026-07-20"
tags: ["cordant", "merchant-intelligence", "ecommerce", "payments", "research"]
keywords: ["StoreLeads", "BuiltWith", "Similarweb", "Wappalyzer", "Reevo", "merchant readiness"]
author: "Alba"
source_session: "Discord thread 1528868665985077409"
model: "gpt-5.6-terra"
sources:
  - "https://storeleads.app/api"
  - "https://api.builtwith.com/domain-api"
  - "https://support.similarweb.com/hc/en-us/articles/360001631538-Similarweb-Data-Methodology"
  - "https://www.wappalyzer.com/docs/api/v2/lookup"
  - "https://developers.google.com/search/docs/appearance/structured-data/merchant-listing"
  - "https://www.rfc-editor.org/info/rfc9309"
  - "https://playwright.dev/docs/network"
  - "https://reevo.ai/terms"
derived_from:
  - "content/research/cordant-agentic-merchant-payments-readiness-2026-07-20.md"
regen_prompt: "Research current proprietary merchant intelligence sources and design a compliant, evidence-first Cordant stack. Distinguish vendor enrichment from observed checkout readiness."
---

# Decision

For external copy, say that Cordant combines public website research with **third-party proprietary API databases**. Do not name a provider or imply that a vendor feed proves checkout readiness.

For the working system, use a small complementary stack. Vendor data selects and enriches targets. Cordant public observation remains the source of truth for what a merchant publicly exposes.

## Recommended v1 stack

| Need | Tool | Use | Interpretation limit |
|---|---|---|---|
| Merchant universe | StoreLeads Enterprise | Find ecommerce domains by platform, geography, category, shipping, app, and historical changes. | Store fields and estimated sales or visits are vendor outputs. |
| Technology hypotheses | BuiltWith | Enrich targets with platform, PSP, checkout, wallet, and historical web-technology signals. | A detected script or iframe is not proof that a payment method is enabled. |
| Market priority | Similarweb | Segment the candidate universe by modeled traffic, country, channel, and audience context. | Modeled traffic is not merchant analytics or conversion evidence. |
| Readiness evidence | Cordant public scanner | Record only timestamped public HTML, structured data, headers, rendered signals, and stop barriers. | It cannot prove a successful payment or shipping quote. |

This stack avoids paying twice for the same core layer. StoreLeads provides commerce-first discovery. BuiltWith provides broad technographic coverage. Similarweb provides a market-priority lens.

## Add only when the decision changes

| Question | Add | Do not buy by default |
|---|---|---|
| Need live sampled technology checks or light company enrichment? | Wappalyzer | BuiltWith, except for a defined disagreement and freshness sample. |
| Need organic, paid, or AI-search discovery context? | Semrush | Similarweb, unless this is a published study dimension. |
| Need SKU-level price, promotion, availability, and assortment intelligence? | DataWeave, Profitero+, or Wayvia | More than one digital-shelf vendor without a measured coverage advantage. |
| Need legal entity, parent, and ownership mapping? | Moody's Orbis | D&B Hoovers for ownership analysis. |
| Need a governed outreach list after research? | D&B Hoovers | Contact enrichment inside the core readiness corpus. |

## Evidence rules

Every field must carry one of these labels:

1. **Publicly observed.** Cordant directly saw it on a timestamped public page, header, feed, or browser response.
2. **Vendor enrichment.** A licensed third-party source supplied it. Keep the vendor, field, retrieval time, vendor timestamp, and confidence.
3. **Provider reference.** A PSP or wallet provider documents possible support for a country, currency, or method.
4. **Unknown.** Checkout behavior, buyer eligibility, shipping quote, fraud decision, and payment completion require merchant authorization or sandbox testing.

A detected Stripe, PayPal, Adyen, wallet, or BNPL component is a **public integration signal**. It is not evidence that the method is live for a buyer, country, or currency.

## High-value public signals

The scanner should collect only allowed public evidence:

- `robots.txt`, declared sitemap URLs, and linked public product pages;
- JSON-LD product, price, availability, shipping, returns, and currency data;
- `hreflang`, page language, canonical URL, localized paths, and visible country/currency controls;
- platform, CDN/WAF, PSP, wallet, and public script/iframe origins;
- sanitized browser telemetry: origin, normalized path, resource type, status, redirect origin, timing bucket, and allowlisted response headers;
- barriers: robots prohibition, `401`, `403`, `429`, bot challenge, CAPTCHA, sign-in, age, prescription, address, inventory, or quote requirement.

Do not retain network bodies, cookies, authorization headers, query strings, payment IDs, client secrets, PANs, CVVs, wallet tokens, OTPs, or screenshots of payment areas.

## Operating boundary

Use public observation first. The worker must not create accounts, add inventory-holding carts, fill forms, invoke wallets, start payment intents, submit orders, solve challenges, rotate proxies, or emulate a buyer identity.

Treat a barrier as a successful classification. Stop and record the minimum evidence required for review.

Merchant-authorized staging or PSP sandbox testing is a separate lane. Mark those results `sandbox_verified`; never extrapolate them to unrelated production merchants.

## Procurement plan

Run a 200–500-domain stratified bake-off across countries, platforms, traffic bands, and checkout architectures. Measure coverage, freshness, duplicate handling, false positive and negative rates against Cordant public evidence, API/export quality, license rights, and cost per usable candidate.

Contract terms must explicitly permit the intended research use, retain auditability, define derivative-work and report-sharing rights, set retention/deletion rules, and document data provenance. Keep organization-level fields by default. Add people data only to a separate, approved outreach workflow.

## Reevu/Reevo name check

The name requires care. **Reevu** (`myreevu.com`) is a creator tool for YouTube comments and is unrelated to Cordant. The likely intended company is **Reevo** (`reevo.ai`), a sales CRM/prospecting platform.

Reevo can potentially supply company/domain enrichment, but its public material does not establish merchant checkout or payment-readiness data. Its standard terms also restrict use to internal sales and marketing and grant broad rights over supplied sales-lead data. Do not upload Cordant's corpus or research output to Reevo without a negotiated agreement. BuiltWith is a better narrow fit for technology-based merchant discovery.

## Primary vendor references

- StoreLeads API and fields: https://storeleads.app/api and https://storeleads.app/help/faq/what-data-is-available-for-domains
- BuiltWith Domain API: https://api.builtwith.com/domain-api
- Similarweb methodology: https://support.similarweb.com/hc/en-us/articles/360001631538-Similarweb-Data-Methodology
- Wappalyzer lookup API: https://www.wappalyzer.com/docs/api/v2/lookup
- Semrush data methodology: https://www.semrush.com/kb/997-semrush-data
- DataWeave: https://dataweave.com/us/pricing-intelligence
- Moody's Orbis: https://www.moodys.com/web/en/us/capabilities/company-reference-data/orbis.html
- Reevo terms: https://reevo.ai/terms
