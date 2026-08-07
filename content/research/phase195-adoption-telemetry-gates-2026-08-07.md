---
name: "phase195-adoption-telemetry-gates-2026-08-07"
title: "Phase 195 adoption telemetry and GSD gate implementation"
description: "Implementation and validation record for the MemroOS adoption telemetry read model, cross-harness detector, NOC Attention routing, and eval fixtures."
publishedAt: "2026-08-07"
tags: [memroos, adoption-telemetry, gsd, observability, evals]
keywords: [ADOPTTEL-01, ADOPTTEL-02, ADOPTTEL-03, ADOPTTEL-04, ADOPTTEL-05, NOC, LangGraph, LangSmith]
author: "Codex"
source_session: "019fdac3-ab4e-7a21-bbef-f37ee440470a"
model: "gpt-5.6"
sources:
  - "repo:/home/lac5q/github/memroos-product/.planning/phases/195-adoption-telemetry-gates/195-01-PLAN.md"
  - "repo:/home/lac5q/github/memroos-product/scripts/check-gsd-memory-receipts.mjs"
  - "repo:/home/lac5q/github/memroos-product/apps/memroos/src/lib/observability/adoption.ts"
derived_from:
  - "content/research/connmem-runtime-luna-preflight-2026-08-07.md"
regen_prompt: "Re-run the Phase 195 implementation and validation audit against the current roadmap, NOC producers, detector fixtures, and full test gates."
---

# Phase 195 implementation record

## Delivered locally

- Added a semantic-state-aware adoption read model over retrieval traces, session captures, governed memory writes, quality scores, and silver-to-gold promotion receipts.
- Added an advanced Operations NOC adoption panel with per-agent/harness rows, producer states, SLO status, and honest no-data/unwired messaging.
- Generalized the research-without-persist detector across Claude, Codex, Hermes, OpenClaw, and Pi session roots. Substantive sessions now produce work_without_probe and/or capture_miss findings independently of the legacy research-without-persist heuristic.
- Added opt-in authenticated NOC Attention posting for adoption findings through /api/cron-health; credentials are never printed or persisted in the detector output.
- Extended recall scoring with explicit no-prior-work/no-fabrication and typed skip receipts.
- Added gold recall fixtures for fresh prior work, no prior work, and old-critical-over-recent-noise.
- Added belief eval fixtures for junk-save coaching and duplicate-save rediscovery; the belief canary now covers seven cases.
- The existing GSD memory-receipt checker remains CI-wired; completed plans require either a receipt pointer or a typed skip reason at both start and close.

## Verification

- Focused adoption, route-contract, recall-eval, and belief-eval tests: 70 passed.
- Detector regression suite: 13 passed.
- Full fast suite: 471 test files passed, 3,971 tests passed, 52 skipped.
- Full slow suite: 3 files passed, 52 tests passed.
- Typecheck: passed.
- Lint: 0 errors, 92 existing warnings.
- Next.js production build: passed; 92 static pages generated. Existing Turbopack workspace-root and broad dynamic-path warnings remain.

## Honest remaining evidence

- The read model correctly reports known_unwired/unmeasured when a producer has no verified rows; no baseline is fabricated.
- Live operator SLO evidence, production deployment, connector end-to-end sync, and provider credential validation remain external-state work. They require the operator's explicit production GO before push/merge/deploy.
- Native gpt-5.6-luna direct smoke is healthy. Beastmode's headless worker bootstrap still stops at its permission/policy gate, and Fable/Opus validation was unavailable due provider credit responses; no worker provenance is claimed for this phase.
