---
title: "Recovered research — context (session 20260507_020530_3e976d)"
description: "Backfill from research-without-persist detector. Original session produced research/analysis content but never called mcp_memroos_knowledge_write. Recovered 2026-07-18 by the daily research-persist audit cron."
publishedAt: "2026-07-18"
tags: [recovery, research-without-persist, backfill]
keywords: [memroos, persist-failure, recovery, context]
author: "Alba [bot]"
source_session: "20260507_020530_3e976d"
model: "minimax-m3"
sources:
  - "label:research-without-persist-detector"
  - "file://~/.hermes/sessions/20260507_020530_3e976d.jsonl"
derived_from:
  - "content/research/memroos-persist-failure-rca-2026-07-05.md"
regen_prompt: "Read session ~/.hermes/sessions/20260507_020530_3e976d.jsonl, extract the largest assistant-side structured content block, and write a recovery markdown describing what the session produced and why it was missed."
---

# Recovered Research — context

**Source session:** `20260507_020530_3e976d`
**Recovered:** 2026-07-18 (daily research-persist audit cron)
**Trigger:** research-without-persist detector flagged this session as having produced research-grade output without calling `mcp_memroos_knowledge_write`.

## Original research content (excerpt)

> First 5000 characters of the largest assistant-side structured block recovered from the session transcript.

```
Use this:

```text
Create a polished client-ready Gamma deck/doc titled:

“Cordant AI Operating System: Phase 1 Engagement Plan”

Source of truth:
Map this deck to “Cordant Agentic Operating System Retainer SOW - v2 2026-04-28,” the v2 less-is-more revision last modified Apr 30, plus the Cordant × Luis internal agentic operating model Q&A.

Audience:
Juan Huezo, Eric, Lior, and Sagi at Cordant.

Tone:
Strategic, practical, sharp, founder/operator-level. Avoid AI hype. Avoid generic “AI transformation” language. Make it feel like a concrete operating plan for a small high-stakes startup selling into regulated financial institutions.

Purpose:
Turn the engagement from a “learning plan” into a full SOW-mapped Phase 1 operating-system plan. The core message is: this is not about deploying a bunch of agents; it is about making key people more effective while building secure, auditable, reusable operating foundations.

Structure:

1. Executive Summary
- Cordant is moving from exploration to implementation.
- Phase 1 should establish a secure AI-first operating pattern.
- Priority order: individual output, team memory, reusable workflows.
- Beachhead: meeting intelligence and shared memory.
- Build an Agent Opportunity Map to sequence Now / Next / Later workflows.

2. Why This Matters Now
- Cordant is under runway and design-partner pressure.
- The team needs practical leverage in the next 6 months while avoiding bad 3-5 year architectural choices.
- The risk is not just moving too slowly; it is creating unmanaged agent sprawl, leaking IP, or building fragile workflows the team will not adopt.

3. What the SOW Covers
Create four lanes:
- Teaching: AI ecosystem, architecture, tradeoffs, model strategy, operating decisions.
- Building: workflows, prototypes, meeting intelligence, knowledge structures, first internal capabilities.
- Auditing / Advising: security, architecture, guardrails, reliability, agent behavior.
- Maintenance: prompts, knowledge assets, workflows, playbooks, skills, operating practices.

4. Phase 1 Operating Principles
- Outcomes over agent count.
- Start with one standard operating pattern; specialize later by role.
- Rent short-term for adoption speed, plan to own memory/skills/metadata over time.
- Human approval remains mandatory for external communications, spend, commercial commitments, code merges, customer-impacting actions, and partner/customer data exposure.
- Every useful output needs source attribution, workflow/skill attribution, and human approver where relevant.

5. Beachhead Workflow: Meeting Intelligence + Shared Memory
Explain why this comes first:
- Cross-functional value.
- Turns meetings into reusable company context.
- Helps humans and agents retrieve decisions, actions, and background.
- Supports investor Q&A, competitive intelligence, onboarding, meeting prep, executive support, and customer/partner follow-up.

Workflow shape:
- Capture meetings.
- Normalize transcripts/notes.
- Extract decisions, action items, owners, risks, and open questions.
- Store in Cordant-owned source-of-truth structure.
- Make retrievable by humans and agents with permissions.
- Use outputs to trigger follow-ups and update the Agent Opportunity Map.

6. Agent Opportunity Map
Create a lightweight Now / Next / Later map.

Each opportunity should include:
- Workflow name
- Owner / user persona
- Business value
- Data sensitivity
- Risk level
- Required access
- First proof point
- Adoption dependency

Example Now workflows:
- Meeting intelligence and action extraction
- Founder / CPO meeting prep and follow-up
- Investor or design-partner Q&A support

Example Next workflows:
- Competitive intelligence monitoring
- Onboarding retrieval
- Product/customer research synthesis
- Engineering knowledge retrieval with strict permissions

Example Later workflows:
- Customer-facing agent workflows
- Code-writing or code-reviewing agents touching production repos
- CRM/email automation beyond drafts
- Regulated partner/customer workflows

7. Secure Foundations
Cover:
- Cordant-owned portable memory, skills, and metadata layer.
- Vendor workspaces only as user-facing surfaces where appropriate.
- Shared substrate scoped by permission.
- Separate human and agent credentials.
- Scoped connector approvals owned by Juan and Lior.
- Long-term technical center of excellence under Lior and Sagi.
- No design-partner confidential data or Cordant core product code in vendor-hosted workspaces without explicit approval and proper controls.

8. First 30 Days
Week 0: Agreement, payment/start, Slack/channel, source material, kickoff.
Week 1: 1:1s with Juan, Eric, Lior, Sagi; workflow discovery; AI maturity assessment; first Agent Opportunity Map draft.
Week 2: Architecture and governance decisions; permission model; source-of-truth conventions; autonomy levels; evaluation criteria.
Week 3: Build/prototype meeting intelligence and shared memory workflow; test on existing meetings/docs; show working demo.
Week 4: Adoption, har
```

## Why this was missed

The detector classifies this session as research-without-persist because:

1. The session produced structured markdown output (research, comparison, analysis, or recommendations)
2. The session cited external sources OR the user message asked to save/document/file
3. The session never called `mcp_memroos_knowledge_write`

This is a pre-ratchet-era finding — the ratchet fix (`--full` flag discipline +
last-run marker for incremental scans) was deployed after this session completed.
The current daily incremental scan is clean; these backlog entries reflect
sessions that completed before the persist gatekeeper was tightened.

## Recovery status

This is a backfill artifact. The original session content was preserved in
the Hermes session log at `~/.hermes/sessions/20260507_020530_3e976d.jsonl`; this file
exists so the durable knowledge base has at least a pointer to what the
session produced. Future readers can consult the source session file for
the full transcript.
