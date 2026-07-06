---
title: Mark Kashef Agent Stack Prioritization Decision Memo
date: 2026-07-06
model: GPT-5 Codex
sources:
  - /Users/lcalderon/github/memroos/content/research/mark-kashef-youtube-transcript-audit-2026-07-06.md
  - https://www.youtube.com/@Mark_Kashef
derived_from:
  - Full transcript audit of 207 of 207 available Mark Kashef YouTube transcripts.
  - Local audit outputs: /tmp/mark_kashef_transcript_audit.json and /tmp/mark_kashef_transcript_index.tsv.
regen_prompt: >
  Extend the Mark Kashef transcript audit into a prioritized implementation decision memo
  for Luis Calderon's agent stack. For each major change, include priority, pros, cons,
  what it would take, expected effort, dependencies, and whether it is worth doing now.
  Be explicit about what is not worth the pain.
---

# Mark Kashef Agent Stack Prioritization Decision Memo

## Executive Take

The highest-leverage stack change is not replacing Hermes. It is making Hermes irrelevant to the core architecture.

Build the owned control plane first:

1. Agent context packet
2. Task/event/proof ledger
3. Verification gates and evals
4. Skill registry and skill audit
5. Thin commands over that substrate
6. Model routing and cost policy
7. Thin mobile/chat adapters
8. Enterprise controls, sliced narrowly

The sharpest product principle: every interface should be replaceable, and every agent action should be resumable, auditable, and provable.

## Priority Stack Rank

| Rank | Change | Decision | Why |
| ---: | --- | --- | --- |
| 1 | Agent context packet | Do now | Makes all agents consume the same truth. Smallest change with widest leverage. |
| 2 | Task/event/proof ledger | Do now | Converts ephemeral agent work into an operating system. |
| 3 | `/shipcheck` and verification gates | Do now | Directly fixes the biggest agent failure mode: saying done without proof. |
| 4 | `/goal`, `/standup`, `/resume` | Do next | Makes the stack usable day-to-day once context and ledger exist. |
| 5 | Skill registry and stale-skill audit | Do next | High Mark-alignment; prevents skill sprawl. |
| 6 | Lane-specific evals | Do next, slice narrowly | Needed, but easy to overbuild. Start with research, code, memory, handoff. |
| 7 | Model routing and cost policy | Do after ledger | Needs logged tasks and outcomes to route intelligently. |
| 8 | Hermes/Discord/Telegram adapters | Keep thin | Useful access layers, not architecture. |
| 9 | Enterprise controls | Slice, do not boil ocean | Start with secrets/PII gates, audit export, approvals, cost caps. |
| 10 | Graph UI / visual OS / full mobile app | Defer | Shiny, expensive, and not core until the substrate is reliable. |
| 11 | Full Bedrock/VPC/customer-owned deployment | Defer | Strategically important later, too heavy before product proof. |
| 12 | Autonomous agent swarm | Avoid for now | Adds theater and risk before there is enough control/proof infrastructure. |

## 1. Agent Context Packet

### Recommendation

Do now. This is the foundation.

### What it is

A canonical, typed payload every agent/interface can request before acting:

- active goal
- current project/repo/client
- user constraints
- relevant durable memories with provenance
- task ledger summary
- current files/artifacts
- recent handoffs
- required verification surface
- approval requirements
- forbidden actions
- source receipts
- resume marker

### Pros

- Makes Codex, Claude, Hermes, Discord, Qwen, and future agents interoperable.
- Reduces repeated context reconstruction.
- Gives MemRoOS a concrete role as the operating substrate.
- Makes handoffs cleaner and more testable.
- Relatively small build with huge leverage.

### Cons

- Easy to over-specify.
- If the packet gets too large, agents will ignore or misread it.
- Requires discipline around source/provenance fields.

### What it would take

- Define a v1 schema.
- Build `GET /agent-context?goal_id=...` or equivalent MCP/tool endpoint.
- Add source adapters: MemRoOS recall, active goal state, current repo metadata, latest handoff, recent proof receipts.
- Add redaction rules for secrets/private content.
- Add a small CLI command to print/debug the packet.
- Add a smoke test: given a known goal, packet must include expected memory, active constraints, and verification requirement.

### Effort

- MVP: 2-4 days.
- Solid v1 across two or three agent surfaces: 1-2 weeks.

### Worth it?

Yes. This is the first move.

## 2. Task/Event/Proof Ledger

### Recommendation

Do now, immediately after or alongside the context packet.

### What it is

A durable event log for agent work:

- `agent_tasks`
- `agent_events`
- `agent_artifacts`
- `agent_approvals`
- `agent_costs`
- `agent_verifications`
- `agent_handoffs`

### Pros

- Turns agent work into a recoverable system instead of chat exhaust.
- Makes `/standup`, `/resume`, dashboards, audits, and cost controls possible.
- Helps debug agent failures.
- Enables later evals and model routing because outcomes are observable.

### Cons

- Adds write-path complexity.
- Can become noisy fast.
- Requires deciding what events are durable versus disposable.
- Requires a cleanup/retention policy.

### What it would take

- Choose initial storage: SQLite for local-first, Postgres for shared/server mode, or an append-only markdown/jsonl bridge if keeping close to MemRoOS.
- Define append-only event schema.
- Wrap agent operations so every meaningful action writes an event.
- Add proof receipts for commands, tests, deploy checks, source reads, sent emails, shared docs, etc.
- Build a query/read API for latest task state.
- Add a compaction/summarization job to avoid infinite noise.

### Effort

- MVP local ledger: 3-5 days.
- Robust shared ledger with UI and retention: 2-4 weeks.

### Worth it?

Yes. This is the second move. Do not build more interfaces before this exists.

## 3. `/shipcheck` and Verification Gates

### Recommendation

Do now.

### What it is

A required final proof gate before an agent claims completion.

Examples:

- code task: tests/lint/build/browser smoke/deploy proof
- research task: source coverage, date freshness, citation/path saved
- email/doc task: sent/shared/readback metadata
- memory task: write/readback/git commit proof
- deployment task: release SHA, live endpoint, user-visible behavior

### Pros

- Directly targets the most expensive failure mode: plausible but unverified completion.
- Fits Luis's operating preference for truth surfaces.
- Makes agent quality legible.
- Can be added without a beautiful UI.

### Cons

- Slows down fast agent loops.
- Requires task-type detection or explicit task categories.
- Some proof surfaces are awkward to automate.

### What it would take

- Define verification checklists by task lane.
- Add a `verification_required` field to the context packet.
- Add a command that refuses "done" until required proof events exist.
- Add a bypass mode that requires explicit reason and logs the bypass.
- Add templates for common proof receipts.

### Effort

- MVP checklists and manual proof receipts: 2-3 days.
- Automated gate integrated with ledger: 1-2 weeks.

### Worth it?

Yes. This is probably the most Luis-specific differentiator.

## 4. `/goal`, `/standup`, and `/resume`

### Recommendation

Do next, after the context packet and ledger can support them.

### What they are

- `/goal`: create or continue an objective with acceptance criteria.
- `/standup`: report active goals, recent work, blockers, proof, and next moves.
- `/resume`: reconstruct working context and handoff state.

### Pros

- Makes the agent OS usable in ordinary work.
- Gives a clean mental model across Codex, Claude, Hermes, and Discord.
- Provides a better replacement for sprawling chat history.
- Small command surface; high daily value.

### Cons

- Weak if ledger/context packet are not real yet.
- Can become another thin wrapper if it does not enforce state.

### What it would take

- Implement commands against the ledger and context packet.
- Create acceptance criteria and status state machine.
- Add output templates.
- Add handoff summarization and resume tests.

### Effort

- MVP: 3-5 days after ledger/context packet.
- Solid daily-use version: 1-2 weeks.

### Worth it?

Yes, but do it after the substrate.

## 5. Skill Registry and Skill Audit

### Recommendation

Do next, but keep it pragmatic.

### What it is

A registry that tracks skills as living operational assets:

- name
- scope: global/project/client
- owner
- dependencies
- last used
- usage count
- smoke test
- examples
- stale/duplicate status
- migration path to code if it becomes critical

### Pros

- Directly aligned with Mark's "dead weight skills" critique.
- Prevents skill sprawl from quietly degrading agent quality.
- Helps agents choose the right skill without scanning everything.
- Turns skills into testable, maintainable primitives.

### Cons

- Maintenance overhead.
- Last-used tracking requires instrumentation.
- Duplicate detection is fuzzy.
- Can become bureaucracy if too heavy.

### What it would take

- Inventory current skills.
- Add metadata schema.
- Add a registry file or database table.
- Add smoke-test hooks.
- Add audit command: stale, duplicate, no examples, missing dependencies, no smoke test.
- Add "candidate for deletion" rather than automatic deletion.

### Effort

- Audit-only MVP: 2-4 days.
- Instrumented registry: 1-2 weeks.

### Worth it?

Yes. Do the audit first. Do not try to perfect all skill metadata in one pass.

## 6. Lane-Specific Evals

### Recommendation

Do next, sliced narrowly.

### What it is

Small repeatable checks for each agent lane:

- research: source coverage, freshness, durable persistence, citation compliance
- code: tests, typecheck, lint, browser smoke, deploy proof
- memory: recall exact prior facts with provenance
- handoff: another agent can resume without asking Luis to restate context
- GTM: claims source-backed, no fabricated company/person data
- safety: PII/secrets/destructive action gates

### Pros

- Gives objective quality pressure.
- Helps compare agents and models.
- Makes self-improvement loops real.
- Supports enterprise credibility later.

### Cons

- Easy to make brittle or performative.
- Requires representative fixtures.
- Requires deciding pass/fail thresholds.
- Not every task has an obvious eval.

### What it would take

- Start with four lanes: research, code, memory, handoff.
- Create 5-10 fixtures per lane.
- Store expected outcomes and scoring rubrics.
- Run evals in CI or scheduled jobs.
- Feed results into the ledger.

### Effort

- Tiny useful eval suite: 3-5 days.
- Credible benchmark suite: 2-4 weeks.

### Worth it?

Yes, but only if attached to real workflows. Avoid generic benchmark theater.

## 7. Model Routing and Cost Policy

### Recommendation

Do after the ledger has enough data.

### What it is

A policy engine that chooses models by task type, sensitivity, cost, latency, and required reasoning depth.

### Pros

- Reduces cost.
- Makes model choice explicit.
- Supports cheap classification/extraction and expensive reasoning only when needed.
- Helps route private/sensitive work to safer lanes.

### Cons

- Premature routing can make quality worse.
- Needs outcome data to tune.
- Adds complexity to debugging.
- Provider churn can make policies stale.

### What it would take

- Define initial route classes.
- Log route decisions and outcomes.
- Add cost estimates and actual usage where available.
- Add manual override.
- Add a review loop: did cheap routes fail more often?

### Effort

- Static policy: 2-4 days.
- Adaptive policy with metrics: 2-3 weeks.

### Worth it?

Yes, but do not make it fancy early. Start with static routing and logging.

## 8. Hermes as Thin Adapter

### Recommendation

Keep Hermes useful, but demote it.

### What it is

Hermes remains an interface that can:

- ask for context
- create tasks
- request approvals
- show proof receipts
- trigger workflows
- receive `/standup`

It should not own memory, source of truth, permissions, or task state.

### Pros

- Preserves whatever is already working.
- Avoids a distracting anti-Hermes rewrite.
- Aligns with Mark's replaceable-interface principle.
- Lets you compare Hermes against Discord/Telegram/Codex without re-architecting.

### Cons

- Requires resisting the temptation to bolt core state into Hermes.
- Adapter boundaries can drift.
- If Hermes already has state, migration may be annoying.

### What it would take

- Write an explicit boundary: Hermes is not source of truth.
- Add integration endpoints to context packet and ledger.
- Add idempotent task creation.
- Add proof/approval messages.
- Add adapter tests.

### Effort

- Boundary and simple adapter: 2-5 days.
- Full polished integration: 1-2 weeks.

### Worth it?

Yes, as a demotion. Not worth replacing Hermes just to replace it.

## 9. Enterprise Controls

### Recommendation

Slice this. Do not attempt the full enterprise platform now.

### What to build first

- secrets redaction
- PII/private-content scanner
- destructive-action approvals
- audit log export
- cost caps
- per-agent tool allowlists
- retention policy

### Pros

- Makes the system safer immediately.
- Supports client trust.
- Matches Mark's enterprise critique of Hermes/OpenClaw.
- Can be sold as "governed agent ops" later.

### Cons

- Deep enterprise controls are expensive.
- False positives can slow work.
- Compliance claims create liability if overpromised.
- Infrastructure choices can trap the product too early.

### What it would take

- Add policy checks before writes, sends, destructive commands, and memory persistence.
- Add audit export from the ledger.
- Add secrets/PII detection on memory and transcript paths.
- Add per-tool allowlists.
- Add retention/delete path for sensitive artifacts.

### Effort

- Useful safety slice: 1-2 weeks.
- Serious enterprise posture: 2-4 months.

### Worth it?

The safety slice is worth it. Full enterprise posture is not worth it until there is a customer pull.

## 10. Mobile Command Center

### Recommendation

Defer a polished app. Build a thin chat/mobile adapter only after ledger and commands exist.

### Pros

- High usability.
- Lets Luis approve, resume, and check status away from the desktop.
- Fits Mark's command-center pattern.

### Cons

- Easy to spend weeks on UI instead of core reliability.
- Mobile auth, notifications, file upload, and privacy get complicated.
- If built before ledger/context packet, it becomes another isolated interface.

### What it would take

- Choose one thin channel: Telegram, Discord, or iMessage/Shortcuts.
- Implement `/standup`, approve/deny, resume, upload screenshot/audio.
- Show proof receipts.
- Enforce auth and rate limits.

### Effort

- Thin adapter: 3-5 days.
- Polished mobile command center: 3-6 weeks.

### Worth it?

Thin adapter later: yes. Full app now: no.

## 11. Graph UI / Visual Agent OS

### Recommendation

Do not build now.

### Pros

- Useful for demos.
- Can help inspect relationships between agents, tasks, memories, and artifacts.
- Feels like an "OS."

### Cons

- Expensive relative to actual reliability.
- Easily becomes a pretty map of bad data.
- Needs a mature ledger and schema first.
- Mark's transcript pattern favors list/command utility before visual polish.

### What it would take

- Mature event schema.
- Memory/task/artifact graph model.
- Layout and filtering.
- Drilldowns into proof receipts.

### Effort

- Demo graph: 1 week.
- Actually useful graph: 4-8 weeks.

### Worth it?

Not now. Build list views and command outputs first.

## 12. Full Bedrock/VPC/Customer-Owned Deployment

### Recommendation

Do not build now unless a specific customer demands it.

### Pros

- Strong enterprise credibility.
- Addresses Mark's clearest enterprise/security critique.
- Useful for regulated customers.

### Cons

- Heavy infra burden.
- Requires security, deployment, observability, support, and documentation maturity.
- Can distract from proving the core operating model.
- Easy to overbuild before knowing buyer requirements.

### What it would take

- Tenant isolation model.
- Customer-owned keys/secrets.
- VPC or private deployment option.
- Bedrock/provider abstraction.
- Audit export and retention controls.
- SSO/SCIM eventually.
- Security review and threat model.

### Effort

- Prototype: 3-6 weeks.
- Sellable enterprise deployment: 3-6 months.

### Worth it?

Not yet. Design schemas so it is possible later, but do not implement now.

## 13. Autonomous Agent Swarm / Hive Mind

### Recommendation

Avoid for now except as a bounded `/discuss` workflow.

### Pros

- Useful for debate, review, red-team, and planning.
- Can improve final decisions when roles are clear.
- Very demo-friendly.

### Cons

- Creates lots of output and false confidence.
- Expensive.
- Hard to evaluate.
- Dangerous without approvals, ledger, and verification.
- Can become "agents talking to agents" rather than doing work.

### What it would take

- Role definitions.
- Task budget.
- Shared context packet.
- Verdict schema.
- Judge/validator pass.
- Ledgered outputs.

### Effort

- Bounded `/discuss`: 2-4 days.
- General autonomous swarm: open-ended and not worth it yet.

### Worth it?

Bounded council: yes. Autonomous swarm: no.

## What Is Not Worth the Pain Right Now

1. Full Hermes replacement.
   The better move is to make Hermes replaceable. Replacing it is less valuable than demoting it.

2. Full mobile app.
   A thin Telegram/Discord adapter is enough until the substrate works.

3. Graph-first OS.
   Lists, ledgers, and proof receipts will create more value sooner.

4. Full Bedrock/VPC enterprise mode.
   Keep it in the architecture, but do not build it before customer pull.

5. Autonomous agent swarm.
   Build `/discuss` as a bounded review primitive instead.

6. Perfect model router.
   Start with a dumb routing policy and log outcomes. Premature optimization will hurt quality.

7. Refactoring every skill at once.
   Audit first, delete/merge obvious junk, then add smoke tests to high-use skills.

8. Universal workflow automation.
   Start with narrow, verifiable workflows: research, code, memory, handoff, meeting prep.

## Recommended 30-Day Sequence

### Week 1

- Define context packet v1.
- Implement packet read/debug command.
- Define ledger schema.
- Add first proof receipt format.
- Write Hermes boundary: adapter, not source of truth.

### Week 2

- Implement local/shared ledger MVP.
- Add `/goal`, `/standup`, `/resume` backed by the ledger.
- Add `/shipcheck` with manual proof receipts.
- Run handoff/resume smoke tests.

### Week 3

- Add skill registry audit.
- Add stale/duplicate/no-smoke-test reporting.
- Add first research/code/memory/handoff eval fixtures.
- Add basic model routing policy and logging.

### Week 4

- Wire one chat/mobile adapter to the commands.
- Add secrets/PII scanner slice.
- Add destructive-action approval events.
- Add audit export.
- Review actual ledger data and prune noisy events.

## Recommended 90-Day Shape

By day 90, the goal is not a flashy agent UI. The goal is a boringly reliable agent ops substrate:

- context packet v1 used by every agent
- task/event/proof ledger with query API
- `/goal`, `/standup`, `/resume`, `/shipcheck`, `/discuss`
- skill registry and audit report
- lane-specific eval suite
- model-routing logs and cost summaries
- Hermes/Discord/Telegram as replaceable adapters
- safety gates and audit export
- 3-5 narrow business workflows with real proof receipts

## Personal Recommendation

Build in this exact order:

1. Context packet
2. Ledger
3. Shipcheck
4. Goal/resume/standup
5. Skill audit
6. Narrow evals
7. Model routing
8. Thin mobile/chat adapter
9. Safety/governance slice

The big temptation to resist is turning this into a UI project or an enterprise infra project too early. Mark's useful critique is not "use Claude Code instead of Hermes." It is "own the control plane." That means the unglamorous substrate comes first.

## Decision Summary

Hermes should stay, but only as a replaceable input/output surface. MemRoOS should become the kernel. The first 30 days should make agent work durable and provable, not prettier.
