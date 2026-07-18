---
title: "Recovered research — context (session 20260506_180320_6277f6)"
description: "Backfill from research-without-persist detector. Original session produced research/analysis content but never called mcp_memroos_knowledge_write. Recovered 2026-07-18 by the daily research-persist audit cron."
publishedAt: "2026-07-18"
tags: [recovery, research-without-persist, backfill]
keywords: [memroos, persist-failure, recovery, context]
author: "Alba [bot]"
source_session: "20260506_180320_6277f6"
model: "minimax-m3"
sources:
  - "label:research-without-persist-detector"
  - "file://~/.hermes/sessions/20260506_180320_6277f6.jsonl"
derived_from:
  - "content/research/memroos-persist-failure-rca-2026-07-05.md"
regen_prompt: "Read session ~/.hermes/sessions/20260506_180320_6277f6.jsonl, extract the largest assistant-side structured content block, and write a recovery markdown describing what the session produced and why it was missed."
---

# Recovered Research — context

**Source session:** `20260506_180320_6277f6`
**Recovered:** 2026-07-18 (daily research-persist audit cron)
**Trigger:** research-without-persist detector flagged this session as having produced research-grade output without calling `mcp_memroos_knowledge_write`.

## Original research content (excerpt)

> First 2076 characters of the largest assistant-side structured block recovered from the session transcript.

```
Reworked it benefits-first, features second, and in first person. Landscape video is attached again, plus the updated HTML preview.

MEDIA:/Users/lcalderon/Downloads/agent-kitchen-launch-video/renders/agent-kitchen-demo-rev11-firstscreen-longer.mp4

MEDIA:/Users/lcalderon/Downloads/agent-kitchen-launch-video/renders/agent-kitchen-social-preview-rev12-benefits-first.html

**X Post**
```text
I built Agent Kitchen so agents learn across harnesses, not reset every run.

Benefit: memory + auto-regression, lower token spend via the right model, and interop with whatever wins next.

Features: skills, orchestration, approvals, visibility.

github.com/lac5q/agent-kitchen
```

**LinkedIn Post**
```text
I built Agent Kitchen because agent ops has a memory problem.

Every harness is becoming its own island. Claude, Codex, OpenClaw, Hermes, local machines, cloud boxes, whatever ships next. They all create useful context, then too much of that learning dies inside the tool that created it.

The benefit: make agent work compound.

Memory and automatic regression learning should travel across harnesses. If one agent learns a workflow, fixes a failure, passes an approval, or discovers a pattern, the next agent should not start from zero.

It should also save tokens. Use the best model for the job, not the same expensive model for every step: cheap model for routine work, strong model for hard judgment, same operating layer underneath.

And it should stay interoperable with whatever is cool six months from now. Agents are moving too fast to bet on one interface, one model, or one machine.

Features:
- Shared memory across agents and harnesses
- Skills as repeatable recipes
- Orchestration across any agent, LLM, and machine
- Human approvals for sensitive steps
- Visibility, health checks, and audit trails
- Local-first, scalable, free, open source

The metaphor is a professional kitchen: memory is the pantry, skills are recipes, orchestration is the expo pass, and every agent gets a station.

Beta is live. Feedback wanted.

github.com/lac5q/agent-kitchen
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
the Hermes session log at `~/.hermes/sessions/20260506_180320_6277f6.jsonl`; this file
exists so the durable knowledge base has at least a pointer to what the
session produced. Future readers can consult the source session file for
the full transcript.
