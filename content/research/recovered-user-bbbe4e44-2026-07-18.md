---
title: "Recovered research — user (session 20260422_161448_bbbe4e44)"
description: "Backfill from research-without-persist detector. Original session produced research/analysis content but never called mcp_memroos_knowledge_write. Recovered 2026-07-18 by the daily research-persist audit cron."
publishedAt: "2026-07-18"
tags: [recovery, research-without-persist, backfill]
keywords: [memroos, persist-failure, recovery, user]
author: "Alba [bot]"
source_session: "20260422_161448_bbbe4e44"
model: "minimax-m3"
sources:
  - "label:research-without-persist-detector"
  - "file://~/.hermes/sessions/20260422_161448_bbbe4e44.jsonl"
derived_from:
  - "content/research/memroos-persist-failure-rca-2026-07-05.md"
regen_prompt: "Read session ~/.hermes/sessions/20260422_161448_bbbe4e44.jsonl, extract the largest assistant-side structured content block, and write a recovery markdown describing what the session produced and why it was missed."
---

# Recovered Research — user

**Source session:** `20260422_161448_bbbe4e44`
**Recovered:** 2026-07-18 (daily research-persist audit cron)
**Trigger:** research-without-persist detector flagged this session as having produced research-grade output without calling `mcp_memroos_knowledge_write`.

## Original research content (excerpt)

> First 2560 characters of the largest assistant-side structured block recovered from the session transcript.

```
Here's the review — both posts are ready:

---

**📱 X Post:**
> I had 10 MCP servers with 300 tools.
>
> Before I asked my first question, my context window was already almost full.
>
> Then I watched this talk ↗
> https://www.youtube.com/watch?v=v3Fr2JR47KA
>
> At **6:00**, the Anthropic team shows exactly what I was doing wrong.
> At **12:00**, they show the fix.
> At **18:00**, they drop the roadmap for 2026.
>
> I didn't realize I was loading all 300 tools at session start. Every time. Not when I needed them. Before I even said hello.
>
> The fix: progressive discovery. Give the model a tool to find tools. It loads only what it needs, when it needs it.
>
> **stop loading everything.**
> **load only what you need, when you need it.**

+ lobster image

---

**💼 LinkedIn Post:**
> I built an MCP server for a side project last year.
> Then I added another one.
> Then another.
> At some point I had **10 servers, 300 tools total**, all loaded at session start.
>
> Then one day my agent just... stalled. Not an error. Just a long pause, then nothing useful.
> I thought the model was being lazy.
> It wasn't the model. It was me. I had burned through my context window before I even asked my first question.
> That was my "oh shit" moment.
>
> *(hr)*
>
> Then I watched the Anthropic team break it down in a talk on MCP and agentic AI.
> The talk walks through the problem step by step — watch from **6:00** for the moment it clicks ↗
> https://www.youtube.com/watch?v=v3Fr2JR47KA
>
> At **12:00** they explain the progressive discovery pattern.
> At **18:00** the roadmap drops — stateless transport, Python SDK v2, Skills over MCP, and server auto-discovery.
>
> *(hr)*
>
> The biggest mistake in agent building: loading every tool at session start.
> The fix isn't to add more context. It's to stop filling it up front.
>
> **Second insight: programmatic tool calling.**
> Instead of model → tool → result → model → tool → result, give the model an execution environment and let it write a script that composes tools in one shot.
>
> **What's coming in MCP (per the talk):**
> → Stateless transport (June)
> → Python SDK v2
> → Skills over MCP
> → Server auto-discovery
>
> 2026 is the year general agents go to production.
> The ones that work: agents that load only what they need, when they need it.
>
> What's your context window horror story? 👇
>
> #MCP #AgenticAI #AIagents #Anthropic #buildinginpublic

+ lobster image

---

Want me to restart the preview server so you can see them with the lobster image rendered, or just fire them now?
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
the Hermes session log at `~/.hermes/sessions/20260422_161448_bbbe4e44.jsonl`; this file
exists so the durable knowledge base has at least a pointer to what the
session produced. Future readers can consult the source session file for
the full transcript.
