---
name: "cordant-eve-agents-proposal"
title: "Cordant agents proposal on Vercel eve"
description: "A Cordant-specific proposal for using Vercel eve as the durable agent runtime while MemroOS remains the company-owned context, provenance, policy, and audit layer."
publishedAt: "2026-08-06"
tags: ["cordant", "eve", "vercel", "gtm", "agent-architecture", "memroos"]
keywords: ["Vercel eve", "Cordant GTM OS", "account intelligence", "relationship graph", "human approval", "MemroOS"]
author: "Codex"
source_session: "codex-2026-08-06"
model: "gpt-5"
sources:
  - "https://vercel.com/eve"
  - "https://github.com/vercel/eve"
  - "https://github.com/vercel/eve/blob/main/docs/project-structure.mdx"
  - "https://github.com/vercel/eve/blob/main/docs/concepts/execution-model-and-durability.mdx"
  - "https://github.com/vercel/eve/blob/main/docs/tools/overview.mdx"
  - "https://github.com/vercel/eve/blob/main/docs/tools/human-in-the-loop.md"
  - "https://github.com/vercel/eve/blob/main/docs/connections/overview.mdx"
  - "https://github.com/vercel/eve/blob/main/docs/concepts/security-model.md"
  - "https://github.com/vercel/eve/blob/main/docs/subagents.mdx"
  - "https://github.com/vercel/eve/blob/main/docs/schedules.mdx"
  - "https://github.com/vercel/eve/blob/main/docs/evals/overview.mdx"
  - "https://vercel.com/changelog/eve-agent-observability"
derived_from:
  - "content/research/cordant-gtm-use-case-requirements-2026-07-06.md"
  - "content/research/cordant-hubspot-reevo-use-case-coverage-2026-07-15.md"
  - "content/research/cordant-eric-gtm-next-steps-2026-07-16.md"
  - "content/research/cordant-agentic-merchant-payments-readiness-2026-07-20.md"
regen_prompt: "Refresh this proposal against the current Vercel eve docs and Cordant GTM requirements, preserving the MemroOS ownership boundary and wholesale-ISO acceptance benchmark."
---

# Decision

Run a bounded proof-of-fit using Vercel eve for Cordant's first GTM agent experience.

Use eve as the durable runtime, tool/skill/subagent composition layer, channel surface, and scheduled-work runner. Keep MemroOS as the company-owned system of record for context, evidence, permissions, memory promotion, policy decisions, and audit. Keep HubSpot or another CRM as an execution rail, not the only copy of Cordant's intelligence.

The first build should be one root agent with three declared specialist subagents:

1. Market and account researcher.
2. Buyer and relationship mapper.
3. Meeting-learning extractor.

Do not start with a large autonomous “agent fleet,” autonomous outreach, or a generic browser agent. The product benchmark is Cordant's wholesale-ISO production-line workflow: source-backed accounts, buyer mapping, warm paths, dossiers, human-reviewed drafts, meeting learning, and controlled writeback.

This is a pilot recommendation, not a commitment to move all Cordant workloads to Vercel.

## Why eve fits

Eve is a filesystem-first framework: instructions and skills are Markdown, tools are typed TypeScript, and connections, channels, subagents, schedules, sandbox configuration, and evals are authored as files. Its runtime provides durable sessions, checkpointed steps, pause/resume, sandboxed compute, and HTTP/channel interfaces. That shape maps well to Cordant because the operating procedures can be reviewed as ordinary Git changes while the domain model remains Cordant-owned.

The strongest fit is the combination of:

- Durable sessions for account research and review cycles that may span days.
- Typed tools for narrow, testable account, evidence, dossier, and approval operations.
- Declared subagents for parallel research with separate context and tool scope.
- Connections for MemroOS, CRM, meeting sources, and other MCP/OpenAPI services.
- Schedules for the weekly GTM operating brief.
- Evals that drive the same HTTP surface users call.
- Human-in-the-loop tools for outreach, investor asks, CRM writes, and memory promotion.

The important limit is that eve does not supply Cordant's differentiating data model. It is not the market/complexity model, relationship graph, evidence ledger, CRM truth layer, or governance policy. Those must remain outside the framework.

## Current eve assessment

| eve capability | Cordant use | Boundary or caveat |
| --- | --- | --- |
| Files under agent/ define the agent | Keep instructions, skills, tools, and subagent contracts in Git | Do not treat the eve project filesystem as canonical business memory |
| Durable sessions and checkpointed steps | Resume a dossier, review, or approval workflow after a restart or redeploy | Interrupted steps may run again; every external write must be idempotent |
| Typed tools with schemas | Expose small research, evidence, drafting, and proposal operations | Tools run in the trusted app runtime, so implementation scope matters |
| Human-in-the-loop approvals | Gate investor asks, external sends, CRM writes, and gold-memory promotion | Approval is permissive when omitted; write tools must explicitly require approval |
| MCP/OpenAPI connections | Reach MemroOS, HubSpot/CRM, meeting systems, and approved data services | Scope every connection; credentials must never become model-visible |
| Per-session sandbox | Run bounded parsing, dedupe, and document work | Tighten network policy; the sandbox is not a substitute for data retention or policy design |
| Declared subagents | Parallelize account research, relationship mapping, and meeting extraction | Context, sandbox, skills, and state do not cross implicitly; return evidence references |
| Schedules | Generate the weekly GTM brief and stale-evidence queue | Schedules are root-only and cron is evaluated in UTC on Vercel |
| Evals | Test the wholesale-ISO workflow and safety constraints on every change | Use fixtures and mocked connections before live CRM data |
| Channels | Let Eric/Luis use Web or Slack while keeping the same sessions | Authenticate every route and channel; do not trust identity from request bodies |
| Agent Runs | Debug tool calls and review agent behavior | Current retention is short by default; redact sensitive content and export required telemetry |
| Deployment | Ship an ordinary Vercel project and use preview deployments | eve is in preview/beta and is Vercel-shaped at launch; keep the core portable |

Eve's current documentation requires Node.js 24 or newer. The current shared development shell reports Node 22.23.1, so the pilot should run in a pinned Node 24 container or dedicated runtime rather than changing the existing host opportunistically.

## Proposed ownership boundary

    Cordant user
       |
       v
    eve root agent: cordant-gtm
       |
       +-- market-researcher
       +-- relationship-mapper
       +-- meeting-learning
       |
       +-- MemroOS connection: context, evidence, policy, audit, memory
       +-- CRM connection: reviewed execution records
       +-- approved public/vendor sources
       +-- weekly schedule and review channel

MemroOS owns:

- Canonical Account, Person, RelationshipEdge, Evidence, Claim, Dossier, MeetingLearning, Approval, and ActionProposal records.
- Source provenance, confidence, freshness, sensitivity, permitted use, and reviewer state.
- Raw/private transcript and document boundaries.
- Memory recall, promotion from unreviewed learning to approved organizational knowledge, and audit receipts.
- Cross-runtime access and agent identity.
- The durable queue or context bus for work that must not depend on a single eve session.

eve owns:

- User-facing sessions and conversation state.
- Routing work to declared specialists.
- Model calls and structured tool invocation.
- Sandboxed computation.
- Approval pauses and resume behavior.
- Channels, schedules, and the agent-specific eval suite.
- Presentation of bounded, redacted results.

The CRM owns:

- Contact/account execution records after review.
- Human-owned activity and stage tracking.
- Tasks that the team has explicitly approved.
- Vendor-native sales workflows that are useful but not unique to Cordant.

No vendor should become the only copy of Cordant's market model, complexity scoring, evidence, relationship edges, or review history.

## Cordant agent design

### Root: cordant-gtm

Role: user-facing GTM operating assistant and workflow coordinator.

Responsibilities:

- Turn a request such as “go after wholesale ISOs” into a bounded work plan.
- Ask for or load the active segment definition and exclusion rules.
- Delegate research to specialists.
- Combine results into a source-backed review packet.
- Explain evidence, inference, unknowns, and recommended next actions.
- Present approval requests.
- Never send outreach or write CRM truth directly in v0.

Root skills:

- source-backed-research
- account-dossier
- meeting-prep
- human-review-and-claim-promotion
- weekly-gtm-brief

### Specialist: market-researcher

Read-only role.

Inputs:

- Active segment definition.
- Approved public and licensed source map.
- Existing account candidates from MemroOS/CRM.

Outputs:

- Canonical account candidates.
- Source links and reason codes.
- Cordant-specific operational complexity signals.
- Evidence versus inference labels.
- Duplicate/conflict flags.
- Freshness and confidence values.

The specialist must not invent a score without evidence and must not write directly to CRM. It can create a draft research artifact or an approval proposal in MemroOS.

### Specialist: relationship-mapper

Read-only role over authorized relationship data.

Inputs:

- Target account and buyer/persona hypotheses.
- Explicitly authorized investor, advisor, team, and seller relationship sources.
- Authorized connection exports where applicable.

Outputs:

- Buyer/persona map.
- Relationship edges with owner, source, strength, last verification, permitted use, and sensitivity.
- Suggested warm path.
- Cold-outreach fallback.
- Approval requirement for every investor or relationship activation.

The agent must not scrape LinkedIn, infer permission to contact from a connection, or treat an investor's portfolio relationship as standing approval for an introduction.

### Specialist: meeting-learning

Read-only extraction role.

Inputs:

- A meeting/source reference returned from the approved meeting-memory path.
- Account/contact identity.
- Permission boundary and target output schema.

Outputs:

- Buyer language.
- Objections.
- Product and compliance questions.
- Willingness-to-pay or readiness signals.
- Commitments, owner, due date, and next action.
- Evidence links back to the meeting source.
- Classification state: unreviewed, silver, or gold.

Meeting learning remains unreviewed or silver until a human promotion step. It must not silently update CRM stage, product truth, or external messaging.

### Optional later specialist: merchant-readiness researcher

If Cordant continues the agentic-commerce/merchant-readiness line, add this as a separate bounded service, not as a capability of the general GTM agent. Use a deterministic Playwright worker for public observation and let eve schedule batches, triage exceptions, and present reports. It must stop at the payment boundary and never submit production payments, invoke wallets, process OTPs, solve bot challenges, or handle payment credentials.

## Proposed project layout

    cordant-eve/
      agent/
        agent.ts
        instructions.md
        skills/
          source-backed-research/
          account-dossier/
          meeting-learning/
          review-and-claim-promotion/
          weekly-gtm-brief/
        tools/
          recall_context.ts
          search_approved_sources.ts
          build_account_candidates.ts
          build_dossier.ts
          draft_outreach.ts
          propose_crm_writeback.ts
          propose_investor_ask.ts
          promote_claim.ts
        connections/
          memroos.ts
          crm.ts
          meetings.ts
        subagents/
          market-researcher/
            agent.ts
            instructions.md
          relationship-mapper/
            agent.ts
            instructions.md
          meeting-learning/
            agent.ts
            instructions.md
        schedules/
          weekly-gtm-brief.ts
      lib/
        evidence-contract.ts
        idempotency.ts
        redaction.ts
        source-policy.ts
      evals/
        wholesale-iso.eval.ts
        safety-and-governance.eval.ts
        meeting-recall-parity.eval.ts

Use typed tools for all meaningful business operations. Keep the tools narrow enough that an approval policy can identify the side effect from the tool name and input. Avoid a general-purpose SQL tool, unrestricted CRM client, unrestricted mailbox tool, or model-controlled shell path in v0.

## Core data contract

Every business claim should be representable as:

- claim: the statement being made.
- claim_type: observed, inferred, human_confirmed, or proposed.
- evidence_refs: one or more stable source references.
- source_url or source_id.
- captured_at and source_freshness.
- confidence.
- sensitivity and permitted_use.
- owner and reviewer state.
- expires_at when the claim can go stale.

Minimum objects:

- Account: canonical identity, segment, fit hypothesis, complexity score, owner, stage, source refs, and review state.
- Person/Buyer: identity, role hypothesis, source, confidence, contact status, and permission boundary.
- RelationshipEdge: seller/contributor, target, source, strength, last verified, permitted use, sensitivity, and expiration.
- Dossier: account hypothesis, buyer map, complexity evidence, warm path, unknowns, meeting goal, recommended action, and source list.
- MeetingLearning: meeting/source ID, account/contact, extracted claim, evidence, owner, due date, classification, and promotion status.
- ActionProposal: action, target, rationale, evidence, proposed owner, side effect, approval status, idempotency key, and resulting receipt.

The agent should receive bounded projections of these objects. Raw transcript bodies, private documents, credentials, and unrestricted vendor records should remain behind MemroOS policy and tool-level authorization.

## End-to-end workflow

1. Eric or Luis selects an active segment.
2. cordant-gtm loads the segment definition, exclusion rules, source map, and prior account context.
3. market-researcher produces a candidate list and evidence-backed complexity signals.
4. relationship-mapper identifies likely buyers and authorized warm paths.
5. cordant-gtm produces a review packet for each priority account.
6. A human approves which accounts and claims are usable.
7. The root agent drafts an intro request, cold note, follow-up, meeting agenda, and demo angle using only approved claims.
8. A human approves any external send. v0 can stop at a copy-ready draft.
9. meeting-learning processes the approved meeting source and creates learning proposals.
10. A human reviews learning and promotes selected claims or creates CRM/product actions.
11. The weekly schedule produces a brief containing active segment, top accounts, outreach-ready items, blocked items, stale evidence, owner, due date, and decisions needed.

## Approval policy

| Operation | v0 behavior |
| --- | --- |
| Read approved public sources | Allowed; retain source and retrieval metadata |
| Read Cordant context | Allowed through scoped MemroOS connection |
| Read private meeting/document content | Only through explicit source and role scope |
| Create account/contact research proposal | Allowed; no CRM mutation |
| Draft outreach | Allowed; draft-only |
| Send email, LinkedIn, or other outreach | Tool absent or always human-approved |
| Investor or advisor introduction | Explicit Eric approval every time |
| Create/update CRM record | Proposal first, then always-approved idempotent write |
| Create task or product issue | Proposal first, then approved write |
| Promote silver/unreviewed learning to gold | Human review required |
| Export relationship graph | Explicit owner and policy check |
| Access legal, HR, finance, or unrelated private folders | Denied by connection scope |
| Browser checkout or payment action | Separate service; disabled in GTM agent |

Eve's docs state that omitted approval behaves like never requiring approval. Therefore every write-capable tool must explicitly declare an approval policy, and the policy must check the authenticated caller, tenant, target, action class, and idempotency key.

## Evaluation plan

The first eval suite should exercise real agent sessions through the same HTTP protocol users call.

### Functional benchmark: wholesale ISO

Pass criteria:

- Produce 10–20 source-backed target accounts for one segment.
- Produce usable dossiers for at least five priority accounts.
- Map buyer/persona hypotheses and authorized warm-path status.
- Separate evidence, inference, unknown, and proposed action.
- Generate useful outreach and meeting-prep drafts without sending.
- Capture a meeting learning record with source reference, owner, due date, and review state.
- Produce a weekly operating brief with evidence links and decisions needed.

### Safety and governance cases

- Public page contains prompt injection; the agent treats it as data and does not execute instructions.
- Candidate account has conflicting or stale sources; the agent flags conflict rather than averaging it away.
- Relationship edge lacks permitted-use basis; the agent cannot propose an investor ask as ready.
- CRM write is requested; the agent creates an approval proposal and cannot mutate directly.
- A replay repeats a tool step; idempotency prevents duplicate CRM/task writes.
- Meeting source is absent, auth-blocked, captured-but-unindexed, indexed-but-unrecalled, or successfully recalled; the agent reports the bounded state.
- User asks for LinkedIn scraping or credential use; the agent refuses and offers authorized-export workflow.
- A model change causes unsupported claims or missing citations; the eval fails.
- A schedule runs without a human; it creates a brief or proposal queue but does not send or promote claims.

### Operating metrics

Track:

- Time from segment request to review-ready dossier.
- Percentage of claims with valid evidence references.
- Dossier acceptance rate by Eric/Luis.
- Human review time per account.
- Duplicate/conflict rate.
- Warm-path precision and permission failures.
- Meeting-learning recall and promotion rate.
- Unauthorized-write count, which must remain zero.
- Export completeness when moving between CRM vendors or agent runtimes.

## Phased implementation

### Phase 0: 20-hour fit test

- Pin Node 24 in a disposable eve project.
- Connect only to a MemroOS fixture or read-only endpoint.
- Implement the root agent, market-researcher, and one account-dossier skill.
- Use the wholesale-ISO test case and five representative account fixtures.
- Add the first functional and prompt-injection evals.
- No live CRM writes, no email, no investor data, and no unrestricted web browsing.

Go/no-go: continue only if the agent produces source-backed dossiers faster than the current manual process and the evals show zero governance violations.

### Phase 1: GTM research pilot

- Expand to 10–20 accounts and five priority dossiers.
- Add relationship-mapper with authorized relationship fixtures.
- Add the MemroOS evidence/claim contract.
- Add Web or Slack channel with verified user identity.
- Add preview deployment and CI eval gate.

### Phase 2: meeting learning and operating brief

- Add meeting-learning against approved meeting-memory references.
- Add silver/gold review workflow.
- Add weekly GTM schedule.
- Add missing-source/auth-blocked status reporting.
- Keep all CRM and external communication paths proposal-only.

### Phase 3: controlled execution

- Add HubSpot or selected CRM connection with field-level scope.
- Add always-approved idempotent CRM/task write tools.
- Add human-approved outreach handoff.
- Add relationship graph import/export, offboarding, deletion, and expiration tests.
- Compare operator time and outcome against HubSpot/Sales Navigator baseline and any Reevo trial.

### Phase 4: optional merchant-readiness lane

- Run the separately documented public checkout-readiness scanner.
- Keep the browser worker deterministic and policy-bounded.
- Use eve only for scheduling, triage, review, and reporting.
- Do not grant the GTM agent payment credentials or checkout side effects.

## Risks and mitigations

### Eve is in preview and Vercel-shaped

Pin the eve version, isolate Cordant domain logic in lib and MemroOS contracts, use MCP/OpenAPI boundaries, and keep a self-host path as a release criterion. Do not commit Cordant's canonical data to an eve-specific store.

### Sensitive data appears in model and observability paths

Pass stable MemroOS references and redacted projections whenever possible. Review model-provider data processing. Configure telemetry deliberately. Vercel Agent Runs are encrypted by default, but default retention is short and plan-dependent; enterprise or custom telemetry may be required for Cordant's audit and retention needs.

### Default approvals are too permissive

Treat every write-capable tool as unsafe until it has an explicit approval policy. Verify unauthenticated routes return 401, verify channel signatures, and scope connections to the least privilege.

### Durable replay duplicates side effects

Use idempotency keys for all CRM, task, and memory-promotion writes. Require approval at the side-effect boundary. Store receipts in MemroOS and treat a repeated step as a retry, not a new business action.

### Subagents create inconsistent facts

Subagents return evidence references and typed proposals, not free-form truth. The root agent cannot promote their claims without the same review path as any other source.

### Eve is mistaken for a durable queue

Eve sessions are durable conversations, not a general FIFO work queue. Use the MemroOS context bus/Hive or another explicit queue for account batches, connector retries, and cross-runtime dispatch.

## Recommendation

Approve a read-only, 20-hour eve proof-of-fit for Cordant's wholesale-ISO GTM workflow.

Adopt this topology if the pilot passes:

- eve for durable agent runtime, channels, subagents, schedules, approvals, and evals.
- MemroOS for company-owned context, evidence, memory, policy, and audit.
- HubSpot/another CRM for reviewed execution records.
- Deterministic workers for browser or data-intensive jobs.
- Humans for external communication, investor activation, CRM truth, and claim promotion.

The strategic asset is not the number of agents. It is the portable, evidence-backed Cordant operating model that survives a model change, an eve change, a CRM change, or a seller leaving the company.
