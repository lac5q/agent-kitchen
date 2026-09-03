---
title: "Relevant recall upgrade — Ask + MCP"
description: "Why conversational Ask/MCP search felt bad, and the Phase 269 fix."
publishedAt: "2026-09-02"
tags: [recall, search, ask, mcp, relrec]
keywords: [recall, retrieval-query, stopwords, memory_recall]
author: "pi-grok-4.6"
model: "grok-4.6"
sources:
  - "apps/memroos/src/lib/memory-engine/recall-v2.ts"
  - "apps/memroos/src/app/api/chat/chat-recall.ts"
  - "services/knowledge-mcp/knowledge_system/memory_recall.py"
derived_from: []
regen_prompt: "Explain why MemRoOS Ask and memory_recall returned irrelevant hits for conversational questions and what Phase 269 changed."
---

# Relevant recall upgrade — 2026-09-02

## Analysis

Ask Memmy (`POST /api/chat` → `recallMemoriesForChat` → `executeUnifiedRecall`) and MCP `memory_recall` sent the **raw sentence** into BM25/ANN and a token-overlap reranker (`localCrossEncoderScore`).

`tokensFor("what did we decide about billing")` is six tokens; five are filler. Overlap against a billing memory is ~1/6, so an unrelated recent note can win. That is why search felt bad. It is the most important path in the product.

Recall-v2 already had the right engine (five arms, RRF, offline rerank, policy). Recollection ranking already stripped stopwords — chat and MCP did not use it.

## Recommendations (shipped as Phase 269)

1. `planRetrievalQuery` — keep quoted phrases and identifiers, drop conversational stopwords, preserve case, fall back to the original if nothing remains.
2. Recall-v2 arms search the retrieval query. Temporal parsing still reads the original utterance (`yesterday`).
3. `localCrossEncoderScore` ranks **content tokens**. `tokenCount` / CTXREF-04 budget tokenizer is unchanged.
4. MCP `memory_recall` applies the same rewrite before QMD, knowledge, connector, and mem0.

Not in this slice: hosted cross-encoder, HyDE, ANN corpus migration, Ask citation UI.

## Proof

- Vitest: retrieval-query + recall-v2 conversational ranking + arm query rewrite.
- Pytest: `plan_retrieval_query` + conversational Monaco hit.
