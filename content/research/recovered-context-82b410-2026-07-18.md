---
title: "Recovered research — context (session 20260507_015810_82b410)"
description: "Backfill from research-without-persist detector. Original session produced research/analysis content but never called mcp_memroos_knowledge_write. Recovered 2026-07-18 by the daily research-persist audit cron."
publishedAt: "2026-07-18"
tags: [recovery, research-without-persist, backfill]
keywords: [memroos, persist-failure, recovery, context]
author: "Alba [bot]"
source_session: "20260507_015810_82b410"
model: "minimax-m3"
sources:
  - "label:research-without-persist-detector"
  - "file://~/.hermes/sessions/20260507_015810_82b410.jsonl"
derived_from:
  - "content/research/memroos-persist-failure-rca-2026-07-05.md"
regen_prompt: "Read session ~/.hermes/sessions/20260507_015810_82b410.jsonl, extract the largest assistant-side structured content block, and write a recovery markdown describing what the session produced and why it was missed."
---

# Recovered Research — context

**Source session:** `20260507_015810_82b410`
**Recovered:** 2026-07-18 (daily research-persist audit cron)
**Trigger:** research-without-persist detector flagged this session as having produced research-grade output without calling `mcp_memroos_knowledge_write`.

## Original research content (excerpt)

> First 4261 characters of the largest assistant-side structured block recovered from the session transcript.

```
Using skill: professional-content-creation + postpeer. Finished it as **rev24**. Preview only, nothing posted/scheduled.

HTML preview:
MEDIA:/Users/lcalderon/Downloads/agent-kitchen-social-preview-rev24.html

Screenshot of the HTML preview:
MEDIA:/Users/lcalderon/Downloads/agent-kitchen-social-preview-rev24.png

Markdown/copy file:
MEDIA:/Users/lcalderon/Downloads/agent-kitchen-social-preview-rev24.md

Final hero video attached to both:
MEDIA:/Users/lcalderon/Downloads/agent-kitchen-launch-video/renders/agent-kitchen-demo-rev22-agent-lightning-clear.mp4

I verified:
- Opens with **burning 5B+ tokens a week**
- Says it’s a **working open-source project evolving in public**
- Includes **Microsoft Agent Lightning**
- Includes **GitNexus**
- Has the **hero video** in the HTML preview
- X thread tweets are all under 280 chars
- Engagement ask: “Like if you think it’s cool. Comment if this ate, or if you have feedback.”

**LinkedIn preview**
```text
I’ve been burning 5B+ tokens a week across agents, tools, terminals, repos, and workflows.

At that scale, the problem stops being “which model is smartest?”

The problem becomes: where does all that work go?

Memory is scattered. Skills are buried. Repo knowledge is stale. Approvals are manual. Training loops are disconnected from real execution. Every harness has its own worldview.

So I built Agent Kitchen.

It is a working, free, open-source project that gives agents the whole kitchen sink:

• memory and shared knowledge
• skills and reusable procedures
• orchestration and routing
• human approvals and audit trails
• visibility across agents, LLMs, and machines
• Progressive MCP as the pass layer
• GitNexus for repo knowledge
• Microsoft Agent Lightning for trace-driven training and improvement loops

The point is simple:

Any agent.
Any LLM.
Any machine.
One kitchen.

This is not finished software pretending to be a polished platform. It is a working project that will evolve in public over time.

I built it because I do not want every model, harness, and machine to start from zero. I want agents that learn across runs, understand the repo before touching it, reuse skills, route work to the right model, and still keep a human operator in control.

Would love feedback from builders, agent-framework people, infra folks, and anyone trying to run more than one serious agent.

Like if you think it’s cool.
Comment if this ate, or if you have feedback.

Repo:
https://github.com/lac5q/agent-kitchen

Microsoft Agent Lightning:
https://github.com/microsoft/agent-lightning

Short demo video attached.
```

**X thread preview**
```text
1/ I’ve been burning 5B+ tokens a week across agents, tools, terminals, repos, and workflows.

At that scale the problem stops being “which model is smartest?”

The problem becomes: where does all that work go?
```

```text
2/ Memory is scattered.
Skills are buried.
Repo knowledge is stale.
Approvals are manual.
Training loops are disconnected.
Every harness has its own worldview.

So I built Agent Kitchen.
```

```text
3/ Agent Kitchen is the whole kitchen sink for agent ops:

memory, skills, orchestration, approvals, visibility, audit, and shared context for any agent, any LLM, any machine.
```

```text
4/ The stack:

Progressive MCP is the pass layer.
GitNexus gives agents repo knowledge before code changes.
Microsoft Agent Lightning adds trace-driven training and improvement loops.
mem0 + QMD carry reusable memory.
```

```text
5/ This is a working project, not finished software pretending to be a polished platform.

It will evolve in public over time.

The goal: agents that improve across runs without losing human operator control.
```

```text
6/ Why I care:

I do not want every model and harness to start from zero.

Agents should learn across runs, reuse skills, understand the repo, route work to the right model, and keep the human in the loop.
```

```text
7/ Free. Open source. Self-hosted.

Local when useful.
Networked when needed.

Built for real multi-agent work, not demo theater.

Repo:
https://github.com/lac5q/agent-kitchen
```

```text
8/ Feedback welcome.

Like if you think it’s cool.
Comment if this ate, or if you have feedback.

Microsoft Agent Lightning:
https://github.com/microsoft/agent-lightning
```
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
the Hermes session log at `~/.hermes/sessions/20260507_015810_82b410.jsonl`; this file
exists so the durable knowledge base has at least a pointer to what the
session produced. Future readers can consult the source session file for
the full transcript.
