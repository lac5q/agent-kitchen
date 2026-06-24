# Milestones

This file tracks the current high-level product milestone state. Detailed requirement traceability lives in `.planning/REQUIREMENTS.md`; full phase-level history lives in `.planning/ROADMAP.md`.

## Current Position: Architecture Hardening, NOC Telemetry, and Proactive Recollection Planning (In Progress 2026-06-23)

**Scope:**

1. Refresh memroos.com, README, screenshots, public metadata, and LLM-readable docs so they match the completed v6.4/v6.5/v6.6/v7.0 product state.
2. Keep the public story centered on company-owned memory and governance for agent harnesses, governed dispatch, source-backed proof, SkillForge hardening, Agent Context Bus, local-footprint inventory, and client-ready validation.
3. Plan the next memory quality lane around proactive recollection: trigger policy, query planning, recency/importance ranking, receipts, and evals that prove agents search when they should and skip when they should.

---

## v7.5 Proactive Recollection Triggering (Planned 2026-06-23)

**Phases:** 118

**Scope:**

1. **Proactive Recollection Triggering (Phase 118)** — Add deterministic search-required/search-skipped decisions before plan/tool/final gates, bounded query planning, relevance/recency/importance/freshness ranking, context-pack receipts, proactive recall evals, and operator/NOC visibility.

**Verification targets:** focused recollection-policy tests, integration at the selected dispatch/runtime seam, memory recall canary, typecheck, build, and NOC receipt visibility.

---

## v7.0 Client-Ready Security + Architecture Audit (Completed 2026-06-08)

**Phases:** 109-113

**Scope:**

1. **Parallel Domain Audit (Phase 109)** — Auth/secrets, API surface, data/memory handling, and architecture/code-quality scans with ranked findings.
2. **Critical/High Security Fixes (Phase 110)** — Critical and high findings fixed or routed correctly by type.
3. **Dependency CVE Sweep (Phase 111)** — Critical/high CVEs cleared where fixable; medium accepted-risk items documented with compensating controls.
4. **Architecture Cleanup (Phase 112)** — Dead code, module boundaries, redundant patterns, error handling, and unsafe TypeScript cleanup.
5. **Test Validation and Build Verification (Phase 113)** — Full app suite, production build, typecheck, Python services, SDK, and static checks verified.

**Verification highlights:** 1079 app tests passed, Next.js 16.2.7 production build passed, typecheck passed, Python service/SDK/voice tests passed, `npm audit --audit-level=high` exited 0.

---

## v6.6 Cloud Offload + Local Footprint Reduction (Completed 2026-06-08)

**Phases:** 108 | **Plans:** 1 complete

**Scope:**

1. **Cloud Offload + Local Footprint Reduction (Phase 108)** — Inventory permanent local stores versus rebuildable caches, map cloud targets, classify prune safety, cap local cache/log growth, and preserve privacy, encryption, rollback, and offline-degraded operation.

**Verification highlights:** `npm run check:local-footprint` reported 4.47 GB tracked, pressure `watch`, largest rebuildable cache `~/.cache/qmd`, and protected permanent state for SQLite/raw-vault stores.

---

## v6.5 Agent Context Bus + Synchronous Agent Communication (Completed 2026-06-04)

**Phases:** 107 | **Plans:** 1 complete

**Scope:**

1. **Agent Context Bus and Synchronous Agent Communication (Phase 107)** — Add a durable MemRoOS-native inbox/reply bus for agents, REST and MCP access, bounded wait-for-reply support, optional memory-save/context-sync receipts, fail-closed control-layer data-access enforcement, and denial of self-declared user/OAuth claims with agent auth/scanner/audit regression coverage.

---

## v6.4 SkillForge Production SkillOpt Hardening (Completed 2026-06-08)

**Phases:** 106 | **Plans:** 2 complete

**Scope:**

1. **SkillForge Production SkillOpt Hardening (Phase 106)** — Replace heuristic/stub SkillForge eval behavior with deterministic sandbox-backed behavioral W scoring, converge proposal generation into one production path, add schema-level split/baseline/edit traceability, represent proposed skill edits as typed bounded operations, and expose accepted/rejected proposal evidence in audit/UI surfaces.

---

## v6.3 Agent Lifecycle + Memory Observability (Completed 2026-05-29)

**Phases:** 103-105

**Scope:**

1. Lightweight checkpoint/resume/handoff with compact structured checkpoints and async queues.
2. Memory-trace observability with casual timelines, failure classification, and debug graphs.
3. Agent CI/CD release gates with immutable versions, promotion checklists, and one-step rollback.

---

## v6.2 Skill Distribution + Knowledge Gateway (Completed 2026-05-28)

**Phases:** 98-102

**Scope:**

1. Skill Distribution Core with `skill_catalog`, `skill_read`, private skill merging, and `auto-load` frontmatter.
2. Private Config Layer with `context-sources.local.json` overlay and generic meeting-recordings slot.
3. Circleback ingestion with sync CLI and nightly LaunchAgent.
4. Memroos Troubleshooter Skill.
5. Public skill and integration documentation.

---

## v6.1 SkillForge Autonomy (Completed 2026-05-26)

**Phases:** 91-95

**Scope:**

1. Nightly Dream Cycle automated skill optimization.
2. Skill Marketplace publish/rate/discover surfaces.
3. Multi-agent skill orchestration.
4. Behavioral W-Lift v2.
5. Self-hosted eval cluster with local judge support.

---

## v6.0 SkillForge — Governed Skill Optimization (Completed 2026-05-26)

**Phases:** 85-90, 96-97

**Scope:**

1. SkillForge foundation worker, analysis, proposal generation, evaluation, governance, and integration.
2. Agent memory continuity with capture/handoff packs and redaction.
3. Source-routing contracts for meeting capture.

---

## v5.0-v5.2 Memory Trust + Operational Intelligence (Completed 2026-05-24)

**Phases:** 74-84

**Scope:**

1. Security labels, raw vault, classification cascade, retrieval authorization, safe index projections, and security regression tests.
2. NOC telemetry, cron health, universal evidence bundles, auth hardening, memory inventory clarity, and competitive memory target architecture.

---

## v2.0-v4.0 Foundation Milestones (Completed 2026-05-11 to 2026-05-21)

**Scope:**

1. A2A hub, universal REST API, canonical agent registry, LangGraph orchestration, operating profiles, and OSS polish.
2. Eval engine, SEAL substrate, compliance/auth, context reliability, HIL edit-and-continue, rollback, semantic recall, evidence bundles, and governed skill contracts.

---

## Deferred / Approval-Gated

- Memento-style memory-save quality spike: bounded comparison only; no dependency adoption, backend swap, hosted/private trace upload, or replacement of mem0/Qdrant/Neo4j/SQLite without Luis approval.
- CocoIndex source-freshness spike: bounded future comparison only against one non-sensitive declared context lane; no dependency adoption, production indexing path, policy bypass, sensitive raw-corpus indexing, or memory backend replacement without Luis approval.
- FastContext repo-scout spike: bounded future comparison only against GitNexus and grep on MemRoOS code-navigation tasks; no runtime dependency, hosted/private repo upload, GitNexus replacement, or automatic edits without Luis approval.
- DAST scanning in CI after the v7.0 audit baseline.
- External penetration test.
- SOC 2 Type II controls mapping.
- Turbovec or similar compressed-vector indexes: future-only shadow-index experiments requiring explicit Luis approval and recall/precision/MRR/false-positive/p95-latency proof before any dependency or backend change.
