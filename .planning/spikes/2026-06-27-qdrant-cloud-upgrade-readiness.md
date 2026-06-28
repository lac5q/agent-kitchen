# Qdrant Cloud Upgrade-Readiness Spike

Requirement: `QDRANT-FOLLOWUP-01`

Status: completed bounded spike, 2026-06-27

## External Signal

Qdrant 1.18 adds TurboQuant, named-vector add/remove, memory monitoring, audit-log querying, request tracing IDs, per-collection API metrics, and strict-mode guardrails. These are useful operational features, but they touch the vector backend and require live cluster proof before adoption.

Sources:

- https://qdrant.tech/blog/qdrant-1.18.x/
- https://qdrant.tech/articles/turboquant-quantization/

## Repo Baseline

MemRoOS already has:

- Qdrant Cloud configured through `QDRANT_URL` and `QDRANT_API_KEY`
- explicit no-local-Qdrant guard in `scripts/validate-operating-profiles.mjs`
- mem0 runtime health checks in `services/memory/mem0-server.py`
- recall anchors in `scripts/check-recall-anchors.mjs`
- memory recall evals and CI canary in `npm run check:recall-canary`
- cloud-offload inventory that treats vector state as managed cloud state

## Comparison Result

The safe path is an upgrade-readiness checklist, not a version change. TurboQuant and named-vector migration are potentially useful only after collection inventory, mem0 client compatibility, backup/rollback, canary write/search, recall metrics, latency, audit tracing, and per-collection metrics are proven.

## Decision

Do not upgrade Qdrant, enable TurboQuant, change named vectors, add local Qdrant, or rewrite vector schemas in this spike.

The next safe action is a live-readiness script that runs only when Qdrant credentials are present and otherwise exits skipped.

## Guardrails

- No local Qdrant container.
- No backend swap.
- No vector rewrite.
- No production cluster upgrade without Luis approval.
- No TurboQuant or named-vector migration until recall and latency non-regression passes.

## Verification

Bounded spike artifact is checked by `npm run check:future-spikes`.
