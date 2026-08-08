---
name: "memroos-production-checkpoint-2026-08-08"
title: "MemroOS production deployment and integration checkpoint"
description: "Deployment, governance, shared connector recall, Beastmode Luna, Fable review, and LangGraph/LangSmith RCA for the 2026-08-08 production checkpoint."
publishedAt: "2026-08-08"
tags: [memroos, deployment, governance, langgraph, langsmith, beastmode, recall, rca]
keywords: [oracle-1, cordant-hermes-01, maeve-u1, gpt-5.6-luna, fable, linear, circleback, notion]
author: "Codex"
source_session: "codex-goal-2026-08-08"
model: "gpt-5.6-luna with Fable high-effort validation"
sources:
  - "label:memroos-product@41be6881"
  - "label:oracle-1-production-smoke"
  - "label:cordant-hermes-01-production-smoke"
  - "label:maeve-u1-beastmode-luna-smoke"
  - "https://api.smith.langchain.com"
derived_from:
  - "label:phase-230-langgraph-langsmith"
regen_prompt: "Re-run the repository gates, Luna smoke, bounded Fable review, production rebuild/onboarding checks, Cordant recall matrix, and LangSmith API permission probe; update this checkpoint with verified results and blockers."
---

# Production checkpoint

## Completed

- `memroos-product` `main` is clean and current at `41be6881`; the only unmerged refs are three preserved Claude branches, so no unmerged work was deleted.
- Oracle-1 and cordant-hermes-01 were fast-forwarded and rebuilt from that commit. Required services and onboarding verification pass on both hosts. Invalid onboarding tokens return HTTP 403, structurally valid bad signatures return HTTP 403, and all required service health probes return HTTP 200.
- Cordant shared connector access is governed and auditable. Linear, Circleback, and Notion connections are shared for Eric's tenant; the post-deploy matrix returned five results per query for all five host identities (Claude, Codex, Hermes, OpenClaw, Pi), with `recall_receipt.status=applied`. Linear and Notion queries resolve to their connector spaces; `meeting` resolves to Circleback/Linear connector spaces.
- The recall authorization fix prevents an authenticated agent's identity `agent_id` from being reused as a content allow-list for connector-authored rows; human/operator explicit filtering remains covered by regression tests. Sharing now records a tenant-scoped `tool_connection.shared_toggle` audit event, with tenant attribution covered by tests.
- Beastmode's reviewed `gpt5.6` alias resolves to `openai-codex/gpt-5.6-luna`. Model and Pi policy preflight passed on `maeve-u1`; the high-autonomy no-write smoke returned `BM-LUNA-MAEVE-OK`.
- A bounded subscription-backed `claude -p --model fable --effort high --permission-mode plan` review returned `VERDICT PASS`. It found two test-coverage gaps; both were closed before the production rebuild.
- Fast tests (478 files, 4,004 passed, 54 skipped), slow tests (54 passed), typecheck, route-auth, governance, GSD lane evals, roadmap priority, runtime topology, and lint (0 errors; existing warnings only) pass.

## LangGraph/LangSmith RCA

LangGraph/LangSmith configuration is present on both production orchestration services: tracing is enabled, the `memroos` project is configured, and API credentials are injected without exposing values. Local `langsmith_trace_receipts` are intentionally fail-open and currently `queued` (Oracle 7, Cordant 5); this is the designed non-authoritative receipt path.

A read probe against `https://api.smith.langchain.com/runs` using the configured key returns HTTP 403 on both hosts. The same key sent as `Authorization: Bearer` returns HTTP 401, confirming the endpoint is reachable and the x-api-key is recognized but forbidden for this workspace/project read operation. No application or network error is present in the orchestration logs. This is an external LangSmith credential/workspace authorization issue, not a LangGraph wiring failure.

Resolution requires a LangSmith API key/workspace grant that permits the `memroos` project (read access for verification and write access for tracing), or a confirmed project/workspace endpoint and corresponding secret rotation on both hosts. Do not print or commit the key. Until then, MemroOS remains authoritative and the local receipts correctly remain queued rather than being treated as remote success.

## Remaining blockers

- `main-man` is not present in the Tailscale peer set or local SSH/DNS configuration; no safe identity or route exists to run the requested Luna check there.
- LangSmith read authorization is still 403 as described above.
- Phase 175 sustained runtime evidence, Phase 237 licensed/equal-model provider-backed promotion evidence, and the ChatGPT Workspace Admin custom-app/tool-scan/publish smoke require authorized external fixtures or workspace-admin access.
- Cline and Prime Agent remain supported onboarding/install targets; T3.codes is intentionally not modeled as a separate harness.


## LangSmith credential handoff (2026-08-08)

The official LangSmith Cloud login is https://smith.langchain.com. LangSmith's API documentation identifies https://api.smith.langchain.com as the US Cloud API endpoint and requires the `X-Api-Key` header; regional deployments use their corresponding regional API host. The current MemroOS production configuration points at the US endpoint and project `memroos`.

To resolve the 403, the operator should sign in to the organization/workspace that owns `memroos`, open Settings → API Keys, and create or authorize a workspace-scoped service key (preferred for production) or a PAT with permission to read and write the `memroos` project. If the account spans multiple workspaces, record the non-secret Workspace ID and set `LANGSMITH_WORKSPACE_ID` as required. The API key is displayed once and must be transferred through the approved secret manager/host configuration, never chat, shell history, logs, or git.

Maeve-u1 currently has no LangSmith environment variables configured. This is distinct from the configured cloud/production credential; do not assume the cloud key is available locally or copy it into Maeve-u1. Production secret rotation and a post-rotation `X-Api-Key` read/write probe on both Oracle-1 and cordant-hermes-01 remain pending operator authorization and the non-secret endpoint/workspace details.
