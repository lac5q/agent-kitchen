---
title: "Beastmode concurrency dial research"
description: "Evidence-backed low, medium, and crazy ACN concurrency profiles, default sizing, and safe presentation guidance."
publishedAt: "2026-08-12"
tags: [beastmode, concurrency, parallel-agents, langgraph, orchestration]
keywords: [ACN, fan-out, max_concurrency, low, medium, crazy, default]
author: "Codex"
source_session: "active-beastmode-concurrency-goal"
model: "gpt-5.6-sol + gpt-5.6-luna"
sources:
  - "https://docs.langchain.com/oss/python/langgraph/use-graph-api"
  - "https://docs.langchain.com/oss/python/langgraph/pregel"
  - "label:beastmode/schema/acn-contract.json"
  - "label:beastmode/references/langgraph-lane-grouping.md"
  - "label:beastmode/python/src/beastmode/core/executors/subprocess.py"
derived_from: []
regen_prompt: "Re-evaluate Beastmode's concurrency profiles against current LangGraph limits, executor resource caps, local host capacity, and measured fan-out tests; keep machine-readable output factual."
---

# Analysis

Beastmode already emits one LangGraph `Send` per independent task and joins the children by lane. LangGraph documents `max_concurrency` as the invocation-level cap for parallel tasks, and its Pregel runtime executes selected actors in parallel within a super-step. The repository's existing fan-out test measures overlap rather than relying on a fragile fixed sleep threshold.

The pre-change implementation had three conflicting ceilings: schema default 3, LangGraph validation maximum 32, and a process-wide executor semaphore of 4. That made a high dial potentially cosmetic: the graph could schedule more branches while the subprocess executor still serialized most work behind four slots.

## Comparison

| Profile | Target ceiling | Intended posture |
|---|---:|---|
| low | 3 | conservative, easier to observe and kinder to small hosts |
| medium | 8 | default useful parallelism for independent slices |
| crazy | 16 | explicit high fan-out, still bounded and host-clamped |

These are ceilings, not promises. The effective value is the minimum of the selected target, the number of independent tasks when known, host capacity, and the hard safety cap of 32. Autonomy remains a separate control: it governs phase/gate pauses, so a user can request medium autonomy with crazy concurrency.

## Recommendations

Use profile medium by default, with an effective-cap calculation based on `os.cpu_count()` and safe fallback to one. Report the requested profile, target, effective value, and limiting reason. Pass the effective value through the LangGraph invocation and the per-run subprocess executor budget; do not leave a hidden fixed semaphore that defeats the dial.

Keep humor confined to human-facing startup/progress prose. JSON, JSON-RPC envelopes, schemas, state, worker contracts, errors, security/provenance/model-drift messages, and reports consumed by tools must remain stable and literal. Safe examples can be theatrical ("the agent table is unfolded") without making claims about success or safety.

This recommendation is based on local code inspection, the existing measured-overlap test, current host capacity observed during implementation (12 logical CPUs), and LangGraph's official concurrency documentation. It is not a provider-token benchmark; provider-specific rate limits may clamp the effective value further.
