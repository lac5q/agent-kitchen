---
name: "cordant-conversation-export-2026-08-06"
title: "Cordant Agent Research, Roadmap, and Slides Conversation Export"
description: "Consolidated record of the Cordant agent research, alternatives analysis, talk-derived phases, tool-agnostic implementation roadmap, and Google Slides deliverable."
publishedAt: "2026-08-06"
tags: ["cordant", "agents", "eve", "tool-agnostic", "roadmap", "slides", "conversation-export"]
keywords: ["Cordant agents", "Vercel eve", "agent runtime alternatives", "tool-agnostic roadmap", "wholesale ISO", "Google Slides"]
author: "Codex"
source_session: "019fd994-1cbc-73e0-abe1-9ad9a95c96ab"
model: "gpt-5"
sources:
  - "https://youtu.be/HQXi4snP36I"
  - "https://github.com/vercel/eve"
  - "https://vercel.com/eve"
  - "https://docs.langchain.com/oss/javascript/langgraph/overview"
  - "https://openai.github.io/openai-agents-js/"
  - "https://mastra.ai/ai-agents"
  - "https://www.inngest.com/docs/learn/durable-agents"
  - "https://docs.temporal.io/"
derived_from:
  - "content/research/cordant-eve-agents-proposal-2026-08-06.md"
  - "content/research/cordant-agent-runtime-alternatives-2026-08-06.md"
  - "content/research/cordant-phased-agent-plan-2026-08-06.md"
  - "content/research/cordant-tool-agnostic-agent-implementation-roadmap-2026-08-06.md"
regen_prompt: "Create a complete Cordant conversation export covering the Eve research, broad alternatives, talk-derived phases, tool-agnostic agent roadmap, slide deliverables, and all decisions recorded in this session."
---

# Cordant conversation export

Date: 2026-08-06  
Conversation: Research Vercel Eve vs Agents  
Purpose: Preserve the research, decisions, roadmap, and presentation work from this conversation in a portable Markdown record.

## User request sequence

1. Research Vercel Eve versus other agent approaches and propose a Cordant agent architecture.
2. Research broadly what alternatives exist.
3. Review the supplied talk and translate its progression into an agent plan that is agnostic to Eve or Vercel: https://youtu.be/HQXi4snP36I
4. Turn the plan into Google Slides.
5. Improve the slides with a “Terra high” visual direction.
6. Resolve the concern that the detailed phase content was not visible in the slides.
7. Take another pass and produce a roadmap for implementing agents agnostic to the tool/runtime.
8. Save the complete conversation and resulting artifacts to the local Cordant repository.

## Core conclusion

Cordant should own the intelligence contract, while the agent runtime remains an adapter.

Cordant-owned assets:

- Agent charter, identity, tenancy, and role permissions.
- Business memory, evidence, source lineage, claims, and relationship edges.
- Skills, specialist contracts, prompts, policies, and approvals.
- Redaction, idempotency, audit receipts, and escalation.
- Evaluation cases, regression sets, and durable artifacts.

Runtime-adapter assets:

- Model policy and routing.
- Agent-loop execution.
- Durable runner, queue, retries, and pause/resume.
- Channels such as Slack or web.
- Schedules, event triggers, and deployment.
- Sandbox or browser workers where separately approved.

The “god agent” should be the user experience and router—not an omnipotent worker. `cordant-gtm` receives an authenticated request, assembles role-appropriate context, routes to a bounded specialist, and returns evidence-backed output with a traceable handoff.

## Vercel Eve research

Eve was evaluated as a runtime layer with filesystem-authored agents, typed tools, skills, connections, subagents, schedules, channels, sandboxes, human approvals, and evals.

Proposed Cordant split:

- Eve: sessions, routing, model calls, typed tool invocation, subagents, channels, schedules, approvals, sandboxed work, and agent-specific evals.
- MemroOS: canonical context, evidence, provenance, permissions, memory promotion, policy, audit, and business-owned records.
- CRM: reviewed execution records, human-owned activity, and approved tasks—not Cordant’s only intelligence store.
- Deterministic workers: browser or data-intensive tasks with explicit safety boundaries.
- Humans: external communication, investor activation, CRM truth, and promotion of unreviewed learning.

The first proof-of-fit was defined as a read-only, 20-hour pilot for wholesale-ISO GTM:

- Generate 10–20 source-backed accounts.
- Produce five source-backed dossiers.
- Map buyers and authorized warm paths.
- Draft outreach and meeting preparation without sending.
- Prove zero unauthorized CRM or investor actions.
- Use a pinned Node 24 environment if Eve is selected.
- Keep MemroOS as the canonical source of business intelligence.
- Stop at the payment boundary for any later merchant-readiness work.

Important guardrails:

- Every write-capable tool must declare an explicit approval policy.
- Missing approval configuration must not be treated as approval.
- Use evidence/inference/unknown/proposed labels on claims.
- No LinkedIn scraping or credential use.
- Use idempotency keys for CRM, task, and memory-promotion writes.
- Use redacted MemroOS references instead of exposing raw sensitive data.
- Keep authentication, connection scope, sandbox policy, telemetry, and retention under deliberate Cordant control.
- Treat Eve as replaceable and beta-shaped; do not make it the only copy of Cordant’s intelligence.

The full proposal is stored at:
`content/research/cordant-eve-agents-proposal-2026-08-06.md`

## Broad alternatives research

The alternatives review separated products into different layers rather than treating them as interchangeable:

### Full runtimes and orchestration

- LangGraph: strongest long-term orchestration candidate; explicit state, checkpointing, durable execution, interrupts, memory, and TypeScript support.
- Mastra: closest TypeScript-native alternative to Eve; agents, workflows, memory, MCP, multi-agent composition, observability, and eval-oriented tooling.
- Inngest AgentKit: event-driven durability companion; retries, waits, fan-out, schedules, events, and subagent invocation.
- Temporal: highest-assurance durable workflow substrate for business-critical, long-running processes.
- OpenAI Agents SDK: lean model-native agents, tools, handoffs, guardrails, MCP, sessions, and tracing; pair with MemroOS and a durable workflow layer for long-lived work.
- Anthropic Claude Agent SDK / Managed Agents: strong Claude-first agent loop, tools, skills, MCP, managed sessions, sandboxes, and reusable agents; stronger model coupling.
- CrewAI: fast Python multi-agent proof; less aligned with Cordant’s TypeScript-first shape.
- PydanticAI: typed Python workers with durable-execution integrations.
- Google ADK / Agent Engine: strong Google Cloud option.
- Microsoft Agent Framework: strong Azure/Microsoft enterprise option.
- LlamaIndex Workflows: particularly useful for retrieval, source ingestion, structured extraction, and evidence workflows.

### Managed platforms

- Amazon Bedrock AgentCore: broad AWS-managed runtime, memory, gateway, identity, code interpreter, browser, observability, evals, and registry; attractive only if AWS is strategic.
- Vercel Eve: fastest Eve-shaped TypeScript/Vercel pilot; retain as an adapter behind Cordant contracts.

### Configurable and GTM-native tools

- HubSpot Breeze: CRM-native prospecting and execution rail.
- Reevo: prospecting, enrichment, and call-intelligence coverage.
- Salesforce Agentforce: Salesforce-native actions and governed CRM workflows.
- n8n: integration glue, triggers, deterministic steps, and human-approved automation.
- Dify: visual workflow, RAG, tools, human review, and self-hosted prototyping.
- Retool Agents/Workflows: internal operations UI and governed review surfaces.

Strategic shortlist:

1. LangGraph for the long-term default.
2. Mastra for the fastest TypeScript-native alternative.
3. Inngest as the best durable eventing companion.
4. Temporal when execution guarantees become product-critical.
5. OpenAI Agents SDK or Claude Agent SDK for lean model-native workers.
6. Eve for a bounded pilot.
7. AgentCore only when AWS is the strategic operating environment.

The full alternatives comparison is stored at:
`content/research/cordant-agent-runtime-alternatives-2026-08-06.md`

## Talk-derived progression

The talk did not present numbered phases, so the phases below were synthesized from its progression:

company identity → useful task → tools → channels → specialists → governance → events → evals → scale.

The phase plan is:

| Phase | Cordant implementation | Exit gate |
|---|---|---|
| 0. Agent charter | Define mission, users, values, forbidden actions, data ownership, and success metrics. | Everyone knows what the agent may and may not do. |
| 1. One useful job | Research 10–20 wholesale-ISO accounts and produce five source-backed dossiers. No writes or sends. | Eric/GTM owner accepts the output. |
| 2. Scoped tools and context | Add read-only MemroOS context, approved sources, buyer mapping, complexity scoring, and CRM projections. Deny unrestricted SQL, inbox, CRM, browser, and shell access. | Context is relevant, source-backed, and least privileged. |
| 3. One front door | Create `cordant-gtm` as the Slack/web user-facing router. | Authenticated users receive role-appropriate context. |
| 4. Skills and specialists | Add market research, relationship mapping, meeting learning, dossier, and meeting-prep skills. | Skills are versioned, evidence-backed, and eval-linked. |
| 5. Governance | Add identity, permissions, approvals, redaction, idempotency, and audit receipts. | Zero unauthorized writes; approvals cannot be bypassed. |
| 6. Proactive work | Add events and schedules for meetings, source updates, stale evidence, approvals, and weekly briefs. | Work resumes safely after pauses and retries. |
| 7. Self-improvement | Collect feedback, rejected drafts, corrections, and eval failures; propose skill changes for human approval. | No silent self-modification; regression tests pass. |
| 8. Scale and portability | Add fast/slow models, fan-out, budgets, fallback models, and runtime adapters. | Models/runtimes can change without losing business memory. |

The talk-derived phase plan is stored at:
`content/research/cordant-phased-agent-plan-2026-08-06.md`

## Tool-agnostic Cordant roadmap

### Stable contracts

1. Identity and tenancy.
2. Context and memory with source lineage.
3. Tools and policy with least privilege.
4. Skills and specialist worker contracts.
5. Governance and audit.
6. Evaluations and artifacts.
7. Runtime adapters.

### v0 workflow

Inputs:

- Named candidate accounts.
- Target buyer persona.
- Approved source set.
- Existing read-only company context.

Work:

- Gather and cite evidence.
- Map the buying committee.
- Score complexity.
- Identify uncertainty.
- Prepare a dossier.

Output:

- Five source-backed dossiers for human GTM review.
- Company facts.
- Buyer mapping.
- Complexity evidence.
- Evidence links.
- Confidence and unknowns.
- Next best question.

Non-goals:

- CRM writes.
- Email or outreach sends.
- Unrestricted browser use.
- Unrestricted SQL.
- Inbox access.
- Shell access.
- Unreviewed external actions.

### Runtime decision rule

Choose the smallest runtime that preserves identity, role-based access, approvals, auditability, idempotency, evaluation telemetry, durable artifacts, and portable business memory. A polished agent experience is not sufficient if the runtime cannot preserve these contracts.

### 90-day delivery sequence

- Days 0–30: phases 0–2; validate the safe wholesale-ISO research win.
- Days 31–60: phases 3–5; launch `cordant-gtm`, specialists, and governance gates.
- Days 61–90: phases 6–8; add proactive triggers, learning controls, model policies, and a migration test.

The full roadmap is stored at:
`content/research/cordant-tool-agnostic-agent-implementation-roadmap-2026-08-06.md`

## Google Slides deliverables

Original deck, preserved unchanged:
https://docs.google.com/presentation/d/19HeyzQtcTecEY5D2YFsbnYftw70ZhWYmpCRbNJ9-xfQ/edit?usp=drivesdk

Revised deck:
https://docs.google.com/presentation/d/1qoVzdCoWVeiiWoe5GrPERerNitMB5QTZvQkkIi620EU/edit?usp=drivesdk

Revised deck title:
Cordant Agent Implementation Roadmap — Tool Agnostic

The revised deck contains ten native Google Slides:

1. Cover: Implement agents without coupling Cordant to a tool.
2. Design principle: Cordant owns the intelligence contract; runtime is an adapter.
3. Operating model: `cordant-gtm` routes authenticated requests to bounded specialists.
4. Roadmap: three sequences and nine gated phases.
5. Establish: agent charter, one useful job, scoped context.
6. Operate: front door, skills/specialists, governance.
7. Compound: proactive work, self-improvement, scale/portability.
8. v0 workflow: 10–20 accounts, five dossiers, source-backed and no writes.
9. Portability boundary: stable contracts and swappable adapters.
10. 90-day delivery plan.

Visual direction:

- Editorial, high-end “Terra” palette.
- Warm canvas, espresso text, terracotta, clay, gold, sand, sage, and olive.
- Rounded double-bezel cards.
- Cormorant Garamond titles with Aptos body text.
- Native slide text and shapes so the deck remains editable.

## Conversation status and transfer note

This export was assembled on the remote Linux host `maeve-u1` at `/home/lac5q`. The requested Mac destination is:

`/Users/lcalderon/github/cordant`

The Codex app confirms that `main-mac` is a connected local host, but this active conversation is running on the remote host and the Mac path is not mounted in the current shell. A local-host write is therefore required for the final copy.

Recommended filename:
`CONVERSATION_EXPORT.md`

The source of truth for this export is this file plus the four linked MemroOS artifacts above.
