---
name: "connmem-runtime-luna-preflight-2026-08-07"
title: "CONNMEM runtime registration and Beastmode Luna preflight"
description: "Root-cause record for the missing CONNMEM runtime surface and the read-only Luna/Beastmode validation blockers."
publishedAt: "2026-08-07"
tags: [connmem, connectors, runtime, beastmode, luna, langsmith]
keywords: [Linear, Circleback, Notion, status endpoint, secret references, model provenance]
author: "Codex"
source_session: "019fd5b9-558f-72f1-9ca4-ac23f294db7e"
model: "gpt-5.6-luna (requested; live serving unverified)"
sources:
  - "label:memroos-product/services/connmem/app.py"
  - "label:memroos-product/services/connmem/adapters"
  - "label:memroos-product/docs/production-deployment.md"
  - "label:beastmode-read-only-preflight"
derived_from:
  - "content/research/memroos-persist-failure-rca-2026-07-05.md"
regen_prompt: "Re-audit the CONNMEM FastAPI runtime, provider adapter registration, and Beastmode Luna preflight, then update the evidence without exposing credentials."
---

## RCA

The CONNMEM kernel route already proxied `GET /v1/status`, but the FastAPI service did not implement that endpoint. The service also left `CONNMEM_ADAPTERS_JSON` as an unimplemented comment and always constructed an empty adapter map. Consequently, provider adapter unit tests could pass while the supervised process exposed no live Linear, Circleback, or Notion indexing path.

The fix adds a secret-reference-only runtime registry with explicit permission evidence, bounded provider sync methods, a redacted status surface, truthful ledger totals, compose environment forwarding, and regression tests. Missing or malformed configuration is visible as `unconfigured`/ `invalid`; sync is refused until configuration is ready.

## Validation

The CONNMEM Python suite passes with the runtime tests included. The Linear HTTP boundary now rejects HTTP-200 GraphQL responses that contain an `errors` array instead of treating partial provider results as an empty inventory.

A native Beastmode preflight was attempted with requested `openai-codex/gpt-5.6-luna`, max reasoning, and high autonomy. Static model catalog/config evidence exists, but live serving and worker provenance were not attestable in the read-only environment. Pi lock creation and Codex app-server initialization require writable state, and the requested `main-man` host was not resolvable. No remote mutation, deployment, or credential access occurred.

## Remaining evidence gates

Provider OAuth/CLI credentials, approved workspace/team scope, capability and inventory receipts, deletion/webhook evidence, host-side runtime configuration, and explicit deployment approval are still required before claiming production indexing or deploying.
