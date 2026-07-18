# Milestones

This file tracks the current high-level product milestone state. Detailed requirement traceability lives in `.planning/REQUIREMENTS.md`; full phase-level history lives in `.planning/ROADMAP.md`.

## Planned: v8.16 Multi-Harness Observe Plane (Added 2026-07-17)

**Scope:**

1. Tiered capture policy (`summary` / **`relevant` default** / `full`) — store useful learning without drowning in chat dumps; depth upgradable later.
2. Remote MCP onboard for harnesses; **support agents already onboarded** to MemRoOS (incl. **Pi** as first-class `AgentPlatform`).
3. Observe sidecar + Wave 1 (Claude/Codex/Hermes/OpenClaw/**Pi**) → Wave 2 (Cursor/Factory) → Wave 3 (Antigravity + visibility).
4. Operator visibility of per-onboarded-agent capture health.

**Phases:** 167–171.  
**Requirements:** OBSERVE-01..14.  
**Kickoff:** `.planning/milestones/v8.16-multi-harness-observe-KICKOFF.md` (v2026-07-17.2).  
**Scenario:** S13.  
**Pi:** Wave 1 — sessions `~/.pi/agent/sessions/**/*.jsonl`.

---

## Planned: v8.14 Human Wiki Surface + Memory Digest (Added 2026-07-17)

**Scope:**

1. Regular memory→`llm-wiki` digest job (Obsidian-readable pages stay current).
2. MemRoOS authenticated `/wiki` reader (folder tree, markdown, wikilinks, search).
3. Light graph panel over compiled wiki JSON.

**Phases:** 160–162.  
**Requirements:** WIKISURF-01..08.  
**Kickoff:** `.planning/milestones/v8.14-human-wiki-surface-KICKOFF.md`.  
**Seed:** Manual digest 2026-07-17 in `~/github/knowledge/llm-wiki/wiki/07-memroos-platform/`.

---

## Current Position: v8.6 Skill Trust Chain (Completed 2026-07-16)

**Scope:**

1. Skill contracts (incl. `evidence_examples`) + fail-closed dispatch.
2. Ed25519 content-hash signing and registry provenance.
3. Quarantine lane before enablement; governed cross-harness sync with proposals/pins/rollback.
4. Lifecycle states + dependency view + audit.

**Phases:** 148–150 — complete (planning closeout after code-first land).  
**Requirements:** SKILLTRUST-01..05 — checked complete 2026-07-16.  
**Evidence:** `.planning/phases/148-skill-contracts-signing/`, `149-skill-quarantine-governed-sync/`, `150-skill-lifecycle/`.

**Next residual gaps:** v8.7 Memory Lifecycle + Erasure; v8.8 Orchestration Evidence Depth; v8.10 Governed Ontology Foundation (plus ENTOPS harness/IdP follow-ups).

---

## Prior Position: v8.11 Unified Meeting Memory (Completed 2026-07-14)

**Scope:**

1. Harden meeting ingest (idempotent IDs, frontmatter, public providers, health).
2. Ship federated MCP `memory_recall` so agents do not need Circleback vs Fathom collection names.
3. Add multi-search QMD lane, docs, and Monaco/Fathom regressions.

**Phases:** 151–153 — complete. Kickoff: `.planning/milestones/v8.11-unified-meeting-memory-KICKOFF.md`.

---

## Current Position: Agent OS GSD Stack (In Progress 2026-07-06)

**Scope:**

1. Implement the Mark Kashef transcript-audit stack through GSD as a MemRoOS-native control plane, not as a Hermes/OpenClaw replacement project.
2. Put shared product substrate in MemRoOS: context packet, run ledger, proof gates, command state, evals, model-routing receipts, safety gates, and adapter contracts.
3. Bundle only portable procedures as skills: GSD roadmap operator, MemRoOS context consumer, shipcheck client wrapper, skill-audit operator, bounded discuss/review council, and lane-specific research/code/handoff playbooks.
4. Keep Hermes, Discord/Telegram, Codex, Claude Code, and future UIs as thin adapters over the same MemRoOS state.

---

## v8.3 Agent OS GSD Stack (In Progress 2026-07-06)

**Phases:** 132-136

**Scope:**

1. **Agent Context Packet + Run Ledger (Phase 132)** — Complete 2026-07-06. Typed packet plus queryable task/event/proof ledger, reusing Agent Context Bus, checkpoint, memory-trace, hive, and provenance surfaces.
2. **Shipcheck + Goal/Resume/Standup Commands (Phase 133)** — Complete 2026-07-06. Lane-specific proof gate and durable command surface backed by the packet and ledger.
3. **Portable Skill Boundary + Skill Audit (Phase 134)** — Classify skill-vs-core product boundaries and audit the skill corpus without auto-deleting.
4. **Lane Evals + Model Routing Policy (Phase 135)** — Research/code/memory/handoff/GTM/safety eval fixtures and logged routing policy.
5. **Thin Interface Adapters + Safety Slice (Phase 136)** — Hermes/Discord/Telegram/Codex/Claude adapters over the shared contract, with PII/secrets/destructive-action/cost gates.

**Current verification:** Phase 132 has a redaction-first packet/ledger builder, authenticated `GET /api/agent-context`, and read-only debug wrapper. Phase 133 has authenticated `POST /api/gsd/goal`, `POST /api/gsd/shipcheck`, `GET /api/gsd/resume`, and `GET /api/gsd/standup`. Remaining v8.3 work starts at Phase 134.

**Verification target:** every interface can trigger work, but MemRoOS remains the source of truth for context, task state, proof, skills, evals, model routing, policy, and safety.

---

## v7.5 Proactive Recollection Triggering (Completed 2026-06-27)

**Phases:** 118

**Scope:**

1. **Proactive Recollection Triggering (Phase 118)** — Add deterministic search-required/search-skipped decisions before plan/tool/final gates, bounded query planning, relevance/recency/importance/freshness ranking, context-pack receipts, bronze/silver/gold memory belief-stage gates, proactive recall evals, and operator/NOC visibility.

**Verification highlights:** focused recollection-policy, memory-client, memory-trace, memory-recall-eval, and NOC tests passed; full app Vitest passed at 1211 tests; typecheck, build, and lint passed with the existing 32 warnings.

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
- ADK/A2A cross-language contract-compliance demo spike: bounded future fixture only; use Google's Python ADK plus Go deterministic-validator pattern to prove A2A handoff, failure receipts, and NOC visibility, with no ADK/Gemini core dependency or compliance-vertical claim without Luis approval.
- Qdrant 1.18.x Cloud upgrade-readiness spike: bounded operational upgrade plan only; no local Qdrant, backend swap, vector rewrite, TurboQuant enablement, named-vector migration, or production cluster upgrade without Luis approval and recall/latency/audit/rollback proof.
- DAST scanning in CI after the v7.0 audit baseline.
- External penetration test.
- SOC 2 Type II controls mapping.
- Turbovec or similar compressed-vector indexes: future-only shadow-index experiments requiring explicit Luis approval and recall/precision/MRR/false-positive/p95-latency proof before any dependency or backend change.
