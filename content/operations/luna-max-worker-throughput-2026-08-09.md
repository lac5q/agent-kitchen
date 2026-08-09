---
title: "Luna Max worker throughput and attestation checkpoint"
description: "Operational checkpoint for Beastmode ACN concurrency, Luna Max provenance, and safe acceleration."
publishedAt: "2026-08-09"
tags: ["beastmode", "acn", "luna-max", "model-provenance", "operations"]
keywords: ["gpt-5.6-luna", "concurrency", "model drift", "attestation", "Claude subscription watcher"]
author: "Codex root"
source_session: "019fdac3-ab4e-7a21-bbef-f37ee440470a"
model: "gpt-5.6"
sources:
  - "label:beastmode-SKILL.md"
  - "label:bin/beast-luna"
  - "label:tests/test-bm-model-check.sh"
derived_from:
  - "content/research/memroos-onboarding-mcp-integration-test-2026-08-08.md"
regen_prompt: "Re-run the Beastmode Luna Max preflight, three concurrent provenance-wrapper smoke probes, and model-drift gate; record requested versus independently attested models and any release blockers."
---

# Checkpoint

## Contract

The safe ACN default is three independent concurrent executor slices. Each child must pin `openai-codex/gpt-5.6-luna` with reasoning `max`, emit a per-child metadata record, and pass an independent parent/harness attestation. A Claude Pro/Max validation pass is a separate single watcher seat through `claude -p`; it is not a bulk-worker lane.

## Evidence

- The earlier local ACN attempt requested three Luna workers, but one child reported GPT-5/Codex and the sibling runs lacked independent attestation. That batch was stopped and is not validated.
- A bounded three-seat read-only smoke batch completed concurrently. All three returned `CODEX_LUNA_OK` and the provenance wrapper independently verified `gpt-5.6-luna` with reasoning `max` from the Codex session artifacts.
- The smoke batch proves lane availability and concurrency, not completion of a product task.

## Safe acceleration

Keep concurrency at three; do not add duplicate children to compensate for uncertain provenance. Batch independent slices on the same pinned lane, keep the shared prompt byte-identical for cache reuse, and close with one mechanical report plus one judgment watcher. Re-run a drifted/unverifiable slice through the attesting wrapper rather than trusting its self-report.

## Release note

Beastmode's current tree passes the public artifact guard. The required full-history scan still finds one pre-existing historical LangSmith installer blob matching private-path/credential patterns. The current Beastmode changes are committed locally in `c266696` and `fdfd89c`; public push is held until that history issue is explicitly remediated without an unsafe history rewrite.
