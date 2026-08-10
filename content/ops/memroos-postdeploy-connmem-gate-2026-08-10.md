---
name: "memroos-postdeploy-connmem-gate-2026-08-10"
title: "MemroOS post-deploy Connmem and MCP closure gate"
description: "Evidence from the 2026-08-10 main deployment and live Connmem/MCP probes on Cordant and Oracle."
publishedAt: "2026-08-10"
tags: [operations, connmem, mcp, deployment, phase-176, phase-238]
keywords: [CONNMEM-RT-ADAPTERS, Cordant, Oracle, Streamable HTTP, gpt-5.6-luna]
author: "Codex"
source_session: "019fdac3-ab4e-7a21-bbef-f37ee440470a"
model: "gpt-5.6"
sources:
  - "label:memroos-product@42a63e32"
  - "label:gpt-5.6-luna-roadmap-audit@2026-08-10"
  - "https://memroos.epiloguecapital.com/api/health"
  - "https://memroos-cordant.epiloguecapital.com/api/health"
  - "https://memroos.epiloguecapital.com/mcp"
  - "https://memroos-cordant.epiloguecapital.com/mcp"
derived_from:
  - "content/ops/memroos-phase176-luna-roadmap-audit-2026-08-09.md"
  - "content/ops/knowcent03-cordant-inventory-2026-08-09.md"
regen_prompt: "Re-run the post-deploy health, onboarding, Streamable HTTP MCP initialize/tools-list, and Connmem status/release-gate probes on both production hosts, then update only with redacted evidence."
---

# Result

The memroos-product main deployment is 42a63e32 on both cordant-hermes-01 and oracle-1. Both application checkouts are clean, the app containers are healthy, and the host MCP services are active with zero restarts.

Public verification passed on both URLs:

- /api/health returned HTTP 200 with no down services.
- /api/auth/google/status returned {"configured":true,"reason":null}.
- Invalid onboarding tokens returned HTTP 403 as required.
- Streamable HTTP MCP initialize and tools/list returned HTTP 200, a session id, knowledge-system version 2.14.7, and the knowledge_write tool.

## Connmem gate

The Connmem service is healthy on both hosts and all nine synthetic release checks pass:

- schema_round_trip
- idempotent_upsert
- hash_change_detected
- webhook_signature_required
- reconciler_empty_listing_safe
- recall_provenance
- crosslink_conservative
- governance_dry_run_default
- end_to_end

The live registry is intentionally fail-closed on both hosts:

runtime.state=unconfigured, sources=[], and open_requirements=["CONNMEM-RT-ADAPTERS"].

This means the runtime library is verified, but no provider adapter is being represented as live through the separate Connmem registry. Phase 176 therefore remains open pending provider credentials, capability/permission evidence, Oracle parity, and provider-total/reconciliation/deletion/retention proof. Existing Cordant Nango-backed scheduler rows are not counted as Connmem adapter registration.

## Remaining external gates

- Main-man access and the Cordant local-store cutover remain required for Phase 238.
- Linear/Circleback/Notion provider credentials and capability manifests are required for Phase 176 live closure.
- Live producer receipts are required for the adoption SLO.
- Signed-in Google consent and fresh per-agent native-MCP invites remain operator acceptance gates.
