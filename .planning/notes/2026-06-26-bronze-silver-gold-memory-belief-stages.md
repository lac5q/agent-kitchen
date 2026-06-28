# Bronze/Silver/Gold Memory Belief Stages

Source signal: Danial Hasan's June 25, 2026 X post argued that agent memory should split into bronze raw source snapshots, silver candidate claims, and gold admitted operational truth because long-running agents need to know what they are allowed to believe.

MemRoOS fit: this is not a new memory backend. It is a belief-boundary invariant for proactive recollection, context-pack assembly, and receipts. It maps cleanly onto existing MemRoOS layers:

- Bronze: raw vault artifacts, messages, transcripts, traces, documents, and other source snapshots.
- Silver: `agent_memory_candidates`, source-span-backed extractions, proposed lessons, proposed runbooks, and other candidate claims.
- Gold: admitted operational truth that passed provenance, policy, freshness, conflict, dedupe, and promotion checks.

Roadmap action: add `RECOLLECT-07` to Phase 118 so recollection and context-pack receipts label every retrieved and injected memory by belief stage. Agents may rely on gold directly, must caveat silver, and may use bronze only as evidence unless promotion policy admits it.

Guardrails:

- No hidden LLM-only promotion from silver to gold.
- No raw sensitive payload exposure in receipts.
- No treating source snapshots or candidate claims as operational truth without provenance, policy, freshness, conflict, and dedupe checks.
- Gold remains revocable and freshness-bound, not permanent truth.

Verification target: Phase 118 evals should include negative cases proving unsupported candidate claims and raw source snippets are not treated as operational truth.
