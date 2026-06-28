# CocoIndex Source-Freshness Spike

Requirement: `COCOINDEX-FOLLOWUP-01`

Status: completed bounded spike, 2026-06-27

## External Signal

CocoIndex emphasizes incremental processing, lineage, cache reuse, version tracking, and delta-only updates for indexing pipelines. The useful MemRoOS question is whether those ideas improve freshness proof for one declared, non-sensitive context lane.

Sources:

- https://cocoindex.io/
- https://cocoindex.io/blogs/incremental-processing/

## Repo Baseline

MemRoOS already has:

- `context-sources.config.json` contracts checked by `scripts/run-context-source-evals.mjs`
- qmd filing and retrieval checks in `scripts/check-knowledge-indexing.mjs`
- recall anchor checks in `scripts/check-recall-anchors.mjs`
- library freshness UI/API around qmd source mtime in `apps/memroos/src/app/api/library/freshness/route.ts`
- explicit rule that qmd is lexical/BM25 only and vector search remains Qdrant Cloud

## Comparison Result

CocoIndex's strongest fit is lineage and incremental invalidation. The current MemRoOS baseline already proves source presence, qmd retrieval, source freshness, and safe-answer policy, but it does not maintain a separate derived-index lineage graph.

For MemRoOS, the safe test lane is a read-only shadow manifest over one non-sensitive local-folder or qmd collection. The measured fields should be source mtime, derived record hash, stale-row retirement, rebuild count, qmd recall result, and policy label preservation.

## Decision

Do not add CocoIndex as a dependency or production indexing path. Treat the pattern as a future optional shadow-index comparison only.

## Guardrails

- No dependency adoption.
- No production index path.
- No policy bypass.
- No raw sensitive corpus indexing.
- No mem0, Qdrant, Neo4j, SQLite, or qmd replacement.

## Verification

Bounded spike artifact is checked by `npm run check:future-spikes`.
