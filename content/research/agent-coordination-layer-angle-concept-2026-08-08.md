---
name: "agent-coordination-layer-angle-concept"
title: "The Agent Coordination Layer: Angle and Concept Package"
description: "Research-backed concept package for a first-person podcast article about isolated agents, orchestration complexity, Vercel eve, Google ADK, and the proposed Agent Workplane."
publishedAt: "2026-08-08"
tags: [agent-orchestration, agent-ops, multi-agent-systems, content-strategy, podcast]
keywords: [agent coordination, Vercel eve, Google ADK, OpenAI Agents SDK, LangGraph, MCP, A2A, shared memory, approvals, evals]
author: "Codex"
source_session: "current-codex-thread"
model: "gpt-5"
sources:
  - "https://vercel.com/blog/introducing-eve"
  - "https://vercel.com/blog/vercel-ship-2026-recap"
  - "https://github.com/vercel/eve"
  - "https://adk.dev/sessions/"
  - "https://adk.dev/agents/routing/"
  - "https://adk.dev/evaluate/"
  - "https://openai.github.io/openai-agents-python/multi_agent/"
  - "https://openai.github.io/openai-agents-python/guardrails/"
  - "https://langchain-ai.github.io/langgraph/"
  - "https://modelcontextprotocol.io/specification/2025-03-26/basic/index"
  - "https://google-a2a.github.io/A2A/specification/"
  - "https://github.com/open-telemetry/semantic-conventions-genai/blob/main/docs/gen-ai/gen-ai-agent-spans.md"
derived_from:
  - "runs/active/2026-08-08-agent-coordination/angle-concept.md"
  - "strategy/positioning.md"
  - "strategy/linkedin-agentic-virality-system.md"
  - "modules/writer/SKILL.md"
  - "drafts/i-became-the-context-window/article.mdx"
  - "drafts/2026-05-20-agent-ops-draft-package.md"
regen_prompt: "Research current primary sources on agent runtimes and protocols, then create a first-person operator article concept arguing that multi-agent systems need a framework-agnostic coordination workplane for shared tasks, context, permissions, approvals, traces, and evals."
---

# Content Package: The Agent Coordination Layer

**Status:** Concept review

**Date:** 2026-08-08

**Genre:** Professional operator field note with a first-person podcast article spine

**Primary audience:** Founders, engineering leaders, platform teams, and technical operators who have moved past one agent and are starting to feel the cost of coordination.

## Recommended angle

### I Built More Agents. The Work Got Harder.

Vercel's eve makes one production agent easier to define, run, secure, and deploy. The next problem starts after that success: a team of agents still needs shared work state, scoped context, permissions, handoff rules, memory, and proof.

The story is personal. I have seen the failure mode in my own stack. Each agent can be useful on its own. Once they need to collaborate, I become the missing operating system. I carry the context from one run to the next, translate one agent's output for another, watch approval queues, and remember which decision changed in which thread.

The article argues that the next valuable layer in agentic software is a coordination layer between runtimes and work. Frameworks such as eve, Google ADK, OpenAI Agents SDK, and LangGraph are converging on the primitives for reliable individual agents and explicit workflows. Teams still need a shared workplane that lets those runtimes cooperate without turning a human into a message bus.

## Headline candidates

1. **I Built More Agents. The Work Got Harder.**  Recommended.
2. **Your Agents Are Not a Team Until They Share a Work State.**
3. **The Agent Stack Is Missing a Coordination Layer.**
4. **Vercel Made Agents Easier to Ship. The Hard Part Starts After That.**
5. **I Thought I Was Building an Agent Team. I Was Building a Review Queue.**

### Suggested subhead

Vercel's eve shows how to make one agent production-ready. The next fight is making several agents operate as one system without losing context, control, or accountability.

## One-sentence thesis

The next generation of agent systems will be won by the layer that coordinates agents' work, context, permissions, and receipts, not by the team with the largest pile of agents.

## The opening scene

I recently made a presentation about becoming agentic and managing agent work after watching a Vercel executive explain the direction of the stack. The part that stayed with me was not the promise that agents would write more software. It was the quiet admission inside the architecture: every useful agent needs the same production plumbing.

That is exactly what Vercel's eve packages. An agent is a directory. Instructions live in Markdown. Tools live in TypeScript. Sessions are durable. Code runs in a sandbox. Approvals pause the run. Traces and evals make the behavior inspectable.

Then I looked at my own system.

I have run enough harnesses, models, skills, and agents that the first problem is no longer starting an agent. It is getting the right agent to start with the right context, hand work to the next agent, wait for the right approval, and leave behind a useful record for the next run.

The models are not the only systems with context windows anymore. The operator has one too.

## The problem to make visceral

Most agent demos stop at the moment one agent finishes a task. Production work does not stop there.

The work moves between agents. A researcher hands evidence to a planner. A planner hands a bounded task to an executor. An executor produces artifacts and uncertainty. A reviewer decides what is safe. A memory system records the decision. The next agent needs the decision, not the entire transcript.

Without a coordination layer, every handoff becomes one of four things:

- a copied summary that drops important context;
- a giant transcript that burns tokens and confuses scope;
- a human translation step;
- or a silent assumption that one agent's local memory is shared truth.

This is how isolated agents create system-level complexity. Each one is locally reasonable. The workflow is globally brittle.

The first-person line to repeat throughout the piece:

> I did not have isolated agents because the models were incapable. I had them because each runtime owned its own context, tools, state, and proof.

## Story spine for the podcast article

### 1. The Vercel moment

Use the Vercel talk and the public eve launch as the trigger. Vercel says its teams kept rebuilding the same production plumbing across hundreds of agents, and eve turns that repeated shape into a framework.

The useful interpretation is simple: frameworks are born when a repeated pain becomes a stable shape.

### 2. The firsthand turn

Move quickly from industry framing to the stack I actually run. The numbers can be used as a lived snapshot, with the date attached rather than treated as a universal benchmark: 13 harnesses, 12 model IDs, 48 agent definitions, 390 skills, 27 MCP servers, and one human reviewer.

The point is not to flex the inventory. The point is to show what happens when execution scales faster than review and coordination.

### 3. The hidden tax

Adding an agent removes some execution work and adds coordination work. The new tax arrives as context packing, duplicate retrieval, handoff translation, approval triage, stale memory, and post-run verification.

That tax is hard to see in a demo because the demo has one task, one operator, one context, and no tomorrow.

### 4. What existing frameworks already teach us

The article should give each framework credit for the problem it solves:

- **Vercel eve:** package the production shape of an individual agent: durable execution, isolated sandboxing, approvals, subagents, channels, traces, evals, and Git-native changes.
- **Google ADK:** make session, state, and long-term memory distinct; provide explicit routing and workflow patterns; evaluate behavior with an eval command and dataset.
- **OpenAI Agents SDK:** make the manager-versus-handoff choice explicit. An agent can keep control and call specialists as tools, or transfer control to a specialist. Guardrails and tracing make the flow inspectable.
- **LangGraph:** provide a low-level runtime for durable execution, streaming, persistence, and human-in-the-loop control when the workflow needs a custom graph.
- **MCP and A2A:** give tools and agents shared interfaces. MCP describes discoverable tools, resources, and prompts. A2A describes how independent agents discover one another and move tasks through a lifecycle.

The editorial point is not that one framework wins. The convergence is the signal. Reliable agent work keeps asking for the same categories of infrastructure.

### 5. The missing layer

An agent directory can describe an agent. A workflow runtime can execute a graph. A tool protocol can expose a capability. None of those, by itself, gives the organization a shared answer to:

- Which agent owns this task?
- What context is safe and relevant for this run?
- What decision did the previous agent make?
- What authority does the next agent receive?
- What happens if the handoff fails halfway through?
- Who approves the irreversible step?
- What evidence proves the work happened?

That is the coordination layer.

### 6. The recommendation

Recommend a thin, framework-agnostic **Agent Workplane**. It should sit above eve, ADK, OpenAI Agents SDK, LangGraph, or a homegrown loop. It should not try to replace the runtime that performs the work.

The Workplane owns the contracts around the work.

## The Agent Workplane framework

### 1. Agent manifest

Every agent declares:

- role and owner;
- capabilities and tools;
- context and data scope;
- risk class;
- allowed handoffs;
- model and cost policy;
- eval suite;
- version and change history.

An agent should be inspectable before it is dispatched.

### 2. Durable task envelope

Every dispatch carries a typed envelope with:

- objective;
- inputs and source references;
- expected output shape;
- budget and deadline;
- dependency IDs;
- success criteria;
- approval requirements;
- parent run and trace IDs.

The next agent should receive a task, not a mystery transcript.

### 3. Shared context and memory plane

Separate four kinds of information:

- **session state:** what is happening in this run;
- **working context:** what this agent needs right now;
- **durable memory:** facts, decisions, procedures, and corrections that should survive;
- **evidence:** source links, artifacts, traces, and approvals that prove why a result exists.

MemroOS is a natural fit for the durable memory and provenance half of this layer. The storage rule matters: write decisions with scope, owner, timestamp, source, and confidence. Do not dump every tool log into a shared junk drawer.

### 4. Capability and identity plane

Use MCP for tool access and A2A where independent agents need to discover and call one another. Keep identity separate from capability. An agent can know that a tool exists without receiving unrestricted authority to use it.

Permissions should be scoped to the task, time-limited where possible, and visible in the trace.

### 5. Approval and policy plane

Put actions into risk classes:

- reversible and low blast radius: run automatically;
- reversible but externally visible: log and review;
- destructive, expensive, or authority-bearing: pause for approval;
- ambiguous: ask the operator before dispatch.

Approval should be a durable workflow state, not an ad hoc chat question. The agent pauses, the human sees the exact action and evidence, and the run resumes from the same checkpoint after the decision.

### 6. Trace and evaluation plane

Trace the whole chain, not only the final model call. Record routing, retrieval, memory writes, tool inputs and outputs, approvals, retries, costs, and artifacts under one run ID.

The deploy gate should test behavior that matters: did the right agent run, did it receive the right context, did it stay within scope, did it ask for approval at the right moment, and did it leave an auditable result?

## The operating loop

The reusable mental model for the article is:

**Intake → dispatch → context pack → execute → handoff → approve → trace → remember**

The loop is the product surface. Models and frameworks are replaceable components inside it.

## Why this can travel

### The emotional hook

People are adding agents and feeling less in control. The piece names the private frustration: the system got faster at producing work, while the operator got slower at understanding what happened.

### The proof

Use a real stack count and a specific failure pattern: copied context, duplicate work, stale decisions, and one approval queue split across multiple agents.

### The saveable artifact

Close with the six-item Agent Workplane checklist. Readers can use it before adding another agent.

### The question

Ask one concrete question:

> When did adding the next agent create more review work than useful output?

That question invites field reports from people already feeling the same system pressure.

## Podcast treatment

**Episode title:** I Built More Agents. The Work Got Harder.

**Cold open:**

I recently made a presentation about becoming agentic after watching Vercel explain the new stack for agents. I came away with a strange reaction. The demo made one agent look easier to ship, and that was the problem. I already knew how to make one agent run. My pain started when the second agent needed the first one's context, the third needed the decision they made, and I became the person carrying the whole story between them. The models were getting smarter. The system was getting harder to operate.

**Episode arc:**

1. The Vercel/eve insight: repeated production plumbing becomes a framework.
2. The personal inventory: isolated runtimes and a finite human approval queue.
3. Why handoffs fail when context, memory, and authority are implicit.
4. What eve, ADK, OpenAI Agents SDK, LangGraph, MCP, and A2A each solve.
5. The Agent Workplane: manifests, task envelopes, memory, identity, approvals, traces, and evals.
6. The practical next step: prove the workplane with two agents before building a swarm.

**Tone:** First person, calm and slightly self-deprecating. Explain systems through lived friction. Keep vendor references specific and fair. No breathless future language.

## Research-backed claims and boundaries

### Verified public claims

- Vercel's eve announcement says its teams kept rebuilding the same production plumbing across many agents and that eve packages durable workflows, sandboxes, approvals, subagents, evals, tracing, channels, and Git-based changes.
- Vercel's Ship recap describes an Agent Stack made from model access, durable workflows, sandboxed compute, channels, and secure connections.
- Google ADK separates sessions, session state, and cross-session memory, and documents routing, workflow execution, and evals.
- OpenAI's Agents SDK documents manager-style orchestration through agents as tools, specialist takeover through handoffs, guardrails, sessions, human approvals, and tracing.
- LangGraph positions itself as a low-level runtime for durable execution, persistence, streaming, and human-in-the-loop orchestration.
- MCP standardizes servers exposing resources, prompts, and tools. A2A defines agent discovery and task lifecycle for independent agent systems.

### Interpretation to label as interpretation

The claim that the next missing layer is an Agent Workplane is my synthesis from the comparison above and from operating multi-agent systems. It is a recommendation, not a claim that the standards already provide this product.

### Known gaps

- The exact YouTube URL from the presentation is not present in the current workspace, so the article should use the verified Vercel eve and Ship sources until that link is supplied.
- The private framework sent to Eric, Juan, and Branden is not present in the available files or MemroOS search results. This concept preserves the likely intent at the architectural level without pretending to quote or reproduce that private document.
- Current eve documentation describes the framework as beta. The final article should keep that qualifier.

## Source list

- [Vercel: Introducing eve](https://vercel.com/blog/introducing-eve)
- [Vercel Ship 2026 recap](https://vercel.com/blog/vercel-ship-2026-recap)
- [Vercel eve repository](https://github.com/vercel/eve)
- [Google ADK: Session, State, and Memory](https://adk.dev/sessions/)
- [Google ADK: Agent routing](https://adk.dev/agents/routing/)
- [Google ADK: Why evaluate agents](https://adk.dev/evaluate/)
- [OpenAI Agents SDK: Agent orchestration](https://openai.github.io/openai-agents-python/multi_agent/)
- [OpenAI Agents SDK: Guardrails](https://openai.github.io/openai-agents-python/guardrails/)
- [LangGraph overview](https://langchain-ai.github.io/langgraph/)
- [Model Context Protocol specification](https://modelcontextprotocol.io/specification/2025-03-26/basic/index)
- [Agent2Agent protocol specification](https://google-a2a.github.io/A2A/specification/)
- [OpenTelemetry GenAI agent spans](https://github.com/open-telemetry/semantic-conventions-genai/blob/main/docs/gen-ai/gen-ai-agent-spans.md)

## Next deliverables after concept approval

1. Draft the 2,000 to 3,000 word podcast article around the story spine.
2. Produce a research note with timestamped source excerpts and a vendor comparison table.
3. Turn the Agent Workplane into the article's saveable framework graphic and checklist.
4. Create the LinkedIn native post, first comment, and X thread from the same thesis.
5. Run the professional voice, anti-slop, source, and link checks before human review.
