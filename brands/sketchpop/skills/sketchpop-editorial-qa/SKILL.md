---
name: sketchpop-editorial-qa
description: Gate SketchPop copy for facts, voice, and AI slop.
version: 1.0.0
category: writing
status: official-approved
approved: 2026-08-22
tags: [sketchpop, writing, anti-slop, brand-voice, fact-check]
---

# SketchPop editorial QA

Use before any SketchPop caption, script, PDP, email, ad copy, pitch, or customer-facing text reaches human review. SketchContent owns this gate. The skill never authorizes publishing.

## Required context
Read the canonical SketchPop `company.md`, `customer.md`, `offer.md`, and `voice.md`, plus the relevant product record. Recall `.agents/skills/no-ai-slop/SKILL.md` and `agents/FORBIDDEN.md`.

## Procedure
1. State the format, audience, product, desired action, and source of product facts. Mark `BLOCKED` rather than guessing.
2. Build a claims ledger for price, shipping, material, size, durability, inventory, scarcity, licensing, and performance. Match each claim to a source.
3. Hard fail invented facts, fake social proof, unsupported licensing, copied package language requiring legal review, banned slop, any em dash, or missing HIL status.
4. Score 0 to 2 for specificity, product truth, human rhythm, SketchPop character, and restraint. Pass requires at least 8 of 10 with no category at 0.
5. Make the minimum effective edit. Preserve strong lines and natural oddness.
6. Run all checks again from a clean read.
7. Return status, final draft, claims ledger, scores, named slop patterns removed, remaining judgment calls, and `HIL STATUS: AWAITING HUMAN APPROVAL. DO NOT PUBLISH OR SEND.`

## Hard fails
- Invented or contradicted product facts.
- Fake customer language, proof, urgency, inventory, or performance.
- Licensing or sponsorship implications without evidence.
- Exact trademarked slogans or copied package language requiring legal review.
- Banned patterns from the canonical `voice.md`, MemroOS `no-ai-slop`, or `agents/FORBIDDEN.md`.
- Any em dash.
- Live publishing or sending.

## Verification
The draft is ready for human review only when every claim is sourced, every hard-fail check passes, the voice score is at least 8 of 10, and the HIL status is present.
