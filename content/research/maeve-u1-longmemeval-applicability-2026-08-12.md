---
name: "maeve-u1-longmemeval-applicability-2026-08-12"
title: "Maeve-U1 LongMemEval evidence applicability to the MemroOS governance comparison"
description: "Assessment of the 2026-08-12 LongMemEval lexical, no-memory, and semantic-vector measurements on Maeve-U1 and how they may be used in MemroOS competitive content."
publishedAt: "2026-08-12"
tags: [memroos, longmemeval, benchmark, retrieval, governance, competitive-analysis]
keywords: [Maeve-U1, LongMemEval, lexical baseline, vector-local, retrieval receipts, publication gate]
author: "Codex"
source_session: "contentmachine-2026-08-12"
model: "gpt-5"
sources:
  - "label:memroos-product@ae8d3006b8223e2198f4801d355d64c3591761c6"
  - "label:phase237-semantic-measurement@3457094510259ab5f301b1e9c735cd50ed4d3008"
  - "label:phase237-adapter-comparison@6db7bbb84fd1ed5b018126243cfb9de86576105f"
  - "label:longmemeval-lexical-run@bench-b20212be-89d8-4e18-8ad5-3c0390c24e35"
derived_from:
  - "content/research/memroos-agent-memory-governance-comparison-2026-08-12.md"
regen_prompt: "Inspect the current memroos-product checkout and LongMemEval artifacts on Maeve-U1, extract the measured adapter results and publication receipts, and reassess which claims belong in the MemroOS governance comparison."
---

# Maeve-U1 LongMemEval applicability assessment

## Finding

The August 12 evidence applies to the MemroOS comparison, but it must not be used as proof of cross-vendor retrieval leadership or as a reason to raise the existing retrieval score.

It is useful in two distinct ways:

1. **Governance and proof:** The 25-task LongMemEval lexical run recorded 25 task receipts, configuration and fixture hashes, contamination checks, replay evidence, and a publication-gate decision. All required audit records persisted. This directly supports the comparison's claims about evidence discipline, reproducibility, and governed evaluation.
2. **Early retrieval direction:** A matched three-task run found that the local semantic embedding arm retrieved some relevant evidence where the lexical control found none. This is an early engineering signal, not a product-level or market-level benchmark.

## Evidence

### Licensed 25-task smoke

Run date: 2026-08-12 UTC. Dataset: LongMemEval. Adapter: lexical. Top-k: 3.

- Precision@k: 0.0467
- Recall@k: 0.10
- MRR: 0.06
- False-positive rate: 0.9533
- Answer-supported rate: 0.24
- p95 latency: 2 ms
- Abstention accuracy: 0 across four labeled abstention tasks
- Failed tasks: 0
- Publication gate: ready_for_publication
- Required receipts persisted: yes

The no-memory control produced zero retrieval and perfect abstention accuracy, as expected for an adapter that never retrieves.

### Matched three-task semantic test

- Lexical: precision@k 0, recall 0, MRR 0, false-positive rate 1.0, p50 2 ms.
- Vector-local: precision@k 0.111, recall 0.167, MRR 0.167, false-positive rate 0.889, p50 29,195 ms.

The vector-local result covers only the embedding arm over an in-memory corpus. It does not exercise the full Recall v2 fusion of semantic, graph, and temporal arms or its reranking. The high latency reflects serial embedding work and requires batching before a larger run.

## Content guidance

Add a dated sidebar titled “What the first external retrieval run proves.” Lead with the reproducible evaluation system and its receipts. State the retrieval metrics plainly, including weak accuracy and high vector latency.

Do not:

- describe the lexical result as MemroOS production recall performance;
- treat the three-task semantic run as a complete benchmark;
- compare these numbers with vendor-reported Zep, Mem0, Cognee, or Midbrain results;
- change the governance-first ranking or retrieval scores from this evidence;
- cite a failed or unavailable adapter as scoring zero.

The strongest genuine claim is: MemroOS now has a licensed external-dataset evaluation path that records the configuration, corpus fingerprint, per-task receipts, contamination state, replay fingerprint, and publication decision. The first semantic measurement is directionally positive and operationally too slow.
