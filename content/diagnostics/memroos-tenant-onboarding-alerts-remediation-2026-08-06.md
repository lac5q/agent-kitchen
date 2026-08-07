---
name: "memroos-tenant-onboarding-alerts-remediation-2026-08-06"
title: "Tenant, onboarding, alert, and observability remediation RCA"
description: "Root causes, containment changes, and release-gate evidence for the 2026-08-06 MemRoOS hardening pass."
publishedAt: "2026-08-06"
tags: [memroos, rca, tenant-isolation, onboarding, alerts, langsmith, qmd]
keywords: [ChatGPT Work Agent, MCP OAuth, Claude onboarding, tenant recall, notification redaction, LangGraph, LangSmith]
author: "Codex"
source_session: "019fd5b9-558f-72f1-9ca4-ac23f294db7e"
model: "gpt-5.6-sol director; gpt-5.6-luna max workers and validator"
sources:
  - "repo:apps/memroos/src/app/api/recall/route.ts"
  - "repo:apps/memroos/src/app/api/memory/multi-search/route.ts"
  - "repo:services/knowledge-mcp/knowledge_system/mcp_server.py"
  - "repo:services/memory/notify.py"
  - "repo:scripts/install-memory-resilience.mjs"
  - "repo:services/orchestration/langsmith_bridge.py"
derived_from:
  - ".planning/phases/231-memory-substrate-stabilization-hindsight-shadow-lane/"
  - ".planning/milestones/v8.39-observability-gated-memory-engine-ROADMAP.md"
regen_prompt: "Re-audit the 2026-08-06 MemRoOS tenant isolation, onboarding, notification, QMD, LangGraph, and LangSmith changes against the current branch and refresh this RCA with current test evidence."
---

# Tenant, onboarding, alert, and observability remediation RCA

## Executive result

The hardening pass closed the identified cross-tenant recall and audit risks, removed obsolete ChatGPT Actions while retaining ChatGPT Work Agent MCP OAuth onboarding, made alert delivery redact at its final boundary, made QMD replacement transactional, and preserved privacy-safe LangGraph-to-LangSmith correlation.

## Root causes

1. Legacy recall and audit paths predated authoritative tenant ownership and used host-global fallbacks or tenant-neutral SQL and side effects.
2. Multi-search combined a tenant-aware API with legacy local episodic and external results that did not prove tenant ownership.
3. OAuth MCP exposed legacy/global operations through broad dispatcher fallbacks.
4. Notification transports relied on upstream sanitization, allowing nested errors, bearer values, and exception text to reach delivery adapters.
5. QMD replacement interrupted the canonical service before the candidate launcher was fully staged and verified.
6. LangGraph checkpoint tests used public run identifiers instead of the privacy-safe trace receipt identifier.
7. Focused trust-boundary Vitest gates ran SQLite-writing files in parallel against one database, producing intermittent HTTP 400 responses from initialization/write contention.
8. The proxy trust-boundary checksum had not been refreshed after intentionally expanding route-local authentication for tool-attention OAuth and agent callers.

## Remediation

- Added authoritative tenant resolution and tenant SQL predicates for keyword, semantic, hybrid, agent-list, audit, NOC, and security-report reads.
- Added message tenant migration; historical rows are quarantined as `__legacy_unscoped__`, and tenant FTS never infers ownership.
- Required explicit matching tenant markers for external multi-search results and moved local episodic search to tenant-bound SQLite.
- Denied legacy OAuth `memory_recall` and replaced workspace fallback dispatch with an exact allowlist.
- Bound audit and cache identities to authenticated tenants.
- Added recursive final-boundary redaction across all notification transports and internal errors.
- Made QMD install stage/lint first, snapshot canonical state, restore on failure, and preserve stopped/running state.
- Kept LangGraph checkpoint IDs tied to privacy-safe LangSmith trace receipts.
- Kept legacy ChatGPT Actions at deterministic HTTP 410 while preserving Work Agent MCP OAuth.
- Serialized the route-auth and Next trust-boundary gates to remove shared-SQLite contention.
- Re-attested the Next proxy checksum after reviewing its anchored tool-attention route family and route-local guards.

## Verification evidence

- Fast application suite: 466 files passed, 2 skipped; 3,917 tests passed, 52 skipped.
- Slow application suite: 3 files passed; 52 tests passed.
- Production Next.js build and TypeScript typecheck passed.
- ESLint: zero errors, 92 existing warnings.
- Knowledge MCP: 215 passed; orchestration: 38 passed; focused OAuth MCP: 95 passed.
- Notification adversarial tests: 3 passed; QMD installer: 5 passed; health/QMD shell tests passed.
- Route-auth boundary: 8 files and 64 tests passed serialized.
- Next trust boundary: 7 files and 99 tests passed serialized.
- GitNexus compare-to-main: 125 files, 403 indexed symbols, 139 affected processes, critical blast radius.
- Independent native Beastmode validator: attested `gpt-5.6-luna`, reasoning `max`, read-only, verdict PASS.

## Remaining operational boundary

The work is locally verified but has not been pushed, merged, deployed, or used to change production secrets. These require explicit operator GO. Production verification must include Work Agent OAuth onboarding, invalid onboarding token HTTP 403, LangSmith receipts, notification health, and oracle-1 plus cordant-hermes checks.
