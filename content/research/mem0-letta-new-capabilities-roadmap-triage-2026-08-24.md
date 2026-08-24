---
name: mem0-letta-new-capabilities-roadmap-triage-2026-08-24
title: "Mem0 and Letta: New Capabilities, and What MemroOS Should Do About Them"
description: "Dated inventory of what Mem0 and Letta shipped through Aug 2026, triaged into adopt / emulate / ignore against the MemroOS roadmap (v8.39 phases 230-237, v8.47-8.50) and the regulated/air-gapped/cross-agent positioning."
publishedAt: "2026-08-24"
tags: [memroos, mem0, letta, competitive-analysis, roadmap, agent-memory, strategy]
keywords: [Mem0 v2, Mem0 OSS graph removal, Letta MemFS, sleep-time compute, Agent File, memory sovereignty, air-gapped agents, roadmap triage]
author: "Claude (Fable 5)"
model: "claude-fable-5"
sources:
  - "https://docs.mem0.ai/migration/oss-v2-to-v3"
  - "https://docs.mem0.ai/migration/breaking-changes"
  - "https://docs.mem0.ai/changelog"
  - "https://docs.mem0.ai/platform/features/graph-memory"
  - "https://mem0.ai/blog/dream-background-memory-consolidation-for-ai-agents"
  - "https://mem0.ai/blog/state-of-ai-agent-memory-2026"
  - "https://mem0.ai/blog/aws-and-mem0-partner-to-bring-persistent-memory-to-next-gen-ai-agents-with-strands"
  - "https://mem0.ai/openmemory"
  - "https://mem0.ai/security"
  - "https://pypi.org/pypi/mem0ai/json"
  - "https://www.letta.com/blog/our-next-phase/"
  - "https://www.letta.com/blog/context-repositories/"
  - "https://docs.letta.com/concepts/memfs"
  - "https://docs.letta.com/concepts/shared-memory"
  - "https://www.letta.com/blog/sleep-time-compute/"
  - "https://www.letta.com/blog/agent-file"
  - "https://github.com/letta-ai/agent-file"
  - "https://www.letta.com/blog/skill-learning/"
  - "https://www.letta.com/blog/benchmarking-ai-agent-memory/"
  - "https://docs.letta.com/letta-agent/permissions/"
derived_from:
  - "content/research/memroos-competitive-landscape-and-swot-2026-08-23.md"
  - "content/research/memroos-vs-hindsight-mem0-cognee-2026-08-04.md"
  - "memroos-product:.planning/ROADMAP.md"
  - "memroos-product:.planning/milestones/v8.39-observability-gated-memory-engine-ROADMAP.md"
  - "memroos-product:.planning/phases/231-memory-substrate-stabilization-hindsight-shadow-lane/231-01-SUMMARY.md"
  - "memroos-product:docs/memory-architecture.md"
  - "memroos-product:docs/marketplace/agentic-memory-benchmark-2026-05-24.md"
regen_prompt: "Re-inventory Mem0 (PyPI releases, docs.mem0.ai changelog/migration guides, mem0.ai blog) and Letta (letta.com blog, docs.letta.com) since the last publishedAt date; re-triage each new capability into adopt-in-OSS / emulate-governed / ignore against the current MemroOS roadmap phases and the regulated/private-network/air-gapped/cross-agent positioning; flag any change to the mem0ai pin risk or the Phase 231 EMULATE decision."
---

# Mem0 and Letta: New Capabilities, and What MemroOS Should Do About Them

Research date: 2026-08-24. Companion to the 2026-08-23 SWOT and the 2026-08-04
Hindsight/Mem0/Cognee comparison. Target position (unchanged): win regulated,
private-network, air-gapped, engineering, incident, and cross-agent workflows —
"your agents can change, your models can change; your memory, permissions,
operating knowledge, and proof remain yours."

## Executive answer

Integrating their *new functionality* wholesale would be a mistake. Integrating
**engine-level OSS improvements behind the adapter contract** and **emulating
their mechanisms inside MemroOS governance** is not — and it is already the
standing playbook (Phase 231's engine-neutral adapter + EMULATE gate). The new
facts change three things:

1. **Mem0 OSS v2 (Apr 2026) removed graph memory from open source entirely.**
   The upgrade path from MemroOS's pinned `mem0ai==0.1.118` crosses two breaking
   majors and deletes the Neo4j graph layer MemroOS's graph tier is built on.
   The pin is now a strategic fork, not a chore.
2. **Letta pivoted to git-backed memory (MemFS) in March 2026**, deprecating its
   server-side memory tools. The market leader in stateful agents converged on
   MemroOS's architecture: git-backed memory, SKILL.md skills, background
   consolidation with review-before-apply. This validates the category and
   raises the urgency of shipping the already-planned pieces first.
3. **Both are hosted-first where it matters.** Mem0's new capabilities (graph,
   Dream consolidation, decay, temporal reasoning, RBAC) are Platform-only;
   Letta's multi-machine sync and shared memory repos are cloud-only. Every one
   of those is a disqualifier in an air-gapped or regulated network — which is
   exactly the gap MemroOS should occupy, not close by depending on their SaaS.

## What Mem0 shipped (dated highlights)

- `mem0ai` 1.0.0 (2025-10-16): output-format consolidation, params removed,
  self-hosted server auth on by default. 2.0.0 (2026-04-16, current 2.0.19):
  ground-up rewrite — single-pass **ADD-only** extraction (no UPDATE/DELETE;
  memories accumulate, temporal scoring surfaces the current one), hybrid
  retrieval (vector + BM25 + entity boost via spaCy entities stored in the
  vector store), rerank off by default, `custom_fact_extraction_prompt` →
  `custom_instructions`. Claimed LoCoMo 71.4→91.6, LongMemEval 67.8→93.4.
- **Graph memory removed from OSS** in 2.0.0 (~4,000 LOC deleted: Neo4j,
  Memgraph, Kuzu, AGE). Graph is now automatic and Platform-only.
- Platform-only 2026 additions: **Memory Decay** (2026-05-08), **Temporal
  Reasoning** (2026-05-13), **Dream** background consolidation with
  Supersede/Merge/Synthesize (2026-08-24, Pro+), plus existing webhooks,
  exports, orgs/projects/RBAC, SOC 2 (Type I; Type II in audit), BYOK.
- Distribution land-grab: first-party memory plugins for Claude Code, Cursor,
  Codex, OpenCode, OpenClaw, Kimi, DeepSeek Cordis; AWS Strands picked Mem0 as
  its native MemoryStore (2026-08-24); OpenMemory repositioned as a local MCP
  memory server for coding agents; `mem0 init --agent` self-signup where an
  agent mints its own key and a human claims it later. $24M Seed+A (Oct 2025);
  stated thesis: portable user context across services.

## What Letta shipped (dated highlights)

- **March 2026 pivot** ("Letta's Next Phase"): Letta Code becomes the flagship;
  server-side memory tools, templates, identities, and tool rules deprecated.
- **MemFS** (Feb-Mar 2026): each agent's long-term memory is a git repository;
  every memory edit is a commit; `system/` dir is always in context; the rest is
  progressive disclosure via folders and SKILL.md-style frontmatter; subagents
  and background consolidation work in git worktrees; cloud syncs the repo,
  local stays local. No built-in vector index — keyword search plus optional
  search mod; their own benchmark showed 74.0% LoCoMo with plain filesystem
  tools, beating Mem0's then-68.5%.
- **Sleep-time compute** (Apr 2025) → "dreaming" (2026): background agent
  consolidates memory during downtime, optionally with a review-before-apply
  verification pass; different (cheaper/stronger) model than the chat agent.
- **Agent File (.af)** (Apr 2025): one portable file carrying complete agent
  state — memory blocks, history, tools, configs. Open format, still current.
- **Skill Learning** (Dec 2025): agents synthesize SKILL.md skills from their
  own trajectories; +21-37% relative on Terminal Bench 2.0 at lower cost.
- Governance stayed thin: four permission modes and pre-call allow/ask/deny
  policies, cross-agent memory-dir isolation — but no dedicated audit log
  beyond git history. Shared memory repos are cloud-only.

## Triage: adopt / emulate / ignore

### Adopt (engine-level, behind the existing adapter, evidence-gated)

- **A1 — Mem0 OSS 2.x as a second engine candidate in the Phase 231 bake-off.**
  The shadow-lane harness, engine-neutral contract, and capability manifest
  built for Hindsight fit a `Mem0V2Adapter` almost unchanged. Run current-pin
  Mem0, Mem0 2.x, Hindsight-emulated Recall v2, and a plain-filesystem baseline
  (Letta's result earns it a lane) under Phase 237's equal-model rules. Upgrade
  the pin only on measured evidence — never as a routine dependency bump,
  because 0.1.118 → 2.x changes the data model (ADD-only) and deletes graph.
- **A2 — Decouple the graph tier from mem0 now.** Phase 234 (semantic entity
  graph: typed edges, canonical entities, provenance, valid time) stops being
  optional polish: upstream abandoned OSS typed graph, so MemroOS's Neo4j graph
  must be written natively by MemroOS or it dies with the pin. This also turns
  a dependency risk into a differentiator no OSS competitor currently ships.
- **A3 — Borrow the hybrid-retrieval mechanics** (BM25 + vector + entity boost,
  fused scoring) into Recall v2 (Phase 232) where they are already specified;
  Mem0 2.x is confirmation the design is right, not new scope.

### Emulate (their mechanism, MemroOS governance, no SaaS dependency)

- **E1 — Dream/Supersede ⇒ Phase 233 + Phase 256, already correctly ordered.**
  Mem0's Supersede-with-history is their ADD-only patch for truth maintenance.
  MemroOS's belief lifecycle (demotion before promotion, contradiction edges,
  reversible curation) is the stronger, auditable version. Ship it as planned;
  do not outsource truth maintenance to an engine that only appends.
- **E2 — Sleep-time consolidation ⇒ Phase 235.** Borrow two mechanics: run
  consolidation in an isolated worktree/staging area, and support an explicit
  review-before-apply verification pass (Letta) — which for MemroOS is just the
  existing human/policy gate applied to consolidation output.
- **E3 — Memory blocks / MemFS `system/` ⇒ Phase 236 living briefs + profiles.**
  Add the one missing mechanic: a small always-in-context block per
  agent/profile with a hard token budget and operator-owned read-only sections.
  Cheap, high-leverage, and both competitors now treat it as table stakes.
- **E4 — Agent File ⇒ a "Memory Sovereignty Bundle" (new roadmap candidate).**
  A signed, tenant/agent-scoped export-import bundle: memories with belief
  stages, provenance, policy labels, skills, and audit chain — restorable into
  a fresh MemroOS on a disconnected network. This is the literal product form
  of the pitch ("your memory... should remain yours") and a demo regulated
  buyers can hold. Letta proved the format has pull; MemroOS's version carries
  governance state theirs does not.
- **E5 — Agent self-signup with claim ⇒ fold into v8.47/v8.48 fleet work.**
  Mem0's `init --agent` (agent mints key, human claims later) is the right
  onboarding friction level, and MemroOS already has the missing halves Mem0
  lacks: hostname identity (AGENTDUP-02), key revocation (AGENTDUP-05), audit.
- **E6 — Skill synthesis from trajectories ⇒ existing skill-promotion plane.**
  Letta's measured gains justify prioritizing the promotion loop; keep the
  human gate — "governed skill learning" is the differentiated claim.

### Ignore (would be a mistake)

- Depending on Mem0 Platform for graph, Dream, decay, temporal reasoning, or
  RBAC: every one is hosted-only and forfeits the air-gapped/regulated wedge.
- Adopting the Letta runtime or its cloud shared-memory repos: MemroOS *is* the
  company-operated shared layer; the fleet is heterogeneous by thesis.
- Chasing Mem0's editor-plugin breadth feature-for-feature: respond with the
  governed self-hosted counterpart story and low-friction onboarding (E5), not
  with a plugin-count race.
- Any capability copy without a Phase 237 evidence gate — the EMULATE decision
  discipline applies to Mem0 and Letta exactly as it did to Hindsight.

## Risks this surfaces

- **Pin decay:** `mem0ai==0.1.118` is the last 0.1.x (2025-09-25). The longer
  the wait, the wider the migration gulf; A1/A2 bound that risk by making the
  engine swappable and the graph native before any upgrade decision.
- **Convergence squeeze:** Letta now overlaps git memory + skills; Mem0 now
  overlaps governance vocabulary (SOC 2, RBAC, audit-ready). MemroOS's
  remaining moat is the combination: self-hosted + policy-gated + evidenced +
  cross-harness. The SWOT's "claims to avoid" list should be refreshed with
  these dates before any public copy ships.
- **AWS Strands default:** Mem0 as the default memory of a major agent SDK
  narrows greenfield deals; the counter is the sovereignty bundle (E4) and the
  regulated verticals where a hosted default is inadmissible.

## Suggested roadmap deltas (concrete)

1. Phase 231 addendum: add `Mem0V2Adapter` + filesystem-baseline arm to the
   bake-off matrix (A1); keep EMULATE as the standing verdict until Phase 237
   evidence exists.
2. Re-rank Phase 234 (native semantic graph) from P1-nice to P0-defensive (A2).
3. Phase 235/236 spec notes: worktree-isolated consolidation with
   review-before-apply (E2); always-in-context budgeted block (E3).
4. New requirement family: SOVEREIGN-EXPORT-01.. — the Memory Sovereignty
   Bundle (E4), demoable on an air-gapped host.
5. v8.47/48 addendum: agent self-signup + operator claim flow (E5).
6. Marketing/SWOT refresh: "Letta pivoted to git-backed memory, 2026-03-16" as
   category validation; date-stamped competitor capability rows.
