---
title: "MemroOS remote MCP bridge and deployment verifier RCA"
description: "Root-cause and verification record for the incorrect /api/mcp stdio bridge, false loopback failures in public deployment verification, and the LangSmith workspace-scope probe correction."
publishedAt: "2026-08-08"
tags: [memroos, rca, mcp, deployment, onboarding, beastmode, langsmith]
keywords: [streamable-http, mcp-session-id, sse, operator-stub, verify-onboarding-deploy, codex-cloud, x-tenant-id]
author: "Codex"
source_session: "019fdac3-ab4e-7a21-bbef-f37ee440470a"
model: "gpt-5.6"
sources:
  - "repo:scripts/memroos-operator-stub.sh"
  - "repo:scripts/verify-onboarding-deploy.sh"
  - "repo:scripts/setup-codex-cloud.sh"
  - "repo:services/orchestration/langsmith_bridge.py"
  - "repo:.planning/ROADMAP.md"
  - "repo:.planning/STATE.md"
derived_from:
  - "content/research/memroos-connector-oauth-failure-rca-2026-08-08.md"
regen_prompt: "Re-run the public and host-local verifier, inspect the operator stub and LangGraph trace contracts, and update this RCA with new evidence."
---

# RCA

## Symptoms

- The agent-side stdio bridge posted JSON-RPC to `/api/mcp`, a route that is not the deployed Streamable HTTP MCP endpoint.
- The bridge did not negotiate the JSON/SSE response contract, persist `Mcp-Session-Id`, or turn a single SSE `data:` event into a line-oriented JSON-RPC response.
- `scripts/verify-onboarding-deploy.sh` probed production-only loopback ports on the verifier's own machine when run from a laptop or CI runner, producing a false mem0/orchestration/connmem outage.
- Codex Cloud setup always selected the local MCP launcher even when an operator URL was configured, allowing new cloud sessions to bypass the centralized server.
- A manual LangSmith `POST /runs` probe returned `403` because it omitted the workspace-scoping `X-Tenant-Id` header.

## Root causes

1. The bridge encoded an obsolete API path and assumed a plain JSON response.
2. The public verifier had no distinction between host-local and external execution contexts.
3. The Codex Cloud bootstrap did not make the remote-first choice at runtime.
4. LangSmith service keys are workspace-scoped; a raw request without `LANGSMITH_WORKSPACE_ID`/`X-Tenant-Id` is rejected even though the SDK path is authorized.

## Remediation

- `scripts/memroos-operator-stub.sh` now defaults to `/mcp`, supports `MEMROOS_MCP_URL`/`MEMROOS_MCP_PATH`, sends `Accept: application/json, text/event-stream`, carries `Mcp-Session-Id`, handles JSON and SSE bodies, and emits a JSON-RPC error on non-2xx instead of hanging or using a corpus fallback.
- Added deterministic transport coverage in `scripts/check-memroos-operator-stub.test.mjs` and runtime contract assertions in `scripts/check-memroos-handoff-runtime.test.mjs`.
- `scripts/verify-onboarding-deploy.sh` now uses public `/api/health` aggregation when `MEMROOS_INTERNAL_BASE` is unset and retains per-service loopback checks when it is set. Its result wording distinguishes aggregate public verification from full host-local health.
- `scripts/setup-codex-cloud.sh` now selects the remote operator stub whenever `MEMROOS_OPERATOR_URL` or `MEMROOS_APP_URL` is present, while preserving explicit local fallback.
- Oracle and Cordant checkouts were fast-forwarded to `a4d4e34e`; the application runtime remains from `09082336`. The Oracle MCP systemd 203/EXEC loop was previously repaired by invoking the launcher through `/bin/bash`.
- Public checks passed for both hosts: `/api/health=200`, invalid onboarding token `403`, password-reset pages `200`, MCP `401`, and both OAuth discovery documents `200`. Host-local required-service probes passed for mem0, orchestration, and connmem on both hosts.
- The running Oracle orchestration container has `LANGSMITH_WORKSPACE_ID`; a real `LangGraphRuntime.start` metadata-only smoke submitted a `memroos.langgraph.start` trace, and LangSmith lists that root plus graph-node runs in project `memroos`.
- Deterministic bridge, handoff, shell syntax, roadmap-priority, and runtime-topology checks passed. A bounded Luna-Max Beastmode audit attempt timed out and is not counted as validation; direct Luna smoke remains the verified worker evidence.

## Remaining external gates

- Centralized knowledge cross-box round-trip (KNOWCENT-01/03/05), provider/Oracle parity, ANN recall, Google OIDC credentials on Cordant, Workspace Admin actions, licensed benchmark fixtures, and live adoption receipts remain open.
- `main-man` is not reachable from the current Maeve/Tailscale environment; `main-mac` is not a substitute.
