---
title: "SketchPop priorities and meeting-to-action operating system"
description: "Business-focused summary of the August 17 SketchPop priority meetings and the repository system created to track meetings, decisions, and linked action items."
publishedAt: "2026-08-17"
tags: [sketchpop, operations, meetings, action-items, priorities, cash-management, holiday-planning]
keywords: [SketchPop, Turned Yellow, Make Me Jedi, Fathom, action tracker, holiday priorities]
author: "Codex"
source_session: "codex-desktop-sketchpop-2026-08-17"
model: "gpt-5"
sources:
  - "https://fathom.video/calls/788149102"
  - "https://fathom.video/calls/785913987"
  - "repo:SketchPop/docs/operations/meetings.json"
  - "repo:SketchPop/docs/operations/action-items.json"
derived_from:
  - "repo:SketchPop/docs/operations/meetings/2026/2026-08-17-financial-holiday-priorities.md"
  - "repo:SketchPop/docs/operations/meetings/2026/2026-08-17-email-cost-reduction.md"
regen_prompt: "Retrieve the two August 17, 2026 Fathom meetings, summarize business priorities and decisions, reconcile their action items, and verify the reciprocal mappings in SketchPop docs/operations."
---

# SketchPop priorities and meeting-to-action operating system

## Outcome

SketchPop now has a repository-based operating record under `docs/operations/`. It uses stable IDs and reciprocal links so humans and bots can move from a meeting to its actions and from an action back to the source discussion.

- `docs/operations/meetings.json`: machine-readable meeting registry
- `docs/operations/action-items.json`: canonical action ledger for owners, priorities, statuses, dependencies, and timing
- `docs/operations/meetings/YYYY/`: concise human-readable meeting notes
- `docs/operations/meetings/_template.md`: required format for future meetings
- `docs/operations/README.md`: bot and maintainer workflow

The repository records business-relevant context and links Fathom as evidence; it does not copy full transcripts or unrelated personal conversation.

## August 17 priority summary

The top objective is operating continuity under a serious short-term liquidity constraint. Cash preservation, artist and operations payments, financing responses, and uninterrupted revenue systems take precedence over expansion.

Financing work centers on three items: obtaining the SBA response, pursuing the Forward Financing reduced-payment request, and evaluating Shopify Capital alternatives before the October 31 deadline. The Shopify structure currently withholds 10% of daily sales. Stopping payments was discussed but not approved; the legal, contractual, store-continuity, checkout, and conversion consequences require qualified advice and explicit evaluation.

The immediate cost-cut list includes the $650-per-month bookkeeping service, the approximately $120-per-month Make Me Jedi tracking service, non-Epilogue AI subscriptions, and oversized email tiers. Each cut must retain the control it currently provides: accounting coverage, attribution, email deliverability, or revenue generation.

Holiday execution is narrowed to Turned Yellow and Make Me Jedi. Other sites remain paused. Fresh founder and influencer video content is the main near-term growth deliverable.

## Email-plan decisions

Turned Yellow should remain on the current platform through the holiday period. Karen Grier will seek a temporary October billing reduction, likely to a 70,000-75,000-contact tier, while preserving enough capacity for the Black Friday/Cyber Monday warm-up.

Make Me Jedi should be reactivated before September 1 on a 25,000-contact plan quoted at approximately $265 per month, replacing the former $560-per-month tier. Karen will inform JP at eCommerce Boost of the cost and ROI concerns. Luis and Karen will review both brands in January 2027 and consider lower tiers or a cheaper provider if post-holiday ROI and send volume justify it.

## Action inventory

The repository ledger contains 14 actions:

- 3 critical financing items: Shopify Capital analysis, SBA follow-up, and Forward Financing relief.
- 5 high-priority operating/cost items: native Make Me Jedi pixels, removal of the paid tracking service after validation, bookkeeping review, Turned Yellow email-tier relief, and Make Me Jedi email reactivation.
- 2 high-priority holiday items: influencer/founder creative and alignment with JP on cost and ROI.
- 3 medium-priority items: AI subscription allocation/cancellation, January email review, and Make Me Jedi fixed-rate shipping analysis.
- 1 completed system item: the repository operating record itself.

No deadline was invented where a meeting did not establish one. Those items use `due_date: null` plus a contextual `due_note`.

## Operating rules for future agents

1. Read `docs/operations/action-items.json` before answering questions about current priorities, owners, or deadlines.
2. Follow `source_meetings` into `docs/operations/meetings.json`, then read the linked note for decision context.
3. Update action status only in the canonical ledger.
4. Maintain reciprocal meeting/action IDs and validate JSON after every update.
5. Keep completed and cancelled items for history.
6. Link source recordings; do not paste full transcripts or store credentials and account numbers.

