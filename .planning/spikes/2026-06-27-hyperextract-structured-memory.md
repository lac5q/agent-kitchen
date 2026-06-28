# Hyper-Extract Structured-Memory Spike

Requirement: `HYPEREXTRACT-FOLLOWUP-01`

Status: completed bounded spike, 2026-06-27

## External Signal

Hyper-Extract presents an LLM-powered extraction framework for persistent, typed knowledge abstracts including Pydantic models, knowledge graphs, hypergraphs, and spatio-temporal graphs. The relevant MemRoOS idea is source-span-backed candidate memories, not production extraction replacement.

Sources:

- https://github.com/yifanfeng97/hyper-extract
- https://github.com/yifanfeng97/Hyper-Extract/blob/main/hyperextract/templates/DESIGN_GUIDE.md

## Repo Baseline

MemRoOS already has:

- source-backed knowledge filing under qmd/knowledge graph conventions
- `agent_memory_candidates` as silver candidate memory
- bronze/silver/gold belief-stage gates
- classification and policy gates before memory projection
- NOC visibility for recollection belief stages

## Comparison Result

Hyper-Extract is strongest where unstructured documents need structured graphs or hypergraphs with typed outputs. MemRoOS should only test it against non-sensitive or sanitized docs and compare whether extracted entities/events improve candidate-memory quality without bypassing policy labels or source provenance.

The safe output shape is a local JSON fixture: source path, source span, entity/event tuple, confidence, temporal/spatial fields, proposed memory text, policy labels, and promotion recommendation.

## Decision

Do not add Hyper-Extract as a dependency, upload private documents, make it the default ingestion path, or replace storage. Keep this as a future local extraction comparison only.

## Guardrails

- No dependency adoption.
- No private-document upload.
- No production ingestion path.
- No storage-layer replacement.
- No default extraction pipeline.

## Verification

Bounded spike artifact is checked by `npm run check:future-spikes`.
