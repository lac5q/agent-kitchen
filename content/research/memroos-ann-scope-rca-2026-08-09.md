---
name: "memroos-ann-scope-rca-2026-08-09"
title: "MemroOS ANN recall scope compatibility RCA"
description: "Live RCA and acceptance evidence for the Mem0/Qdrant ANN recall arm on Oracle and Cordant production hosts."
publishedAt: "2026-08-09"
tags: [memroos, recall, ann, mem0, qdrant, production, rca]
keywords: [MEMROOS_MEM0_SCOPE_ID, shared, memroos-operator, connector recall]
author: "Codex"
source_session: "019fdac3-ab4e-7a21-bbef-f37ee440470a"
model: "gpt-5.6"
sources:
  - "repo:apps/memroos/src/lib/memory/backends.ts"
  - "repo:apps/memroos/src/lib/memory-engine/recall-v2.ts"
  - "repo:docker-compose.yml"
  - "live:https://memroos-cordant.epiloguecapital.com/api/health"
  - "live:https://memroos.epiloguecapital.com/api/health"
derived_from:
  - "content/research/memroos-alert-email-routing-rca-2026-08-09.md"
  - "content/research/knowcent05-maeve-cordant-roundtrip-2026-08-09.md"
regen_prompt: "Re-run authenticated recall on Oracle and Cordant, compare the configured Mem0 scope with the legacy connector corpus, and record ANN arm receipts without exposing secrets."
---

# RCA

## Finding

The Mem0/Qdrant service was healthy, but the production ANN query scope was incompatible with the existing connector corpus. The application defaulted to `memroos-operator` when `MEMROOS_MEM0_SCOPE_ID` was absent, while the connector vectors already lived in the legacy `shared` namespace. This produced an empty ANN arm even though the backend health endpoint reported connected.

The compatibility setting is non-secret and host-local: both Oracle and Cordant production app environments now set `MEMROOS_MEM0_SCOPE_ID=shared`. Each prior environment file was backed up before the change and the app was recreated. New installs still default to `memroos-operator`; the production setting is a bridge for the existing legacy corpus until a deliberate vector migration is approved.

## Acceptance evidence

- Cordant authenticated agent recall after restart: BM25 20, ANN 2, temporal 80; all three arms reported `status=ok`, overall `degraded=false`, and 20 governed results were returned.
- Oracle authenticated agent recall after restart: ANN reported `status=ok` with 80 retrieved candidates; the query returned no final connector result because Oracle has no tenant connector rows yet. This proves the ANN backend path is live, not that Oracle provider parity is complete.
- Both public app health endpoints remain HTTP 200 with Mem0, graph, agents/APO, and Connmem probes up.
- No provider credentials or secret values are included.

## Remaining gates

1. Migrate or reconcile the legacy `shared` vectors into the canonical tenant scope before removing the compatibility setting.
2. Populate and verify Oracle tenant connector parity; the separate Python Connmem adapter registry remains intentionally unconfigured pending provider REST credentials and permission evidence.
3. Run the licensed semantic benchmark and freshness/ingest proof; the live receipt proves arm availability, not corpus completeness or ranking quality.
