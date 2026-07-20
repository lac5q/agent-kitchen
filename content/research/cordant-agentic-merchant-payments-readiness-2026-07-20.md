---
title: "Cordant agentic merchant payment-readiness research and safe Hermes pilot"
description: "A research-backed, non-transactional design for measuring merchant checkout readiness for AI agents."
publishedAt: "2026-07-20"
tags: ["cordant", "agentic-commerce", "payments", "hermes", "checkout-automation", "research"]
keywords: ["AI agents", "merchant checkout", "3DS", "SCA", "payment tokens", "Playwright", "Hermes"]
author: "Alba"
source_session: "Discord thread 1528868665985077409"
model: "gpt-5.6-terra"
sources:
  - "https://eur-lex.europa.eu/eli/reg_del/2018/389/oj"
  - "https://www.emvco.com/emv-technologies/3-d-secure/"
  - "https://www.emvco.com/emv-technologies/payment-tokenisation/"
  - "https://www.pcisecuritystandards.org/documents/PCI-DSS-v4-0-SAQ-A.pdf"
  - "https://www.w3.org/TR/webauthn-3/"
  - "https://developer.visa.com/capabilities/visa-intelligent-commerce"
  - "https://www.mastercard.com/us/en/news-and-trends/press/2025/april/mastercard-unveils-agent-pay-pioneering-agentic-payments-technology-to-power-commerce-in-the-age-of-ai.html"
  - "https://docs.stripe.com/testing"
  - "https://docs.adyen.com/development-resources/testing/3d-secure-2-authentication"
  - "https://playwright.dev/docs/network"
  - "https://hermes-agent.nousresearch.com/docs/user-guide/features/cron"
  - "https://hermes-agent.nousresearch.com/docs/user-guide/profiles"
derived_from: []
regen_prompt: "Research the global technical, compliance, and operating constraints for AI-agent merchant payments, then design a safe Hermes and Playwright measurement pilot that never submits a production payment."
---

# Decision

Build a **merchant checkout-readiness scanner**, not a generic autonomous purchasing bot.

The first product should measure public, observable checkout capability. It must stop before a payment instrument, wallet invocation, order-submission control, or issuer challenge. It must report independent evidence, not a binary claim that an agent can pay.

Use Hermes as the control plane. Use a deterministic Playwright worker for the browser state machine. Do not let an LLM select checkout clicks after the worker enters checkout.

# Why a generic agent cannot complete global payments

A browser agent can sometimes reach a checkout. It cannot reliably and lawfully complete card payments across markets without an approved payment rail and a cardholder authentication path.

- EMV 3-D Secure can be frictionless or require a challenge. The issuer makes this risk decision. A challenge, redirect, out-of-band bank approval, OTP, passkey, and biometric prompt must be a human handoff state. [EMVCo 3DS](https://www.emvco.com/emv-technologies/3-d-secure/)
- EEA Strong Customer Authentication requires independent factors and binds remote-payment authentication to the specific amount and payee. A broad instruction such as “buy items for me” is not sufficient evidence for a changed merchant or amount. [PSD2 RTS, Articles 4–5](https://eur-lex.europa.eu/eli/reg_del/2018/389/oj)
- Passkeys and biometric authentication are mediated by the user agent and authenticator. The agent must not export, emulate, relay, or access private keys or biometric material. [WebAuthn](https://www.w3.org/TR/webauthn-3/)
- Tokenization reduces PAN exposure but does not remove authorization, PCI DSS, privacy, or issuer obligations. Payment tokens can be constrained to a merchant, device, or scenario. [EMVCo payment tokenisation](https://www.emvco.com/emv-technologies/payment-tokenisation/)
- Visa Intelligent Commerce and Mastercard Agent Pay describe agent-specific tokens, agent identity, and consumer controls. These are partner-program rails. They are not a universal form-filling capability for all card merchants. [Visa](https://developer.visa.com/capabilities/visa-intelligent-commerce) · [Mastercard](https://www.mastercard.com/us/en/news-and-trends/press/2025/april/mastercard-unveils-agent-pay-pioneering-agentic-payments-technology-to-power-commerce-in-the-age-of-ai.html)

# Safe definition of readiness

Report a vector of observed facts:

1. Catalog reachable.
2. Product reachable and in stock.
3. Cart operation observed.
4. Guest versus account checkout route observed.
5. Market, language, and currency presentation observed.
6. Checkout route reachable.
7. Payment boundary observed, with public payment-method labels or hosted-field origin if visible.
8. Public evidence of a supported agentic-payment rail, if any.

Do not report “agent-payable” from a checkout form. Use these result labels:

- `OBSERVED`: public evidence was collected.
- `VERIFIED_SANDBOX`: a merchant-authorized sandbox test completed.
- `UNKNOWN`: issuer, acquirer, fraud, or merchant policy was not tested.
- `BARRIER`: the scanner encountered a policy, access, market, checkout, or technical barrier.

# Public scanner policy

The public mode is read-only except for adding one unit of an in-stock product to a cart when that action does not create an inventory hold. It stops at the first payment boundary.

Never:

- Enter or collect card numbers, CVV, bank credentials, OTPs, passkeys, or biometric data.
- Click a wallet control, payment confirmation, “place order”, “pay now”, or equivalent control.
- Create accounts, log in, submit contact or shipping information, or guess coupons.
- Solve CAPTCHAs, evade bot controls, rotate proxies to evade a block, spoof device identity, or retry a 403, 429, or challenge.
- Inject JavaScript into a payment page, store browser storage state, retain payment iframes, or save request/response bodies.

Respect merchant terms, robots policy, explicit opt-outs, and rate limits. Treat a challenge, CAPTCHA, 403, or 429 as a final barrier and apply a cooldown. RFC 9309 explains that robots is not authorization, so merchants still need explicit authorization for deeper tests. [RFC 9309](https://www.rfc-editor.org/rfc/rfc9309)

# Safe browser state machine

```text
DISCOVER -> PRODUCT_FOUND -> CART_READY -> CHECKOUT_ENTRY -> PAYMENT_BOUNDARY -> STOPPED_SAFE
                     \-> BARRIER | TRANSIENT_FAILURE | OUT_OF_SCOPE
```

The worker centralizes every click in a `safeClick` function. It rejects labels such as `pay now`, `place order`, `complete purchase`, `submit payment`, and `buy now`. It refuses to fill fields with payment semantic names, labels, autocomplete attributes, or hosted-payment iframe origins. At `PAYMENT_BOUNDARY`, it captures a sanitized screenshot, blocks non-GET traffic as defense in depth, closes the browser context, and emits a structured result.

Playwright supports isolated browser contexts and network observation. Use these functions for isolation and safety, not checkout modification. [Browser contexts](https://playwright.dev/docs/api/class-browser#browser-new-context) · [Network](https://playwright.dev/docs/network)

# Barrier taxonomy

| Primary barrier | Examples | Required worker action |
| --- | --- | --- |
| `ACCESS_POLICY` | robots exclusion, terms restriction, merchant opt-out, access wall | Stop. |
| `BOT_OR_CHALLENGE` | CAPTCHA, Cloudflare challenge, 403, 429 | Capture minimal evidence. Cool down. Do not evade. |
| `CONSENT_REQUIRED` | Consent UI blocks checkout | Record it. Baseline does not accept all. |
| `AUTH_REQUIRED` | Account-only checkout or MFA | Stop in public mode. |
| `MARKET_RESTRICTED` | Shipping, market, or currency restriction | Record scenario and visible text. |
| `CATALOG_OR_CART` | No stock, required variant, cart error | Record state. |
| `CHECKOUT_BLOCKED` | Guest unavailable or checkout error | Record CTA, URL, and status. |
| `PAYMENT_BOUNDARY_REACHED` | Payment UI or hosted payment field visible | Safe completion. |
| `TECHNICAL_TRANSIENT` | DNS, timeout, 5xx, JavaScript error | Retry once only. |
| `UNKNOWN` | Incomplete evidence | Send to review queue. |

# Authorized test mode

Run this mode only on a merchant-approved sandbox, staging host, or dedicated test account. Each authorization record must specify allowed hosts, markets, expiry, account-secret reference, and written authorization reference. Keep `payment_submission: false` hard-coded for the first pilot.

Use PSP sandboxes for transaction flow tests. Stripe prohibits testing live mode with real payment details. Adyen documents test cases for frictionless, challenge, out-of-band, timeout, and failure 3DS2 results. [Stripe testing](https://docs.stripe.com/testing) · [Adyen 3DS2 testing](https://docs.adyen.com/development-resources/testing/3d-secure-2-authentication)

# Scale design

1. Ingest merchant-supplied lists and approved public directories.
2. Use robots, sitemap, homepage metadata, and cached technology data before browser work.
3. Run one browser context per domain, market, and scenario.
4. Start with one active browser per domain and 5–15 total workers.
5. Retry only timeout, DNS, and 5xx failures once.
6. Wait seven days after a bot or challenge barrier and 24 hours after a transient failure.
7. Store results in a durable queue or database. Store redacted evidence objects separately.

A sitemap may list up to 50,000 URLs or 50 MB uncompressed. Use it for low-impact discovery, not checkout claims. [Sitemaps protocol](https://www.sitemaps.org/protocol.html)

# Evidence and retention

Each run stores:

```text
run.json                 target, market, policy version, timestamps
transitions.ndjson       state transitions and safe locator descriptions
summary.json             readiness vector, barriers, confidence
screens/                 product, cart, checkout, payment-boundary screenshots
network-metadata.ndjson  host, method, status, type only
```

Do not persist cookies, query strings, addresses, request bodies, response bodies, payment field values, credentials, or storage state. Full traces and HAR files are restricted artifacts for public unauthenticated scans or written-authorized tests only. Encrypt them at rest and apply short retention. Playwright traces can contain DOM snapshots and network detail. [Trace Viewer](https://playwright.dev/docs/trace-viewer)

# Hermes deployment on cordant-hermes-01

Create a dedicated `merchant-checkout-scan` profile. Do not clone a privileged operational profile. Profiles isolate Hermes state and credentials but do not sandbox the host filesystem. [Hermes profiles](https://hermes-agent.nousresearch.com/docs/user-guide/profiles)

Use a normal TypeScript Playwright service for scanning. Hermes must only schedule bounded batches, read the structured result, triage exceptions, and send reports. Hermes browser tools remain useful for manual debugging but are not the high-volume worker substrate.

Use one cron job for a controller tick, not one cron job per merchant. Hermes cron sessions are fresh, gateway-backed, and run every 60 seconds. Jobs with a work directory run sequentially, so high-volume jobs need a queue-backed worker instead. [Hermes cron](https://hermes-agent.nousresearch.com/docs/user-guide/features/cron)

Minimum host boundary:

- Dedicated unprivileged OS account and dedicated Hermes profile.
- Secret redaction enabled.
- Strict approval policy. No YOLO mode. Cron approvals deny by default.
- Worker receives no card, bank, wallet, merchant-production, or customer credentials.
- Worker uses ephemeral contexts and disclosed regional egress.
- Gateway and dashboard stay on loopback, VPN, or SSH tunnel. Do not expose them publicly.
- Profile cron launches a bounded queue batch. It sends no message when there is no work.

# First implementation scope

Implement only these artifacts on `cordant-hermes-01`:

1. A private repository or directory for the scanner.
2. A deterministic Playwright TypeScript worker with the stop guards above.
3. JSONL input and JSON result output for the first batch.
4. A small validation test that proves prohibited payment fields and payment actions cause `STOPPED_SAFE`.
5. A profile-local wrapper script that runs a bounded batch with no credentials.
6. A disabled-by-default or local-output-only Hermes scheduled controller after a smoke test.

Skipped: real payments, credential vault integration, production test orders, CAPTCHA handling, and an LLM browser operator. Add only after merchant authorization, PSP/network integration, and PCI/privacy/legal review.

# Sources

- [PSD2 SCA RTS](https://eur-lex.europa.eu/eli/reg_del/2018/389/oj)
- [UK FCA SCA](https://www.fca.org.uk/firms/strong-customer-authentication)
- [EMVCo 3-D Secure](https://www.emvco.com/emv-technologies/3-d-secure/)
- [EMVCo Payment Tokenisation](https://www.emvco.com/emv-technologies/payment-tokenisation/)
- [W3C WebAuthn](https://www.w3.org/TR/webauthn-3/)
- [PCI SSC SAQ A](https://www.pcisecuritystandards.org/documents/PCI-DSS-v4-0-SAQ-A.pdf)
- [Visa Intelligent Commerce](https://developer.visa.com/capabilities/visa-intelligent-commerce)
- [Mastercard Agent Pay](https://www.mastercard.com/us/en/news-and-trends/press/2025/april/mastercard-unveils-agent-pay-pioneering-agentic-payments-technology-to-power-commerce-in-the-age-of-ai.html)
- [Stripe testing](https://docs.stripe.com/testing)
- [Adyen 3DS2 tests](https://docs.adyen.com/development-resources/testing/3d-secure-2-authentication)
- [Playwright network](https://playwright.dev/docs/network)
- [Hermes profiles](https://hermes-agent.nousresearch.com/docs/user-guide/profiles)
- [Hermes cron](https://hermes-agent.nousresearch.com/docs/user-guide/features/cron)
