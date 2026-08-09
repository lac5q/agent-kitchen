---
name: "memroos-cordant-agent-connector-rca-2026-08-09"
title: "MemroOS Cordant agent visibility and Connmem deployment RCA"
description: "Live evidence and remediation for Eric's Cordant agents, shared Nango connectors, Connmem image drift, and LangGraph-to-LangSmith verification."
publishedAt: "2026-08-09"
tags: ["memroos", "cordant", "agents", "connectors", "connmem", "langsmith", "production-rca"]
keywords: ["cordant-hermes-01", "Eric", "Linear", "Circleback", "Notion", "Nango", "Connmem", "LangGraph", "LangSmith"]
author: "codex-gpt-5.6"
source_session: "019fdac3-ab4e-7a21-bbef-f37ee440470a"
model: "gpt-5.6"
sources:
  - "label:cordant-live-read-only-db-audit-2026-08-09"
  - "label:cordant-eric-scoped-api-verification-2026-08-09"
  - "label:oracle-connmem-rebuild-and-langsmith-smoke-2026-08-09"
  - "https://memroos-cordant.epiloguecapital.com/api/health"
  - "https://memroos.epiloguecapital.com/api/health"
derived_from:
  - "content/research/memroos-production-alert-routing-opt-in-2026-08-09.md"
  - "content/research/memroos-main-mac-alert-routing-rca-2026-08-09.md"
regen_prompt: "Re-run the sanitized Cordant/Oracle DB, API, Connmem, and LangSmith checks and update the ownership, connector sync, image, and trace evidence without emitting credentials."
---

# RCA

## Finding

Eric's Cordant tenant had healthy, explicitly shared Nango-backed Linear, Circleback, and Notion connections, but the five long-running agents registered on `cordant-hermes-01` were private rows owned by Luis. That made the agents invisible to Eric's operator scope even though they run on his host and the provider connections are shared.

The Connmem service also had deployment drift: Cordant exposed the current `/v1/status` contract while Oracle's older image returned 404 for that route. After rebuilding the Connmem service from the synchronized `memroos-product` checkout, both hosts expose the same contract. Both registries report `runtime.state=unconfigured` because no separate host-level Linear/Notion REST credentials and permission evidence are authorized. This is truthful and does not replace the Nango OAuth boundary.

## Evidence

- Cordant users are in the same `default-tenant`; Eric is an active admin and owns the Linear, Circleback, and Notion rows.
- Before remediation, the five `cordant-hermes-01:<platform>` rows were Luis-owned and `is_shared=0`.
- The existing ownership PATCH route was used to set `is_shared=1` for Claude, Codex, Hermes, OpenClaw, and Pi, preserving Luis as the accountable owner and writing the normal ownership audit path.
- An Eric-scoped authenticated API check now sees nine agents, including all five Cordant agents as `live`, `isShared=true`, and not privately owned by the viewer.
- The Eric-scoped connections endpoint reports connected Nango-backed Linear, Circleback, and Notion rows, all shared and manageable by Eric.
- Current Cordant sync receipts for Eric's shared Nango connections: Circleback `ok` with 20 rows on the latest cycle; Notion `ok` with 411 rows; Linear has an `ok` tool stream plus an issue stream still `backfilling` with 385 rows on the latest bounded cycle.
- Both Connmem containers now return HTTP 200 for `/health`, `/v1/status`, and `/v1/ledger`. The status is `unconfigured` with open requirement `CONNMEM-RT-ADAPTERS`, not a false healthy empty inventory.
- A fresh Oracle orchestration smoke returned a queued local `LangGraphRuntime.start` receipt. LangSmith listed four `memroos.langgraph.start` runs in project `memroos`, including the new metadata-only smoke.

## Root cause

Agent ownership and connector sharing are separate policy boundaries. The host processes were registered under Luis's identity and were not shared, while Eric's provider connections were correctly shared. Separately, Connmem's Python registry is intentionally host-level and does not consume the Next.js Nango connection table; it cannot safely be populated from an OAuth MCP token or an unapproved shared credential.

## Remediation

1. Shared the five Cordant host agents through the existing ownership route; owner accountability remains Luis and the audit trail remains intact.
2. Rebuilt Connmem on Cordant and Oracle with `scripts/memroos-restart.sh build connmem && ... up connmem`, eliminating Oracle's stale-image 404.
3. Re-verified Eric-scoped agent visibility, provider connection visibility, provider sync receipts, Connmem health/status/ledger, public health, and LangSmith trace ingestion.
4. Kept the separate Connmem registry fail-closed. Enabling it requires an approved provider REST credential set, explicit workspace/tenant scope, permission evidence, and a reconciliation plan; the Nango-backed Next scheduler remains the live provider path.

## Remaining gates

- Linear historical backfill, provider-total/company-completeness, update/delete/tombstone propagation, and cross-source reconciliation are still open.
- Connmem adapter registration remains open until approved REST credentials and permission evidence exist; no OAuth token was copied or exposed.
- Cordant intentionally uses `EXPECT_VECTOR_BACKEND=none`; ANN recall remains degraded there. Oracle's Qdrant-backed ANN probe still needs provider-backed evidence.
- Phase 203's invite-to-Google interactive browser smoke, centralized knowledge round-trip, live adoption SLO receipts, Workspace Admin actions, licensed benchmark fixtures, Main-Mac Workspace CLI re-auth, and main-man access remain external gates.
