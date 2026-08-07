---
name: "cordant-phased-agent-plan-2026-08-06"
title: "Cordant phased agent plan derived from the Agent Native talk"
description: "A runtime-neutral implementation plan for Cordant agents, synthesized from Guillermo Rauch's discussion of company agents, skills, tools, channels, governance, events, evals, and model-agnostic scaling."
publishedAt: "2026-08-06"
tags: ["cordant", "agent-plan", "agent-native", "phased-rollout", "memroos", "gtm", "governance"]
keywords: ["Cordant agent plan", "company agent", "agent phases", "agent skills", "agent governance", "agent events", "agent evals", "runtime agnostic"]
author: "Codex"
source_session: "codex-2026-08-06"
model: "gpt-5"
sources:
  - "https://youtu.be/HQXi4snP36I"
  - "https://youtu.be/HQXi4snP36I?t=520"
  - "https://youtu.be/HQXi4snP36I?t=1090"
  - "https://youtu.be/HQXi4snP36I?t=1440"
  - "https://youtu.be/HQXi4snP36I?t=1720"
  - "https://youtu.be/HQXi4snP36I?t=1965"
  - "https://youtu.be/HQXi4snP36I?t=2060"
  - "https://youtu.be/HQXi4snP36I?t=2260"
  - "https://youtu.be/HQXi4snP36I?t=2800"
derived_from:
  - "content/research/cordant-eve-agents-proposal-2026-08-06.md"
  - "content/research/cordant-agent-runtime-alternatives-2026-08-06.md"
  - "content/research/cordant-gtm-use-case-requirements-2026-07-06.md"
  - "content/research/cordant-hubspot-reevo-use-case-coverage-2026-07-15.md"
regen_prompt: "Refresh this runtime-neutral phased Cordant agent plan against the linked talk transcript, current Cordant GTM requirements, and current MemroOS architecture. Preserve the distinction between a single agent front door and routed specialist workers, and keep governance, provenance, and business memory outside any replaceable runtime."
---

# Decision

Build Cordant as a company-owned intelligence layer with a single user-facing agent front door, specialist workers behind it, and MemroOS as the canonical context, evidence, policy, approval, memory, and audit plane.

The execution runtime must be replaceable. The same Cordant agent contract should be able to run on LangGraph, Mastra, Inngest, Temporal, Eve, or another orchestrator without changing the business data model or approval rules.

The talk does not state a numbered rollout framework. The phases below are a faithful synthesis of the progression discussed:

1. Define the agent's identity and purpose.
2. Prove one boring, valuable job.
3. Give it scoped tools and company context.
4. Make it accessible through a team channel and route requests.
5. Add skills and specialist workers.
6. Add identity, permissions, approvals, and audit controls.
7. Make it proactive through events and schedules.
8. Improve it through feedback and evals.
9. Scale execution and choose models/runtimes by task.

Governance is not a late phase. It is a gate on every phase after the first useful read-only prototype.

# What to carry over from the talk

## The company agent is an owned capability

The speaker frames the company agent as a company-specific intelligence layer: it carries the company's operating knowledge, skills, data access, and best practices. For Cordant, that means the durable asset is not the model or runtime. It is the reviewed combination of:

- GTM operating procedures.
- Segment and ICP definitions.
- Source maps and evidence contracts.
- Complexity scoring logic.
- Buyer and relationship schemas.
- Approved messaging and dossier templates.
- Meeting-learning taxonomy.
- Approval policy and audit history.
- Evaluation cases and feedback history.

## One front door, many specialists

The talk favors a single agent experience that routes to specialized capabilities. Cordant should therefore expose one root agent, cordant-gtm, while keeping specialist contexts and tools bounded:

- market-researcher
- relationship-mapper
- meeting-learning
- account-dossier
- meeting-prep
- later: content/proposal, competitive intelligence, and merchant-readiness workers

The root agent is a router and coordinator, not an unrestricted superuser.

## Skills are living operating knowledge

A skill is a reviewed procedure that tells an agent how Cordant performs a job. It may invoke tools, but it is not the same thing as a tool.

- Skill: what to do, in what order, using what evidence and standards.
- Tool: a typed capability with inputs, outputs, permissions, and side effects.
- Connector: the bounded interface to a data or execution system.
- Workflow: the durable state machine that pauses, resumes, retries, and emits events.
- Eval: the test that decides whether the skill and tools are producing acceptable outcomes.

Non-engineers should be able to suggest knowledge, examples, critiques, and skill changes. Engineers or designated system owners must control tools, credentials, permissions, production deployment, and policy.

## The agent should feel like a corporate device

The talk compares a company agent to a corporate phone: a shared company capability presented through a user's identity and configured with the applications that person is allowed to use.

For Cordant:

- User identity comes from the authenticated channel or application session.
- Role and tenant scope come from MemroOS policy, not from a prompt or request body.
- The root agent receives a bounded projection of business context.
- Specialist workers receive only the data and tools needed for their task.
- Every proposed side effect carries actor, target, authorization, evidence, approval, and idempotency metadata.

## Everything becomes an event

Slack messages, meeting completion, a new account source, a CRM change, a reply, an approval, and a scheduled report are all events that may start work.

Cordant should use an event and workflow contract that does not depend on one vendor's trigger system:

- event_id
- event_type
- occurred_at
- actor
- tenant
- subject_ref
- source_ref
- payload_ref
- sensitivity
- dedupe_key
- requested_policy
- trace_id

Raw sensitive payloads remain behind MemroOS policy. Events should carry references and bounded projections wherever possible.

## Interactive and asynchronous work need different policies

The talk distinguishes fast interactive work from slower background analysis. Cordant should make that explicit:

- Interactive: answer a seller, explain an account, prepare a draft, or request approval. Optimize for latency and clarity.
- Asynchronous: refresh an account universe, compare sources, analyze meeting learning, or generate a weekly brief. Optimize for accuracy, provenance, cost, and completeness.
- Deep analysis: fan out to multiple models or workers only when the expected decision value justifies the cost.

Model selection is an adapter policy, not part of the Cordant business contract.

# Runtime-neutral architecture

## Durable ownership boundary

MemroOS owns:

- Account, Person, RelationshipEdge, Evidence, Claim, Dossier, MeetingLearning, Approval, and ActionProposal records.
- Source provenance, freshness, confidence, sensitivity, permitted use, and reviewer state.
- Raw/private transcript and document boundaries.
- User, role, tenant, and tool authorization.
- Memory recall and promotion from unreviewed learning to approved organizational knowledge.
- Event references, workflow receipts, audit records, and export.
- The runtime-neutral agent manifest, skill registry, tool contracts, and eval cases.

The replaceable runtime owns:

- Agent loop and model invocation.
- Routing and specialist execution.
- Workflow checkpointing and resume.
- Tool invocation through the Cordant tool gateway.
- Channel delivery and streaming.
- Scheduling and event subscription adapters.
- Sandboxed computation where required.
- Runtime-specific telemetry, translated into Cordant trace and audit records.

CRM and other systems own:

- Reviewed execution records.
- Human-owned activity and stage tracking.
- Approved tasks and external actions.
- Vendor-native workflows that are useful but not unique to Cordant.

## Runtime adapter contract

Expose a small adapter interface:

- start_run(agent_id, actor, input_ref)
- resume_run(run_id, human_input_ref)
- interrupt_run(run_id, reason)
- route_to_specialist(run_id, specialist_id, input_ref)
- emit_event(event)
- schedule_work(schedule)
- cancel_run(run_id)
- get_run_receipt(run_id)
- export_run(run_id)

A candidate runtime is replaceable if Cordant can move between implementations without changing:

- domain object identifiers
- evidence references
- approval states
- event envelopes
- tool schemas
- skill contracts
- evaluation cases
- audit receipt format

## Cordant agent package

The package should be expressed in ordinary version-controlled assets, independent of folder names imposed by a framework:

- agent charter and identity
- root instructions
- skill definitions
- specialist contracts
- tool schemas
- connector scopes
- workflow definitions
- event subscriptions
- approval policies
- redaction rules
- eval fixtures and cases
- deployment adapter
- run and audit receipt schema

# Phased implementation plan

## Phase 0 — Charter and ownership

**Purpose:** define what Cordant's agent is before connecting systems.

**Build:**

- Agent charter: mission, users, values, tone, non-goals, and prohibited actions.
- Cordant context ownership map.
- Domain object and claim contract.
- Runtime adapter interface.
- Initial role matrix: Eric, GTM operator, fractional seller, product/solutions.
- One benchmark: wholesale ISO/card-acquiring production line.
- One success metric set: evidence coverage, review time, dossier acceptance, and zero unauthorized writes.

**Exit gate:**

- A reviewer can state what the agent knows, what it may propose, what it may never do, and which system owns each record.
- The benchmark can be run with fixtures without live credentials.

## Phase 1 — One useful job

**Purpose:** reproduce the talk's “pick one boring toil task with a system to it” advice.

**Cordant job:** source-backed wholesale-ISO account research and five review-ready account dossiers.

**Build:**

- One active segment.
- Approved source map.
- 10–20 candidate accounts.
- Complexity signals with evidence links.
- Buyer/persona hypotheses.
- Warm-path status.
- Five account dossiers.
- Draft-only outreach and meeting preparation.

**Exit gate:**

- Eric or the designated GTM owner accepts the output as useful.
- Every material claim is observed, inferred, unknown, or proposed.
- No CRM mutation or external send occurs.

Do not add a large agent fleet, autonomous outreach, or browser automation in this phase.

## Phase 2 — Scoped context and tools

**Purpose:** give the agent enough context and capability to do the job reliably.

**Build:**

- Read-only MemroOS context tools.
- Approved public-source search and retrieval.
- Account normalization and deduplication.
- Evidence and claim creation.
- CRM read projection.
- Meeting-source reference lookup.
- Narrow tool schemas with timeouts, error types, provenance, and sensitivity labels.
- Idempotency keys for every future write-capable tool.

**Required tools:**

- recall_context
- search_approved_sources
- build_account_candidates
- score_complexity_signal
- build_account_dossier
- lookup_relationship_paths
- draft_outreach
- prepare_meeting
- propose_crm_writeback
- propose_investor_ask
- create_meeting_learning_proposal

**Exit gate:**

- The agent can complete the benchmark from bounded projections.
- Credentials never enter model-visible context.
- There is no unrestricted SQL, mailbox, CRM, browser, or shell tool.

## Phase 3 — Team channel and routed front door

**Purpose:** make the agent usable by the team while preserving identity and scope.

**Build:**

- One channel first, preferably Slack or a Cordant web surface.
- Authenticated actor and tenant resolution.
- cordant-gtm root router.
- Specialist routing for market research, relationship mapping, and meeting learning.
- Status and approval messages.
- Links to source-backed artifacts and run receipts.
- A consistent response envelope: answer, evidence, uncertainty, proposed next action, approval needed.

**Exit gate:**

- Two roles can use the same front door and receive different bounded context.
- Routing is observable.
- A user cannot gain access by mentioning a different role in a message.
- All specialist outputs return evidence references and provenance.

## Phase 4 — Skills and virtual team

**Purpose:** turn repeated work into reviewed, reusable operating knowledge.

**Initial skills:**

- source-backed-research
- wholesale-iso-account-research
- account-dossier
- buyer-and-relationship-mapping
- meeting-prep
- meeting-learning
- review-and-claim-promotion
- weekly-gtm-brief

**Skill lifecycle:**

1. Observe a repeated task or failure.
2. Capture the desired behavior and examples.
3. Add or revise the skill and, if needed, a narrow tool.
4. Add an eval case.
5. Run the eval suite.
6. Human owner reviews the change.
7. Deploy the versioned skill.
8. Monitor feedback and regressions.

**Exit gate:**

- The root agent can route work to specialists without duplicating business rules.
- Each skill declares inputs, outputs, evidence requirements, permission needs, and side effects.
- Skills are versioned and linked to eval cases.

## Phase 5 — Identity, policy, approvals, and audit

**Purpose:** make the agent safe for real company data and actions.

This phase is a hard gate before write access or broad team rollout.

**Build:**

- Role-based and attribute-based access through MemroOS.
- Separate context buckets for GTM, product, legal, finance, HR, and executive material.
- Tool-level authorization.
- Human approval for external send, investor request, CRM truth write, task creation, and gold-memory promotion.
- Redaction before model context.
- Action proposals with target, rationale, evidence, reviewer, approval state, idempotency key, and receipt.
- Prompt-injection and untrusted-source handling.
- Complete run and approval audit trail.

**Exit gate:**

- Unauthorized-write count is zero.
- An approval cannot be bypassed by changing the prompt or channel.
- Replaying a failed run cannot duplicate side effects.
- Sensitive source access is explainable from actor, role, policy, and tool logs.

## Phase 6 — Proactive events and schedules

**Purpose:** move from “prompt the agent” to “the company agent notices and prepares work.”

**Initial events:**

- segment.approved
- account.refresh_requested
- source.updated
- meeting.completed
- meeting.learning_ready
- approval.requested
- approval.resolved
- feedback.received
- crm.change_detected
- weekly_brief.due

**Initial proactive workflows:**

- Weekly GTM operating brief.
- Stale evidence and account refresh queue.
- Meeting-learning extraction after an approved meeting source is available.
- New source or regulatory-list refresh.
- Approval reminder and escalation.
- Feedback aggregation.

**Rules:**

- Scheduled work may read, analyze, draft, and create proposals.
- Scheduled work may not send outreach, activate an investor, write CRM truth, or promote gold memory without policy-approved human action.

**Exit gate:**

- Events are deduplicated and traceable.
- Work can pause for a day and resume with the same evidence.
- Schedule and event failures are visible to an owner.
- Every external write is idempotent.

## Phase 7 — Feedback, evals, and controlled self-improvement

**Purpose:** make improvement a first-class operating loop.

**Feedback sources:**

- User thumbs up/down or structured review.
- Edited drafts.
- Rejected dossiers.
- Missing or incorrect evidence reports.
- Approval rejection reasons.
- Duplicate/conflict flags.
- CRM correction events.
- Meeting-learning promotion decisions.

**Eval suites:**

- Functional: target-account universe, complexity score, buyer map, dossier, meeting prep, weekly brief.
- Provenance: source references, freshness, evidence/inference distinction.
- Governance: permission boundary, approval, redaction, injection resistance, idempotency.
- Style: concise seller-facing response, approved tone, no unsupported claims.
- Regression: prior accepted cases remain accepted after skill/model/runtime changes.

**Self-improvement rule:**

The agent may propose skill or policy changes from feedback. A human owner must approve production changes. The agent may not silently rewrite its own instructions, permissions, tools, or model-routing policy.

**Exit gate:**

- Every production skill has at least one functional and one governance eval.
- Negative feedback produces an actionable improvement queue.
- A change cannot ship without passing the regression suite and receiving the required review.

## Phase 8 — Scale, model routing, and runtime portability

**Purpose:** optimize cost, latency, quality, and throughput after the workflow is proven.

**Build:**

- Fast model policy for interactive work.
- Higher-reasoning or multi-model policy for asynchronous analysis.
- Fan-out across accounts with rate limits and budget controls.
- Fallback models and connector retries.
- Runtime adapter implementations for at least two orchestration engines.
- Export/import of agent contracts, evidence references, run receipts, and eval cases.
- Cost and latency dashboards.
- Optional model consortium for high-value research, with explicit budget and synthesis rules.

**Exit gate:**

- Cordant can change model provider without losing business memory or skill history.
- Cordant can change runtime without changing approvals or domain records.
- Cost, latency, accuracy, and evidence coverage are measured by workflow type.
- Async work is not held to interactive latency, and interactive work does not invoke expensive deep-analysis policies unnecessarily.

## Phase 9 — Company intelligence layer

**Purpose:** realize the longer-term “trusted partner and advisor” vision.

**Possible capabilities:**

- Continuous company trajectory summary.
- Cross-functional operating brief.
- Opportunity and risk detection.
- Product, GTM, and customer-learning synthesis.
- Proactive recommendations with evidence and confidence.
- Delegation to specialized agents across approved domains.

**Prerequisite:** the previous phases must have produced clean context, permissions, event history, feedback, and eval coverage. This is not the MVP.

# Cordant v0 build plan

## First release

Implement:

- One root agent: cordant-gtm.
- Three specialists: market-researcher, relationship-mapper, meeting-learning.
- One channel: Slack or web.
- One segment: wholesale ISO/card acquiring.
- Read-only MemroOS context.
- Approved public-source retrieval.
- Five dossiers.
- Draft-only outreach and meeting prep.
- Weekly GTM brief.
- Human-reviewed learning proposals.
- Functional, provenance, and safety evals.
- Runtime adapter boundary from day one.

## Defer

- Autonomous external outreach.
- Broad inbox or calendar write access.
- Investor activation without explicit approval.
- Generic browser agent.
- Payment or wallet actions.
- Unrestricted computer access.
- Self-modifying production instructions.
- Large multi-agent fleet.
- Multi-model consortium.
- Full proposal/RFP production line.
- Cross-functional access to legal, HR, finance, or executive material.

# Operating roles

## Business owner

Eric owns segment priority, investor activation, external messaging, and gold-claim promotion.

## GTM operator

Maintains source maps, account status, reviewer queues, CRM hygiene, and weekly brief operations.

## Agent architect

Owns runtime adapter, tool gateway, policy enforcement, event/workflow reliability, observability, and security controls.

## Skill contributors

Can propose examples, corrections, source patterns, and desired behavior. They cannot directly grant permissions or deploy writes.

## Product/solutions reviewer

Reviews product claims, demo guidance, compliance statements, and design-partner learning before external use.

# Final decision rule

Advance to the next phase only when the current phase's exit gate passes on the wholesale-ISO benchmark.

The architecture should optimize for:

- company-owned intelligence
- narrow and reviewable capabilities
- source-backed claims
- least-privilege access
- durable and idempotent workflows
- human control over consequential actions
- visible improvement through feedback and evals
- interchangeable models and runtimes

The result should feel like one Cordant company agent to the user, while remaining a governed network of specialized workers and durable workflows underneath.
