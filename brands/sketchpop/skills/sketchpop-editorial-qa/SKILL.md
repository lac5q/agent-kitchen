---
name: sketchpop-editorial-qa
description: Gate SketchPop copy for facts, voice, and AI slop.
version: 1.1.0
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
1. State the format, audience, product, desired action, and source facts. Mark `BLOCKED` rather than guessing.
2. Build a claims ledger. Quote every supplied claim exactly before judging it. Never repair, normalize, round, or silently change a price, SKU, name, quantity, URL, or identifier.
3. Match claims to sources at the same specificity. A category range or "starts at" price does not prove an exact SKU price. If an exact SKU source is missing, remove the exact claim from the corrected draft or mark it blocked.
4. Hard fail invented facts, fake proof, unsupported licensing, copied package language requiring legal review, banned slop, any em dash, a non-literal claims ledger, or missing HIL status.
5. Score 0 to 2 for specificity, product truth, human rhythm, SketchPop character, and restraint. Pass requires at least 8 of 10 with no category at 0.
6. Make the minimum effective edit and run all checks again from a clean read.
7. Compare every quoted source-draft claim character for character against the input.
8. Return status, final draft, claims ledger, scores, named slop patterns removed, remaining judgment calls, and `HIL STATUS: AWAITING HUMAN APPROVAL. DO NOT PUBLISH OR SEND.`

## Verification
Every claim is quoted literally and sourced at the same specificity, every hard-fail check passes, the voice score is at least 8 of 10, and the HIL status is present.
