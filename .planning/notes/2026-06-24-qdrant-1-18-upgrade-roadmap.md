# Qdrant 1.18.x Upgrade Roadmap Note

Date: 2026-06-24
Source: https://qdrant.tech/blog/qdrant-1.18.x/
Release check: https://github.com/qdrant/qdrant/releases

## Source Signal

Qdrant 1.18 introduces TurboQuant, collection memory monitoring, add/remove named-vector schema operations, queryable audit logs, request tracing IDs, per-collection API metrics, and additional strict-mode guardrails. The 1.18 patch line is already beyond the initial 1.18.0 release, so any future work should target the latest 1.18.x patch available at execution time, not hardcode 1.18.0.

## MemRoOS Fit

This has practical value for MemRoOS because Qdrant Cloud is the canonical vector tier behind mem0. The upgrade should be treated as an operational reliability and observability improvement, not a memory-architecture pivot.

Useful evaluation areas:

- Mem0 client compatibility with the target Qdrant Cloud 1.18.x patch.
- Collection inventory: vector dimensions, named-vector usage, payload indexes, quantization state, strict-mode settings, snapshots, and aliases.
- Canary writes/searches against non-sensitive fixtures before production promotion.
- Recall@5, precision@5, MRR, false-positive rate, and p95 latency compared with the current baseline.
- Memory monitoring and per-collection metrics wired into operator/NOC surfaces where useful.
- Audit-log query and request-tracing behavior correlated with MemRoOS evidence receipts.
- TurboQuant evaluated only if it improves storage/cost without hurting recall or latency.
- Named-vector add/remove used only for an approved embedding migration, not casual schema churn.

## Non-Goals

- Do not add local Qdrant to Docker compose.
- Do not replace mem0, Neo4j, SQLite, qmd, or the MemRoOS policy gate.
- Do not change vector collection schemas, enable TurboQuant, or migrate named vectors without Luis approval.
- Do not run the production cluster upgrade before snapshot/rollback and canary proof exists.

## Roadmap Entry

`QDRANT-FOLLOWUP-01`: Plan a Qdrant Cloud upgrade-readiness pass for the latest 1.18.x patch, covering mem0 client compatibility, collection/schema inventory, snapshot/rollback proof, canary write/search checks, recall@5/precision@5/MRR/false-positive/p95-latency non-regression, memory/audit/metrics observability, and an explicit decision on whether TurboQuant or named-vector migration is safe for any MemRoOS collection.

## Approval Gate

Future implementation requires explicit Luis approval before any production cluster version change, local dependency, backend swap, TurboQuant enablement, named-vector migration, or vector rewrite.
