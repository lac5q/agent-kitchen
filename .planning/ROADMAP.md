# Roadmap: Memroos

## Milestones

- ✅ **v1.1 Knowledge Architecture + Dashboard Polish** — Phases 1-5 (shipped 2026-04-11)
- ✅ **v1.2 Live Data + Knowledge Sync** — Phases 6-11 (shipped 2026-04-12)
- ✅ **v1.3 Advanced Observability + Knowledge Depth** — Phases 12-17 (shipped 2026-04-15)
- ✅ **v1.4 Cookbooks** — Phase 18 (shipped 2026-04-15)
- ✅ **v1.5 Agent Coordination + Voice** — Phases 19-25 (shipped 2026-04-20)
- ✅ **v1.6 Monorepo + Progressive MCP Tool Attention** — Phases 26-28 (shipped 2026-04-30)
- ✅ **v1.7 Progressive Tool Gateway Runtime** — Phases 29-33 (shipped 2026-05-04)
- ✅ **v2.0 A2A Hub — Open Source** — Phases 34-41 (shipped 2026-05-11)
- ✅ **v2.1 Security + Trust Layer** — Phases 42-45 (shipped 2026-05-11)
- ✅ **v2.2 LLM Optimization + Evaluation** — Phases 46-49 (shipped 2026-05-11)
- ✅ **v2.3 Agent Runtime Enhancements** — Phases 50-52 (shipped 2026-05-11)
- ✅ **v2.4 Performance + Caching** — Phases 53-54 (shipped 2026-05-11)
- ✅ **v2.5 Eval Engine + Self-Improvement Platform** — Phases 57-62 (Tier 1 shipped 2026-05-17; behavioral W-lift deferred to v3)
- ✅ **v3.0 Compliance Platform + Finance Vertical** — Phases 63-68 (shipped 2026-05-17)
- ✅ **v3.1 Context Reliability + Runtime Resilience** — Phase 69 (shipped 2026-05-17)
- ✅ **v4.0 Orchestration Depth + Intelligence Uplift** — Phases 70-73 (completed 2026-05-21; milestone audit/closeout next)
- ✅ **v5.0 Memory Trust + Operational Intelligence** — Phases 74-82 (MVP phase closeout completed 2026-05-24)
- ✅ **v5.1 Memory Inventory Clarity** — Phase 83 (shipped 2026-05-24)
- ✅ **v5.2 Competitive Memory Target Architecture** — Phase 84 (shipped 2026-05-24)
- ✅ **v6.0 SkillForge — Governed Skill Optimization** — Phases 85-90 (shipped 2026-05-26)
- ✅ **v6.1 SkillForge Autonomy — Dream Cycle + Marketplace** — Phases 91-95 (shipped 2026-05-26)
- ✅ **v6.2 Skill Distribution + Knowledge Gateway** — Phases 98-102 (shipped 2026-05-28)
- ✅ **v6.3 Agent Lifecycle + Memory Observability** — Phases 103-105 (shipped 2026-05-29)
- ✅ **v6.4 SkillForge Production SkillOpt Hardening** — Phase 106 (completed 2026-06-08)
- ✅ **v6.5 Agent Context Bus + Synchronous Agent Communication** — Phase 107 (completed 2026-06-04)
- ✅ **v6.6 Cloud Offload + Local Footprint Reduction** — Phase 108 (completed 2026-06-08)
- ✅ **v7.0 Client-Ready Security + Architecture Audit** — Phases 109-113 (completed 2026-06-08)
- ✅ **v7.1 Competitive Retrieval Proof** — Phase 114 (repo-verified 2026-06-27; public deploy approval separate)
- ✅ **v7.2 Architecture Review Hardening** — Phase 115 (completed 2026-06-27)
- ✅ **v7.3 Agent Context Bus Operational Bootstrap** — Phase 116 (completed 2026-06-14)
- ✅ **v7.4 NOC Efficiency Telemetry** — Phase 117 (completed 2026-06-27)
- ✅ **v7.5 Proactive Recollection Triggering** — Phase 118 (completed 2026-06-27)
- ✅ **v7.6 Future Spike Queue** — Phase 119 (completed 2026-06-27; adoption deferred)
- ✅ **v8.0 Belief + Provenance Core** — Phases 120-123 (completed 2026-07-06; PROV-01..04 + BELIEF-01..05 shipped, test-verified, Watcher-approved)
- 🔄 **v8.1 Enterprise Operator Control Plane** — Phases 124-127 (Phase 124 complete 2026-07-06; Phases 125-127 have infra deps — hosted operator / IdP / MDM)
- 🔜 **v8.2 Team-Scale Access + Policy Plane** — Phases 128-131 (planned 2026-07-06; depends on v8.0 + v8.1)
- 🔄 **v8.3 Agent OS GSD Stack** — Phases 132-136 (in progress 2026-07-06; Phase 132 complete; implements the Mark Kashef transcript-audit stack as MemRoOS-native control plane + portable skill boundary)

## Phases

### Current v7.3 Agent Context Bus Operational Bootstrap Summary — COMPLETE

- [x] **Phase 116: Agent Context Bus Operational Bootstrap** — AGENTBUS-BOOT-01..05; provisioning scripts, startup automation, MCP env wiring, agent communication skill, and smoke tests operationalize the Phase 107 bus for end-to-end agent-to-agent communication.

Full v7.3 detail in the `## v7.3 Agent Context Bus Operational Bootstrap` section below.

### Current v7.4 NOC Efficiency Telemetry Summary — COMPLETE

- [x] **Phase 117: NOC Efficiency Telemetry Instrumentation** — EFFTEL-01..05; add trace-level data sources for the 5 blocked NOC efficiency metrics (retrieval-before-work, same-source re-reads, raw-context token share, operator re-ask redundancy, rediscovered-fact rate) so the NOC dashboard can show real values instead of honest-state placeholders.

Full v7.4 detail in the `## v7.4 NOC Efficiency Telemetry` section below.

### Current v7.5 Proactive Recollection Triggering Summary — COMPLETE

- [x] **Phase 118: Proactive Recollection Triggering** — RECOLLECT-01..07; add a deterministic trigger/query/ranking/context-pack policy so agents search memory automatically when task signals require it, skip with receipts when they do not, expose why recent or important context entered or missed the run, and label whether each memory is bronze raw evidence, silver candidate claim, or gold admitted operational truth.

Full v7.5 detail in the `## v7.5 Proactive Recollection Triggering` section below.

### Current v7.6 Future Spike Queue Summary — COMPLETE

- [x] **Phase 119: Future Spike Queue Closeout** — MEMGEN-FOLLOWUP-02, COCOINDEX-FOLLOWUP-01, FASTCONTEXT-FOLLOWUP-01, ADKA2A-FOLLOWUP-01, QDRANT-FOLLOWUP-01, and HYPEREXTRACT-FOLLOWUP-01 completed as bounded spike reports under `.planning/spikes/`, with `npm run check:future-spikes` enforcing required report sections and guardrails. No dependency adoption, backend swap, hosted/private upload, production indexing, Qdrant upgrade, runtime replacement, or default extraction behavior is approved.

Full v7.6 detail in the `## v7.6 Future Spike Queue` section below.

### Current v7.1 Competitive Retrieval Proof Summary — COMPLETE

- [x] **Phase 114: Midbrain Comparison + Comparative Benchmark Plan** — COMPETE-01..02, SITE-BENCH-01, BENCH-01..03, RETRIEVAL-01, RECEIPTS-01, SEO-PROOF-01; add Midbrain to comparison surfaces, keep architecture scores separate from SmartSearch metrics, and define the next benchmark/retrieval proof lane. Repo artifacts are verified; public deploy still requires Luis approval.

Full v7.1 detail in the `## v7.1 Competitive Retrieval Proof` section below.

### Current v7.2 Architecture Review Hardening Summary — COMPLETE

- [x] **Phase 115: Architecture Review Hardening** — ARCHREV-03 executed as the first contained code slice: SQLite schema changes now run through a versioned `PRAGMA user_version` migration runner and default admin seeding completes before `getDb()` returns.
- [x] **Phase 115: Route Auth Boundary Gate** — ARCHREV-01 completed: privileged proxy bypass and operator/admin route groups now have handler-local auth evidence plus a CI drift gate; marketing split remains a deployment decision.
- [x] **Phase 115: Architecture Identity and Module Map** — ARCHREV-02 completed: `docs/architecture.md` now describes MemRoOS as an agent OS with broker kernel, shipped-domain module map, service/script boundaries, and placement rules.
- [x] **Phase 115: Planning History Retention** — ARCHREV-08 completed: `.planning/planning-history-retention.md` defines the current-docs, tracked-archive, private-screenshot/evidence, and pre-public-release gate policy.
- [x] **Phase 115: Runtime Topology Manifest Enforcement** — ARCHREV-04 completed: the manifest owns Docker service names, dependencies, env-backed ports, and health paths, with `npm run check:runtime-topology` validating Docker compose, `start.sh`, and launchd.
- [x] **Phase 115: Typed Env Startup Validation** — ARCHREV-05 completed: `lib/env.ts` validates core app config at Next startup, centralizes high-blast-radius server constants/A2A/root-config/embedding settings, and reconciles legacy root config status.
- [x] **Phase 115: Public API/SDK Contract Unification** — ARCHREV-06 completed: public eval v1 plus TypeScript/Python SDK, REST/OpenAPI, MCP tool-schema, A2A OpenAPI, and shared contract-manifest drift gates are verified.
- [x] **Phase 115: Recall Canary CI Gate** — ARCHREV-07 completed: scheduled/manual CI now runs a deterministic gold recall canary against committed memory-recall cases and thresholds.
- [x] **Phase 115: Next Trust-Boundary Upgrade Gate** — ARCHREV-09 completed: Next/proxy baseline markers, proxy/auth adversarial regressions, and `npm run check:next-trust-boundary` now gate framework or `proxy.ts` trust-boundary changes in CI.
- [x] Phase 115 closeout: all ARCHREV requirements are repo-verified complete; marketing split remains a future deployment decision, not an open Phase 115 blocker.

Full v7.2 detail in the `## v7.2 Architecture Review Hardening` section below.

### Current v6.5 Agent Context Bus + Synchronous Agent Communication Summary — COMPLETE

- [x] **Phase 107: Agent Context Bus and Synchronous Agent Communication** — AGENTBUS-01..07; durable MemRoOS-native inbox/reply bus for agents, REST + MCP tools, bounded wait-for-reply flows, optional memory/context-sync receipts, fail-closed control-layer access guard, and agent auth/scanner/audit regression coverage.

Full v6.5 detail in the `## v6.5 Agent Context Bus + Synchronous Agent Communication` section below.

### Current v6.4 SkillForge Production SkillOpt Hardening Summary — COMPLETE

- [x] **Phase 106: SkillForge Production SkillOpt Hardening** — SKILLOPT-HARDEN-01..05 complete; held-out SkillForge eval now uses a deterministic sandbox-backed scorer with true baseline/treatment receipts.

Full v6.4 detail in the `## v6.4 SkillForge Production SkillOpt Hardening` section below.

### Current v6.0 SkillForge — Governed Skill Optimization Summary — COMPLETE

- [x] **Phase 85: SkillForge Foundation** — SKILLFORGE-01; worker, intake pipeline, SEAL skill_revision proposal type
- [x] **Phase 86: SkillForge Analysis** — SKILLFORGE-02; pattern detection, SkillFailImproveLoop
- [x] **Phase 87: SkillForge Proposal Generation** — SKILLFORGE-03; bounded edits, textual LR, rejected-edit buffer
- [x] **Phase 88: SkillForge Evaluation** — SKILLFORGE-04; train/val/held-out splits, W delta, behavioral eval
- [x] **Phase 89: SkillForge Governance** — SKILLFORGE-05; operator UI, approval gate, rollback handles
- [x] **Phase 90: SkillForge Integration** — SKILLFORGE-06; cross-modal eval, SkillCycle, runtime export
- [x] **Phase 96: Agent Memory Continuity** — AGENTMEM-FOLLOWUP-01; MemRoOS-native coding-agent capture, handoff packs, vaulting, redaction, duplicate suppression, and API tests
- [x] **Phase 97: Source Routing Contracts for Meeting Capture** — CTX-FOLLOWUP-04; project-scoped meeting routing, confidence/review state, and source-to-qmd freshness proof; completed 2026-05-28

### Current v6.1 SkillForge Autonomy Summary — COMPLETE

- [x] **Phase 91: Dream Cycle — Automated Nightly Skill Optimization** — DREAM-01..03; completed 2026-05-26
- [x] **Phase 92: Skill Marketplace — Publish, Rate, Discover** — MARKET-01..04; completed 2026-05-26
- [x] **Phase 93: Multi-Agent Skill Orchestration** — ORCH-SKILL-01..03; completed 2026-05-26
- [x] **Phase 94: Behavioral W-Lift v2 — True Instruction/Skill Behavioral Eval** — BEHAVIORAL-01..04; completed 2026-05-26
- [x] **Phase 95: Self-Hosted Eval Cluster** — LOCALJUDGE-01..04; completed 2026-05-26

### Current v6.2 Skill Distribution + Knowledge Gateway Summary — COMPLETE

- [x] **Phase 98: Skill Distribution Core** — SKDIST-01..04, PRIVCONF-03; completed 2026-05-28
- [x] **Phase 99: Private Config Layer** — PRIVCONF-01..02; completed 2026-05-28
- [x] **Phase 100: Circleback Ingestion** — CIRCLEBACK-01..03; completed 2026-05-28
- [x] **Phase 101: Memroos Troubleshooter Skill** — MSKILL-01..02; completed 2026-05-28
- [x] **Phase 102: Public Documentation** — PUBDOC-01..03; completed 2026-05-28

### Current v6.3 Agent Lifecycle + Memory Observability Summary — COMPLETE

- [x] **Phase 103: Lightweight Checkpoint/Resume/Handoff** — AGENTMEM-FOLLOWUP-02; completed 2026-05-29
- [x] **Phase 104: Memory-Trace Observability** — AGENTMEM-FOLLOWUP-03; completed 2026-05-29
- [x] **Phase 105: Agent CI/CD Release Gates** — AGENTCICD-FOLLOWUP-01; completed 2026-05-29

Full v6.0 detail in the `## v6.0 SkillForge — Governed Skill Optimization` section below.

### Current v5.0 Memory Trust + Operational Intelligence Summary — COMPLETE

- [x] **Phase 74: Security Label Schema + Raw Vault** — MEMSEC-01, MEMSEC-02; completed 2026-05-24
- [x] **Phase 75: Classification Cascade + Ingestion Gate** — MEMSEC-03, CTX-FOLLOWUP-03; completed 2026-05-24
- [x] **Phase 76: Retrieval Authorization Gate** — MEMSEC-04; completed 2026-05-24
- [x] **Phase 77: Safe Index Projections + Envelope Encryption** — MEMSEC-05, MEMSEC-06, MEMSEC-07; completed 2026-05-24
- [x] **Phase 78: Security Regression Tests** — MEMSEC-08; completed 2026-05-24
- [x] **Phase 79: NOC Telemetry + Real-Data Wiring** — NOC-01..14, OPS-AUDIT-01..04; completed 2026-05-24
- [x] **Phase 80: Cron Health Registry + Schedules Console** — CTX-FOLLOWUP-01, CTX-FOLLOWUP-02, CRON-HEALTH-01..05, UX-FOLLOWUP-03; completed 2026-05-24
- [x] **Phase 81: Universal Evidence Bundles + Harness Control Plane** — HARN-01, HARN-02, HARN-03; completed 2026-05-24
- [x] **Phase 82: Auth Hardening** — AUTH-FOLLOWUP-01, AUTH-FOLLOWUP-02, AUTH-FOLLOWUP-03; completed 2026-05-24

Full v5.0 detail in the `## v5.0 Memory Trust + Operational Intelligence` section below.

### Current v5.1 Memory Inventory Clarity Summary — COMPLETE

- [x] **Phase 83: Memory Inventory + Listing Clarity** — MEMLIST-01..05; completed 2026-05-24

Full v5.1 detail in the `## v5.1 Memory Inventory Clarity` section below.

### Current v5.2 Competitive Memory Target Architecture Summary — COMPLETE

- [x] **Phase 84: Competitive Memory Target Architecture** — MEMTARGET-01; completed 2026-05-24

Full v5.2 detail in the `## v5.2 Competitive Memory Target Architecture` section below.

### Previous v4.0 Orchestration Depth + Intelligence Uplift Summary — COMPLETE

- [x] **Phase 70: Foundation + Engine Core** — WAL fix + HIL edit-and-continue + multi-hop retry/rollback + memory adapter interface
- [x] **Phase 71: Recall + HIL SLA + Voice** — LLM semantic recall + SLA escalation timers + Daily.co meeting bot
- [x] **Phase 72: Cross-Project Recall + Behavioral W-lift + UI + Skills** — cross-project recall, true behavioral W-lift, flow trigger/freshness UI, cross-harness skills registry
- [x] **Phase 73: Operator UI Truth + Phase Parity** — HIL edit UI wired into live approvals, NOC truth states corrected, and phase-close UI representation gate added

Full v4.0 detail in the `## v4.0 Orchestration Depth + Intelligence Uplift` section below.

<details>
<summary>✅ v2.5 Eval Engine + Self-Improvement Platform (Phases 57-62) — SHIPPED 2026-05-17</summary>

- [x] Phase 57: Eval Engine Core (1/1 plans) — composite W, scorer registry, judge, drift guard, persistence, config/UI
- [x] Phase 58: SEAL Self-Improvement Substrate (2/2 plans) — proposal queue, approval/apply/rollback audit loop, modeled post-apply W re-score
- [x] Phase 59: Memory Autogen Learnings (1/1 plan) — five memory proposal types plus fixed-harness memory policy lab
- [x] Phase 60: Agent Autogen Learnings (1/1 plan) — agent proposal types, trajectory scorer, presets, minimal viable per-role golden sets
- [x] Phase 61: Business-Ops Outcome Layer (L3) (1/1 plan) — KPI events, L3 scorer/poller, CRM/helpdesk/finance adapters
- [x] Phase 62: Public Eval API + SDK (1/1 plan) — tenant-isolated public trace/run/proposal API and TS/Python SDKs

Full archive: `.planning/milestones/v2.5-ROADMAP.md`

Tier 1 shipped with deterministic modeled W-lift for memory/config-style proposal classes. True behavioral W-lift for instruction/skill proposals remains v3 scope.

</details>

### v2.0 A2A Hub — Open Source (Phases 34-41)

- [x] **Phase 34: Universal REST API + Canonical Agent Registry** — Framework-agnostic REST endpoints, dynamic agent roster, single canonical registry model
- [x] **Phase 35: A2A Protocol Implementation + Google ADK** — Agent card, A2A v1 task API, ADK agents register and surface in Flow
- [x] **Phase 36: LangGraph Orchestration Service** — Python StateGraph, SqliteSaver checkpointing, HIL approve/reject, capability routing
- [x] **Phase 37: Unified Memory — mem0 Graph + Neo4j** — Three-tier `/api/memory/*` covering vector (Qdrant Cloud) + graph (Neo4j) + episodic (SQLite)
- [x] **Phase 38: Operating Profiles + Docker Full-Stack** — Zero hardcoding, `.env.example` complete, default/custom install profiles, `docker-compose up` brings all six services healthy (Qdrant stays cloud)
- [x] **Phase 39: Developer Setup Experience** — `setup.sh` prereq detection + profile-aware scaffolding, first-run wizard for keys + first agent
- [x] **Phase 40: Documentation + Architecture Diagrams** — README rewrite, architecture diagram, install profile guide, per-framework integration guides, REST + memory references
- [x] **Phase 41: OSS Polish** — MIT license, CONTRIBUTING, SECURITY, issue templates, public CI with Docker compose smoke

<details>
<summary>✅ v1.1 Knowledge Architecture + Dashboard Polish (Phases 1-5) — SHIPPED 2026-04-11</summary>

- [x] Phase 1: Knowledge Foundations (1/1 plans) — completed 2026-04-09
- [x] Phase 2: Knowledge Curator Agent (2/2 plans) — completed 2026-04-10
- [x] Phase 3: Agent Awareness (1/1 plans) — completed 2026-04-10
- [x] Phase 4: Flow Diagram Upgrade (3/3 plans) — completed 2026-04-10
- [x] Phase 5: Personal Knowledge Ingestion Pipeline (5/5 plans) — completed 2026-04-11

Full archive: `.planning/milestones/v1.1-ROADMAP.md`

</details>

<details>
<summary>✅ v1.2 Live Data + Knowledge Sync (Phases 6-11) — SHIPPED 2026-04-12</summary>

- [x] Phase 6: Library Config Fixes (1/1 plans) — completed 2026-04-12
- [x] Phase 7: Live Heartbeat (1/1 plans) — completed 2026-04-12
- [x] Phase 8: Bidirectional Knowledge Sync (1/1 plans) — completed 2026-04-13
- [x] Phase 9: Skill Management Dashboard (2/2 plans) — completed 2026-04-13
- [x] Phase 10: Flow Diagram UX (1/1 plans) — completed 2026-04-12
- [x] Phase 11: Gwen Self-Improving Loop (1/1 plans) — completed 2026-04-12

Full archive: `.planning/milestones/v1.2-ROADMAP.md`

</details>

<details>
<summary>✅ v1.3 Advanced Observability + Knowledge Depth (Phases 12-17) — SHIPPED 2026-04-15</summary>

- [x] Phase 12: Projects Knowledge Ingestion (1/1 plans) — completed 2026-04-14
- [x] Phase 13: Skill Coverage Gaps (1/1 plans) — completed 2026-04-14
- [x] Phase 14: Skill Failure Rate (2/2 plans) — completed 2026-04-14
- [x] Phase 15: Skill Heatmap (1/1 plans) — completed 2026-04-14
- [x] Phase 16: Per-Node Activity Panel (1/1 plans) — completed 2026-04-14
- [x] Phase 17: Collapsible Node Groups (2/2 plans) — completed 2026-04-15

Full archive: `.planning/milestones/v1.3-ROADMAP.md`

</details>

<details>
<summary>✅ v1.4 Cookbooks (Phase 18) — SHIPPED 2026-04-15</summary>

- [x] Phase 18: Cookbooks Page (1/1 plans) — completed 2026-04-15

Full archive: `.planning/milestones/v1.4-ROADMAP.md`

</details>

<details>
<summary>✅ v1.5 Agent Coordination + Voice (Phases 19-25) — SHIPPED 2026-04-20</summary>

- [x] Phase 19: SQLite Conversation Store (3/3 plans) — completed 2026-04-18
- [x] Phase 20: Hive Mind Coordination (2/2 plans) — completed 2026-04-17
- [x] Phase 21: Paperclip Fleet Node (2/2 plans) — completed 2026-04-18
- [x] Phase 22: Voice Server (2/2 plans) — completed 2026-04-18
- [x] Phase 23: Memory Intelligence (2/2 plans) — completed 2026-04-18
- [x] Phase 24: Security + Audit (2/2 plans) — completed 2026-04-18
- [x] Phase 25: Usage Analytics (2/2 plans) — completed 2026-04-18

Full archive: `.planning/milestones/v1.5-ROADMAP.md`

</details>

<details>
<summary>✅ v1.6 Monorepo + Progressive MCP Tool Attention (Phases 26-28) — SHIPPED 2026-04-30</summary>

- [x] Phase 26: Monorepo Foundation (1/1 plans) — completed 2026-04-30
- [x] Phase 27: Progressive MCP Tool Attention (1/1 plans) — completed 2026-04-30
- [x] Phase 28: Monorepo CI and Deploy Hardening (1/1 plans) — completed 2026-04-30

Full archive: `.planning/milestones/v1.6-ROADMAP.md`

</details>

<details>
<summary>✅ v1.7 Progressive Tool Gateway Runtime (Phases 29-33) — SHIPPED 2026-05-04</summary>

- [x] Phase 29: Top-Level Tool Gateway MCP Tools (1/1 plans) — completed 2026-05-01
- [x] Phase 30: Memory-Aware Tool Selection (2/2 plans) — completed 2026-05-04
- [x] Phase 31: Memroos Tool Gateway Operations UI (1/1 plans) — completed 2026-05-04
- [x] Phase 32: Wire Python Tool Intelligence to Memroos UI (4/4 plans) — completed 2026-05-04
- [x] Phase 33: Gateway Hardening (1/1 plans) — completed 2026-05-04

Full archive: `.planning/milestones/v1.7-ROADMAP.md`

</details>

## Phase Details

### Phase 34: Universal REST API + Canonical Agent Registry
**Goal**: Any agent (A2A or otherwise) registers against a single canonical model and reports liveness, skills, memory, and tool outcomes through framework-agnostic REST endpoints — with zero hardcoded agents in source.
**Depends on**: v1.7 shipped (Phase 33)
**Requirements**: REST-01, REST-02, REST-03, REST-04, REST-05, REST-06, REG-00, REG-01, REG-02, REG-03
**Success Criteria** (what must be TRUE):
  1. A non-A2A client (e.g. `curl`) can register an agent, post a heartbeat, and the agent appears in the Memroos UI Agent Registry page
  2. The registry page lists every registered agent with capabilities, status, last heartbeat, and protocol type; the user can deregister from the UI
  3. All REST endpoints (`/api/heartbeat`, `/api/skills/report`, `/api/memory/add`, `/api/tool-attention/record`) reject requests with missing or invalid per-agent API keys
  4. Source contains zero hardcoded agent identifiers — the Flow page roster is sourced from the canonical registry DB
  5. A2A registration (Phase 35) and UI registration both write through the same canonical registry service (REG-00 contract verified by tests)
**Plans**: 3/3 complete
**UI hint**: yes

### Phase 35: A2A Protocol Implementation + Google ADK Support
**Goal**: Memroos speaks A2A v1 natively — exposes an agent card, accepts A2A task lifecycle calls, discovers and delegates to registered A2A agents, and a Google ADK agent appears in Flow after registering via A2A.
**Depends on**: Phase 34 (canonical registry must exist before A2A registration adapter)
**Requirements**: A2A-01, A2A-02, A2A-03, A2A-04, A2A-05, A2A-06, A2A-07, A2A-08
**Success Criteria** (what must be TRUE):
  1. `GET /.well-known/agent.json` returns a valid A2A agent card with name, description, capabilities, config-derived endpoint URLs, and security scheme
  2. A Google ADK agent registers via A2A and appears as a node in the Flow diagram with declared capabilities
  3. Memroos accepts `tasks/send`, `tasks/get`, and `tasks/cancel` calls (verified against the A2A v1 spec) and streams progress via SSE
  4. Memroos can list registered A2A agents via discovery and successfully delegate a task to one of them
  5. Unauthenticated and unauthorized A2A task requests are rejected per the security scheme declared in the agent card
  6. Memroos's A2A card, remote-agent registration, ADK fixture, and delegation client use config-derived base URLs/ports/network policy instead of hardcoded localhost assumptions
**Plans**: 4/4 complete
**UI hint**: yes

### Phase 36: LangGraph Orchestration Service (Python, Checkpoint + HIL)
**Goal**: A separate Python LangGraph service routes inbound tasks to registered agents by capability, persists checkpoints to its own SQLite DB, retries on failure, and surfaces human-in-the-loop approve/reject prompts in the Memroos UI.
**Depends on**: Phase 35 (A2A transport layer in place; LangGraph owns routing policy on top)
**Requirements**: ORCH-01, ORCH-02, ORCH-03, ORCH-04, ORCH-05, ORCH-06, ORCH-07
**Success Criteria** (what must be TRUE):
  1. A task sent to Memroos routes through LangGraph to a registered agent based on declared capability, and the chosen agent executes it
  2. LangGraph checkpoints persist to a dedicated `data/orchestration.db` (separate from Memroos's main SQLite DB) — verified by inspecting the file and confirming no cross-process lock contention
  3. A graph node configured for HIL pauses execution and shows a pending approve/reject decision in the Memroos UI; user approval resumes the graph from checkpoint
  4. A correlation ID generated at task ingress is attached at every hop (Memroos → LangGraph → agent A → agent B) and is queryable end-to-end
  5. A failing agent task is retried up to N times before surfacing as a failed HIL decision; the A2A adapter / LangGraph boundary contract (ORCH-07) is documented and respected by the implementation
**Plans**: 2/2 complete
**UI hint**: yes

### Phase 37: Unified Memory — mem0 Graph Layer + Neo4j
**Goal**: Memroos exposes one memory API covering all three tiers — vector (Qdrant Cloud), graph (Neo4j via mem0), episodic (SQLite) — with explicit routing rules and a health panel showing all tiers green.
**Depends on**: Phase 34 (`/api/memory/add` already framework-agnostic from REST baseline)
**Requirements**: MEM-01, MEM-02, MEM-03, MEM-04, MEM-05
**Success Criteria** (what must be TRUE):
  1. `POST /api/memory/add` with `type=graph` writes to Neo4j via mem0's graph layer; `type=vector` writes to Qdrant Cloud; `type=episodic` writes to SQLite
  2. `GET /api/memory/search` returns semantic-similarity hits from Qdrant Cloud
  3. `GET /api/memory/graph` returns entity and relationship results from Neo4j
  4. The memory health panel in Memroos UI shows status, document/node counts, and last write time for all three tiers (vector, graph, episodic) — all green when services are reachable
  5. Routing rules for which writes go to which tier are documented and validated by tests
**Plans**: 1/1 complete
**UI hint**: yes

### Phase 38: Operating Profiles + Docker Full-Stack
**Goal**: Every port, path, key, backend URL, public base URL, and service topology choice is env/profile-driven; the default profile works out-of-the-box, custom profiles are documented, and `docker-compose up` brings the full OSS stack (Memroos + Knowledge MCP + mem0 + Neo4j + Pipecat voice + LangGraph orchestration) to a healthy state with Qdrant configured via env to its cloud endpoint.
**Depends on**: Phase 37 (Neo4j must exist as a service to compose)
**Requirements**: INFRA-01, INFRA-02, INFRA-03, INFRA-04, PROFILE-01, PROFILE-02, PROFILE-03, PROFILE-04
**Success Criteria** (what must be TRUE):
  1. `.env.example` enumerates every port, path, API key, and backend URL used in source — a grep audit confirms zero hardcoded values
  2. `docker-compose up` on a clean machine brings all six services healthy (health endpoints reachable) with Qdrant reachable as a cloud endpoint, never a local container
  3. Pipecat voice service starts in compose using only `.env` values (Gemini API key, port, Memroos base URL)
  4. `setup.sh` validates Qdrant Cloud connectivity (URL + API key) at startup and fails with a clear actionable error when misconfigured
  5. Operators can select or customize `local-dev`, `single-host`, `private-network`, `cloud-https`, or `custom` install profiles without changing application source

**Plans**: 1/1 complete

### Phase 39: Developer Setup Experience
**Goal**: A new contributor can clone the repo on a fresh machine and reach a working Memroos with one registered agent through `setup.sh` plus a guided first-run wizard.
**Depends on**: Phase 38 (compose + env baseline must be in place)
**Requirements**: DEV-01, DEV-02, PROFILE-01, PROFILE-02, PROFILE-04
**Success Criteria** (what must be TRUE):
  1. `./setup.sh` on a fresh machine detects missing prereqs (Node, Python, Docker), scaffolds `.env` from `.env.example`, and starts all services without manual intervention
  2. The first-run wizard guides the user through entering required API keys, registering their first agent, and running an end-to-end health check that passes
  3. Setup presents the recommended default profile first, while allowing an operator to choose or customize topology-specific values for multi-machine use
**Plans**: 1/1 complete
**UI hint**: yes

### Phase 40: Documentation + Architecture Diagrams
**Goal**: A new OSS user can follow the README quickstart and have an agent connected to Memroos in under ten minutes; integration paths for every supported framework and the memory architecture are fully documented.
**Depends on**: Phase 39 (setup experience must be stable to be documented)
**Requirements**: DOCS-01, DOCS-02, DOCS-03, DOCS-04, DOCS-05, DOCS-06, DOCS-07, DOCS-08, PROFILE-02, PROFILE-03, PROFILE-04
**Success Criteria** (what must be TRUE):
  1. A new user following the README quickstart on a fresh machine has an agent connected to Memroos in under 10 minutes
  2. The architecture diagram covers the A2A hub, three memory tiers, LangGraph orchestration layer, and supported agent frameworks
  3. Per-framework integration guides exist for Claude Code (A2A), Google ADK (A2A), LangGraph (A2A + L↔L delegation), and CrewAI/AutoGen (REST shim)
  4. REST API reference documents every endpoint with auth and request/response examples
  5. Memory architecture guide explains the three tiers, routing rules, when to use each, and the Neo4j schema
  6. Documentation explains supported operating profiles, how to override defaults, and when to choose private-network versus HTTPS deployment
**Plans**: 1/1 complete

### Phase 41: OSS Polish
**Goal**: The repo is ready for public release — licensed, contributable, with security policy, issue templates, and a public CI that runs typecheck, lint, tests, and a Docker compose smoke on every PR.
**Depends on**: Phase 40 (docs land before public CI gates them)
**Requirements**: OSS-01, OSS-02, OSS-03, OSS-04, OSS-05
**Success Criteria** (what must be TRUE):
  1. Repo contains an MIT `LICENSE` file at root
  2. `CONTRIBUTING.md` covers setup, branch conventions, PR process, and coding standards
  3. `SECURITY.md` documents the security policy and responsible disclosure process
  4. GitHub bug-report and feature-request issue templates exist
  5. GitHub Actions CI runs typecheck, lint, unit/integration tests, and a Docker compose smoke test on every PR — all green on main
**Plans**: 2/2 complete

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|----------|---------------|--------|-----------|
| 1 | v1.1 | 1/1 | Complete | 2026-04-09 |
| 2 | v1.1 | 2/2 | Complete | 2026-04-10 |
| 3 | v1.1 | 1/1 | Complete | 2026-04-10 |
| 4 | v1.1 | 3/3 | Complete | 2026-04-10 |
| 5 | v1.1 | 5/5 | Complete | 2026-04-11 |
| 6 | v1.2 | 1/1 | Complete | 2026-04-12 |
| 7 | v1.2 | 1/1 | Complete | 2026-04-12 |
| 8 | v1.2 | 1/1 | Complete | 2026-04-13 |
| 9 | v1.2 | 2/2 | Complete | 2026-04-13 |
| 10 | v1.2 | 1/1 | Complete | 2026-04-12 |
| 11 | v1.2 | 1/1 | Complete | 2026-04-12 |
| 12 | v1.3 | 1/1 | Complete | 2026-04-14 |
| 13 | v1.3 | 1/1 | Complete | 2026-04-14 |
| 14 | v1.3 | 2/2 | Complete | 2026-04-14 |
| 15 | v1.3 | 1/1 | Complete | 2026-04-14 |
| 16 | v1.3 | 1/1 | Complete | 2026-04-14 |
| 17 | v1.3 | 2/2 | Complete | 2026-04-15 |
| 18 | v1.4 | 1/1 | Complete | 2026-04-15 |
| 19 | v1.5 | 3/3 | Complete | 2026-04-18 |
| 20 | v1.5 | 2/2 | Complete | 2026-04-17 |
| 21 | v1.5 | 2/2 | Complete | 2026-04-18 |
| 22 | v1.5 | 2/2 | Complete | 2026-04-18 |
| 23 | v1.5 | 2/2 | Complete | 2026-04-18 |
| 24 | v1.5 | 2/2 | Complete | 2026-04-18 |
| 25 | v1.5 | 2/2 | Complete | 2026-04-18 |
| 26 | v1.6 | 1/1 | Complete | 2026-04-30 |
| 27 | v1.6 | 1/1 | Complete | 2026-04-30 |
| 28 | v1.6 | 1/1 | Complete | 2026-04-30 |
| 29 | v1.7 | 1/1 | Complete | 2026-05-01 |
| 30 | v1.7 | 2/2 | Complete | 2026-05-04 |
| 31 | v1.7 | 1/1 | Complete | 2026-05-04 |
| 32 | v1.7 | 4/4 | Complete | 2026-05-04 |
| 33 | v1.7 | 1/1 | Complete | 2026-05-04 |
| 34 | v2.0 | 3/3 | Complete | 2026-05-05 |
| 35 | v2.0 | 4/4 | Complete | 2026-05-05 |
| 36 | v2.0 | 2/2 | Complete | 2026-05-05 |
| 37 | v2.0 | 1/1 | Complete | 2026-05-05 |
| 38 | v2.0 | 1/1 | Complete | 2026-05-05 |
| 39 | v2.0 | 1/1 | Complete | 2026-05-05 |
| 40 | v2.0 | 1/1 | Complete | 2026-05-05 |
| 41 | v2.0 | 2/2 | Complete | 2026-05-11 |
| 42 | v2.1 | external/1 | Complete | 2026-05-11 |
| 43 | v2.1 | local/1 | Complete | 2026-05-11 |
| 44 | v2.1 | 1/1 | Complete | 2026-05-11 |
| 45 | v2.1 | 1/1 | Complete | 2026-05-11 |
| 46 | v2.2 | 1/1 | Complete | 2026-05-11 |
| 47 | v2.2 | 1/1 | Complete | 2026-05-11 |
| 48 | v2.2 | 1/1 | Complete | 2026-05-11 |
| 49 | v2.2 | 1/1 | Complete | 2026-05-11 |
| 50 | v2.3 | 1/1 | Complete | 2026-05-11 |
| 51 | v2.3 | 1/1 | Complete | 2026-05-11 |
| 52 | v2.3 | 1/1 | Complete | 2026-05-11 |
| 53 | v2.4 | 1/1 | Complete | 2026-05-11 |
| 54 | v2.4 | 1/1 | Complete | 2026-05-11 |
| 55 | v2.4 repair | 1/1 | Complete | 2026-05-11 |
| 56 | review/qa | 1/1 | Complete | 2026-05-11 |

---

## v8.0 Belief + Provenance Core (Phases 120-123) — COMPLETE

The trust kernel of the governed memory store: provenance enforced at the read/tool boundary with a tamper-evident audit chain, and a governed bronze→silver→gold belief promotion pipeline with demotion and conflict handling. Absorbs prior Backlog items 9 (belief stages) and 18 (verifiable action provenance). ICP scenarios: S2, S3, S5, S8 (see Backlog deep-dive section).

- [x] **Phase 120: Provenance Capture + Transactional Audit** — PROV-01, PROV-02; completed 2026-07-06 (`agent-checkpoints.ts` boundary receipts + transactional audit; `agent-checkpoints.test.ts` green — see REQUIREMENTS.md PROV verification notes)
- [x] **Phase 121: Hash-Chained Audit + Crash-Consistent Verification** — PROV-03, PROV-04; completed 2026-07-06 (`verifyCheckpointAuditChain` first-broken-link detection; crash-resume provenance audit verified)
- [x] **Phase 122: Belief Promotion Pipeline** — BELIEF-01, BELIEF-02, BELIEF-03
- [x] **Phase 123: Gold-Only Outbound Policy + Promotion Evals** — BELIEF-04, BELIEF-05

### Phase 120: Provenance Capture + Transactional Audit
**Goal**: Every significant agent action carries a verified (not self-reported) set of consumed inputs, and its audit row commits atomically with the action.
**Depends on**: Phase 118 (recollection receipts), Phase 115 (migration runner)
**Requirements**: PROV-01, PROV-02
**Success Criteria** (what must be TRUE):
  1. Memory reads and tool calls are recorded at the boundary (source id + hash) into the action's provenance set; an agent cannot claim provenance for a memory it never read (regression test proves the self-reported path is gone)
  2. The audit entry for a significant action writes in the same SQLite transaction as the action; a forced mid-write crash leaves either both rows or neither (test-verified)
  3. The "audit must never break the primary action" contract is either preserved (documented degraded lane for non-significant actions) or explicitly redesigned with operator sign-off in the phase context doc
  4. Provenance receipts expose ids/hashes/labels only — no raw sensitive payloads (MEMSEC-08 leak cases extended to provenance surfaces)
**Plans**: 0/? planned
**UI hint**: no

### Phase 121: Hash-Chained Audit + Crash-Consistent Verification
**Goal**: Audit tampering, deletion, or gaps are detectable, and a crash/restart reconstructs a verifiable trail with no unaccounted actions.
**Depends on**: Phase 120
**Requirements**: PROV-03, PROV-04
**Success Criteria** (what must be TRUE):
  1. Each audit row references the prior row's hash; a verification command reports the first broken link on any edit/delete/gap (fixture-tested)
  2. After a simulated crash between checkpoint and completion, resume reconstructs the trail from checkpoint + chain with zero unaccounted actions
  3. Chain verification runs off the hot path (scheduled/on-demand), with p95 write-path overhead within a budget recorded in the phase plan
  4. Scenario S8 demo: for one agent output, an operator can produce the full consumed-memories/tools/policy trail end-to-end from the chain
**Plans**: 0/? planned
**UI hint**: yes (audit verification status surface)

### Phase 122: Belief Promotion Pipeline
**Goal**: Memories move bronze→silver→gold only through explicit checks (provenance, freshness, policy, conflict scan, dedupe); gold can be demoted with a visible reason; high-stakes categories require human review.
**Depends on**: Phase 120 (provenance present is a promotion precondition), Phase 118 (belief-stage receipts)
**Requirements**: BELIEF-01, BELIEF-02, BELIEF-03
**Success Criteria** (what must be TRUE):
  1. No silver→gold admission path exists that skips the check set; LLM judgment alone cannot promote (fail-closed, code-level gate like the shipped dispatch SQL gate)
  2. Promotion/demotion decisions emit auditable receipts with checks passed and evidence pointers; a contradicted or source-invalidated gold fact demotes to silver with a reason (S5 conflict demo passes)
  3. Pricing/willingness-to-pay, product-capability, legal/compliance, and personal-data claim categories route to a human review queue for gold admission; category list is config, unlisted sensitive labels fail closed
  4. Scenario S3 demo: a transcript-extracted claim enters silver, appears in the review queue, and only reaches gold after operator approval
**Plans**: 0/? planned
**UI hint**: yes (promotion review queue)

### Phase 123: Gold-Only Outbound Policy + Promotion Evals
**Goal**: Outbound-facing generation can be restricted to gold claims with silver caveats and bronze-as-citation-only, and evals prove unsupported claims never surface as operational truth.
**Depends on**: Phase 122
**Requirements**: BELIEF-04, BELIEF-05
**Success Criteria** (what must be TRUE):
  1. A policy flag restricts outreach-draft/CRM-writeback/publish paths to gold-only claims; silver usage renders an inline caveat; bronze appears only as cited evidence (S2 demo passes)
  2. Recall/promotion eval suite extends Phase 118 evals: unsupported candidate claims never injected as truth, contradicted gold demotes within one cycle, receipts show belief stage on every injected memory
  3. Eval suite runs in CI alongside the existing recall canary and fails on regression
**Plans**: 0/? planned
**UI hint**: yes

## v8.1 Enterprise Operator Control Plane (Phases 124-127) — PLANNED

Source: 2026-07-06 adversarial enterprise review (`content/research/memroos-enterprise-review-2026-07-06.md`). The governed-memory logic (v8.0, v8.2+) is necessary but not sufficient: the current per-laptop MCP launcher, single shared vault, per-user deletable audit logs, and git fallback fail the 10-100 person ICP on contact — MCP SPOF, git-fallback exfiltration vector, SOC2 tenancy collapse, broken Day-1 onboarding. Verdict adopted: ship-modified, two SKUs — **Free Solo** (local MCP + git fallback + per-machine discipline) and **Enterprise** (operator-only, per-tenant/per-user vaults, write-side enforcement, no git fallback). ICP scenarios: S9, S10; substrate for S1/S7.

- [x] **Phase 124: Operator Load Proof + SLO Gate** — ENTOPS-01
- [x] **Phase 125: Multi-Tenant Vaults + Central Tamper-Evident Audit** — ENTOPS-02, ENTOPS-03
- [ ] **Phase 126: Operator-Stub Distribution + Day-1 Onboarding** — ENTOPS-04, ENTOPS-05, ENTOPS-06
- [ ] **Phase 127: Write-Side Native-Memory Enforcement + Exit Tool** — ENTOPS-07, ENTOPS-08

### Phase 124: Operator Load Proof + SLO Gate
**Goal**: The hosted operator's capacity is proven, not assumed — a repeatable load harness gates all enterprise-readiness claims.
**Depends on**: Phase 113 (operator deploy baseline)
**Requirements**: ENTOPS-01
**Success Criteria** (what must be TRUE):
  1. A committed load-test harness simulates 100 agents at 1,000 knowledge writes/hour against a staging operator and produces a signed report (p95 `knowledge_write` < 500ms, error rate < 0.1%)
  2. The harness runs on demand and on a schedule; regressions fail visibly in CI/NOC
  3. Enterprise SKU/positioning claims are blocked by a check until the latest report is green (mirrors the future-spikes gate pattern)
**Plans**: 0/? planned
**UI hint**: no

### Phase 125: Multi-Tenant Vaults + Central Tamper-Evident Audit
**Goal**: Tenancy stops collapsing — per-tenant/per-user vault isolation with team ACLs, and all knowledge reads/writes audited centrally with identity, hash-chained, SIEM-exportable.
**Depends on**: Phase 124 (capacity proven), Phase 121 (PROV hash-chain pattern to reuse)
**Requirements**: ENTOPS-02, ENTOPS-03
**Success Criteria** (what must be TRUE):
  1. Two tenants and two users within a tenant demonstrably cannot read each other's vaults except through explicit ACL grants (regression-tested, fail-closed)
  2. "Show every artifact user X wrote in Q3" is one operator query; audit rows carry tenant/user/agent identity, are hash-chained, and are not deletable by the writing user
  3. Audit export to a SIEM-consumable format works end-to-end; the per-laptop JSONL becomes a local mirror, never the system of record in shared mode
  4. `--local` solo mode still works unchanged (Free Solo SKU preserved)
**Plans**: 0/? planned
**UI hint**: yes (tenant/vault admin surfaces)

### Phase 126: Operator-Stub Distribution + Day-1 Onboarding
**Goal**: The installer defaults to operator-stub mode with IdP auth, git fallback is disabled in shared mode, and a new hire's agents work on day one on a locked-down Mac without operator intervention.
**Depends on**: Phase 125
**Requirements**: ENTOPS-04, ENTOPS-05, ENTOPS-06
**Success Criteria** (what must be TRUE):
  1. `install-agent-integrations.sh` defaults to `MEMROOS_OPERATOR_URL` + OAuth device flow; `--local` is the explicit solo escape hatch; shared-mode stubs contain no git-clone fallback path (S10: on MCP outage, agents degrade honestly instead of pulling the corpus)
  2. S9 demo: invite token → MDM-deployable installer on a locked-down corporate Mac without admin rights → first-day verification script passes → the new hire's agents carry their team directives with zero human intervention
  3. Directive budgets are per-tenant config (default 200 lines, admin-overridable); enforcement warns and diffs against canonical — no auto-trim path exists anywhere
**Plans**: 0/? planned
**UI hint**: yes (onboarding + budget admin)

### Phase 127: Write-Side Native-Memory Enforcement + Exit Tool
**Goal**: Native memory files become an output of MemroOS sync rather than an input, and procurement-grade exit/DSAR tooling ships.
**Depends on**: Phase 126
**Requirements**: ENTOPS-07, ENTOPS-08
**Success Criteria** (what must be TRUE):
  1. Harness auto-memory writes (Claude auto-memory, Hermes `memory add`, Codex `/memory`) route to MemroOS first, are filtered/sanitized, and replay into local files under the server-enforced budget; `directive_diff` alerts on drift and never deletes
  2. Hermes MEMORY.md retains its skills-routing layer — only the directive body is stubbed (regression-tested against Hermes routing behavior)
  3. `memroos export --flat` produces a markdown tarball + signed manifest of the org vault; per-user DSAR export (vault + audit trail) works in one action; right-to-delete tombstones via MEMLIFE semantics without breaking the audit chain
**Plans**: 0/? planned
**UI hint**: yes

## v8.2 Team-Scale Access + Policy Plane (Phases 128-131) — PLANNED

One declarative policy engine with decision receipts replacing scattered gate logic, plus teams/spaces and human+agent identity lifecycle for the 100-person agentic-heavy ICP — running on the v8.1 multi-tenant substrate. ICP scenarios: S1, S4, S7 (access half).

- [ ] **Phase 128: Policy Engine Core + Decision Receipts** — POLGOV-01, POLGOV-02
- [ ] **Phase 129: Policy Dimensions, Shadow Mode + CI Regression** — POLGOV-03, POLGOV-04, POLGOV-05
- [ ] **Phase 130: Teams/Spaces + Knowledge-Repo Labels** — TEAMSCALE-01, MSIQ-01, MSIQ-02, MSIQ-03
- [ ] **Phase 131: Identity Lifecycle + Delegation Chains** — TEAMSCALE-02, TEAMSCALE-03, TEAMSCALE-04, TEAMSCALE-05, TEAMSCALE-06

### Phase 128: Policy Engine Core + Decision Receipts
**Goal**: Retrieval, memory write/promotion, knowledge read/write, skill dispatch, and capability decisions evaluate through one versioned declarative policy layer that emits receipts.
**Depends on**: Phase 76 (retrieval gate semantics to preserve), Phase 121 (receipts land in audit chain)
**Requirements**: POLGOV-01, POLGOV-02
**Success Criteria** (what must be TRUE):
  1. The MEMSEC retrieval gate, capability policy, and knowledge_policy_check evaluate through the shared engine with byte-identical decisions on the MEMSEC-08 regression corpus (no behavior change on migration)
  2. Policies are versioned files in git (MIT/OSS engine or in-repo — zero paid services); every decision receipt records policy version, rule matched, outcome, reason
  3. Agents receive deny reasons without the withheld content; receipts flow into evidence bundles and the audit chain
**Plans**: 0/? planned
**UI hint**: no

### Phase 129: Policy Dimensions, Shadow Mode + CI Regression
**Goal**: Policies express subject/object/action/purpose (including ontology labels and belief stage), proposed versions dry-run against live decisions before activation, and CI locks policy behavior.
**Depends on**: Phase 128
**Requirements**: POLGOV-03, POLGOV-04, POLGOV-05
**Success Criteria** (what must be TRUE):
  1. A policy like "GTM agents may read confidential Account claims for purpose=meeting-prep but not export them" is expressible and enforced end-to-end (S1 scoping demo)
  2. Shadow mode replays a proposed policy version against recent decisions and reports newly-denied/newly-allowed diffs; activation is operator-gated
  3. A committed decision-case corpus runs in CI; any policy change producing different outcomes fails unless the diff is explicitly approved in the change
**Plans**: 0/? planned
**UI hint**: yes (policy diff review)

### Phase 130: Teams/Spaces + Knowledge-Repo Labels
**Goal**: Memory and knowledge support team/space scoping over the shipped label model, and the git-backed knowledge repo carries enforced sensitivity/authoritative/freshness labels.
**Depends on**: Phase 128 (spaces enforce through the policy engine), Phase 125 (per-tenant vault substrate)
**Requirements**: TEAMSCALE-01, MSIQ-01, MSIQ-02, MSIQ-03
**Success Criteria** (what must be TRUE):
  1. A space (e.g. GTM) defines default labels, human+agent membership, and cross-space sharing rules; per-space recall shows zero cross-space leakage in regression tests
  2. knowledge_write validates frontmatter labels (sensitivity/authoritative/verified_at/expires_at) mirroring MEMSEC-02 vocabulary; knowledge_search/read enforce label-aware authorization with receipt-visible results; unlabeled docs stay default-open for single-operator installs
  3. Ranking boosts authoritative docs and demotes expired ones, with a scheduled expired/unverified flag job
**Plans**: 0/? planned
**UI hint**: yes (space membership + knowledge label surfaces)

### Phase 131: Identity Lifecycle + Delegation Chains
**Goal**: Joiner/mover/leaver flows provision and revoke humans and their dependent agents atomically, delegation chains are verifiable across A2A hops, relationship-sensitive assets carry named-owner gates, and per-team NOC views exist.
**Depends on**: Phase 130, Phase 126 (Day-1 onboarding flow), Phase 82 (auth), Phase 107 (context bus identity)
**Requirements**: TEAMSCALE-02, TEAMSCALE-03, TEAMSCALE-04, TEAMSCALE-05, TEAMSCALE-06
**Success Criteria** (what must be TRUE):
  1. S1 demo: one operator action onboards a fractional seller with role, space memberships, and a standard agent kit (scoped keys, allowed skills, context pack), producing an onboarding receipt of exactly what was granted
  2. S7 (access half) demo: offboarding revokes human and dependent-agent credentials atomically, reassigns owned artifacts, and opens a MEMLIFE review item; a scan proves zero orphaned agent identities with live keys
  3. An agent acting for a user carries a verifiable user→agent→sub-agent chain preserved across A2A hops; policy evaluates the weakest link
  4. S4 demo: agent use of an owner-gated relationship asset (investor graph) requires the named owner's standing or per-use approval, receipt-visible
  5. Per-team NOC views show memory growth, promotion queue depth, policy denials, skill usage, and agent activity
**Plans**: 0/? planned
**UI hint**: yes

## v8.3 Agent OS GSD Stack (Phases 132-136) — IN PROGRESS

Source: 2026-07-06 Mark Kashef full-channel transcript audit and prioritization (`content/research/mark-kashef-youtube-transcript-audit-2026-07-06.md`, `content/research/mark-kashef-agent-stack-prioritization-2026-07-06.md`). Decision: implement the stack through GSD as a MemRoOS-native control plane, not as a Hermes/OpenClaw replacement project. Hermes, Discord, Telegram, Codex, Claude Code, and future UIs are adapters. MemRoOS owns context, task state, proof, policy, skill contracts, evals, and routing receipts.

**Skill boundary rule:** bundle a capability as a skill only when it is a portable, repeatable procedure an agent should carry across runtimes. Embed it in MemRoOS when it requires product state, schema, API, policy, audit/proof receipts, or shared persistence.

- [x] **Phase 132: Agent Context Packet + Run Ledger** — GSDSTACK-01, GSDSTACK-02
- [x] **Phase 133: Shipcheck + Goal/Resume/Standup Commands** — GSDSTACK-03, GSDSTACK-04
- [ ] **Phase 134: Portable Skill Boundary + Skill Audit** — GSDSTACK-05, GSDSTACK-06, GSDSTACK-07
- [ ] **Phase 135: Lane Evals + Model Routing Policy** — GSDSTACK-08, GSDSTACK-09
- [ ] **Phase 136: Thin Interface Adapters + Safety Slice** — GSDSTACK-10, GSDSTACK-11

### Phase 132: Agent Context Packet + Run Ledger
**Goal**: Every agent receives the same compact, typed truth packet before acting, and every meaningful run event lands in a durable ledger.
**Depends on**: Phase 107 (Agent Context Bus), Phase 103/104 (checkpoint/resume + memory traces), Phase 120/121 (provenance/audit)
**Requirements**: GSDSTACK-01, GSDSTACK-02
**Status**: COMPLETE (2026-07-06). Implemented `AgentContextPacket` and run-ledger read model in `apps/memroos/src/lib/agent-context-packet.ts`, agent-authenticated `GET /api/agent-context`, and `scripts/show-agent-context-packet.mjs` debug CLI wrapper. The implementation federates hive delegations/actions, checkpoints, memory traces, efficiency events, audit entries, agent context messages, memory candidates, and handoff packs without exposing raw candidate content, message bodies, or trace candidate text.
**Success Criteria** (what must be TRUE):
  1. A typed agent context packet endpoint/tool returns active goal, project/repo/client, constraints, relevant gold/silver/bronze memories with provenance, required verification surface, approvals, forbidden actions, and resume marker
  2. Context packet assembly emits receipts for included, denied, skipped, and stale sources; no raw sensitive payloads leak into receipts
  3. A canonical run ledger records task, event, artifact, approval, cost, verification, and handoff rows or maps existing hive/checkpoint/evidence surfaces into one queryable view
  4. A deterministic smoke test proves a known goal produces the expected memory, constraint, verification requirement, and prior handoff
**Plans**: 1/1 complete (`.planning/phases/132-agent-os-gsd-control-plane/132-01-PLAN.md`)
**UI hint**: yes (debug packet + run ledger list)

### Phase 133: Shipcheck + Goal/Resume/Standup Commands
**Goal**: Agents cannot call work complete without a lane-appropriate proof receipt, and the daily control commands are backed by the ledger/context packet rather than chat history.
**Depends on**: Phase 132
**Requirements**: GSDSTACK-03, GSDSTACK-04
**Status**: COMPLETE (2026-07-06). Implemented `apps/memroos/src/lib/agent-gsd-control.ts` plus agent-key authenticated `POST /api/gsd/goal`, `POST /api/gsd/shipcheck`, `GET /api/gsd/resume`, and `GET /api/gsd/standup`. The implementation reuses hive delegations/actions, checkpoints, the Phase 132 context packet, and the run-ledger read model. `/shipcheck` blocks missing lane proof unless an explicit bypass reason is logged as a ledger receipt.
**Success Criteria** (what must be TRUE):
  1. `/shipcheck` evaluates lane-specific proof requirements for research, code, memory, deployment, email/doc, GTM, and safety tasks; "done" is blocked unless required proof exists or an explicit bypass reason is logged
  2. `/goal` creates or resumes a task with acceptance criteria, owner, lane, verification requirement, and policy constraints
  3. `/resume` reconstructs a working context packet and handoff state without asking the operator to restate background
  4. `/standup` reports active goals, blockers, recent proof, pending approvals, and next action from ledger data
**Plans**: 1/1 complete (`.planning/phases/133-shipcheck-goal-resume-standup/133-01-PLAN.md`)
**UI hint**: yes (command output cards + proof receipt links)

### Phase 134: Portable Skill Boundary + Skill Audit
**Goal**: Decide what becomes a portable skill versus MemRoOS product substrate, then audit the skill corpus for stale, duplicate, untested, overbroad, or unsafe skills.
**Depends on**: Phase 132 (run ledger), Phase 98 (skill distribution core), Phase 106 (SkillForge hardening), Phase 123 (gold-only outbound policy)
**Requirements**: GSDSTACK-05, GSDSTACK-06, GSDSTACK-07
**Success Criteria** (what must be TRUE):
  1. A skill-boundary manifest classifies candidate capabilities into `core_product`, `portable_skill`, `adapter_skill`, `reference_only`, or `defer`; classifications include rationale and owner
  2. Portable skills are limited to repeatable agent procedures: GSD roadmap operator, MemRoOS context consumer, shipcheck client wrapper, skill audit operator, bounded discuss/review council, and lane-specific research/code/handoff playbooks
  3. Core product features are explicitly barred from being shipped as skills-only: context packet schema, run ledger, proof gate, policy decisions, eval store, model-routing telemetry, audit chain, and adapter state
  4. `/skill-audit` reports missing owner, missing smoke test, stale review date, duplicate trigger, unsafe tool instructions, no examples, and no usage evidence; it drafts SkillForge proposals but does not auto-delete
**Plans**: 0/? planned
**UI hint**: yes (skill boundary table + audit findings)

### Phase 135: Lane Evals + Model Routing Policy
**Goal**: Prove the stack improves real agent lanes and make model choice explicit, logged, and cheap by default where safe.
**Depends on**: Phase 132, Phase 133, Phase 57/94 (eval substrate), Phase 46/47 (model routing telemetry)
**Requirements**: GSDSTACK-08, GSDSTACK-09
**Success Criteria** (what must be TRUE):
  1. Research, code, memory, handoff, GTM, and safety lanes each have committed fixtures, scoring rubrics, and CI/scheduled eval runs
  2. Evals record source coverage, proof compliance, recall provenance, handoff resumability, GTM claim grounding, and safety gate outcomes into the run ledger
  3. Static model-routing policy maps task classes to cheap/local, frontier, private/customer-bound, vision, and validator models with explicit override reason
  4. Routing receipts record model, reason, cost estimate/actual, latency, and result quality; the first adaptive routing review is based on observed outcomes, not vibes
**Plans**: 0/? planned
**UI hint**: yes (eval lane status + routing/cost report)

### Phase 136: Thin Interface Adapters + Safety Slice
**Goal**: Hermes/Discord/Telegram/Codex/Claude Code consume the same MemRoOS control plane without owning state, and adapter actions are guarded by the first safety slice.
**Depends on**: Phase 132, Phase 133, Phase 128/129 where available
**Requirements**: GSDSTACK-10, GSDSTACK-11
**Success Criteria** (what must be TRUE):
  1. Hermes, Discord/Telegram, Codex, and Claude Code adapters can create tasks, request context, post proof receipts, ask for standup/resume, and request approvals through the same API/tool contract
  2. Adapter contract tests prove no adapter owns memory, task state, proof state, policy state, or model routing decisions
  3. Secrets/PII scanner, destructive-action approval gate, and cost cap checks run before adapter-triggered sends/writes/destructive actions
  4. Adapter failure degrades honestly: no silent local git fallback in shared mode, no unlogged writes, and no "done" messages without proof receipts
**Plans**: 0/? planned
**UI hint**: no for MVP; later adapter health in NOC

---

## Backlog

### Next Milestone Priorities — Governed Memory OS Deep-Dive (revised 2026-07-06)

**North star:** the world's best *orchestrated, governed* memory store — memory any agent framework can plug into, where every fact has provenance and a belief stage, every access has a policy receipt, every skill has a trust chain, and the vocabulary (ontology) is governed rather than accidental.

**ICP anchor:** agentic-heavy companies scaling to ~100 people — Cordant.ai is the reference customer (`content/research/cordant-gtm-use-case-requirements-2026-07-06.md`). Design scenarios that each milestone must survive:

- **S1 — New fractional seller onboards day one**: human + standard agent kit provisioned in one action; scoped to the GTM space; sees approved segment knowledge and gold product claims, cannot see investor graphs or finance memory. (TEAMSCALE-01/02, POLGOV-03)
- **S2 — Agent drafts outreach with a product claim**: claim must be gold (operator-admitted), receipt shows which memory it came from and the policy that allowed it; silver claims carry caveats, bronze never leaves evidence citations. (BELIEF-01/04, PROV-01)
- **S3 — Meeting transcript lands**: extracted "willingness to pay $X" enters as silver; CRM/tracker writeback is human-reviewed until promotion checks pass; conflicting earlier claims get demoted with a reason. (BELIEF-01/02/03)
- **S4 — Investor warm-intro request**: any agent use of Eric's relationship graph requires named-owner approval, enforced by policy and visible in the receipt. (TEAMSCALE-06, POLGOV-02)
- **S5 — 40 agents share memory across GTM/product/ops**: an account's status changes; temporal conflict detection demotes the stale fact instead of letting two "truths" coexist; per-team NOC shows promotion queues and denials. (BELIEF-02, TEAMSCALE-05)
- **S6 — Marketplace/cross-harness skill import**: skill arrives signed, quarantined, sandbox-evaluated against its contract, and operator-approved before any agent can dispatch it. (SKILLTRUST-01..04)
- **S7 — Contractor offboards / prospect requests deletion**: credentials (human + dependent agents) revoked atomically; subject-scoped erasure chases embeddings, graph, FTS, and qmd projections, with an erasure report that doesn't break the audit chain. (TEAMSCALE-03, MEMLIFE-02/03/05)
- **S8 — Customer/sponsor-bank audit**: "prove what data your agents used for this claim" answered from enforced provenance + hash-chained audit, not agent self-report. (PROV-01..04)
- **S9 — Day-1 new hire on a locked-down Mac**: invite token → MDM installer → verification script; agents carry team directives with no admin rights and no operator intervention. (ENTOPS-05, ENTOPS-04)
- **S10 — Operator outage at 50 seats**: agents degrade honestly (no git-fallback corpus pull to laptops — that's an exfiltration path, not resilience); solo mode keeps git fallback. (ENTOPS-04)
- **S11 — Operator wants to run the Mark/Kashef-style stack**: any interface can trigger work, but context, task state, proof, skills, evals, model routing, and safety decisions come from MemRoOS; the same task resumes across Hermes/Codex/Claude without losing proof. (GSDSTACK-01..11)

**Enterprise review learning (2026-07-06)** — `content/research/memroos-enterprise-review-2026-07-06.md` (GPT-5.5xhigh + Claude adversarial consensus): the deployment substrate, not the governance logic, is the first enterprise blocker. Per-laptop MCP launcher = SPOF + 50 disconnected SQLite/audit files; single shared vault = SOC2 tenancy collapse; git fallback = CISO-dealbreaker exfiltration vector; line-cap auto-trim = silent data destruction; Day-1 onboarding broken without Luis. Adopted verdict: ship-modified, two SKUs (Free Solo local-MCP vs Enterprise operator-only). This inserted v8.1 Enterprise Operator Control Plane (`ENTOPS-01..08`) ahead of team-scale access and gates enterprise claims on a load-test SLO (100 agents, 1k writes/hr, p95 < 500ms, <0.1% errors).

Priority order (each is a candidate milestone; requirements in `.planning/REQUIREMENTS.md`):

1. **P0 — v8.0 Belief + Provenance Core — COMPLETE (Phases 120-123 complete 2026-07-06).** `BELIEF-01..05`, `PROV-01..04` complete (absorbs prior Backlog items 9 and 18). The trust kernel: governed silver→gold promotion with demotion/conflict handling, and provenance captured at the read/tool boundary with transactional, hash-chained audit. Everything else (policy receipts, ontology promotion, skill trust) builds on admitted truth + verifiable provenance. Scenarios: S2, S3, S5, S8.
2. **P0 — v8.1 Enterprise Operator Control Plane — PLANNED as Phases 124-127 (2026-07-06, from enterprise review).** `ENTOPS-01..08`. Load-proven hosted operator, per-tenant/per-user vaults with central hash-chained audit, operator-stub distribution (no git fallback in shared mode), Day-1 MDM/invite-token onboarding, write-side native-memory enforcement (never auto-trim), and exit/DSAR tooling. Two-SKU shape: Free Solo (local) vs Enterprise (operator-only). Parallelizable with v8.0 Phases 122-123 (different subsystems). Scenarios: S9, S10; substrate for S1/S7.
3. **P0 — v8.2 Team-Scale Access + Policy Plane — PLANNED as Phases 128-131 (2026-07-06).** `TEAMSCALE-01..06`, `POLGOV-01..05`, `MSIQ-01..03`. Spaces/teams over the shipped label model, joiner/mover/leaver for humans + agents, delegation chains, and one declarative policy engine with decision receipts, shadow mode, and CI policy regression; knowledge-repo labels (MSIQ-01..03) land here so memory and knowledge share one enforcement plane. Scenarios: S1, S4, S7 (access half).
4. **P0 — v8.3 Agent OS GSD Stack — PLANNED as Phases 132-136 (2026-07-06, from Mark Kashef transcript audit).** `GSDSTACK-01..11`. Context packet, run ledger, shipcheck, goal/resume/standup, portable skill boundary, skill audit, lane evals, model routing, thin adapters, and safety slice. This is the implementation spine that makes Hermes/Discord/Telegram/Codex/Claude replaceable interfaces over MemRoOS rather than competing OSes. Scenario: S11.
5. **P1 — v8.4 Governed Ontology Foundation** — `ONTO-01..06`, plus Knowledge Graph Intelligence (prior Backlog item 6) and the `MSIQ-06` GraphRAG spike output as extraction feeder. Answer to the ontology question: fixed upper ontology in git, namespaced domain packs (a GTM pack instantiates Cordant's Account/Contact/Complexity-Signal/Relationship-Path/Dossier/Meeting-Learning objects), emergent extracted types held at bronze/silver, SEAL-governed promotion with alias-based versioned migrations. Treat ontology like skills: emergent, evaluated, governed, versioned. Scenarios: S3, S5 (typing); unlocks per-type policy in POLGOV.
6. **P1 — v8.5 Skill Trust Chain** — `SKILLTRUST-01..05` (promotes the governed-skill-contracts and cross-harness auto-sync Later Ideas). Contracts, signing/provenance, quarantine lane, governed sync, lifecycle states. Scenario: S6.
7. **P1 — v8.6 Memory Lifecycle + Erasure** — `MEMLIFE-01..05`. Retention per type+label, verified derivative-chasing erasure, subject-scoped erasure plans, decay/consolidation into the raw vault, chain-safe tombstones. Scenario: S7 (data half). Pull forward if a client or regulatory commitment lands earlier.
8. **P1 — v8.7 Orchestration Evidence Depth** — Harness Control Plane + evidence governance (prior Backlog item 5), `MSIQ-04..05` (MAF memory adapter, capped federated retrieval planner), `ORCH-FOLLOWUP-01` multi-hop compensation. Task-level Plan-Execute-Verify timelines consuming the receipts produced by v8.0–v8.4.
9. **P2 — v8.8 Retrieval Quality + External Benchmark Proof** — LoCoMo/LongMemEval lanes (Phase 114 follow-on), embedding upgrade behind flags, LLM recall scoring (prior P2 item 12). Proof lane, not trust lane — sequenced after the governance core so benchmarks measure the governed path.
10. **P2/P3 — carried forward**: Evaluation + Safety Expansion (prior item 7), Meeting Ingestion Expansion (item 11), Integration Modernization (item 13), commercial/product expansion (item 15; the enterprise review adds the two-SKU decision and Free/Team/Enterprise pricing input — see review §10), deferred hardening sweep (item 16), service navigation/install profiles (item 17).

Standing gates (unchanged): zero paid services / MIT-OSS only; Qdrant stays cloud and canonical; no spike-to-adoption without Luis approval; no raw sensitive payloads in any receipt; fail-closed defaults everywhere.

### Future Milestone Priority (pre-2026-07-06 ordering — superseded by the section above; retained for traceability)

1. **P0 — Permissioned Memory Foundation — COMPLETED (Phases 74–78).** All MEMSEC-01..08 and CTX-FOLLOWUP-03 requirements shipped: label schema + raw vault, fail-closed classification cascade, retrieval authorization gate, safe index projections + envelope encryption, and leak-prevention regression tests. Retained for traceability.
   - Source notes: `.planning/notes/privacy-classification-policy-spike.md`, `.planning/notes/memory-security-storage-spike.md`.
   - Requirements: `CTX-FOLLOWUP-03` and `MEMSEC-01..08` in `.planning/REQUIREMENTS.md`.
   - Goal: make MemRoOS safe to trust with sensitive organizational memory before expanding recall power: raw evidence vault, fail-closed privacy/legal/finance/HR classification, retrieval authorization, safe indexes, envelope encryption, and leak-prevention regression tests.

2. **P0 — Context Source Reliability + Sink Health — COMPLETED (Phase 80).** CTX-FOLLOWUP-01..02, CRON-HEALTH-01..05, and UX-FOLLOWUP-03 shipped as the cron health registry + schedules console. Retained for traceability.
   - Requirements: `CTX-FOLLOWUP-01..02`, `CRON-HEALTH-01..05`, and `UX-FOLLOWUP-03` in `.planning/REQUIREMENTS.md`.
   - Goal: prove sources are ingested, indexed, fresh, replayable, and degraded honestly; recurring transcript/email/context sinks become observable jobs with heartbeat, caught-up status, warning/critical state, and pause/resume/stop controls.

3. **P0 — Cloud Offload + Local Footprint Reduction — COMPLETED (Phase 108).** CLOUDOFFLOAD-01..06 shipped as the operating-profile implementation (footprint inventory, `npm run check:local-footprint`, NOC footprint status, prune-safety classification). Turbovec limitation below remains in force. Retained for traceability.
   - Requirements: `CLOUDOFFLOAD-01..06` in `.planning/REQUIREMENTS.md`.
   - Goal: reduce local disk, RAM, and background-service pressure by inventorying permanent local stores versus rebuildable caches, then moving eligible heavy storage/indexing to cloud-managed services with encryption, retention, rollback, and local-cache caps.
   - Limitation/test: evaluate compressed local vector caches such as Turbovec only as future shadow indexes. Qdrant remains canonical; no Turbovec dependency, backend swap, or implementation work starts without Luis approval first. Any future test must pass memory recall evals with no recall/precision regression and prove materially lower hot-path p95 latency.

4. **P1 — Operations NOC Real-Data Wiring — COMPLETED (Phases 79, 117).** NOC-01..14 and OPS-AUDIT-01..04 shipped as live NOC + provenance wiring; Phase 117 added the efficiency telemetry layer. Retained for traceability.
   - Source note: `.planning/notes/operations-noc-real-data-requirements.md`.
   - Requirements: `NOC-01..NOC-14` and `OPS-AUDIT-01..04` in `.planning/REQUIREMENTS.md`.
   - Goal: replace mock home-screen panels with live operational data, explicit missing/degraded states, functional controls, date-windowed performance views, and the telemetry streams needed for efficiency signals.

5. **P1 — Plan Harness Control Plane + Evidence Governance.**
   - Research intake: `Code as Agent Harness` (arXiv:2605.18747, 2026-05-18) argues future agent systems need executable, inspectable, stateful, governed harnesses.
   - Requirements and candidates: Full Harness Control Plane, Universal evidence bundles, Shared harness state, Skill-contract evidence examples, Cross-harness skill auto-sync, Model gateway observability, Secret-scope health, Eval-pinned promotion commits, Agent lessons ledger, and `GSD-FOLLOWUP-01`.
   - Goal: expose task-level Plan-Execute-Verify timelines, sources/memories/tools/checks evidence, read/write sets, prompt/model routing metadata, secret-scope health, replay/rollback anchors, and governed skill imports before increasing autonomy.

6. **P1 — Plan Knowledge Graph Intelligence + Work Coordination.**
   - Research intake: Graphify (`safishamsi/graphify`) shows a practical query-first repo/docs/PDF/image knowledge graph with confidence-tagged edges, wiki/report exports, and commit/search hooks.
   - Research intake: Graphite-style stacked review patterns suggest agent work should move as small, ordered, independently reviewable changes with stack-aware risk and merge gates.
   - Requirements and candidates: Knowledge graph intelligence, PR/workflow graph risk, Stacked agent work units, and `ARCH-01..03`.
   - Goal: make repo/docs/PDF/image/transcript graphs explainable and confidence-tagged, then use graph communities and stacked work units to reduce merge and coordination risk.

7. **P1 — Plan Evaluation + Safety Expansion.**
   - Requirements and candidates: Full 50+ task behavioral W-lift golden set, Third-party eval adapter, `EVAL-FOLLOWUP-01`, `EVAL-API-FOLLOWUP-01..02`, `MEMGEN-FOLLOWUP-01`, `SEAL-FOLLOWUP-01..02`, and `AGENTGEN-FOLLOWUP-01`.
   - Goal: move beyond small held-out eval samples into broader behavioral coverage, provider-backed judges, safety eval packs, non-fixture memory-autogen validation, and governed SEAL/agent trajectory workflows.

8. **P1 — Future spike queue closeout completed.**
   - Requirements completed in Phase 119: `MEMGEN-FOLLOWUP-02`, `COCOINDEX-FOLLOWUP-01`, `FASTCONTEXT-FOLLOWUP-01`, `ADKA2A-FOLLOWUP-01`, `QDRANT-FOLLOWUP-01`, and `HYPEREXTRACT-FOLLOWUP-01`.
   - Result: bounded reports live under `.planning/spikes/` and are enforced by `npm run check:future-spikes`.
   - Gate: no dependency adoption, backend swap, hosted/private upload, production index path, Qdrant upgrade, runtime replacement, or default extraction behavior is approved. Any implementation is a new approval-gated phase.

9. **P1 — Add bronze/silver/gold memory belief stages to proactive recollection.**
   - Source signal: June 25 X post by Danial Hasan arguing that agent memory should separate raw source snapshots, candidate claims, and admitted operational truth so long-running agents know what they are allowed to believe.
   - Requirement: `RECOLLECT-07` in `.planning/REQUIREMENTS.md`.
   - Goal: make belief stage an explicit context-pack and receipt field: bronze = raw source evidence, silver = candidate claim, gold = admitted operational truth. Agents may rely on gold directly, must caveat silver, and may use bronze only as evidence unless promotion policy admits it.
   - Gate: no hidden LLM-only promotion, no silver-to-gold admission without provenance, policy, freshness, conflict, and dedupe checks, and no raw sensitive payload exposure in receipts. Success requires Phase 118 evals to prove unsupported candidate claims are not treated as operational truth.

10. **P1 — SkillForge: Governed Skill Optimization (v6.0).**
   - Research intake: GBrain's `skillify` meta-skill (11-item checklist, cross-modal eval gate, fail-improve loop, dream cycle); Microsoft SkillOpt's textual learning rate and bounded edit loop; Memroos's existing eval engine, SEAL governance, and skill registry.
   - Source notes: `.planning/notes/skillopt-skill-optimization-spike.md`, `~/github/knowledge/content/skill-optimization-v2/SKILL-OPTIMIZATION-RESEARCH.md`.
   - Requirements: `SKILLFORGE-01..06` in `.planning/REQUIREMENTS.md` (supersedes `SKILLOPT-FOLLOWUP-01`).
   - Goal: Build a Memroos-native governed skill optimization system (SkillForge) that leverages existing infrastructure. Phases 85-90: Foundation → Analysis → Proposal Generation → Evaluation → Governance → Integration. All skill changes go through SEAL proposal lifecycle with operator approval, non-regression gates, and safe runtime export.

11. **P2 — Plan Meeting Ingestion Expansion.**
   - Requirements and candidates: Recall.ai bridge for Zoom/Teams/Meet, multi-participant meeting bot, and voice meeting bot follow-ups.
   - Goal: extend beyond the Daily-only, listener-only v4.0 path while preserving consent, transcript attribution, source provenance, and memory-ingestion boundaries.

12. **P2 — Plan Semantic Recall + Embedding Quality Upgrade.**
   - Requirements and candidates: Voyage AI `voyage-4-large` embedding upgrade and LLM-powered recall scoring upgrade.
   - Goal: improve recall quality behind provider flags while preserving Ollama local as the default path and avoiding vendor lock-in or unreviewed embedding of sensitive content.

13. **P2 — Plan integration modernization: unified MCP + FastMCP v3.x + dependency drift.**
   - Source finding: current configs already register unified `memroos` MCP, but legacy `services/memory/mcp-mem0.py` and `mcp-mem0-wrapper.sh` still exist as a standalone mem0-only adapter and one capability manifest still advertises standalone-only memory tools.
   - Source finding: `services/knowledge-mcp` runs FastMCP 2.14.7 while PyPI latest is 3.3.1; v3 migration must move HTTP/path/stateless/auth options to the v3-compatible runtime API rather than doing a blind pin bump.
   - Source finding: `services/memory` uses `mem0ai` 0.1.118 while PyPI latest is 2.0.2; this is a separate memory-backend migration from the FastMCP upgrade.
   - Spike note: `.planning/notes/integration-modernization-spike.md`.
   - Requirements: `INT-FOLLOWUP-01..07` in `.planning/REQUIREMENTS.md`.
   - Goal: keep one canonical MemRoOS MCP connection, remove stale memory adapters, upgrade FastMCP and mem0ai deliberately, validate A2A/ADK and Next proxy boundaries against current specs, and stage SDK/toolchain majors before they become operational debt. Pull any integration task forward if it blocks P0 memory/security work.

14. **P2 — Plan Phase 70 follow-up topology closure.**
   - Source note: `.planning/phases/70-foundation-engine-core/deferred-items.md`.
   - Requirement: `ORCH-FOLLOWUP-01` in `.planning/REQUIREMENTS.md`.
   - Goal: close deferred LangGraph multi-hop topology and rollback-compensation gaps before claiming full multi-hop orchestration depth. Pull forward only if a live workflow needs multi-hop compensation.

15. **P3 — Plan commercial/product/backend expansion.**
   - Requirements: `PRODUCT-01..02`, `VERTICAL-01`, and `L3-FOLLOWUP-01..03`.
   - Goal: decide Eval Engine packaging, pricing/commercialization, second vertical, and live Salesforce/Zendesk/NetSuite/business-outcome adapters after the memory trust and evidence substrate is credible.

16. **P3 — Plan recent-deferred hardening sweep.**
   - Source notes: Phase 57-64 context/summary deferred sections plus `.planning/PROJECT.md` v5 candidates.
   - Requirements: remaining `AUTH-FOLLOWUP-01..03`, `AUDIT-FOLLOWUP-01..03`, `UX-FOLLOWUP-01..07`, and any deferred items not already pulled into P0-P2.
   - Goal: prevent recent deferred notes from living only in phase-local context by turning them into plan-ready backlog requirements.

17. **P1 — Plan service navigation and optional install profiles.**
   - Source request: 2026-05-26 operator feedback asked for a Services page/dropdown and for Docker to remain available as an installation mechanism for public users, while keeping Luis's own setup cloud-first and slim.
   - Requirements: `UX-FOLLOWUP-07` and `INSTALL-FOLLOWUP-01` in `.planning/REQUIREMENTS.md`.
   - Goal: make service health and ownership visible from the UI, then preserve Docker as an explicit optional test/demo path instead of letting local containers, images, or demo volumes become the default operator footprint.

18. **P1 — Plan Verifiable Action Provenance + Tamper-Evident Audit.**
   - Source signal: 2026-07-01 external developer question (Arden) on whether agent action "proof" — binding an output to the memories it consumed and tools it used — stays consistent and auditable across crashes/restarts. Current state does not enforce this: `provenancePointers` are agent-supplied and pass straight through (`apps/memroos/src/app/api/agent-checkpoints/route.ts`), and `writeAuditLog` is fire-and-forget and never throws (`apps/memroos/src/lib/audit.ts`), so rows can drop silently.
   - Related backlog: overlaps the P1 Harness Control Plane evidence-bundle work (item 5) and the "Universal evidence bundles" / "Audit/HIL hardening: hash chaining" Later Ideas; this item is the integrity/consistency slice of that surface.
   - Requirements: `PROV-01..04` in `.planning/REQUIREMENTS.md`.
   - Goal: move provenance from honor-system to enforced — capture consumed memories/tools at the read/tool-call boundary rather than self-report, write the audit entry in the same transaction as the action so they commit or fail atomically, and hash-chain audit entries so gaps or edits are detectable; on crash/restart the resumed checkpoint reconstructs a verifiable trail.
   - Gate: the availability contract that audit failures must not break the primary action must be preserved or explicitly redesigned; no heavy verification work on the hot path; no raw sensitive payloads exposed in provenance receipts.

19. **P1 — Microsoft IQ Competitive Adoption (free/OSS only).**
   - Research intake: Microsoft IQ pillar analysis (Work IQ, Fabric IQ, Foundry IQ, Web IQ) with adopt/label/complement/skip decisions, priorities, and success probabilities in `content/research/microsoft-iq-feature-adoption-analysis.md`; positioning comparison in `content/blog/memroos-vs-microsoft-iq.md`.
   - Requirements: `MSIQ-01..06` in `.planning/REQUIREMENTS.md`.
   - Goal: extend the shipped MEMSEC label/authorization model (Phases 74–78) from memory tiers to the git-backed knowledge repo (sensitivity/authoritative/freshness labels enforced at knowledge_write and knowledge_search/read), ship a MemroOS memory adapter for self-hosted Microsoft Agent Framework agents (their durable memory is a paid Foundry feature — the self-hosted segment is MemroOS's wedge), and add a capped federated retrieval planner across memory tiers + registered MCP sources.
   - Overlap: `MSIQ-06` (GraphRAG bounded spike) is research intake for Backlog item 6 (Knowledge Graph Intelligence), not a separate graph system.
   - Gate (operator directive 2026-07-05): zero paid services. MIT/OSS dependencies only (Microsoft Agent Framework, GraphRAG, Presidio); no Foundry-hosted agents/memory in any path; GraphRAG extraction via local models only, and it remains a bounded spike — no dependency adoption or production extraction without Luis approval. Work IQ and Web IQ replicas are explicitly skipped (integration notes only).

### Later Ideas

- [ ] HIL edit-and-continue semantics (modify task state before resuming graph)
- HIL timeout and escalation policies
- Multi-hop retry compensation and rollback
- Memory backend pluggability (beyond mem0 + Qdrant + Neo4j) — v3.0 concern
- Turbovec compressed-vector shadow-index evaluation for local footprint/hot-path recall — future-only; requires Luis approval before implementation or dependency adoption
- Memento, CocoIndex, FastContext, ADK/A2A, Qdrant Cloud 1.18, and Hyper-Extract bounded spikes were conducted in Phase 119. Adoption and production changes remain deferred until Luis explicitly approves a follow-on implementation.
- Bronze/silver/gold memory belief-stage gates — Phase 118 requirement; raw source snapshots, candidate claims, and admitted operational truth must remain distinct in recollection receipts so agents know what they are allowed to believe
- Voice meeting bot (Pipecat as meeting participant)
- Recall.ai bridge for Zoom/Teams/Meet meeting bot support beyond the Daily-only v4.0 path
- Multi-participant meeting bot: move beyond listener-only recording into participant-aware meeting capture and consent behavior
- Flow trigger button (`qmd update` from UI)
- Services page or app-shell dropdown for dependency health, install mode, cloud/local ownership, and service owner actions
- Optional Docker installer/profile that public users can choose for local testing without forcing Docker onto cloud-first operators
- Library freshness indicator (QMD index recency vs file mtime)
- LLM-powered recall scoring upgrade (embedding over BM25)
- Voyage AI `voyage-4-large` embedding upgrade behind the existing embedding-provider flag, preserving Ollama local as the default path
- Cross-project recall (similar-task recommendations across repos)
- Operations NOC real-data contract: replace sample `noc-mock-data` panels with live data, source provenance, honest empty/degraded states, and tests that fail on production mock imports
- Operations NOC efficiency telemetry: track retrieval calls before useful work, source re-reads, raw-context ingest share, operator re-ask redundancy, and rediscovered-fact rate
- Operations NOC engagement binding: wire home-screen agent selection and directives to canonical registry plus real chat/dispatch APIs
- Memory inventory clarity: shipped in Phase 83 with split category counts, source-of-truth tooltips, provenance rows, category filters, and degraded backend-count states
- Phase 70 topology follow-up: add rollback compensation as a LangGraph node, multi-hop graph iteration, per-hop retry counters, and A2A compensation dispatch
- Agentic stack architecture coverage: document and expose health for goal, orchestration, agents, tools, memory, monitoring, reliability/failure, and governance/security layers
- Harness Control Plane: task-level Plan-Execute-Verify timeline showing context assembled, tools exposed, permissions granted, actions taken, verification run, and memory updated
- Universal evidence bundles on agent outputs: sources used, memories consumed, tools/commands run, checks passed, unverified assumptions, residual risks, and rollback/replay artifacts
- Shared harness state substrate: authoritative task state with read/write sets, assumptions, version dependencies, verifier obligations, conflict policy, and belief-drift detection for stale context
- Governed skill contracts: each promoted skill carries preconditions, allowed tools, risk tier, verification checks, evidence examples, owner, rollback behavior, and dispatch status
- Cross-harness skill auto-sync from agent directories, with governed import contracts instead of manual-only v4.0 skill import
- Evolution Agent: telemetry-driven proposals for harness improvements such as context packing, tool schemas, validators, retry limits, permission gates, and workflow topology, promoted only after regression evidence
- Knowledge Graph Intelligence: Graphify-style graph reports for code, docs, PDFs, diagrams, and transcripts with `EXTRACTED`/`INFERRED`/`AMBIGUOUS` confidence tags, god-node detection, surprising connections, query/path/explain commands, wiki export, and freshness hooks
- PR and workflow graph risk: use graph communities and dependency paths to show likely merge conflicts, impacted concepts, stale graph regions, and cross-agent coordination risk before dispatch or review
- Stacked agent work units: break large agent tasks into ordered, dependent, independently reviewable slices with stack-aware verification, promotion gates, and rollback invalidation when an earlier slice fails
- Model gateway observability: integrate LiteLLM as the first optional `ModelGatewayAdapter`, while retaining direct-provider fallback; record provider/model route, prompt/template version, cache hit/miss, fallback path, token/cost budget, latency, and denial reason for every LLM call in the task evidence bundle
- Secret-scope health: verify agent runtime secrets are folder/project scoped, loaded from an approved secret manager path, and never persisted in plain `.env` or audit artifacts
- Memory security raw vault: preserve original agentic conversations as compressed, encrypted, append-only evidence artifacts while keeping SQLite focused on metadata and replay pointers
- Memory security retrieval gate: apply labels, RBAC/capabilities, tenant/project scope, purpose, and source freshness checks before memory recall, context assembly, exports, derived indexing, or agent dispatch
- Memory security safe indexes: keep legal, finance, HR, credential, payment, privileged, confidential, and public-promotion content out of FTS/vector/graph/qmd projections unless redacted and approved
- Full 50+ task behavioral W-lift golden set to replace the v4.0 held-out sample with broader behavioral evaluation coverage
- Eval-pinned promotion commits: when an eval suite passes, capture model version, prompt/harness version, pass rate, dataset seed, and commit/release pointer for incident-grade rollback
- Agent lessons ledger: maintain a repo-level `lessons.md`/lessons table for weird behavior, edge cases, config changes, incident notes, and promoted skills, then surface it in context packs and graph freshness checks
- Third-party eval adapter: evaluate whether Inspect-style eval packs should plug into the existing eval engine for safety behaviors such as deception, tool misuse, manipulation, and policy-boundary violations
- Eval Engine product packaging: decide bundled vs separate eval/self-improvement product surface, pricing axis, trace-ingestion contract, judge-model cost ownership, golden-set marketplace strategy, compliance floor, and competitive framing
- Second vertical: after finance reconciliation has live customer proof, choose healthcare, legal, or ops/logistics as the next adapter + golden-set + UI terminology vertical
- Context-source follow-up coverage: extend source contracts to all operator source families, including Drive and Slack, and expose memory queue/retry/degradation plus source-to-QMD indexing proof in health/evals
- Integration modernization: retire the standalone mem0-only MCP adapter, route agents through unified `memroos` MCP, migrate FastMCP 2.x to v3.x, migrate mem0ai 0.1.x to 2.x, validate A2A/ADK and Next proxy conventions, patch-sweep Pipecat/Daily and LangGraph/checkpointer, and stage jose/shadcn/ESLint/TypeScript majors
- Eval engine operationalization: provider-backed judge invocation, judge re-baselining, version/cost capture, OpenInference/OpenTelemetry ingestion, bulk traces, webhooks, streaming results, metering, tenant key UI, and verified quickstart docs
- Memory autogen live validation: convert retro-documented memory-autogen behavior into an explicit contract with non-fixture mem0/graph/vector evals and replay evidence
- Coding-agent continuity capture: replace AgentMemory-style local capture with MemRoOS-native adapters and handoff packs for Codex, Claude Code, Hermes/OpenClaw, OpenCode, Gemini/Qwen CLI, and similar runtimes, including raw trace vaulting, governed durable-memory promotion, decision-intent extraction, per-agent capture health, duplicate suppression, and cross-agent resume evals
- SEAL proposal lifecycle hardening: governed auto-apply, bulk review, expiry/GC, tenant isolation, proposal-type plugin model, and file-system snapshot/restore for skill mutations
- Agent autogen trajectory workflow: trace capture to human annotation, max trajectory step caps, and audit events for W-preset changes
- Business outcome live adapters: Salesforce, Zendesk, NetSuite, inbound webhooks, correlation-ID automation, per-company golden sets, W-threshold alerts, and SLA/TTR targets
- Team/auth hardening: email invitations, password reset, email verification/change, OAuth/SSO, role-aware navigation gating, tenant settings, API-key rotation, and legacy audit actor migration
- Audit/HIL hardening: hash chaining, retention/archival policy, escalation notifications, bulk resolution, audit FTS, and tenant-scoped audit access
- Operator UX v5 surfaces: ClaudeClaw-style chat tab, unified memory search, schedules/routines console, Hivemind graph view, Paperclip system completion, and Flow canvas redesign
- GSD backlog hygiene: milestone close must promote or explicitly close every deferred item, context question, scope trim, and retro-documented gap
- Phase/UI parity gate: reconcile phase claims against operator-visible surfaces, wire Phase 70 HIL edit UI, replace or honestly label mock NOC panels, and require an explicit UI/API-only/follow-up decision at phase close

Run `$gsd-new-milestone` to start the next milestone workflow.

---

## v3.0 Compliance Platform + Finance Vertical (Phases 63-68)

Compliance infrastructure done right once, with bank transaction reconciliation as the reference vertical. CoVe ships as a callable reliability module across all agent runtimes. Security boundary hardening closes the May 2026 review gaps before the platform is treated as production-ready.

- [x] **Phase 63**: Rename + Team Auth — Memroos → Memroos rename, RBAC (admin/operator/reviewer), multi-user JWT auth, team invitation
- [x] **Phase 64**: Immutable Audit + HIL Escalation — append-only audit log, every agent/eval/seal decision logged, escalation queue with SLA, CSV/JSON export
- [x] **Phase 65**: Finance Reconciliation Vertical — bank transaction adapter, reconciliation golden sets, finance UI terminology, FIN-01..03
- [x] **Phase 66**: Self-hosted Hardening + Compliance Posture — full Docker compose, data residency mode, local judge model support (Ollama/vLLM), admin controls
- [x] **Phase 67**: CoVe Integration — Chain-of-Verification as callable agent runtime module + registered eval scorer, works on any LLM endpoint, COVE-01..03
- [x] **Phase 68**: Security Boundary Hardening — operator-only onboarding invites, route-local dispatch auth, strict capability defaults, prompt-injection scanner coverage, CSP/security headers, auth throttling, A2A private-network defaults, SECBOUND-01..08
- [x] **Phase 69**: Context Source Contracts + Runtime Resilience — declarative source contracts, context health UI/API, stale-source safe-answer gates, generated runtime service installers, and degradation eval/UAT coverage, CTX-01..08

### Phase 63: Rename + Team Auth
**Goal**: Memroos is renamed to Memroos throughout, and the platform supports multiple authenticated users with role-based access (admin/operator/reviewer).
**Depends on**: Phase 62 tenant foundation
**Requirements**: RENAME-01, TEAM-01, TEAM-02, TEAM-03
**Success Criteria**:
1. All references to "Memroos" replaced with "Memroos" in codebase, UI, docs, package names, and config files
2. Three roles enforced: admin sees everything + user management; operator can run agents, approve SEAL proposals, trigger evals; reviewer is read-only on audit + escalations
3. JWT-based login with per-user API keys; team invitation via email or invite link
**UI hint**: yes

### Phase 64: Immutable Audit + HIL Escalation
**Goal**: Every agent decision, SEAL proposal action, and eval run is appended to an immutable log with actor/timestamp/reason. HIL escalations surface in a team-visible queue with SLA countdown.
**Depends on**: Phase 63 (needs user identity for actor field)
**Requirements**: AUDIT-01, AUDIT-02, AUDIT-03, AUDIT-04
**Success Criteria**:
1. `audit_entries` table is append-only — no UPDATE/DELETE paths exist in code; schema enforced
2. Every agent match/flag/escalate decision, SEAL apply/rollback, and eval run writes an audit entry
3. Audit log queryable by agent, time range, decision type, actor — results in under 200ms on 1M rows
4. CSV and JSON export of any audit query works end-to-end
5. Open HIL escalations appear in team queue with configurable SLA; overdue items flagged red
**UI hint**: yes

### Phase 65: Finance Reconciliation Vertical
**Goal**: Bank transaction reconciliation governance runs on Memroos — transaction events feed the L3 scorer, reconciliation-specific golden sets power evals, and the UI speaks finance terminology.
**Depends on**: Phase 61 (L3 adapter pattern), Phase 64 (audit trail for every reconciliation decision)
**Requirements**: FIN-01, FIN-02, FIN-03
**Success Criteria**:
1. Transaction adapter ingests bank transaction events (CSV or webhook), maps to correlation_id, persists to `business_outcome_events`
2. Reconciliation golden sets ship with match/mismatch/escalation examples; drift guard validates at 0.85 agreement
3. UI terminology is configurable — "transaction", "reconciliation", "exception" labels replace generic "trace", "eval", "proposal" labels when finance mode is enabled
4. End-to-end demo: agent processes 100 mock transactions, audit log captures all decisions, escalations appear in HIL queue
**UI hint**: yes

### Phase 66: Self-hosted Hardening + Compliance Posture
**Goal**: Memroos runs fully self-hosted with zero external data egress in data-residency mode; the judge model is configurable to a local Ollama/vLLM endpoint; admin controls are production-ready.
**Depends on**: Phase 63 (auth), Phase 64 (audit)
**Requirements**: INFRA-01, INFRA-02
**Success Criteria**:
1. `docker compose up` brings up full stack: Memroos app, mem0, Qdrant, Neo4j, SQLite — no external services required
2. Data residency mode: when enabled, all LLM calls route to configured local endpoint; no calls to external APIs
3. Ollama and vLLM endpoints work as drop-in judge model replacements with identical W output
4. Admin panel: user management, API key rotation, audit log retention policy, adapter enable/disable
**UI hint**: yes

### Phase 67: CoVe Integration
**Goal**: Chain-of-Verification ships as a callable 4-step pipeline in the agent runtime (draft → verification questions → independent fact-checks → revised answer) and as a registered eval scorer that measures hallucination reduction vs baseline.
**Depends on**: Phase 57 (eval scorer registry), Phase 63 (Memroos rename complete)
**Requirements**: COVE-01, COVE-02, COVE-03
**Success Criteria**:
1. `cove(agentFn, config)` wrapper is callable from any agent; executes 4 steps as sequential LLM calls; returns revised answer + verification trace
2. CoVe registered as eval scorer: scores a CoVe-enhanced trace against the baseline trace on the same input; returns hallucination delta
3. Works on Claude API, Hermes via Ollama endpoint, and any OpenAI-compatible endpoint — no model-specific code paths
4. Config: `cove.enabled`, `cove.max_verification_questions`, `cove.parallel_verification` (batch calls), `cove.judge_endpoint`
5. Demo: same prompt run with and without CoVe shows measurable W improvement on a factual golden set
**UI hint**: yes

### Phase 68: Security Boundary Hardening
**Goal**: Close the May 2026 security review gaps by making sensitive route authorization explicit at the handler layer, hardening prompt/content scanning against bypasses, and adding production web-security guardrails.
**Depends on**: Phase 63 (RBAC user identity), Phase 64 (immutable audit log)
**Requirements**: SECBOUND-01, SECBOUND-02, SECBOUND-03, SECBOUND-04, SECBOUND-05, SECBOUND-06, SECBOUND-07, SECBOUND-08
**Source findings**:
1. `/api/onboarding/invite` currently mints signed onboarding tokens without route-local operator/admin authorization, and the proxy operator route list does not cover it.
2. `/api/dispatch` relies on proxy auth while using client-supplied `from_agent` for policy/audit decisions.
3. `scanContent()` allows payloads over the scanner limit without scanning, creating a long-input prompt-injection bypass.
4. Iris prompt-injection coverage is regex-only and currently wired to only part of the free-text task ingress surface.
5. `allowLegacyWhenUndeclared()` permits undeclared capabilities across dispatch, A2A, and memory paths.
6. The checked app surface lacks visible global CSP/security headers and login-specific abuse throttling.
7. A2A remote-card private-network fetches default permissive outside explicit deployment-profile policy.
**Success Criteria**:
1. `/api/onboarding/invite` requires operator-or-admin authorization at the route handler and is listed in proxy operator routes; reviewer tokens cannot mint onboarding invites or grant agent capabilities.
2. `/api/dispatch` requires route-local operator or authenticated-agent authorization; `from_agent` is derived from authenticated identity instead of blindly trusting the request body.
3. Legacy undeclared capability allow mode is disabled for production and non-local profiles; missing dispatch, A2A send, or memory-write capability produces `POLICY_DENIED` plus audit evidence.
4. Iris/content scanning runs on every agent-facing free-text task ingress (`dispatch`, A2A, hive delegation/action, orchestration where applicable) with consistent blocked/flagged audit events.
5. Long scanner input cannot bypass checks: payloads are chunk-scanned or rejected fail-closed above configured limits, with tests covering payloads over 4096 characters.
6. Security headers are configured for app responses: CSP, frame-ancestors/X-Frame-Options, X-Content-Type-Options, Referrer-Policy, and Permissions-Policy.
7. Login and refresh endpoints have rate limiting or lockout telemetry separate from public trace API throttling.
8. A2A remote-card private-network fetch policy defaults to deny outside explicit local-dev/private-network profiles; metadata and link-local addresses remain always blocked.
**UI hint**: no

## v3.1 Context Reliability + Runtime Resilience (Phase 69)

The May 2026 dogfood incidents showed that Memroos needs to treat external
context lanes as product-owned middleware, not invisible local machine state.
Phase 69 turns Gmail, Spark, qmd, mem0, and future sources into explicit source
contracts with health, freshness, indexing proof, safe-answer behavior, and
recurring degradation evals.

### Phase 69: Context Source Contracts + Runtime Resilience
**Goal**: Every enabled context source declares how it is ingested, indexed, monitored, alerted, and safely used; operators can see source health in the UI and agents fail closed when source-backed context is stale or missing.
**Depends on**: Phase 37 (memory tiers), Phase 39 (setup), Phase 40 (docs), Phase 68 (security boundary patterns)
**Requirements**: CTX-01, CTX-02, CTX-03, CTX-04, CTX-05, CTX-06, CTX-07, CTX-08
**Source findings**:
1. Gmail ingestion was scheduled but silently failed after a missing virtualenv path.
2. Spark had the transcript but indexing lag, blank attendees, and project misclassification hid it from Cordant context.
3. qmd collections and MCP services are operationally central but largely local machine state.
4. mem0 can preserve queued writes while semantic recall is stale unless queue status is surfaced.
5. Meeting minutes and source-backed artifacts must not be reconstructed from adjacent decks when the transcript/source lane is stale.
6. launchd/cron service definitions need generated install/status/uninstall flows instead of hardcoded local paths.
**Success Criteria**:
1. `context-sources.config.json` or equivalent declares source id, type, required tools/env, source path, ingest/index commands, freshness threshold, qmd collection, and safe-answer policy.
2. `/api/context/health` returns per-source `ok|stale|missing|degraded|disabled` with last run, age, doc count, index marker, and repair hint.
3. Operator UI shows Gmail, Spark, qmd, mem0, and local-folder source health with freshness and searchability evidence.
4. Source-backed tasks check required source contracts and return `SOURCE_STALE` or `SOURCE_MISSING` instead of hallucinating or reconstructing from unrelated material.
5. Runtime service installer generates path-correct launchd jobs for supported macOS services and exposes `install`, `status`, `uninstall`, and `check`.
6. Generated services read env files or keychain-compatible env sources; no secrets are embedded in committed plist templates.
7. `npm run eval:context-sources` or the expanded degradation suite covers memory queue backlog, qmd stale/down, Gmail runner failure, Spark source unindexed/misclassified, and stale-source safe-answer behavior.
8. Docs include a troubleshooting page for proving a source is ingested, indexed, searchable, and safe to use.
**UI hint**: yes


## v4.0 Orchestration Depth + Intelligence Uplift (Phases 70-73)

Depth-over-breadth milestone. Extends existing LangGraph/Pipecat/mem0 substrate
with smarter HIL semantics, multi-hop resilience, LLM-powered recall, voice
meeting participation, memory/recall pluggability, and the true behavioral
W-lift gap closed in SEAL. The market-facing shape is intentionally narrower:
shared organizational memory, governed orchestration, evidence/provenance, and
interop across agent frameworks. Build order is fixed by two Phase 70
pre-conditions (WAL pragma on `orchestration.db`, `MemoryAdapter` interface)
that unblock all downstream features.

- [x] **Phase 70: Foundation + Engine Core** — WAL fix + HIL edit-and-continue + multi-hop retry/rollback + memory adapter interface (completed 2026-05-21)
- [x] **Phase 71: Recall + HIL SLA + Voice** — LLM semantic recall + SLA escalation timers + Daily.co meeting bot as a governed memory-ingestion channel (completed 2026-05-21)
- [x] **Phase 72: Cross-Project Recall + Behavioral W-lift + UI + Skills** — cross-project recall, true behavioral W-lift, flow trigger/freshness UI, cross-harness skills registry, evidence bundles, governed skill contracts (completed 2026-05-21)
- [x] **Phase 73: Operator UI Truth + Phase Parity** — HIL edit UI wired into visible approvals, NOC telemetry truth corrected, and phase-close UI representation gate added (completed 2026-05-21)

### Phase 70: Foundation + Engine Core
**Goal**: Operators can edit a paused orchestration task's state before resuming, multi-agent chains recover from mid-chain failure via per-hop retry and declarative rollback, and memory backends are swappable behind a stable adapter interface.
**Depends on**: Phase 69 (v3.1 shipped — stable orchestration + memory baseline)
**Requirements**: HIL-01, HIL-02, HIL-03, ORCH-08, ORCH-09, ORCH-10, MEM-06, MEM-07, MEM-08
**Prerequisite tasks (in-phase, not separate phases)**:
  - Add `PRAGMA journal_mode=WAL` + `busy_timeout=5000` to `OrchestrationStore.__init__` on `orchestration.db` before any HIL-edit/resume work (concurrent edit+resume stalls under rollback journal otherwise)
  - Ship the `MemoryAdapter` interface + registry in this phase — it is the hard dependency that unblocks Phase 71 recall features
  - Pin `langgraph>=1.2,<2.0` in `services/orchestration/requirements.txt`
**Success Criteria** (what must be TRUE):
  1. An operator opens a paused HIL task, edits declared `OrchestrationState` fields via a dedicated edit UI, the edit is schema-validated before acceptance, and the graph resumes from the edited state (rejected via `as_node="route_policy"`, not `as_node="approval"`)
  2. The audit log records who edited a HIL task, which fields changed, and before/after values for every accepted edit
  3. A multi-agent chain that fails at hop N retries that hop within its configured `RetryPolicy` budget, then runs declarative compensating actions (stored as `orchestration_lineage` rows, never Python closures) for hops 1..N-1
  4. The A2A task status for a failed chain reads granularly: "failed at hop N, compensated hops 1..N-1"
  5. mem0/Qdrant/Neo4j are wrapped as concrete `MemoryAdapter`s exposing only `search()`/`write()`/`health()`; a new backend registers via the registry without modifying existing adapter code
**Research flag**: yes — `--research-phase` when planning (ORCH-08..10 saga compensation requires auditing all existing A2A chains for which need compensating actions retrofitted)
**Plans**: 5 plans
Plans:
- [x] 70-01-PLAN.md — Foundation prerequisites: WAL pragma + langgraph pin + Wave 0 RED test scaffolds
- [x] 70-02-PLAN.md — HIL edit-and-continue: Python orchestration service (edit endpoint + audit)
- [x] 70-03-PLAN.md — Multi-hop retry + declarative rollback: Python orchestration service
- [x] 70-04-PLAN.md — MemoryAdapter interface + registry + concrete shim adapters (TypeScript)
- [x] 70-05-PLAN.md — HIL edit-and-continue: TypeScript route, client, and edit UI
**UI hint**: yes

### Phase 71: Recall + HIL SLA + Voice
**Goal**: Recall results can be ranked semantically via local embeddings, expired HIL tasks auto-escalate on SLA deadlines with a live countdown dashboard, and a voice bot joins Daily.co meetings as a listener writing per-speaker transcripts. Voice is an ingestion channel for organizational memory, not a standalone product pillar.
**Depends on**: Phase 70 (stable orchestration engine + `MemoryAdapter` interface; all three feature groups parallelizable once Phase 70 lands)
**Requirements**: RECALL-01, RECALL-02, HIL-04, HIL-05, HIL-06, VOICE-06, VOICE-07, VOICE-08
**Prerequisite tasks**:
  - Upgrade `services/voice-server/requirements.txt` to `pipecat-ai[daily]>=1.2,<2.0`
  - Embeddings via Ollama `nomic-embed-text` (local, already in stack — NOT Voyage AI, NOT Anthropic); gate behind `MEMROOS_EMBEDDING_PROVIDER` env flag
  - New `message_embeddings` table in `conversations.db` (TS side); Qdrant remains exclusively for mem0
**Success Criteria** (what must be TRUE):
  1. `GET /api/recall` accepts `mode=semantic|bm25|hybrid`; hybrid fuses Ollama `nomic-embed-text` + BM25 via RRF; BM25 stays the default; an embedding outage returns `degraded: true` instead of failing
  2. A background job precomputes embeddings at ingest (50 messages/cycle, 5-min interval) into `message_embeddings`
  3. Each HIL interrupt type has a configurable SLA deadline stored as an ISO timestamp; a Next.js `instrumentation.ts` scheduler polls expired HIL tasks every 60s and triggers notify/auto-resolve/abandon
  4. The dashboard shows pending HIL items with live countdown timers and SLA traffic-light status
  5. A Pipecat meeting bot joins a Daily.co room via `DailyTransport`, writes per-speaker transcripts to the `messages` table and highlights to `hive_actions`; meeting URL/join tokens are never written to `audit_log` and a recording-consent UI is shown before joining
**Research flag**: yes — `--research-phase` when planning (VOICE-06..08 external Daily.co integration has no CI coverage; confirm Daily-only vs Recall.ai bridge before sprint)
**Plans**: 6 plans (2 waves)
Plans:
- [x] 71-01-PLAN.md — Message embeddings schema + Ollama nomic-embed-text provider (wave 1)
- [x] 71-02-PLAN.md — Semantic/hybrid recall endpoint + background embedding job (wave 2)
- [x] 71-03-PLAN.md — HIL SLA action config + 60s escalation scheduler (wave 1)
- [x] 71-04-PLAN.md — HIL dashboard live countdown + SLA traffic-light (wave 2)
- [x] 71-05-PLAN.md — Daily.co meeting bot: DailyTransport pipeline + per-speaker transcripts (wave 1)
- [x] 71-06-PLAN.md — Recording-consent gate + meeting join UI (wave 2)
**UI hint**: yes

### Phase 72: Cross-Project Recall + Behavioral W-lift + UI + Skills
**Goal**: Recall can span explicitly-allowed repos, SEAL instruction/skill proposals are scored by real sandboxed agent re-execution, operators trigger `qmd update` and see index freshness from the UI, skills imported from any harness are dispatchable cross-harness, and agent work exposes evidence bundles that show sources, memories, tool actions, verification checks, assumptions, and replay/rollback artifacts.
**Depends on**: Phase 71 (cross-project recall strictly needs `message_embeddings` + `semanticRecall()`) and Phase 70 (SEAL behavioral W-lift needs the stable A2A hub)
**Requirements**: RECALL-03, RECALL-04, SEAL-04, SEAL-05, SEAL-06, UI-05, UI-06, SKILL-01, SKILL-02, SKILL-03, SKILL-04
**Prerequisite tasks**:
  - Sandboxed eval profile with no-op side-effect tool stubs is a design prerequisite — spec must exist before sprint (SEAL behavioral re-execution mutating live state is a CRITICAL pitfall)
  - Cross-project recall must be opt-in: caller passes `crossProject: true` + explicit `allowed_project_ids`; single-project is the mandatory default; no recursive readdir
  - Add `deepeval>=4.0,<5.0` to orchestration service requirements
**Success Criteria** (what must be TRUE):
  1. A caller passing `crossProject: true` with explicit `allowed_project_ids` gets results ranked by semantic similarity and annotated with source repo; omitting the flag returns single-project results only
  2. `BehavioralEvalService.rescoreForProposal()` dispatches real agent re-execution via the A2A hub against a held-out 10-20 task sample using a sandboxed profile with no-op tool stubs
  3. `applyProposal()` returns a `job_id` immediately and the UI polls for completion; the request handler is never blocked on eval, and the resulting evidence bundle captures the task sample, tools/commands, checks passed, assumptions, residual risks, and replay/rollback handle
  4. An operator triggers the `qmd update` pipeline from the UI with SSE progress streaming, and the Library page shows QMD index recency vs latest file mtime per collection as context freshness evidence
  5. An operator imports a SKILL.md file, it is normalized into the `skill_registry` table with its source harness plus governed contract fields (preconditions, allowed tools, risk tier, verification checks, owner, rollback behavior), the A2A dispatcher looks up the registry before per-agent instruction fallback, and the Skills UI shows all registered skills with source harness, dispatch status, and contract completeness
**Research flag**: yes — `--research-phase` when planning (SEAL-04..06 sandbox mechanism, async eval runner, and token budget all need detailed design)
**Plans**: 1/1 complete
**UI hint**: yes

### Phase 73: Operator UI Truth + Phase Parity
**Goal**: Completed/current phase claims agree with actual operator-visible behavior, the Phase 70 HIL edit path is reachable from the live approval panel, the Operations NOC does not present unimplemented telemetry as live, and future phase closes require explicit UI/API/follow-up representation decisions.
**Depends on**: Phase 72 (v4.0 feature work complete; parity closeout requires full milestone context)
**Requirements**: UI-PARITY-01, UI-PARITY-02, UI-PARITY-03, UI-PARITY-04, UI-PARITY-05
**Success Criteria**:
  1. `REQUIREMENTS.md`, `ROADMAP.md`, `STATE.md`, and Phase 73 summary agree that v4.0 is complete through the parity closeout while NOC-01..11 remain broader real-data backlog.
  2. A pending HIL approval in `/flow` exposes the edit form before approve/reject, preserving validation and changed-field summary behavior.
  3. The Operations NOC header says telemetry preview/live wiring pending, and the efficiency section renders missing telemetry streams instead of sample values.
  4. The phase done definition requires every completed requirement to declare visible UI, existing UI provenance, API/backend-only scope, or follow-up UI debt.
**Plans**: 1/1 complete
Plans:
- [x] 73-01-PLAN.md — Operator UI truth and phase parity
**UI hint**: yes

### v4.0 Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|----------|---------------|--------|-----------|
| 70 | v4.0 | 5/5 | Complete   | 2026-05-21 |
| 71 | v4.0 | 6/6 | Complete | 2026-05-21 |
| 72 | v4.0 | 6/6 | Complete   | 2026-05-22 |
| 73 | v4.0 | 1/1 | Complete   | 2026-05-21 |


## v5.0 Memory Trust + Operational Intelligence

### Phase 74: Security Label Schema + Raw Vault
**Goal**: Sensitive raw context lands in an append-only, hash-addressed, label-tagged evidence vault with the canonical multi-dimensional security label schema that every later phase reads from.
**Depends on**: Nothing (first v5.0 phase; foundation for the full security critical path)
**Requirements**: MEMSEC-01, MEMSEC-02
**Prerequisite tasks**:
  - Additive ALTER TABLE migrations on `messages`, `audit_log`, `hive_actions`, `agent_memory_writes`, `recall_log` with safe defaults `visibility='private'`, `policy='sealed'` so every legacy row is treated as restricted until reclassified
  - New SQLite tables: `raw_artifacts`, `artifact_labels`, plus filesystem vault layout `~/.memroos/vault/<tenant>/<YYYY>/<MM>/<DD>/`
  - New `lib/vault/` module: writer, reader, hash/replay metadata, retention policy, zstd compression via `node:zlib`
**Success Criteria** (what must be TRUE):
  1. Any new ingest (meeting transcript, email, file, A2A task payload) is written to the vault filesystem with content hash, compressed body, key id placeholder, classification label row, and replay metadata; the SQLite row stores only metadata and a vault pointer.
  2. Every label-bearing table can express `visibility` (private/internal/public_safe/public_approved), `domain` (legal/finance/hr/client/personal/engineering), `sensitivity` (pii/secret/credential/privileged/contract/payment/health), and `policy` (indexable/agent_visible/requires_redaction/requires_human_review/sealed) independently, and existing rows default to `visibility=private`, `policy=sealed`.
  3. Operators can list vault artifacts for a tenant and replay a specific artifact id back to its original content (decompressed, hash-verified) via an admin endpoint.
  4. Migration runs idempotently on the production SQLite database without locking writers or losing rows.
**Plans**: 1/1 complete

### Phase 75: Classification Cascade + Ingestion Gate
**Goal**: Every ingested artifact is classified through a fail-closed, deterministic-first cascade that stamps the correct label dimensions before the content is allowed to leave the raw vault, with uncertain or high-stakes cases routed to a human review queue.
**Depends on**: Phase 74 (needs label schema and vault writer)
**Requirements**: MEMSEC-03, CTX-FOLLOWUP-03
**Prerequisite tasks**:
  - Reuse `content-scanner.ts` 18-pattern detector as the first sub-stage of a unified `DetectorPipeline`
  - Add Presidio (FastAPI endpoint in memory service) for PII/NER detection — Layer 2
  - Add constrained LLM adjudicator gated to low-confidence cases only — Layer 3
  - New `classification_reviews` table with SLA, owner, drain workflow
**Research flag**: yes — Presidio `en_core_web_lg` startup latency spike required before planning. If cold-start > 2s, async classification strategy becomes mandatory. 30-minute timing spike resolves direction.
**Success Criteria** (what must be TRUE):
  1. Raw meetings, emails, DMs, browser history, files, finance, legal, HR, personal, and client sources all default to `visibility=private` at ingest until the cascade promotes them; no source can bypass the gate.
  2. Deterministic detectors (scanner + Presidio + metadata) run before the LLM adjudicator on every artifact; only artifacts the deterministic layer marked low-confidence reach the LLM.
  3. Public-promotion, legal, finance, HR, credential, payment, privileged, and sealed cases land in a visible human review queue with reviewer, decision, evidence span, and timestamp recorded.
  4. The review queue surfaces per-artifact evidence spans and abstention reasons, and a reviewer can promote, deny, or redact-and-promote a label with the decision written to `audit_log`.
**Plans**: 1/1 complete
**UI hint**: yes

### Phase 76: Retrieval Authorization Gate
**Goal**: Every memory recall, multi-search, context-pack assembly, export, summarization, A2A dispatch, and index write passes through a single policy decision point that returns allow/deny/redact/review-required against the current security labels.
**Depends on**: Phase 74 (needs label schema). Can ship before Phase 75 classification is fully propagated by enforcing default `private` labels — the gate denies-by-default until a classification promotes the label.
**Requirements**: MEMSEC-04
**Prerequisite tasks**:
  - New `lib/memory/policy-gate.ts` intercepts at route boundary above all MemoryAdapters; adapters remain actor-unaware
  - Every gate decision written to `audit_log` with actor, role, capability, tenant/project, purpose, source freshness, label snapshot, and decision
  - Compensating control: classify-at-retrieval for `agent_memory` content written via the mem0 HTTP bypass
**Success Criteria** (what must be TRUE):
  1. A recall request from an actor without the matching role/capability for a label returns `deny` (or a `redact`ed projection when an approved redaction exists), never the raw content.
  2. Default-labeled (`visibility=private`, `policy=sealed`) artifacts cannot surface through any retrieval path — recall, multi-search, context-pack, ChatGPT Action, export, summarization, A2A dispatch, or FTS/vector/graph index write — until a classification promotes the label.
  3. Every gate decision (allow, deny, redact, review-required) appears in `audit_log` with actor identity, role, tenant/project, purpose, label snapshot, and decision reason.
  4. mem0 HTTP-written content is classified at retrieval time and gated by the same policy decision as TypeScript-ingested content.
**Plans**: 1/1 complete

### Phase 77: Safe Index Projections + Envelope Encryption
**Goal**: Derived indexes (FTS5, Qdrant, Neo4j, qmd) only contain content cleared as `indexable=true`, text-first embeddings carry full provenance, and sensitive raw artifacts use app-level envelope encryption with a working key rotation path.
**Depends on**: Phase 76 (retrieval gate must be live before indexes are repopulated)
**Requirements**: MEMSEC-05, MEMSEC-06, MEMSEC-07
**Prerequisite tasks**:
  - Background embedding job (50 messages / 5 min) gains a label check that skips `policy=sealed` and `policy=requires_redaction` rows
  - Full reclassification + reindex sweep across existing FTS5, Qdrant, Neo4j content; restricted rows are evicted or replaced with approved redacted projections
  - Envelope encryption: `crypto.subtle` AES-GCM data keys + AES-KW key wrap, `LocalFileKeyProvider` at `~/.memroos/vault.key`, retired-key retention for replay
**Success Criteria** (what must be TRUE):
  1. FTS5, Qdrant, Neo4j, qmd projections, and evidence bundles contain only content with `policy=indexable=true`; restricted content is either absent or present only as an approved redacted projection with a vault provenance pointer.
  2. Every embedding row records artifact id, source span, modality, model name/version, dimension, label version, and creation timestamp, and inherits the source security label unless an approved redaction promoted it.
  3. Operators can rotate the key-encryption key, re-wrap data keys, and replay a vault artifact written under both old and new key ids with byte-equal output.
  4. A backup-and-restore drill restores the vault on a fresh machine using the documented key restore path and replays a sample artifact end-to-end.
**Plans**: 1/1 complete

### Phase 78: Security Regression Tests
**Goal**: An automated negative-fixture suite proves restricted memory cannot leak through any recall, export, summarization, A2A dispatch, audit search, or derived index path before the security chain is declared shippable.
**Depends on**: Phases 74, 75, 76, 77 (all security primitives must be live to run end-to-end leak tests)
**Requirements**: MEMSEC-08
**Prerequisite tasks**:
  - Negative fixture corpus covering legal, finance, HR, credential, payment, privileged, personal, confidential, and public-promotion cases
  - Tests cover: recall, multi-search, context packs, ChatGPT Actions, exports, summaries, agent dispatch, audit search, FTS, vector, graph, qmd projections
  - CI fails the phase if any fixture content surfaces through any covered surface
**Success Criteria** (what must be TRUE):
  1. The negative-fixture suite runs in CI and fails any commit where a restricted fixture surfaces through recall, multi-search, context pack, ChatGPT Action, export, summary, A2A dispatch, audit search, FTS, vector, graph, or qmd projection.
  2. Every restricted category (legal, finance, HR, credential, payment, privileged, personal, confidential, public-promotion) has at least one negative fixture with an expected `deny` or `redact` outcome.
  3. A documented runbook lets an operator extend the fixture corpus with a new restricted category and have CI enforce it.
  4. Phase 74-77 are considered incomplete until this suite passes green on the main branch.
**Plans**: 1/1 complete

### Phase 79: NOC Telemetry + Real-Data Wiring
**Goal**: Every panel on the Operations NOC and every operations page renders live data with explicit per-panel provenance (source, lastUpdated, window, status, warnings), and missing-telemetry surfaces are labeled honestly rather than backed by mock constants.
**Depends on**: Nothing (parallel with the security chain)
**Requirements**: NOC-01, NOC-02, NOC-03, NOC-04, NOC-05, NOC-06, NOC-07, NOC-08, NOC-09, NOC-10, NOC-11, NOC-12, NOC-13, NOC-14, OPS-AUDIT-01, OPS-AUDIT-02, OPS-AUDIT-03, OPS-AUDIT-04
**Prerequisite tasks**:
  - Unified `/api/operations/noc` data contract exposing per-panel `{source, lastUpdated, window, status=live|empty|degraded|missing, warnings}`
  - New `efficiency_events` telemetry instrumentation feeding NOC-10 efficiency signals (retrieval-without-action, source re-read, raw ingest token share, operator re-ask redundancy, rediscovered-fact rate) — longest pole in this phase
  - Test rule that fails the build if production `components/operations/*` imports `noc-mock-data`
  - Route-by-route audit pass across Ledger, Business Ops, Skills, Agents, Memory, Governance, Improve, Workflow Map, Dispatch
**Success Criteria** (what must be TRUE):
  1. Every NOC panel (pulse, memory consumption, agent workload, model utility, skills lifecycle, governance, engagement, efficiency, and the time-window control) renders from live sources with visible `source`, `lastUpdated`, `window`, and `status` provenance; missing telemetry shows a missing-source callout, not a fabricated value.
  2. Sending a directive from the engagement console on `/dispatch` creates a real dispatch/chat action or returns a visible error — never a canned interaction — and the NOC home does not embed engagement controls.
  3. Every NOC control either navigates to a real owner surface, mutates visible UI state, triggers an implemented API, or renders an explicit missing-backend explanation; no inert controls remain.
  4. Ledger, Business Ops, Skills, Agents, Memory, Governance, Improve, Workflow Map, and Dispatch each expose a date-range/time-window control, source/provenance state, loading and error states, and an over-time view when the data supports it; Ledger distinguishes live/empty/unavailable/failed states for RTK, Claude model logs, and model-routing telemetry instead of rendering zeros.
  5. CI fails any commit where a production Operations component imports `noc-mock-data`, and a Playwright suite verifies the live, empty, and degraded NOC states render correctly.
**Plans**: 1/1 complete
**UI hint**: yes

### Phase 80: Cron Health Registry + Schedules Console
**Goal**: Every recurring job that ingests data, writes memory, or polls external APIs is declared in a registry, exposes a heartbeat and caught-up signal, can be paused or stopped from the dashboard, and every operator-facing source family declares a complete contract.
**Depends on**: Nothing (parallel with the security chain)
**Requirements**: CTX-FOLLOWUP-01, CTX-FOLLOWUP-02, CRON-HEALTH-01, CRON-HEALTH-02, CRON-HEALTH-03, CRON-HEALTH-04, CRON-HEALTH-05, UX-FOLLOWUP-03
**Prerequisite tasks**:
  - New `cron_job_registry` table + declarative job manifests so the dashboard knows what jobs *should* exist and can detect missing/orphaned schedules
  - Extend the Phase 69 context-source contract framework to every configured source family (Drive, Slack, Gmail/Spark, local folders, qmd, mem0, future connectors)
  - Runtime health reports queued writes, retry backlog, stale semantic recall, replay verification, and source-to-QMD indexing proof — not just service reachability
**Success Criteria** (what must be TRUE):
  1. The Schedules and Routines console lists every recurring job, its last-run timestamp, success/failure status, items processed, caught-up status, and any warnings, and the registry detects missing or orphaned schedules.
  2. An operator can pause, resume, or stop an individual cron job from the dashboard without restarting the MemroOS runtime; jobs that are not caught up emit a warning-level health signal that appears in the NOC and operator notification surface.
  3. Every operator source family (Drive, Slack, Gmail/Spark, local folders, qmd, mem0, future connectors) declares its ingest, index, freshness, safe-answer, and repair behavior with no silent unindexed lanes.
  4. Runtime health surfaces queued writes, retry backlog, stale semantic recall, replay verification, and source-to-QMD indexing proof to operators and evals — not just service reachability.
**Plans**: 1/1 complete
**UI hint**: yes

### Phase 81: Universal Evidence Bundles + Harness Control Plane
**Goal**: Every dispatched A2A task exposes a Plan-Execute-Verify timeline with sources, memories, tools, checks, assumptions, residual risks, and a replay handle; tasks declare read/write sets so stale-belief and context-drift conflicts surface before action.
**Depends on**: Soft-depends on Phase 74 (evidence bundles reference vault artifact ids)
**Requirements**: HARN-01, HARN-02, HARN-03
**Prerequisite tasks**:
  - New `task_evidence_bundles` table keyed on `a2a_tasks.task_id`; SEAL-specific bundles remain a sibling
  - Bundles written asynchronously (fire-and-forget) so agent execution is never blocked
  - Shared-state read/write set declaration on every task; conflict policy enforced before dispatch
**Research flag**: yes — Shared harness state conflict detection design spec required before coding. Novel architecture; brief design doc must exist before sprint.
**Success Criteria** (what must be TRUE):
  1. Every completed A2A task exposes a Plan-Execute-Verify timeline showing context assembled, tools exposed, permissions granted, actions taken, verification run, and memory updated, stored in `task_evidence_bundles` keyed on `a2a_tasks.task_id`.
  2. An operator opening any agent output can see sources used, memories consumed, tools/commands run, checks passed, unverified assumptions, residual risks, and a working replay/rollback handle.
  3. Tasks declaring overlapping write sets or version dependencies surface a stale-belief or context-drift warning before dispatch — not after a failed run.
  4. Evidence bundle writes are asynchronous and never block the task response path, verified by an instrumented latency test.
**Plans**: 1/1 complete
**UI hint**: yes

### Phase 82: Auth Hardening
**Goal**: Team auth has the table-stakes floor — email invitations, password reset, OAuth/SSO, role-aware navigation gating, tenant settings, and API-key rotation — without breaking machine-facing A2A or MCP routes.
**Depends on**: Nothing (fully parallel with all v5.0 chains)
**Requirements**: AUTH-FOLLOWUP-01, AUTH-FOLLOWUP-02, AUTH-FOLLOWUP-03
**Prerequisite tasks**:
  - OAuth providers via `arctic` (Google, GitHub); email delivery via `resend` (cloud-https) or `nodemailer` (single-host); templates via `@react-email/components`
  - Composable middleware chains: `withOAuth` for human routes, `withApiKey` for A2A/MCP/Python proxy routes — OAuth middleware must not wrap machine-facing routes
  - New `password_reset_tokens` table; migration of legacy audit actor fields to authenticated user identity
**Success Criteria** (what must be TRUE):
  1. A new teammate receives an email invitation, accepts it, logs in via password or Google/GitHub OAuth, and lands in the correct tenant with the assigned role; password reset and email change/verification work end-to-end.
  2. Nav items and actions the current user lacks permission for are hidden or disabled before click-through, while API and page-level 403 enforcement remains intact behind them.
  3. A tenant admin can rotate API keys, edit tenant settings, deactivate or reactivate users, and see legacy audit rows correctly attributed to authenticated user identities.
  4. A2A API-key routes, MCP gateway routes, and the Python proxy continue to authenticate via API key — OAuth middleware does not wrap them and machine-facing smoke tests stay green.
  5. Login and refresh lockout telemetry is recorded and visible to operators after a configurable failure threshold.
**Plans**: 1/1 complete
**UI hint**: yes

### v5.0 Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|----------|---------------|--------|-----------|
| 74 | v5.0 | 1/1 | Complete | 2026-05-24 |
| 75 | v5.0 | 1/1 | Complete | 2026-05-24 |
| 76 | v5.0 | 1/1 | Complete | 2026-05-24 |
| 77 | v5.0 | 1/1 | Complete | 2026-05-24 |
| 78 | v5.0 | 1/1 | Complete | 2026-05-24 |
| 79 | v5.0 | 1/1 | Complete | 2026-05-24 |
| 80 | v5.0 | 1/1 | Complete | 2026-05-24 |
| 81 | v5.0 | 1/1 | Complete | 2026-05-24 |
| 82 | v5.0 | 1/1 | Complete | 2026-05-24 |

## v5.1 Memory Inventory Clarity

### Phase 83: Memory Inventory + Listing Clarity
**Goal**: The Memory surface stops treating every store as one vague "memory" bucket and gives operators a source-backed inventory of vector memories, ingested messages, consolidated insights, episodic writes, graph facts, and knowledge files.
**Depends on**: Phase 79 (real-data/provenance UI patterns) and Phase 80 (source/degradation health)
**Requirements**: MEMLIST-01, MEMLIST-02, MEMLIST-03, MEMLIST-04, MEMLIST-05
**Prerequisite tasks**:
  - Add a canonical memory category vocabulary shared by UI copy, API responses, docs, and tests.
  - Add a memory inventory contract that reads counts from the owning stores instead of hardcoded demo values or mixed aggregate labels.
  - Update the Memory list/search surface so rows expose category, backend, source, project/workspace, timestamp, label snapshot, consolidation state, and provenance.
  - Wire degraded-state explanations for stalled consolidation, mem0/vector failures, graph unavailability, and stale knowledge indexes.
**Success Criteria** (what must be TRUE):
  1. The UI never shows a standalone "memories" count without a category label and source/provenance timestamp.
  2. Operators can answer "why only N?" from the page itself because each count maps to a specific backend/store and explains missing or degraded paths.
  3. Memory list/search filters separate vector memories, SQLite messages, consolidated insights, episodic writes, graph facts, and knowledge files without co-mingled unlabelled results.
  4. Seeded API/component tests prove counts come from the canonical stores, and a smoke test catches hardcoded demo numbers such as the old `97 memories` stat.
**Plans**: 1/1 complete
**UI hint**: yes

### v5.1 Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|----------|---------------|--------|-----------|
| 83 | v5.1 | 1/1 | Complete | 2026-05-24 |

## v5.2 Competitive Memory Target Architecture

### Phase 84: Competitive Memory Target Architecture
**Goal**: MemRoOS carries a reproducible target architecture for enterprise agentic memory, compares current/target MemRoOS against public alternatives, and proves the local recall path is not underperforming before making competitive claims.
**Depends on**: Phase 57 (eval engine), Phase 77 (safe index projections), Phase 83 (memory inventory clarity)
**Requirements**: MEMTARGET-01
**Prerequisite tasks**:
  - Add a public-evidence marketplace benchmark dataset and runner that scores MemRoOS current, MemRoOS target, and real alternatives without claiming black-box API results for closed vendors.
  - Document the target architecture and the hard recommendation: governed multi-agent memory plus hot-path retrieval, temporal invalidation, public benchmark proof, retrieval traces, and enterprise control boundaries.
  - Harden live memory recall evals so vector backend normalization and episodic FTS projection do not create false negatives.
  - Verify the target with unit tests, marketplace eval output, Next build, launchd restart, and an authenticated live full recall run.
**Success Criteria** (what must be TRUE):
  1. `npm run eval:marketplace-memory` regenerates a ranked comparison and persists the latest result under `evals/marketplace-agentic-memory/results/latest.json`.
  2. The benchmark ranks MemRoOS current against real alternatives and separately scores a MemRoOS competitive target profile so architecture gaps are explicit.
  3. The live full memory recall eval passes locally with `passRate=1.0`, no tier failures, and p95 latency below 500ms after restart.
  4. The documented recommendation does not overclaim black-box superiority; it distinguishes public-evidence architecture scoring from live MemRoOS runtime evals.
**Plans**: 1/1 complete
**UI hint**: no

### v5.2 Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|----------|---------------|--------|-----------|
| 84 | v5.2 | 1/1 | Complete | 2026-05-24 |

---

## v6.0 SkillForge — Governed Skill Optimization

### Phase 85: SkillForge Foundation
**Goal**: Build the SkillForge worker infrastructure, intake pipeline, and SEAL `skill_revision` proposal type so skill optimization proposals are governed from the first byte.
**Depends on**: Phase 58 (SEAL self-improvement), Phase 72 (skill registry), Phase 57 (eval engine)
**Requirements**: SKILLFORGE-01
**Prerequisite tasks**:
  - Create `lib/skillforge/` directory with worker, intake, and proposal modules.
  - Define `SkillForgeWorker` class: cron-triggered or event-driven, consumes `skill_registry`, `eval_candidates`, and SEAL evidence bundles.
  - Add `skill_revision` to SEAL proposal type enum with fields: `source_skill_id`, `source_version`, `proposed_diff`, `train_split_id`, `validation_results`, `held_out_results`, `w_delta`, `rejected_edits`, `residual_risks`.
  - Implement intake pipeline: privacy redaction gates (reuse Phase 74-77 security layer), trace normalization, skill-scope filtering.
  - Add database migrations for `skillforge_proposals`, `skillforge_splits`, `skillforge_rejected_edits`.
  - Wire worker into existing cron health registry (Phase 80) with heartbeat and caught-up status.
**Success Criteria** (what must be TRUE):
  1. `SkillForgeWorker` runs on schedule and produces no errors on empty/intake-only runs.
  2. `skill_revision` proposals are created as SEAL proposals with correct metadata and audit trail.
  3. Intake pipeline redacts sensitive traces before analysis (negative fixture: restricted memory never reaches optimizer).
  4. Worker appears in cron health registry with last-run, success/failure, and items-processed.
**Plans**: 1/1 complete

Plans:
- [x] Legacy Phase 85 implementation record — SkillForge foundation completed 2026-05-26; no separate phase plan file retained in this roadmap snapshot.
**UI hint**: no (backend-only)

### Phase 86: SkillForge Analysis
**Goal**: Build pattern detection and the deterministic-first `SkillFailImproveLoop` for skill failure analysis.
**Depends on**: Phase 85
**Requirements**: SKILLFORGE-02
**Prerequisite tasks**:
  - Implement failure pattern detection: trigger mismatches, resolver routing errors, contract violations, tool misuse.
  - Adapt GBrain's `FailImproveLoop` for skill trigger classification: `execute(operation, input, deterministicFn, llmFallbackFn)`.
  - Log routing failures to `skillforge_failures.jsonl` with timestamp, operation, input, deterministic_result, llm_result.
  - Group failures by pattern (first 50 chars of input, normalized).
  - Generate test cases from LLM fallback successes.
  - Propose deterministic trigger/rule improvements before LLM reflection.
  - Add `SkillForgeAnalyzer` class with `analyze(skillId)`, `getPatterns()`, `generateTests()` methods.
**Success Criteria** (what must be TRUE):
  1. Analyzer identifies at least 3 distinct failure patterns from historical telemetry.
  2. Deterministic trigger matching improves by ≥10% after applying generated rules.
  3. Failure logs are structured, queryable, and include replay handles.
  4. No LLM fallback is invoked when deterministic rules match (fail-closed for performance).
**Plans**: 1/1 complete

Plans:
- [x] Legacy Phase 86 implementation record — SkillForge analysis completed 2026-05-26; no separate phase plan file retained in this roadmap snapshot.
**UI hint**: no (backend-only)

### Phase 87: SkillForge Proposal Generation
**Goal**: Generate bounded SKILL.md edits with textual learning rate control and rejected-edit buffer.
**Depends on**: Phase 86
**Requirements**: SKILLFORGE-03
**Prerequisite tasks**:
  - Implement `SkillEditGenerator` with textual learning rate (controls edit magnitude: 0.1=conservative, 1.0=aggressive).
  - Edit scopes: triggers, contract clauses, phase steps, anti-patterns, tool declarations.
  - Constrained edit: cannot mutate security policy, governance policy, AGENTS.md directives, owner-protection instructions.
  - Rejected-edit buffer: hash + reason stored, prevents re-trying failed edits for 30 days.
  - Diff format: unified diff against source SKILL.md.
  - LLM reflection only when deterministic edit generation fails.
**Success Criteria** (what must be TRUE):
  1. Generated diffs are syntactically valid SKILL.md (parsable frontmatter + markdown).
  2. No edit mutates security/governance/owner-protection content (negative fixture).
  3. Rejected edits are tracked and not re-proposed within 30 days.
  4. Textual LR controls edit magnitude: conservative edits change ≤3 lines, aggressive ≤20 lines.
**Plans**: 1/1 complete

Plans:
- [x] Legacy Phase 87 implementation record — SkillForge proposal generation completed 2026-05-26; no separate phase plan file retained in this roadmap snapshot.
**UI hint**: no (backend-only)

### Phase 88: SkillForge Evaluation
**Goal**: Implement train/validation/held-out split tracking and W delta computation for skill proposals.
**Depends on**: Phase 87, Phase 57 (eval engine), Phase 72 (behavioral eval)
**Requirements**: SKILLFORGE-04
**Prerequisite tasks**:
  - Implement split tracking: `skillforge_splits` table with `split_type` (train/validation/held_out), `skill_id`, `task_samples`, `created_at`.
  - Training: historical traces + existing golden sets.
  - Validation: deterministic scorer (trigger routing accuracy, contract completeness, resolver reachability).
  - Held-out: behavioral eval via sandboxed agent with no-op tool stubs, 10-20 task samples.
  - W delta: reuse `EvalService.rescoreForProposal()` with modeled + behavioral components.
  - Non-regression gate: held-out pass rate ≥ baseline, no security/policy violations.
**Success Criteria** (what must be TRUE):
  1. Splits are disjoint: no task sample appears in more than one split.
  2. Validation scorer runs deterministically (no LLM calls, sub-100ms per skill).
  3. Held-out behavioral eval completes in <5 minutes for 20 tasks.
  4. W delta is computed for every proposal; negative W proposals are auto-rejected.
**Plans**: 1/1 complete

Plans:
- [x] Legacy Phase 88 implementation record — SkillForge evaluation completed 2026-05-26; no separate phase plan file retained in this roadmap snapshot.
**UI hint**: no (backend-only)

### Phase 89: SkillForge Governance
**Goal**: Build operator-visible UI for skill revision approval with diff, evidence, W delta, and promotion gate.
**Depends on**: Phase 88, Phase 58 (SEAL governance)
**Requirements**: SKILLFORGE-05
**Prerequisite tasks**:
  - Add `/skills/forge` page with proposal list, diff viewer, evidence bundle, W delta chart.
  - Operator actions: approve, reject, request changes, rollback.
  - SEAL lifecycle: queued → analyzing → eval-running → gated → pending_approval → approved → applied → exported.
  - Rollback handle: preserve previous version, one-click restore.
  - Auto-apply: disabled for all skill revisions (operator approval required).
  - Residual risks: display rejected edits, known gaps, and safety warnings.
**Success Criteria** (what must be TRUE):
  1. Operator can view full diff, evidence bundle, and W delta before approving.
  2. Rollback restores previous skill version in <30 seconds.
  3. No skill revision is applied without explicit operator approval (negative fixture).
  4. UI shows clear status through SEAL lifecycle stages.
**Plans**: 1/1 complete

Plans:
- [x] Legacy Phase 89 implementation record — SkillForge governance completed 2026-05-26; no separate phase plan file retained in this roadmap snapshot.
**UI hint**: yes

### Phase 90: SkillForge Integration
**Goal**: Cross-modal eval integration, SkillCycle maintenance, and safe runtime export.
**Depends on**: Phase 89, Phase 57 (eval engine)
**Requirements**: SKILLFORGE-06
**Prerequisite tasks**:
  - Cross-modal eval: 3-model, multi-provider scoring on 5 dimensions (goal, depth, specificity, safety, correctness).
  - Integrate with Memroos eval engine (existing judge, scorers, drift guard).
  - SkillCycle: lint → sync → analyze → propose → eval → gate → embed → orphans → purge.
  - Export to Codex/Claude/OpenClaw runtime projections only after SEAL approval.
  - Update `skill_registry` with revision history, eval receipts, rollback pointers.
  - Add `npm run skillforge:cycle` CLI command.
**Success Criteria** (what must be TRUE):
  1. Cross-modal eval produces receipts with per-dimension scores and improvement suggestions.
  2. SkillCycle runs end-to-end without errors on a test skill.
  3. Exported skills are functional in target runtime (Codex/Claude/OpenClaw).
  4. Revision history is queryable and includes all eval results and approval events.
**Plans**: 1/1 complete

Plans:
- [x] Legacy Phase 90 implementation record — SkillForge integration completed 2026-05-26; no separate phase plan file retained in this roadmap snapshot.
**UI hint**: yes

### v6.0 Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|----------|---------------|--------|-----------|
| 85 | v6.0 | 1/1 | Complete | 2026-05-26 |
| 86 | v6.0 | 1/1 | Complete | 2026-05-26 |
| 87 | v6.0 | 1/1 | Complete | 2026-05-26 |
| 88 | v6.0 | 1/1 | Complete | 2026-05-26 |
| 89 | v6.0 | 1/1 | Complete | 2026-05-26 |
| 90 | v6.0 | 1/1 | Complete | 2026-05-26 |

### Phase 97: Source Routing Contracts for Meeting Capture

**Goal:** Make captured meetings impossible to silently misfile by treating source routing as an explicit MemRoOS contract: raw capture, inferred project, evidence signals, confidence, review state, and qmd collection freshness must all be visible.
**Requirements**: CTX-FOLLOWUP-04
**Depends on:** Phase 80, Phase 96
**Prerequisite tasks**:
  - Define source-routing contract fields for meeting artifacts: raw source handle, normalized title/date, attendee domains, inferred project, confidence, evidence signals, fallback body signals, and conflict state.
  - Add regression fixtures for sparse-metadata captures, including the Cordant case where Spark only exposed Luis's personal Gmail and a generic strategic-alignment title.
  - Surface captured-but-misfiled, globally searchable-only, project-collection-missing, and vector/episodic-not-promoted states in operator health.
  - Wire repair paths so low-confidence or conflicting project routes enter review instead of defaulting silently to `general`.
  - Verify qmd collection freshness for project-scoped meeting paths after ingestion and promotion.
**Success Criteria**:
  1. Every meeting capture exposes raw source evidence, project route, confidence, and routing evidence.
  2. Low-confidence or conflicting routes are reviewable before they become durable project truth.
  3. Project qmd collections show date-window freshness proof for newly captured meetings.
  4. Known client regression fixtures include Cordant sparse Spark metadata and pass in CI.
  5. Memory/operator surfaces distinguish raw capture, project promotion, qmd indexing, and app-level memory promotion.
**Plans:** 1/1 complete
**UI hint**: yes

Plans:
- [x] 97-01 Meeting Source Routing Contract — deterministic route contract, qmd freshness proof, and Cordant sparse-Spark regression coverage.

---

## v6.1 SkillForge Autonomy — Dream Cycle + Marketplace (Phases 91-95)

### Phase 91: Dream Cycle — Automated Nightly Skill Optimization
**Goal**: Fully automated SkillForge loop that runs nightly without operator intervention, auto-approving low-risk proposals and escalating high-risk ones.
**Depends on**: Phase 90
**Requirements**: DREAM-01..03
**Status**: Complete (2026-05-26)
**Prerequisite tasks**:
  - Cron-scheduled SkillForge worker (`0 2 * * *`)
  - Risk-based auto-approval: proposals with W delta > 0.15 and no residual risks → auto-approve
  - Escalation queue: proposals with W delta < 0.05 or high residual risks → operator queue
  - Nightly report: email/Slack summary of proposals created, approved, rejected
  - Safety guard: max 1 auto-approved proposal per skill per week
**Success Criteria**:
  1. Dream cycle runs automatically every night.
  2. Low-risk proposals are auto-approved within safety bounds.
  3. High-risk proposals are queued for operator review.
  4. Nightly report is generated and delivered.
**Plans**: 1/1 complete
**UI hint**: no

### Phase 92: Skill Marketplace — Publish, Rate, Discover
**Goal**: Public skill marketplace where operators can publish, rate, and discover skills across the Memroos ecosystem.
**Depends on**: Phase 91
**Requirements**: MARKET-01..04
**Status**: Complete (2026-05-26)
**Prerequisite tasks**:
  - Skill publishing API: publish skill to marketplace with metadata, tags, ratings
  - Skill discovery: search, filter, sort by rating, downloads, category
  - Skill rating system: 1-5 stars, review text, verified purchase (downloaded + used)
  - Skill versioning: semantic versioning, changelog, deprecation warnings
  - Revenue share model (future): skill authors earn from usage
**Success Criteria**:
  1. Skills can be published to marketplace with full metadata.
  2. Skills can be discovered via search and filters.
  3. Rating system is functional and prevents abuse.
  4. Versioning works with deprecation warnings.
**Plans**: 1/1 complete
**UI hint**: yes

### Phase 93: Multi-Agent Skill Orchestration
**Goal**: Cross-agent skill sharing where skills optimized in one agent context can be shared with other agents in the ecosystem.
**Depends on**: Phase 92
**Requirements**: ORCH-SKILL-01..03
**Status**: Complete (2026-05-26)
**Prerequisite tasks**:
  - Skill export format: standardized skill package (SKILL.md + metadata + eval receipts)
  - Skill import validation: validate imported skills against local eval harness
  - Agent-to-agent skill sync: push/pull skills between agents via A2A protocol
  - Skill compatibility matrix: track which skills work with which agent frameworks
**Success Criteria**:
  1. Skills can be exported as standardized packages.
  2. Imported skills are validated before activation.
  3. Agent-to-agent sync works via A2A.
  4. Compatibility matrix is accurate and up-to-date.
**Plans**: 1/1 complete
**UI hint**: no

### Phase 94: Behavioral W-Lift v2 — True Instruction/Skill Behavioral Eval
**Goal**: True behavioral W-lift measurement for instruction and skill changes, not just modeled delta.
**Depends on**: Phase 93, Phase 57 (eval engine)
**Requirements**: WBEHAV-01..03
**Status**: Complete (2026-05-26)
**Prerequisite tasks**:
  - Behavioral harness: run actual agent tasks with modified instructions/skills
  - A/B testing framework: compare control vs treatment agent performance
  - Statistical significance: paired t-test or Mann-Whitney U for W delta
  - Golden set expansion: behavioral eval golden sets for each skill category
**Success Criteria**:
  1. Behavioral harness runs actual tasks and measures real W.
  2. A/B test framework compares control vs treatment.
  3. Statistical significance is computed and reported.
  4. Golden sets cover all major skill categories.
**Plans**: 1/1 complete
**UI hint**: no

### Phase 95: Self-Hosted Eval Cluster
**Goal**: Support local judge models (Ollama, vLLM) for eval execution, reducing dependency on cloud LLM APIs.
**Depends on**: Phase 94
**Requirements**: LOCALJUDGE-01..03
**Status**: Complete (2026-05-26)
**Prerequisite tasks**:
  - Ollama integration: local model serving for eval judge
  - vLLM integration: high-throughput local inference for batch evals
  - Model fallback: cloud API fallback when local model is unavailable
  - Eval accuracy tracking: compare local vs cloud judge scores, flag drift
**Success Criteria**:
  1. Ollama judge produces scores within 5% of cloud judge.
  2. vLLM handles batch evals at >10x throughput of single-request.
  3. Fallback to cloud is seamless and logged.
  4. Drift between local and cloud judges is monitored.
**Plans**: 1/1 complete
**UI hint**: no

### Phase 96: Agent Memory Continuity
**Goal**: Replace AgentMemory-style local capture with MemRoOS-native coding-agent session capture and cross-agent handoff packs.
**Depends on**: Phase 74, Phase 76, Phase 81
**Requirements**: AGENTMEM-FOLLOWUP-01
**Status**: Complete
**Completed**: 2026-05-27
**Success Criteria**:
  1. Coding-agent session captures write structured state plus sealed raw trace artifacts.
  2. Durable memory candidates extract task state, decision intent, source pointers, lessons, runbook hints, and verification results.
  3. Handoff packs let one agent resume another agent's task by task id, session id, or source agent.
  4. Secret-like content is redacted from handoff packs while sealed raw vault evidence remains replayable by authorized paths.
  5. Duplicate captures are suppressed by stable capture hash.
**Plans**: 1/1 complete
**UI hint**: API-first; future UI can render capture health and handoff previews from the new tables.

### v6.1 Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|----------|---------------|--------|-----------|
| 91 | v6.1 | 1/1 | Complete   | 2026-05-26 |
| 92 | v6.1 | 1/1 | Complete   | 2026-05-26 |
| 93 | v6.1 | 1/1 | Complete   | 2026-05-26 |
| 94 | v6.1 | 1/1 | Complete   | 2026-05-26 |
| 95 | v6.1 | 1/1 | Complete   | 2026-05-26 |

### v6.2 Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|----------|---------------|--------|-----------|
| 98 | v6.2 | 1/1 | Complete   | 2026-05-28 |
| 99 | v6.2 | 1/1 | Complete   | 2026-05-28 |
| 100 | v6.2 | 1/1 | Complete   | 2026-05-28 |
| 101 | v6.2 | 1/1 | Complete   | 2026-05-28 |
| 102 | v6.2 | 1/1 | Complete   | 2026-05-28 |
| 103 | v6.3 | 1/1 | Complete   | 2026-05-29 |
| 104 | v6.3 | 1/1 | Complete   | 2026-05-29 |
| 105 | v6.3 | 1/1 | Complete   | 2026-05-29 |
| 108 | v6.6 | 1/1 | Complete   | 2026-06-08 |

### Phase 106: SkillForge Production SkillOpt Hardening

**Goal:** Make SkillForge's SkillOpt loop production-grade by replacing heuristic/stub evaluation paths with real behavioral evidence, consolidating proposal generation, and storing enough structured traceability to audit every accepted or rejected skill edit.
**Milestone**: v6.4
**Depends on:** Phase 90, Phase 94, Phase 105
**Requirements**: SKILLOPT-HARDEN-01, SKILLOPT-HARDEN-02, SKILLOPT-HARDEN-03, SKILLOPT-HARDEN-04, SKILLOPT-HARDEN-05
**Status**: Complete (2026-06-08)
**Success Criteria**:
  1. `runHeldOutEval` and `runEvalGate` use the real behavioral eval/sandbox scorer for instruction and skill proposals, with a true baseline W for the current skill version instead of fixed or heuristic pass-rate assumptions.
  2. SkillForge has one authoritative proposal-generation path; legacy/stub proposal generation is removed, renamed as test-only, or explicitly deprecated so worker, API, and approval flows cannot diverge.
  3. SkillForge persistence stores `edit_hash`, `train_split_id`, `validation_split_id`, `held_out_split_id`, and `baseline_w` as first-class fields with additive migrations and tests; JSON payloads remain only for detailed receipts.
  4. Proposed skill changes are represented as typed bounded edit operations (`add`, `delete`, `replace`) with textual-learning-rate limits, forbidden-section checks, stable hashes, and deterministic rendering to SKILL.md diffs.
  5. Rejected-edit buffers, non-regression gates, operator approval, runtime export, and rollback receipts are covered by regression tests and visible in the proposal/audit surfaces.
**Plans:** 2/2 complete

Plans:
- [x] 106-01-PLAN.md - SkillForge hardening pass for production proposal path, typed edits, traceability, and fail-closed held-out evidence.
- [x] 106-02-PLAN.md - Real behavioral sandbox scorer for `SKILLOPT-HARDEN-01`.

### Phase 107: Agent Context Bus and Synchronous Agent Communication

**Goal:** Give every registered agent a MemRoOS-backed communication surface for durable inbox delivery, explicit context sync, synchronous request/reply, and audited memory save handoff without relying on hidden chat state or UI-only workflows.
**Milestone**: v6.5
**Depends on:** Phase 35, Phase 37, Phase 81, Phase 103
**Requirements**: AGENTBUS-01, AGENTBUS-02, AGENTBUS-03, AGENTBUS-04, AGENTBUS-05, AGENTBUS-06, AGENTBUS-07
**Status**: Complete (2026-06-04)
**Success Criteria**:
  1. `agent_context_messages` stores durable messages with id, thread id, correlation id, parent id, sender/recipient agent ids, type, status, priority, subject/body, context refs, artifacts, visibility/policy, timestamps, and optional memory receipt.
  2. REST endpoints let authenticated agents send, list inbox messages, fetch a message, acknowledge delivery, reply, and wait briefly for a reply with bounded server-side polling.
  3. Knowledge MCP exposes tool wrappers for send, inbox, reply, and ack so local/remote agents can use the bus from their normal harness.
  4. Context-sync and knowledge-save messages can request durable memory persistence while preserving provenance and avoiding direct secret/raw PII writes.
  5. Content scanning, agent-key auth, audit rows, proxy local-auth pass-through, and focused route/MCP tests prove the bus is safe to expose to agents.
  6. Data access is decided by deterministic control-layer policy checks, not by agent-declared message metadata, tool payloads, scans, or capability/card claims.
  7. Self-declared user/OAuth/credential/scope/data-access claims are denied fail-closed on the context bus, so delegated access must come from a trusted control-layer authorization path and raw bearer tokens are not stored or exposed.
**Plans:** 1/1 complete

Plans:
- [x] 107-01-PLAN.md — Durable agent context bus, REST routes, MCP wrappers, memory-save receipts, and regression tests.

### Phase 108: Cloud Offload + Local Footprint Reduction

**Goal:** Move eligible MemRoOS persistence, indexing, and heavy background work to managed/cloud services so the local machine keeps only the smallest practical hot cache, private runtime secrets, and offline/degraded fallback state.
**Milestone**: v6.6
**Depends on:** Phase 37, Phase 69, Phase 74, Phase 80, Phase 83, Phase 84
**Requirements**: CLOUDOFFLOAD-01, CLOUDOFFLOAD-02, CLOUDOFFLOAD-03, CLOUDOFFLOAD-04, CLOUDOFFLOAD-05, CLOUDOFFLOAD-06
**Status**: Complete (2026-06-08)
**Success Criteria**:
  1. A local-store inventory classifies every current store as permanent, rebuildable cache, replay queue, raw evidence, or runtime secret/config; records owner, source of truth, size, retention, privacy label, and cloud migration target.
  2. SQLite-backed operational state has a staged cloud persistence path or sync bridge for registry, audit, A2A/hive/task state, evals, and memory-write ledgers, with local WAL/SQLite either minimized or explicitly retained for offline fallback.
  3. Heavy search/index workloads have a cloud or remote-worker path for qmd-compatible knowledge search, embeddings, and source freshness checks, while local indexes are capped, rebuildable, and safe to delete.
  4. Raw evidence vault artifacts can move to encrypted object storage with local read-through cache, retention policy, hash verification, and rollback/replay proof before local raw copies are pruned.
  5. mem0, Qdrant, Neo4j, logs, replay queues, and orchestration checkpoints have clear managed/cloud targets or retention caps, with health checks proving queued writes and degraded remote services do not silently drop data.
  6. The NOC/setup surfaces show local footprint, cache pressure, cloud/offline mode, last sync, prune backlog, and rollback status; verification proves lower local disk/RAM pressure without exposing secrets or weakening policy gates.
**Plans**: 1/1 complete

Plans:
- [x] 108-01-PLAN.md — Inventory local stores, choose managed/cloud targets, add migration/sync strategy, cache caps, retention policy, and verification.

---

## v6.5 Agent Context Bus + Synchronous Agent Communication

### Phase 107: Agent Context Bus and Synchronous Agent Communication
**Goal**: Give agents a first-class MemRoOS surface for durable communication, synchronous request/reply, context sync, memory-save handoff, deterministic control-layer data-access enforcement, and delegated user/OAuth identity propagation.
**Milestone**: v6.5
**Depends on**: Phase 35 (A2A hub), Phase 37 (unified memory), Phase 81 (evidence bundles), Phase 103 (checkpoint/resume)
**Requirements**: AGENTBUS-01, AGENTBUS-02, AGENTBUS-03, AGENTBUS-04, AGENTBUS-05, AGENTBUS-06, AGENTBUS-07
**Status**: Complete (2026-06-04)
**Success Criteria**:
  1. Durable message store supports inbox/reply semantics and trace fields aligned with A2A-style task/message exchange and OpenTelemetry-style correlation.
  2. REST surface supports send/list/get/ack/reply plus bounded wait-for-reply for synchronous handoffs.
  3. Knowledge MCP provides agent-facing tools so Codex, Claude, OpenClaw, and Multica agents can communicate without needing browser UI access.
  4. Memory-save/context-sync handoff records audited receipts and provenance, with fail-closed auth and scanner behavior.
  5. Tests cover bus library, REST routes, MCP wrappers, proxy pass-through, and security blocking.
  6. Regression tests prove an agent cannot expand data access by self-declaring access scope in a message, tool payload, scan result, or capability/card claim.
  7. User/OAuth delegation is not accepted from agent-readable payloads; self-declared claims are denied and raw OAuth tokens are excluded from memory rows, audit rows, prompts, derived indexes, and bus payloads.
**Plans**: 1/1 complete
**UI hint**: Future NOC/Agents surfaces can show inbox depth, pending replies, stale messages, and memory-save receipts.

## v6.4 SkillForge Production SkillOpt Hardening

### Phase 106: SkillForge Production SkillOpt Hardening
**Goal**: Make SkillForge's SkillOpt loop production-grade by replacing heuristic/stub evaluation paths with real behavioral evidence, consolidating proposal generation, and storing enough structured traceability to audit every accepted or rejected skill edit.
**Milestone**: v6.4
**Depends on**: Phase 90 (SkillForge integration), Phase 94 (Behavioral W-Lift v2), Phase 105 (Agent CI/CD release gates)
**Requirements**: SKILLOPT-HARDEN-01, SKILLOPT-HARDEN-02, SKILLOPT-HARDEN-03, SKILLOPT-HARDEN-04, SKILLOPT-HARDEN-05
**Status**: Complete (2026-06-08)
**Success Criteria**:
  1. `runHeldOutEval` and `runEvalGate` call the behavioral eval/sandbox scorer for instruction and skill proposals, compare against the current skill version's baseline W, and fail closed when held-out evidence is missing or stale.
  2. SkillForge exposes one proposal-generation path for worker/API/approval flows; any legacy stub generator is removed, test-scoped, or explicitly deprecated with no production caller.
  3. SkillForge schema and migrations add first-class traceability fields for edit hash, split ids, baseline W, validation W, held-out W, and evaluator receipt references.
  4. Skill edits are typed bounded operations before they are rendered into unified diffs, with deterministic hashes, textual-learning-rate enforcement, forbidden-section protections, and round-trip tests.
  5. Proposal audit and UI/API surfaces show accepted/rejected status, W delta, baseline, split ids, rejected-edit reason, residual risks, operator decision, export receipt, and rollback handle.
**Plans**: 2/2 complete
Plans:
- [x] 106-01-PLAN.md - SkillForge hardening pass for production proposal path, typed edits, traceability, and fail-closed held-out evidence.
- [x] 106-02-PLAN.md - Real behavioral sandbox scorer for `SKILLOPT-HARDEN-01`.
**UI hint**: Improve/Skills proposal detail should expose baseline W, held-out W, split ids, rejected-edit reason, and rollback/export receipt.

## v6.2 Skill Distribution + Knowledge Gateway

### Phase 98: Skill Distribution Core
**Goal**: Implement the `skill-packs` workspace in the knowledge MCP so agents can discover and load skills from the knowledge repo at runtime. Enable private skill directory merging.
**Milestone**: v6.2
**Depends on**: Phase 27 (progressive MCP tool attention)
**Requirements**: SKDIST-01, SKDIST-02, SKDIST-03, SKDIST-04, PRIVCONF-03
**Status**: Complete (2026-05-28)
**Success Criteria**:
  1. `knowledge_workspace_call("skill-packs", "catalog")` returns all skills from `knowledge/skills/` with name, description, category, tags, and auto-load flag.
  2. `knowledge_workspace_call("skill-packs", "catalog", {"filter": "auto-load"})` returns only auto-load-tagged skills.
  3. `knowledge_workspace_call("skill-packs", "read", {"name": "deep-research-subagents"})` returns full SKILL.md content.
  4. Private skills in `~/.memroos/skills/` are merged into catalog results (if dir exists).
  5. Skill without `auto-load` in frontmatter defaults to `false` (backward-compatible).
  6. `skill-packs` workspace no longer returns `not_implemented` — all three actions (catalog, read, install) are handled.
**Plans**: 1/1 complete
Plans:
- [x] PLAN.md — Skill-packs workspace catalog/read/install, private skill merge, frontmatter parsing, and bootstrap convention.
**UI hint**: None — MCP-only change.

### Phase 99: Private Config Layer
**Goal**: Add support for `context-sources.local.json` private config overlay and ship the generic `meet-recordings` source slot in the public config.
**Milestone**: v6.2
**Depends on**: Phase 98
**Requirements**: PRIVCONF-01, PRIVCONF-02
**Status**: Complete (2026-05-28)
**Success Criteria**:
  1. `mcp_server.py` loads `~/.memroos/context-sources.local.json` on startup if it exists and deep-merges over repo's `context-sources.config.json`.
  2. `context-sources.config.json` contains a disabled `meet-recordings` entry with `ingestCommand: "${MEETINGS_INGEST_COMMAND}"` and a comment explaining the provider-agnostic pattern.
  3. `context-sources.local.json` is added to `.gitignore`.
  4. A `context-sources.local.json.example` documents the override pattern with circleback as example.
  5. `knowledge_health()` reflects the merged source list, not just the repo config.
**Plans**: 1/1 complete

Plans:
- [x] 99-01-PLAN.md — Private config overlay (merge logic + meet-recordings stub + gitignore + example)
**UI hint**: None.

### Phase 100: Circleback Ingestion
**Goal**: Wire circleback.ai as Luis's private meeting ingestion provider using the generic meet-recordings slot established in Phase 99.
**Milestone**: v6.2
**Depends on**: Phase 99
**Requirements**: CIRCLEBACK-01, CIRCLEBACK-02, CIRCLEBACK-03
**Status**: Complete (2026-05-28)
**Success Criteria**:
  1. `~/.memroos/integrations/circleback-ingest.sh` exports meetings via circleback CLI, transforms to dated Markdown files in `data/context/meet-recordings/`.
  2. `MEETINGS_INGEST_COMMAND` is set in `~/.memroos/memroos-runtime.env`.
  3. `com.memroos.circleback-sync.plist` LaunchAgent runs the ingest script nightly and triggers `qmd index meet-recordings`.
  4. `knowledge_search("meeting about X")` returns circleback transcript results after first ingest run.
  5. `knowledge_health()` shows `meet-recordings` source as connected.
**Plans**: 1/1 complete

Plans:
- [x] SUMMARY.md — Circleback private ingestion script, runtime env wiring, LaunchAgent schedule, and meet-recordings activation guide.
**UI hint**: None; LaunchAgent handles scheduling outside memroos UI.

### Phase 101: Memroos Troubleshooter Skill
**Goal**: Ship a `memroos-troubleshooter` skill in the knowledge repo that any agent can load to self-diagnose memroos issues. Update deep-research-subagents frontmatter for catalog-first loading.
**Milestone**: v6.2
**Depends on**: Phase 98
**Requirements**: MSKILL-01, MSKILL-02
**Status**: Complete (2026-05-28)
**Success Criteria**:
  1. `knowledge/skills/memroos-troubleshooter/SKILL.md` exists with: architecture overview, full workspace list with use-cases, common error messages with fixes, collection health commands, skill distribution flow, escalation paths.
  2. `memroos-troubleshooter` frontmatter: `auto-load: true`, `category: system`.
  3. `knowledge/skills/deep-research-subagents/SKILL.md` frontmatter updated: `auto-load: false`, `tags: [research, on-demand]`.
  4. `knowledge_workspace_call("skill-packs", "catalog", {"filter": "auto-load"})` returns `memroos-troubleshooter` and not `deep-research-subagents`.
  5. An agent loading only the catalog (not full content) sees both skills with descriptions sufficient to know when to call `skill_read`.
**Plans**: 1/1 complete

Plans:
- [x] SUMMARY.md — Memroos troubleshooter skill and deep-research-subagents catalog frontmatter update.
**UI hint**: None.

### Phase 102: Public Documentation
**Goal**: Ship the public-facing docs that teach any memroos operator how to wire a meeting provider and create/distribute skills. These docs make the private-config-layer pattern discoverable.
**Milestone**: v6.2
**Depends on**: Phase 99, Phase 101
**Requirements**: PUBDOC-01, PUBDOC-02, PUBDOC-03
**Status**: Complete (2026-05-28)
**Success Criteria**:
  1. `docs/integrations/meet-recordings.md` covers: how the provider-agnostic slot works, circleback as reference impl (install CLI, create ingest script, set env var), and a "Other Providers" section showing the pattern generalizes.
  2. `docs/skills.md` covers: SKILL.md frontmatter schema, public vs private skill directories, how agents discover skills (catalog-first), `auto-load` guidance (≤3 per deployment), and a worked example.
  3. `knowledge/skills/example-skill/SKILL.md` is a complete copy-paste template with all frontmatter fields and section stubs.
  4. `context-sources.local.json.example` in the repo root documents the private override pattern.
  5. All new docs are cross-referenced from the main `README.md` or `docs/` index.
**Plans**: 1/1 complete

Plans:
- [x] PUBDOC-SUMMARY.md — Meet-recordings integration guide, skills reference doc, and example skill template.
**UI hint**: None.

## v6.3 Agent Lifecycle + Memory Observability

### Phase 103: Lightweight Checkpoint/Resume/Handoff
**Goal**: Implement compact, event-triggered checkpoint/resume with minimal execution overhead so agents can pause, transfer work, and resume without material slowdown.
**Milestone**: v6.3
**Depends on**: Phase 96 (Agent Memory Continuity — AGENTMEM-FOLLOWUP-01)
**Requirements**: AGENTMEM-FOLLOWUP-02
**Status**: Complete (2026-05-29)
**Success Criteria**:
  1. Hot-path checkpoints store only compact structured state (run id, owner agent, objective, completed/remaining steps, decisions, artifact refs, verification state, next safe action, rollback notes, provenance pointers).
  2. Heavy operations (vector indexing, graph updates, qmd refreshes, git commits, summarization, evidence bundles) run asynchronously on debounced/background workers.
  3. Checkpoint writes are event-triggered: after major step completion, before/after external side effects, before human approval, before agent transfer, on failure/retry, before ending incomplete work.
  4. Metrics exposed: checkpoint write latency, checkpoint size, async queue depth, replay/resume latency, duplicate-work avoided, failure/degradation status.
  5. CI or local evals enforce explicit p95 write/resume performance budgets and prove checkpointing does not materially slow standard GSD agent runs.
**Plans**: 1/1 complete
**UI hint**: Checkpoint status and resume latency in NOC agent workload panel; handoff pack preview.

### Phase 104: Memory-Trace Observability
**Goal**: Add MemTrace-style execution graphs for memory-backed runs so we can explain whether memory helped, hurt, or was unused in any task.
**Milestone**: v6.3
**Depends on**: Phase 103 (checkpoint/resume for replay handles), Phase 84 (memory evals)
**Requirements**: AGENTMEM-FOLLOWUP-03
**Status**: Complete (2026-05-29)
**Success Criteria**:
  1. Every memory-backed run can reconstruct the causal path: source/context pack assembly → retrieval query → retrieved candidates → filters/policy decisions → consolidation/update steps → checkpoint references → prompt inclusion/exclusion → answer citation → downstream verification result.
  2. Failure analysis distinguishes: retrieval miss, bad ranking, stale memory, corrupted/incorrect memory, policy redaction, consolidation error, benchmark/annotation error, model misuse of correct memory.
  3. Memory and Improve surfaces expose trace graphs or step timelines for failed evals, with root-cause attribution, replay handle, and proposed repair action.
  4. Verification requires seeded positive/negative memory tasks, synthetic corrupted-memory cases, omission-vs-commission cases.
  5. Nightly canary proves MemRoOS can explain whether memory helped, hurt, or was unused.
**Plans**: 1/1 complete
**UI hint**: Trace graph view in Memory page failed-eval detail; Improve surface root-cause timeline.

### Phase 105: Agent CI/CD Release Gates
**Goal**: Treat agent versions as immutable deployable artifacts with promotion gates, version identity, and rollback — the release governance layer for agents.
**Milestone**: v6.3
**Depends on**: Phase 81 (evidence bundles), Phase 103 (checkpoint/resume), Phase 57 (eval engine)
**Requirements**: AGENTCICD-FOLLOWUP-01
**Status**: Complete (2026-05-29)
**Success Criteria**:
  1. Agent version is an immutable artifact bundling: model/provider route, system instructions, skill/tool contracts, runtime config, eval dataset versions, policy metadata.
  2. Promotion across local/dev/test/prod profiles requires quality, safety/grounding, governance, and performance gates: task success/accuracy, hallucination/grounding, policy/tool-use compliance, token cost, p95 latency, trace completeness, rollback handle, human approval where configured.
  3. Each promoted agent version has a distinct identity/version record, environment-specific permissions, OpenTelemetry/evidence traces, and one-step rollback to prior approved version.
  4. Complements checkpoint/resume: checkpoints protect in-flight work; CI/CD gates protect what agent versions are allowed to run.
**Plans**: 1/1 complete
**UI hint**: Agent version registry page; promotion gate status; rollback button in Agents surface.

### Phase 115: Architecture Review Hardening

**Goal:** Convert `.code-review/ARCHITECTURE-REVIEW.md` from system-level review prose into executable hardening requirements, then ship the first contained code slice against A3.
**Requirements**: ARCHREV-01, ARCHREV-02, ARCHREV-03, ARCHREV-04, ARCHREV-05, ARCHREV-06, ARCHREV-07, ARCHREV-08, ARCHREV-09, ARCHREV-10
**Depends on:** Phase 114
**Success Criteria** (what must be TRUE):
  1. Each architecture review finding A1-A9 has a mapped GSD requirement with a bounded implementation or explicit deferral path.
  2. Architecture docs describe MemRoOS as an agent OS with a broker kernel, shipped-domain module map, service/script boundaries, and placement rules.
  3. The SQLite schema layer has a versioned migration runner stamped via `PRAGMA user_version`; legacy unstamped DBs upgrade to the current schema version, and future-version DBs fail closed.
  4. Default admin seeding is not fire-and-forget; `getDb()` returns only after the seed path has completed or failed synchronously.
  5. DB regression tests prove version stamping, legacy upgrade, and synchronous seed behavior.
  6. Follow-on architecture hardening slices are separable so route auth, topology, env, contract, CI, and repo-structure work can be shipped without one broad unsafe refactor.
**Plans:** 14 plans
- [x] 115-01-PLAN.md — A3 SQLite migration runner, synchronous admin seed, and architecture review roadmap
- [x] 115-02-PLAN.md — Agent OS architecture identity, shipped-domain module map, service/script boundaries, and placement rules
- [x] 115-03-PLAN.md — Planning history retention policy and pre-public-release gate
- [x] 115-04-PLAN.md — Runtime topology manifest enforcement for Docker compose, `start.sh`, and launchd
- [x] 115-05-PLAN.md — Typed env startup validation and high-blast-radius config consolidation
- [x] 115-06-PLAN.md — Public eval route and TypeScript SDK contract alignment
- [x] 115-07-PLAN.md — Python SDK public eval contract alignment
- [x] 115-08-PLAN.md — Public eval REST OpenAPI contract
- [x] 115-09-PLAN.md — MCP tool schema export contract
- [x] 115-10-PLAN.md — A2A OpenAPI schema contract
- [x] 115-11-PLAN.md — Shared contract manifest and schema drift gate
- [x] 115-12-PLAN.md — Recall canary CI and scheduled gate
- [x] 115-13-PLAN.md — Next trust-boundary upgrade gate
- [x] 115-14-PLAN.md — Route auth boundary gate and proxy-bypass drift check

## v7.3 Agent Context Bus Operational Bootstrap

### Phase 116: Agent Context Bus Operational Bootstrap

**Goal**: Operationalize the agent-context bus with provisioning scripts, startup automation, MCP env wiring, agent-side skill, and smoke tests so agent-to-agent communication works end-to-end.
**Milestone**: v7.3
**Depends on**: Phase 107 (Agent Context Bus code)
**Requirements**: AGENTBUS-BOOT-01 (provisioning script), AGENTBUS-BOOT-02 (startup automation), AGENTBUS-BOOT-03 (MCP env wiring), AGENTBUS-BOOT-04 (agent communication skill), AGENTBUS-BOOT-05 (smoke test)
**Status**: Complete (2026-06-14)
**Success Criteria** (what must be TRUE):
  1. `scripts/provision-agent-keys.sh` registers agents and generates API keys.
  2. `scripts/start-memroos-agent-bus.sh` starts the app and verifies DB tables.
  3. MCP facade authenticates with `MEMROOS_AGENT_API_KEY`.
  4. Agent communication skill is installed and discoverable.
  5. Smoke test proves round-trip: send → inbox → ack → reply.
**Plans**: 1/1 complete

---

## v7.4 NOC Efficiency Telemetry

### Phase 117: NOC Efficiency Telemetry Instrumentation

**Goal**: Add trace-level data sources for the 5 NOC efficiency metrics currently showing "missing telemetry" honest-state placeholders, so the dashboard can display real production values instead of admitting it can't measure yet.
**Milestone**: v7.4
**Depends on**: Phase 79 (NOC Telemetry + Real-Data Wiring), Phase 104 (Memory-Trace Observability), Phase 107 (Agent Context Bus)
**Requirements**: EFFTEL-01, EFFTEL-02, EFFTEL-03, EFFTEL-04, EFFTEL-05
**Status**: Completed
**Success Criteria** (what must be TRUE):
  1. **EFFTEL-01 — Retrieval-before-work trace**: Dispatch and context-pack assembly emit structured trace events (timestamp, agent id, retrieval query, source, tokens, whether result was used in first response). NOC can compute "retrieval calls before useful work" from these traces.
  2. **EFFTEL-02 — Same-source re-read detection**: Tool-call transcript captures per-tool read events with source identifier and hash. NOC can count repeated reads of the same source within a task window.
  3. **EFFTEL-03 — Raw-context token ledger**: Model-routing layer emits token-level events distinguishing raw-context ingest tokens from processed/cached tokens. NOC can compute raw-context token share as a percentage of total.
  4. **EFFTEL-04 — Operator re-ask redundancy**: Chat transcript and memory-hit correlation events link operator questions to prior memory hits. NOC can detect when an operator re-asks something that was already answered from memory.
  5. **EFFTEL-05 — Rediscovered-fact provenance**: Memory write events include provenance (source, first-seen timestamp, dedup hash). NOC can detect when a fact is "rediscovered" (written to memory again after already existing).
**UI hint**: The 5 blocked NOC efficiency metrics transition from honest-state placeholders to real values; NOC-10 satisfied with production signal.
**Plans**: 1/1 complete

Plans:
- [x] 117-01-PLAN.md — Trace instrumentation for 5 efficiency telemetry sources with event store, emitters, NOC read model, and honest empty/degraded states.

---

## v7.5 Proactive Recollection Triggering

### Phase 118: Proactive Recollection Triggering

**Goal**: Make recollection a first-class runtime decision so agents search memory automatically when task, project, recency, handoff, source, or rediscovery signals require it, and emit receipts when search is skipped.
**Milestone**: v7.5
**Depends on**: Phase 72 (cross-project recall), Phase 76 (retrieval authorization), Phase 96 (agent memory continuity), Phase 104 (memory-trace observability), Phase 114 (retrieval receipts), Phase 117 (efficiency telemetry)
**Requirements**: RECOLLECT-01, RECOLLECT-02, RECOLLECT-03, RECOLLECT-04, RECOLLECT-05, RECOLLECT-06, RECOLLECT-07
**Status**: Completed
**Success Criteria** (what must be TRUE):
  1. Recollection policy returns a typed `search_required` or `search_skipped` decision before plan/tool/final timing gates, with reason codes and scope.
  2. Query planner emits bounded tier-aware queries from task text, entities, project/source refs, recency language, handoff state, and rediscovery risk.
  3. Ranking exposes score components for relevance, recency, importance/salience, source freshness, prior usefulness, and policy risk.
  4. Context-pack assembly records retrieved, injected, ignored, skipped, authorization result, and why each memory entered or missed the pack.
  5. Recall evals prove old-critical context can beat recent noise, stale sources are demoted or fail closed, and required recollection happens by `before_plan`, `before_tool_use`, or `before_final` as configured.
  6. NOC/operator surfaces can inspect recent recollection decisions, skipped-search reasons, false positives, and downstream memory use.
  7. Context packs and receipts distinguish bronze raw source snapshots, silver candidate claims, and gold admitted operational truth, with policy gates preventing agents from treating unadmitted claims as facts.
**UI hint**: Memory/NOC surfaces show "why this memory surfaced", "why no memory search ran", and "what belief stage this memory has" as receipts, not hidden model intuition.
**Plans**: 1/1 complete

Plans:
- [x] 118-01-PLAN.md — Trigger policy, query planner, ranking, receipts, evals, and NOC read model for proactive recollection.

---

## v7.6 Future Spike Queue

### Phase 119: Future Spike Queue Closeout

**Goal**: Conduct the six deferred future-only spikes as bounded repo artifacts without adopting dependencies, changing production paths, uploading private data, replacing backends, or approving runtime migrations.
**Milestone**: v7.6
**Depends on**: Phase 114 (competitive retrieval proof), Phase 115 (architecture review hardening), Phase 118 (proactive recollection)
**Requirements**: MEMGEN-FOLLOWUP-02, COCOINDEX-FOLLOWUP-01, FASTCONTEXT-FOLLOWUP-01, ADKA2A-FOLLOWUP-01, QDRANT-FOLLOWUP-01, HYPEREXTRACT-FOLLOWUP-01
**Status**: Completed
**Success Criteria** (what must be TRUE):
  1. Memento, CocoIndex, FastContext, ADK/A2A, Qdrant Cloud 1.18, and Hyper-Extract each have a dated spike report under `.planning/spikes/`.
  2. Each report states the external signal, repo baseline, comparison result, decision, guardrails, and verification path.
  3. Reports explicitly preserve no-adoption guardrails for dependencies, backends, hosted/private uploads, production paths, Qdrant upgrades, runtime replacement, and default extraction behavior.
  4. `npm run check:future-spikes` gates the spike report contract and is wired into CI.
**UI hint**: No UI surface changes; this is planning closeout and guardrail enforcement only.
**Plans**: 1/1 complete

Plans:
- [x] 119-01-PLAN.md — Future spike reports and `check:future-spikes`.

---

## v7.0 Client-Ready Security + Architecture Audit

### v7.0 Summary

- [x] **Phase 109: Parallel Domain Audit** — AUDIT-01, AUDIT-02, AUDIT-03, AUDIT-04 (completed 2026-06-07)
- [x] **Phase 110: Critical & High Security Fixes** — SEC-01, SEC-02, SEC-05, TEST-02 (partial) (completed 2026-06-07)
- [x] **Phase 111: Dependency CVE Sweep + Medium Security Fixes** — SEC-03, SEC-04, SEC-06 (completed 2026-06-08)
- [x] **Phase 112: Architecture Cleanup** — ARCH-01, ARCH-02, ARCH-03, ARCH-04, ARCH-05 (completed 2026-06-08)
- [x] **Phase 113: Test Validation + Build Verification** — TEST-01, TEST-02 (complete), TEST-03 (completed 2026-06-08)

**Coverage:** 13/13 v7.0 requirements mapped, no orphans.

### Phase Details

### Phase 109: Parallel Domain Audit
**Goal**: Run 4 simultaneous audit agents across Auth/Secrets, API Surface, Data/Memory, and Architecture/Code quality domains — producing ranked findings reports per domain with file:line precision.
**Milestone**: v7.0
**Depends on**: Nothing (first v7.0 phase)
**Requirements**: AUDIT-01, AUDIT-02, AUDIT-03, AUDIT-04
**Success Criteria** (what must be TRUE):
  1. All 4 domain audit reports are written to `.planning/audit/` with findings ranked by severity (critical → high → medium → low)
  2. Critical and high findings are enumerated with exact file:line references so a developer can navigate directly to each issue
  3. An aggregate findings summary report is produced that cross-references all 4 domain reports and counts findings by severity tier
**Plans**: 6 plans
- [x] 109-01-PLAN.md — Toolchain bootstrap: install pip-audit/bandit/madge/knip, npm+pip CVE baseline (Wave 1)
- [x] 109-02-PLAN.md — Domain A: Auth & Secrets audit (Wave 2)
- [x] 109-03-PLAN.md — Domain B: API Surface audit (Wave 2)
- [x] 109-04-PLAN.md — Domain C: Data & Memory audit (Wave 2)
- [x] 109-05-PLAN.md — Domain D: Architecture & Code Quality audit (Wave 2)
- [x] 109-06-PLAN.md — Findings aggregation into FINDINGS-INDEX.md (Wave 3)

### Phase 110: Critical & High Security Fixes
**Goal**: Fix all critical and high-severity security findings from Phase 109 audit, adding regression tests for each fix so no finding can be silently reintroduced.
**Milestone**: v7.0
**Depends on**: Phase 109 (audit reports must exist before remediation)
**Requirements**: SEC-01, SEC-02, SEC-05, TEST-02 (partial — regression tests for critical/high fixes)
**Success Criteria** (what must be TRUE):
  1. Zero critical-severity security findings remain open after this phase
  2. Zero high-severity security findings remain open after this phase
  3. A regression test exists for each critical/high finding fixed — tests are in the main test suite and fail if the vulnerability is reintroduced
  4. No hardcoded secrets, tokens, or credentials exist in the codebase; git history is clean of accidental secret commits
**Plans**: 1 plan
Plans:
- [x] 110-01-PLAN.md — SEC-01/02 attestation + SEC-05 default key fix + regression test (Wave 1)

### Phase 111: Dependency CVE Sweep + Medium Security Fixes
**Goal**: Patch all critical/high CVEs in npm and Python dependencies, fix medium-severity security findings from the audit, and harden CI/CD security gates so they cannot be bypassed silently.
**Milestone**: v7.0
**Depends on**: Phase 109 (audit reports), Phase 110 (critical/high fixed first)
**Requirements**: SEC-03, SEC-04, SEC-06
**Success Criteria** (what must be TRUE):
  1. `npm audit` reports zero critical or high CVEs after dependency patching
  2. `pip-audit` reports zero critical or high CVEs after dependency patching
  3. All medium-severity findings from the Phase 109 audit are either fixed or documented with an accepted-risk rationale signed off by the owner
  4. `secret-guard.yml` and pre-commit hooks are verified to be active and hardened — a test secret committed to a branch triggers the guard rather than passing silently
**Plans**: 3 plans

Plans:
- [x] 111-01-PLAN.md — Dependency CVEs: Next.js upgrade + zod install + Python dep pinning + accepted-risk doc (Wave 1)
- [x] 111-02-PLAN.md — Auth hardening: JWT entropy check + zod dispatch validation + rate limiting (Wave 2, depends on 111-01)
- [x] 111-03-PLAN.md — Remaining SEC-03 + SEC-06: CSP fix, OpenAPI host, FastAPI bind, voice temp file, CI attestation (Wave 2, parallel with 111-02)

### Phase 112: Architecture Cleanup
**Goal**: Remove dead code, resolve module boundary violations, consolidate redundant patterns, enforce consistent error handling across all API routes, and eliminate unsafe TypeScript so the codebase is maintainable for a client-facing review.
**Milestone**: v7.0
**Depends on**: Phase 110 (security fixes complete; architecture changes layered on clean security state)
**Requirements**: ARCH-01, ARCH-02, ARCH-03, ARCH-04, ARCH-05
**Success Criteria** (what must be TRUE):
  1. No circular dependencies exist in core modules — verified by madge or tsc project references with zero circular-dependency warnings
  2. Dead code and unused exports are removed from all core modules — no unreachable functions remain in production paths
  3. TypeScript strict mode is enforced: zero `any` types or unsafe casts in production code paths
  4. All Next.js API routes and Python service endpoints use a consistent error-handling pattern — no ad-hoc error responses that bypass the standard shape
**Plans**: 4 plans

Plans:
- [x] 112-01-PLAN.md — Dead code removal: D01-005/006/007/008 — security-path exports, unused files, Python ruff/vulture (Wave 1)
- [x] 112-02-PLAN.md — Circular dep resolution: memory subsystem registry-contract split, seal type hoist, context-sources shell fix (Wave 1)
- [x] 112-03-PLAN.md — TypeScript unsafe casts: catch unknown narrowing + SpeechRecognition ambient types (Wave 1)
- [x] 112-04-PLAN.md — Error handling: apiError() helper + 20 route migrations + ARCH-03 redundancy verification (Wave 2)

### Phase 113: Test Validation + Build Verification
**Goal**: Ensure the full test suite is green, the production build passes cleanly, and security regression tests are complete and passing after all Phase 109-112 changes — validating the codebase is client-ready.
**Milestone**: v7.0
**Depends on**: Phase 110 (regression tests started), Phase 111 (CVE patches), Phase 112 (architecture cleanup)
**Requirements**: TEST-01, TEST-02 (complete), TEST-03
**Success Criteria** (what must be TRUE):
  1. `npm test` passes with zero failures after all Phase 109-112 changes
  2. `pytest` passes with zero failures after all Phase 109-112 changes
  3. `npm run build` passes with zero errors — production build is clean
  4. `npm run typecheck` passes with zero errors — TypeScript is fully valid
  5. Security regression tests cover all critical and high findings fixed in Phase 110 — the suite is independently runnable and documented
**Plans**: 1/1 complete
Plans:
- [x] 113-01-SUMMARY.md — Full test, build, typecheck, Python, static/service, and dependency-audit validation closeout.

## Progress Table (v7.0)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 109. Parallel Domain Audit | 6/6 | Complete   | 2026-06-07 |
| 110. Critical & High Security Fixes | 1/1 | Complete   | 2026-06-07 |
| 111. Dependency CVE Sweep + Medium Security Fixes | 3/3 | Complete   | 2026-06-08 |
| 112. Architecture Cleanup | 4/4 | Complete | 2026-06-08 |
| 113. Test Validation + Build Verification | 1/1 | Complete | 2026-06-08 |
| 116. Agent Context Bus Operational Bootstrap | 1/1 | Complete | 2026-06-14 |

## v7.1 Competitive Retrieval Proof

### Phase 114: Midbrain Comparison + Comparative Benchmark Plan
**Goal**: Turn the Midbrain comparison into durable public positioning and a concrete benchmark roadmap that proves MemRoOS on both retrieval quality and governed operational continuity.
**Milestone**: v7.1
**Depends on**: Phase 84 public-evidence benchmark, Phase 104 memory-trace observability, Phase 107 Agent Context Bus
**Requirements**: COMPETE-01, COMPETE-02, SITE-BENCH-01, BENCH-01, BENCH-02, BENCH-03, RETRIEVAL-01, RECEIPTS-01, SEO-PROOF-01
**Status**: Repo-verified complete (2026-06-27); public deploy approval separate
**Success Criteria** (what must be TRUE):
  1. Midbrain appears in `providers.json`, generated marketplace results, `/vs/midbrain`, sitemap, LLM-readable docs, README, and the benchmark methodology page.
  2. Public copy explicitly says MemRoOS's `84.06` architecture/governance score and Midbrain's SmartSearch paper metrics are different benchmarks.
  3. The public site has a benchmark block ready to publish from the generated marketplace result, with Midbrain `65.21` and caveats.
  4. The comparative benchmark plan names datasets, metrics, adapters, outputs, caveats, and first implementation steps for LoCoMo, LongMemEval, and LongMemEval-V2-style tasks.
  5. The highest-benefit roadmap additions are captured as GSD requirements: SmartSearch-inspired retrieval, retrieval receipts, and comparative external benchmark lanes.
  6. Crawler-visible proof metrics render actual values before JavaScript runs.
**Plans**: 1/1 complete
- [x] 114-01-PLAN.md — Midbrain surfaces, public benchmark caveats, SmartSearch-inspired retrieval roadmap, retrieval receipts, and comparative benchmark plan
