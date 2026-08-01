# Roadmap: Memroos

## Standing Quality Gate (2026-07-18)

*Added: 2026-07-18 · Version: 2026-07-18.1 · Creation: 2026-07-18 06:55 UTC · Updated: 2026-07-18 06:55 UTC*

**Active goal:** Complete remaining GSD roadmap **excluding Voyage** (skip Phase 166 / CLOUDOPS-08 / v8.9 Voyage embedding upgrade).

**Refactor discipline (mandatory before and during remaining GSD work):**
Refactor until you are happy with the architecture. After each significant step, live-test the system, run autoreview, and commit. Track progress in `/tmp/refactor-memroos.md`.

**Post-roadmap quality sequence (same goal):**
1. Add tests until 100% coverage (or measured blocked gaps).
2. Build sanitized, production-scale local data under production-like settings; inventory every user-facing feature/role/route/button/input/modal/state/workflow; define acceptance criteria + finite risk-based edge cases; test as a real user with reproduction evidence; fix shared-cause issues with regression tests; rerun until clean pass or blocked handoff. Ask before production, sensitive data, or destructive actions.
3. Complete all test cases; fix all issues.
4. Review production logs for errors; if actionable → root-cause → fix → verify → PR; if none → stop without changes.


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
- 🔄 **v8.1 Enterprise Operator Control Plane** — Phases 124-127 (Phases 124-125 complete 2026-07-07; Phases 126-127 have infra deps — IdP / MDM)
- ✅ **v8.2 Team-Scale Access + Policy Plane** — Phases 128-131 (completed 2026-07-07; POLGOV-01..05 + TEAMSCALE-01..06 + MSIQ-01..03 shipped; policy engine with dimensions/shadow/CI, spaces + knowledge labels, identity lifecycle + delegation chains + NOC + owner gates)
- ✅ **v8.3 Agent OS GSD Stack** — Phases 132-136 (completed 2026-07-07; Mark Kashef transcript-audit stack shipped as MemRoOS-native control plane + portable skill boundary)
- ✅ **v8.4 Project-Centric Operator UX** — Phases 137-141 (completed 2026-07-08; MemClaw operator-UX parity: workspace load, write rules, document directory, `is_shared`, cache admin, save-artifact gate; 22 requirement IDs shipped)
- ✅ **v8.5 Agent Fleet Plane** — Phases 142-147 (completed 2026-07-10; MemroOS as top-layer fleet plane across runtimes, LangGraph as peer orchestration runtime, Paperclip as parallel tenant; FLEET-01..26 shipped; sources: Discord #devops fleet research + Paperclip audit + OSS control-plane survey)
- ✅ **v8.6 Skill Trust Chain** — Phases 148-150 (completed 2026-07-16; contracts, Ed25519 signing/provenance, quarantine lane, governed sync + pins, lifecycle/dependencies; SKILLTRUST-01..05 shipped; planning closeout after code-first land)
- ✅ **v8.11 Unified Meeting Memory** — Phases 151-153 (completed 2026-07-14; meeting ingest reliability + federated `memory_recall` + operator surfaces; MEETREL-01..04 + URECALL-01..06)
- ✅ **v8.12 MemRoOS MCP Memory Gate Resilience** — Phases 154-156 (completed 2026-07-15; probe timeout honesty + Mem0 hang immunity + path-scoped disk / strict-gate diagnostics)
- ✅ **v8.13 Memory Tier Catchup + Install Wiring** — Phases 157-159 (code complete 2026-07-18; live Aura oneshot Luis-gated)
- ✅ **v8.14 Human Wiki Surface + Memory Digest** — Phases 160-162 (code complete 2026-07-18; vault-dependent live digest needs knowledge path)
- ✅ **v8.15 Always-On Cloud Operator (oracle-1)** — Phases 163-166 (added 2026-07-17; live cutover verified 2026-07-18; **data plane fully reconciled 2026-07-26** — Aura + Qdrant Cloud restored after a silent config-drift regression, full local→oracle-1 migration of ~123 tables / 45,750 `message_embeddings` / 59 registered agents; Phase 166 Voyage remains out of scope)
- ✅ **v8.16 Multi-Harness Observe Plane** — Phases 167-171 (code complete 2026-07-18; live capture/operator keys still needed)
- ✅ **v8.18 NOC Metrics Rethink** — Phases 173-174 (code-complete on main: commits `07a419d0` "feat: add truthful NOC attention contract" and `720f7805` "feat: complete NOC operator layout"; 116/116 tests pass across NOC API + components; NOCUX-01..05 met)
- 📋 **v8.19 Runtime Bottleneck Evidence** — Phase 175 (planned 2026-07-20; PERF-EVID-01..04; measure representative operator and retrieval workloads before any runtime rewrite decision)
- 🔄 **v8.20 Connected Work Memory** — Phase 176 (added 2026-07-21; **highest priority**; CONNMEM-01..10; **CONNMEM-02..10 library complete on main** via 2026-07-23 beastmode session — `services/connmem` (25 modules, 141 tests). **Not yet integrated:** no service entrypoint, no compose/topology entry, no kernel route, and the 141 tests do not run in CI (2026-07-24 architecture review, F1). Live backfill is blocked on runtime integration (v8.27 Phase 185), not only on the Linear + Circleback credentials tracked in `CONNMEM-LIVE-DEFER`)
- ✅ **v8.21 Reproducible Local Install Hardening** — Phase 177 (closed 2026-07-21; INSTALL-REPRO-01..06 merged into main; /api/health truthful on cordant-hermes-01 for all five core services including Agents and APO; install-regression --fast 9/9; Fable closeout PASS pending re-validation)
- 🔄 **v8.32 Easy Human + Agent Onboarding** — Phases 201–203 (added 2026-07-31; INVBOOT-01..06 shipped; **Phase 202 COWORK-01..05 closed 2026-07-31** — Cordant `/mcp` + Invite Cowork UX; Cowork UI tools-list operator confirmation remaining; Phase 203 Google account registration planned 2026-07-31, context filed)
- 🔄 **v8.31 Operator Config Durability + Storage Consolidation** — Phases 196-198 (added 2026-07-26 from the oracle-1 hardening session; CFGDUR-01..06 + HOSTPAR-01..04 + STORECON-01..05; make host configuration survive upgrades by construction, bring cordant-hermes-01 to oracle-1 parity, and decide SQLite→Postgres/Supabase on measured evidence. This milestone exists because a silent config regression disconnected Neo4j Aura and was found by accident)
- ✅ **v8.22 Paperclip/MemroOS Two-Seam Memory Integration** — Phase 178 (implementation complete on main: `apps/memroos/src/app/api/paperclip/*` (67/67 tests), `components/flow/paperclip-fleet-panel.tsx`, `docs/integrations/paperclip.md` §4 Memory Path FLEET-2x clause added in commit `68879a1e`, `docs/integrations/paperclip-option-d-2026-07-21.md`; 67/67 paperclip+flow tests pass; MEMCLIP-01..05 implementation complete — final acceptance against a live Paperclip tenant remains the operator's gate)
- ✅ **v8.27 Connected Work Memory Runtime Integration** — Phase 185 (closed 2026-07-31; CONNMEM-RT-01..05 evidenced; live provider backfill still credential-gated)
- ✅ **v8.28 Enforcement Surface Parity** — Phases 186-187 (closed 2026-07-31; TOPOPROD-01..04 + AUTHGATE-01..03 evidenced)
- 📋 **v8.29 Structural Debt Paydown** — Phases 188-190 (added 2026-07-24 from architecture review F4/F5/F6; STORE-01..04 governed data-access chokepoint with shrinking better-sqlite3 allowlist, LIBNORM-01..03 lib/ boundary normalization, CLIENTSPLIT-01..02 api-client barrel split; incremental, no big-bang rewrites)
- 📋 **v8.30 Seamless Memory Adoption** — Phases 191-195 (added 2026-07-26 from operator session; PRIORWORK-01..05 agent-reachable prior-work probe wiring the orphaned Phase 118 kernel, SELFCAP-01..05 session hooks + agent self-capture + structured sidecar extraction, SAVEQ-01..05 save-quality gate + governed-tool parity + automatic silver→gold promotion, MEMHABIT-01..05 auto-load recall/save skills + skill-packs bootstrap fix, ADOPTTEL-01..05 NOC adoption panel + GSD memory-receipt closeout gate; design: `.planning/design/memory-adoption-v1.md`)
- 🔄 **v8.33 Ledger + Dashboard Data Honesty** — Phases 204-205 (added 2026-07-31 from the operator dashboard-accuracy session; LEDGHON-01..05 Ledger RTK removal + model-usage double-count guard + workflow map render fix in progress on working tree; KNOWPROV-01..05 oracle knowledge/skills point-and-index provisioning planned, operator-gated)

## Phases

## Current v8.20 Connected Work Memory Summary — PLANNED — HIGHEST PRIORITY

- [ ] **Phase 176: Linear + Circleback Unified Memory Ingestion** — CONNMEM-01..10; implement least-privilege provider authorization, an explicit company-boundary inventory, a canonical source envelope and sync ledger, complete historical and incremental Circleback ingestion, a multi-workspace Linear adapter, signed webhooks plus reconciliation, permission-aware QMD/mem0/graph projections, unified cross-source recall, deletion/retention propagation, operator observability, and provider-total-to-index proof.
- [ ] **Phase 176 company-completeness gate:** “entire company” means every object exposed to company-managed authorized identities across every approved Linear organization/workspace and Circleback team/account/user source. Linear must include explicitly authorized private teams and archived resources—not only `allPublicTeams`. Circleback tenant-wide/admin visibility and any distinct memories/insights endpoint are currently unproven and must be verified through installed-interface discovery/provider support or covered by approved per-user authorizations; unknown or inaccessible families fail closed.
- [ ] **Phase 176 release gate:** reconcile provider inventory totals by source/object family to fetched, unique, filtered, failed, tombstoned, and indexed totals; prove idempotent backfill, update/delete propagation, authorization boundaries, source citations/deep links, stale-claim supersession, and representative Circleback↔Linear cross-source recall using sanitized evidence. The operator may not display “entire company indexed” until this ledger is green.

Full plan: `.planning/phases/176-linear-circleback-unified-memory/176-01-PLAN.md`. Provider research: `.planning/phases/176-linear-circleback-unified-memory/PROVIDER-COVERAGE-RESEARCH.md`.

## Current v8.21 Reproducible Local Install Hardening Summary — CLOSED 2026-07-21

- [x] **Phase 177: Reproducible Local Install Hardening** — INSTALL-REPRO-01..06 closed; eight commits on the install-repro-177 branch were merged into main on 2026-07-21 (merge 5d10b959). Fable closeout verdict: CONDITIONAL PASS (evidence-packaging gap only; all six sub-IDs GREEN).
  - [x] **INSTALL-REPRO-01 — Restore canonical local installer profile:** Merged 40923919 onto origin/main (commit 023185e1, then merge 5d10b959). A fresh `git clone` followed by `install.sh --local` now ships `docker-compose.local.yml` and accepts the `--local` flag out of the box.
  - [x] **INSTALL-REPRO-02 — Make runtime paths portable:** `.env.example` paths converted to `${HOME}`-anchored defaults that Docker Compose expands on read (verified via `docker compose config`). `install.sh` generates `.env` with `envsubst` (preferred) or POSIX shell-eval fallback; `.env` is mode 600. Grep across runtime config returns zero hits for `/Users/yourname` or `/home/yourname`.
  - [x] **INSTALL-REPRO-03 — Wire Agents and APO intentionally:** `docker-compose.local.yml` passes `AGENT_CONFIGS_PATH` (with `MEMROOS_AGENT_CONFIGS_CONTAINER_PATH` override knob) and `APO_PROPOSALS_PATH` to the app container. Bug fix dc53a951 decoupled the in-container value from the host-path value, resolving a latent bug where `/api/health` reported Agents='down' after a clean install. APO bind mount passes the host path through. Independent mount at `/agent-configs` is documented and works when `AGENT_CONFIGS_HOST_PATH` is set.
  - [x] **INSTALL-REPRO-04 — Fix production typecheck without masking configs:** Narrowed exclusion to `**/vitest*.config.ts` only. `npm run build` succeeds; injection tests confirm `next.config.ts` and `playwright.config.ts` are typechecked (errors surface when fake errors are added), while `vitest.slow.config.ts` is excluded (no error surfaces). `postcss.config.mjs` and `eslint.config.mjs` are not in the typecheck error list (they are typechecked and pass).
  - [x] **INSTALL-REPRO-05 — Add destructive-safe reinstall regression coverage:** `scripts/install-regression/install-regression.sh` (--fast + --full modes) plus `.github/workflows/install-regression.yml` (PR fast job + branch-targeted full disposable-host job). --fast passes 9/9 structural checks; partial --full run captured closeout-evidence/05-regression-full-partial.txt demonstrating named-volume preservation, post-up smoke checks, and a second `install.sh --local` exiting 0.
  - [x] **INSTALL-REPRO-06 — Review production dependency advisories:** 12 findings (4 high, 6 moderate, 2 low, 0 critical) triaged across 8 ticket IDs (INSTREP-06-001..008). Raw npm audit JSON archived in closeout-evidence/npm-audit-current.json. No `npm audit fix --force` was run.


### Current v8.19 Runtime Bottleneck Evidence Summary — INFRASTRUCTURE COMPLETE; MEASUREMENT RUNS DEFERRED

- [x] **Phase 175 infrastructure**: retrieval-bench module (204 vitest tests pass), schemas (`runtime-bottleneck-evidence.schema.json`, `runtime-bottleneck-decision.schema.json`), checker (`scripts/check-runtime-bottleneck-evidence.mjs`), manifest generator, contract (`scripts/runtime-bottleneck-contract.mjs`), and 22 node-test cases pass.
- [x] **Phase 175 initial decision**: `.planning/decisions/runtime-bottleneck.json` records `keep` because no Phase 175 measurement evidence has been collected yet. Per the decision gate (no SLO misses detectable without evidence), `keep` is the only valid choice.
- [ ] **Phase 175 measurement runs**: deferred. Requires a live memroos server with all dependencies (Qdrant Cloud, Neo4j Aura, Ollama, LLM) plus 300s+ operator runs and 2 retrieval runs. Cannot be executed in the current environment.
- [ ] **Phase 175 re-decision**: re-run `node scripts/check-runtime-bottleneck-evidence.mjs` after the measurement runs exist; upgrade `keep` to `optimize-current-stack` or `bounded-shadow-extraction` per the decision gate.


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

- [x] **Phase 119: Future Spike Queue Closeout** — MEMGEN-FOLLOWUP-02, COCOINDEX-FOLLOWUP-01, FASTCONTEXT-FOLLOWUP-01, ADKA2A-FOLLOWUP-01, QDRANT-FOLLOWUP-01, HYPEREXTRACT-FOLLOWUP-01, GRAPHGUIDE-FOLLOWUP-01, and SIMPLIFY-FOLLOWUP-01 completed as bounded spike reports under `.planning/spikes/`, with `npm run check:future-spikes` enforcing required report sections and guardrails. No dependency adoption, backend swap, hosted/private upload, production indexing, Qdrant upgrade, runtime replacement, default extraction behavior, or 4th architecture-reviewer claim against `simplify-code` is approved.

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
- [x] **Phase 125: Multi-Tenant Vaults + Central Tamper-Evident Audit** — ENTOPS-02, ENTOPS-03 (completed 2026-07-07; per-tenant vault isolation with operator-mode fail-closed guard, MCP→operator central hash-chained audit bridge, SIEM/DSAR export by user; Beastmode watcher PASS after chain-race + fail-open hardening)
- [x] **Phase 126: Operator-Stub Distribution + Day-1 Onboarding** — ENTOPS-04, ENTOPS-05, ENTOPS-06 (code slice completed 2026-07-16; IdP/MDM/S9/S10 remain handoff stubs — see `docs/entops-stub-handoff.md`)
- [x] **Phase 127: Write-Side Native-Memory Enforcement + Exit Tool** — ENTOPS-07, ENTOPS-08 (code slice completed 2026-07-16; ENTOPS-08 closed; ENTOPS-07 operator sink shipped, per-harness wiring stubbed — see `docs/entops-stub-handoff.md`)

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
**Plans**: 1/1 complete (`126-01` — code slice 2026-07-16; IdP/MDM/S9/S10 still handoff)
**UI hint**: yes (onboarding + budget admin)

### Phase 127: Write-Side Native-Memory Enforcement + Exit Tool
**Goal**: Native memory files become an output of MemroOS sync rather than an input, and procurement-grade exit/DSAR tooling ships.
**Depends on**: Phase 126
**Requirements**: ENTOPS-07, ENTOPS-08
**Success Criteria** (what must be TRUE):
  1. Harness auto-memory writes (Claude auto-memory, Hermes `memory add`, Codex `/memory`) route to MemroOS first, are filtered/sanitized, and replay into local files under the server-enforced budget; `directive_diff` alerts on drift and never deletes
  2. Hermes MEMORY.md retains its skills-routing layer — only the directive body is stubbed (regression-tested against Hermes routing behavior)
  3. `memroos export --flat` produces a markdown tarball + signed manifest of the org vault; per-user DSAR export (vault + audit trail) works in one action; right-to-delete tombstones via MEMLIFE semantics without breaking the audit chain
**Plans**: 1/1 complete
**UI hint**: yes

## v8.2 Team-Scale Access + Policy Plane (Phases 128-131) — PLANNED

One declarative policy engine with decision receipts replacing scattered gate logic, plus teams/spaces and human+agent identity lifecycle for the 100-person agentic-heavy ICP — running on the v8.1 multi-tenant substrate. ICP scenarios: S1, S4, S7 (access half).

- [x] **Phase 128: Policy Engine Core + Decision Receipts** — POLGOV-01, POLGOV-02 (completed 2026-07-07; wrap-not-rewrite engine delegates to authorizeMemoryUse + checkDispatchPolicy/checkA2aSendPolicy/checkMemoryWritePolicy, adds versioned manifest + POLICY_DECISION audit receipts; MEMSEC-08 byte-identical; GLM-5.2 validator PASS)
- [x] **Phase 129: Policy Dimensions, Shadow Mode + CI Regression** — POLGOV-03, POLGOV-04, POLGOV-05 (completed 2026-07-07; additive dimension rules (subject/object/action/purpose) that only tighten to deny, shadow mode with proposed manifest replay + operator-gated activation, CI regression corpus with approved-diffs override; MEMSEC-08 byte-identical; GLM-5.2 validator PASS)
- [x] **Phase 130: Teams/Spaces + Knowledge-Repo Labels** — TEAMSCALE-01, MSIQ-01, MSIQ-02, MSIQ-03 (completed 2026-07-07; spaces + space_members schema with membership and zero cross-space leakage; knowledge frontmatter label validation (sensitivity/authoritative/verified_at/expires_at); label-aware search/read authorization (default-open for unlabeled); ranking boosts authoritative + demotes expired + flag job; GLM-5.2 validator PASS)
- [x] **Phase 131: Identity Lifecycle + Delegation Chains** — TEAMSCALE-02, TEAMSCALE-03, TEAMSCALE-04, TEAMSCALE-05, TEAMSCALE-06 (completed 2026-07-07; atomic joiner/leaver flows with onboarding/offboarding receipts, scanOrphanedAgents; verifiable delegation chains with weakest-link policy; per-team NOC views; owner-gated assets with standing/per-use approval; GLM-5.2 validator PASS)

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

## v8.3 Agent OS GSD Stack (Phases 132-136) — COMPLETE

Source: 2026-07-06 Mark Kashef full-channel transcript audit and prioritization (`content/research/mark-kashef-youtube-transcript-audit-2026-07-06.md`, `content/research/mark-kashef-agent-stack-prioritization-2026-07-06.md`). Decision: implement the stack through GSD as a MemRoOS-native control plane, not as a Hermes/OpenClaw replacement project. Hermes, Discord, Telegram, Codex, Claude Code, and future UIs are adapters. MemRoOS owns context, task state, proof, policy, skill contracts, evals, and routing receipts.

**Skill boundary rule:** bundle a capability as a skill only when it is a portable, repeatable procedure an agent should carry across runtimes. Embed it in MemRoOS when it requires product state, schema, API, policy, audit/proof receipts, or shared persistence.

- [x] **Phase 132: Agent Context Packet + Run Ledger** — GSDSTACK-01, GSDSTACK-02
- [x] **Phase 133: Shipcheck + Goal/Resume/Standup Commands** — GSDSTACK-03, GSDSTACK-04
- [x] **Phase 134: Portable Skill Boundary + Skill Audit** — GSDSTACK-05, GSDSTACK-06, GSDSTACK-07
- [x] **Phase 135: Lane Evals + Model Routing Policy** — GSDSTACK-08, GSDSTACK-09
- [x] **Phase 136: Thin Interface Adapters + Safety Slice** — GSDSTACK-10, GSDSTACK-11

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
**Status**: COMPLETE (2026-07-07). Implemented `apps/memroos/src/lib/gsd/skill-boundary-manifest.json`, `skill-boundary.ts`, `discuss.ts`, and agent-authenticated `GET /api/gsd/skill-boundary`, `POST /api/gsd/skill-audit`, and `POST /api/gsd/discuss`. Skill audit drafts SkillForge proposals and never auto-deletes registry rows.
**Success Criteria** (what must be TRUE):
  1. A skill-boundary manifest classifies candidate capabilities into `core_product`, `portable_skill`, `adapter_skill`, `reference_only`, or `defer`; classifications include rationale and owner
  2. Portable skills are limited to repeatable agent procedures: GSD roadmap operator, MemRoOS context consumer, shipcheck client wrapper, skill audit operator, bounded discuss/review council, and lane-specific research/code/handoff playbooks
  3. Core product features are explicitly barred from being shipped as skills-only: context packet schema, run ledger, proof gate, policy decisions, eval store, model-routing telemetry, audit chain, and adapter state
  4. `/skill-audit` reports missing owner, missing smoke test, stale review date, duplicate trigger, unsafe tool instructions, no examples, and no usage evidence; it drafts SkillForge proposals but does not auto-delete
**Plans**: 1/1 complete (`.planning/phases/134-portable-skill-boundary-skill-audit/134-01-PLAN.md`)
**UI hint**: yes (skill boundary table + audit findings)

### Phase 135: Lane Evals + Model Routing Policy
**Goal**: Prove the stack improves real agent lanes and make model choice explicit, logged, and cheap by default where safe.
**Depends on**: Phase 132, Phase 133, Phase 57/94 (eval substrate), Phase 46/47 (model routing telemetry)
**Requirements**: GSDSTACK-08, GSDSTACK-09
**Status**: COMPLETE (2026-07-07). Implemented `apps/memroos/evals/gsd-lane-evals/cases.json`, `lane-evals.ts`, `model-routing-policy.ts`, `GET/POST /api/gsd/lane-eval`, `GET/POST /api/gsd/model-route`, and `npm run check:gsd-lane-evals`.
**Success Criteria** (what must be TRUE):
  1. Research, code, memory, handoff, GTM, and safety lanes each have committed fixtures, scoring rubrics, and CI/scheduled eval runs
  2. Evals record source coverage, proof compliance, recall provenance, handoff resumability, GTM claim grounding, and safety gate outcomes into the run ledger
  3. Static model-routing policy maps task classes to cheap/local, frontier, private/customer-bound, vision, and validator models with explicit override reason
  4. Routing receipts record model, reason, cost estimate/actual, latency, and result quality; the first adaptive routing review is based on observed outcomes, not vibes
**Plans**: 1/1 complete (`.planning/phases/135-lane-evals-model-routing/135-01-PLAN.md`)
**UI hint**: yes (eval lane status + routing/cost report)

### Phase 136: Thin Interface Adapters + Safety Slice
**Goal**: Hermes/Discord/Telegram/Codex/Claude Code consume the same MemRoOS control plane without owning state, and adapter actions are guarded by the first safety slice.
**Depends on**: Phase 132, Phase 133, Phase 128/129 where available
**Requirements**: GSDSTACK-10, GSDSTACK-11
**Status**: COMPLETE (2026-07-07). Implemented `apps/memroos/src/lib/gsd/adapters.ts`, `adapter-safety.ts`, and `GET/POST /api/gsd/adapter` with secrets/PII scan, destructive-action approval, cost cap, and honest shared-mode degradation.
**Success Criteria** (what must be TRUE):
  1. Hermes, Discord/Telegram, Codex, and Claude Code adapters can create tasks, request context, post proof receipts, ask for standup/resume, and request approvals through the same API/tool contract
  2. Adapter contract tests prove no adapter owns memory, task state, proof state, policy state, or model routing decisions
  3. Secrets/PII scanner, destructive-action approval gate, and cost cap checks run before adapter-triggered sends/writes/destructive actions
  4. Adapter failure degrades honestly: no silent local git fallback in shared mode, no unlogged writes, and no "done" messages without proof receipts
**Plans**: 1/1 complete (`.planning/phases/136-thin-adapters-safety-slice/136-01-PLAN.md`)
**UI hint**: no for MVP; later adapter health in NOC

---

## v8.4 Project-Centric Operator UX (Phases 137-141) — COMPLETE (2026-07-08)

Source: 2026-07-07 MemClaw competitor analysis (`content/research/memclaw-gap-analysis-2026-07-07.md`). MemClaw (Felo-Inc, MIT) ships 6 specific UX patterns today that MemroOS does not yet surface: single-load workspace binding, operator-visible write rules + document directory, `is_shared` boolean read-only flag, per-space cache invalidation transparency, and a save-artifact gate with auto-README update. None of these conflict with the standing gates (zero paid services, MIT-OSS only). Decision: borrow the UX patterns, preserve governance — embed them in MemroOS product, not as portable skills, because each touches shared persistence, schema, and operator surfaces.

**Borrowing rule:** ship MemClaw's operator-UX primitives (workspace load, write rules, document directory, `is_shared`, cache transparency, save gate), but keep MEMSEC labels, belief stages, evidence bundles, and hash-chained audit as first-class. MemroOS is self-hostable; MemClaw's hosted-LiveDoc backend is explicitly rejected per the enterprise review's SOC2 tenancy-collapse finding.

**Status note (2026-07-08):** STATE.md reports all 22 requirement IDs (WORKLOAD/WRITERULES/SHAREDRO/CACHEADMIN/ARTGATE) shipped across Phases 137-141. Roadmap checkboxes below remain as historical phase definitions; treat milestone as complete.

- [x] **Phase 137: Single-Load Workspace + Auto Context Packet** — WORKLOAD-01, WORKLOAD-02, WORKLOAD-03, WORKLOAD-04, WORKLOAD-05
- [x] **Phase 138: Operator-Visible Write Rules + Document Directory** — WRITERULES-01, WRITERULES-02, WRITERULES-03, WRITERULES-04, WRITERULES-05, WRITERULES-06
- [x] **Phase 139: is_shared: Single-Boolean Read-Only Toggle** — SHAREDRO-01, SHAREDRO-02, SHAREDRO-03
- [x] **Phase 140: Per-Space Cache + Invalidation Surface** — CACHEADMIN-01, CACHEADMIN-02, CACHEADMIN-03, CACHEADMIN-04, CACHEADMIN-05
- [x] **Phase 141: Save-Artifact Gate + Auto-README Update** — ARTGATE-01, ARTGATE-02, ARTGATE-03

---

## v8.5 Agent Fleet Plane (Phases 142-147) — COMPLETE (2026-07-10)

Source: 2026-07-08 Discord #devops thread "Agent fleet control tooling research" + deep research package:
- `content/architecture/memroos-as-agent-fleet-plane-2026-07-08.md`
- `content/research/agent-control-planes-2026.md`
- `content/audits/paperclip-control-plane-audit-2026-07-08.md`
- `.planning/milestones/v8.5-agent-fleet-plane-KICKOFF.md`
- `.planning/research/agent-fleet-plane-2026-07-08.md`

**Decision locked for planning:** MemroOS is the top-layer fleet plane (registry + memory + governance + A2A + NOC) that manages agents **directly** across runtimes. LangGraph is a **peer** orchestration runtime under the existing Orchestration Proxy (stateful graphs, checkpoints, HIL) — not a competing control plane and not reimplemented. Paperclip is a **parallel product plane / tenant** (companies, issues, budgets, board UI) that subscribes via adapters/MCP/A2A; it is **not** above MemroOS and does not own the cross-runtime fleet view.

**Rejected alternatives (research-backed):**
- LangGraph-as-fleet-control-plane (runtime ≠ org/governance plane)
- "Gardner" / "Gardnr" / "Garden" OSS agent orchestrator (no such project; Vertex Agent Garden / SAP Gardener unrelated)
- Archestra as default top layer (closest governance cousin; **AGPLv3 + Enterprise** dual license)
- CrewAI Agent Control Plane (cloud AMP feature; Rules editing Enterprise/Ultra)
- AWS Bedrock AgentCore / Azure AI Foundry Agent Service / Vertex AI Agent Engine (cloud-only; reference only)

**Scenario this milestone must survive:**
- **S12 — Multi-machine fleet under one operator:** Mac workstation + remote Hermes/OpenClaw gateways; MemroOS registry/NOC is source of truth for agents; Paperclip company still enforces budgets; LangGraph multi-step HIL works without Paperclip being the top layer.

- [x] **Phase 142: Fleet Architecture Lock + Validation Gate** — FLEET-01, FLEET-02, FLEET-03, FLEET-04
- [x] **Phase 143: Runtime Adapter Maturity Matrix** — FLEET-05, FLEET-06, FLEET-07, FLEET-08
- [x] **Phase 144: LangGraph Peer Contract + Checkpoint Durability** — FLEET-09, FLEET-10, FLEET-11, FLEET-12
- [x] **Phase 145: Pre-Execution Policy Gate (OPA/Rego)** — FLEET-13, FLEET-14, FLEET-15, FLEET-16
- [x] **Phase 146: Paperclip Tenant Integration + Cost Delegation** — FLEET-17, FLEET-18, FLEET-19, FLEET-20, FLEET-21
- [x] **Phase 147: Secrets Broker + Kernel HA Path** — FLEET-22, FLEET-23, FLEET-24, FLEET-25, FLEET-26

### Phase 142: Fleet Architecture Lock + Validation Gate
**Goal**: Make the MemroOS-top / LangGraph-peer / Paperclip-tenant decision binding in product docs and GSD, with independent second-opinion model validation (not MiniMax self-validation) and scenario S12 recorded.
**Milestone**: v8.5
**Depends on**: Phase 115 (architecture identity), Phase 136 (thin adapters), research package 2026-07-08
**Requirements**: FLEET-01, FLEET-02, FLEET-03, FLEET-04
**Success Criteria** (what must be TRUE):
  1. `docs/architecture.md` links the fleet-plane decision and states the three-layer roles (MemroOS / LangGraph / Paperclip) in one paragraph operators can quote
  2. An independent validation artifact exists with provenance `model:` **not** MiniMax-M3; reject/amend loop opened if verdict fails
  3. Scenario S12 is in the roadmap backlog and referenced by FLEET requirements
  4. Planning index under `.planning/research/agent-fleet-plane-2026-07-08.md` points at all three content artifacts
**Plans**: 1 potential plan (`.planning/phases/142-fleet-architecture-lock/142-01-PLAN.md`)
**UI hint**: no (docs + validation)

### Phase 143: Runtime Adapter Maturity Matrix
**Goal**: Publish honest T1/T2/T3 maturity for every install-agent-integrations target so fleet diagrams stop implying equal readiness.
**Milestone**: v8.5
**Depends on**: Phase 142 (decision locked), `scripts/install-agent-integrations.sh`
**Requirements**: FLEET-05, FLEET-06, FLEET-07, FLEET-08
**Success Criteria** (what must be TRUE):
  1. `docs/runtime-adapter-maturity.md` lists every installer target with T1/T2/T3, evidence, and owner
  2. T1 means shipped + smoke-tested + governance-hook path available; T3 is explicitly stub/unproven
  3. Installer target list and matrix rows cannot silently drift (documented check or CI note)
  4. Hermes and OpenClaw maturity claims cite real adapter evidence (MemroOS and/or Paperclip)
**Plans**: 1 potential plan (`.planning/phases/143-runtime-adapter-maturity/143-01-PLAN.md`)
**UI hint**: optional maturity badge later; docs-first is enough for phase close

### Phase 144: LangGraph Peer Contract + Checkpoint Durability
**Goal**: Pin LangGraph as a peer under the Orchestration Proxy — contract + durability — without rebuilding StateGraph inside MemroOS.
**Milestone**: v8.5
**Depends on**: Phase 142, existing orchestration proxy / langgraph integration
**Requirements**: FLEET-09, FLEET-10, FLEET-11, FLEET-12
**Success Criteria** (what must be TRUE):
  1. `docs/integrations/langgraph.md` documents input/output schema, checkpoint layout, HIL protocol, and failure modes
  2. Ownership split is explicit: MemroOS owns agent identity/memory/audit; LangGraph owns graph execution/checkpoints
  3. Checkpoint durability path exists (litestream **or** Postgres checkpointer behind flag) with restore steps
  4. One multi-step graph smoke: interrupt → resume with receipt
**Plans**: 1 potential plan (`.planning/phases/144-langgraph-peer-contract/144-01-PLAN.md`)
**UI hint**: HIL surfaces already exist; contract is primary deliverable

### Phase 145: Pre-Execution Policy Gate (OPA/Rego) — COMPLETE
**Goal**: Evaluate policy **before** tool execution on at least one T1 runtime path so governance is not audit-after-the-fact only.
**Milestone**: v8.5
**Depends on**: Phase 143 (know T1 adapters), POLGOV plane (receipt shape), Phase 76 retrieval gate patterns
**Requirements**: FLEET-13, FLEET-14, FLEET-15, FLEET-16
**Success Criteria** (what must be TRUE):
  1. Pre-exec gate runs on Hermes (or first T1) tool path with actor/action/purpose/labels input ✅
  2. Deny blocks execution and emits policy receipt (version + rule + reason) ✅
  3. Headless runs fail closed (no silent allow) ✅
  4. MEMSEC-08 regression corpus remains green ✅
**Plans**: 1 plan + 1 summary (`.planning/phases/145-pre-exec-policy-gate/145-01-PLAN.md`, `145-01-SUMMARY.md`)
**UI hint**: receipt in NOC governance strip / run ledger
**Status**: COMPLETE / LOCKED (2026-07-09). Validator: beastmode-validator (GLM-5.2 BYOK) — PASS.

### Phase 146: Paperclip Tenant Integration + Cost Delegation — COMPLETE
**Goal**: Treat Paperclip as a parallel tenant: contract + minimal integration + budget hard-stop ownership stays in Paperclip.
**Milestone**: v8.5
**Depends on**: Phase 142, Paperclip audit (`content/audits/paperclip-control-plane-audit-2026-07-08.md`)
**Requirements**: FLEET-17, FLEET-18, FLEET-19, FLEET-20, FLEET-21
**Success Criteria** (what must be TRUE):
  1. `docs/integrations/paperclip.md` states ownership boundaries and rejects MemroOS re-implementation of board budgets ✅
  2. At least one live or contract-tested path: Paperclip activity → MemroOS visibility **or** MemroOS incident → Paperclip issue ✅
  3. Cost/budget hard-stop is delegated to Paperclip (documented API/source of truth) ✅
  4. No multi-Paperclip federation attempted ✅
  5. Hermes adapter passivity (runtime must already exist) is documented so operators do not expect Paperclip to provision hosts ✅
**Plans**: 1 plan + 1 summary (`.planning/phases/146-paperclip-tenant-integration/146-01-PLAN.md`, `146-01-SUMMARY.md`)
**UI hint**: optional NOC tenant strip; contract-first
**Status**: COMPLETE / LOCKED (2026-07-09). No new runtime deps; MEMSEC-08 regression green; 24 new tests pass.

### Phase 147: Secrets Broker + Kernel HA Path — COMPLETE
**Goal**: Minimum secrets + HA/durability path so fleet is not permanently single-host SQLite without a restore story.
**Milestone**: v8.5
**Depends on**: Phase 144 (checkpoint durability alignment), Phase 146 optional
**Requirements**: FLEET-22, FLEET-23, FLEET-24, FLEET-25, FLEET-26
**Success Criteria** (what must be TRUE):
  1. Secrets path for adapter keys documented (and used for at least one key class); no secrets in git/receipts ✅
  2. Kernel durability path (litestream or Postgres) documented with one executed restore drill ✅
  3. LangGraph checkpoint durability aligned with Phase 144 ✅
  4. Stretch multi-machine identity (SPIFFE/SPIRE, Envoy ratelimit) documented as **not v8.5** ✅
  5. Auto-provision new agent hosts remains explicitly out of scope (industry gap) ✅
**Plans**: 1 plan + 1 summary + 1 drill log (`.planning/phases/147-secrets-fleet-ha/147-01-PLAN.md`, `147-01-SUMMARY.md`, `restore-drill-log.md`)
**UI hint**: no
**Status**: COMPLETE / LOCKED (2026-07-10). No new runtime deps; MEMSEC-08 regression green (25/25); restore drill passed (53 agents, 5301 audit_log, 6341 audit_entries, schema v10, 92 tables, integrity ok). v8.5 milestone COMPLETE — all 26 FLEET requirements shipped across Phases 142-147.

---

### Phase 137: Single-Load Workspace + Auto Context Packet
**Goal**: One operator command ("load <space>") primes the Agent Context Packet for that space and binds it as the active workspace for all subsequent writes, reads, and NOC/lane surfaces.
**Depends on**: Phase 132 (Agent Context Packet + Run Ledger), Phase 130 (Teams/Spaces)
**Requirements**: WORKLOAD-01, WORKLOAD-02, WORKLOAD-03, WORKLOAD-04, WORKLOAD-05
**Success Criteria** (what must be TRUE):
  1. An operator-facing `/load <space>` (or "load Client X") command primes the Agent Context Packet for the named space and binds it as the active workspace for all subsequent writes, reads, and the NOC/lane surfaces
  2. When a space is loaded, the active workspace is recorded in the run ledger as an event with actor, space id, and timestamp; the load is replayable
  3. Adapter calls without an active workspace prompt the operator to select one (matches MemClaw's "There is no active project right now — which project do you want to operate on?"); the prompt is a single confirmation, not a recurring permission dialog
  4. The active workspace is visible in the operator console header at all times
  5. Headless / non-interactive agent runs (no operator present) **fail closed**: no silent default workspace, no last-used-workspace fallback in shared/team mode, the load event references actor="system:headless" and a run-ledger reason
  6. Cross-space read is allowed but always policy-receipted; the loaded space is the **write target**, not the read universe
**Plans**: 0/? planned
**UI hint**: yes (active workspace chip in header, load-space command output card, ledger event row)

### Phase 138: Operator-Visible Write Rules + Document Directory
**Goal**: Make "what goes into which space" a table the operator can read and edit, not an internal adapter detail.
**Depends on**: Phase 83 (Memory Inventory Clarity), Phase 130 (Teams/Spaces)
**Requirements**: WRITERULES-01, WRITERULES-02, WRITERULES-03, WRITERULES-04, WRITERULES-05, WRITERULES-06
**Success Criteria** (what must be TRUE):
  1. Each space has a declarative "Write Rules" table (data type → target document/resource) editable in the operator UI
  2. The agent's memory adapter consults the Write Rules table before routing a save; mismatches are surfaced as receipts, not silently re-routed
  3. Each space has a Document Directory (name + purpose + resource/artifact id) editable in the operator UI; this is the agent's and the operator's shared lookup table
  4. Write Rules + Document Directory changes ship in the run ledger so the agent's view stays in sync with the operator's; stale rules trigger a drift receipt
  5. Concurrency: operator edits to Write Rules / Document Directory are **versioned + locked**; concurrent agent writes during an edit either wait or fail with a policy receipt (no silent overwrite, no race-condition loss)
  6. Write Rules are schema-validated (data type, target document, fallback rule); invalid rules are rejected at edit time with a structured error, not at write time with a silent reroute
**Plans**: 0/? planned
**UI hint**: yes (Write Rules table view, Document Directory view per space, drift receipt in NOC)

### Phase 139: is_shared: Single-Boolean Read-Only Toggle
**Goal**: Replace multi-step policy edit with a one-click "Share read-only" toggle that is enforced at the retrieval gate, not as a UI-only switch.
**Depends on**: Phase 76 (Retrieval Authorization Gate), Phase 130 (Teams/Spaces), Phase 137 (Single-Load Workspace)
**Requirements**: SHAREDRO-01, SHAREDRO-02, SHAREDRO-03
**Success Criteria** (what must be TRUE):
  1. A single boolean `is_shared` flag on a space makes it read-only for all agents (no writes, no README updates, no document creation); the flag is enforced at **both** the retrieval gate (Phase 76, read-side) **and** the write-persistence gate (memory adapter write path, save-artifact path, README-update path, document-creation path), not as a UI-only toggle. A single source of truth (the space record) drives both enforcement points.
  2. The `is_shared` flag is policy-receipted: every read or attempted write produces a receipt that references the flag and the space id, so the audit chain explains why a write was blocked
  3. Operator UI shows a single "Share read-only" toggle per space; toggling emits a run-ledger event with actor and timestamp; toggling off requires a policy reason
**Plans**: 0/? planned
**UI hint**: yes (per-space share toggle, attempted-write receipt, share-state in NOC)

### Phase 140: Per-Space Cache + Invalidation Surface
**Goal**: Make per-space cache state visible and invalidatable to the operator; align with MemClaw's transparent cache path (`~/.memclaw/cache/{livedocid}/{resource_id}_{ts}.md`).
**Depends on**: Phase 76 (Retrieval Authorization Gate), Phase 137, Phase 139 (is_shared enforcement)
**Requirements**: CACHEADMIN-01, CACHEADMIN-02, CACHEADMIN-03, CACHEADMIN-04, CACHEADMIN-05
**Success Criteria** (what must be TRUE):
  1. Each space exposes its current cache state (per-resource last-fetched timestamp, total cached size, retrieval count) in the operator UI
  2. Operator can invalidate a single resource cache or the whole space cache; invalidation emits a run-ledger event
  3. Cache invalidation respects MEMSEC labels and the `is_shared` flag; shared read-only spaces expose invalidate-from-source only with a policy receipt
  4. Thundering-herd protection: cache invalidation is rate-limited and bounded per space; concurrent invalidations for the same resource coalesce into a single event; an invalidation loop (operator action repeated >N times in <T) emits a rate-limit receipt
  5. Invalidation events are queryable from the run ledger (who invalidated what, when, why) and are surfaced in the NOC governance strip
**Plans**: 0/? planned
**UI hint**: yes (per-space cache panel, invalidate-resource action, ledger event)

### Phase 141: Save-Artifact Gate + Auto-README Update
**Goal**: One "Save to current space?" prompt for long-form artifacts, with auto-README/Document Directory update; matches MemClaw's "ask once, never again" pattern but keeps evidence-bundled receipts.
**Depends on**: Phase 137, Phase 138
**Requirements**: ARTGATE-01, ARTGATE-02, ARTGATE-03
**Success Criteria** (what must be TRUE):
  1. When the agent produces a long-form artifact (report, document, deck) for a loaded space, the operator gets a single "Save to <space>?" prompt — no recurring permission dialog
  2. On save, the agent appends the artifact to the Document Directory (or creates a new document) and emits a run-ledger event with the resource id and belief stage
  3. On save, the agent updates the space README's "Last artifact" pointer in the Document Directory; the operator can disable auto-update per-space; auto-updates are policy-receipted
**Plans**: 0/? planned
**UI hint**: yes (save prompt card, document directory refresh, ledger event)

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
4. **P0 — v8.3 Agent OS GSD Stack — COMPLETE (Phases 132-136 complete 2026-07-07).** `GSDSTACK-01..11`. Context packet, run ledger, shipcheck, goal/resume/standup, portable skill boundary, skill audit, lane evals, model routing, thin adapters, and safety slice. This is the implementation spine that makes Hermes/Discord/Telegram/Codex/Claude replaceable interfaces over MemRoOS rather than competing OSes. Scenario: S11.
5. **P0 — v8.4 Project-Centric Operator UX — COMPLETE (Phases 137-141 complete 2026-07-08).** `WORKLOAD-01..05`, `WRITERULES-01..06`, `SHAREDRO-01..03`, `CACHEADMIN-01..05`, `ARTGATE-01..03`. MemClaw operator-UX parity while preserving MEMSEC/belief/evidence/audit.
6. **P0 — v8.5 Agent Fleet Plane — PLANNED as Phases 142-147 (2026-07-08, from fleet control tooling research).** `FLEET-01..26`. MemroOS is the top-layer fleet plane across runtimes; LangGraph is a peer orchestration runtime; Paperclip is a parallel tenant for company/budget/board. Closes the "who governs agents on many machines" decision without adopting Archestra (AGPL) or rebuilding LangGraph as a control plane. Scenario: **S12**. Kickoff: `.planning/milestones/v8.5-agent-fleet-plane-KICKOFF.md`.
7. **P1 — v8.6 Skill Trust Chain — COMPLETE (Phases 148-150 closed 2026-07-16).** `SKILLTRUST-01..05` (was v8.5; renumbered 2026-07-08 to insert fleet plane). Contracts, signing/provenance, quarantine lane, governed sync, lifecycle states. Scenario: S6. Planning closeout: `.planning/phases/148-skill-contracts-signing/`, `149-skill-quarantine-governed-sync/`, `150-skill-lifecycle/`.
8. **P1 — v8.7 Memory Lifecycle + Erasure — COMPLETE (code + REQUIREMENTS closeout 2026-07-16).** `MEMLIFE-01..05` (was v8.6). Retention per type+label, verified derivative-chasing erasure, subject-scoped erasure plans, decay/consolidation into the raw vault, chain-safe tombstones. Scenario: S7 (data half). Evidence: `apps/memroos/src/lib/memory/*` + lifecycle APIs + Vitest.
9. **P1 — v8.8 Orchestration Evidence Depth — MOSTLY COMPLETE (2026-07-16).** (was v8.7). Harness Control Plane + evidence governance, `MSIQ-04..05` shipped (`lib/federation/*`), `ORCH-FOLLOWUP-01` multi-hop compensation closed. **`MSIQ-06` remains open** (bounded GraphRAG spike — Luis approval-gated). Consumes receipts from v8.0–v8.5; fleet plane pre-exec receipts (v8.5 Phase 145) feed this lane.
10. **P2 — v8.9 Retrieval Quality + External Benchmark Proof — PARTIAL (2026-07-16).** (was v8.8). LoCoMo/LongMemEval lanes + comparative bench plan (`BENCH-01..03`) already done. **Voyage embedding upgrade + LLM recall scoring remain deferred / approval-gated** (Backlog / Later Ideas).
11. **P2 — v8.10 Governed Ontology Foundation — COMPLETE (code + REQUIREMENTS closeout 2026-07-16).** `ONTO-01..06` (was v8.9). Fixed upper ontology + domain packs + SEAL-governed promotion + typed receipt refs. Evidence: `apps/memroos/src/lib/ontology/*`.
12. **P1 — v8.11 Unified Meeting Memory — COMPLETE (Phases 151-153 complete 2026-07-14).** `MEETREL-01..04`, `URECALL-01..06`. Idempotent meeting ingest + federated `memory_recall` so agents find Circleback/Fathom/Zoom without knowing collection names. Kickoff: `.planning/milestones/v8.11-unified-meeting-memory-KICKOFF.md`.
13. **P0 — v8.13 Memory Tier Catchup + Install Wiring — IN PROGRESS (Phases 157-159 added 2026-07-17).** `MEMTIER-01..06`. Close the gap where vector (Qdrant/mem0) can be live while graph (Neo4j) stays empty: one-shot + scheduled synergistic projection (entities/relationships, not duplicate blob store), cron-health registration, and `setup.sh` / memory-resilience install so catchup jobs are part of product install—not ops folklore. Also covers operator honesty when NOC Last-24h is empty while inventory still has historical data. Observed gap 2026-07-17: ~628 Qdrant points vs 2 Neo4j probe nodes; install only wired healthcheck/degradation-evals, not tier fill.
14. **P1 — v8.14 Human Wiki Surface + Memory Digest — PLANNED (Phases 160-162 added 2026-07-17).** `WIKISURF-01..08`. Regular job digests mem0/journals into `llm-wiki` pages (Obsidian already reads the vault). MemRoOS ships Obsidian-like `/wiki` browse (folder tree, markdown, wikilinks, search) plus light graph from compiled `knowledge-graph.json`. Seed digest landed manually 2026-07-17 in `~/github/knowledge/llm-wiki/wiki/07-memroos-platform/`. Kickoff: `.planning/milestones/v8.14-human-wiki-surface-KICKOFF.md`.
15. **P0 — v8.15 Always-On Cloud Operator (oracle-1) — PLANNED (Phases 163-166 added 2026-07-17).** `CLOUDOPS-01..08`. One MemRoOS brain without laptop or paid Heroku: deploy operator+mem0+SQLite on Tailscale host `oracle-1` (10Gi aarch64, checked idle 2026-07-17), Cloudflare Tunnel for `memroos.epiloguecapital.com`, shared Aura+Qdrant, Ollama `nomic-embed-text` on-box ($0), Voyage provider as cheap cloud embed fallback phase, Heroku operator domain removed / web scaled to 0. Mac = dev only. Plan: `~/.cursor/plans/mac-as-prod_memroos_d4133d54.plan.md`.
16. **P0 — v8.16 Multi-Harness Observe Plane — PLANNED (Phases 167-171 added 2026-07-17).** `OBSERVE-01..14`. Capture work from **agents already onboarded to MemRoOS** (registry + MCP), not only greenfield installs. Employee story: remote MCP + observe sidecar; default depth **relevant** (upgradable later). Wave 1: Claude, Codex, Hermes, OpenClaw, **Pi** (first-class `AgentPlatform`; sessions under `~/.pi/agent/sessions/`). Wave 2: Cursor, Factory/Droid. Wave 3: Antigravity + any remaining gaps. MCP alone is not a wiretap. Kickoff: `.planning/milestones/v8.16-multi-harness-observe-KICKOFF.md`.
17. **P2/P3 — carried forward**: Evaluation + Safety Expansion, Meeting Ingestion Expansion, Integration Modernization, commercial/product expansion (two-SKU), deferred hardening sweep, service navigation/install profiles.

**Renumbering note (2026-07-08):** inserted **v8.5 Agent Fleet Plane** after completed v8.4. Prior P1/P2 candidates shift: Skill Trust Chain v8.5→**v8.6**, Memory Lifecycle v8.6→**v8.7**, Orchestration Evidence v8.7→**v8.8**, Retrieval Quality v8.8→**v8.9**, Ontology v8.9→**v8.10**. Earlier 2026-07-07 note (Ontology v8.4→v8.9 for MemClaw UX) is superseded by this ordering for future planning.

**Renumbering note (2026-07-17):** Cloud Operator detail + REQUIREMENTS phase numbers aligned to **v8.15 / 163–166** (had collided with Human Wiki 160–162). Multi-Harness Observe added as **v8.16 / 167–171**.

**Scenario add (2026-07-08):**
- **S12 — Multi-machine fleet under one operator:** A human runs agents on a home Mac plus remote Hermes/OpenClaw gateways; MemroOS is the registry/governance source of truth; Paperclip may run a company with budgets; LangGraph handles multi-step HIL; no second control plane is required above MemroOS.

**Scenario add (2026-07-17):**
- **S13 — Employee harness → company brain:** An employee (or already-onboarded agent such as **Pi**) runs a harness with MemRoOS MCP; observe capture lands tiered session learning in the company brain without manual `knowledge_write`. Depth stays relevant-by-default and can be raised org-wide later.

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
   - Requirements completed in Phase 119: `MEMGEN-FOLLOWUP-02`, `COCOINDEX-FOLLOWUP-01`, `FASTCONTEXT-FOLLOWUP-01`, `ADKA2A-FOLLOWUP-01`, `QDRANT-FOLLOWUP-01`, `HYPEREXTRACT-FOLLOWUP-01`, `GRAPHGUIDE-FOLLOWUP-01`, and `SIMPLIFY-FOLLOWUP-01`.
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

14. **P2 — Plan Phase 70 follow-up topology closure.** — **ORCH-FOLLOWUP-01 residual closed 2026-07-16** (compensate dispatch + `attempts_per_hop`; LangGraph multi-hop loop / `rollback_compensation` node already present in `graph.py`).
   - Source note: `.planning/phases/70-foundation-engine-core/deferred-items.md`.
   - Requirement: `ORCH-FOLLOWUP-01` in `.planning/REQUIREMENTS.md` (checked).
   - Goal: close deferred LangGraph multi-hop topology and rollback-compensation gaps before claiming full multi-hop orchestration depth. Pull forward only if a live workflow needs multi-hop compensation.
   - Remaining limitation: default compensate transport is a local acknowledged receipt; wire a live A2A endpoint via `OrchestrationEngine(compensate_dispatcher=...)` when remote compensate agents are available.

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
- Memento, CocoIndex, FastContext, ADK/A2A, Qdrant Cloud 1.18, Hyper-Extract, Anthropic Knowledge Graph cookbook, and the simplify-code four-altitude / architecture-reviewer claim bounded spikes were conducted in Phase 119. Adoption and production changes remain deferred until Luis explicitly approves a follow-on implementation.
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
**Requirements**: MEMGEN-FOLLOWUP-02, COCOINDEX-FOLLOWUP-01, FASTCONTEXT-FOLLOWUP-01, ADKA2A-FOLLOWUP-01, QDRANT-FOLLOWUP-01, HYPEREXTRACT-FOLLOWUP-01, GRAPHGUIDE-FOLLOWUP-01, SIMPLIFY-FOLLOWUP-01
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

---

## v8.11 Unified Meeting Memory (Phases 151–153)

*Added: 2026-07-14*

### Phase 151 — Meeting Ingest Reliability

**Goal:** Stop Fathom title/dupe misses and make every provider write stable, searchable Markdown.

**Requirements:** MEETREL-01, MEETREL-02, MEETREL-03, MEETREL-04

**Success criteria:**
1. Re-ingest of the same recording/meeting id overwrites one file (no `-2` slug dupes).
2. Frontmatter carries `calendar_title`, `share_url`, `meeting_id`, `source` for Fathom/Circleback/Zoom.
3. Public templates under `scripts/meet-sync/providers/`; secrets only in envFile/1Password.
4. `meet-sync --health` reports freshness, last-run OK, and empty-vs-enabled WARN.

### Phase 152 — Unified Recall Facade

**Goal:** One MCP tool finds meetings across all enabled QMD collections + knowledge + mem0.

**Requirements:** URECALL-01, URECALL-02, URECALL-03

**Success criteria:**
1. Shared resolver federates enabled meeting collections + knowledge_literal + mem0.
2. MCP `memory_recall` is registered as a core tool.
3. Orientation instructs agents to prefer `memory_recall` for “find the meeting”.

### Phase 153 — Operator Surfaces + Proof

**Goal:** Console multi-search + docs + regressions prove Monaco/Fathom findable without `-c`.

**Requirements:** URECALL-04, URECALL-05, URECALL-06

**Success criteria:**
1. `/api/memory/multi-search` includes a QMD meeting lane.
2. Docs + `collections.config.json` list private meeting collections.
3. Regression coverage for Monaco Circleback + Fathom Impromptu via `memory_recall` without `-c`.

---

## v8.6 Skill Trust Chain (Phases 148–150) — COMPLETE (2026-07-16)

*Planning closeout 2026-07-16: product code shipped earlier without GSD phase dirs; SUMMARY + VERIFICATION added retroactively. Skill Vitest suites green (237 passed).*

**Scenario:** S6 — Marketplace/cross-harness skill import arrives signed, quarantined, sandbox-evaluated against its contract, and operator-approved before dispatch.

- [x] **Phase 148: Skill Contracts + Signing** — SKILLTRUST-01, SKILLTRUST-02  
  Modules: `registry.ts`, `skill-signing.ts`; APIs: `/api/skills/sign`, `/api/skills/verify`, import provenance.  
  Closeout: `.planning/phases/148-skill-contracts-signing/148-01-SUMMARY.md`, `148-VERIFICATION.md`
- [x] **Phase 149: Skill Quarantine + Governed Sync** — SKILLTRUST-03, SKILLTRUST-04  
  Modules: `skill-quarantine.ts`, `skill-sync.ts`, `skill-sync-governance.ts`; APIs: quarantine/*, sync/*, pins/*.  
  Closeout: `.planning/phases/149-skill-quarantine-governed-sync/149-01-SUMMARY.md`, `149-VERIFICATION.md`
- [x] **Phase 150: Skill Lifecycle** — SKILLTRUST-05  
  Modules: `skill-lifecycle.ts`, `skill-dependencies.ts`; API: `/api/skills/lifecycle`.  
  Closeout: `.planning/phases/150-skill-lifecycle/150-01-SUMMARY.md`, `150-VERIFICATION.md`

**Tests:** `apps/memroos/src/lib/skills/__tests__/` (signing, quarantine, sync, lifecycle, dependencies, trust-chain, registry).

### v8.11 Follow-up — MEETREL-FOLLOWUP-05: Source-to-Index Evidence

**Goal:** Make a missing meeting diagnosable from one operator-visible receipt rather than leaving ambiguity between provider absence, OAuth scope failure, capture, routing, indexing, and recall.

**Trigger:** July 16 Cordant investigation: Circleback had no July 15 Eric meeting and Fathom had only an unrelated meeting. Spark Desktop did capture the complete `Eric <> Luis` transcript (July 15, row 325), and direct `qmd search "Douglas fintech" -c spark-recordings` retrieved it at 96%. However, MCP `memory_recall` enumerated `spark-recordings` and returned zero QMD results for the same content. Separately, the Cordant Google account returned insufficient scopes for both Meet conference records and Drive meeting-note search; the scheduled Google/Spark sync then reported `ok: true` with zero Google documents. The system has both a unified-recall parity defect and a false-healthy provider-auth state.

**Depends on:** Phases 151–153.

**Success criteria:**
1. A meeting lookup by stable provider ID, Meet code, or calendar-event identity returns one bounded status: `provider_absent`, `provider_auth_blocked`, `captured_unrouted`, `routed_unindexed`, `indexed_unrecalled`, or `recalled`.
2. Provider adapters preflight their required scopes and return an actionable, secret-free reauthorization remedy; an OAuth failure is never reported as an empty provider result or a successful ingest.
3. A transcript returned by direct QMD collection search is returned by `memory_recall` under the same authorization context, with a receipt that names the searched collection and any lane-level failure.
4. Every successful capture records provider identity, raw-capture receipt, routing decision, index receipt, and recall proof without committing transcript bodies or provider credentials.
5. Operator health shows enabled-but-empty sources separately from auth-blocked sources, reports the aggregate sync as degraded when a configured source is blocked or behind, and supports a date-window trace for a single meeting.
6. Regression fixtures cover Circleback absent, Fathom unrelated-result, Google Meet/Drive scope denial, Spark-captured-but-unified-recall-missing, and the full captured-to-recalled path.

**Investigation gate:** Repair the unified-recall Spark parity first, then restore the Cordant Google Meet scopes and compare the provider record and Google-generated notes against the raw-capture, routing, QMD-index, and `memory_recall` receipts.


## v8.12 MemRoOS MCP Memory Gate Resilience (Codex) (Phases 154–156)

*Added: 2026-07-15 · Version: 2026-07-15.1*

**Branch:** `beastmode/v8.12-mcp-memory-gate-resilience`  
**Kickoff:** `.planning/milestones/v8.12-mcp-memory-gate-resilience-KICKOFF.md`  
**Depends on:** Phase 153 / v8.11 complete; Codex strict memory gate remains on.

### Phase 154 — Probe Timeout Honesty

**Goal:** Stop false `vector=down` when Mem0 `/health` is slow-but-healthy (9–31s) by raising the operator probe default to 15s and exposing `MEM0_HEALTH_TIMEOUT_MS`.
**Requirements:** GATE-RESILE-01
**Success criteria:**
1. `backends.ts` Mem0 health fetch default timeout is 15_000ms (not 3_000).
2. `MEM0_HEALTH_TIMEOUT_MS` overrides the probe timeout when set to a positive integer.
3. `/api/memory/health` inherits the new probe timeout via `checkVectorHealth`.
4. Unit tests prove default 15s and env override behavior (including TimeoutError → down detail).

### Phase 155 — Mem0 Hang Immunity

**Goal:** Eliminate self-HTTP health loops that can hang Mem0; keep Qdrant probe caching; add `/livez`; auto-restart hung Mem0 from healthcheck with cooldown.
**Requirements:** GATE-RESILE-02
**Success criteria:**
1. Background recovery no longer `GET http://localhost:3201/health` / self-POST reset via HTTP loop that can deadlock the event loop.
2. Qdrant connectivity checks remain interval-cached (not every request / every health call uncached).
3. Optional `GET /livez` returns process-alive without full Qdrant/disk/runtime suite.
4. `healthcheck.sh` detects hung Mem0 (health timeout / no response) and restarts with cooldown.

### Phase 156 — Strict-Gate Diagnostics + Path-Scoped Disk

**Goal:** Failure messages diagnose disk vs vector vs runtime; path-scoped disk so home `df%` alone does not force vector tier down under strict gate.
**Requirements:** GATE-RESILE-03
**Success criteria:**
1. Strict gate stderr includes actionable detail (HTTP code, tier statuses, mem0 detail when present) without secrets.
2. Disk checks are path-scoped to Mem0-relevant paths (queue/logs/data), not home alone as vector killer.
3. Home volume pressure alone does not map to `vector=down` when Qdrant vector_store is connected.
4. Tests cover disk-vs-vector separation and diagnostic string shape.

### Progress Table (v8.12 MCP gate)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 154. Probe Timeout Honesty | 1/1 | Complete | 2026-07-15 |
| 155. Mem0 Hang Immunity | 1/1 | Complete | 2026-07-15 |
| 156. Strict-Gate Diagnostics + Path-Scoped Disk | 1/1 | Complete | 2026-07-15 |

## v8.13 Memory Tier Catchup + Install Wiring (Phases 157–159)

*Added: 2026-07-17 · Version: 2026-07-17.1 · Creation: 2026-07-17 19:30 PDT · Updated: 2026-07-17 19:30 PDT*

**Status:** ✅ CODE COMPLETE (2026-07-18) — unit/dry-run verified; live Aura raise-beyond-probe still Luis-gated  
**Depends on:** Phase 37 three-tier memory API; Neo4j Query API v2 path in `backends.ts`; memory-resilience install profile  
**Why now:** Operator saw healthy Qdrant (~628 points) with Neo4j up but empty (2 probe nodes). Catchup was ops-manual; install only shipped healthcheck/evals—not tier-fill jobs. NOC Last-24h empty is a separate honesty/window issue once streams are quiet.  
**Closeout evidence (2026-07-18T06:58:14Z):** `graph-catchup.test.ts` 13/13; CLI `--dry-run` + progress counters; cron-health + install-memory-resilience wiring present; secrets not printed in summary/logs. Live Aura oneshot still requires operator approval.

### Phase 157 — Graph Catchup Projection (one-shot + shared lib)

**Goal:** Idempotent synergistic projection from mem0/Qdrant vector memories into Neo4j (`MemoryFact` / relationships), runnable as a one-shot operator script without duplicating full text blobs.
**Requirements:** MEMTIER-01, MEMTIER-02, MEMTIER-03
**Success criteria:**
1. Shared projection module used by CLI/script (and later by the scheduled worker).
2. Paginated read from mem0/Qdrant; MERGE by stable id; rate-limited for Aura Free.
3. One-shot run raises Neo4j beyond probe-only labels; progress logged (processed/written/skipped/errors).
4. Focused unit coverage for mapping + idempotency; secrets never printed.

### Phase 158 — Durable `graph-catchup` Job + Cron Health

**Goal:** Incremental scheduled catchup with checkpoint/cursor so graph stays caught up after install, visible in NOC cron health.
**Requirements:** MEMTIER-04, MEMTIER-05
**Success criteria:**
1. `graph-catchup` registered in `cron-health` DEFAULT_JOBS with expected interval.
2. Worker heartbeats success/failure/`itemsProcessed`; skips cleanly when Neo4j not configured.
3. Checkpoint prevents full reprocess every tick; safe to re-run.

### Phase 159 — Install Wiring + Operator Docs

**Goal:** New MemRoOS installs get memory-tier catchup jobs automatically (or via documented `install:memory-resilience` path), not tribal knowledge.
**Requirements:** MEMTIER-06
**Success criteria:**
1. `scripts/install-memory-resilience.mjs` and/or `setup.sh` path enables the job (launchd and/or in-app scheduler).
2. `docs/install-profiles.md` documents enable/status/uninstall and that tiers are complementary (vector ≠ graph duplicate).
3. Operator can verify job status with existing resilience status command or cron health API.

### Progress Table (v8.13 memory tier catchup)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 157. Graph Catchup Projection | 1/1 code | Code complete — shared lib + CLI + unit/dry-run; live Aura gated | 2026-07-18 |
| 158. Durable graph-catchup Job | 1/1 code | Code complete — cron + in-app scheduler + API | 2026-07-17 |
| 159. Install Wiring + Docs | 1/1 code | Code complete — install-memory-resilience + docs; launchd bootstrap may need retry on already-loaded agents | 2026-07-17 |

## v8.15 Always-On Cloud Operator — oracle-1 (Phases 163–166)

*Added: 2026-07-17 · Version: 2026-07-18.2 · Creation: 2026-07-17 21:07 PDT · Updated: 2026-07-18 15:20 UTC*

**Status:** 🟢 LIVE CUTOVER VERIFIED (2026-07-18); 🟢 **DATA PLANE RECONCILED (2026-07-26)** — Phase 164's "migrated/synced SQLite kernel" and "Aura + Qdrant env" criteria were only partially true at cutover and drifted afterward. Both are now closed on evidence; Phase 166 Voyage still out of scope.  

**Data-plane reconciliation (2026-07-26 operator session) — what was actually wrong and what fixed it:**

- **Neo4j Aura was silently disconnected.** The app on oracle-1 was resolving `NEO4J_HTTP_URL` to a *local Neo4j container*, not the Aura instance, because a plain `docker compose -f docker-compose.local.yml up -d` reintroduced the shared local `neo4j` service. Graph writes were landing in a throwaway container. Nothing alerted; it was found by accident. **Fixed** via a host-only `docker-compose.override.yml` (mode 600, git-ignored) that pins the Aura + Qdrant Cloud env and uses the Compose `!override` merge tag on `depends_on` plus a `profiles:` key to exclude the local `neo4j` service from default runs. No Aura data was lost — the Aura instance retained its contents throughout.
- **Qdrant was pointed at a placeholder.** `QDRANT_URL` was literally `your-qdrant-cloud-endpoint`. **Fixed** in the same override; now verified reachable with 4 populated collections (`knowledge_docs` 43,305 pts, `agent_memory` 2,609, `agent_memory_local` 1,436, `user_context` 10).
- **Restarts were the regression vector.** Any `docker compose up` that forgot the override silently reverted both fixes. **Fixed** by `scripts/memroos-restart.sh`, which always layers `-f docker-compose.local.yml -f docker-compose.override.yml`. See v8.31 CFGDUR-02 — measurement shows this wrapper is *not* sufficient as the primary control.
- **Full local→oracle-1 data migration completed.** ~123 tables, 217,002 statements applied 217,002/217,002 with zero errors (`/tmp/fix_migration_load2.log`); 45,750 `message_embeddings` rows and 59 `registered_agents` verified on-host. An earlier attempt failed with 30,533 `database or disk is full` errors — root cause was disk exhaustion, not schema drift; resolved by freeing space *before* rerunning. Two migration hazards were found and eliminated: positional `.dump`-style `INSERT`s (silently corrupt across schema drift → replaced with named-column inserts) and `INSERT OR IGNORE` (silently no-ops on *any* constraint violation, not just PK collisions → replaced with explicit error accounting).
- **Disk pressure relieved.** oracle-1 hit 4GB free / 89% used (crit). Reclaimed by deleting `/home/opc/inbox` (2.9GB, operator-confirmed), Docker prune, duplicate checkouts and non-critical temp files, and removing the now-dead local Neo4j container/volume/image.
- **Monitoring restored and extended.** `scripts/memroos-health-check.sh` (cron `*/15`) now verifies Aura env, Qdrant reachability, graph-catchup activity, `users`/`registered_agents` counts against the previous run, override-file presence, and that the local `neo4j` container is *not* running. Separately, both pre-existing systemd timers (`memroos-healthcheck.timer` → GitHub-issue alerting, `memroos-disk-watch.timer`) were found `enabled` but **not armed** — last fired 2026-07-23 21:25 GMT, at almost exactly the moment disk hit crit. Both re-armed 2026-07-26.

**Known-open on this host (tracked in v8.31, not here):** embedding generation is disabled (`[embeddings] provider disabled; embedding job not scheduled` — no provider key on either container), so all 45,750 embedding rows and 43,305 Qdrant points are migrated history, not live output; `graph-catchup` logs `projected: 0` every run, cause not yet distinguished from the same missing-provider root.  
**Evidence:** `docs/uat/2026-07-18-oracle1-live-cutover-verification.md` (commit `5969968` + follow-on Tailscale SSH enablement `201cbe2`).  
**Plan:** `~/.cursor/plans/mac-as-prod_memroos_d4133d54.plan.md` (Always-on Oracle MemRoOS)  
**Depends on:** v8.13 graph catchup paths; Aura + Qdrant Cloud credentials; Tailscale reachability to `oracle-1`  
**Note:** Phase numbers 160–162 are reserved for v8.14 Human Wiki Surface — do not collide.

**Host evidence (2026-07-17 SSH):** `oracle-1` aarch64, 2 CPU, **10Gi RAM (~8.7Gi avail)**, 30G disk (~13G free), load 0.00, Docker+Node present, Ollama not yet installed. Sufficient for Next+mem0+SQLite+`nomic-embed-text`; not sized as a multi-LLM box.

### Phase 163 — Oracle host readiness + local embeds

**Goal:** Make `oracle-1` ready to run $0 local embeddings without starving the operator.
**Requirements:** CLOUDOPS-01, CLOUDOPS-02
**Success criteria:**
1. Ollama installed on aarch64; `nomic-embed-text` pulled; embed smoke succeeds.
2. ≥5G disk free after model install.
3. Documented RAM budget: operator + mem0 + nomic only (no heavy chat LLM required day-1).

### Phase 164 — Operator deploy + data cutover

**Goal:** Single production brain on oracle-1 with same Aura/Qdrant and migrated SQLite kernel.
**Requirements:** CLOUDOPS-03, CLOUDOPS-04, CLOUDOPS-05
**Success criteria:**
1. MemRoOS + mem0 running on oracle-1 with Neo4j Aura + Qdrant env.
2. Mac `conversations.db` migrated/synced to persistent disk; inventory non-zero on-host.
3. Graph-catchup scheduler enabled on the operator host.

### Phase 165 — Public tunnel + Heroku decommission

**Goal:** Public hostname serves oracle-1; stop paying/confusion for empty Heroku operator.
**Requirements:** CLOUDOPS-06, CLOUDOPS-07
**Success criteria:**
1. Cloudflare Tunnel: `memroos.epiloguecapital.com` → oracle-1 `:3000`; health/inventory match on-host.
2. Heroku custom domain removed; `web` scaled to 0 (or app destroyed later).
3. Exposed Heroku backend secrets rotated; agents/MCP point at the tunnel URL.
4. Docs state Mac = dev only; oracle-1 = operator.

### Phase 166 — Voyage cloud embed provider (cheap alternative)

**Goal-scope note (2026-07-18):** Explicitly **out of scope** for the active GSD quality-gate goal — do not implement Voyage in this pass.

**Goal:** Optional cloud embeddings without local model RAM (package-options Option C / v8.9 residue).
**Requirements:** CLOUDOPS-08
**Success criteria:**
1. `MEMROOS_EMBEDDING_PROVIDER=voyage` accepted by env + provider implementation.
2. Ollama remains default on oracle-1; Voyage is opt-in with degraded-safe failures.
3. No second Qdrant collection required.

### Progress Table (v8.15 cloud operator)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 163. Oracle readiness + nomic embeds | 1/2 docs + live | Live cutover verified 2026-07-18. **Disk headroom criterion (≥5G free) regressed to 4G/89% on 2026-07-23 and was restored 2026-07-26**; the `nomic-embed-text` install this phase specified was never completed — carried to v8.31 STORECON-03 | 2026-07-18 (reconciled 2026-07-26) |
| 164. Operator deploy + data cutover | 2/2 | **Closed 2026-07-26.** Criterion 1 (Aura + Qdrant env) had silently regressed to a local Neo4j container + placeholder Qdrant URL — now pinned and continuously verified. Criterion 2 (SQLite migrated, inventory non-zero on-host) closed by the full 217,002/217,002-statement migration. Criterion 3 (graph-catchup enabled) runs but returns `projected: 0` — carried to v8.31 STORECON-04 | 2026-07-26 |
| 165. Tunnel + Heroku decommission | 1/2 docs + live | CF `memroos-oracle` healthy; Heroku `web=0`; onboarding verify 403 | 2026-07-18 |
| 166. Voyage embed provider | 0/? | Out of scope for active goal; do not implement Voyage in this pass | — |

## v8.14 Human Wiki Surface + Memory Digest (Phases 160–162)

*Added: 2026-07-17 · Version: 2026-07-17.1 · Creation: 2026-07-17 20:16 PDT · Updated: 2026-07-17 20:16 PDT*

**Status:** ✅ CODE COMPLETE (2026-07-18) — digest + `/wiki` reader + light graph; live mem0 digest needs vault/mem0  
**Depends on:** knowledge vault at `KNOWLEDGE_BASE_PATH` / `~/github/knowledge`; existing `llm-wiki` + `mem0-export.sh` + `knowledge_system.compiler`; blog already uses `react-markdown`  
**Why now:** Humans cannot browse raw mem0. First digest pages exist under `llm-wiki/wiki/07-memroos-platform/` for Obsidian. Next: keep them fresh with a regular job, then expose the same files in MemRoOS as an Obsidian-like reader (option B) with light graph (option C).  
**Out of scope:** Full Obsidian clone (live plugins, canvas editor, mobile sync). Do not dump every mem0 bullet into the wiki — synthesize by entity/topic.

### Phase 160 — Memory → Wiki Digest Job

**Goal:** Scheduled/idempotent job clusters new mem0 memories (and optionally journals) into durable `llm-wiki` pages with provenance, watermark, and index/log updates — same files Obsidian already opens.  
**Requirements:** WIKISURF-01, WIKISURF-02, WIKISURF-03  
**Success criteria:**
1. Digest script/module with mtime or content-hash watermark (pattern from `obsidian-to-mem0.py` / `mem0-export.sh`).
2. Writes/updates pages under `llm-wiki/wiki/` (entities/topics/domain MOCs); updates `index.md` + `log.md`.
3. Wired into `knowledge-curator.sh` (or MemRoOS cron-health job) on a regular interval; non-fatal on failure.
4. Redaction rules: skip/high-sensitivity personal-legal scraps; never write secrets.
5. Focused tests for clustering/idempotency; dry-run mode.

### Phase 161 — MemRoOS `/wiki` Reader (Obsidian-like B)

**Goal:** Authenticated operator UI to browse compiled wiki markdown: folder tree, page view, `[[wikilink]]` navigation, full-text search — not Library analytics.  
**Requirements:** WIKISURF-04, WIKISURF-05, WIKISURF-06  
**Success criteria:**
1. Route(s) under `/wiki` (index + `[[...]]` page path) with operator auth.
2. Renders markdown (reuse `react-markdown` or shared MD component); resolves wikilinks within vault wiki root.
3. Sidebar or tree for `llm-wiki/wiki/` (and configurable root); search by title/content via existing knowledge/QMD API or lightweight index.
4. Read-only in v1 (edits stay in Obsidian/git); clear empty/missing-vault states.
5. Smoke tests for route auth + link resolution.

### Phase 162 — Light Wiki Graph (Obsidian-like C)

**Goal:** Graph panel over compiled wiki relationships using existing `wiki/graph/knowledge-graph.json` (or regenerated on digest), linked from `/wiki`.  
**Requirements:** WIKISURF-07, WIKISURF-08  
**Success criteria:**
1. Digest or compile step refreshes graph JSON when pages change.
2. `/wiki` UI shows a light interactive graph (nodes = pages/entities; edges = wikilinks or compiler edges).
3. Clicking a node opens the page view; no requirement for Obsidian plugin parity.
4. Degrades gracefully if graph file missing.

### Progress Table (v8.14 human wiki surface)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 160. Memory → Wiki Digest Job | 1/1 code | Code complete — wiki-digest + cron + dry-run tests | 2026-07-18 |
| 161. MemRoOS `/wiki` Reader | 1/1 code | Code complete — `/wiki` + `/api/wiki` tree/page/search | 2026-07-18 |
| 162. Light Wiki Graph | 1/1 code | Code complete — graph JSON refresh + panel | 2026-07-18 |

## v8.16 Multi-Harness Observe Plane (Phases 167–171)

*Added: 2026-07-17 · Version: 2026-07-17.1 · Creation: 2026-07-17 21:10 PDT · Updated: 2026-07-17 21:10 PDT*

**Status:** ✅ CODE COMPLETE (2026-07-18) — Waves 1–3 policy/sidecar/visibility; live capture still needs operator keys  
**Depends on:** remote MCP (`docs/integrations/mcp.md`); `POST /api/agent-memory/capture` + `POST /api/native-memory/ingest` (Phase 96 / ENTOPS-07 sink); Hermes observe plugin as reference; `db-ingest.ts` session paths for Claude/Hermes/Codex/Qwen; fleet maturity matrix `docs/runtime-adapter-maturity.md`  
**Why now:** MemRoOS is a strong store when fed, but onboarded agents (incl. **Pi**, Codex, Cursor, Claude, etc.) do work that never lands. Goal: every **already-onboarded** MemRoOS agent’s relevant work is captured autonomously.  
**Product story (S13):** Remote MCP = company brain for onboarded agents; observe sidecar = autonomous capture. MCP alone is **not** a wiretap.  
**Pi note:** `pi` is already a first-class `AgentPlatform` in MemRoOS (`apps/memroos/src/types/index.ts`). Live sessions land at `~/.pi/agent/sessions/**/*.jsonl`. Treat Pi as **Wave 1** (support the onboarded agent), not deferred.

### Capture depth policy (balance — expandable later)

Default must store **relevant** company learning, not every token. Depth is org/config upgradable without redesign.

| Depth | Env / policy | What is stored | Vector/index | Vault (sealed) |
|-------|--------------|----------------|--------------|----------------|
| `summary` | Minimal | Session TLDR, workspace/repo, exit status | Yes (small) | Optional receipt only |
| **`relevant` (DEFAULT)** | Balanced | Summary + decisions/actions/blockers + durable candidates + errors; redacted | Yes (candidates) | Sealed raw artifact pointer / hash; not full chat in mem0 |
| `full` | Later / opt-in | Relevant + fuller transcript slices | Summaries/candidates only by default | Sealed full session allowed under retention labels |

**Rules:**
1. Default depth = `relevant` (`MEMROOS_CAPTURE_DEPTH=relevant`).
2. Raising depth is a config/policy change (tenant or org), not a new architecture.
3. Secrets never enter indexes; jobhunt/PII paths get elevated sensitivity labels (MEMSEC).
4. Prefer bronze→silver→gold belief stages for admitted truth; raw observe stays bronze until consolidation.
5. Do not dump every mem0 bullet or every chat turn into llm-wiki (pairs with v8.14 digest).

### Architecture

```text
Employee laptop
  ├─ Agent harness (Claude/Codex/Cursor/Hermes/OpenClaw/Factory/Pi/Antigravity)
  ├─ Remote MemRoOS MCP  ──────────────► company knowledge + memory tools
  └─ MemRoOS Observe sidecar ──────────► POST capture/ingest (tiered)
         adapters: jsonl | hooks | memory-plugin | export
Operator host
  └─ MemRoOS vault + mem0 + consolidation + (later) wiki digest
```

### Phase 167 — Capture policy + tiered retention contract

**Goal:** Define and enforce capture depth (`summary` | `relevant` | `full`) in server ingest so all adapters share one throttle.  
**Requirements:** OBSERVE-01, OBSERVE-02, OBSERVE-03  
**Success criteria:**
1. Documented policy table (above) in `docs/integrations/observe-capture.md`.
2. `POST /api/agent-memory/capture` (and/or native-memory ingest) accepts `captureDepth` and applies default `relevant`.
3. Tests prove `relevant` does not index full transcript text into mem0; `full` vaults sealed raw under retention labels.
4. Org/env override to raise depth later without schema break.
5. Redaction + sensitivity labels applied before index write.

### Phase 168 — Remote MCP employee onboard (minimal client)

**Goal:** One-install / one-config path: employee adds remote MemRoOS MCP (URL + scoped API key) across detected harnesses.  
**Requirements:** OBSERVE-04, OBSERVE-05  
**Success criteria:**
1. Installer or `scripts/install-agent-integrations.sh` extension writes MCP config for detected clients, including **Pi** (`~/.pi/…`) plus Claude, Codex, Cursor, Factory `~/.factory/mcp.json`, Hermes/OpenClaw.
2. Docs: employee / agent onboard steps ≤5 minutes; no local MemRoOS clone required when using Streamable HTTP.
3. Strict memory gate remains operator-side; laptop uses remote operator URL.
4. Uninstall / key revoke path documented.
5. Onboarded-agent inventory: observe targets prefer agents already in MemRoOS registry (`platform` includes `pi`) over inventing parallel identity.

### Phase 169 — Observe sidecar + Wave 1 adapters (Claude, Codex, Hermes, OpenClaw, Pi)

**Goal:** Autonomous capture for onboarded / high-ROI session harnesses with minimal ongoing client updates. **Pi is in Wave 1** because it is already a MemRoOS-onboarded platform with local session JSONL.  
**Requirements:** OBSERVE-06, OBSERVE-07, OBSERVE-08, OBSERVE-09  
**Success criteria:**
1. Sidecar process (launchd/systemd or user-level) watches known session paths and POSTs to capture API at session end / idle watermark.
2. Wave 1 adapters:
   - Claude (`~/.claude/projects/**/*.jsonl`)
   - Codex (`~/.codex/sessions/**/*.jsonl`)
   - Hermes (`~/.hermes/sessions/*.jsonl`)
   - OpenClaw (Hermes-family / OpenClaw session paths)
   - **Pi (`~/.pi/agent/sessions/**/*.jsonl`)** — attribute to registered `platform=pi` agent when present
3. Hermes memory observe plugin remains supported and shares the same depth policy.
4. Reuses/extends Phase 96 `captureCodingAgentSession` — no parallel capture schema.
5. Cron-health or sidecar heartbeat visible to operator; failures non-fatal to the harness.
6. Default depth `relevant`; dry-run mode writes local receipts only.
7. Smoke: a Pi session produces ≥1 relevant capture attributed to a MemRoOS-onboarded Pi agent without manual `knowledge_write`.

### Phase 170 — Wave 2 adapters (Cursor, Factory/Droid)

**Goal:** Extend observe to IDE/enterprise harnesses that need hooks or documented export paths.  
**Requirements:** OBSERVE-10, OBSERVE-11  
**Success criteria:**
1. Cursor adapter: MCP onboard + best-available session/hook/SDK export path; honest “partial” status if only MCP writes land.
2. Factory (Droid) adapter: MCP via `~/.factory/mcp.json` + capture via hooks/OTEL/session export when available; map to `platform=droid` when registered.
3. Maturity matrix rows updated for Factory/Droid + Cursor capture evidence.
4. Pi remains Wave 1 (do not regress Pi to “via OpenClaw only”).

### Phase 171 — Wave 3 (Antigravity + gaps) + operator visibility

**Goal:** Close remaining clients where feasible; surface capture health for **all onboarded agents** (incl. Pi); lock promises.  
**Requirements:** OBSERVE-12, OBSERVE-13, OBSERVE-14  
**Success criteria:**
1. Antigravity: MCP if exposed; otherwise documented limitation + optional export path — no false “full capture” claim.
2. Operator UI or NOC panel: per-harness / per-onboarded-agent last capture time, depth setting, volume (sessions/day), error rate — **including Pi**.
3. `docs/runtime-adapter-maturity.md` lists Claude, Codex, Hermes, OpenClaw, **Pi**, Cursor, Factory/Droid, Antigravity with capture method (MCP / jsonl / hook / plugin / limited).
4. Eval or smoke: Wave 1 session (Pi or Claude/Codex) produces ≥1 relevant candidate in MemRoOS without manual `knowledge_write`.
5. Installer TARGETS include Pi so future machines get the same onboard path as existing Pi installs.

### Progress Table (v8.16 multi-harness observe)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 167. Capture policy + tiered retention | 1/1 code | Code complete — depth policy + capture wiring + tests | 2026-07-18 |
| 168. Remote MCP employee onboard | 1/1 docs+installer | Pi already in TARGETS; onboard doc shipped | 2026-07-18 |
| 169. Observe sidecar + Wave 1 (incl. Pi) | 1/1 code | Sidecar + path policy + dry-run; live capture needs operator key | 2026-07-18 |
| 170. Wave 2 Cursor/Factory | 1/1 code | Partial maturity + sidecar wave2 roots + docs | 2026-07-18 |
| 171. Wave 3 Antigravity + onboarded-agent visibility | 1/1 code | /api/observe/health + maturity matrix incl. Pi | 2026-07-18 |

### Out of scope (v8.16)

- Full MemRoOS-first MEMORY.md rewrite for all harnesses (ENTOPS-07 governed mode — separate).
- Promising 100% Cursor/Antigravity transcript fidelity without vendor hooks.
- Indexing full chat dumps at default depth.
- Replacing v8.14 wiki digest (observe feeds memory; wiki synthesizes later).

## v8.18 NOC Metrics Rethink (Phases 173-174)

*Planned: 2026-07-20 · Design: `.planning/design/noc-rethink-v1.md` · Audit: `.planning/notes/2026-07-20-noc-rethink-audit.md`*

**Goal:** Replace the current 13-panel placeholder-heavy NOC with an operator-first surface that reports truthful day-1 MemRoOS signals and makes the first needed action obvious.

**Audience:** Sole MemRoOS operator. The default view must be useful before hive activity or EFFTEL instrumentation exists.

**Locked UX decisions:**
- Main layout answers, in order: alive → needs attention → learning → agent activity → cost → governance.
- Useful but unwired panels are hidden behind a remembered **Show advanced** toggle, off by default.
- All 24h / 7d / 30d and workspace scopes preserve the same semantic contract.
- Empty has four distinct states: window-empty, no-history, stale/error, known-unwired. Errors never display as no-data.

### Phase 173 — NOC Truth Contracts + Attention

**Goal:** Make the existing NOC API truthful for a single operator: attention items, message-backed activity, source freshness, and known-unwired status.
**Depends on:** Phase 172 (complete; shared NOC contract baseline)
**Requirements:** NOCUX-01, NOCUX-04, NOCUX-05
**Success criteria:**
1. Default NOC data uses day-1 sources (`messages`, memory, cron health, skills, audit, model usage), not hive activity as a prerequisite.
2. Attention is severity-ordered and shows cron failures, pending HIL work, security findings, and stale sources with a next action.
3. Agent Activity remains useful when `hive_delegations` is empty; delegation detail is additive only.
4. EfficiencySignals is explicit known-unwired/Advanced until EFFTEL producers are verified.

### Phase 174 — Operator Layout + Semantic States

**Goal:** Ship the approved K3 v1.1 operator layout using Phase 173 data: simple default, Advanced for useful-but-unwired panels, and honest states at every scope.
**Depends on:** Phase 173
**Requirements:** NOCUX-01, NOCUX-02, NOCUX-03, NOCUX-04, NOCUX-05
**Success criteria:**
1. Default order is Pulse → Attention → Memory/Tier Health → Agent Activity/Models/Heatmap → Cost → Governance/Skills.
2. No default panel displays only "No events" or "empty by design"; it renders live, window-empty, no-history, stale/error, or known-unwired semantics.
3. Show advanced is off by default, remembers the operator preference, and contains EfficiencySignals/BehaviorSignals until their data is useful.
4. Window and workspace filters apply to every default signal; one-workspace installs do not show a dead picker.
5. Operator tests cover default order, advanced visibility, empty states, and filter propagation.

### Progress Table (v8.18 NOC Metrics Rethink)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 173. NOC Truth Contracts + Attention | 1/1 | Code-complete on main | 2026-07-23 (commit `07a419d0`) |
| 174. Operator Layout + Semantic States | 1/1 | Code-complete on main | 2026-07-23 (commit `720f7805`) |

### Out of scope (v8.18)

- Wiring EFFTEL producers or changing the observe capture pipeline.
- New data stores, session capture, analytics baselines, or design-system replacement.
- Dashboard drill-down redesign or a new workspace model.

## v8.19 Runtime Bottleneck Evidence

### Phase 175 — Runtime Bottleneck Evidence

**Goal:** Produce reproducible operator-load, retrieval, and latency-attribution evidence before any bounded runtime extraction decision.
**Depends on:** Phase 174
**Requirements:** PERF-EVID-01, PERF-EVID-02, PERF-EVID-03, PERF-EVID-04
**Success criteria:**
1. Two accepted operator runs and two accepted retrieval runs use canonical files, shared fixture identity, and lane-specific workload and configuration hashes.
2. JSON schemas and a fail-closed checker validate sample floors, percentiles, concurrency, token/dependency availability, raw artifacts, and attribution reconciliation.
3. The checker selects keep, current-stack optimization, or bounded shadow extraction by the quantitative decision order in `175-01-PLAN.md`.
4. No Rust implementation, production cutover, datastore change, or wholesale rewrite is authorized.

### Progress Table (v8.19 Runtime Bottleneck Evidence)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 175. Runtime Bottleneck Evidence | 1/1 | Planned | — |

## v8.22 Paperclip/MemroOS Two-Seam Memory Integration

### Phase 178 — Paperclip/MemroOS Two-Seam Memory Integration (Option D)

**Goal:** Land Option D per the 2026-07-21 Opus 4.8 architectural opinion. MemroOS integrates at exactly two Paperclip *core* seams — the planned memory-provider plugin for push and the existing tool-connection MCP gateway for pull — and zero Paperclip adapters gain MemroOS-aware code.
**Depends on:** Phase 146 (FLEET contract baseline; ownership split + boundary rules), `paperclip/doc/plans/2026-03-17-memory-service-surface-api.md` (memory-provider plugin shape), current Paperclip tool-gateway work
**Requirements:** MEMCLIP-01, MEMCLIP-02, MEMCLIP-03, MEMCLIP-04, MEMCLIP-05

**Success criteria:**
1. `memroos/docs/integrations/paperclip.md` gets a new "Memory Path (FLEET-2x)" §4 clause that resolves the policy collision between the Phase 146 ownership rules and the 2026-03-17 plan. Resolution: Paperclip authorizes *binding access* (which agent may call which provider); MemroOS authorizes *record content* (permission-aware pack assembly). MemroOS's content authorization wins on what's in the bundle.
2. MemroOS implements the `MemoryAdapter` interface from the 2026-03-17 plan with two paths:
   - **Push:** `pre_run_hydrate` writes the MemroOS context pack into the per-run instructions file at Paperclip's `instructionsFilePath` resolution point (`server/src/services/heartbeat.ts:3630`). One core change covers all 9 CLI / cloud / gateway adapters.
   - **Pull:** MemroOS registers as one Paperclip `toolConnections` row (`remote_http` transport). Adapters that wire `AdapterExecutionContext.runtimeMcp` (currently claude-local, codex-local) get MemroOS natively. Adapters that do not yet wire `runtimeMcp` fall back to push-only.
3. Paperclip's tool gateway exposes token→run-scope introspection — the `subjectId` field already exists (`server/src/services/heartbeat.ts:~2129`); making it readable by MemroOS's MCP callee is the change. MemroOS uses this to resolve every gateway token to `{companyId, agentId, runId}` for audit provenance.
4. Idempotency on `(run_id, content_hash)` is enforced server-side in MemroOS. An integration test asserts that one run which both hydrates via hook AND writes via MCP yields exactly one MemroOS record + two linked `memory_operations` rows. Test sits next to `packages/adapter-utils/src/mcp-isolation.integration.test.ts` in the Paperclip repo.
5. Zero Paperclip adapters gain MemroOS-aware code, verified by `grep -r 'MemroOS' paperclip/packages/adapters/*/src/**` returning zero hits.

**Source opinion:** See `docs/integrations/paperclip-option-d-2026-07-21.md` (or the linked Opus 4.8 run transcript). Decision drivers: (a) the Phase 146 contract rule "Paperclip does not own cross-runtime fleet, memory, or governance"; (b) the 2026-03-17 plan's already-designed memory-provider plugin shape; (c) MemroOS's product positioning as a standalone MCP server, not a Paperclip feature.

**Out of scope (v8.22):**
- `runtimeMcp` audit for non-wired Paperclip adapters (cursor-local, gemini-local, grok-local, opencode-local, pi-local, hermes, hermes-gateway, openclaw-gateway, cursor-cloud) — separate Paperclip hygiene item, not a MemroOS deliverable.
- Plan amendments to add `providerNativeToolSurface` capability flag and provenance stamp on `MemoryContextBundle` — those land in Paperclip's repo separately if accepted; not a v8.22 gate.
- Harness-native context-pack delivery beyond `instructionsFilePath` + MCP server registration — no per-adapter code under this phase.

### Progress Table (v8.22 Paperclip/MemroOS Two-Seam Memory Integration)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 178. Paperclip/MemroOS Two-Seam Memory Integration | 0/? | Planned | — |

## v8.23 Third-Party Tool Authentication Plane

### Phase 179 — Third-Party Tool Authentication Plane

**Goal:** Ship a per-installation, embeddable UX where an operator can connect memroos to third-party tools via OAuth or API key, with token refresh, credential storage in memroos's existing AES-256-GCM vault, and a stable surface for future integrations to consume instead of re-implementing auth each time.
**Depends on:** v8.20 Phase 176 (CONNMEM proven for Linear/Circleback), v8.22 Phase 178 (MEMCLIP proven for Paperclip tool-connection model), FLEET-22 secrets path
**Requirements:** TOOLAUTH-01, TOOLAUTH-02, TOOLAUTH-03, TOOLAUTH-04, TOOLAUTH-05, TOOLAUTH-06, TOOLAUTH-07, TOOLAUTH-08

**TOOLAUTH requirement definitions:**
- TOOLAUTH-01 — Per-installation provider registry (JSON/YAML) with auth URL, token URL, scopes, refresh policy.
- TOOLAUTH-02 — "Connected Tools" settings page at `apps/memroos/src/app/settings/tools` with Connect UI for each registered provider.
- TOOLAUTH-03 — OAuth flow handler that stores refresh tokens in the AES-256-GCM vault (`MEMROOS_VAULT_KEY_PATH`).
- TOOLAUTH-04 — API-key flow handler that stores keys in the same vault.
- TOOLAUTH-05 — `tool_auth.getCredentials(provider, scope)` API for MCP tools to resolve tokens uniformly. No adapter calls an external OAuth library directly.
- TOOLAUTH-06 — Token refresh + failure observability (audit row + NOC dashboard tile).
- TOOLAUTH-07 — Revocation flow with webhook dispatch.
- TOOLAUTH-08 — Backfill connector: existing Phase 176 (Linear/Circleback) and Phase 178 (Paperclip) consumers migrated to the new plane.

**Success criteria:**
1. "Connected Tools" page exists with a Connect UI for at least 3 providers (initial set: Linear, Circleback, GitHub — the Phase 176 + Phase 178 immediate consumers). Adding a 4th-10th provider requires only a registry entry, no new code.
2. Phase 176 (CONNMEM-04..07) and Phase 178 (MEMCLIP-02..04) consumers migrated to the new plane and cite this phase in their requirement IDs.
3. MCP tools (`apps/memroos/src/lib/l3/adapters/{slack,hubspot,quickbooks,...}`) resolve tokens via the single `tool_auth.getCredentials()` API. Zero direct external OAuth library imports in adapters.
4. Token refresh is automatic and observable. Failed refresh emits a structured audit row and a NOC dashboard tile.
5. Operator can revoke a connection from settings; revocation triggers a webhook to memroos and clears the vault entry. Re-authorization is one click.
6. Cost at 10 users per installation is $0/month (free tier covers); cost at 50 users per installation is documented and paid by the customer, not by memroos.
7. OAuth + API-key hybrid supported (not OAuth-only). API-key path validated against at least one non-OAuth provider (e.g., a legacy CRM).
8. Provider swap path documented (e.g., Nango → Klavis) at the configuration layer, not the application layer.

**Source opinion:** `.planning/spikes/2026-07-23-tool-auth-ux-research.md` + `.planning/spikes/2026-07-23-tool-auth-ux-validation.md` + `.planning/design/2026-07-23-connected-tools-ux-design.md` (Kimi K2.7 Code UX design spec). Primary implementation pick: Nango (hosted free tier covers ≤10 users exactly); swap candidate: Klavis (MCP-first OSS, self-hostable). Klavis prototype to confirm catalog (100+) is sufficient for memroos's integration roadmap.

**Out of scope (v8.23):**
- Building a SaaS offering on top of the tool-auth plane (memroos stays per-installation).
- Replacing the existing user-login auth (`/api/auth/*`).
- Federated multi-memroos tool sharing.
- OSI-strict OSS self-host at scale (Klavis self-host remains a future swap candidate, not v8.23 deliverable).
- Memroos becoming an OAuth server itself for agents (separate concern; tracks via Better Auth `@better-auth/oauth-provider` or Ory Hydra if pursued).

**Field report (2026-07-26, operator escalation — "integrations UI missing"):**

Root cause of the repeated "no auth UI for Notion/Circleback/Linear" reports: the TOOLAUTH-02
Connected Tools page shipped complete at `apps/memroos/src/app/settings/tools/page.tsx`
(provider grid, Nango OAuth popup flow, API-key sheet, revoke, usage meter, activity strip),
with all seven `/api/tools/*` routes and the `lib/tool-auth/` plane (registry with 16 providers
incl. Notion, Circleback `circleback-mcp`, Linear; Nango client; vault credential store) — but it
was **never wired into navigation**. No entry in `sidebar.tsx` `NAV_ITEMS[].match`, no tab in
`shell.tsx` `ROUTE_TABS`, and no `<Link>` anywhere pointed at `/settings/tools`. The page was
orphaned, so on the oracle-1 dev instance it appeared as if the feature did not exist.

Fixed on `claude/members-dashboard-auth-ui-82dpyh`:
- `shell.tsx` — added `Integrations` tab (`/settings/tools`) to the Governance tab group.
- `sidebar.tsx` — added `/settings/tools` to the Governance `match[]`; description now names integrations.
- `settings/tools/page.tsx` — converted from its own `<main>` (double padding + font override
  under the Shell) to the standard Pattern A wrapper (`<div className="space-y-6">`) used by
  api-keys/compliance/team; eyebrow aligned `Settings` → `Governance`.

Remaining for a working end-to-end connect flow (ops, not code):
1. Set `NANGO_SECRET_KEY` in the operator env (oracle-1: `/etc/memroos/web.env`; dev `.env.local`).
   Without it the page renders and the connect buttons surface "Nango not configured" inline.
2. Register provider configs in the Nango dashboard matching `providerConfigKey` values:
   `notion`, `linear`, `circleback-mcp`, `slack`, `github`, `google-calendar`, `google-drive`,
   `hubspot`, `salesforce`, `xero` — separate Nango environments for dev vs prod instances.
3. TOOLAUTH-06 (refresh observability NOC tile), TOOLAUTH-07 (revocation webhook dispatch),
   TOOLAUTH-08 (migrate Phase 176 Linear/Circleback + Phase 178 Paperclip consumers to
   `tool_auth.getCredentials()`) remain open.
4. Cited source docs (`.planning/spikes/2026-07-23-tool-auth-ux-*.md`,
   `.planning/design/2026-07-23-connected-tools-ux-design.md`) are missing from disk — recover or re-derive.

CI repairs shipped on the same PR (#51) because `Memroos tests and build` could not
pass otherwise — all four were red on main before this branch touched anything:
- `docs/next-trust-boundary-upgrade.md` baseline sha256 refreshed: `cc1483c` changed
  `proxy.ts` (the `/api/tools/providers` public-catalog bypass) without the checklist's
  step-7 refresh, so the trust-boundary gate failed every run since 2026-07-23.
- `/api/connmem/sync` moved to `sync/[source]/route.ts` (see Phase 185 field note) —
  was failing every `next build`, including all Vercel preview deploys.
- `runtime-topology.ts` v1→v2 parity restored (see Phase 186 field note) — 7 tests.
- `top-bar.tsx` SSR clock: `useSyncExternalStore` with an em-dash server snapshot
  restores the stable-placeholder contract (hydration-mismatch risk) — 1 test.
Still red and out of scope: `Scan for internal infrastructure leaks` (Tailscale IPs
in `content/sandbox/sandboxed-fleet-plan-*.md`, on main since 2026-07-08; needs a
separate redact-or-relocate decision).

### Progress Table (v8.23 Third-Party Tool Authentication Plane)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 179. Third-Party Tool Authentication Plane | 1/1 | UI + API shipped; nav wiring landed 2026-07-26 (`claude/members-dashboard-auth-ui-82dpyh`); Nango env/provider config + TOOLAUTH-06..08 open | 2026-07-23 |

## v8.24 Operator Lifecycle Toolkit (bin/memroos)

**Goal:** Give the sole operator a single, self-contained CLI on PATH that
covers every common host-level lifecycle action: launch / stop / restart
/ status / logs / update / redeploy / fix / doctor / shell / snapshot
/ restore / rollback / secrets-rotate / bench. No more shelling out
to docker compose by hand; no more ad-hoc SSH scripts; no more
guessing what's safe to do on a live install.

The CLI is installed automatically by `install.sh` via
`install -m 0755 bin/memroos /usr/local/bin/memroos` (with a
`~/.local/bin/memroos` fallback for non-sudo hosts).

### Phase 180 — Operator CLI Surface (bin/memroos) — SHIPPED 2026-07-23

**Goal:** Ship a single self-contained Python CLI on PATH.
**Depends on:** install.sh (so the CLI is auto-installed), scripts/redeploy-from-ref.sh + scripts/update.sh (the two large workflows the CLI dispatches to).
**Requirements:** OPSCLI-01, OPSCLI-02, OPSCLI-03, OPSCLI-04, OPSCLI-05

**Success criteria:**
1. `memroos launch / stop / restart / status / logs` work out of the box
   on a fresh install; no `docker compose` by hand.
2. `memroos status --json` returns the same shape the existing
   `/api/health` dashboard consumes, so monitoring tooling can be
   re-pointed at the CLI without a parser change.
3. `memroos update` calls `scripts/update.sh` with the right
   `--channel` flag; `memroos redeploy` calls
   `scripts/redeploy-from-ref.sh`. The CLI is a thin dispatcher, not
   a duplicate implementation.
4. `memroos fix` runs the diagnostic battery (docker daemon,
   compose file presence, .env + vault key permissions, disk space,
   service health) and prints findings; `--auto` applies the safe
   fixes (file modes, docker system prune). The auto-apply list is
   bounded — destructive fixes (e.g. `docker system prune -af`)
   are surfaced but never run unattended.
5. `memroos doctor` is an alias for `memroos fix` so the conventional
   name works for operators used to `docker doctor`-style commands.

**Out of scope (v8.24 Phase 180):**
- True auto-repair (currently only safe file-mode + prune fixes run
  unattended; everything else is surfaced for operator decision).
- SSH-less cross-host orchestration (Phase 181+).
- Operator UI inside the memroos app (CONNMEM-09 already covers the
  app-side operator surface; the CLI is the host-side complement).

### Phase 181 — Operator Recovery Suite (snapshot / restore / rollback / secrets-rotate)

**Goal:** Cover the "things went wrong, what do I do" paths: point-in-time
backup, restore from a snapshot, roll back to the last good commit,
rotate operator secrets without losing the install.
**Depends on:** Phase 180 (CLI), Phase 177 (install-repro --full).
**Requirements:** OPSCLI-06, OPSCLI-07, OPSCLI-08, OPSCLI-09

**Success criteria:**
1. `memroos snapshot` writes a tar.gz with `.env`, compose override,
   `data/`, and `services/connmem/ledger.db` to
   `$MEMROOS_SNAPSHOT_DIR` (default `/var/backups/memroos/`).
2. `memroos restore <archive>` extracts with a typed `yes`
   confirmation; refuses to clobber without it.
3. `memroos rollback <commit>` checks out the prior commit and
   re-runs `scripts/redeploy-from-ref.sh` so the host is on the
   declared ref.
4. `memroos secrets-rotate` rewrites `MEMROOS_JWT_SECRET`,
   `MEMROOS_OPERATOR_API_KEY`, `MEMROOS_ONBOARDING_SECRET` in `.env`
   (backed up to `.env.bak`), then restarts the memroos container.
5. Each action logs the decision to `/var/log/memroos/upgrade-decisions.log`
   (the same log `scripts/update.sh` writes to).

**Out of scope (v8.24 Phase 181):**
- Encrypted / off-host backups (current snapshots are plaintext
  tarballs on the same host).
- Key-rotation ceremonies that span >1 host (orchestrate later).
- Automatic scheduled snapshots (manual only for v8.24).

### Phase 182 — Quick Performance Baseline (bench)

**Goal:** A repeatable, low-overhead baseline the operator can run
before/after any change to see if the change moved latency.
**Depends on:** Phase 180, an installed stack.
**Requirements:** OPSCLI-10

**Success criteria:**
1. `memroos bench` samples `/api/health` N times (default 10), reports
   p50 + p95 in ms.
2. The benchmark does not require extra dependencies (only stdlib).
3. The benchmark is safe to run against a live install — single
   `/api/health` GETs, no side effects.

**Out of scope (v8.24 Phase 182):**
- Multi-route benchmarks (a single `/api/health` is enough to detect
  regressions; richer benchmarks are the v8.19 PERF-EVID work).
- Sustained load testing (use Phase 175's operator-load-test.mjs).

### Progress Table (v8.24 Operator Lifecycle Toolkit)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 180. Operator CLI Surface (bin/memroos) | 1/1 | Shipped on `beastmode/v8.23-tool-auth-plane` | 2026-07-23 |
| 181. Operator Recovery Suite | 1/1 | Shipped on `beastmode/v8.23-tool-auth-plane` | 2026-07-23 |
| 182. Quick Performance Baseline (bench) | 1/1 | Shipped on `beastmode/v8.23-tool-auth-plane` | 2026-07-23 |

## v8.25 Self-Service Password Reset (operator request, 2026-07-23)

**Goal:** Give the operator and end users a complete, working password-reset
flow on the public host (memroos.epiloguecapital.com). The backend (request +
confirm routes, password-reset tokens table, bcrypt hashing) is already on
main; what's missing is the UI: a "Forgot password?" link on /login, a
request form at /forgot-password, and a confirm form at /reset-password/[token].

### Phase 183 — Password Reset UI

**Goal:** Ship the three missing UI pages and wire them to the existing backend.
**Depends on:** existing `/api/auth/password-reset` + `/api/auth/password-reset/confirm` routes.
**Requirements:** PWRESET-01, PWRESET-02, PWRESET-03

**Success criteria:**
1. `/login` shows a "Forgot password?" link next to "Create an account".
2. `/forgot-password` shows an email-only form. On submit it calls
   `/api/auth/password-reset`. The response's `delivery` field is
   handled in both modes:
   - `delivery: "queued"` (email provider configured): show a generic
     "check your inbox" message (no user-enumeration leak).
   - `delivery: "manual"` (no email provider, dev/test mode): render the
     returned `resetUrl` as a clickable "Continue reset →" link so the
     operator can complete the flow without an email loop.
3. `/reset-password/[token]` shows new-password + confirm fields, calls
   `/api/auth/password-reset/confirm`, validates length and match, and
   redirects to /login on success.
4. All three pages use the existing NOC theme tokens (NOC.ink, NOC.paper,
   NOC.fog, NOC.warnBg, NOC.successBg) so they match the rest of the
   auth surface visually.
5. No new dependencies, no new environment variables, no DB migration
   needed (the `password_reset_tokens` table already exists).

**Out of scope (v8.25 Phase 183):**
- Email template design (delivery: "queued" just sends the link; the
  template is the operator's choice and can be a follow-on).
- Rate-limiting the request endpoint by IP or per-email (the backend
  already returns 200 either way; per-IP rate limiting can be added at
  the reverse proxy in front of memroos).
- "I forgot my email" recovery flow (out of scope for v8.25).
- Admin "force password reset" on a user (use the operator API to
  insert a password_reset_tokens row directly if needed; see the v8.24
  operator docs).

### Progress Table (v8.25 Self-Service Password Reset)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 183. Password Reset UI | 1/1 | Shipped on `main` | 2026-07-23 |
| 183b. SendGrid delivery for `delivery: "queued"` | 0/1 | **WIP, uncommitted on the operator Mac as of 2026-07-26** — `apps/memroos/src/lib/email/send.ts` (untracked) plus modified `api/auth/password-reset/route.ts`, `forgot-password/page.tsx`, `.env.example`. Phase 183 shipped the UI against `delivery: "manual"`; real email send was explicitly out of scope there. Not yet end-to-end tested against a live inbox | — |

### What we considered and DEFERRED

- **`memroos profile` (continuous resource profile per service).**
  Useful but redundant with existing NOC dashboard + Phase 175 PERF-EVID
  work. Queued for a follow-on.
- **`memroos trace` (distributed trace view).** Memroos already has
  Phase 8 audit chain + Phase 156 path-scoped disk diagnostics; a
  trace view would compete with those. Queued.
- **`memroos upgrade` (major version migration with manifest).** We
  have `update.sh` for in-place upgrades. Major-version migration
  across historical phases (e.g. v7 → v8 schema bridges) is a separate
  problem with a separate owner. Queued for a future operator-survey
  spike.
- **`memroos repair` (auto-repair).** v8.24 only auto-applies safe
  fixes (file modes, prune). True auto-repair across the full battery
  would require an LLM-assisted operator, which is out of scope for
  the operator-Lifecycle toolkit.

## v8.26 Auth UX Consistency (operator request, 2026-07-23)

**Goal:** Make all authentication + onboarding screens (login, register, invite,
forgot-password, reset-password, plus the public marketing site if it has an
auth surface) use the same design language as the rest of the memroos app.
Right now the auth surface is split: `apps/memroos/src/app/login/page.tsx`,
`apps/memroos/src/app/forgot-password/page.tsx`, and
`apps/memroos/src/app/reset-password/[token]/page.tsx` use the NOC theme
tokens (NOC.ink, NOC.paper, NOC.fog, NOC.warnBg, NOC.successBg, NOC.terraDeep)
from `@/lib/noc-theme` — the same tokens the main dashboard uses. But
`apps/memroos/src/app/register/page.tsx` and
`apps/memroos/src/app/invite/[token]/page.tsx` use the older
`bg-zinc-950` / `rounded-2xl` / `border-zinc` design that predates the
NOC operator console. Both are correct individually; the operator is
seeing visual drift when moving from dashboard to /register to
/invite to /login.

### Phase 184 — Auth Surface Migration to NOC Theme

**Goal:** Re-skin the two remaining auth pages to match the rest of the auth
surface + the main dashboard.
**Depends on:** the existing `@/lib/noc-theme` export and the patterns
established in `apps/memroos/src/app/login/page.tsx` (Phase 183/v8.25 baseline).
**Requirements:** AUTHUX-01, AUTHUX-02

**Success criteria:**
1. `apps/memroos/src/app/register/page.tsx` is re-skinned to use the
   `NOC` token palette (bg: `NOC.fog` or `NOC.paper`; text: `NOC.ink` and
   `NOC.muted`; button: `NOC.ink` with `NOC.paper` text; error: `NOC.warnBg`
   + `NOC.terraDeep`). Form structure, copy, and validation behavior
   unchanged.
2. `apps/memroos/src/app/invite/[token]/page.tsx` is re-skinned to match
   the same palette. The "accept your invitation" framing stays.
3. Both pages pass `apps/memroos/src/lib/auth/__tests__/route-auth.test.ts`
   (existing) and render visually consistent with `/login` at a
   baseline check: same card width, same input padding, same button
   geometry, same error background.
4. No new dependencies. No new env vars. The change is pure
   styling (Tailwind class swaps + NOC token reads).

**Out of scope (v8.26):**
- The marketing site (apps/memroos/src/app/(marketing) or similar) — that
  uses a separate design system tied to the public marketing surface
  (paperclip, wix, etc.) and is intentionally distinct.
- A full design-system refactor (a v9+ effort) — v8.26 is the
  two-page-mismatch fix only.
- Operator-side surface (NOC, Settings) — those already use NOC.
- New auth flows (OAuth, passkeys, magic links) — separate work.

### Progress Table (v8.26 Auth UX Consistency)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 184. Auth Surface Migration to NOC Theme | 0/1 | Planned (operator request 2026-07-23) | — |

## v8.27 Connected Work Memory Runtime Integration (Phase 185) — COMPLETE (2026-07-31)

**Goal:** Give `services/connmem` a runtime path so the v8.20 library becomes a running subsystem, and put its 141 tests behind CI. Source: `.planning/notes/2026-07-24-architecture-review.md` finding F1 — the library is complete but has no entrypoint, no CI, no compose/topology entry, and no kernel route; credentials are not the blocker.

### Phase 185 — Connmem Runtime Integration

**Depends on:** v8.20 Phase 176 (library complete on main), v8.15 (oracle-1 operator).
**Requirements:** CONNMEM-RT-01, CONNMEM-RT-02, CONNMEM-RT-03, CONNMEM-RT-04, CONNMEM-RT-05

**CONNMEM-RT requirement definitions:**
- CONNMEM-RT-01 — Service entrypoint: `services/connmem` exposes a supervised process (FastAPI + uvicorn, matching `services/orchestration`) with `/health`, or is explicitly re-scoped as an in-process library invoked by a named kernel route. Pick one and record the decision; the current state is neither.
- CONNMEM-RT-02 — CI coverage: `.github/workflows/ci.yml` Python job runs `pytest services/connmem/tests`. 141/141 green on PR, not on a developer's machine.
- CONNMEM-RT-03 — Topology + compose registration: `connmem` added to `runtime-topology.json` with ports, health path, `dependsOn`, and supervision modes; `docker-compose.local.yml` service added; `npm run check:runtime-topology` passes.
- CONNMEM-RT-04 — Kernel seam: a `/api/connmem/*` route (or documented equivalent) that authenticates via the existing agent/operator path, appears in `check-route-auth-boundary` coverage, and lets the operator trigger sync + read ledger state.
- CONNMEM-RT-05 — Release-gate honesty: the Phase 176 release gate cannot report green while RT-01..04 are open. Update the gate script to assert runtime reachability, not just test-suite exit code.

**Success criteria:**
1. `docker compose up` starts connmem; `/api/health` reports it; `memroos status` shows it.
2. CI fails if a connmem test breaks.
3. A dry-run sync against fixture data completes end-to-end through the kernel route with a sync-ledger row written.
4. The only remaining blocker to live backfill is genuinely provider credentials.

**Field note (2026-07-26, PR #51):** the CONNMEM-RT-04 kernel seam shipped early but
mis-shaped: `apps/memroos/src/app/api/connmem/sync/route.ts` declared
`params: Promise<{ source: string }>` at a static path, which failed `next build`'s
route type check and broke every Vercel deploy and local build. Moved to
`sync/[source]/route.ts` to match its documented contract
(`POST /api/connmem/sync/{source}` → connmem `/v1/sync/{source}`). Two RT-04 gaps
remain open: neither `/api/connmem/status` nor `/api/connmem/sync/[source]` is in
`proxy.ts` `ROUTE_LOCAL_AUTH_API_ROUTES`, so the proxy demands a human JWT before the
handlers' `authenticateAgentHeaders` ever runs — agents cannot reach the seam; and
the routes are not yet in `check-route-auth-boundary` coverage as RT-04 requires.

### Progress Table (v8.27 Connected Work Memory Runtime Integration)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 185. Connmem Runtime Integration | 1/1 | **Complete** — RT-01..05 evidenced (CI 144 tests, topology, proxy allowlist, oracle health/ledger/release-gate, `/api/health` connmem probe). Live Linear/Circleback backfill still credential-gated | 2026-07-31 |

## v8.28 Enforcement Surface Parity (Phases 186-187) — COMPLETE (2026-07-31)

**Goal:** Make the drift gates cover the deployment and the routes that actually exist, rather than the ones enumerated when each gate was written. Source: `.planning/notes/2026-07-24-architecture-review.md` findings F2 (topology gate is local-dev only while production is oracle-1) and F3 (route-auth gate validates a hand-maintained file list and cannot see new files under exempted prefixes).

### Phase 186 — Production Topology Profile

**Requirements:** TOPOPROD-01, TOPOPROD-02, TOPOPROD-03, TOPOPROD-04

**TOPOPROD requirement definitions:**
- TOPOPROD-01 — `runtime-topology.json` gains a `production` profile (oracle-1) alongside `local-dev`; `knowledge-mcp` and `healthcheck` added to both.
- TOPOPROD-02 — `check:runtime-topology` validates the production profile against the actual supervision mechanism on oracle-1 (systemd unit files / Cloudflare Tunnel config committed to `deploy/`), the same way it validates compose and launchd today.
- TOPOPROD-03 — `docs/production-deployment.md` and `docs/cloud-operator-oracle1-runbook.md` derive their service/port/health tables from the manifest rather than restating them, so prose cannot drift from the gate.
- TOPOPROD-04 — `scripts/verify-onboarding-deploy.sh` extended into a post-deploy profile check that asserts every `required: true` production service is healthy.

**Success criteria:** changing a production port or health path without updating the manifest fails CI. The oracle-1 runbook and the manifest cannot disagree.

**Field note (2026-07-26, PR #51):** TOPOPROD-01's version-2 manifest (profiles map,
`production` profile, `healthcheck`/`knowledge-mcp` services) merged via PR #49
(`af59905`) with `scripts/check-runtime-topology.mjs` updated — but
`apps/memroos/src/lib/runtime-topology.ts` and its two test files were left on the
v1 flat-services shape, so 7 vitest cases threw on main from 2026-07-24. Repaired by
teaching the TS lib the v2 shape (profile resolution with unknown-profile throw,
version-2 validation, port-less services allowed for the healthcheck systemd timer,
`systemd` supervision mode and `script` health type admitted). Lesson for the phase:
the manifest has two independent consumers (mjs gate + TS lib); TOPOPROD work must
update both or fold the TS lib onto the script's parser.

### Phase 187 — Filesystem-Driven Auth Gate

**Requirements:** AUTHGATE-01, AUTHGATE-02, AUTHGATE-03

**AUTHGATE requirement definitions:**
- AUTHGATE-01 — `check-route-auth-boundary.mjs` enumerates the filesystem for every prefix pattern in `ROUTE_LOCAL_AUTH_API_ROUTES` and requires an auth marker on every matching `route.ts`. Public-metadata exceptions become an explicit allowlist with a stated reason, not an untested comment.
- AUTHGATE-02 — The gate additionally asserts no `route.ts` exists outside both the proxy's default-deny path and the coverage list — closing the "new namespace, no auth" case.
- AUTHGATE-03 — A regression test adds a fixture route under an exempt prefix with no auth marker and asserts the gate fails. Gates that have never been seen to fail are not known to work.

**Success criteria:** creating `api/gsd/<anything>/route.ts` without a handler-local auth call fails CI. Phase 187 is small; it should land ahead of Phase 186 if capacity is tight.

### Progress Table (v8.28 Enforcement Surface Parity)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 186. Production Topology Profile | 1/1 | **Complete** — `check:runtime-topology -- production` ok (systemd units under deploy/oracle-1) | 2026-07-31 |
| 187. Filesystem-Driven Auth Gate | 1/1 | **Complete** — AUTHGATE-01..03; route-auth-boundary 15/15 + 60 vitest | 2026-07-31 |

## v8.29 Structural Debt Paydown (Phases 188-190) — PLANNED (2026-07-24)

**Goal:** Remove the three structures that make every subsequent milestone more expensive: no data-access chokepoint under the governance spine (F4), `lib/` boundary drift (F5), and the `api-client.ts` client barrel (F6). Explicitly incremental — no big-bang rewrites; each phase lands behind a gate that prevents regression. Source: `.planning/notes/2026-07-24-architecture-review.md`.

### Phase 188 — Data-Access Chokepoint

**Requirements:** STORE-01, STORE-02, STORE-03, STORE-04

**STORE requirement definitions:**
- STORE-01 — `lib/store/` with per-domain modules owning their tables. Governance fields (`actor, action, asset, purpose, label, decision`) are required arguments on write paths, so an ungoverned write does not typecheck.
- STORE-02 — `db-schema.ts` split by domain (`lib/store/<domain>/schema.ts`), migrations still ordered through the single `user_version` runner.
- STORE-03 — ESLint rule: `better-sqlite3` may only be imported from `lib/store/**` and test files. Existing violations enter an explicit, shrinking allowlist; new ones fail CI. **Land this first even if the migration itself is slow — it stops the bleeding.**
- STORE-04 — Two domains migrated as proof (recommend `memory` and `audit` — highest governance stakes), with the allowlist reduced accordingly.

**Success criteria:** a new domain cannot write to SQLite without emitting an audit event, because the API offers no other path. Allowlist size is tracked and monotonically decreasing.

### Phase 189 — lib/ Boundary Normalization

**Requirements:** LIBNORM-01, LIBNORM-02, LIBNORM-03

**LIBNORM requirement definitions:**
- LIBNORM-01 — `docs/architecture.md` Placement Rules gain an explicit rule: domain logic lives in `lib/<domain>/`; `lib/` root is reserved for cross-cutting primitives (`env.ts`, `db.ts`, `paths.ts`, `constants.ts`, `api-error.ts`). Write the rule before moving files.
- LIBNORM-02 — Consolidate the two worst offenders: all `memory-*.ts` plus `meeting-qmd-recall.ts` / `recollection-policy.ts` into `lib/memory/`; all `agent-*.ts` into `lib/agent/`. Use call-graph-aware `rename`, not find-and-replace.
- LIBNORM-03 — `check:lib-boundary` script fails on new root-level files outside the reserved primitives list.

**Success criteria:** `lib/` root drops from 79 files to the reserved set plus a declared, shrinking exception list. An agent asked to change memory behavior has exactly one directory to search.

### Phase 190 — Client Barrel Split

**Requirements:** CLIENTSPLIT-01, CLIENTSPLIT-02

**CLIENTSPLIT requirement definitions:**
- CLIENTSPLIT-01 — `lib/api-client.ts` (2,315 lines, 181 exports, imported by 83 files) split into `lib/api-client/<domain>.ts` mirroring the LIBNORM domain boundaries. Re-export shim kept for one milestone, then removed.
- CLIENTSPLIT-02 — Measure and record client bundle size for the three heaviest routes before and after in the phase closeout.

**Success criteria:** no single client module exceeds ~400 lines; measured bundle reduction on the NOC and operator console routes.

### Progress Table (v8.29 Structural Debt Paydown)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 188. Data-Access Chokepoint | 0/1 | Planned (architecture review 2026-07-24, F4) | — |
| 189. lib/ Boundary Normalization | 0/1 | Planned (architecture review 2026-07-24, F5) | — |
| 190. Client Barrel Split | 0/1 | Planned (architecture review 2026-07-24, F6) | — |

## v8.30 Seamless Memory Adoption (Phases 191-195) — PLANNED (2026-07-26)

**Goal:** Keep the core product promise — "agents should not start from zero when a team already solved, discussed, debugged, or decided something" — by making memory recollection and capture the natural default behavior of every connected agent session, without injecting full memories into every session. Source: operator session 2026-07-26 (agents neither check MemRoOS for prior work nor store enough, and prose directives haven't changed behavior); design: `.planning/design/memory-adoption-v1.md`.

**Grounding (2026-07-26 repo audit):** the machinery exists but the seams were never connected. The Phase 118 recollection kernel is shipped twice (`lib/recollection-policy.ts`, `lib/gsd/proactive-recollection.ts`) with zero live callers; `retrieval_trace` — the denominator of `retrievalBeforeWorkRate` — has no agent-reachable emitter; `/api/agent-memory/capture` is operator-key-only; the observe sidecar extracts 240 chars and is unscheduled; the default-visible MCP tools `memory_save`/`memory_search` bypass governance while governed `agent_memory_save` is not in `CORE_TOOLS`; silver→gold promotion never runs at runtime; the repo ships no session hooks; and the AGENTS.md skill bootstrap scans `$KNOWLEDGE_ROOT/skills`, which doesn't exist in a MemRoOS checkout.

**Design principles (binding for all five phases):** pointer not payload (session brief ≤ ~600 tokens, full memories pull-on-demand only); first call free (hook), later calls habitual (skills + tool-description contracts), every call pays off (usefulness feedback into ranking/salience); structure beats exhortation (hooks, gates, detectors — not more AGENTS.md prose); one governed write path with coach-back receipts; adoption is an SLO on the NOC; Skills > Memory ordering preserved (procedures → SkillForge, class lessons → skills, decisions/outcomes/facts/handoff state → memory); recall fails open with receipts, write policy fails closed; no new backend, no LLM-only promotion, no transcript dumping, depth default stays `relevant`.

### Phase 191 — Prior-Work Probe (agent-reachable recollection seam)

**Depends on:** Phase 118 (recollection kernel), Phase 117 (efficiency telemetry), Phase 152 (federated `memory_recall`). Coordinates with Phase 189 LIBNORM-02 (recollection module move).
**Requirements:** PRIORWORK-01, PRIORWORK-02, PRIORWORK-03, PRIORWORK-04, PRIORWORK-05

**PRIORWORK requirement definitions:**
- PRIORWORK-01 — Consolidate the two Phase 118 implementations into one canonical module under `lib/memory/recollection/` (LIBNORM-02-aligned): keep the richer trigger vocabulary (`source_changed`, `operator_reask`, `rediscovered_fact_risk`, `final_answer_citation_gap`) and the EFFTEL-04 rediscovery guard from `lib/gsd/proactive-recollection.ts`; keep the canonical `BeliefStage` export path stable; delete the losing module, don't deprecate it.
- PRIORWORK-02 — `POST /api/memory/prior-work` authenticated via `authenticateAgentHeaders` (agent API keys work): task statement + optional repo/project/entity/recency hints in → trigger policy → bounded query planner → tier search → ranking → threshold → **digest pack** out: ≤5 items of `{title, one_liner, belief_stage, age, salience, fetch_ref}` plus an explicit headline ("Related prior work exists: N items" / "No prior work found (tiers searched: …)"). Never returns raw memory payloads; skip decisions return typed reason codes.
- PRIORWORK-03 — MCP tool `memory_prior_work` added to `CORE_TOOLS`, wrapping PRIORWORK-02; its tool description carries the when-to-call contract (task start, topic shift, "have we done this before?" moments) so the trigger policy rides the one always-in-context surface.
- PRIORWORK-04 — Every probe — served **or** skipped — emits a `retrieval_trace` efficiency event carrying the full recollection receipt through an agent-reachable path, populating `retrievalBeforeWorkRate` from real external sessions for the first time.
- PRIORWORK-05 — `GET /api/agent-context` gains topic-based recall through the same recollection module (no `goal_id` required for the memories section), and an MCP wrapper exposes the context packet so agents don't need curl.

**Success criteria:** a fresh agent session with a valid agent key can ask one MCP tool whether prior work exists on its topic and get a truthful, belief-staged, pointer-sized answer; the NOC `retrievalBeforeWorkRate` shows a real value from a real external session; recollection receipts (served and skipped) are visible in the NOC recollection panel.

### Phase 192 — Session Hooks + Agent Self-Capture

**Depends on:** Phase 191 (probe to call), Phase 96/167-171 (capture API + observe plane).
**Requirements:** SELFCAP-01, SELFCAP-02, SELFCAP-03, SELFCAP-04, SELFCAP-05

**SELFCAP requirement definitions:**
- SELFCAP-01 — `/api/agent-memory/capture` accepts agent-key auth scoped so an agent may capture only its own sessions (operator key retained for the sidecar); rate-limited; depth policy (`relevant` default, `full` → vault only) enforced server-side regardless of caller.
- SELFCAP-02 — Repo-shipped hook set installed by `scripts/install-agent-integrations.sh`: **memory-brief** on session start (calls the prior-work probe with repo/branch/cwd context, injects a ≤600-token pointer digest; fails open on timeout with a miss receipt) and **capture-gate** on stop/pre-compact (posts structured capture — decisions, outcomes, errors, commands, files, verification — or a typed skip receipt; bounded timeout; failure becomes a receipt + NOC Attention item, never a blocked session).
- SELFCAP-03 — Hook capability matrix per harness (Claude Code native hooks; Codex via portable-hook equivalent; Hermes plugin; skill+sidecar fallback for the rest) committed and drift-gated like the observe-sidecar maturity matrix; no false full-coverage claims.
- SELFCAP-04 — Observe sidecar structured extraction v2: replace the 240-char `summarize()` with deterministic-first extraction of decisions, outcomes/verification, errors, commands, files touched, and entities, populating the rich `captureCodingAgentSession` fields that already exist; LLM assist only where depth policy allows.
- SELFCAP-05 — Sidecar actually scheduled (launchd/systemd/cron template installed by the installer) with heartbeat visible in NOC observe-harness health.

**Success criteria:** ending a hooked Claude Code session produces a structured silver candidate (or typed skip receipt) with zero manual steps; starting one surfaces prior work without the agent asking; an unhooked harness still gets captured by the scheduled sidecar with real structure, not 240 chars.

### Phase 193 — Storage Quality: Save-Quality Gate + Governed Defaults + Auto-Promotion

**Depends on:** Phases 120-123 (belief/promotion), Phase 104 (memory traces), Memento save-quality spike (2026-06-27, deferred adoption).
**Requirements:** SAVEQ-01, SAVEQ-02, SAVEQ-03, SAVEQ-04, SAVEQ-05

**SAVEQ requirement definitions:**
- SAVEQ-01 — Save-quality report on every governed write: scored for memory type, source/provenance, dedupe, specificity (outcome stated? project-scoped? entities named?), and promotion readiness; score persisted with the write (adopts the deferred Memento spike).
- SAVEQ-02 — Coach-back receipts: sub-threshold writes return actionable in-band guidance ("no outcome stated", "duplicate of <id> — rediscovery flagged", "this is a procedure — propose a skill instead"); hard-reject only on policy violations. The rubric encodes the Skills > Memory ordering.
- SAVEQ-03 — Governance parity: MCP `memory_save`/`memory_search` routed through the governed paths (policy + audit + dedup + telemetry), or demoted from `CORE_TOOLS` in favor of `agent_memory_save` + `memory_prior_work`; end state is that **no default-visible ungoverned memory write or untraced search exists** (decision D2 in the design doc, recommendation: route, don't remove).
- SAVEQ-04 — Automatic silver→gold promotion scheduler running the existing five deterministic checks (`evaluatePromotionChecks`: provenance, freshness, policy, conflict, dedupe) over aging candidates on a cadence; pass → gold with hash-chained receipt; conflict → operator review queue; **no LLM-only promotion**.
- SAVEQ-05 — Salience coverage extends to agent-written memories and candidates (today `memory_salience` keys on `messages.id` only), and `tool_record_outcome` usefulness feedback reinforces salience so recall ranking improves with use.

**Success criteria:** a vague memory write gets a coach-back receipt naming what to add; a duplicate write is flagged as rediscovery in telemetry; a well-formed silver candidate becomes gold within one scheduler cadence with a hash-chained receipt and no human in the loop; no MCP-visible path writes memory without an audit row.

### Phase 194 — Habit Layer: Skills + Bootstrap Fix

**Depends on:** Phase 191 (tool to teach), v8.6 skill trust chain, skill-packs workspace.
**Requirements:** MEMHABIT-01, MEMHABIT-02, MEMHABIT-03, MEMHABIT-04, MEMHABIT-05

**MEMHABIT requirement definitions:**
- MEMHABIT-01 — Fix the skill-packs root: the catalog falls back to the repo's own skills directories (`.agents/skills/`, private `~/.memroos/skills/`) when `$KNOWLEDGE_ROOT/skills` is absent, so the AGENTS.md auto-load bootstrap returns real skills in a MemRoOS checkout instead of an empty catalog.
- MEMHABIT-02 — Ship `memroos-recall` as a real SKILL.md with `auto_load: true`, generalized from `docs/integrations/multica-memroos-skill.md`: start-of-task probe protocol, mid-task re-probe triggers (topic shift, unexpected error, repeated question), and belief-stage handling rules (rely on gold, caveat silver, bronze is evidence only).
- MEMHABIT-03 — Upgrade `memroos-save`: the end-of-task persist checklist covers governed **memory** writes (decisions, outcomes, project facts, handoff state) alongside document writes, honoring Skills > Memory.
- MEMHABIT-04 — GSD skills hardened: `$goal` step 4 changes from "load memory if available" to a named mandatory `memory_prior_work` probe with a receipt; beastmode/qwen-cloud skills gain the same start-of-goal probe and end-of-goal learnings checkpoints.
- MEMHABIT-05 — Tool-description contract pass: memory-tool MCP descriptions and the `knowledge_system_orientation` prompt state the memory contract (probe at task start, governed save or skip receipt at task end) so the contract survives in harnesses where hooks and skills don't load.

**Success criteria:** `knowledge_workspace_call("skill-packs","catalog",{"filter":"auto-load"})` returns the recall/save skills from a clean MemRoOS checkout; a `$goal` run without a probe receipt is visibly non-compliant; the orientation prompt read by any MCP-connected harness states the contract.

### Phase 195 — Adoption Telemetry + GSD Gates

**Depends on:** Phases 191-194 (the behaviors to measure and gate), Phase 117 (metric plumbing), v8.18 NOCUX rules.
**Requirements:** ADOPTTEL-01, ADOPTTEL-02, ADOPTTEL-03, ADOPTTEL-04, ADOPTTEL-05

**ADOPTTEL requirement definitions:**
- ADOPTTEL-01 — NOC Memory Adoption panel (honest states per NOCUX): per-agent/per-harness recall-before-work rate, capture-per-session rate, rediscovered-fact rate, save-quality distribution, silver→gold throughput; known-unwired states remain explicit until producers verified.
- ADOPTTEL-02 — `research-without-persist-detector` generalized across Wave-1 harness session roots (Claude Code, Codex, Hermes, OpenClaw, Pi); findings surface as NOC Attention items, not only cron logs.
- ADOPTTEL-03 — GSD closeout gate: a phase/goal cannot close without a prior-work probe receipt at start and a learnings/decisions write (or typed skip receipt) at close; enforced by a check script wired into CI in the same pattern as `check-roadmap-priority`.
- ADOPTTEL-04 — Adoption SLOs recorded and measured on live operator data (not fixtures): retrieval-before-work ≥70% of working sessions; ≥1 governed write or typed skip receipt per working session; rediscovered-fact rate declining over a 30-day window; automatic silver→gold throughput >0 weekly.
- ADOPTTEL-05 — Eval fixtures for the adoption loop: "fresh employee, prior work exists" (probe must surface it), "no prior work" (must skip with receipt, no fabricated pack), "junk save" (coach-back fires), "duplicate save" (dedupe + rediscovery flag), "old-critical beats recent-noise" (regression-guards Phase 118 ranking through the new seam).

**Success criteria:** the operator can answer "are my agents actually using the brain?" from one NOC panel; a GSD phase that skipped memory hygiene fails its closeout gate in CI; the eval suite proves the loop end-to-end and fails when any seam disconnects again.

### Progress Table (v8.30 Seamless Memory Adoption)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 191. Prior-Work Probe | 0/1 | Planned (operator session 2026-07-26) | — |
| 192. Session Hooks + Agent Self-Capture | 0/1 | Planned (operator session 2026-07-26) | — |
| 193. Storage Quality Gate + Auto-Promotion | 0/1 | Planned (operator session 2026-07-26) | — |
| 194. Habit Layer: Skills + Bootstrap Fix | 0/1 | Planned (operator session 2026-07-26) | — |
| 195. Adoption Telemetry + GSD Gates | 0/1 | Planned (operator session 2026-07-26) | — |

**Plans** (all written 2026-07-26; each carries its own audited baseline, design contract, implementation steps, verification list, and risks):

- `.planning/phases/191-prior-work-probe/191-01-PLAN.md`
- `.planning/phases/192-session-hooks-agent-self-capture/192-01-PLAN.md`
- `.planning/phases/193-storage-quality-gate/193-01-PLAN.md`
- `.planning/phases/194-memory-habit-layer/194-01-PLAN.md`
- `.planning/phases/195-adoption-telemetry-gates/195-01-PLAN.md`

**Sequencing:** Phase 191 first — it creates the primitive everything else points at and turns on the headline metric. Phase 194 can run in parallel with 192/193. Phase 195 last, and its step 1 is a hard gate: verify each producer emits live before building any panel row, so v8.30 does not repeat Phase 117's outcome of correct metrics over empty tables. Smallest behavior-changing slice if capacity is tight: Phase 191 + the SELFCAP-02 hooks.

**Cross-phase notes:** Phase 191's module consolidation collides with Phase 189 LIBNORM-02 (same file move) — whichever lands first owns it. Phase 193's salience migration should coordinate with Phase 188 STORE-02. Phase 193's auto-promotion is the highest-stakes change in the milestone (gold is what agents rely on directly); consider one shadow-mode cadence before it promotes anything.

## v8.31 Operator Config Durability + Storage Consolidation (operator session, 2026-07-26)

*Added: 2026-07-26 · Source: oracle-1 hardening session 2026-07-25/26*

**Why this milestone exists.** A `docker compose up` that omitted a single
host-only file silently repointed the operator's graph writes from Neo4j Aura
to a throwaway local container, and left `QDRANT_URL` at the literal string
`your-qdrant-cloud-endpoint`. Both persisted undetected and were found by
accident, not by any alarm. v8.24 gave us `memroos doctor`/`repair`/`snapshot`;
it did not make the *configuration itself* durable. Operator's framing:
"all the configuration needs to be centralized and not so easily blown up."

**Governing constraint (operator hard rule):** no upgrade, restart, reinstall,
or migration on any host may lose users, configuration, or memory/data. Every
phase below is subordinate to that rule and fails closed where it cannot
satisfy it.

**Relationship to v8.29:** v8.29 pays down *code* structural debt; v8.31 pays
down *host/config* structural debt. They are independent and can run in
parallel.

**Requirements:** CFGDUR-01..06, HOSTPAR-01..04, STORECON-01..05

### Phase 196 — Config Durability + Anti-Regression

**Goal:** Make the oracle-1 fixes structural rather than conventional. They
currently depend on a human remembering to invoke `scripts/memroos-restart.sh`
and on a gitignored, hand-maintained file existing on exactly one host — a
single point of failure guarded by discipline, which is what failed the first
time.

**Key measured finding (oracle-1, compose v5.3.0, 2026-07-26):** an explicit
`-f` on the command line overrides **both** the automatic
`docker-compose.override.yml` pickup **and** the `COMPOSE_FILE` env var. Since
the outage command was `docker compose -f docker-compose.local.yml up -d`, no
env-var-based control can defend against it. **The app-side startup assertion
is therefore the primary control, not the fallback.**

Full plan: `.planning/phases/196-config-durability-anti-regression/196-01-PLAN.md`

### Phase 197 — cordant-hermes-01 Parity

**Goal:** Bring the least-observed host in the fleet under the same durability
and monitoring regime, with host-appropriate expectations.

**Operator decision 2026-07-26 (HOSTPAR-04 closed):** cordant-hermes-01 **stays
on local Neo4j**. Migrating it to Aura would mean a data migration on a host with
no verified backup — precisely the risk the no-data-loss rule exists to prevent.
This is recorded as intentional divergence. Consequence: the health check must
assert *conformance to each host's declared profile*, not a fixed topology, or it
will alert continuously here and get muted.

Full plan: `.planning/phases/197-cordant-hermes-01-parity/197-01-PLAN.md`

### Phase 198 — Storage Consolidation Decision + Population Cron

**Goal:** Decide SQLite→managed Postgres on measured evidence, and fix that
nothing currently *populates* embeddings or graph projections — only checks that
the backends are reachable.

**Operator decision 2026-07-26 (STORECON-03 provider chosen):** **Ollama
`nomic-embed-text` on oracle-1, $0 per call.** This completes the original v8.15
CLOUDOPS-01 plan that was never finished. Rejected OpenAI embeddings as a
recurring per-call bill for a quality delta that is not the bottleneck. Hard
gate: verify ≥6GB free before pulling the ~275MB model — the disk-watch warn
threshold is not a courtesy.

**Premise correction carried in STORECON-02:** the stated goal is "maximize use
of space," but **local Postgres on oracle-1 would use MORE disk than SQLite**
(WAL, per-index overhead, server process). Only *managed/remote* Postgres
reduces local footprint. The ADR must state which it chooses; changing nothing
is a legitimate outcome.

Full plan: `.planning/phases/198-storage-consolidation-population/198-01-PLAN.md`

### Progress Table (v8.31 Operator Config Durability + Storage Consolidation)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 196. Config Durability + Anti-Regression | 0/1 | Planned; partial groundwork live on oracle-1 (override + restart wrapper + extended health check + re-armed timers) — needs committing, testing, and generalizing | — |
| 197. cordant-hermes-01 Parity | 0/1 | Planned; HOSTPAR-04 decided (stay local) | — |
| 198. Storage Consolidation + Population | 0/1 | Planned; STORECON-03 provider decided (Ollama nomic, $0) | — |

### Carried operator items NOT in this milestone

- **Admin user creation** (`luis@epiloguecapital.com`, `luis.calderon@cordant.ai`)
  — status never confirmed. oracle-1 shows 2 users; which two is unverified.
- **Rotate the shared bootstrap password** set during 2026-07-25 provisioning
  (value deliberately not recorded here) — outstanding. Should use Phase 183b's
  live email path so the rotation exercises the real reset flow.
- **Supabase cleanup** (ApplyPilot delete; JobHunt export+delete;
  GrowthAlchemyLab untouched) — operator-confirmed but destructive and stale
  across several context compactions. **Re-confirm immediately before executing.**
  Not a MemRoOS-repo change.


## v8.32 Easy Human + Agent Onboarding (2026-07-31)

**Why:** Inviting a human (Eric) and connecting their agents are two disconnected
flows today. Operators mint agent curl|bash commands separately; invitees land
on login with no harness guidance. Goal: one easy journey with multi-harness
commands and a copyable email draft.

### Phase 201 — Invite + Multi-Harness Agent Bootstrap

**Goal:** After invitee creates an account, show a Connect-your-agents step
where they multi-select harnesses and get clear one-line install commands.
Agents registered this way set `owner_id` to the new user. Team invite UI
includes a copyable email draft (SendGrid deferred).

**Deploy / invite target for Eric (Cordant):** `cordant-hermes-01` via Cloudflare
Tunnel `memroos-cordant` → `https://memroos-cordant.epiloguecapital.com`
— **not** oracle-1 / `memroos.epiloguecapital.com`. PUBLIC_* URLs set on hermes 2026-07-31.

**Context:** `.planning/phases/201-invite-multi-harness-agent-bootstrap/201-CONTEXT.md`

**Requirement IDs:** INVBOOT-01..06

| ID | Criterion |
|----|-----------|
| INVBOOT-01 | Invitee register → Connect agents step (not login-only) |
| INVBOOT-02 | Multi-select harnesses → one command per harness |
| INVBOOT-03 | Commands use `https://memroos-cordant.epiloguecapital.com` (not localhost, not oracle epiloguecapital for Eric) |
| INVBOOT-04 | Registered agents persist `owner_id` = invitee user id |
| INVBOOT-05 | Team page shows copyable 3-step email draft after invite create |
| INVBOOT-06 | Tests cover bootstrap mint + owner_id + easy copy presence |

**Plans:** 1 plan

Plans:
- [x] 201-01-PLAN.md — Ownership + public URL + bootstrap API + invite Connect UX + Team email draft (INVBOOT-01..06)

### Phase 202 — Claude Cowork Remote MCP (Cordant)

**Goal:** Let Cordant CEO/workers who primarily use **Claude Cowork** (not Claude
Code) connect to MemRoOS on `cordant-hermes-01` with **no Tailscale** and no
local MCP process. Build on the live Cloudflare Tunnel
`memroos-cordant` → `https://memroos-cordant.epiloguecapital.com`.

**Why now:** Phase 201 ships curl|bash harness install for Claude Code/Cursor/etc.
Cowork only accepts **remote custom connectors** (Anthropic’s cloud dials your
HTTPS MCP). The Cordant tunnel currently terminates at the operator app
(`127.0.0.1:3000`); onboarding tokens already advertise `${publicUrl}/mcp`, but
Streamable HTTP MCP is not yet publicly routed/authenticated for Anthropic.

**Context:** `.planning/phases/202-claude-cowork-remote-mcp/202-CONTEXT.md`

**Requirement IDs:** COWORK-01..05

| ID | Criterion |
|----|-----------|
| COWORK-01 | Public Streamable HTTP MCP reachable at Cordant hostname (path `/mcp` or dedicated host) from Anthropic’s network — not Tailscale, not localhost |
| COWORK-02 | Auth for remote connector traffic (bearer via Claude Request headers and/or Cloudflare Access / OAuth); no open anonymous write surface |
| COWORK-03 | Invite Connect + Team draft include **Claude Cowork** path (deep link / numbered connector steps — not curl\|bash as primary) |
| COWORK-04 | Optional Claude plugin (or deep-link) that references the Cordant remote MCP URL for one-click-ish Cowork install |
| COWORK-05 | External smoke: add custom connector → tools list; CEO/worker laptop without Tailscale succeeds |

**Plans:** 1 plan (ops + UX)

Plans:
- [x] 202-01-PLAN.md — systemd + cloudflared `/mcp*` + Invite/Team Cowork UX + smoke checklist (COWORK-01..05)

### Phase 203 — Google Account Registration (not Cowork MCP auth)

**Goal:** Non-technical invitees can **Continue with Google** on `/invite/[token]`
and `/login` and land in an authenticated session bound to the invite (role +
ownership) without inventing a password. Operator clarification 2026-07-31:
Google is for **console account registration/login only** — Claude Cowork →
`/mcp` connector auth stays admin-managed bearer (per-user MCP OAuth is a
possible later phase, explicitly out of scope here).

**Context:** `.planning/phases/203-cowork-mcp-oauth/203-CONTEXT.md` (Version 2026-07-31.2)

**Suggested slice (from context):** Google OIDC via `arctic` (or equivalent) with
PKCE; `/api/auth/google` + `/api/auth/google/callback`; on success with valid
invite token create/link user, set role from invite, issue the same session
cookies as register; buttons on invite register + login pages only; env
`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / redirect URI per host (Cordant + oracle).

**Out of scope:** Cowork MCP OAuth, Cloudflare Access on `/mcp`, SendGrid.

### Progress Table (v8.32 Easy Human + Agent Onboarding)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 201. Invite + Multi-Harness Agent Bootstrap | 1/1 | Deployed oracle-1 + hermes (Eric invite smoke still manual) | 2026-07-31 |
| 202. Claude Cowork Remote MCP (Cordant) | 1/1 | Live `/mcp` + bearer + Invite/Team UX; SUMMARY + checklist | 2026-07-31 |
| 203. Google Account Registration | 0/1 | Planned — context filed 2026-07-31; copy fixes for the 202 Google-confusion already landed (`bc58d28a`) | — |

## v8.33 Ledger + Dashboard Data Honesty (Phases 204-205) — IN PROGRESS (2026-07-31)

*Added: 2026-07-31 · Version: 2026-07-31.1 · Sources: operator dashboard-accuracy session 2026-07-31 (Ledger/Workflow/Memory Inventory audit against oracle-1 live data)*

**Why:** The 2026-07-31 operator audit found the dashboard misreporting on
oracle-1: Ledger showed RTK KPIs as "unavailable"/"EMPTY" for an integration
that is not installed, `token_ledger` + `model_routing_events` are empty because
no writer runs in production, the Workflow Map rendered blank from a CSS
grid/SVG sizing collapse (data was fine), mem0 reports `memory_count: null`
so Vector Memories shows unavailable, and Knowledge Files / Skills show 0
because oracle's `/knowledge` mount is a stub — no `agent-knowledge` clone,
no `collections.config.json`, no `SKILLS_PATH`, empty `skill_registry`.
Operator decision: adopt a **point-and-index** model — MemRoOS points at the
superior knowledge center and indexes it, rather than copying files in.

### Phase 204 — Ledger Honesty + RTK Removal + Workflow Render

**Requirements:** LEDGHON-01..05

| ID | Criterion |
|----|-----------|
| LEDGHON-01 | RTK fully removed from Ledger UI (KPIs, Savings Breakdown tab, cost-savings card, `useTokenStats`); no RTK-derived numbers rendered anywhere on `/ledger` |
| LEDGHON-02 | `/api/model-usage` merges Claude JSONL + `token_ledger`; `model_routing_events` used **only** as fallback when the ledger is empty (no double-count — `recordModelRoutingEvent` mirrors into `token_ledger`); `sources` reports `modelRoutingUsedAsFallback` |
| LEDGHON-03 | Empty Ledger states are diagnosable: UI names the token writers (`/api/model-routing/telemetry`, GSD `routeGsdModel`, operations telemetry tokenLedgers, Claude JSONL mounts) instead of rendering zeros |
| LEDGHON-04 | Workflow Map renders at all viewport widths: responsive grid (stack below `xl`), SVG `minWidth` + `preserveAspectRatio` + horizontal scroll wrapper |
| LEDGHON-05 | Tests updated: ledger-page suite green without RTK mocks; new `model-routing-token-usage` aggregation test proves no double-count |

**Status 2026-07-31:** implementation complete on working tree (uncommitted);
tests green locally. Remaining: commit + deploy to oracle-1, then re-verify
`/ledger` and `/flow` on the live host.

### Phase 205 — Knowledge Vault Point-and-Index Provisioning (operator-gated)

**Requirements:** KNOWPROV-01..05

| ID | Criterion |
|----|-----------|
| KNOWPROV-01 | oracle-1 `/knowledge` is a real clone/pull of the superior knowledge center (`lac5q/agent-knowledge` or operator-confirmed successor), kept fresh (pull cron or governed sync) |
| KNOWPROV-02 | `collections.config.json` present (shipped or mounted) so Memory Inventory can count knowledge files |
| KNOWPROV-03 | `SKILLS_PATH` set (e.g. `/knowledge/skills`) in compose/env; skill registry syncs from it via the governed sync path (v8.6 trust chain, not legacy `skill-sync.py`) |
| KNOWPROV-04 | MCP `KNOWLEDGE_ROOT` points at the same vault; qmd/library indexing enabled over the collections so agents can search, not only list |
| KNOWPROV-05 | Inventory honesty: missing config or empty mount reports **unavailable** with a reason, never a silent 0 |

**Also open (diagnosed same session, tracked here):** mem0 `/health` returns
`memory_count: null` on oracle-1 — determine whether Qdrant collection is empty
or mem0 count reporting is broken, and surface the true state.

**Status 2026-07-31:** diagnosed; awaiting operator confirmation of the superior
knowledge center location and scope (oracle-1 only vs oracle-1 + cordant-hermes-01)
before ops execution.

### Progress Table (v8.33 Ledger + Dashboard Data Honesty)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 204. Ledger Honesty + RTK Removal + Workflow Render | 0/1 | Code complete on working tree; commit + oracle deploy + live re-verify remaining | — |
| 205. Knowledge Vault Point-and-Index Provisioning | 0/1 | Diagnosed; operator-gated (confirm vault source + host scope) | — |
