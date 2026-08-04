---
name: "beastmode-langgraph-p0-2026-08-03"
title: "Beastmode LangGraph P0 spike verdicts"
description: "Provider provenance, interrupt replay, and lane-grouping evidence for the Beastmode LangGraph roadmap."
publishedAt: "2026-08-03"
tags: [beastmode, langgraph, provenance, orchestration]
keywords: [LangGraph, actual_model, interrupt, Send, cache grouping, fail closed]
author: "Codex"
source_session: "codex-beastmode-langgraph-2026-08-03"
model: "gpt-5"
sources:
  - "repo:.planning/langgraph/ROADMAP.md"
  - "repo:.planning/langgraph/REQUIREMENTS.md"
  - "repo:references/langgraph-provider-provenance.md"
  - "repo:references/langgraph-interrupt-replay.md"
  - "repo:references/langgraph-lane-grouping.md"
  - "langgraph==1.2.10"
derived_from:
  - ".planning/langgraph/ROADMAP.md"
  - ".planning/langgraph/OPEN-QUESTIONS.md"
regen_prompt: "Re-run the three LangGraph P0 spikes against the current schema/families.json providers and update the matrix, replay counts, and cache-token comparison without promoting unmeasured providers."
---

# P0 verdict

## Provider provenance

The required seven-family matrix is recorded in `references/langgraph-provider-provenance.md`. No provider is approved for direct-call judgment seats yet. The only live probe reached Minimax and returned HTTP 402 insufficient balance; other provider credentials were unavailable. The correct decision is fail-closed: direct calls remain unverifiable until a response proves the serving model, and the safe fallback is subprocess execution.

## Interrupt replay

LangGraph 1.2.10 with `InMemorySaver` reproduced the replay hazard. A side effect before `interrupt()` ran once before the pause and a second time after resume; moving `interrupt()` to the first executable statement reduced the count to zero before pause and one after resume.

## Lane grouping

Live usage metadata could not be collected because provider access was unavailable. The documented cache weights give an analytical estimate of 4.35 normalized units for grouped 3-lane work versus 11.25 for interleaving (2.59x). This is explicitly an estimate, not a provider benchmark, so the conservative implementation keeps same-lane grouping in the dispatcher.

## Implementation consequence

P0.1 and P0.3 remain open evidence gates. P1–P7 runtime surfaces may be exercised with the fail-closed/subprocess fallback, but no direct-call provider should be treated as provenance-safe without a fresh live probe.
