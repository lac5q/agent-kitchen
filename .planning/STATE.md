---
gsd_state_version: 1.0
milestone: v8.32
milestone_name: Easy Human + Agent Onboarding (Phases 201–202)
status: active
stopped_at: Closed 185/186/187 with evidence; Phase 202 Cowork UX still open
last_updated: "2026-08-01T00:50:00Z"
progress:
  total_phases: 121
  completed_phases: 89
  total_plans: 163
  completed_plans: 148
  percent: 71
---

## Latest Position (2026-07-31) — Closed verified phases only

**Closed with evidence (not checkbox theater):**
- Phase **185** CONNMEM-RT-01..05 — SUMMARY + oracle probes + CI/topology/proxy gates
- Phase **186** TOPOPROD-01..04 — `check:runtime-topology -- production` ok
- Phase **187** AUTHGATE-01..03 — route-auth-boundary green
- Phase **201** already shipped/deployed earlier

**Still open (do not mark complete):**
- Phase **202** Cowork — public `/mcp` + bearer live on Cordant; Invite/Team UX + COWORK-03..05 client smoke remaining
- Waves 188–198, 175, 191–195, 126–127 — not closed
- Voyage / Phase 166 — excluded

**Lane:** director-inline.

## Prior Position (2026-07-31) — Full deploy + GSD campaign queued

**Deploy:** oracle-1 + cordant-hermes-01 both at **`a5db4f7f`**. Public health
200 on `memroos.epiloguecapital.com` and `memroos-cordant.epiloguecapital.com`.
Phase 201 code is live on both brains. Cordant Team UI:
`https://memroos-cordant.epiloguecapital.com/team`.

**Hermes MCP gap (Phase 202):** tunnel + UI live; **no process on `:8765`**;
cloudflared still UI-only → COWORK-01 not done.

**Operator asked:** implement **all** remaining GSD roadmap phases under remote
control. Proposed wave order (needs confirm before burning through):

1. **202** Cowork remote MCP (Cordant) — unblock Eric/CEO clients  
2. **185** CONNMEM runtime + CI (unblocks v8.20 live)  
3. **187** authgate (hours) → **186** topology prod  
4. **188–190** structural debt → **196–198** config durability  
5. **191–195** memory adoption → **175** PERF-EVID  
6. **126–127** IdP/MDM — blocked on external infra  

**Exclusions:** Voyage / Phase 166. Ask before destructive DB/storage cutovers.

**Lane:** director-inline.

## Prior Position (2026-07-31) — Phase 201 executed

**Phase 201 (INVBOOT-01..06) shipped in code.** Invitees now land on Connect
your agents after register, mint one public-URL command per harness via
`POST /api/onboarding/bootstrap` (60m TTL, `ownerUserId` from session), and
agents persist `registered_agents.owner_id` from the signed onboarding token
only. Team shows a copyable 3-step email draft (no SendGrid). Commits:
`01a9c9a7`, `7456380b`, `d1f89850`. Phase gate: public-base-url +
invite-email-draft + session-cookies + slow onboarding (22) green.

**Still open for Eric:** deploy memroos build to **cordant-hermes-01**, smoke
`https://memroos-cordant.epiloguecapital.com`, then invite from hermes Team UI.

**Lane:** director-inline (auth). GitNexus MCP unavailable this session.

## Prior Position (2026-07-26) — v8.31 added, v8.15 closed

**Nango was on the WRONG KEY — fixed 2026-07-26.** oracle-1 was running the
Nango **dev** key, not prod. Confirmed by hashing the live value against both
1Password items (`NAngo API KEY Dev` / `Prod`, vaults AgentWritable +
Clawdbot): the live key matched Dev exactly. That is why only
`github-getting-started` appeared. The **prod** environment already has the
three integrations the operator asked about — `linear`, `circleback-mcp`, and
`notion` — with 0 connections so far (OAuth connects are the remaining step,
done from the Connected Tools UI, not by adding secrets).

Swapped oracle-1 to the prod key: `.env` backed up first, value piped over
stdin so it never entered a command line or process list, restarted via
`scripts/memroos-restart.sh`. Verified no data loss (users 2→2, agents 59→59),
Aura still pinned, `/api/health` 200, and `/api/tools` now returns
`authentication required` instead of `503 nango_not_configured`.

This directly unblocks part of the Phase 176 `CONNMEM-LIVE-DEFER` ticket: the
Linear and Circleback *provider authorization* path now has a real environment
behind it.

**Prior note (superseded):** The prior STATE flagged "Nango env/provider config still
open for live OAuth connects." Verified 2026-07-26 from oracle-1: the production
`NANGO_SECRET_KEY` in `/home/opc/memroos/.env` authenticates successfully —
`/environment-variables` 200, `/connection` 200, `/connect/sessions` returns a
valid session token and connect link. One integration configured
(`github-getting-started`) with one live connection. The key works; what remains
is adding the *intended production integrations* beyond the GitHub starter, which
is configuration in the Nango dashboard, not a code or credential problem.

**memroos MCP registered for Claude Code.** `/mcp` was failing locally because
the server was registered in Cursor and Codex but had no entry under the
`/Users/lcalderon/github/memroos` project scope in `~/.claude.json`. Added and
handshake-verified (`initialize` returns `knowledge-system` v2.14.7). The server
itself was never broken.

**v8.15 Always-On Cloud Operator — reconciled and closed.** Phase 164's "Aura +
Qdrant env" and "SQLite migrated" criteria were only partially true at the
2026-07-18 cutover and had since drifted: the app resolved `NEO4J_HTTP_URL` to a
local throwaway container instead of Aura, and `QDRANT_URL` was the literal
placeholder. Both fixed and continuously verified. Full local→oracle-1 migration
completed 217,002/217,002 statements, zero errors. Both systemd timers, found
`enabled` but unarmed since 2026-07-23, re-armed. Detail in ROADMAP §v8.15.

**v8.25 Phase 183 corrected.** Password-reset UI shipped against
`delivery: "manual"`; real SendGrid send is uncommitted WIP, tracked as 183b.

**v8.31 added — Phases 196-198.** The Aura disconnection was not a bug; it was a
correct compose invocation that omitted a host-only file, on a system where
omitting it produces a working-but-wrong stack with no error. Measured on
oracle-1: an explicit `-f` defeats both the auto-override and `COMPOSE_FILE`, so
the app-side startup assertion must be the primary control, not the wrapper
script. Three operator decisions recorded: retire cron+SendGrid in favor of
systemd+GitHub-issues; Ollama `nomic-embed-text` ($0) for embeddings;
cordant-hermes-01 stays on local Neo4j.

**Known-open, carried into Phase 198:** embedding generation disabled, so every
existing embedding is migrated history rather than live output; `graph-catchup`
returns `projected: 0` with cause not yet distinguished from that same root.

**Excluded deliberately:** Supabase cleanup is operator-confirmed but
irreversible and stale across several compactions — re-confirm before executing.

## Prior Position (v8.20 + v8.21)

# State: Memroos

## Project Reference

See: .planning/PROJECT.md

**Core value:** Any agent framework plugs into Memroos — and every agent, knowledge system, and skill becomes visible, connected, and self-improving.
**Current focus:** Hermes dual-mode memory — opt-in MemRoOS observe provider; built-in MEMORY.md remains default. (v8.12 MCP Memory Gate Resilience COMPLETE.)

## Current Position

Phase: Phase 176 first-session (v8.20 Connected Work Memory) + Phase 177 partial closure (v8.21 Reproducible Local Install Hardening) — 2026-07-21
Plans:
  - `.planning/phases/176-linear-circleback-unified-memory/176-02-FIRST-SESSION.md` (NEW this session)
  - `.planning/phases/176-linear-circleback-unified-memory/176-01-PLAN.md` (original CONNMEM-01..10)
  - `.planning/phases/177-reproducible-local-install-hardening/177-01-PLAN.md`
Status: **partial closure both phases**. Phase 176 first session landed on
`install-repro-connmem-bridge` (CONNMEM-02 schema + Linear SDL stub + GSD siblings);
release-gate live reconciliation is deferred per the
`CONNMEM-LIVE-DEFER` ticket. Phase 177 was closed-partial in the prior session
(INSTALL-REPRO-01..04 + 06 GREEN; INSTALL-REPRO-05 PARTIAL — destructive CI
run delegated to the branch-targeted full-disposable-host CI job).

**This run (claude cloud session, 2026-07-26 — PR #51 `claude/members-dashboard-auth-ui-82dpyh`):**
- **Root cause of "integrations UI missing" operator reports:** the Phase 179
  Connected Tools page (`apps/memroos/src/app/settings/tools/page.tsx`, Nango OAuth +
  API-key vault flows for Notion/Circleback/Linear + 13 more) shipped complete but
  was never wired into navigation — no sidebar match, no tab, no inbound link.
  Fixed: `Integrations` tab added to the Governance group (`shell.tsx`,
  `sidebar.tsx`); page converted from a self-padded `<main>` to the shared Pattern A
  shell with the `Governance` eyebrow. Full field report under Phase 179 in ROADMAP.md.
- **Main CI repaired on the same PR** (all red before this branch existed):
  trust-boundary baseline refreshed after `cc1483c`'s un-attested `proxy.ts` change;
  `/api/connmem/sync` moved to `sync/[source]/route.ts` (was failing every
  `next build` + Vercel deploy); `runtime-topology.ts` taught the Phase 186 v2
  manifest shape (7 tests); TopBar SSR clock restored to a stable placeholder via
  `useSyncExternalStore` (1 test). Fast suite 3407/3407, typecheck clean.
- **Still open:** `NANGO_SECRET_KEY` + Nango provider configs (dev/prod split) before
  OAuth connects work end-to-end; TOOLAUTH-06..08; connmem proxy allowlist +
  boundary coverage (Phase 185 field note); `content/sandbox` Tailscale-IP redaction
  for the infra-leak scan (pre-existing, deferred).

**This run (beastmode consolidated, 2026-07-21):**
- **CONNMEM-02 (canonical envelope + sync ledger)** shipped on
  `install-repro-connmem-bridge`:
  - `services/connmem/canonical_envelope.py` (frozen 16-field dataclass)
  - `services/connmem/sync_ledger.py` (SQLite-backed per-provider ledger)
  - 26/26 contract tests green (canonical envelope + sync ledger)
- **CONNMEM-04-prep** shipped: Linear GraphQL SDL vendored at
  `references/linear/SDL-STUBS.graphql` with provenance-tag vocabulary
  (`doc-derived`); doc-derived fixture at
  `scripts/connmem/fixtures/linear/__init__.py`
- **Phase 178 sibling stub** opened: NOTION-01 provider-coverage research;
  zero Notion adapter code this run per Fable's prior cut
- **CONNMEM-LIVE-DEFER** ticket filed for live release-gate reconciliation
- **Phase 177 push to origin/main** pending (18 commits ahead; pre-push
  gates: install-regression 9/9, vitest fast 3373/3373, typecheck baseline
  expected, lint expected)
- **Substitutions in lessons**: validator lane went
  claude-fable-5 (Anthropic API credit balance 0) →
  claude-opus-4-8 high (Pro lane) → codex gpt-5.6-terra high (OAuth, current).
  Recorded at `.beastmode/learnings/2026-07-21-fable-credits-depleted.md`.
  `bin/beast-validator` wraps `codex exec --model gpt-5.6-terra
  --reasoning-effort high`; effort floor MEDIUM, default HIGH, low refused.
- **Beastmode discipline rule** captured: every goal/plan file change must
  be followed by `bin/beast-todo-sync <file>` before the next tool call
  (script reads `## / ### / ####` headings and emits matching todo items).


**Still open (approval-gated, not in scope this session):**
- **v8.15 live** — public cutover verified 2026-07-18; opc SSH shell needs pubkey install for on-host re-smoke/deploy
- **MSIQ-06** — GraphRAG spike (Luis approval)
- **ENTOPS-04/05** — IdP/MDM
- **ENTOPS-07** — Claude/Codex wiring; Hermes rewrite still deferred
- **v8.9 / Phase 166** — Voyage/LLM scoring (explicitly excluded this pass)

## Session Continuity

Last session: 2026-07-21T22:00:00Z (this run, in progress)
Stopped at: install-repro-connmem-bridge carries CONNMEM-02 + Linear SDL stub + GSD siblings;
Phase 177 push pending validator audit + git push to origin/main;
CONNMEM-LIVE-DEFER tracks the live release-gate reconciliation;
Phase 178 sibling-stub holds Notion until NOTION-01 research lands.
Resume file: `.planning/goals/2026-07-21-beastmode-consolidated.md` (mirror of `~/.pi/goals/...`).
Resume file: `.planning/goals/2026-07-18-gsd-roadmap-quality-gate.md`
Next action: Luis installs Cursor Cloud SSH pubkey on opc@oracle-1 (v8.15 on-host re-smoke) and signs off on MSIQ-06 / ENTOPS-04/05/07.

## Roadmap Summary (v5.0 + v6.0)

| Phase | Goal | Requirements |
|-------|------|--------------|
| 74 | Security Label Schema + Raw Vault — append-only vault, multi-dim labels, additive migrations with safe defaults | COMPLETE — MEMSEC-01, MEMSEC-02 (2) |
| 75 | Classification Cascade + Ingestion Gate — fail-closed deterministic-first cascade + human review queue | COMPLETE — MEMSEC-03, CTX-FOLLOWUP-03 (2) |
| 76 | Retrieval Authorization Gate — policy decision on every recall/export/dispatch path | COMPLETE — MEMSEC-04 (1) |
| 77 | Safe Index Projections + Envelope Encryption — classification-aware FTS/vector/graph + AES-GCM rotation | COMPLETE — MEMSEC-05, MEMSEC-06, MEMSEC-07 (3) |
| 78 | Security Regression Tests — negative-fixture suite proves no leak path | COMPLETE — MEMSEC-08 (1) |
| 79 | NOC Telemetry + Real-Data Wiring — live NOC + provenance + efficiency telemetry | COMPLETE — NOC-01..14, OPS-AUDIT-01..04 (18) |
| 80 | Cron Health Registry + Schedules Console — heartbeat, caught-up, pause/resume, source contracts | COMPLETE — CTX-FOLLOWUP-01..02, CRON-HEALTH-01..05, UX-FOLLOWUP-03 (8) |
| 81 | Universal Evidence Bundles + Harness Control Plane — Plan-Execute-Verify timelines, shared state | COMPLETE — HARN-01..03 (3) |
| 82 | Auth Hardening — email invites, password reset, OAuth/SSO, role-aware nav | COMPLETE — AUTH-FOLLOWUP-01..03 (3) |
| 83 | Memory Inventory + Listing Clarity — category-specific counts, provenance rows, filters, degraded count honesty | COMPLETE — MEMLIST-01..05 (5) |
| 84 | Competitive Memory Target Architecture — marketplace comparison plus live recall hardening | COMPLETE — MEMTARGET-01 (1) |
| 85 | SkillForge Foundation — intake, proposal, worker, API routes, schema, tests | COMPLETE — SKILLFORGE-01 (1) |
| 86 | SkillForge Analyzer — pattern detection, fail-improve loop, test generation | COMPLETE — SKILLFORGE-02 (1) |
| 87 | SkillForge Edit Generation — bounded diffs, textual LR, rejected-edit buffer | COMPLETE — SKILLFORGE-03 (1) |
| 88 | SkillForge Eval Gating — train/val/held-out splits, W delta, non-regression gates | COMPLETE — SKILLFORGE-04 (1) |
| 89 | SkillForge Operator Approval — proposal queue, diff viewer, approve/reject/rollback | COMPLETE — SKILLFORGE-05 (1) |
| 90 | SkillForge Integration — cross-modal eval, SkillCycle, runtime export | COMPLETE — SKILLFORGE-06 (1) |
| 91 | Dream Cycle — automated nightly skill optimization with risk-based auto-approval | COMPLETE — DREAM-01 (1) |
| 92 | Skill Marketplace — publish, rate, discover skills | COMPLETE — MARKET-01 (1) |
| 93 | Multi-Agent Orchestration — cross-agent skill sharing via A2A | COMPLETE — MULTIAGENT-01 (1) |
| 94 | Behavioral W-Lift v2 — true instruction/skill behavioral eval | COMPLETE — BEHAVIORAL-01 (1) |
| 95 | Self-Hosted Eval Cluster — local judge, Ollama/vLLM support | COMPLETE — LOCALJUDGE-01 (1) |
| 96 | Agent Memory Continuity — MemRoOS-native coding-agent capture and handoff packs | COMPLETE — AGENTMEM-FOLLOWUP-01 (1) |
| 97 | Source Routing Contracts for Meeting Capture — project routing, confidence/review state, qmd freshness proof | COMPLETE — CTX-FOLLOWUP-04 (1) |
| 98 | Skill Distribution Core — progressive loading, auto-load standard, A2A discovery | COMPLETE — SKDIST-01..04 (4) |
| 99 | Private Config Layer — context overlay, generic meeting recordings slot, local merge | COMPLETE — PRIVCONF-01..03 (3) |
| 100 | Circleback Ingestion — sync CLI script, nightly LaunchAgent, qmd indexing | COMPLETE — CIRCLEBACK-01..03 (3) |
| 101 | Memroos Troubleshooter Skill — system troubleshooting reference skill, tag updates | COMPLETE — MSKILL-01..02 (2) |
| 102 | Public Documentation — skills and meeting integration guides, copy-paste template | COMPLETE — PUBDOC-01..03 (3) |
| 103 | Lightweight Checkpoint/Resume/Handoff — compact structured checkpoints, async queues, performance latency | COMPLETE — AGENTMEM-FOLLOWUP-02 (1) |
| 104 | Memory-Trace Observability — casual timelines, failure classification, debug graphs | COMPLETE — AGENTMEM-FOLLOWUP-03 (1) |
| 105 | Agent CI/CD Release Gates — immutable versions, gating checklists, one-step rollback | COMPLETE — AGENTCICD-FOLLOWUP-01 (1) |
| 106 | SkillForge Production SkillOpt Hardening — real behavioral eval, one proposal path, schema traceability, typed edit ops, audit/UI receipts | COMPLETE — SKILLOPT-HARDEN-01..05 (5) |
| 107 | Agent Context Bus and Synchronous Agent Communication — durable inbox/reply bus, MCP wrappers, memory-save receipts, control-layer access enforcement, delegated user/OAuth identity, audit/security tests | COMPLETE — AGENTBUS-01..07 (7) |
| 108 | Cloud Offload + Local Footprint Reduction — inventory local permanence, migrate eligible stores/indexes to managed cloud, cap caches/logs, preserve encryption/rollback/offline fallback | COMPLETE — CLOUDOFFLOAD-01..06 (6) |

**Coverage:** 64/64 v5.0-v6.5 requirements mapped, no orphans.
**Critical path:** 74 → 75 → 76 → 77 → 78. Phases 79, 80, 81, 82 run parallel (81 soft-depends on 74).
**Completed so far:** Phase 34 through Phase 108 shipped; Phase 109 through Phase 113 v7.0 audit complete.

## Performance Metrics

**Velocity:**

- Total v2.0-v2.4 plans completed: 29
- Phase 35 execution completed: 2026-05-05
- Phase 36 completed: 2026-05-05
- Latest Phase 40 gate: docs link/content review, markdown grep checks, Memroos lint, and build passed

## Accumulated Context

### Roadmap Evolution (2026-07-10, v8.5 milestone COMPLETE)

- **v8.5 Agent Fleet Plane milestone COMPLETE.** All 26 FLEET requirements (FLEET-01..26) shipped across 6 phases (142-147): Phase 142 (FLEET-01..04, architecture lock + GLM-5.2 validation), Phase 143 (FLEET-05..08, runtime adapter maturity matrix), Phase 144 (FLEET-09..12, LangGraph peer contract + checkpoint durability), Phase 145 (FLEET-13..16, pre-execution policy gate), Phase 146 (FLEET-17..21, Paperclip tenant integration + cost delegation), Phase 147 (FLEET-22..26, secrets broker + kernel HA path). No new runtime npm dependencies across the entire milestone. MEMSEC-08 regression corpus (25/25) remained green throughout. Validator (GLM-5.2 BYOK) passed on Phases 142-145; Phases 146-147 self-verified (validator unavailable). Post-v8.5 milestone candidates: v8.6 Skill Trust Chain, v8.7 Memory Lifecycle + Erasure, v8.8 Orchestration Evidence Depth, v8.9 Retrieval Quality + External Benchmark Proof, v8.10 Governed Ontology Foundation.

### Roadmap Evolution (2026-07-10, Phase 147 complete)

- Phase 147 (v8.5, FLEET-22..26) completed and locked. Secrets Broker + Kernel HA Path: comprehensive secrets and durability runbook created at `docs/secrets-and-durability.md` covering FLEET-22 (secrets path: env vars in `.env.local`, agent key provisioning via `provision-agent-keys.sh` + onboarding tokens, envelope encryption via AES-256-GCM, audit receipt hygiene per POLGOV/MEMSEC-08, rotation guidance, no secrets in git), FLEET-23 (kernel durability: single-host SQLite + litestream replication path documented, Postgres migration path documented as future, restore drill executed), FLEET-24 (LangGraph checkpoint durability aligned with Phase 144 FLEET-11, restore drill covers both kernel and orchestration DBs), FLEET-25 (SPIFFE/SPIRE + Envoy rate-limit documented as "not v8.5" stretch), FLEET-26 (auto-provision of agent hosts explicitly out of scope, industry gap cited). Restore drill script created at `scripts/restore-drill.sh` — idempotent, works on copies only (sqlite3 .backup is read-only on source), verifies integrity_check + agent count + audit counts + schema version + table count. Drill executed: 53 agents, 5,301 audit_log entries, 6,341 audit_entries, schema v10, 92 tables, integrity ok, exit 0. Orchestration DB skipped (not running — expected). No new runtime npm deps. MEMSEC-08 regression corpus remains green (25/25). No external model validation was run in this session; implementation is self-verified via typecheck, lint, MEMSEC-08, restore drill, and contract manifest.
- Non-blocking findings logged in `.planning/phases/147-secrets-fleet-ha/147-01-SUMMARY.md`: no external model validation, orchestration DB not present in dev environment, no new npm dependencies.
- Phase 147 status moved from potential plan to complete/locked. v8.5 milestone COMPLETE. Next: post-v8.5 milestone candidates (v8.6 Skill Trust Chain, etc.).

### Roadmap Evolution (2026-07-09, Phase 146 complete)

- Phase 146 (v8.5, FLEET-17..21) completed and locked. Paperclip Tenant Integration + Cost Delegation: ownership boundary contract pinned at `docs/integrations/paperclip.md` (Paperclip owns companies/issues/budgets/board/activity; MemroOS owns registry/memory/fleet governance; no federation; passive adapters; cost hard-stop delegated to Paperclip). Two integration paths shipped: `POST /api/paperclip/activity` ingests Paperclip activity events into the MemroOS audit chain (`audit_entries` with `event_type=paperclip.activity`, `entity_type=paperclip`) with defense-in-depth secret redaction; `GET /api/paperclip/budget` proxies a thin budget summary from Paperclip with `hardStopOwner: "paperclip"` on every response (read-only, never pauses agents). Types added: `PaperclipActivityEvent`, `PaperclipBudgetSummary` in `types/index.ts`; `PAPERCLIP_ACTIVITY` event type + `PAPERCLIP` entity type in `audit/event-types.ts`. Env vars added to `.env.example` as placeholders (`PAPERCLIP_BASE_URL`, `PAPERCLIP_STATUS_PATH`, `PAPERCLIP_DISPATCH_PATH`, `PAPERCLIP_BUDGET_PATH`). Tests: 24 new tests (12 activity + 12 budget) covering ingestion, delegation, no secret leaks, and graceful degradation. No new runtime npm deps. MEMSEC-08 regression corpus remains green. No external model validation was run in this session (validator unavailable); implementation is self-verified via typecheck, lint, tests, build, and MEMSEC-08.
- Non-blocking findings logged in `.planning/phases/146-paperclip-tenant-integration/146-01-SUMMARY.md`: budget endpoint proxies the default budget surface (no per-scope query params yet), activity endpoint is single-event (no batching), and no external model validation was run.
- Phase 146 status moved from potential plan to complete/locked. Phase 147 (Secrets Broker + Kernel HA Path, FLEET-22..26) is now the next and final executable phase for v8.5.

### Roadmap Evolution (2026-07-09, Phase 145 complete)

- Phase 145 (v8.5, FLEET-13..16) completed and locked. Pre-execution policy gate added at the GSD adapter boundary in `apps/memroos/src/lib/gsd/adapter-policy-gate.ts` and wired into `POST /api/gsd/adapter` in `apps/memroos/src/app/api/gsd/adapter/route.ts`. The gate runs after the GSD safety check and before `executeGsdAdapterAction`, delegates to the existing POLGOV `evaluatePolicy` engine (no policy logic reimplemented), and is fail-closed: engine exceptions return a synthetic deny receipt. Denied actions return HTTP 403 with an operator-visible policy receipt containing policyVersion, domain, action, ruleMatched, outcome, reason, actorId, and createdAt; the HTTP response deliberately omits `detail` and other internal fields. Audit rows are written via the POLGOV receipt path. Tests: 7 unit tests in `apps/memroos/src/lib/gsd/__tests__/adapter-policy-gate.test.ts` plus 2 integration tests in `apps/memroos/src/app/api/gsd/adapter/__tests__/route.test.ts` (9/9 pass). Verification also included `npm run typecheck` (clean), `npm run lint` (0 errors, 37 pre-existing warnings), and MEMSEC-08 regression corpus (25/25 pass). Validator verdict PASS (GLM-5.2 BYOK via beastmode-validator) with no blocking findings.
- Non-blocking findings logged in `.planning/phases/145-pre-exec-policy-gate/145-01-SUMMARY.md`: `discord`/`telegram` platform mapping defaults to `hermes` (unused by capability decision today), `protocol: "gsd"` is a type cast because `gsd` is not in the `AgentProtocol` enum, and exception-path receipts are distinguishable by `policyVersion: "unknown"` / `ruleMatched: "gate.error"`.
- Phase 145 status moved from potential plan to complete/locked. Phase 146 (Paperclip Tenant Integration, FLEET-17..20) is now the next executable phase.

### Roadmap Evolution (2026-07-09, Phase 144 complete)

- Phase 144 (v8.5, FLEET-09..12) completed and locked. LangGraph peer contract pinned at `docs/integrations/langgraph.md`, covering the ownership split: MemroOS remains the top-layer fleet plane (registry, memory, governance, A2A, NOC, fleet); LangGraph runs as a peer orchestration runtime for stateful graphs, checkpoints, and HIL. Checkpoint durability documented with a Litestream replica example at `services/orchestration/litestream.yml.example`. Smoke tests for HIL/checkpoint wiring created at `services/orchestration/tests/test_hil_checkpoint_smoke.py` and passed. SQLite ownership split between the MemroOS operator DB and the LangGraph orchestration DB is documented in `docs/architecture.md`. Validator verdict PASS (GLM-5.2 BYOK via beastmode-validator). No runtime behavior changes were introduced; the work is a docs + test contract phase.
- Non-blocking, pre-existing concern: `services/orchestration/tests/test_app.py` still carries a pydantic-core environment issue that was present before Phase 144; it does not affect the LangGraph contract and is left for a separate cleanup pass.
- Phase 144 status moved from potential plan to complete/locked. Phase 145 (Pre-Execution Policy Gate, FLEET-13..16) is now the next executable phase.

### Roadmap Evolution (2026-07-09, Phase 143 complete)

- Phase 143 (v8.5, FLEET-05..08) completed and locked. Runtime Adapter Maturity Matrix created at `docs/runtime-adapter-maturity.md`, all 9 targets classified: Hermes T1; OpenClaw, Codex, Claude Code, Cursor, OpenCode T2; Qwen, Gemini, ZCode T3. Matrix linked from the Fleet plane subsection of `docs/architecture.md`, validator verdict PASS (GLM-5.2 BYOK via beastmode-validator), and no code changes were required (docs-only phase).
- Phase 143 status moved from potential plan to complete/locked. Phase 144 (LangGraph Peer Contract + Checkpoint Durability, FLEET-09..12) is now the next executable phase.

### Roadmap Evolution (2026-07-09, Phase 142 complete)

- Phase 142 (v8.5, FLEET-01..04) completed and locked. Fleet Architecture Lock + Validation Gate: architecture decision reviewed (MemroOS = top-layer fleet plane; LangGraph = peer orchestration runtime; Paperclip = parallel tenant), GLM-5.2 independent validation achieved on 2026-07-09 via beastmode-validator (GLM-5.2 BYOK) with verdict PASS, S12 multi-machine Mac + remote Hermes/OpenClaw scenario added as v8.5 acceptance scenario, `docs/architecture.md` Fleet plane subsection added, and validation artifact filed at `content/architecture/memroos-fleet-plane-validation-glm52-2026-07-09.md`.
- Phase 142 status moved from potential plan to complete/locked. Phase 143 (Runtime Adapter Maturity Matrix, FLEET-05..08) is now the next executable phase.

### Roadmap Evolution (2026-07-08, Phases 139-141)

- Phase 139 (v8.4, SHAREDRO-01..03) completed. `is_shared` boolean flag on spaces table (v8 migration), enforced at both write-persistence gate (`assertWritableSpace` throws on shared) and read-side gate (`assertReadableSpace` writes policy receipt). Toggling off requires a reason. 14 tests, GLM-5.2 PASS.
- Phase 140 (v8.4, CACHEADMIN-01..05) completed. `space_cache_state` table (v9 migration) with per-resource tracking. `getCacheState` returns summary; `invalidateResource`/`invalidateSpace` with shared-space enforcement, 5s coalescing, and rate limiting (5/60s resource, 3/60s space). `getInvalidationHistory` from audit entries. 14 tests, GLM-5.2 PASS.
- Phase 141 (v8.4, ARTGATE-01..03) completed. `space_artifact_settings` table (v10 migration). `promptSaveArtifact` single-confirmation prompt; `saveArtifact` enforces writable + active workspace gates, creates/updates document directory entry, emits audit with belief stage; auto-README pointer update per-space toggle. 14 tests, GLM-5.2 PASS.
- v8.4 milestone COMPLETE. All 22 requirement IDs shipped across 5 phases (137-141). 146 total tests pass across v8.4 modules. MEMSEC-08 regression corpus byte-identical throughout. Zero new npm dependencies.

### Roadmap Evolution (2026-07-08/09, v8.5 milestone planning)

- v8.5 Agent Fleet Plane milestone kickoff filed at `.planning/milestones/v8.5-agent-fleet-plane-KICKOFF.md`. Architecture decision locked: MemroOS = top-layer fleet plane (registry, memory, governance, A2A, NOC, fleet); LangGraph = peer orchestration runtime (stateful graphs, checkpoints, HIL); Paperclip = parallel tenant (companies, budgets, board). Explicitly rejected: LangGraph-as-control-plane, Archestra top-layer (AGPL), CrewAI ACP (cloud-only), "Gardner" (no OSS match). Kickoff status: planning (potential plan; not yet `/gsd:plan-phase` executed).
- Architecture sources: `content/architecture/memroos-as-agent-fleet-plane-2026-07-08.md` (architecture decision), `content/research/agent-control-planes-2026.md` (OSS control-plane survey), `content/audits/paperclip-control-plane-audit-2026-07-08.md` (Paperclip audit).
- Phase directories 142-147 created as potential phase names with architect-allowed scope (`142-fleet-architecture-lock`, `143-runtime-adapter-maturity`, `144-langgraph-peer-contract`, `145-pre-exec-policy-gate`, `146-paperclip-tenant-integration`, `147-secrets-fleet-ha`). Each maps to FLEET-01..26 in REQUIREMENTS.md; the v8.5 section of REQUIREMENTS.md is preserved as planned (not completed) state.
- ROADMAP.md milestone list updated to insert v8.5 after v8.4. Renumbering note (2026-07-08): Skill Trust Chain v8.5→**v8.6**, Memory Lifecycle v8.6→**v8.7**, Orchestration Evidence v8.7→**v8.8**, Retrieval Quality v8.8→**v8.9**, Ontology v8.9→**v8.10**. Earlier 2026-07-07 ontology v8.4→v8.9 renumbering is superseded.
- Out of scope for v8.5 (documented explicitly in kickoff): replacing Paperclip with Archestra; LangGraph as top control plane; multi-Paperclip server federation; auto-provision new agent hosts on demand; full SPIFFE/SPIRE + Envoy rate-limit multi-cluster identity (stretch for 50-machine stack; documented only in Phase 147 HA notes).
- **Validation gate gap acknowledged:** v8.5 kickoff notes GLM-5.2 validation **not achieved** at planning time (`GLM_API_KEY` unset; self-validation only). Phase 142 mandates a real independent-model second-opinion validation with `model:` provenance not equal to the authoring model (MiniMax-M3); amend loop opens on reject. STATE.md updated to reflect this requirement in the Phase 142 next-action line.
- Scenario **S12** (multi-machine Mac + remote Hermes/OpenClaw under one MemroOS operator; Paperclip optional for company budgets) recorded as the v8.5 acceptance scenario per kickoff.

### Roadmap Evolution (2026-07-08, Phase 138)

- Phase 138 (v8.4, WRITERULES-01..06) completed via Beastmode Director/Worker/Validator loop. Worker = inherit model (MiniMax-M3 BYOK unavailable), Validator = GLM-5.2 BYOK. Six capabilities: (1) declarative write rules table per space (data_type → target_document with fallback_rule) with CRUD; (2) `resolveWriteTarget` consults rules before routing saves, writes mismatch audit receipts; (3) document directory CRUD per space (name + purpose + resource_id); (4) all mutations write typed audit_entries events + `checkWriteRuleDrift` detects stale agent views; (5) optimistic locking on all update/delete (version mismatch throws, version increments); (6) schema validation rejects invalid rules at edit time (empty dataType/targetDocument, invalid fallbackRule).
- Schema migration: v6→v7, added `write_rules` + `document_directory` tables with unique indexes and ON DELETE CASCADE to spaces. Idempotent. Backward-compatible.
- HARD CONSTRAINT preserved: MEMSEC-08 regression corpus passes byte-identical (8 tests). Wrapped files (`policy-gate.ts`, `security-policy.ts`) verified zero git diff.
- Verification: 104 tests pass (28 write-rules + 58 policy + 8 MEMSEC-08 + 10 workspace); zero tsc errors under `src/lib/write-rules`; GLM-5.2 validator PASS. Non-blocking: cosmetic error message copy-paste on document directory version conflicts, audit inserts best-effort, drift check only covers write_rules not document_directory.

### Roadmap Evolution (2026-07-08, Phase 137)

- Phase 137 (v8.4, WORKLOAD-01..05) completed via Beastmode Director/Worker/Validator loop. Worker = MiniMax-M3 BYOK, Validator = GLM-5.2 BYOK. Five capabilities: (1) `loadWorkspace` atomically clears prior active row + inserts new `active_workspace` row + writes `workspace.loaded` audit entry; (2) load event recorded in `audit_entries` with actor/spaceId/timestamp/isHeadless metadata (replayable); (3) `promptWorkspaceSelection` returns `needsSelection: true` with available spaces only when no workspace active (single confirmation, not recurring); (4) `assertWorkspaceForHeadless` throws with explicit WORKLOAD-04 reference (no silent default, no last-used fallback); (5) `isWriteTargetInWorkspace` deny-by-default for non-matching spaces + `recordCrossSpaceRead` writes policy-receipted audit row with fromSpaceId/toSpaceId/policyReceiptId.
- Schema migration: v5→v6, added `active_workspace` table with `space_id` FK, `is_headless` flag, `cleared_at` for lifecycle, and two indexes (partial active + space lookup). Idempotent. Backward-compatible.
- HARD CONSTRAINT preserved: MEMSEC-08 regression corpus passes byte-identical (8 tests). Wrapped files (`policy-gate.ts`, `security-policy.ts`) verified zero git diff.
- Verification: 76 tests pass (10 workspace + 58 policy + 8 MEMSEC-08); zero tsc errors under `src/lib/workspace`; GLM-5.2 validator PASS. Non-blocking: hardcoded `'default-tenant'` in audit INSERT (matches Phase 130/131 conventions), silent catch on best-effort audit write, defensive `ORDER BY id DESC LIMIT 1` in `getActiveWorkspace`.

### Roadmap Evolution (2026-07-07, Phase 131)

- Phase 131 (v8.2, TEAMSCALE-02..06) completed via Beastmode Director/Worker/Validator loop. Worker = MiniMax-M3 BYOK (hermes), Validator = GLM-5.2 BYOK. Five capabilities: (1) atomic joiner flow `onboardUser` (user+role+space+agent+key in one transaction with OnboardingReceipt); (2) atomic leaver flow `offboardUser` (revoke credentials+deregister agents+reassign artifacts+MEMLIFE review) + `scanOrphanedAgents`; (3) verifiable delegation chains with `weakestLinkOutcome` (policy evaluates weakest link); (4) per-team NOC views (`getTeamNocView` with memoryGrowth, promotionQueueDepth, policyDenials, skillUsage, agentActivity); (5) owner-gated assets with standing/per-use approval (`checkOwnerGate` + `grantStandingApproval` + `grantPerUseApproval`).
- Schema migration: v4→v5, added `owner_id` on `registered_agents` (ON DELETE SET NULL) + `owner_gate_approvals` table (standing/per-use with CHECK constraint + 3 indexes). Idempotent.
- Director caught and reverted unrelated scope creep (worker added "droid" platform type to 8 files outside Phase 131 scope; reverted via `git checkout HEAD`).
- HARD CONSTRAINT preserved: MEMSEC-08 regression corpus passes byte-identical. Wrapped files unchanged.
- Verification: 101 tests pass (35 identity + 66 policy/MEMSEC-08); zero tsc errors under src/lib/identity; GLM-5.2 validator PASS. Non-blocking: verifyDelegationChain doc/code drift (capability subset check not enforced), LIKE pattern on metadata_json for policyDenials, dead crypto import in owner-gate.ts.

### Roadmap Evolution (2026-07-07, Phase 130)

- Phase 130 (v8.2, TEAMSCALE-01 + MSIQ-01/02/03) completed via Beastmode Director/Worker/Validator loop. Worker = MiniMax-M3 BYOK (hermes), Validator = GLM-5.2 BYOK (hermes). Four capabilities shipped: (1) spaces + space_members schema with membership and zero cross-space leakage (TEAMSCALE-01); (2) knowledge frontmatter label validation for sensitivity/authoritative/verified_at/expires_at (MSIQ-01); (3) label-aware search/read authorization with default-open for unlabeled docs (MSIQ-02); (4) ranking boosts authoritative, demotes expired, flag_expired_unverified job (MSIQ-03).
- Schema migration: v3→v4, added spaces + space_members tables and messages.space_id column. Backward-compatible (nullable space_id, project-name fallback in filterBySpace).
- HARD CONSTRAINT preserved: MEMSEC-08 regression corpus passes byte-identical. Wrapped files unchanged.
- Verification: 76 TS tests pass (10 space + 66 policy/MEMSEC-08) + 32 Python tests pass (19 labels + 13 tenant isolation); zero tsc errors under src/lib/space; GLM-5.2 validator PASS. Non-blocking: filterBySpace project-name fallback could theoretically match a sibling space by name, bounded by one-project-per-space invariant.

### Roadmap Evolution (2026-07-07, Phase 129)

- Phase 129 (v8.2, POLGOV-03/04/05) completed via Beastmode Director/Worker/Validator loop. Worker = MiniMax-M3 BYOK (hermes), Validator = GLM-5.2 BYOK (hermes inline-context). Three capabilities shipped: (1) additive dimension rules (subject/object/action/purpose) that only tighten to deny — a rule like "GTM agents cannot export client/privileged claims" is expressible and enforced; (2) shadow mode (`shadowEvaluate`) that replays a proposed manifest against recent decisions and reports newly-denied/newly-allowed diffs, with operator-gated `activatePolicyVersion`; (3) CI regression corpus (`corpus.json` + `regression.test.ts` + `approved-diffs.json` + `check:policy-regression` npm script + CI workflow job).
- HARD CONSTRAINT preserved: MEMSEC-08 regression corpus passes byte-identical (8 tests). Dimension matching only runs when the request supplies `dimensions`; no dimensions = no dimension rules match = byte-identical. Wrapped files unchanged. Manifest version bumped to 2026.07.129.
- Verification: dimensions 14 + shadow 9 + regression 25 + receipt 3 + engine 7 + MEMSEC-08 8 = 66 tests pass; zero tsc errors; GLM-5.2 validator PASS. Non-blocking finding: empty array in dimension rules is treated as wildcard (foot-gun, no current breakage).

### Roadmap Evolution (2026-07-07, Phase 128)

- Phase 128 (v8.2, POLGOV-01/02) completed via Beastmode Director/Worker/Validator loop. Worker = MiniMax-M3 BYOK (hermes dispatch), Validator = GLM-5.2 BYOK (hermes inline-context). The engine is wrap-not-rewrite: `evaluatePolicy(req)` routes by domain (memory-use | capability | knowledge) to the existing decision functions (`authorizeMemoryUse`, `checkDispatchPolicy`/`checkA2aSendPolicy`/`checkMemoryWritePolicy`, declarative knowledge pass-through) and adds a `POLICY_VERSION` (from `manifest.json`) + `ruleMatched` + `POLICY_DECISION` audit receipt via `emitPolicyReceipt`.
- HARD CONSTRAINT preserved: MEMSEC-08 regression corpus passes byte-identical (8 tests, no outcome change). Wrapped files (`policy-gate.ts`, `security-policy.ts`) verified unchanged via git diff. Receipts are best-effort (try/catch swallow) and carry ids/labels/codes/reasons only — never content.
- Verification: policy engine 7 tests + receipt 3 tests + MEMSEC-08 8 tests = 18 pass; zero tsc errors under `src/lib/policy`; GLM-5.2 validator verdict PASS (one non-blocking note: `evaluateKnowledgePolicy` metadata type is `Record<string, unknown>` — safe today, narrow later).

### Roadmap Evolution (2026-07-07, Phase 125)

- Phase 125 (v8.1, ENTOPS-02/03) completed via Beastmode takeover. The implementation was already present on main but unpromoted; the Director run verified it, ran the Claude Opus watcher (inline-context single-turn to avoid session-quota timeouts), and the watcher returned FAIL on two blocking findings: (C5) the per-tenant hash-chain `build`+`insert` in `POST /api/audit/knowledge` was a TOCTOU race with no enclosing transaction (concurrent same-tenant writes could fork the chain), and (C1) `KnowledgeStore.effective_root()` fell back to the unscoped shared root in operator mode when no tenant was bound (fail-OPEN).
- Fixes: wrapped tenant-insert + `buildKnowledgeAuditEntry` + `writeAuditEntry` in a single `db.transaction(...).immediate()` (acquires the SQLite write lock at BEGIN, serializing read-tip-then-append); added `KnowledgeStore._operator_scope_ok()` fail-closed guard on read/write/delete/search so operator mode with no bound tenant refuses instead of hitting the shared vault. Added `test_operator_mode_no_bound_tenant_fails_closed`. Re-validation watcher verdict: PASS.
- Acknowledged scope limitations (plan's "no IdP" non-goal, not blockers): the central-audit tenant/user identity is carried by the shared `MEMROOS_AGENT_API_KEY` caller (attribution trust = key trust), `_validate_tenant_boundary` remains a documented no-op ACL hook, and search audits the raw query string (tighten to a query hash if queries can carry PII in a later phase).
- Verification: `test_tenant_isolation.py` 13/13, `knowledge-chain.test.ts` + `route.test.ts` 21/21, `check:route-auth-boundary` 49/49; production files typecheck clean (route.test.ts has pre-existing `vi`/`NextRequest` typing quirks tolerated by vitest).

### Roadmap Evolution (2026-07-05)

- Backlog item 19 (`MSIQ-01..06`) was added from the Microsoft IQ feature adoption analysis (`content/research/microsoft-iq-feature-adoption-analysis.md`). The architecture review found MEMSEC-01..08 already deliver labels + retrieval authorization for memory tiers, so MSIQ scopes down to the genuinely new surfaces: extending labels/authorization to the git-backed knowledge repo, a memory adapter for self-hosted Microsoft Agent Framework agents, a capped federated retrieval planner, and a bounded GraphRAG spike feeding the existing Knowledge Graph Intelligence item. Operator gate: zero paid services — MIT/OSS only, no Foundry-hosted paths, local-model-only GraphRAG extraction.
- Backlog hygiene: items 1–4 (Permissioned Memory Foundation, Context Source Reliability, Cloud Offload, NOC Real-Data Wiring) were marked COMPLETED in the backlog — they shipped in Phases 74–80, 108, and 117 but were still listed as un-planned P0/P1 work.

### Roadmap Evolution (2026-07-06)

- v8.3 Agent OS GSD Stack was added from the Mark Kashef full-channel transcript audit and prioritization. The implementation decision is to make MemRoOS the control plane and keep Hermes/Discord/Telegram/Codex/Claude Code as thin adapters. Product substrate belongs in GSD roadmap phases when it needs shared state, schema, policy, audit/proof receipts, eval storage, model-routing telemetry, or adapter state. Portable skills are limited to repeatable cross-runtime procedures and wrappers that teach agents how to consume the substrate.
- Phase 132 is the first executable slice: typed agent context packet plus canonical run ledger/query view, reusing Agent Context Bus, hive/checkpoint/memory-trace/provenance surfaces. Phase 133 adds shipcheck and goal/resume/standup commands. Phase 134 handles skill-boundary manifest and skill audit. Phase 135 adds lane evals and model routing. Phase 136 wires thin adapters and first safety slice.
- Phase 132 is complete as of 2026-07-06T22:53:22Z. `apps/memroos/src/lib/agent-context-packet.ts` builds the redaction-first `AgentContextPacket` and run-ledger read model, `GET /api/agent-context` exposes it through agent API-key auth, and `scripts/show-agent-context-packet.mjs` gives operators a read-only debug wrapper. Verification covered focused packet/proxy/route tests, existing agent-context route tests, typecheck, contract manifest, route-auth boundary, lint, build, GitNexus detect-changes, and Beastmode watcher fallback validation. Claude Opus xhigh was attempted but quota-limited; GLM tier 2 was attempted but the provider token was expired; Codex gpt-5.5/high tier 3 passed after fixes for the proxy bypass, tenant scope, and denied metadata redaction.
- Phase 133 is complete as of 2026-07-06T23:02:35Z. `apps/memroos/src/lib/agent-gsd-control.ts` implements the command substrate for `/goal`, `/shipcheck`, `/resume`, and `/standup`; `apps/memroos/src/app/api/gsd/*` exposes it through agent API-key auth. The implementation reuses hive delegations/actions, checkpoints, the Phase 132 context packet, and the run-ledger read model. Verification so far covered focused GSD route/library/proxy tests, route-auth boundary, typecheck, and contract manifest.

### Roadmap Evolution (2026-06-19)

- Phase 115 trust-boundary hardening advanced: handler-local operator guards and direct non-local regression tests now cover agent checkpoints, checkpoint metrics, agent version create/list/promote/rollback, memory trace POST/GET, runtime observability dashboard reads, hive POST writes, and model-routing telemetry POST writes. At the time, `ARCHREV-01` and `ARCHREV-09` remained open for the broader privileged route inventory and future proxy/Next.js migration checklist; later 2026-06-27 entries supersede the `ARCHREV-09` status.
- Phase 115 runtime topology hardening advanced: `apps/memroos/src/lib/runtime-topology.json` now serves shared manifest source service ports, health checks, supervision modes app, mem0, orchestration, voice, agentmemory. `npm run check:runtime-topology` runs standalone Node checker against current Docker/startup text; `start.sh` derives manual-script port defaults checker and `scripts/launchd-start.sh` derives launchd app port defaults after runtime env and Node path resolution. `ARCHREV-04` remains open until Docker compose generated from or otherwise directly derived from manifest.

### Roadmap Evolution (2026-06-23)

- Phase 118 was added after the proactive recollection research pass. The product answer is a deterministic recollection decision layer: detect task/project/recency/handoff/source/rediscovery triggers before plan/tool/final gates, generate bounded tier-aware memory queries, rank candidates by relevance plus recency plus salience/importance plus source freshness plus prior usefulness plus policy risk, inject only threshold-cleared context, and emit receipts for both search and skipped-search decisions.
- The requirement deliberately builds on existing MemRoOS pieces: `/api/recall`, `/api/memory/search`, `memory_salience`, Phase 96 handoff packs, Phase 104 memory traces, Phase 114 retrieval receipts, and Phase 117 efficiency telemetry. It does not approve a new memory backend or cross-project recall without explicit scope and policy proof.

### Roadmap Evolution (2026-06-27)

- Phase 115 `ARCHREV-04` was completed as a runtime-topology enforcement slice. `apps/memroos/src/lib/runtime-topology.json` now names Docker compose service mappings, dependencies, env-backed ports, and health paths; Docker compose probes `/api/health`; and `scripts/check-runtime-topology.mjs` validates Docker compose, `start.sh`, and launchd artifacts against the shared manifest.
- Phase 115 `ARCHREV-08` was completed as a planning-retention policy slice. `.planning/planning-history-retention.md` keeps current docs in place, uses tracked archives for old phase internals, treats screenshots and operational evidence as private-release material, and defines the pre-public-release review gate without deleting history or moving private artifacts from this run.
- Phase 115 `ARCHREV-05` was completed as a typed env startup-validation slice. `apps/memroos/src/lib/env.ts` now validates core app URLs, ports, root config paths, A2A settings, embedding settings, and datastore credential shapes; `apps/memroos/src/instrumentation.ts` calls startup validation before schedulers start; server constants/A2A/root-config/embedding readers consume the typed module; and root config status marks `agents.config.json` legacy while keeping collections/context-sources active. Broad route-specific env reads remain visible follow-up surface, not a hidden claim of complete env elimination.
- Phase 115 `ARCHREV-06` is complete. The verified public eval slices now cover the route, TypeScript SDK, Python SDK, REST/OpenAPI discovery, MCP tool-schema export, A2A discovery, and shared contract-manifest consolidation: `apps/memroos/src/lib/public-api/eval-contract.ts` validates public trace request/response shape and builds the OpenAPI 3.1 document, `/api/public/v1/traces` emits `X-Memroos-Contract: public-eval-api.v1`, `/api/public/v1/openapi` serves the public eval REST contract, `packages/sdk-ts/src/contract.ts` validates successful SDK responses, `packages/sdk-py/memroos_eval_sdk/contract.py` validates successful Python SDK responses, both SDK live smokes passed against local running apps with temp SQLite DBs, the MCP facade exports `memroos-mcp-tools.v1` through `mcp_tool_contract` / `mcp://tools/contract`, `/api/a2a/openapi` serves `memroos-a2a.v1` for well-known agent cards plus JSON-RPC dispatch, and `contracts/memroos-contracts.json` plus `npm run check:contracts` prevents app/SDK/MCP ID and core schema-field drift.
- Phase 115 `ARCHREV-07` is complete. `.github/workflows/ci.yml` now has `workflow_dispatch`, a daily scheduled run, and a dedicated `recall-canary` job. `npm run check:recall-canary` runs memory recall scorer coverage plus `memory-recall-canary-ci.test.ts`, which executes the committed gold recall cases from `evals/memory-recall/cases.json` through `runMemoryRecallEvalSuite({ mode: "gold" })` against a temp SQLite DB and fails on the existing recall/precision/MRR/latency thresholds.
- Phase 115 `ARCHREV-09` is complete. `docs/next-trust-boundary-upgrade.md` records the reviewed Next dependency and `proxy.ts` hash, `scripts/check-next-trust-boundary.mjs` fails if those markers drift or the proxy/matcher shape regresses, `proxy.test.ts` now covers matcher inclusion/exclusion plus expired/malformed JWTs, reviewer escalation, route-local auth traversal, and Bearer-vs-cookie precedence, and CI runs `npm run check:next-trust-boundary` after lint.
- Phase 115 `ARCHREV-01` is complete. `scripts/check-route-auth-boundary.mjs` validates every `ROUTE_LOCAL_AUTH_API_ROUTES` proxy bypass pattern and proxy operator/admin route against handler-local auth markers, requires the focused non-local denial regression tests, and CI runs `npm run check:route-auth-boundary` after lint. The marketing split remains a future deployment decision, not an open Phase 115 blocker.
- Phase 115 `ARCHREV-02` was completed as a docs-only architecture identity slice. `docs/architecture.md` now frames MemRoOS as an agent operating system with a broker kernel, maps shipped domains to routes/modules, documents Python service and script boundaries, and defines placement rules for Next.js app code, shared libraries, services, scripts, docs, and planning artifacts.
- Phase 114 was reconciled as repo-verified complete after rechecking the Phase 114 verification report, confirming Midbrain still ranks 6 at `65.2115` through `scripts/run-marketplace-memory-evals.mjs`, and closing the remaining comparative retrieval harness answer-support truncation issue with regression coverage. Public deploy approval remains separate per the Phase 114 handoff.
- Phase 117 was completed and reconciled in the planning registry. The NOC efficiency telemetry layer now has the `efficiency_events` store, all five EFFTEL emitters, `/api/operations/noc` aggregation, and Operations UI visibility for retrieval-before-work, same-source re-read, raw-context token share, operator re-ask, and rediscovered-fact metrics.
- Phase 118 was implemented in five slices: pure recollection policy, agent-runtime context injection wiring, memory-trace and efficiency-event recollection receipts, proactive/negative recall eval fixtures, and NOC/operator read-model visibility. Full Vitest, typecheck, lint, and build passed at completion; lint retained the existing 32 warnings.
- Phase 119 completed the bounded future spike queue for Memento, CocoIndex, FastContext, ADK/A2A, Qdrant Cloud 1.18, and Hyper-Extract. The reports live under `.planning/spikes/`, `npm run check:future-spikes` validates the report contract, and CI now runs that gate. All adoption, backend, hosted/private upload, production-path, Qdrant-upgrade, runtime-replacement, and default-extraction decisions remain deferred until explicitly approved.

### Roadmap Evolution (2026-06-24)

- `ADKA2A-FOLLOWUP-01` was added after reviewing Google's cross-language contract-compliance pipeline shared from the Shubham Saboo X post. The useful pattern is Python/ADK orchestration delegating to a Go deterministic validator through A2A/JSON-RPC, with timeout, retry, fail-closed, and audit behavior visible. This belongs as a bounded integration/demo fixture for MemRoOS's A2A registry, dispatch, evidence, and NOC surfaces, not as an ADK/Gemini dependency or a compliance-vertical product claim.
- `QDRANT-FOLLOWUP-01` was added after reviewing Qdrant's 1.18.x release line. The useful MemRoOS path is an operational Qdrant Cloud upgrade-readiness pass: latest 1.18.x patch target, mem0 compatibility, schema inventory, backup/rollback, canary write/search checks, recall/latency non-regression, memory monitoring, audit tracing, per-collection metrics, and strict-mode review. This does not approve local Qdrant, a backend swap, TurboQuant enablement, named-vector migration, or a production cluster upgrade without Luis approval.

### Roadmap Evolution (2026-06-25)

- `HYPEREXTRACT-FOLLOWUP-01` was added after reviewing Hyper-Extract as a possible document-to-structured-memory extraction tool. The useful MemRoOS path is a bounded test on non-sensitive or sanitized documents that compares typed graph/hypergraph/temporal/spatial extraction and source-span-backed candidate memories against the current Markdown/QMD/mem0 ingestion path. This does not approve dependency adoption, private-document upload, production ingestion, storage-layer replacement, or default extraction behavior without Luis approval.

### Roadmap Evolution (2026-06-14)

- Phase 116 is complete v7.3 Agent Context Bus Operational Bootstrap. It operationalizes Phase 107 agent-context bus provisioning/startup expectations, MCP `MEMROOS_AGENT_API_KEY` wiring, agent-side communication skill coverage, unit/integration smoke test proving register → key → send → inbox → ack → reply schema, threading, audit receipts.

### Roadmap Evolution (2026-06-10)

- Phase 115 was added from `.code-review/ARCHITECTURE-REVIEW.md` to convert the nine system-level architecture findings into executable GSD requirements. The first shipped slice is ARCHREV-03: SQLite schema initialization now has an ordered `PRAGMA user_version` migration runner, legacy unstamped DB upgrade coverage, future-version fail-closed behavior, and synchronous default-admin seeding before `getDb()` returns.
- Phase 115 is repo-verified complete as of 2026-06-27. Any marketing/app split work should be planned as a future deployment decision rather than reopened under Phase 115.

### Roadmap Evolution (2026-06-04)

- Phase 114 was added after the Midbrain.ai competitive deep dive. Midbrain is now treated as a direct research-led retrieval and continual-learning competitor, not as a proven governed operations-plane competitor. The durable roadmap response is v7.1 Competitive Retrieval Proof: add Midbrain to public comparison surfaces, keep MemRoOS public-evidence architecture scoring separate from SmartSearch retrieval metrics, and build the next proof lane around external retrieval benchmarks, SmartSearch-inspired retrieval, and retrieval receipts.
- Highest-benefit GSD additions from the Midbrain comparison: (1) a site-facing generated benchmark block with Midbrain `65.21` and caveats; (2) comparative benchmark lanes for public-evidence architecture, external retrieval tasks, and operational workflow continuity; (3) deterministic entity extraction / expansion / reranking / score-adaptive context packing; (4) public-facing retrieval receipts showing retrieved, injected, ignored, score, tier, source, authorization result, and reason; (5) a concrete LoCoMo / LongMemEval / LongMemEval-V2 implementation path.
- Phase 106 added after the SkillForge/SkillOpt architecture review. It hardens the existing SkillForge loop by replacing heuristic/stub eval behavior with real behavioral scoring, converging proposal generation, adding schema-level traceability for split/baseline/edit receipts, introducing typed bounded edit operations, and exposing accepted/rejected proposal evidence in audit/UI surfaces.
- Phase 106 is complete. SkillForge now uses a deterministic no-side-effect sandbox scorer for held-out proposal evaluation, records baseline/treatment W receipts, and no longer relies on randomized Phase 94 behavioral A/B scores.
- Phase 107 completed after the agent-context-sync research pass. It introduces a MemRoOS-native durable agent context bus for synchronous request/reply, inbox polling, explicit acknowledgements, MCP-accessible tools, optional memory-save receipts, scanner/audit guardrails, fail-closed control-layer data-access denial for self-declared claims, and delegated user/OAuth raw-token exclusion so agents can communicate without relying on hidden chat state or self-declared access.
- Phase 108 is complete as an operating-profile implementation. MemRoOS now has a local-footprint inventory library, `npm run check:local-footprint`, NOC API footprint status, cloud target mapping, prune-safety classification, and guardrails for raw vault/secrets/vector backends.
- Turbovec was added to the Phase 108 roadmap only as a future compressed-vector shadow-index limitation/test. It is not approved for implementation; any future test or dependency adoption requires Luis approval first and must prove no recall/precision regression plus meaningful hot-path latency improvement.
- Memento-style memory was added as a future bounded save-quality spike, not an approved implementation. Any future work should compare a local-first typed/audited Memento-compatible contract against MemRoOS `agent_memory_candidates`, capture/handoff packs, and recall evals; no dependency adoption, backend swap, hosted/private trace upload, or replacement of mem0/Qdrant/Neo4j/SQLite starts without Luis approval.
- CocoIndex and FastContext were added as future bounded comparison spikes, not approved implementations. CocoIndex should be tested only as an optional derived-index adapter for one non-sensitive context lane; FastContext should be tested only as a read-only repo-scout baseline against GitNexus and grep. Neither can become a dependency, production path, hosted/private upload, policy bypass, backend replacement, GitNexus replacement, or automatic-edit path without Luis approval.

### Roadmap Evolution (2026-05-27)

- Phase 97 added after the May 27 Cordant/Juan Spark meeting was captured in raw/global knowledge but misfiled under `projects/general`; permanent work tracks source-routing contracts, route confidence/review state, project qmd freshness proof, and operator visibility across raw capture, project promotion, qmd indexing, and app-level memory promotion.
- Phase 97 completed with deterministic Cordant route signals in `scripts/check-knowledge-indexing.mjs`, regression tests, and qmd proof that the May 27 meeting now lives under `projects/cordant` and the `cordant` collection.

### Positioning Guardrails (2026-05-21)

- Lead public positioning with shared organizational memory, governed orchestration, evidence/provenance, and interop across agent frameworks.
- Treat voice as an ingestion surface for memory, not a standalone product pillar.
- Frame `qmd update` UI work as context freshness and source evidence, not as a search-admin feature.
- Phase 72 should make evidence bundles and governed skill contracts explicit in acceptance criteria because they explain what memory was consumed, what tools ran, which checks passed, and what can be replayed or rolled back.

### Decisions (Phase 72 Plan 06)

- **Skill dispatch lookup key is skill_name:** Optional string in dispatch request body — no new mapping table needed; dispatchers pass skill_name when they want governed execution
- **SQL WHERE enforces enabled+complete at DB layer:** fail-closed is not a JS post-filter; `dispatch_status='enabled' AND completeness_pct=100` is in the SQL query so no future code path can bypass it
- **Evidence never includes untrusted body text:** SkillContractSummary exposes only id/name/source_harness/risk_tier/dispatch_status/completeness_pct — raw_body, preconditions, allowed_tools, verification_checks excluded from all evidence paths
- **Fallback path preserved:** no skill_name → null result → existing adapter dispatch proceeds unchanged; no governance overhead on non-governed tasks

### Decisions (Phase 72 Plan 05)

- **Dispatch fail-closed:** completeness < 100% OR missing REQUIRED_CONTRACT_FIELDS → dispatch_status='incomplete'; only fully-complete skill with explicit frontmatter 'enabled' gets dispatch_status='enabled'
- **Prompt injection as data:** parseSkillMd() stores raw_body and all fields verbatim; no eval, no exec; sanitization is caller responsibility; audit trail preserved
- **UNIQUE(name, source_harness) with ON CONFLICT DO UPDATE:** idempotent re-import replaces previous entry
- **Pagination indexes on skill_registry:** (source_harness, dispatch_status) and (dispatch_status, imported_at DESC) per performance note
- **GET /api/skills/import is read-only (no operator auth):** Browser UI needs unauthenticated read access to show registry skills; POST import remains operator-gated

### Decisions (Phase 72 Plan 02)

- **ApplyResult discriminated union:** `kind='sync'` for legacy proposal types; `kind='job'` for behavioral types — callers must switch on `result.kind` before accessing type-specific fields
- **Behavioral proposal predicate:** `agent_instruction_patch` and `skill_addition` are the two types requiring async eval (D-06); all other types keep the synchronous apply path
- **seal_eval_jobs + seal_evidence_bundles:** additive tables with FK to `seal_proposals (ON DELETE CASCADE)`; sandbox profile fails closed — all tool calls denied by default, all calls recorded in evidence bundle

### Decisions (Phase 70 Plan 04)

- **MemoryAdapter interface:** `capabilities` field is required (not optional) — MemoryCapability union = semantic|graphTraversal|reasoningTrace|bufferedWrite|tenantScoped|auditEdges
- **Registry pattern:** `Map<MemoryTier, MemoryAdapter[]>` with registerAdapter/getAdapters/clearRegistry; module-init idempotency via `_registered` guard
- **Shim delegation:** existing exported functions check `getAdapters(tier)[0]` first, fallback to direct impl — exactly one path per tier, no double-writer (T-70-12)
- **EpisodicMemoryAdapter.write() is a no-op stub** — episodic writes must go through the full db-ingest pipeline for FTS5 index integrity

### Decisions (carried into v2.0)

- Production runs on port 3002 via `npm start -- --port 3002`; kill existing: `lsof -ti :3002 | xargs kill -9`
- After any build change: rebuild with `npm run build` then restart
- **Vector store architecture (CRITICAL):** QMD handles BM25/lexical only. ALL vector/semantic search uses Qdrant Cloud. `qmd embed` is FORBIDDEN.
- **Security:** No `execSync`/`exec` — use `execFileSync` or pure `fs/promises` only
- **mem0 writes:** Only via `POST http://localhost:3201/memory/add` — never touch `agent_memory` Qdrant directly
- **Group children:** Use `parentId` + `extent:'parent'` pattern (Phase 17 — already in codebase)
- **Qdrant stays cloud:** Never add local Qdrant to Docker compose — configured via QDRANT_URL + QDRANT_API_KEY env vars
- **Qdrant upgrades are gated:** Version upgrades target Qdrant Cloud only and require mem0 compatibility, snapshot/rollback, canary write/search, and memory recall/latency/audit proof before production promotion.
- **Docker compose is for OSS users only:** Luis keeps native workflow (npm start, LaunchAgent, port 3002)
- **Memory stack is fixed for v2.0:** mem0 + Qdrant Cloud (vector) + Neo4j (graph, new) + SQLite (episodic). No pluggability until v3.0.
- **Future vector experiments require approval:** Turbovec or similar compressed-vector indexes may only be evaluated as optional shadow indexes, and require Luis approval before adding a dependency, implementation path, or backend swap.

### v2.0 architectural constraints

- **LangGraph runs as a Python service** — separate process from Next.js, same pattern as Pipecat voice service
- **LangGraph checkpoint DB is `data/orchestration.db`** — SEPARATE from Memroos's main SQLite DB to avoid cross-process lock contention
- **A2A adapter and LangGraph are separate layers** — A2A owns transport/protocol/task-state mapping; LangGraph owns routing policy, capability selection, retry, HIL. They communicate via internal API (ORCH-07 contract)
- **REG-00 canonical registry is complete** — A2A and REST registration both write through the same model
- **Phase 35 A2A layer is complete** — agent cards, A2A registration, durable task APIs, SSE, outbound delegation, ADK fixture, Registry/Flow surfacing
- **A2A adapter routing is protocol-driven** — `protocol: a2a` selects A2A; platform alone does not reroute legacy Gemini agents
- **Outbound A2A credentials are env-key-only** — metadata may name an env var, but UI must not render bearer/API-key values or raw auth headers
- **ADK proof fixture is optional** — `examples/adk-a2a-agent/` is not imported by Memroos startup

### v2.5 ACTUAL Status (reconciliation audit 2026-05-16)

Prior STATE.md claimed "all 6 phases shipped" — that was FALSE. No SUMMARY.md
exists for any phase; all work is uncommitted; production build is broken.
Verdict: coherent partial work (real logic, not scaffolding), NOT shippable.

| Phase | Name | Actual Status |
|-------|------|---------------|
| 57 | Eval Engine Core | PARTIAL — engine/scorers/judge real; golden set ~3/50 rows |
| 58 | SEAL Self-Improvement | PARTIAL — full loop coded; 4 real test failures (audit FK, eval lookups) |
| 59 | Memory Autogen | UNPLANNED — code exists, NO phase dir/plan/contract |
| 60 | Agent Autogen | PARTIAL/MISSING — golden sets 2/50 each; no dogfood W-lift evidence |
| 61 | Business-Ops L3 | PARTIAL — schema/code column mismatch will break L3 at runtime |
| 62 | Public Eval API + SDK | PARTIAL — SDKs real, route paths diverge from plan |

Scope creep outside v2.5: phases 63 (Rename+Team Auth) & 64 (Immutable Audit+HIL)
have plan dirs + code (lib/auth/, /api/auth/, login/register) — v3 direction.
| Phase 70-foundation-engine-core P05 | 11 minutes | 3 tasks | 6 files |
| Phase 70-foundation-engine-core P03 | 35m | 3 tasks | 4 files |
| Phase 71-recall-hil-sla-voice P03 | 8 | 3 tasks | 7 files |
| Phase 72-cross-project-recall-behavioral-w-lift-ui-skills P01 | 6m | 3 tasks | 4 files |
| Phase 72 P02 | 15m | 3 tasks | 7 files |
| Phase 72 P04 | 40m | 3 tasks | 6 files |
| Phase 72 P05 | 36m | 3 tasks | 7 files |
| Phase 72 P06 | 12m | 3 tasks | 4 files |
| Phase 109-parallel-domain-audit P01 | 6m | - tasks | - files |

### Blockers/Concerns (verified)

- **BUILD BROKEN:** new untracked `apps/memroos/src/middleware.ts` (auth, ph63/64)
  collides with `proxy.ts`. This Next.js replaced middleware→proxy; the two files
  hold *different* logic (RBAC vs host-redirect) and must be merged, not deleted.

- **91/545 tests fail** (25 files): SEAL audit-log FK bug, L3 schema mismatch,
  plus mock-setup failures (hive lineage, memory tier routes).

- Golden sets ~4% populated — drift guard / agreement criteria cannot be validated.
- `bcryptjs` declared in package.json but may need `npm install`.
- `.codex/` & `.agents/` untracked tool state — should be gitignored, NOT committed.
- GitNexus embeddings partial (285/473) — upstream crash bug (abhigyanpatwari/GitNexus#824)

### v2.5 Finishing Pass (2026-05-16) — what closed

- ✅ **Golden sets populated** (minimal viable): 57 business-ops 16 rows, 60
  sales/support/finance/ops 15 each. Verified vs real judge — drift agreement
  ≥0.85 with positive + policy-leak negative classes. Reproducible via
  `golden-sets/.generate.mjs`. Full ~50-row sets still a future nice-to-have.

- ✅ **Path/naming ratified** as-built for 61 (`lib/l3`) and 62
  (`/api/public/v1/*`) via plan amendments — rename deferred to external
  packaging. No longer open.

- ✅ **Phase 59 retro-documented** — PLAN + PARTIAL SUMMARY authored; all 6
  MEMGEN reqs implemented + tested.

### v2.5 Tier 1 closure (2026-05-16)

- ✅ **Dogfood W-lift closed at Tier 1:** `EvalService.rescoreForProposal`
  now uses `lib/seal/rescore.ts` to run deterministic modeled post-apply
  re-scoring through the real eval engine, golden-set loader, layer scorers,
  judge, drift guard, persistence, and SEAL audit metadata. Keep and rollback
  are both reachable without a mocked eval service.

- ✅ **Honesty guardrail preserved:** memory/config proposal classes can move W via the modeled fixed-harness delta. `agent_instruction_patch`, `skill_addition`, and `noop_test` keep W unchanged with `wLiftModeled: false`. True behavioral W-lift from instruction/skill changes remains v3.

## UAT Findings (2026-05-17)

- **Root cause fixed:** `apps/memroos/.env.local` was missing `MEMROOS_JWT_SECRET`, `MEMROOS_ADMIN_EMAIL`, `MEMROOS_ADMIN_PASSWORD`. These live in root `.env` which Next.js doesn't load. Added to `.env.local` (gitignored).
- **Tenant API key mismatch:** `tak-default-internal` hash was stale. Updated to match current `MEMROOS_OPERATOR_API_KEY` in `.env.local`.
- **All 18 pages 200 OK**, 680 tests passing, eval engine E2E verified (W=0.7035), public API functional.

## Deferred Items

Items acknowledged and deferred at milestone close on 2026-05-17:

| Category | Item | Status |
|----------|------|--------|
| context_questions | Phase 60 / 60-CONTEXT.md — trajectory authorship workflow, step count bounds, preset-change audit semantics | Deferred to v3 planning |
| context_questions | Phase 63 / 63-CONTEXT.md — rename/auth decisions recorded as next-milestone context | Deferred to Phase 63 execution |
| future_spike | Memento memory-save quality spike — compare local-first typed/audited Memento-style save behavior against MemRoOS candidates and evals; no dependency, backend, or hosted/private-trace adoption without Luis approval | Completed in Phase 119; adoption deferred |
| future_spike | CocoIndex source-freshness spike — compare optional derived-index behavior for one non-sensitive context lane against qmd/source-health checks; no dependency, production path, policy bypass, sensitive indexing, or backend replacement without Luis approval | Completed in Phase 119; adoption deferred |
| future_spike | FastContext repo-scout spike — compare read-only repo exploration against GitNexus and grep on MemRoOS code-navigation tasks; no runtime dependency, hosted/private upload, GitNexus replacement, or automatic edits without Luis approval | Completed in Phase 119; adoption deferred |
| future_spike | ADK/A2A cross-language contract-compliance demo — compare Google's Python ADK plus Go deterministic-validator A2A fixture against MemRoOS registry/dispatch/evidence/NOC surfaces; no core ADK/Gemini dependency, app copy, runtime replacement, or compliance-vertical claim without Luis approval | Completed in Phase 119; adoption deferred |
| future_spike | Qdrant 1.18.x Cloud upgrade readiness — verify latest patch, mem0 compatibility, collection schemas, snapshot/rollback, canary write/search, recall/latency non-regression, audit tracing, metrics, and strict-mode guardrails; no local Qdrant, backend swap, TurboQuant/named-vector adoption, or production upgrade without Luis approval | Completed in Phase 119; adoption deferred |
| future_spike | Hyper-Extract structured-memory extraction spike — compare typed graph/hypergraph/temporal/spatial extraction on non-sensitive or sanitized documents against Markdown/QMD/mem0 ingestion; no dependency, private-doc upload, production ingestion, default extraction, or storage-layer change without Luis approval | Completed in Phase 119; adoption deferred |

## 2026-07-21 v8.21 Partial Closure — Phase 177 Reproducible Local Install Hardening

- INSTALL-REPRO-01..04 + 06 GREEN (commit inventory at .planning/phases/177-.../closeout-evidence/)
- INSTALL-REPRO-05 PARTIAL — destructive CI run deferred per ticket INSTREP-05-DEFER
- /api/health truthful on cordant-hermes-01 for mem0, Knowledge Index, Graph Memory, Agents, APO (was Agents='down' before dc53a951)
- install-regression.sh --fast: 9/9 structural checks pass
- 17 commits since main origin/main via merge 5d10b959 + closeout evidence + roadmap correction ca10d2eb
- Fable (claude-fable-5) verifier-first rounds 1..6 closed at PASS (close)

## 2026-07-21 v8.21 Deploy — cordant-hermes-01 @ 5f3fe1c2 (post Phase 177 + 176 first session)

- cordant-hermes-01 deploy complete: 5/5 core services up (mem0, Knowledge
  Index, Graph Memory, Agents, APO). /api/health truthful.
- .env credentials rotated per install: JWT 64-char, admin 36-char,
  Neo4j 24-char. MEMROOS_NEO4J_AUTH = neo4j/<24-char>.
- Branches cleaned: install-repro-connmem-bridge + fix/telemetry-route-auth
  deleted; /tmp/memroos-phase175-exec left for inspection.
- /api/health on the 5 core services returns "up"; RTK + QMD "degraded"
  by-design (optional tooling not installed on this host).
- oracle-1 deploy BLOCKED: opc SSH works, no memroos repo, aarch64 host.
  Tracked at .evidence-push/cordant-hermes-01-deploy-2026-07-21/oracle-1-blocker.md
  (Luis pubkey install + multi-arch build needed; tracked under STATE.md's
  prior v8.15 on-host re-smoke item).
- Receipts: .evidence-push/cordant-hermes-01-deploy-2026-07-21/SUMMARY.txt
- Validator (codex gpt-5.6-terra MEDIUM): "cordant_hermes_01: GREEN;
  oracle_1: RED; ready_to_close: false (defer oracle-1)".
