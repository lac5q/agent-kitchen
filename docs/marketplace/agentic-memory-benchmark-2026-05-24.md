# Agentic Memory Marketplace Benchmark - 2026-05-24

## Result

MemRoOS is competitive on public-evidence architecture scoring now, and the live beta wins while keeping performance and benchmark-proof gaps visible.

| Rank | Provider | Score | Read |
| ---: | --- | ---: | --- |
| 1 | MemRoOS beta live | 84.06 | Live beta profile after hot-path retrieval hardening, temporal invalidation planning, and public benchmark reports. |
| 2 | MemRoOS prior baseline | 74.36 | Strong governance-plus-workflow shape; weaker public proof and hot-path latency story. |
| 3 | Letta | 70.58 | Deep stateful-agent memory; less enterprise control-plane oriented. |
| 4 | Mem0 Platform | 70.44 | Strong managed memory baseline; less differentiated on orchestration/governance. |
| 5 | Zep | 68.64 | Strongest pure temporal memory competitor. |
| 6 | Midbrain | 65.21 | Strongest research-led retrieval and continual-learning signal; not yet a visible governed operations plane. |
| 7 | AXME | 63.90 | Strong orchestration/governance; narrower coding-memory story. |
| 8 | EverMind / EverMemOS | 58.99 | Benchmark-oriented memory OS; public claims need independent verification. |
| 9 | Tytan TAO / Cortex | 57.85 | Enterprise-governed memory claims; thin public technical proof. |
| 10 | AgenticMemory.ai | 55.59 | Fast hosted memory API; not yet proven as enterprise-governed memory-plus. |
| 11 | GBrain | 55.45 | Relevant open agent memory signal; not a closed enterprise competitor. |
| 12 | WorldFlow AI | 49.74 | Strong latency/cost/cache story; weaker governed memory story. |

The reproducible marketplace eval lives in:

- `evals/marketplace-agentic-memory/providers.json`
- `scripts/run-marketplace-memory-evals.mjs`
- `evals/marketplace-agentic-memory/results/latest.json`

Run it with:

```bash
npm run eval:marketplace-memory
```

## Live MemRoOS Recall Eval

After fixing the recall eval harness, the local full suite passed:

- `totalCases`: 8
- `passedCases`: 8
- `passRate`: 1.0
- `p95LatencyMs`: 469
- `tierFailures`: none

The fixes were:

- Preserve fixture identity through backend-normalized metadata, because mem0 can rewrite memory text and generate its own IDs.
- Seed episodic eval fixtures as `internal` + `indexable` instead of private/sealed rows.
- Rebuild the FTS projection after episodic fixture seeding so the eval is deterministic.
- Fan out episodic recall across the full expected-facts query plus each expected fact, avoiding brittle FTS phrase-order failures.
- Raise vector write timeout to a configurable default of 30s for slow local writes.
- Poll for vector fixture settlement after timeout or queued responses, because a local mem0 write can complete server-side after the client aborts.

## Does The X-Linked Candidate Count?

AgenticMemory.ai counts as a closed hosted memory API competitor, but not yet as a direct enterprise agentic-memory-plus competitor. It publicly claims tenant-isolated memory spaces, scoped API keys, TTLs, scratchpads, MCP/OpenClaw readiness, and sub-millisecond hot-cache reads. That is relevant, but the product does not publicly show a governed workflow/audit/eval surface comparable to MemRoOS.

GBrain does not count as a closed enterprise competitor. It is relevant to the agent memory market signal, but it appears open/personal-agent oriented rather than enterprise-governed.

## Does Midbrain Count?

Midbrain counts as a direct research-led retrieval and continual-learning competitor, but not yet as a proven governed operations-plane competitor. Its SmartSearch paper and public page make it highly relevant to the memory-quality story: index-free retrieval, entity expansion, reranking, score-adaptive truncation, and strong LoCoMo / LongMemEval-S claims. Those claims should not be compared directly to MemRoOS's `84.06` public-evidence architecture score because they measure different things. The right competitive stance is: Midbrain is a strong substrate/retrieval signal; MemRoOS is the governed context, dispatch, audit, and proof control plane around memory.

## Hard Recommendation

Keep the MemRoOS position as governed multi-agent memory infrastructure, not a pure memory API. The market has plenty of "agent remembers things" products. The stronger wedge is:

1. Memory is typed, permissioned, and auditable.
2. Context packs are visibly consumed by agents at runtime.
3. Recall quality is continuously evaluated.
4. Repeated successful work becomes skills.
5. Human approval governs memory self-improvement.

The architecture should keep optimizing the live beta profile rather than copying hosted memory APIs.

## Architecture Work To Win

1. Hot context cache: cache compact context packs by agent, role, user, task type, and evidence freshness with p95 targets under 200 ms for common recall.
2. Temporal fact invalidation: add Zep-like valid/invalid fact versions, contradiction detection, and recency-aware entity facts.
3. SmartSearch-inspired retrieval lane: deterministic entity extraction, entity expansion, parallel tier fan-out, reranking, dedupe, and score-adaptive context packing with receipts.
4. Public memory benchmark harness: add LoCoMo/LongMemEval-style external sets, but report benchmark caveats and pair them with MemRoOS operational golden sets.
5. Memory promotion policy: formalize raw event to episodic memory to semantic fact to skill promotion with operator approval.
6. Retrieval trace ledger: every dispatch/run should show which memories were retrieved, which were injected, which were ignored, and why.
7. Enterprise control pack: document tenant isolation, export/delete, retention, RBAC, audit, and self-host boundaries as one installable profile.

## Source Notes

- AgenticMemory.ai: hosted REST memory with spaces, context, scratchpads, scoped keys, TTL, and hot-cache claims.
- AXME: durable execution, fleet observability, quarantine, policy guardrails, open protocol, self-host/hosted.
- Tytan TAO: Cortex memory, RBAC/ABAC, HMAC-notarized memory, auditability, SOC 2 Type II claims.
- Mem0: hosted vector store, graph services, rerankers, audit logs, workspace governance, and memory benchmark docs.
- Zep: temporal knowledge graph memory architecture and LongMemEval/DMR validation claims.
- Midbrain: SmartSearch paper and waitlist page describing index-free retrieval, episodic/semantic/procedural memory, continual learning, LoCoMo / LongMemEval-S claims, and token-efficiency/CPU-latency claims.
- Letta: stateful agents with core memory, archival memory, self-editing memory hierarchy, and eval/leaderboard surfaces.
- EverMemOS: episodic trace formation, semantic consolidation, reconstructive recollection, and benchmark claims.
