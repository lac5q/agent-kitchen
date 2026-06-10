# Fixture Sourcing Rules

This directory holds converted benchmark fixtures in the normalized schema defined at
`evals/comparative-retrieval/schema.json`.

## IMPORTANT: Non-Redistribution Rules

Raw dataset files from LoCoMo, LongMemEval, and LongMemEval-V2 are NOT committed to this repo.
Many datasets have licenses that prohibit redistribution of raw data. Always check the license
before including any content from these datasets in the repository.

| Dataset | License | Source | Redistribution |
|---------|---------|--------|----------------|
| LoCoMo | CC BY 4.0 | https://github.com/snap-research/locomo | Raw data: no commit; converted fixtures: check license |
| LongMemEval | Research / CC | https://github.com/xiaowu0162/longmemeval | Check paper/repo for terms |
| LongMemEval-V2 | TBD | Pending public release | Not yet available |
| MemroOS Public Synthetic | MIT | Generated internally | Commitable with review |

## How to Acquire Datasets

### LoCoMo (Long Conversational Memory)

```bash
git clone https://github.com/snap-research/locomo
# Conversations span multiple sessions with QA, event summaries, and optional multimodal fields
# Convert to schema.json format using: scripts/locomo-loader.mjs (to be implemented)
```

### LongMemEval

```bash
git clone https://github.com/xiaowu0162/longmemeval
# User/assistant history sessions with question categories
# Convert using: scripts/longmemeval-loader.mjs (to be implemented)
```

### LongMemEval-V2 (Agent Environment)

Not yet publicly available as of June 2026. When released, it will cover web-agent environment
memory questions. Loader path: `scripts/longmemeval-v2-loader.mjs`.

## Smoke Set

Before running full datasets, run a 25-question smoke set to validate harness shape:

```bash
node scripts/run-comparative-retrieval-evals.mjs --dataset memroos_public_synthetic --limit 25
```

The smoke set fixture is at `fixtures/memroos-public-smoke.json` (25 synthetic tasks covering
product discovery, sales handoff, engineering incident, and AI-ops dispatch workflows).

## Fixture Format

Each fixture file is a JSON array of tasks matching `evals/comparative-retrieval/schema.json`.

Example minimal task:
```json
{
  "id": "memroos-pub-0001",
  "dataset": "memroos_public_synthetic",
  "task_type": "single_hop",
  "corpus": [
    {
      "id": "mem-001",
      "text": "On 2026-03-15, the team decided to use Qdrant Cloud for all vector search.",
      "source": "decisions/2026-03-15-architecture.md",
      "timestamp_iso": "2026-03-15T14:00:00Z"
    }
  ],
  "question": "Which vector store did the team decide to use on March 15, 2026?",
  "expected_answer": "Qdrant Cloud",
  "evidence_spans": ["mem-001"],
  "license": "MIT",
  "citation": "MemroOS internal synthetic benchmark"
}
```
