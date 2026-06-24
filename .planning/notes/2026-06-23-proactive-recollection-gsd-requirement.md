# Proactive Recollection GSD Requirement - 2026-06-23

## Question

How should MemRoOS make an agent recall recent or important context automatically, without Luis having to ask explicitly for memory search?

## Research Takeaways

- Generative Agents use a memory stream and retrieve by combining relevance, recency, and importance; recency helps surface new observations, but importance and relevance prevent "latest thing wins" behavior.
- MemGPT/Letta-style architectures separate always-present working context, searchable recall, and archival memory. The useful pattern is not stuffing all recent memories into the prompt; it is explicit memory management with tool calls, tiers, and receipts.
- MemoryBank-style work reinforces and forgets memories based on elapsed time and significance. This maps to MemRoOS `memory_salience`, but MemRoOS needs runtime trigger receipts so reinforcement is explainable.
- Recent agent-memory surveys frame the loop as write -> manage -> read, with evaluation moving from static recall to multi-session decision impact. MemRoOS already has the right eval metrics; the missing piece is a trigger policy that decides when the read loop must fire.
- Proactive-agent writing shifts the question from "what should I recall?" to "what should I notice?" For MemRoOS, noticing should mean detecting task signals, source changes, unresolved handoff state, or recent high-salience facts, then generating an auditable recollection decision.

Sources:
- Generative Agents: Interactive Simulacra of Human Behavior, arXiv 2304.03442: https://arxiv.org/abs/2304.03442
- MemGPT: Towards LLMs as Operating Systems, arXiv 2310.08560: https://arxiv.org/abs/2310.08560
- MemoryBank: Enhancing Large Language Models with Long-Term Memory, arXiv 2305.10250: https://arxiv.org/abs/2305.10250
- Memory for Autonomous LLM Agents survey, arXiv 2603.07670: https://arxiv.org/html/2603.07670v1
- Letta agent memory overview: https://www.letta.com/blog/agent-memory/

## Repo Findings

- `/api/recall` already supports BM25, semantic, hybrid, cross-project allowlists, policy gating, recall side effects, and `memory_salience` access updates.
- `/api/memory/search` already policy-gates vector search but defaults to `recent` only when the query is blank; it does not decide when a task needs search.
- Phase 104 `agent_memory_traces` can already represent context assembly, retrieval query, retrieved candidates, policy filters, prompt inclusion, answer citation, verification, and failure classification.
- `memory-recall` eval cases already encode required timing: `before_plan`, `before_tool_use`, and `before_final`.
- Dispatch currently gates caller-provided memory/context arrays but does not assemble proactive recollection before dispatch.
- Phase 117 telemetry will measure retrieval-before-work and rediscovered facts, but it does not by itself make search happen.

## Product Answer

An agent should not "know" by intuition. MemRoOS should make recollection a first-class runtime decision:

1. Detect recollection triggers before planning, tool use, and final answer.
2. Generate bounded memory queries from the task, entities, project, source refs, recency window, and handoff state.
3. Search allowed tiers only: episodic, vector, graph, qmd/source lanes when healthy.
4. Rank candidates with relevance, recency, importance/salience, source freshness, prior usefulness, and policy risk.
5. Inject only the small context pack that clears the threshold.
6. Emit a receipt for both search and no-search decisions.
7. Score it in evals by whether the correct context surfaced at the required timing and reduced re-asks or rediscovered facts.

Recent context is important when it is both recent and connected to the task. Recency should be a boost, not a trump card. High importance can also be old; fresh low-importance chatter should not displace durable decisions.

## Proposed GSD Lane

Create v7.5 / Phase 118: Proactive Recollection Triggering.

The first implementation should be deterministic and auditable:

- no new memory backend
- no hosted/private trace upload
- no policy bypass
- no LLM-only invisible trigger decision
- no automatic broad cross-project recall without explicit allowlist/context-source policy

## Requirement Shape

Add `RECOLLECT-01` through `RECOLLECT-06`:

- Trigger policy decides when memory search is required or intentionally skipped.
- Query planner expands task text into bounded tier-aware queries and scopes.
- Ranking blends relevance, recency, importance/salience, freshness, prior usefulness, and policy risk.
- Context pack assembler injects only threshold-cleared memories with receipts.
- Trace/eval hooks prove timing, false-positive control, and decision impact.
- Operator UI/NOC surfaces show why recollection happened or did not happen.

## Verification Standard

Minimum acceptance:

- Unit tests for trigger decisions, query planning, ranking, thresholding, and skip receipts.
- Route or dispatch tests proving proactive recollection runs before plan/dispatch/tool/final gates where required.
- Memory eval fixtures for "recent but low-value", "old but critical", "stale source", "operator re-ask", and "rediscovered fact" scenarios.
- Trace rows showing retrieved, injected, ignored, skipped, score components, authorization result, and reason.
- NOC telemetry proving `EFFTEL-01`, `EFFTEL-04`, and `EFFTEL-05` can consume the recollection receipts.
