# Goal: MemroOS as Agent Memory and Governance Infrastructure

*Created: 2026-05-11*
*Updated: 2026-06-08*

## North Star

Make `memroos.com` the public front door for MemroOS: the control plane where AI-native teams retain what agents learn, retrieve the right context at runtime, dispatch work to the right agent, govern the outcome, and turn repeated work into reusable skills.

MemRoOS should feel like infrastructure for agent continuity. It is not a chatbot wrapper, not a passive knowledge base, and not a metaphor-first product. It is the operating layer that lets teams prove what their agents remembered, received, did, and improved.

## Primary Users

1. Product teams that need discovery, launch, roadmap, and customer-context memory to survive across agents and sessions.
2. Sales teams that need account history, objections, competitive context, and follow-up context available to every agent-assisted workflow.
3. Engineering teams that need architecture decisions, incidents, repo patterns, fixes, tests, and runbooks available to debugging, code review, migration, and onboarding agents.
4. AI operations teams that need security, provenance, memory lineage, local-footprint visibility, and release gates before putting agents in front of clients.

## Core Loop

1. Capture work from conversations, docs, code, tasks, tools, and agent activity.
2. Consolidate it into semantic knowledge, episodic memory, graph facts, and procedural skills.
3. Retrieve permission-aware context packs for the current task.
4. Dispatch work to an agent with the needed memory, tools, and source evidence.
5. Exchange runtime context through the Agent Context Bus when agents need synchronous state, replies, or memory-save receipts.
6. Govern the result with security, lineage, evals, rollback, and operator-visible proof.
7. Improve memory and skills from the outcome so the next run starts smarter.

## Product Promises

- Agents should not start from zero when a team already solved, discussed, debugged, or decided something.
- Memory should be visible as retained context and consumed context, not hidden infrastructure.
- Dispatch should prove whether an agent actually received work, what transport was used, and what the operator must do next.
- Skills should emerge from repeated successful workflows and become reusable procedural memory.
- Governance should show evidence, lineage, security posture, and residual risk in language an operator can act on.
- Local data should be visible by permanence, cloud target, privacy posture, and prune safety.
- Knowledge, memory, agents, dispatch, usage, security, and governance should be understandable as one operating system.

## Showcase Workflows

### Product

- Retains: interview notes, launch learnings, roadmap decisions, beta feedback, usage patterns.
- Consumed by: PRD drafting, prioritization, release notes, discovery synthesis, beta follow-up.
- Proof: evidence survives from discovery to delivery, with source-backed memory and handoff receipts.

### Sales

- Retains: CRM notes, call takeaways, objections, competitor mentions, buyer preferences.
- Consumed by: account briefs, talk tracks, follow-up emails, renewal and expansion strategy.
- Proof: agents reuse the last best answer instead of rediscovering it.

### Engineering

- Retains: architecture decisions, incidents, test history, deploy fixes, repo patterns, runbooks.
- Consumed by: debugging, code review, migrations, onboarding, incident response.
- Proof: an operator can stop work in one coding agent, switch to another, and continue from a MemRoOS handoff pack that preserves task state, decision intent, sources, diffs, errors, and verification history.

### AI Operations

- Retains: agent registry state, capability policy, auth posture, security findings, local footprint, SkillForge proposal evidence, eval history.
- Consumed by: dispatch approvals, security review, client readiness, release gates, rollback decisions, skill promotion.
- Proof: operators can answer what changed, who or what produced it, what evidence backs it, what risk remains, and what can be pruned or moved safely.

## Current Product State

As of June 8, 2026, the major shipped arcs are:

1. **v6.4 SkillForge Production SkillOpt Hardening** — deterministic sandbox-backed scoring, one production proposal path, typed bounded edit operations, and accepted/rejected proposal evidence.
2. **v6.5 Agent Context Bus** — durable MemRoOS-native inbox/reply bus for agents, REST and MCP access, bounded wait-for-reply, memory-save/context-sync receipts, and fail-closed agent auth behavior.
3. **v6.6 Cloud Offload and Local Footprint Reduction** — local store inventory, cloud-target mapping, prune-safety classification, cache/log guardrails, and NOC local-footprint visibility.
4. **v7.0 Client-Ready Security and Architecture Audit** — four-domain security audit, critical/high remediation, dependency sweep, architecture cleanup, full app test validation, production build, typecheck, Python service/SDK tests, and accepted-risk notes.

Detailed milestone history lives in `.planning/MILESTONES.md`; phase-level requirement history lives in `.planning/ROADMAP.md` and `.planning/phases/`.

## Current Roadmap Focus

1. Keep `memroos.com`, README screenshots, public metadata, install output, and LLM-readable docs aligned with the current product state.
2. Promote Agent Context Bus and local-footprint evidence into the public product story without overclaiming managed-cloud readiness.
3. Add richer UI proof for cross-agent inbox state, reply receipts, memory-save receipts, and local-footprint pressure.
4. Close the v7.0 follow-through items: DAST-in-CI, external pen test, SOC 2 mapping, and client-ready residual-risk packet.
5. Run a bounded Memento-style memory-save quality spike only as an evaluation track, without dependency adoption or backend replacement unless explicitly approved.

## Development Process Goal

Every development cycle should make the memory loop more real:

1. Define the workflow being improved and the role it serves.
2. Show what knowledge, memory, or skill is retained.
3. Show how an agent consumes that context during execution.
4. Make dispatch, context exchange, and outcome status observable.
5. Convert repeated patterns into skills when the evidence supports it.
6. Add tests, visual verification, and planning notes that prove the workflow works end to end.

## Phase Done Definition

Every phase is complete only when:

1. The phase goal is restated in product terms.
2. The plan maps requirements to code, UI, tests, docs, and operator-facing proof.
3. Implementation is verified through automated tests.
4. Risky user-facing flows receive browser or visual verification.
5. Security and data-access implications are reviewed.
6. GitNexus detects only the expected affected symbols and flows when code changes are involved.
7. Each completed requirement declares its operator representation: visible UI, visible status/provenance in an existing UI, API/backend-only with an explicit label, or a promoted follow-up UI requirement.
8. A summary, verification note, and any follow-up debt are written back into planning.

## Success Criteria

- A user can open `memroos.com` and immediately understand that MemRoOS is memory-backed agent workflow infrastructure.
- Product, sales, engineering, and AI operations use cases are visible without explanation.
- Memory retention and memory consumption are represented in the UI.
- Agent context exchange shows durable inbox/reply state and receipt proof.
- Dispatch makes transport limitations explicit instead of pretending work was pushed when it was only queued.
- Security, provenance, and residual-risk status are operator-readable.
- Local storage pressure is visible by permanence, cloud target, and prune safety.
- Skills are clearly presented as reusable procedures extracted from repeated agent work.

## Approval-Gated Work

- Memento-style memory-save quality spike: evaluation only; no dependency adoption, hosted/private trace upload, mem0/Qdrant/Neo4j/SQLite replacement, or backend swap without explicit approval.
- Turbovec or similar compressed-vector indexes: future-only shadow-index experiments requiring explicit approval and recall/precision/MRR/false-positive/p95-latency proof before any dependency or backend change.
- External publication, public posts, customer outreach, or hosted trace uploads require explicit operator approval.
