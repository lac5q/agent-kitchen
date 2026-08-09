---
title: "MemroOS agent defect-report accuracy audit"
description: "Live reconciliation of the Oracle agent issue queue against production behavior, with evidence classification and remediation plan."
publishedAt: "2026-08-09"
tags: [memroos, defects, agent-reports, operations, connected-memory]
keywords: [agent_issue_reports, evidence-status, Nango, recall-ingest, onboarding]
author: "Codex"
source_session: "019fdac3-ab4e-7a21-bbef-f37ee440470a"
model: "gpt-5"
sources:
  - "label:oracle-live-agent_issue_reports"
  - "label:oracle-live-connector_sync_state"
  - "label:production-code-agent-report-route"
  - "label:production-code-memory-recall-route"
derived_from:
  - "content/ops/connector-oauth-nango-cap-2026-08-09.md"
regen_prompt: "Re-query both production issue stores, connector state, memory health, and Nango behavior; classify each open report as unverified, reported, reproduced, or resolved and update this audit."
---

# Defect-store accuracy audit — 2026-08-09

## Executive result

The Oracle defect store contains six open reports. They are not equivalent defects:

- Four Prime Agent records are duplicate, success-only intake messages. They have no failure code or diagnostics and were stored at four different severities. They are unverified intake, not four reproduced incidents.
- One onboarding registration report is a concrete HTTP 400 with an agent identifier. It remains an open reported defect and needs a fresh invite/token verification.
- One connected-memory report is detailed and contains real stale-ingest evidence, but it also tests operator-only internal memory routes as if they were agent recall APIs. Its claims must be split by endpoint and environment rather than accepted wholesale.

No report was closed by direct database mutation. The queue remains auditable and operators can acknowledge or resolve after review.

## Live queue evidence

Oracle `/data/conversations.db` was read-only inspected inside the running MemroOS container. The six open IDs were:

- `39a0e9be-a56d-4b12-a36a-6fc92b9c3b07` — high / connected-memory. This is the detailed report.
- `224e5cde-cff7-4106-b782-76539cb9ce33` — critical / onboarding, body: “Prime Agent completed authenticated endpoint and agent-context tests.”
- `a8185fb6-1a5f-4ae3-bf1a-851d7fb603ca` — high / onboarding, same body.
- `c19079e5-8629-4f80-aab3-c851aa3527a6` — medium / onboarding, same body.
- `5ceb267e-8244-49e9-84c1-572027fa1f86` — low / onboarding, same body.
- `fc7757c1-822c-420f-a484-541ad1ba2bd9` — high / onboarding, registration status 400 for agent `onboarding-6fd70499-9f49-4d5b-ae74-0a962db9252b`.

The four older Prime rows have null dedupe keys because they predate the structured report contract; they are historical duplicates, not evidence of four severities of failure.

## Claim-by-claim reconciliation

### Recall ingest

The stale claim is real on both production profiles: `/api/memory/health` reports `recallIngest.status=stale`. Oracle's last ingest was 2026-07-26 while the configured threshold is 24 hours; Cordant reported no recent ingest timestamp. This is a real scheduler/ingestion freshness defect, not a false report.

The embedding substrate is a separate gate and is healthy on Oracle: the live SQLite database has 129,064 messages, 127,131 non-empty messages, and 127,131 embeddings; the embedding health log repeatedly reports backlog 0. Embedding catch-up therefore does not by itself clear the stale recall-ingest marker.

### Agent memory authorization

The report's 403/401 results came from `/api/memory/search`, `/api/memory/graph`, and `/api/memory/multi-search`. Those are operator/internal tier routes and are not the governed agent recall contract. The agent-facing read path is `/api/recall`, which requires the agent request principal and `mcp:read` policy. The reported failures should not be recorded as proof that all agent memory search is broken; they do prove that the test used the wrong authorization boundary.

A fresh agent-key or MCP-OAuth test against `/api/recall` is still required before this claim can be marked reproduced or resolved.

### QMD and RTK

Both production health profiles classify QMD and RTK as optional degraded services; the production containers do not have a QMD binary installed. The Prime SIGSEGV claim is therefore a local/client-runtime issue unless QMD is explicitly required for that installation. It is not evidence that SQLite recall or the embedding worker is down.

### Circleback and Notion

Oracle has historical connector sync rows for Circleback and Notion, but they are stale (last successful rows were Aug 3–4) and the local `tool_connections` table is empty while Nango still retains connections. That is a real reconciliation defect: external OAuth state survived while the local ownership projection did not. Cordant has current connector rows, including Notion and Circleback, so the blanket claim “no Notion/Circleback records exist” is environment-specific and false for Cordant.

### Nango OAuth

Live Nango probes return HTTP 400 with `resource_capped` (“Reached maximum number of allowed connections”) when starting a new session. This is an external plan-cap condition, not a malformed browser request. The application now maps it to HTTP 429 with an actionable message instead of a generic 502.

### Onboarding HTTP 400

The onboarding 400 remains a real open report. The token/agent pair must be replaced with a fresh invite and then re-run through the onboarding verifier. No credential was present in the stored report.

## Remediation now in the repository

- Added computed `evidenceStatus` to every report:
  - `reported`: structured failure data or concrete failure signals.
  - `unverified`: success-only/insufficiently specific intake.
- Added evidence badges to the Issues and Team views.
- Changed the NOC aggregation so unverified high/critical intake cannot page as a critical incident; it appears as a warning pointing to the Issues queue.
- Added known-owner Nango reconciliation. A retained Nango connection is materialized only when its end-user ID or email matches a non-disabled local user, and it remains private. Unknown Nango connections are not imported or shared.
- Added the Nango connection-cap 429 response and regression coverage.

Focused tests (agent reports, NOC, tool connections, OAuth route): 53 passed. Typecheck and lint pass (lint retains pre-existing warnings). A full post-change suite still needs to complete before deployment.

## Remaining verification gates

1. Finish the full fast suite and run the change detector against the final staged diff.
2. Commit/push, rebuild both production stacks, and run public plus host-local deployment verification.
3. In an authenticated browser session, confirm Oracle settings now shows only the matching owner's retained Nango connections and run the owner-scoped sync route.
4. Run a fresh governed agent recall test against `/api/recall`; attach status and diagnostics to a new structured report.
5. Re-test the fresh onboarding invite. Keep the old 400 open until the replacement path is verified, then resolve it with the exact verification note.
