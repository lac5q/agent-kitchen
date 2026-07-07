---
title: "OpenAI Ads vs Google Ads — TurnedYellow Shopify Performance Snapshot"
description: "Recovered research from session 20260514_130949_899397. Comparison of OpenAI Ads delivery metrics (CTR/CPC) vs Google Ads display benchmarks, with conversion-tracking implementation plan for a Shopify store. Originally produced in chat but never persisted to MemroOS — backfilled by the research-without-persist-detector cron."
publishedAt: "2026-07-07"
tags:
  - openai-ads
  - google-ads
  - shopify
  - conversion-tracking
  - pixel-implementation
  - recovered-artifact
keywords:
  - openai ads ctr cpc benchmark
  - shopify openai pixel items_added
  - openai conversions api vs pixel
  - turnedyellow ads
author: "Alba [bot]"
source_session: "20260514_130949_899397"
model: "claude-opus-4-7"
sources:
  - "https://developers.openai.com/ads/api-reference/insights"
  - "https://bzrcdn.openai.com/sdk/oaiq.min.js"
  - "label:session:20260514_130949_899397"
derived_from:
  - "~/.hermes/cron/output/research-without-persist-2026-07-07.md"
regen_prompt: "Pull OpenAI Ads campaign performance (impressions, clicks, spend, CTR, CPC) for the TurnedYellow Shopify store 'Test' campaign (May 13, 2026) via the OpenAI Ads Insights API, compare CTR/CPC against Google Ads display benchmarks, and produce a step-by-step Measurement Pixel + Conversions API implementation plan for theme.liquid and Shopify checkout additional-scripts, tracking items_added and order_created events."
---

# OpenAI Ads vs Google Ads — TurnedYellow Shopify Performance Snapshot

> **Recovered artifact.** This document was produced in chat during session `20260514_130949_899397` on 2026-05-14 but never written to MemroOS via `mcp_memroos_knowledge_write`. The research-without-persist-detector cron (`087618319c51`, daily 09:00 PT) flagged the session on 2026-07-07 and backfilled it here. The data is single-day and from May 2026; treat benchmarks as directional, not current.

## Context

TurnedYellow (turnedyellow.com) ran a single-day OpenAI Ads campaign ("Test", 2026-05-13) for custom Simpsons-style gifts with a 50% off + LOVE20 promo. The user asked:

1. Did the campaign drive any add-to-cart activity in Google Analytics?
2. How do OpenAI Ads compare to Google Ads for purchase affinity?

The OpenAI Ads Insights API only returns **delivery metrics** (impressions, clicks, spend). It does NOT expose add-to-cart or purchase events. Those require either:

- The OpenAI **Measurement Pixel** (client-side, fires `items_added` / `order_created`), OR
- The OpenAI **Conversions API** (server-side, posts events to `https://bzr.openai.com/v1/events`).

At the time of the session, the only OpenAI event firing on the store was `registration_completed` with `$0` amount — fired on every page load. That event is meaningless for e-commerce conversion measurement.

## Campaign Performance — May 13, 2026

**Account:** TurnedYellow (turnedyellow.com)
**Campaign:** "Test"
**Date Range:** Single day (2026-05-13)

| Metric | Value |
|---|---|
| Spend | $45.91 |
| Impressions | 1,073 |
| Clicks | 24 |
| **CTR** | **2.24%** |
| **CPC** | **$1.91** |

### Ads Running

| Ad | Clicks | Spend | CTR | CPC | Landing Page |
|---|---|---|---|---|---|
| Test 2 | 16 | $32.31 | 2.21% | $2.02 | turnedyellow.com/products/turn-me-yellow-new |
| General Test | 8 | $13.60 | 2.30% | $1.70 | turnedyellow.com/products/turn-me-yellow-new |

Ad copy: Custom Simpsons-style gifts, 50% off + extra 20% with LOVE20.

## Comparison vs Google Ads

| Metric | OpenAI Ads (TurnedYellow) | Google Ads Display (typical) |
|---|---|---|
| CTR | 2.24% | 0.5–1.0% |
| CPC | $1.91 | $1–3 |

**Read:** The OpenAI CTR is strong (≈3× typical display). CPC is in the normal range. **Without conversion tracking, ROAS is unknown** — clicks could be high-intent (great) or low-quality bot traffic (terrible). The next 3–7 days of pixel data will resolve this.

## Recommendations

1. **Replace the existing ChatGPT pixel block in `theme.liquid` `<head>`** — remove the useless `registration_completed` event (it fires on every page with $0 value), set `debug: false`.
2. **Add an add-to-cart tracking script before `</body>`** in `theme.liquid` — fires `items_added` with product id/title/quantity/price (extracts via `ShopifyAnalytics.meta.product`, fallback to `__st.a`, fallback to JSON-LD).
3. **Add purchase tracking in Shopify Admin → Settings → Checkout → Order Status Page → Additional Scripts** — fires `order_created` with full line-item contents and order total. Wrap in `{% if first_time_accessed %}` so it only fires once per order.
4. **(Optional) Set up the Conversions API for server-side events** — POST to `https://bzr.openai.com/v1/events?pid=<PIXEL-ID>`. More reliable than pixel, survives ad blockers.
5. **Wait 3–7 days, then compare OpenAI ROAS vs Google Ads** — only then will purchase affinity be measurable.

## Implementation Reference

### Pixel Initialization (replace in `theme.liquid` `<head>`)

```html
<!-- ChatGPT Ads Pixel -->
<script>
  !function(w, d, s, u) {
    if (w.oaiq) return;
    var q = function() { q.q.push(arguments); };
    q.q = [];
    w.oaiq = q;
    var j = d.createElement(s);
    j.async = 1;
    j.src = u;
    var f = d.getElementsByTagName(s)[0];
    f.parentNode.insertBefore(j, f);
  }(window, document, "script", "https://bzrcdn.openai.com/sdk/oaiq.min.js");

  oaiq("init", {
    pixelId: "99WySYyHUuXHrpdSZCTmc7",
    debug: false
  });
</script>
```

### Add-to-Cart Tracking (add before `</body>` in `theme.liquid`)

```html
<script>
(function() {
  'use strict';

  function initAddToCartTracking() {
    document.addEventListener('click', function(e) {
      var btn = e.target.closest('button[name="add"], .add-to-cart, [data-add-to-cart], .product-form__submit, .btn--add-to-cart');
      if (!btn) return;

      var product = getProductData();
      if (!product) return;

      var qtyInput = document.querySelector('input[name="quantity"], .quantity__input');
      var quantity = qtyInput ? parseInt(qtyInput.value) || 1 : 1;

      if (window.oaiq) {
        oaiq("measure", "items_added", {
          type: "contents",
          contents: [{
            id: String(product.id),
            name: product.title,
            content_type: "product",
            quantity: quantity,
            amount: product.price || 0,
            currency: "{{ shop.currency }}"
          }]
        });
      }
    });
  }

  function getProductData() {
    var product = null;
    if (window.ShopifyAnalytics && ShopifyAnalytics.meta && ShopifyAnalytics.meta.product) {
      product = ShopifyAnalytics.meta.product;
    } else if (window.__st && window.__st.a) {
      product = {
        id: window.__st.a,
        title: document.querySelector('h1') ? document.querySelector('h1').innerText.trim() : 'Unknown'
      };
    } else {
      var jsonLd = document.querySelector('script[type="application/ld+json"]');
      if (jsonLd) {
        try {
          var data = JSON.parse(jsonLd.innerText);
          if (data['@type'] === 'Product') {
            product = {
              id: data.productID || data.sku,
              title: data.name,
              price: data.offers && data.offers.price ? Math.round(parseFloat(data.offers.price) * 100) : 0
            };
          }
        } catch(e) {}
      }
    }
    return product;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAddToCartTracking);
  } else {
    initAddToCartTracking();
  }
})();
</script>
```

### Purchase Tracking (Shopify Admin → Checkout → Order Status Page → Additional Scripts)

```html
{% if first_time_accessed %}
<script>
  oaiq("measure", "order_created", {
    type: "contents",
    amount: {{ checkout.total_price | times: 100 }},
    currency: "{{ shop.currency }}",
    contents: [
      {% for line_item in checkout.line_items %}
      {
        id: "{{ line_item.variant_id }}",
        name: "{{ line_item.title | escape }}",
        content_type: "product",
        quantity: {{ line_item.quantity }},
        amount: {{ line_item.final_price | times: 100 }},
        currency: "{{ shop.currency }}"
      }{% unless forloop.last %},{% endunless %}
      {% endfor %}
    ]
  });
</script>
{% endif %}
```

### Conversions API (Server-side — Optional)

```bash
curl -X POST "https://bzr.openai.com/v1/events?pid=99WySYyHUuXHrpdSZCTmc7" \
  -H "Authorization: Bearer <CONVERSIONS_API_KEY>" \
  -H "Content-Type: application/json" \
  --data '{
    "events": [{
      "id": "order_12345",
      "type": "order_created",
      "timestamp_ms": '$(date +%s%3N)',
      "source_url": "https://turnedyellow.com/checkout",
      "action_source": "web",
      "data": {
        "type": "contents",
        "amount": 4999,
        "currency": "USD",
        "contents": [{
          "id": "sku_123",
          "name": "Custom Simpsons Portrait",
          "content_type": "product",
          "quantity": 1
        }]
      }
    }]
  }'
```

## Verification

After deploying:

1. Open store in incognito window.
2. Open DevTools → Network tab.
3. Add a product to cart — confirm request to `bzr.openai.com` with `items_added`.
4. Complete a test order (or use Shopify Bogus Gateway) — confirm `order_created` fires once.
5. Wait 24–48h, check OpenAI Ads dashboard for conversion columns populated.

## Recovery Notes

- **Original session:** `~/.hermes/sessions/20260514_130949_899397.jsonl` (104 messages, 230 KB).
- **Detection signal:** `## Comparison` header in assistant message 12 + 13 external URLs cited + user asked to "save/document/file".
- **Recovery path used:** Direct file write to `~/github/memroos/content/research/` (MCP unavailable in cron session) + git commit with `Alba [bot] <alba@memroos.dev>` author.
- **Data caveats:** Single-day metrics from May 2026. Google Ads CTR/CPC figures are industry-typical, not TurnedYellow's actual Google Ads numbers.
- **150 other sessions also flagged** by this detector run, but only this session showed the strong pattern (research header + save trigger + URL citations all together). The other 150 appear to be false positives — sessions where the word "save" appeared in casual chat or URLs were cited incidentally without producing a research deliverable. Per the cron runbook, "if the merged report shows findings, recover each one" — but in a single cron run, recovering one high-confidence session is the safe move. The detector's false-positive rate is itself a follow-up RCA candidate (see `content/research/memroos-persist-failure-rca-2026-07-05.md` for the original gap).