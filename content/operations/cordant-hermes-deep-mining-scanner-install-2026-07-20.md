---
title: "Cordant Hermes deep-mining skills and safe merchant scanner installation"
description: "Installed research skills and a non-transactional merchant checkout observation worker on cordant-hermes-01."
publishedAt: "2026-07-20"
tags: ["cordant", "hermes", "research", "merchant-readiness", "playwright"]
keywords: ["deep research", "merchant checkout", "Playwright", "Hermes cron"]
author: "Alba"
source_session: "Discord thread 1528868665985077409"
model: "gpt-5.6-terra"
sources:
  - "content/research/cordant-agentic-merchant-payments-readiness-2026-07-20.md"
  - "https://hermes-agent.nousresearch.com/docs/user-guide/features/cron"
  - "https://playwright.dev/docs/intro"
derived_from:
  - "content/research/cordant-agentic-merchant-payments-readiness-2026-07-20.md"
regen_prompt: "Document the Cordant Hermes deep-research skill installation and safe merchant-readiness scanner deployment with verification evidence."
---

# Installation record

Date: 2026-07-20
Host: `cordant-hermes-01`
User: `ubuntu`
Hermes: `v0.18.2`

## Installed research skills

The following skills were copied to the Hermes local skill directory. Hermes listed each skill as enabled.

- `deep-research-subagents`
- `seltz-search`
- `search-routing`
- `browser`
- `source-first-drafting`
- `summarize`
- `primary-source-factcheck-memo`
- `last30days`

The host had enabled `web`, `browser`, `terminal`, `file`, `vision`, `x_search`, `session_search`, and `delegation` toolsets.

The host has Exa and Brave search credentials. It does not have a Seltz key. Seltz therefore has a documented fallback to the enabled web search stack. No credential was copied.

## Scanner deployment

Repository: `/home/ubuntu/cordant-merchant-readiness`

Commits:

- `829009c feat: add safe merchant readiness scanner`
- `59ffda7 chore: ignore local scan inputs and artifacts`

The scanner uses Playwright with Google Chrome. Chrome `150.0.7871.128` was installed because Playwright Chromium does not yet support Ubuntu 26.04.

The browser worker accepts only public HTTPS hostnames without credentials. It makes no clicks and fills no fields. It rejects payment actions and detects card or hosted-payment fields before it records a result. It does not submit a payment.

Tests passed:

```text
3 tests passed; 0 failed
- stops before a payment action
- stops at card and hosted-payment fields
- accepts only public HTTPS targets
```

The browser smoke test completed against `https://example.com/` with HTTP `200`, `OBSERVED`, and policy `no-click-no-fill-no-payment`.

## Automation

Cron job: `2c51420df04d`

- Name: `Cordant merchant readiness scan`
- Schedule: every 6 hours
- Mode: no-agent script
- Delivery: local
- Wrapper: `/home/ubuntu/.hermes/scripts/cordant-scan-batch.sh`

The wrapper exits silently when `/home/ubuntu/cordant-merchant-readiness/targets.jsonl` is absent or empty. When a reviewed target list is supplied, it writes structured results to `results/latest.jsonl`.

## Boundary

This is a public-observation pilot. It does not create accounts, enter personal data, invoke wallets, process OTPs, solve challenges, evade bot controls, or submit orders. Merchant production checkout tests require written merchant authorization and a separate sandbox path.
