# Comparative Retrieval Benchmark

This directory contains the MemroOS comparative retrieval harness. It defines three benchmark lanes
and a concrete implementation path for running retrieval quality evals against external datasets.

## Three-Lane Architecture

### Lane 1 — Public-Evidence Architecture Benchmark (active)

The `evals/marketplace-agentic-memory/` directory runs Lane 1. It scores public evidence for
governance, typed memory, orchestration, deployment control, performance, observability, and
portability. Results are in `evals/marketplace-agentic-memory/results/latest.json`.

Midbrain's score of 65.21 in this lane reflects public-evidence architecture scoring. Midbrain's
SmartSearch retrieval metrics are cited from third-party paper results (arXiv 2504.00553) —
they are labeled as non-rerun external results and are NOT mixed with independently measured metrics.

### Lane 2 — External Retrieval Task Benchmark (implementation path defined)

Separate from the architecture benchmark. Measures retrieval quality against standardized datasets.
See `schema.json` for the normalized task format and `fixtures/README.md` for dataset sourcing rules.

Implementation sequence:
1. `fixtures/` — Dataset loaders and fixture converters (not committed — see sourcing rules below)
2. `adapters/` — MemroOS recall adapter, lexical baseline, vector-only baseline, no-memory baseline
3. `scripts/run-comparative-retrieval-evals.mjs` — Harness runner with scoring and report generation
4. `results/` — Per-run JSON reports (gitignored except summaries)

Status: Schema and adapter contracts defined. Dataset loaders are stub paths pending dataset
acquisition. Full implementation is a 1-2 week credible public benchmark effort.

### Lane 3 — Operational Workflow Benchmark (planned)

MemroOS home-field benchmark measuring whether a team can resume work across agents with proof.
Workflow cases: product discovery → PRD, sales call → account brief, engineering incident → handoff,
AI-ops dispatch with approval and rollback.

## Metrics (Lane 2)

| Metric | Description |
|--------|-------------|
| `precision@k` | Fraction of top-k retrieved memories that are relevant |
| `recall@k` | Fraction of relevant memories found in top-k |
| `MRR` | Mean reciprocal rank of first relevant result |
| `false_positive_rate` | Fraction of irrelevant memories injected into context |
| `p95_latency_ms` | 95th percentile retrieval latency in milliseconds |
| `token_spend` | Total tokens used for retrieval + context packing |
| `context_pack_bytes` | Size of assembled context pack |
| `answer_supported_by_retrieved_source` | Whether the answer is grounded in a retrieved memory |

## Midbrain Benchmark Caveat

Midbrain SmartSearch retrieval numbers referenced in public MemroOS copy are:

- **Source**: arXiv paper 2504.00553 (third-party authors)
- **Status**: Non-rerun external paper results
- **Label**: Clearly marked as "third-party paper results — not independently rerun here"
- **Not mixed with**: Lane 1 public-evidence architecture scores
- **To rerun**: Requires direct Midbrain API access; see `adapters/midbrain-adapter-contract.md`

Until a direct rerun is available, Midbrain's retrieval numbers are reported with a caveat and
are never presented as MemroOS-measured benchmark results.

## Expected Build Effort

| Scope | Time | Deliverable |
|-------|------|-------------|
| Small proof spike | 2–3 days | 20–50 question subset, caveated internal numbers only |
| Credible public benchmark | 1–2 weeks | Full fixture loader, reproducible runner, baselines, receipts |
| Serious comparative benchmark | 2–4 weeks | LongMemEval-V2 style tasks, cost controls, multiple model readers |
