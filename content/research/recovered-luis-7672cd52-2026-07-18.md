---
title: "Recovered research — luis (session 20260510_211932_7672cd52)"
description: "Backfill from research-without-persist detector. Original session produced research/analysis content but never called mcp_memroos_knowledge_write. Recovered 2026-07-18 by the daily research-persist audit cron."
publishedAt: "2026-07-18"
tags: [recovery, research-without-persist, backfill]
keywords: [memroos, persist-failure, recovery, luis]
author: "Alba [bot]"
source_session: "20260510_211932_7672cd52"
model: "minimax-m3"
sources:
  - "label:research-without-persist-detector"
  - "file://~/.hermes/sessions/20260510_211932_7672cd52.jsonl"
derived_from:
  - "content/research/memroos-persist-failure-rca-2026-07-05.md"
regen_prompt: "Read session ~/.hermes/sessions/20260510_211932_7672cd52.jsonl, extract the largest assistant-side structured content block, and write a recovery markdown describing what the session produced and why it was missed."
---

# Recovered Research — luis

**Source session:** `20260510_211932_7672cd52`
**Recovered:** 2026-07-18 (daily research-persist audit cron)
**Trigger:** research-without-persist detector flagged this session as having produced research-grade output without calling `mcp_memroos_knowledge_write`.

## Original research content (excerpt)

> First 4713 characters of the largest assistant-side structured block recovered from the session transcript.

```
Good find. Here's the full contrast between **AgentScope** and our **Hermes + OpenClaw + GSD** stack, plus roadmap recommendations.

---

## AgentScope vs Our Stack — Feature Contrast

| Feature Area | AgentScope | Our Stack (Hermes/OpenClaw/GSD) | Verdict |
|---|---|---|---|
| **Agent Runtime** | ReAct agents with tool use, memory, planning | Hermes core agent loop with tools, memory, skills, cron | Tie (different philosophy: code-first vs ops-first) |
| **Multi-Agent Orchestration** | `MsgHub` — debate, concurrent agents, routing, handoffs | `delegate_task` subagents + `kanban-orchestrator` | **We're strong** but lack a formal orchestration layer |
| **Agent-to-Agent Protocol (A2A)** | Agent Cards, remote agent discovery, Nacos registry | None | **Gap** |
| **Long-Term Memory** | ReMe integration, DB-backed memory, memory compression | File-based daily notes, mem0/qmd, session_search | **Gap** — ours is file-based, not structured |
| **MCP Integration** | Native MCP client for tool composition | Native MCP client (identical capability) | Tie |
| **Realtime Voice** | Speech I/O agents, multi-agent voice | TTS via sag/sherpa-onnx-tts/edge, but not integrated into agent loop | **Gap** — one-way only |
| **State/Session Management** | Session persistence, state snapshots | Session search + memory tool (declarative, not stateful) | **Partial** — different approach |
| **Agent Hooks/Middleware** | Pre/post-call hooks, middleware chain | None | **Gap** |
| **Planning** | `Plan` module (task planning) | **GSD** (discuss, plan, execute phases) | **We lead** — far more rigorous |
| **RAG** | Built-in RAG pipeline | No native RAG (qmd search, mem0 as proxy) | **Gap** |
| **Observability/UI** | AgentScope Studio (visual agent tracing) | Paperclip task dashboard, hive posts | **Gap** — no visual agent tracing |
| **Tracing** | OpenTelemetry, execution tracing | None | **Gap** |
| **Evaluation** | Built-in eval + OpenJudge | None | **Gap** |
| **Agentic RL** | Trinity-RFT integration (75->85% math, 15->86% nav) | Hermes RL envs + slime-rl-training | **We lead** — native, configurable |
| **TTS** | Built-in TTS | sag, sherpa-onnx-tts, MiniMax, edge | **We lead** — more providers |
| **K8s/Cloud Deploy** | K8s, serverless, local | Cron jobs on Mac, Paperclip supervisor | **Gap** for scale |
| **Skill System** | "Agent Skill" concept | Comprehensive skill system (150+ skills) | **We lead** |
| **Code Intelligence** | None | GitNexus (impact, context, cypher, rename) | **We lead** |
| **Cross-Platform Messaging** | None | Discord, Telegram, Slack, WhatsApp, iMessage | **We lead** |

---

## Roadway Recommendations — What to Add to GSD Specs

**Tier 1 — High Impact, Close to Our Strengths:**

1. **Agent Observability Dashboard** (gsd-spec: `agent-tracing`)
   - Visual execution trace of agent tool calls, token usage, decision points
   - Think AgentScope Studio but for Hermes sessions
   - Low effort: build on top of Paperclip + existing session logs

2. **Structured Long-Term Memory** (gsd-spec: `agent-memory-v2`)
   - Replace file-based memory with a vector-backed memory system
   - mem0 already gives us the API — just need a GSD phase to formalize it
   - Adds: memory compression, relevance scoring, expiration

3. **Agent Hooks/Middleware** (gsd-spec: `agent-middleware`)
   - Pre-call hooks (validate tool inputs, redact sensitive data)
   - Post-call hooks (log outcomes, auto-patch skills on failure)
   - This is the single highest-leverage thing — makes the whole system self-healing

**Tier 2 — Strategic, Medium Effort:**

4. **A2A Protocol Support** (gsd-spec: `agent-registry`)
   - Agent Cards for our agents (Alba, Gwen, Gizmo, etc.)
   - Discovery mechanism so agents can find and call each other
   - Start simple: JSON files + local resolver (like AgentScope's FileAgentCardResolver)

5. **Built-in RAG Pipeline** (gsd-spec: `agent-rag`)
   - Embed codebase + knowledge base docs
   - Query at agent startup for context injection
   - Complements existing mem0 + qmd setup

6. **Agent Evaluation Framework** (gsd-spec: `agent-eval`)
   - Test suite for agent behavior before deploying skill changes
   - Golden inputs/outputs for key workflows (email compose, code review, social posting)
   - Prevents regression when patching skills

**Tier 3 — Future/Optional:**

7. **Realtime Voice Agent** — Integrate TTS into the agent response loop so Alba can talk back in Discord/Telegram natively (we have the pieces, just need wiring)
8. **K8s/Serverless Deploy** — Only if you plan to scale beyond the Mac

---

Want me to draft GSD spec phases for any of these? I'd start with **agent-middleware** and **agent-memory-v2** since they unlock everything else.
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
the Hermes session log at `~/.hermes/sessions/20260510_211932_7672cd52.jsonl`; this file
exists so the durable knowledge base has at least a pointer to what the
session produced. Future readers can consult the source session file for
the full transcript.
