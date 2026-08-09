---
name: agent-coordination-layer-full-package
title: "I Built More Agents. The Work Got Harder. - Full Content Package"
description: "Research-backed first-person podcast article and distribution package about the coordination layer required after teams move beyond one agent."
publishedAt: 2026-08-08
tags:
  - agent-orchestration
  - agent-operations
  - content-package
  - podcast
  - vercel-eve
  - google-adk
  - multi-agent-systems
keywords: "agent coordination, agent workplane, Vercel eve, Google ADK, OpenAI Agents SDK, LangGraph, MCP, A2A, agent operations"
author: Codex
source_session: current-codex-thread
model: gpt-5
sources:
  - https://youtu.be/HQXi4snP36I
  - https://vercel.com/ship/nyc/session/agentic-infrastructure
  - https://vercel.com/blog/introducing-eve
  - https://vercel.com/blog/vercel-ship-2026-recap
  - https://github.com/vercel/eve
  - https://adk.dev/sessions/
  - https://adk.dev/agents/routing/
  - https://adk.dev/evaluate/
  - https://openai.github.io/openai-agents-python/multi_agent/
  - https://openai.github.io/openai-agents-python/guardrails/
  - https://langchain-ai.github.io/langgraph/
  - https://modelcontextprotocol.io/specification/2025-03-26/basic/index
  - https://google-a2a.github.io/A2A/specification/
derived_from:
  - runs/active/2026-08-08-agent-coordination/angle-concept.md
  - runs/active/2026-08-08-agent-coordination/article.md
  - runs/active/2026-08-08-agent-coordination/draft-package.md
  - runs/active/2026-08-08-agent-coordination/media-plan.md
  - runs/active/2026-08-08-agent-coordination/source-map.md
  - modules/writer/SKILL.md
  - strategy/positioning.md
  - strategy/linkedin-agentic-virality-system.md
regen_prompt: |
  Preserve the first-person operator story, the exact public source links, the dated personal stack evidence, and the private runtime-neutral framework's Establish / Operate / Compound sequence. Rewrite in accessible language with no AI slop, then regenerate the article, podcast treatment, channel variants, media plan, and source map. Keep fact claims distinct from recommendations.
---

# Full Content Package



===== runs/active/2026-08-08-agent-coordination/angle-concept.md =====

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

I recently made a presentation about becoming agentic and managing agent work after watching [Guillermo Rauch's Vercel talk about the agent every company is about to build](https://youtu.be/HQXi4snP36I). The part that stayed with me was not the promise that agents would write more software. It was the quiet admission inside the architecture: every useful agent needs the same production plumbing.

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

### Recovered source and framework

- The source video is [The AI Agent Every Company is About to Build](https://youtu.be/HQXi4snP36I), attributed to Guillermo Rauch, Vercel's founder and CEO. Vercel's public [Agentic Infrastructure session page](https://vercel.com/ship/nyc/session/agentic-infrastructure) confirms the talk context and speaker roster.
- The framework sent to the working group was recovered from two Google Drive presentations updated August 7, 2026: **Cordant Phased Agent Plan — Runtime Neutral** and **Cordant Agent Implementation Roadmap — Tool Agnostic**.
- Its durable ideas are stronger and more specific than the earlier approximation: own the intelligence contract; treat the runtime as an adapter; move through Establish, Operate, and Compound; use one front door, one router, bounded specialists, least-privilege context, approvals, audit receipts, evals, and a portability test.
- The public article should use the private decks as the author's firsthand framework, without exposing Drive links or client-specific names. It can describe the concrete v0 test as 10 to 20 named accounts, five source-backed dossiers, read-only context, and no unreviewed writes or sends.
- Current eve documentation describes the framework as beta. The final article should keep that qualifier.

## Source list

- [Vercel: Introducing eve](https://vercel.com/blog/introducing-eve)
- [The AI Agent Every Company is About to Build, Guillermo Rauch](https://youtu.be/HQXi4snP36I)
- [Vercel Ship: Opening Keynote, Agentic Infrastructure](https://vercel.com/ship/nyc/session/agentic-infrastructure)
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


===== runs/active/2026-08-08-agent-coordination/article.md =====

---
title: "I Built More Agents. The Work Got Harder."
subtitle: "Vercel showed what one production-ready agent looks like. The next problem is getting several agents to work as one system the company actually owns."
slug: i-built-more-agents-the-work-got-harder
status: draft
date: 2026-08-08
genre: professional podcast article
audience: founders, engineering leaders, platform teams, technical operators
meta_description: "The first agent takes work off your plate. The second reveals what's missing: shared context, permissions, handoffs, approvals, and proof."
source_video: https://youtu.be/HQXi4snP36I
source_video_title: "The AI Agent Every Company is About to Build"
---

# I Built More Agents. The Work Got Harder.

Vercel showed what one production-ready agent looks like. The next problem is getting several agents to work as one system the company actually owns.

I watched [Guillermo Rauch's Vercel talk about the agent every company is about to build](https://youtu.be/HQXi4snP36I), and then I did what I usually do when a talk gets under my skin: I made a presentation about it.

The talk's central idea is easy to follow. Software is gaining a new kind of worker: the agent. An agent is a program that uses an AI model to do real work on its own. It can write code, ship it, check the results, and keep going after the human walks away from the keyboard. Vercel's official session description calls this a shift from a human actor to a machine actor, and frames the challenge as building infrastructure for software that acts in production. [The session page](https://vercel.com/ship/nyc/session/agentic-infrastructure) lists Guillermo Rauch, Malte Ubl, Shar Dara, and the rest of the Vercel team behind that argument.

I agreed with the direction. I also felt a familiar discomfort.

I have already seen what happens when the first useful agent becomes the fifth, then the tenth. Each one can be made to work. The system around them gets harder to explain. Information lives in different places. Permissions mean different things in different tools. One agent makes a useful decision, and the next agent never hears about it. I end up carrying the story between them myself.

AI models have a well-known limit called a context window, the amount of information a model can hold in mind at once. It turns out the models are not the only ones with that limit. The operator has one too.

## The first agent is a product. The second is an organization problem.

The first agent is satisfying because the feedback loop is short. Give it a task. Watch it work. Check the result. Fix the instructions. Run it again.

The second agent changes the shape of the work. Now someone has to decide which agent gets the task, what information it receives, what it is allowed to do, and what the next agent can trust. That is where the missing system shows up.

I have seen this firsthand in my own setup. In a late-July inventory, I counted 13 harnesses, the software shells that actually run agents; 12 model IDs, distinct AI models; 48 agent definitions; 390 skills, packaged instructions that teach an agent a specific job; and 27 MCP servers, connectors built on the Model Context Protocol, an open standard that gives agents a common way to reach tools and data. Those numbers describe one moment in one operator's environment. They are not a benchmark. They are a warning about how fast raw capability can outgrow coordination.

The work did not get hard because any single agent was bad. It got hard because every agent had its own private idea of what the context was, what tools it had, where things stood, and what counted as proof.

One agent researched a market. Another turned that research into a brief. A third wrote a draft. A reviewer checked the result. On paper, that looks like healthy specialization. In practice, I had to answer questions no runtime owned. A runtime is simply the software that runs an agent.

- Which sources was the researcher allowed to use?
- Was the brief built on current evidence or an old memory?
- Did the drafting agent inherit the doubts, or only the conclusion?
- Who owns the next step?
- Which actions can happen automatically, and which need my sign-off?
- If a run stops halfway, where does it pick back up?

Every missing answer became a job for me. I was the router, the shared memory, the permission check, and the audit trail. The agents were doing the work. I was doing the coordination.

## Eve solves a real problem

This is why Vercel's eve matters. [Vercel describes eve](https://vercel.com/blog/introducing-eve) as a framework that grew out of teams rebuilding the same production plumbing for internal agents over and over. Eve gives that repeated shape a home: sessions and workflows that can pause and resume without losing their place, a sandbox, a walled-off environment where an agent can act without touching anything else, approvals that can wait for a human, subagents, traces, records of exactly what happened, evals, tests of how an agent behaves, and changes tracked through Git.

The filesystem-first design is part of the appeal. An agent's instructions can live in plain Markdown files and its tools in TypeScript code. That makes the agent something a team can read, version, run, and deploy like any other software. [The eve repository](https://github.com/vercel/eve) describes the project as a filesystem-first framework for durable AI agents, and currently labels it beta.

That is real progress. A production agent needs more than a prompt and a model call. It needs a place to pause. It needs a sandbox. It needs a record of what it did. It needs a way to ask for approval without burning compute while a person sits in a meeting.

What I keep coming back to is what eve does not claim to solve. A directory can describe one agent. A runtime can resume one workflow. Neither tells the next agent which decision to inherit, which context to leave out, or what authority was handed over.

That is the next layer.

## The hidden tax appears at the handoff

Most agent demos end when one agent returns an answer. Real work continues.

A researcher hands evidence to a planner. The planner gives an executor a clearly bounded task. The executor produces a result and a list of open questions. A reviewer decides what moves forward. A memory system records the decision so the next run does not rediscover it.

Without a deliberate coordination layer, each handoff tends to become one of four things:

1. A summary short enough to read that drops the one caveat that mattered.
2. A full transcript that contains everything and communicates almost nothing about what is in scope.
3. A human translation step, where I restate the first agent's work for the second.
4. A silent assumption that one agent's private memory is shared truth.

The fourth failure is the most expensive, because it looks like success until the damage compounds. A stale map of buyers gets treated as current. A draft is written from a source the next agent cannot check. A tool permission follows the agent instead of the task. The system finishes the workflow and leaves no useful explanation of why anyone should trust the result.

This is the difference between an agent that runs and an agent system that can be operated.

## The frameworks are converging on the pieces

I do not think the answer is to pick one vendor and hope it becomes the company's operating system. The more useful signal is that several frameworks keep surfacing the same categories of need.

[Google ADK separates sessions, session state, and longer-lived memory](https://adk.dev/sessions/). In plain terms, it keeps "what happened in this run" apart from "what the organization has learned." Its routing documentation makes visible how tasks get directed to agents, and its evaluation tooling treats agent behavior as something to test, not just demonstrate. That separation matters. The state of one run should not quietly become institutional memory.

[OpenAI's Agents SDK documents two ways to coordinate multiple agents](https://openai.github.io/openai-agents-python/multi_agent/). A manager agent can call specialists the way it calls tools, or a handoff can transfer control to a specialist outright. The choice changes who owns the conversation and the next decision. Its [guardrail documentation](https://openai.github.io/openai-agents-python/guardrails/) explains automated checks on what an agent takes in and puts out, and its tracing features make those boundaries easier to inspect.

[LangGraph](https://langchain-ai.github.io/langgraph/) works at a lower level. It is software for building custom workflows as graphs, with durable execution, work that survives interruptions, saved state, streaming output, and built-in points where a human can step in. That is useful when the workflow itself is the product, or when it cannot be expressed as a simple manager-and-specialists pattern.

[MCP](https://modelcontextprotocol.io/specification/2025-03-26/basic/index) gives agents a common way to expose tools, resources, and prompts. [A2A](https://google-a2a.github.io/A2A/specification/), the Agent2Agent protocol, covers how independent agents find each other and exchange tasks. These protocols help agents discover capabilities and communicate. They do not decide which employee, policy, or customer boundary applies to a given task.

The convergence is the point. Reliable agent work keeps asking for the same things: identity, context, routing, permissions, persistence, approval, evidence, and evaluation. The implementations differ. The contracts keep coming back.

## The framework I sent out starts with the contract

After the Vercel talk, I turned the idea into a plan for a real operating system, one that is deliberately neutral about which runtime sits underneath. The headline was simple:

> The agent is a company capability. It is not a model subscription.

That means the durable asset lives above the runtime. The company should own the agent's identity, its mandate, the boundaries of its memory, its skills, its tool permissions, its approval rules, its audit receipts, its evaluation set, and its work products. Eve, ADK, the OpenAI Agents SDK, LangGraph, or some future runtime can sit below that contract as a swappable adapter.

I call this shared layer the Agent Workplane. The plan itself describes three sequences and nine gated phases.

### Establish

The first sequence earns the right to exist.

First, write the charter: mission, owner, users, forbidden actions, data ownership, and how success will be measured. Then give the agent one useful job with a visible baseline to compare against. Then limit what it can see and which tools it can touch. The first agent should be useful, read-only wherever possible, and unable to take any outside action without review.

This is boring on purpose. A first win should be easy to explain, easy to measure, and easy to undo. If I cannot say what changed, compare it to a baseline, and roll it back, I have a demo, not an operating capability.

### Operate

The second sequence turns that isolated job into a governed service.

There is one front door. A router reads each incoming request, figures out what kind of task it is, gathers the right context for that role, picks a worker with clear limits, and creates a handoff that can be traced later. The workers have narrow skills and explicit contracts. A research worker can read approved sources. A content worker can draft. A build worker can run checks. None of them quietly inherits every permission the company has.

Governance lives inside the workflow, not beside it. Identity, minimal access, approvals, removal of sensitive data, safeguards so a retried step does not run twice, escalation paths, and audit receipts are all part of the service. An agent does not ask for approval in a side conversation and then continue from some other state. The approval is a recorded step in the task itself.

### Compound

The third sequence earns the right to act on its own.

Events and schedules can start work. Feedback and evals can spot repeated failures. The system can propose a new skill or a new route, and a human approves the change before it becomes part of the operating contract. Routing between models, background work, and cost limits come later, after the earlier phases have produced evidence.

Portability is the final test. Swap the model or the runtime without losing the business memory, the record of where facts came from, the permissions, the approvals, or the evaluation history. If switching runtimes means rebuilding the company's intelligence from scratch, the system was married to the tool all along.

## The useful v0 is smaller than the pitch

The first version I would ship is one front door, one router, and three workers with clear limits. A human stays in the loop for anything that writes data or is visible outside the company. The context is read-only and linked back to its sources. The first test is twenty hours of real work, with a baseline, a cost, a latency number, a way to roll back, and zero unreviewed actions with outside consequences.

In the concrete example behind my framework, the first loop is account research. Give the system 10 to 20 named accounts. Ask it to produce five dossiers backed by sources. Require facts, buyers, sources, unknowns, and a note on confidence. Let the human owner accept or reject each one. Keep outbound messages, CRM writes, browser actions, and shell access out of the first pass entirely.

That test answers a more useful question than "Which agent framework should we choose?"

Can the system keep the contract while doing real work?

If the answer is yes, then pick the smallest runtime that passes the gates. Eve may be the right host for work that needs to pause, resume, and run in a sandbox. ADK may fit a team that wants explicit sessions, routing, and evals. OpenAI's SDK may fit a manager-and-specialists design. LangGraph may fit a custom stateful workflow. A homegrown runner may be enough for something narrow.

The runtime is allowed to be replaceable. The workplane is not.

## What comes next

The next generation of agent systems will be judged less by how many agents a team can launch and more by how clearly the team can answer five questions:

- What does this agent own?
- What context did it receive, and where did that context come from?
- What authority did it have for this task?
- What did it hand off, and who accepted it?
- What evidence proves the result is safe to use?

This changes the human's job. I do not want to spend my day copying summaries between agents or remembering which version of a decision lives in which thread. I want to set the contract, review the risky edges, inspect the evidence, and improve the system when the evidence says it needs work.

That is the part of the Vercel vision I believe in. The machine can become the actor. The company still has to own the operating model around that actor.

I built more agents. The work got harder because I had built execution faster than I had built coordination.

The next agent I add will have to earn its place in the workplane.

When did adding the next agent create more review work than useful output for you?

## Sources

- [The AI Agent Every Company is About to Build, Guillermo Rauch](https://youtu.be/HQXi4snP36I)
- [Vercel Ship: Opening Keynote, Agentic Infrastructure](https://vercel.com/ship/nyc/session/agentic-infrastructure)
- [Vercel: Introducing eve](https://vercel.com/blog/introducing-eve)
- [Vercel Ship 2026 recap](https://vercel.com/blog/vercel-ship-2026-recap)
- [Vercel eve repository](https://github.com/vercel/eve)
- [Google ADK: Session, State, and Memory](https://adk.dev/sessions/)
- [Google ADK: Agent routing](https://adk.dev/agents/routing/)
- [Google ADK: Evaluation](https://adk.dev/evaluate/)
- [OpenAI Agents SDK: Multi-agent orchestration](https://openai.github.io/openai-agents-python/multi_agent/)
- [OpenAI Agents SDK: Guardrails](https://openai.github.io/openai-agents-python/guardrails/)
- [LangGraph overview](https://langchain-ai.github.io/langgraph/)
- [Model Context Protocol specification](https://modelcontextprotocol.io/specification/2025-03-26/basic/index)
- [Agent2Agent protocol specification](https://google-a2a.github.io/A2A/specification/)


===== runs/active/2026-08-08-agent-coordination/draft-package.md =====

# Content Package: I Built More Agents. The Work Got Harder.

**Status:** Draft for human review

**Primary article:** [article.md](./article.md)

**Core audience:** Founders, engineering leaders, platform teams, and operators moving from one useful agent to a coordinated system.

**Core question:** When did adding the next agent create more review work than useful output?

## Package angle

An "agent" here means an AI program that can carry out tasks on its own, such as researching, writing, or running code. The first agent takes execution work off your plate. The second one reveals the coordination work that was hiding underneath: keeping the agents informed, in bounds, and in agreement.

Vercel's eve, Vercel's product for running agents, is a useful playbook for making one agent reliable. It can pause and resume safely, run in a protected space, get human sign-off, and ship changes. The next layer belongs to the company, not the vendor: a shared set of rules and a shared workspace, which I call a workplane. It carries who each agent is, what it knows, what it may do, how work passes between agents, who approves risky actions, what proof gets kept, and how quality gets measured. Those rules should hold no matter which vendor platform runs underneath.

The personal proof is a dated inventory of my own setup: 13 harnesses, the software shells that run agents; 12 model IDs, specific versions of AI models; 48 agent definitions; 390 skills, saved instruction sets agents can load; and 27 MCP servers, connectors built on Model Context Protocol, a standard way to plug agents into tools and data. The numbers are a lived snapshot, not a benchmark. The story is what happens when the agents' output grows faster than one human's ability to coordinate it.

## Podcast package

### Episode title

I Built More Agents. The Work Got Harder.

### Alternate titles

- Your Agents Are Not a Team Until They Share Work State
- The Agent Stack Is Missing a Coordination Layer
- The Second Agent Is Where the Real System Starts

### One-line logline

I thought I was building an agent team. Instead, I became the messenger, the memory, the approval desk, and the record-keeper between programs that could not talk to each other.

### Episode description

Vercel's Guillermo Rauch describes a shift in software: machines, not just people, doing the actual work. I believe that shift, and I have also felt the part that demos skip.

The first agent is easy to celebrate. The second agent forces harder questions: Which information travels with the task? Which decision counts as final? Who owns the handoff when one agent passes work to another? What is the next agent allowed to do? What happens when a run pauses or fails? I have seen those unanswered questions turn a useful collection of agents into a full-time coordination job for one human.

In this episode, I use Vercel's eve, Google ADK, Google's Agent Development Kit, OpenAI's Agents SDK, OpenAI's toolkit for building agents, LangGraph, a lower-level framework for custom agent systems, MCP, and A2A, an agent-to-agent communication standard, to map the pieces. Then I explain the framework I recently put together, which works the same no matter which platform is underneath: Establish, Operate, Compound. The recommendation is deliberately small: one front door where all requests come in, one router that assigns work, three workers with clear limits, information the agents can read but not change, human approval before anything gets modified, and a test that the whole setup survives a platform swap, all before the system earns more independence.

### Cold open

I watched a Vercel talk about the agent every company is about to build, and then I made a presentation about it. The talk made one agent look easier to ship. My first reaction was excitement. My second was recognition.

I already knew how to make one agent run. My pain started when the second agent needed the first one's context, the third needed the decision they made, and I became the person carrying the whole story between them.

The models were getting smarter. The system was getting harder to operate.

### Episode arc

1. The Vercel thesis: the machine becomes a working member of production, and the infrastructure around it has to change.
2. The firsthand turn: my own agent inventory and the hidden human coordination cost behind it.
3. The handoff failure: short summaries lose the details that mattered, full transcripts bury the point, and one agent's private notes get mistaken for shared truth.
4. The framework map: what eve, ADK, OpenAI Agents SDK, LangGraph, MCP, and A2A each contribute.
5. The recommendation: the company should own the rules of engagement, the intelligence contract, above whichever platform runs the agents.
6. The practical starting version: Establish, Operate, Compound, with proof required at every step up.

### Host notes

- Keep the first person active. Use the stack count as evidence, then return to the human cost.
- Give each framework one fair sentence about the problem it handles.
- Describe the Workplane as a synthesis and recommendation, not as an existing standard.
- Say "runtime-neutral," meaning it works on any platform, when discussing the private Cordant framework. Avoid naming private recipients in the public episode unless approved.
- End with the question about review work, then leave room for listener examples.

### Closing

I built more agents. The work got harder because I built the doing faster than I built the coordinating.

The next agent I add will have to earn its place in the workplane.

When did adding the next agent create more review work than useful output for you?

## LinkedIn feed post

I built more agents. The work got harder.

The first one removed execution work. The second one exposed the coordination work I had been ignoring.

I carried context between runs, translated one agent's output for another, tracked approvals, and remembered which decision changed in which thread.

In one late-July inventory of my own setup, I counted:

13 harnesses;
12 model IDs;
48 agent definitions
390 skills;
27 MCP servers.

That is a snapshot, not a benchmark. It is also a warning: the doing can scale faster than the reviewing.

Vercel's eve is a useful answer for one agent in production: pause-and-resume work, safe sandboxes, human approvals, activity logs, quality checks, and Git-tracked changes.

The next problem is coordination.

Who owns the task? What context is safe? Who approves the action? What proves the result?

My recommendation is an Agent Workplane, a shared coordination layer that can sit above eve, ADK, OpenAI Agents SDK, LangGraph, or a homegrown runner:

Establish the contract.
Operate one front door and a few specialists with clear limits.
Compound only after evidence earns more independence.

The machine can become the actor. The company still has to own the operating model around it.

When did adding the next agent create more review work than useful output for you?

### LinkedIn first comment

I wrote the full first-person podcast article here: [ARTICLE URL]

The short version: the durable asset is the intelligence contract, not the platform. Who each agent is, what it remembers, what it may touch, who approves what, the receipts that prove what happened, the quality checks, and the work products should all survive a change of model or framework.

## X / Twitter thread

### Post 1

I built more agents. The work got harder.

The first agent removed execution work.

The second exposed the coordination work I had been ignoring.

### Post 2

I have seen this firsthand: one agent researches, another plans, a third drafts, and a reviewer checks the result.

Then one human carries the context between all of them.

### Post 3

In a late-July inventory of my setup I counted 13 harnesses, 12 model IDs, 48 agent definitions, 390 skills, and 27 MCP servers, tool connectors for agents.

That is a lived snapshot, not a benchmark.

It is also a warning.

### Post 4

Every missing coordination rule becomes a human task:

Which context travels?
Who owns the handoff?
What can the next agent do?
Who approves the action?

### Post 5

Vercel's eve is a strong playbook for one production agent: pause-and-resume workflows, safe sandboxes, approvals, helper agents, activity logs, quality checks, and Git-tracked changes.

The next problem starts after one agent works.

### Post 6

Google ADK separates the current session, working state, and long-term memory.

OpenAI's Agents SDK makes "manager assigns" versus "agent hands off" explicit.

LangGraph gives teams a lower-level durable runtime.

They are converging on the same problem.

### Post 7

My recommendation: own the intelligence contract above the platform.

Identity. Context boundaries. Tools. Policy. Approvals. Audit receipts. Quality checks. Work products.

Change the platform without losing the company's memory.

### Post 8

Start with one front door, one router, three workers with clear limits, read-only context, approval before anything changes, and zero unreviewed actions with outside consequences.

Earn independence with evidence.

### Post 9

The machine can become the actor.

The company still has to own the operating model around that actor.

When did adding the next agent create more review work than useful output for you?

### Post 10

Full article: [ARTICLE URL]

Sources and the platform-neutral framework are included there.

## Reddit package

### Suggested subreddit

r/AI_Agents, r/LocalLLaMA, or a relevant engineering community after checking each community's self-promotion rules.

### Title

I think multi-agent systems are missing a coordination layer

### Body

I have been building and operating enough agent workflows to hit a problem that does not show up in most demos.

The first agent is straightforward. Give it a task, inspect the output, tune the instructions, run it again.

The second agent changes the job. Now I need to decide which agent gets the task, what background information it receives, which tools it can use, what it is allowed to change, and what the next agent can trust from it.

In my own environment, a late-July inventory showed 13 harnesses, the shells that run agents; 12 model IDs; 48 agent definitions; 390 skills, saved instruction sets; and 27 MCP servers, connectors that give agents access to tools and data. That is a personal snapshot, not a benchmark. The important part is the coordination cost behind it. I became the router, the memory, the permission check, and the audit trail.

The handoff between agents usually fails in one of four ways:

1. A short summary drops the qualification that mattered.
2. A huge transcript keeps everything and communicates scope poorly.
3. A human restates one agent's output for another.
4. One agent's private notes get treated as shared truth.

Vercel's eve is interesting because it handles the production shape of an individual agent: workflows that can pause and resume, sandboxed execution, human approvals, helper sub-agents, activity traces, quality evals, and changes tracked in Git. Google ADK's separation of session, working state, and long-term memory is useful for the same reason. OpenAI's Agents SDK makes the two handoff styles explicit: a manager agent that delegates, or a direct transfer of control. LangGraph gives a lower-level durable runtime for teams building custom agent graphs.

My current recommendation is a thin coordination layer above those runtimes. I call it an Agent Workplane. It owns the intelligence contract, the standing rules every agent works under:

- charter and owner, what the agent is for and who is responsible for it;
- context and source lineage, what it knows and where that knowledge came from;
- tool permissions;
- handoff and task state, where the work stands and who has it;
- approvals and audit receipts, who signed off and the proof;
- evals and artifacts, quality checks and the work products themselves;
- portability across runtimes, the ability to swap the platform without losing any of the above.

The first proof should stay small: one front door, one router, three workers with clear limits, context the agents can read but not change, and human approval before anything gets written. If the system cannot preserve identity, scope, approval, evidence, and business memory through a real workflow, adding more agents will just grow the review queue.

Curious how other teams are handling this. Where do you keep the task envelope, the durable memory, the permissions, and the approval state? What did you build yourself, and what did your runtime provide?

## Blog and CMS package

**Title:** I Built More Agents. The Work Got Harder.

**Slug:** `i-built-more-agents-the-work-got-harder`

**Excerpt:** The first agent removes execution work. The second exposes the missing coordination layer: shared context, permissions, handoffs, approvals, and proof.

**Meta description:** The first agent removes execution work. The second exposes the missing coordination layer: shared context, permissions, handoffs, approvals, and proof.

**Primary CTA:** Read the full framework and compare it with your own agent stack.

**Suggested URL:** `https://growthalchemylab.com/blog/i-built-more-agents-the-work-got-harder`

**Internal links to add later:**

- Agent context and memory article
- Agent operations and approval layer article
- MemroOS or durable knowledge article

## Distribution sequence

1. Publish the first-person article with the six-question coordination test visible near the end.
2. Publish the LinkedIn post natively. Put the article URL in the first comment.
3. Publish the X thread within the same day, using the personal stack count as the proof point.
4. Record the podcast episode from the cold open and six-part arc.
5. Post the Reddit version only in communities where the question and implementation details add value without requiring the article click.
6. Use listener replies to collect real failure modes, then publish a follow-up: "What breaks after the second agent?"

## Content safety and voice notes

- Keep the stack numbers dated and personal. Do not present them as an industry benchmark.
- Keep the Agent Workplane clearly labeled as a recommendation and synthesis.
- Use the exact Vercel video and official eve sources for public claims.
- Do not expose private Drive links, client names, or recipient names in public copy without approval.
- Keep vendor references specific and fair. No framework is presented as the universal winner.
- Preserve the first-person operator lens. The human coordination cost is the emotional center of the package.


===== runs/active/2026-08-08-agent-coordination/media-plan.md =====

# Media Plan: I Built More Agents. The Work Got Harder.

**Status:** Direction for production

**Visual thesis:** One human is standing between several capable agents because the workplane is missing. The image should show coordination as the problem, not robots as the spectacle.

## Primary article hero

### Concept

A dark editorial systems diagram. On the left, three small agent workstations labeled Research, Draft, and Build. On the right, one shared workplane with visible fields for Context, Policy, Approval, and Evidence. In the middle, a single human silhouette is carrying loose cards between the workstations. The final version should show the cards moving into the workplane, leaving the human out of the message-bus role.

### Composition

- Wide 16:9 canvas with generous negative space for a headline crop.
- Three small, distinct work nodes on the left.
- One clear router and workplane in the center-right.
- Human figure small and slightly off-center, carrying a stack of context cards.
- No glowing robot heads, humanoid faces, sci-fi server rooms, or generic circuit-board backgrounds.

### Palette

- Ink / charcoal background.
- Warm white type.
- Electric lime for the contract and trusted path.
- Amber for research and uncertainty.
- Coral for approval gates and risky side effects.
- Muted blue for durable memory and source lineage.

### Overlay copy options

1. I BUILT MORE AGENTS. THE WORK GOT HARDER.
2. THE SECOND AGENT IS WHERE THE REAL SYSTEM STARTS.
3. YOUR AGENTS NEED A WORKPLANE.

### Alt text

An editorial systems diagram shows research, draft, and build agents handing context through a central workplane with routing, policy, approval, and evidence, while one human moves from carrying messages to reviewing the system.

## Podcast cover

### Concept

Large type first. A split composition shows a stack of agent cards on one side and a single overloaded review queue on the other. A thin lime line connects them through a labeled box: WORKPLANE.

### Required copy

- Main: I BUILT MORE AGENTS.
- Secondary: THE WORK GOT HARDER.
- Small label: AGENT COORDINATION / FIELD NOTE

### Specs

- 3000 x 3000 px master.
- Keep all important text inside the center 70 percent for podcast app crops.
- Export square PNG and JPG.
- Create a text-free master for future episode variants.

## Framework graphic

### Title

The Agent Workplane: Establish, Operate, Compound

### Diagram structure

```text
INTELLIGENCE CONTRACT
charter | identity | context | tools | policy | approvals | evals | artifacts
                              |
ONE FRONT DOOR -> ROUTER -> BOUNDED WORKERS
                              |
                    evidence | audit receipt
                              |
                    events -> feedback -> portability
```

### Graphic labels

- Establish: charter, one useful job, scoped context.
- Operate: front door, router, specialists, governance.
- Compound: events, evals, feedback, runtime portability.
- Gate language: baseline, least privilege, attributable effects, safe replay, measurable uplift, clean migration.

### Alt text

A three-stage agent operating model moves from a company-owned intelligence contract to a front door and bounded specialists, then to events, evals, feedback, and runtime portability.

## Social crops

### LinkedIn

- 1200 x 627 px landscape.
- Use the personal stack count as a visual index: 13 / 12 / 48 / 390 / 27.
- Caption-safe negative space on the right.

### X

- 1600 x 900 px landscape.
- Use the line: "The first agent is a product. The second is an organization problem."

### Instagram / Shorts cover

- 1080 x 1350 px portrait.
- Keep the headline to two short lines.
- Use the human carrying context cards as the recognizable motif.

## Production guardrails

- The visual must communicate systems design and human workload.
- Avoid the usual AI visual vocabulary: robot faces, blue brains, neon code rain, glowing circuits, and anonymous server aisles.
- Do not render vendor logos as endorsements. Use plain text labels or a separate source card.
- Use high contrast and large type. The main idea should survive a small mobile crop.


===== runs/active/2026-08-08-agent-coordination/source-map.md =====

# Source Map: Agent Coordination Layer

**Research date:** 2026-08-08

**Use:** Claim control for the article, podcast, and derived distribution copy.

**Editorial rule:** Public facts are sourced inline. The Agent Workplane and the Establish / Operate / Compound framing are the author's synthesis and should be labeled as recommendation.

## Lead source

| Source | Evidence used | Editorial treatment |
|---|---|---|
| [The AI Agent Every Company is About to Build](https://youtu.be/HQXi4snP36I) by Guillermo Rauch | Video identified in the recovered presentation as the talk that prompted the framework. | First-person trigger. Do not pretend the article is a transcript of the video. |
| [Vercel Ship: Opening Keynote, Agentic Infrastructure](https://vercel.com/ship/nyc/session/agentic-infrastructure) | Vercel describes the shift from a human actor to a machine actor and lists Guillermo Rauch, Malte Ubl, Shar Dara, and other speakers. | Supports the public framing of the talk. |

## Framework source recovered from connected Drive

These are private working presentations. They are evidence for the author's own framework, not public vendor documentation.

| Presentation | Retrieved | Distilled design decisions |
|---|---:|---|
| Cordant Phased Agent Plan - Runtime Neutral | 2026-08-08 | Own the intelligence contract; treat the runtime as an adapter; move through charter, one useful job, scoped context, front door, specialists, governance, events, evals, and portability. |
| Cordant Agent Implementation Roadmap - Tool Agnostic | 2026-08-08 | Establish / Operate / Compound; one front door, one router, bounded workers; least-privilege context; read-only first use case; approval for writes; audit receipts; 20-hour fit test; 90-day sequence. |

The public package uses these ideas without exposing Drive URLs, private recipients, or client-specific names.

## Public claim matrix

| Claim in package | Primary source | Confidence | Caveat |
|---|---|---:|---|
| Vercel's talk frames production software as gaining a machine actor. | Vercel Ship session page and source video. | High | The article summarizes the talk's public framing; it is not a transcript. |
| eve grew from repeated agent production plumbing and packages durable execution, sandboxes, approvals, subagents, channels, traces, evals, and Git-based changes. | [Introducing eve](https://vercel.com/blog/introducing-eve). | High | Keep the beta qualifier from the project documentation. |
| eve uses a filesystem-first agent shape with Markdown instructions and TypeScript tools. | [eve repository](https://github.com/vercel/eve). | High | Describe the current repository shape, not a permanent product guarantee. |
| Google ADK distinguishes session, session state, and longer-lived memory. | [ADK sessions](https://adk.dev/sessions/). | High | The article uses this as an architectural distinction, not a claim that ADK is the only way to implement it. |
| ADK documents routing and evaluation as explicit parts of agent work. | [ADK routing](https://adk.dev/agents/routing/) and [ADK evaluation](https://adk.dev/evaluate/). | High | Keep wording close to the documentation. |
| OpenAI's Agents SDK makes manager-style orchestration and handoffs distinct. | [Agents SDK multi-agent orchestration](https://openai.github.io/openai-agents-python/multi_agent/). | High | The choice affects control ownership and should be explained as a design decision. |
| OpenAI's SDK documents guardrails and tracing. | [Agents SDK guardrails](https://openai.github.io/openai-agents-python/guardrails/). | High | Do not imply guardrails alone solve organizational policy. |
| LangGraph provides a low-level runtime for durable execution, persistence, streaming, and human-in-the-loop workflows. | [LangGraph overview](https://langchain-ai.github.io/langgraph/). | High | It is a runtime option, not the recommended universal answer. |
| MCP exposes tools, resources, and prompts through a common protocol. | [MCP basic specification](https://modelcontextprotocol.io/specification/2025-03-26/basic/index). | High | The article uses MCP as a capability interface, not as a complete governance model. |
| A2A addresses agent discovery and task exchange. | [A2A specification](https://google-a2a.github.io/A2A/specification/). | High | Agent interoperability does not determine ownership, authority, or approval. |

## Framework comparison

| System | What it contributes | What remains outside it for this article |
|---|---|---|
| Vercel eve | Durable agent sessions, sandboxes, approvals, subagents, channels, traces, evals, Git workflow. | Shared organizational contract across multiple agents and runtimes. |
| Google ADK | Explicit session/state/memory concepts, routing, workflow patterns, evaluation. | Company-wide ownership, portable business memory, and policy across runtime boundaries. |
| OpenAI Agents SDK | Manager versus handoff orchestration, guardrails, sessions, human approval, tracing. | Durable cross-runtime intelligence contract and institutional work state. |
| LangGraph | Low-level durable graph runtime, persistence, streaming, human-in-the-loop. | The company's portable identity, source lineage, governance, and business memory model. |
| MCP | Shared tool, resource, and prompt interface. | Who may use a capability for a specific task and who approves the result. |
| A2A | Agent discovery and task lifecycle between independent agents. | Organization-specific permissions, evidence standards, and human accountability. |

## Synthesis boundaries

The following are recommendations, not claims that a source already defines a product:

- The Agent Workplane should sit above the runtime.
- The company should own an intelligence contract containing identity, mandate, context boundaries, tools, approvals, audit receipts, evals, and artifacts.
- Establish / Operate / Compound is the preferred rollout sequence for this package.
- One front door, one router, and three bounded workers is a useful v0 test.
- Runtime portability should be treated as an exit gate for business memory and governance, not as a marketing feature.

## Personal evidence boundaries

- The inventory of 13 harnesses, 12 model IDs, 48 agent definitions, 390 skills, and 27 MCP servers is a dated personal snapshot from the author's own operating environment.
- It should never be presented as an industry statistic, benchmark, or universal architecture.
- The account-research example, 10 to 20 named accounts and five source-backed dossiers, comes from the private working framework and should stay generic in public copy.
- The article should use first person for these observations and avoid claiming access to another team's internal architecture.

## Citation checklist

- [x] Exact YouTube source recovered and linked.
- [x] Official Vercel session page linked.
- [x] eve launch and repository linked.
- [x] ADK sessions, routing, and evaluation linked.
- [x] OpenAI orchestration and guardrails linked.
- [x] LangGraph, MCP, and A2A linked.
- [x] Private framework separated from public claims.
- [x] Recommendation labeled as synthesis.

