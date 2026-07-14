---
title: "MemroOS as the Agent Fleet Plane — Architecture Decision"
author: "Alba (Hermes) for Luis Calderon"
date: 2026-07-08
type: architecture-decision
tags: [memroos, paperclip, langgraph, fleet-control, governance, agent-runtime, archestra]
status: reviewed
model: MiniMax-M3 (Alba); GLM-5.2 validation via beastmode-validator (BYOK)
sources:
  - ~/github/memroos/docs/architecture.md
  - ~/github/memroos/docs/agent-onboarding.md
  - ~/github/memroos/docs/governance.md
  - ~/github/paperclip/doc/SPEC-implementation.md
  - ~/github/paperclip/packages/adapters/hermes/README.md
  - ~/github/paperclip/packages/adapters/hermes-gateway/README.md
  - ~/github/paperclip-cloud/oracle/README.md
derived_from: 2026-07-08 Discord thread (#devops, "Agent fleet control tooling research")
regen_prompt: "regenerate this architecture decision given the same repo state and 2026-07-08 research"
---

# MemroOS as the Agent Fleet Plane — Architecture Decision

## Decision

**Adopt MemroOS as the top-layer agent fleet plane across all runtimes (Hermes, Claude Code, Codex, OpenClaw, Cursor, Qwen, Gemini, ZCode, OpenCode). Pair MemroOS with LangGraph as a peer runtime service for stateful multi-step orchestration. Treat Paperclip as a parallel product plane that subscribes as one tenant via its existing built-in adapters (`hermes_local`, `hermes_gateway`, `openclaw-gateway`) plus MCP/A2A.**

Do not adopt any new fleet control plane tool. Do not roll LangGraph itself as the control plane. Do not introduce "Gardner" / Archestra as the top layer. The fleet-plane role is filled by MemroOS, which already ships the necessary primitives.

## Why this answer

### What MemroOS already ships (verified against the repo)

Confirmed from `~/github/memroos/docs/architecture.md`, `governance.md`, and `agent-onboarding.md`:

- **Canonical agent registry** with per-agent bearer API keys, hashed at rest, scoped to companies
- **A2A broker** (`/api/a2a`, `/.well-known/agent-card.json`, `/tasks`) with durable task state, SSE updates, approved-card ingestion
- **REST shim** (`/api/agent-memory`, `/api/tool-attention`, `/api/model-routing`) for non-A2A runtimes
- **Memory router** with three tiers: vector via mem0+Qdrant, graph via mem0+Neo4j, episodic in SQLite
- **Agent context bus** with durable inbox, reply, ack, peer comms
- **Orchestration proxy** → LangGraph service with SqliteSaver checkpoints + HIL queue (this is the pairing)
- **Native governance spine**: `Actor → Action → Asset → Purpose → Label → Decision → AuditEvent` contract covering agent actions, memory writes, retrieval, exports, indexing, operator review. Mandatory gates include capability gate, memory use gate, raw vault gate, encryption gate, auth/RBAC gate, audit/HIL gate, compliance gate.
- **NOC / operations / observability** panel for live agents
- **Single installer** (`scripts/install-agent-integrations.sh`) that copies the canonical MemroOS directive and MCP server config into nine agent CLIs: Hermes, Claude Code, Codex, OpenClaw, Cursor, Qwen, Gemini, ZCode, OpenCode.

This is not aspirational — it is what ships today in `lac5q/memroos` at v1.0.0-beta.2.

### What LangGraph gives MemroOS (the pairing)

LangGraph is already wired into MemroOS as a peer service (`architecture.md:29`). The pairing is correct because:

- LangGraph provides **StateGraph routing**, **SqliteSaver checkpointing**, **retry metadata**, and the **HIL interrupt protocol** — primitives MemroOS does not need to re-implement.
- LangGraph **LangSmith / Langfuse integration** is already observability-grade for graph runs.
- LangGraph **is not a control plane** — it does not own identity, multi-tenant auth, memory routing, audit, or budget. Re-implementing those in LangGraph would be the "rebuilding LangGraph badly" anti-pattern.
- **MemroOS adds to LangGraph**: canonical agent identity (so a graph node dispatches to a known agent, not a free-form function), cross-runtime memory reads/writes via the Memory Router, audit/classification receipts per tool call, SkillForge for skill lifecycle, and multi-tenant auth gates so the same graph service can be reused across companies/projects.

### What Paperclip already is (verified against `~/github/paperclip`)

- **MIT-licensed** control plane (NOT AGPL — confirmed against `LICENSE` file)
- **13 built-in adapters** in `packages/adapters/`: `acpx-local`, `claude-local`, `codex-local`, `cursor-cloud`, `cursor-local`, `gemini-local`, `grok-local`, `hermes`, `hermes-gateway`, `openclaw-gateway`, `opencode-local`, `pi-local`
- **Hermes adapter** has two flavors, both built-in core (not plugin-only): `hermes_local` shells out to `hermes chat -q "..." -Q` as a child process; `hermes_gateway` proxies `POST /v1/runs` + SSE to an already-running Hermes API server. **Neither provisions Hermes** — both assume the runtime already exists.
- **Governance primitives**: approval workflows (`server/src/services/approvals.ts` L11-200), three-layer budget model with hard-stop auto-pause (`budgets.ts`), activity log with redaction pipeline (`activity-log.ts` L65-119), single-assignee issue checkout with 409 on conflict.
- **Single-server architecture**: explicit at `doc/SPEC-implementation.md:33` ("Single-tenant deployment, multi-company data model"). No federation, no multi-server, no remote agent-host provisioning. V1 explicitly excludes fine-grained RBAC and self-healing orchestration (spec L86-87).
- **`paperclip-cloud/oracle/`** is a sibling repo, not a sub-product — Terraform recipe to deploy Paperclip on a single Oracle ARM Free Tier VM. One VM, not a fleet.

### Why Paperclip is a parallel tenant, not the top layer

Three concrete reasons, all from the audit:

1. Paperclip assumes one server + agents calling in. The user's stated requirement is MemroOS directly managing agents across all runtimes. Paperclip cannot fill that role without forking it into a federated server, which is explicitly out of V1.
2. Paperclip's adapter model is "wrap an existing CLI/gateway and shell to it." It does not own memory, cross-runtime memory, or cross-tenant governance — only per-company task/issue/budget tracking. The user wants those cross-cutting concerns above Paperclip, not inside one Paperclip company.
3. Treating Paperclip as the top layer would mean either (a) re-implementing MemroOS's memory + registry + audit on top of Paperclip (duplicates LangGraph/MemroOS work), or (b) collapsing all agents into one Paperclip company (loses the multi-runtime operator view the user wants). Both are wrong.

Paperclip's correct role: **peer product plane that runs its own agent company, subscribes as one tenant to MemroOS via the existing `hermes_gateway` / `openclaw-gateway` / MCP / A2A adapter surface, and owns per-company task lifecycle + budget enforcement + board UI.** MemroOS owns the cross-runtime registry, memory, governance, A2A broker, HIL queue, NOC.

### Why we are not adopting "Gardner" / Archestra / any other fleet tool

From the research:

- **No OSS project named "Gardner" / "Gardnr" / "Garden"** exists as an agent orchestrator. Closest collisions are unrelated: Vertex AI Agent Garden (cloud-only starter-agent library), `garden-io/garden` (Kubernetes deployment tool), SAP Gardener (Kubernetes-as-a-Service). None fill this role.
- **Archestra** is the closest functional cousin to Paperclip for governance + multi-machine agent plane (K8s operator, MCP gateway, Dual-LLM/Lethal-Trifecta guardrails, SSO/RBAC, cost limits), but it is **AGPLv3 + Enterprise dual license** — a real constraint if Epilogue ever ships a hosted offering. Adopting it would also mean re-plumbing all nine runtime adapters against it.
- **LangGraph** is a runtime/framework, not a fleet control plane. Using it as the top layer means re-implementing what MemroOS already ships.
- **Microsoft Agent Governance Toolkit** (MIT, public preview) is a preview-stage framework for agent governance patterns, not a substitute for a fleet control plane. It does not replace MemroOS's registry, memory routing, or multi-runtime governance.
- **CrewAI Agent Control Plane** is a cloud (AMP) feature, not self-hostable OSS. Rules editing requires Enterprise/Ultra plan.
- **AWS Bedrock AgentCore, Azure AI Foundry Agent Service, Vertex AI Agent Engine** are cloud-only proprietary services. They are useful as governance reference implementations, not as substitutes.
- **Microsoft AutoGen Studio** is deprecated. Folded into Microsoft Agent Framework, which is a framework not a control plane.

Adding any of these as a new layer between MemroOS and the runtimes would (a) duplicate MemroOS's existing primitives, (b) require re-wiring nine runtime adapters, (c) introduce a new license risk (Archestra AGPL), or (d) lock the fleet to a single cloud vendor.

## What is the user's actual stack going forward

```
┌─────────────────────────────────────────────────────────────────┐
│                       MemroOS (TOP LAYER)                       │
│         cross-runtime fleet plane · governance · memory         │
│                                                                 │
│   ┌────────────┐  ┌─────────────┐  ┌────────────────────────┐   │
│   │ Agent Reg  │  │ A2A Broker  │  │ Memory Router          │   │
│   │ + Heartbeat│  │ + REST shim │  │ (mem0/Qdrant/Neo4j/   │   │
│   │            │  │             │  │  episodic SQLite)      │   │
│   └────────────┘  └─────────────┘  └────────────────────────┘   │
│   ┌──────────────────────────────┐  ┌────────────────────────┐  │
│   │ Orchestration Proxy          │  │ Governance / Audit /   │  │
│   │ ──► LangGraph Service (peer) │  │ Classification /       │  │
│   │     SqliteSaver checkpoints  │  │ Evidence / Compliance  │  │
│   │     HIL interrupt queue      │  │                        │  │
│   └──────────────────────────────┘  └────────────────────────┘  │
│   ┌──────────────────────────────────────────────────────────┐  │
│   │ NOC · Model Usage · Cost · Efficiency Telemetry         │  │
│   └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        ▼                 ▼                 ▼
   ┌─────────┐       ┌─────────┐       ┌──────────┐
   │ Hermes  │       │  Claude │       │ OpenClaw │
   │ (gateway│       │   Code  │       │ (gateway │
   │  or     │       │ + Codex │       │  HTTP    │
   │  local) │       │         │       │  adapter)│
   └─────────┘       └─────────┘       └──────────┘
        │                 │                 │
        └─────────────────┼─────────────────┘
                          ▼
                 ┌─────────────────┐
                 │   Paperclip     │
                 │ (parallel, own  │
                 │  company, own   │
                 │  agents, own    │
                 │  budgets)       │
                 │ subscribes via  │
                 │ hermes_gateway │
                 │ / openclaw-    │
                 │ gateway / MCP  │
                 │ / A2A          │
                 └─────────────────┘
```

## Risks and gaps (from independent validation, GLM-5.2 PASS)

A second-opinion validator (`beastmode-validator` running GLM-5.2 via BYOK) reviewed this architecture on 2026-07-09 and flagged five concerns that are real and should be tracked:

1. **MemroOS single-host coupling** — `architecture.md:92` says MemroOS runs on one host. The kernel + LangGraph service + canonical registry SQLite are not designed for HA. Before scaling beyond one operator laptop, the canonical registry needs replication (litestream + S3, or migrate to Postgres) and the operator key store needs split-brain protection. *Mitigation*: defer until fleet grows past 5 machines; revisit at 10+.
2. **Adapter maturity is not uniform** — the nine-runtime reach of `install-agent-integrations.sh` is impressive, but the runtime adapters (Hermes gateway, Claude Code, OpenClaw gateway) are not at the same maturity level. Paperclip's Hermes and OpenClaw adapters are the most mature (built-in, documented); others are thinner. *Mitigation*: publish an adapter maturity matrix in `~/github/memroos/docs/` before the next phase.
3. **Pre-execution policy hook is under-specified** — the kernel has `/api/audit`, `/api/classification`, `/api/evidence`, but the runtime adapters are what actually execute tool calls. Audit-after-the-fact is not "operating system" — that is a logger. *Mitigation*: add a pre-execution policy gate using Open Policy Agent (Rego) at the adapter boundary, so policy is data not code per adapter.
4. **Fleet-level cost/budget ownership is ambiguous** — the kernel has per-agent telemetry (`lib/efficiency-telemetry.ts`, `/api/model-usage`) but no fleet-level cost router or budget hard-stop. Paperclip already ships "Budget hard-stop auto-pause" per its AGENTS.md. *Mitigation*: MemroOS should explicitly delegate fleet cost enforcement to Paperclip via MCP/A2A — not re-implement it. Write the contract down.
5. **LangGraph checkpoint store ownership split** — MemroOS owns SQLite for registry/audit; LangGraph service owns its own SQLite for checkpoints. If the LangGraph host is lost, in-flight graph state is lost. *Mitigation*: pin the contract in `integrations/langgraph.md` (input schema, output schema, checkpoint layout, HIL protocol, failure modes).

**Phase 145 reconciliation note.** Phase 145 must build the pre-execution policy gate on top of the already-shipped POLGOV engine (POLGOV-01..05) so the fleet does not end up with two policy engines; the adapter-boundary gate should wrap or delegate to the existing declarative policy engine rather than replace it.

## Required follow-up actions

| # | Action | Where | Why |
|---|--------|-------|-----|
| 1 | Publish adapter maturity matrix (T1 shipped + tested + governance-hooked; T2 partial; T3 stub) | `~/github/memroos/docs/runtime-adapter-maturity.md` | Diagram presents all nine adapters as equal. They are not. |
| 2 | Add pre-execution policy gate using OPA/Rego at adapter boundary | `~/github/memroos/src/lib/policy/` + each adapter | Audit-after-the-fact is not OS-level governance. |
| 3 | Explicitly delegate fleet cost/budget to Paperclip via MCP/A2A; write the contract | `~/github/memroos/docs/integrations/paperclip.md` | Avoid re-implementing Paperclip's budget hard-stop. |
| 4 | Pin LangGraph service contract (input/output schema, checkpoint store layout, HIL interrupt protocol, failure modes) | `~/github/memroos/docs/integrations/langgraph.md` (expand existing) | Peers need contracts. |
| 5 | Add HA story for MemroOS kernel (litestream + S3, or migrate canonical registry to Postgres) | `~/github/memroos/docs/production-deployment.md` (expand) | Fleet story on the plane side is missing. |
| 6 | Backups for LangGraph checkpoints (litestream or migration to shared Postgres) | `~/github/memroos/services/orchestration/` | Lost host = lost graph state today. |
| 7 | Secrets broker (Vault or Sealed Secrets) for per-adapter API keys | `~/github/memroos/src/lib/secrets/` | API keys currently live wherever each runtime puts them. |
| 8 | Add `paperclip` adapter to MemroOS so Paperclip can subscribe as a tenant | `~/github/memroos/src/lib/integrations/paperclip/` | MemroOS needs an inbound adapter for Paperclip's A2A/MCP stream. |

## What this means for the GitNexus-tagged `agent-knowledge` repo

The `agent-knowledge` repo (indexed by GitNexus) should remain the canonical knowledge store — it is what `scripts/install-agent-integrations.sh` writes into and what `mcp_memroos_knowledge_*` reads/writes. The above architecture decision is itself the first durable artifact under that repo's `content/architecture/` tree, filed via `mcp_memroos_knowledge_write` per the canonical AGENTS.md directive.

## Provenance notes

- **Architecture decision** authored by Alba (MiniMax-M3) on 2026-07-08 in Discord #devops thread "Agent fleet control tooling research".
- **Independent validation status — ACHIEVED.** On 2026-07-09 the `beastmode-validator` custom droid ran a second-opinion review using **GLM-5.2 (BYOK)** and returned verdict **PASS**. The validator confirmed the MemroOS-top / LangGraph-peer / Paperclip-tenant topology is consistent, the rejected alternatives are correctly excluded, and the five risks listed above are non-blocking follow-up work for Phases 143–147. The full validation artifact is filed at `content/architecture/memroos-fleet-plane-validation-glm52-2026-07-09.md`.
- **Historical context (2026-07-08):** The first attempt at GLM-5.2 validation failed because `GLM_API_KEY` was unset, and a follow-up probe confirmed the initial validator run was actually served by **MiniMax-M3** — the same model that authored the decision. That earlier run was therefore self-validation, not independent review. The 2026-07-09 run closed that gap.
- **Repo evidence** is real: file:line citations point at the working trees at `~/github/memroos` and `~/github/paperclip` (master branch, commit `ad961227f`). All other claims about third-party projects were verified against canonical GitHub LICENSE files, official docs, and community discourse (Reddit, HN, X).