---
name: "cordant-tool-agnostic-agent-implementation-roadmap-2026-08-06"
title: "Cordant Tool-Agnostic Agent Implementation Roadmap"
description: "A phased, governed roadmap for implementing Cordant agents without tying company intelligence to a specific agent framework or runtime."
publishedAt: "2026-08-06"
tags: ["cordant", "agents", "implementation-roadmap", "tool-agnostic", "gtm"]
keywords: ["Cordant", "agent roadmap", "runtime portability", "wholesale ISO research", "governance"]
author: "Codex"
model: "gpt-5"
sources:
  - "https://youtu.be/HQXi4snP36I"
  - "user-provided Cordant implementation requirements"
derived_from:
  - "content/research/cordant-phased-agent-plan-2026-08-06.md"
regen_prompt: "Create a tool-agnostic implementation roadmap for Cordant agents, grounded in the talk's progression and the specified wholesale-ISO GTM v0 requirements."
---

# Cordant Tool-Agnostic Agent Implementation Roadmap

## Design premise

Cordant should own the intelligence contract: its charter, business memory, skills, permissions, audit evidence, evaluation set, and artifacts. The agent runtime is an adapter that can be replaced as needs change.

The user experience should be a **router**, not an omnipotent worker. `cordant-gtm` receives an authenticated request through Slack or web, assembles role-appropriate context, selects a bounded specialist, and returns evidence-backed output with a traceable handoff.

## Tool-agnostic contracts

The implementation must keep these assets portable across runtimes:

1. **Identity and tenancy** — service identity, user roles, permitted actions, ownership.
2. **Context and memory** — source-backed company knowledge with provenance and retention rules.
3. **Tools and policy** — scoped, least-privilege capabilities with confirmation requirements.
4. **Skills and specialists** — versioned playbooks and worker contracts.
5. **Governance and audit** — approvals, redaction, idempotency, receipts, escalation.
6. **Evaluation and artifacts** — regression sets, quality metrics, source-linked outputs.
7. **Runtime adapters** — model routing, durable execution, scheduling, channels, retries, and fallback models.

## Roadmap

| Phase | Cordant implementation | Exit gate |
|---|---|---|
| 0. Agent charter | Define Cordant’s mission, users, values, forbidden actions, data ownership, and success metrics. | Everyone knows what the agent may and may not do. |
| 1. One useful job | Start with wholesale-ISO account research: research 10–20 accounts and produce five source-backed dossiers. No writes or sends. | Eric/GTM owner accepts the output. |
| 2. Scoped tools and context | Add read-only MemroOS context, approved sources, buyer mapping, complexity scoring, and CRM projections. Explicitly deny unrestricted SQL, inbox, CRM, browser, and shell access. | Context is relevant, source-backed, and least privileged. |
| 3. One front door | Create `cordant-gtm` as the user-facing router through Slack or web. | Authenticated users receive role-appropriate context. |
| 4. Skills and specialists | Add market research, relationship mapping, meeting learning, dossier, and meeting-prep skills. | Skills are versioned, evidence-backed, and linked to evaluations. |
| 5. Governance | Add identity, permissions, approvals, redaction, idempotency, and audit receipts. | Zero unauthorized writes; approvals cannot be bypassed. |
| 6. Proactive work | Add events and schedules for meetings, source updates, stale evidence, approvals, and weekly briefs. | Work resumes safely after pauses and retries. |
| 7. Self-improvement | Collect feedback, rejected drafts, corrections, and evaluation failures; propose skill changes for human approval. | No silent self-modification; regression tests pass. |
| 8. Scale and portability | Add fast/slow model policies, fan-out, budgets, fallback models, and runtime adapters. | Cordant can change models or runtimes without losing business memory. |

## First workflow: wholesale-ISO account research

**Inputs:** named candidate accounts, target buyer persona, approved source set, and existing read-only company context.

**Work:** research specialists gather and cite evidence, map the buying committee, score complexity, identify uncertainty, and prepare a dossier.

**Output:** five source-backed dossiers suitable for human GTM review. Each should include company facts, buyer mapping, complexity score, evidence links, confidence/unknowns, and the next best question.

**Non-goals for v0:** CRM writes, email sends, unrestricted browser use, unrestricted SQL, inbox access, shell access, or unreviewed external actions.

## Runtime decision rule

Choose the smallest runtime that can preserve identity, role-based access, approvals, auditability, idempotency, evaluation telemetry, durable artifacts, and portable business memory. A runtime that cannot satisfy those contracts is not a suitable implementation layer, even if its agent experience appears polished.

## 90-day delivery sequence

- **Days 0–30:** phases 0–2; validate the safe wholesale-ISO research win.
- **Days 31–60:** phases 3–5; launch `cordant-gtm`, specialists, and governance gates.
- **Days 61–90:** phases 6–8; add proactive triggers, learning controls, model policies, and a migration test.
