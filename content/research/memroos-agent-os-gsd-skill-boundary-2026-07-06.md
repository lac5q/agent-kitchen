---
title: MemRoOS Agent OS GSD Skill Boundary
date: 2026-07-06
model: GPT-5 Codex
sources:
  - content/research/mark-kashef-youtube-transcript-audit-2026-07-06.md
  - content/research/mark-kashef-agent-stack-prioritization-2026-07-06.md
  - .planning/ROADMAP.md
  - .planning/REQUIREMENTS.md
  - .planning/phases/132-agent-os-gsd-control-plane/132-01-PLAN.md
derived_from:
  - Luis request to decide what should be bundled as skills versus embedded into the MemRoOS GSD roadmap.
  - Mark Kashef transcript audit and stack prioritization.
regen_prompt: >
  Classify the Mark Kashef-inspired agent stack into portable skills versus MemRoOS product roadmap substrate,
  then encode the product substrate as GSD roadmap phases and requirements.
---

# MemRoOS Agent OS GSD Skill Boundary

## Decision

Use the GSD roadmap to implement the stack as MemRoOS-native substrate. Do not build a Hermes replacement, and do not put core control-plane behavior into skills.

The rule:

- **Bundle as a skill** when the capability is a portable, repeatable agent procedure that should travel across Claude, Codex, Hermes, Qwen, Cursor, and future runtimes.
- **Embed in MemRoOS/GSD** when the capability needs shared state, schema, policy, audit/proof receipts, eval storage, model-routing telemetry, or adapter state.

## Embed In MemRoOS

These are product/platform capabilities:

- Agent context packet schema and endpoint/tool.
- Task/event/proof run ledger.
- `/shipcheck` proof gate.
- `/goal`, `/resume`, `/standup` state machine and persistence.
- Policy decisions and authorization receipts.
- Provenance/audit chain.
- Lane eval store and reporting.
- Model routing telemetry and cost receipts.
- Skill-boundary manifest and skill registry data model.
- Adapter contracts for Hermes/Discord/Telegram/Codex/Claude.
- Secrets/PII/destructive-action/cost safety gates.

## Bundle As Skills

These are portable agent procedures:

- `memroos-gsd-operator`: how agents should edit/extend GSD planning docs safely.
- `memroos-context-consumer`: how an agent should request, read, and obey an Agent Context Packet.
- `memroos-shipcheck-client`: how an agent checks proof requirements before finalizing work.
- `memroos-skill-audit-operator`: how to interpret skill-audit output and draft SkillForge proposals.
- `bounded-discuss-council`: how to run a small review council with roles, budget, verdict, and validator.
- Lane playbooks: research, code, memory, handoff, GTM, and safety.

These skills should be wrappers and procedures over MemRoOS state, not sources of truth.

## Do Not Build As Skills

- Context packet implementation.
- Run ledger implementation.
- Proof gate implementation.
- Policy engine.
- Audit/provenance chain.
- Model router.
- Eval database.
- Adapter-owned state.
- Autonomous swarm.
- Graph UI.
- Full mobile app.

## Roadmap Encoding

Added v8.3 Agent OS GSD Stack:

- Phase 132: Agent Context Packet + Run Ledger — `GSDSTACK-01`, `GSDSTACK-02`
- Phase 133: Shipcheck + Goal/Resume/Standup Commands — `GSDSTACK-03`, `GSDSTACK-04`
- Phase 134: Portable Skill Boundary + Skill Audit — `GSDSTACK-05`, `GSDSTACK-06`, `GSDSTACK-07`
- Phase 135: Lane Evals + Model Routing Policy — `GSDSTACK-08`, `GSDSTACK-09`
- Phase 136: Thin Interface Adapters + Safety Slice — `GSDSTACK-10`, `GSDSTACK-11`

Phase 132 now has an executable plan at `.planning/phases/132-agent-os-gsd-control-plane/132-01-PLAN.md`.

## Bottom Line

Skills teach agents how to operate the system. MemRoOS is the system.
