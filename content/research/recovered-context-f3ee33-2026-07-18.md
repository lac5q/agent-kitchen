---
title: "Recovered research — context (session 20260505_105331_f3ee33)"
description: "Backfill from research-without-persist detector. Original session produced research/analysis content but never called mcp_memroos_knowledge_write. Recovered 2026-07-18 by the daily research-persist audit cron."
publishedAt: "2026-07-18"
tags: [recovery, research-without-persist, backfill]
keywords: [memroos, persist-failure, recovery, context]
author: "Alba [bot]"
source_session: "20260505_105331_f3ee33"
model: "minimax-m3"
sources:
  - "label:research-without-persist-detector"
  - "file://~/.hermes/sessions/20260505_105331_f3ee33.jsonl"
derived_from:
  - "content/research/memroos-persist-failure-rca-2026-07-05.md"
regen_prompt: "Read session ~/.hermes/sessions/20260505_105331_f3ee33.jsonl, extract the largest assistant-side structured content block, and write a recovery markdown describing what the session produced and why it was missed."
---

# Recovered Research — context

**Source session:** `20260505_105331_f3ee33`
**Recovered:** 2026-07-18 (daily research-persist audit cron)
**Trigger:** research-without-persist detector flagged this session as having produced research-grade output without calling `mcp_memroos_knowledge_write`.

## Original research content (excerpt)

> First 1088 characters of the largest assistant-side structured block recovered from the session transcript.

```
You’re right. I updated the skill review so this is now a hard QA gate, not vibes.

Changed `luis-resume-rules` to require:
- Page 2 bottom whitespace is a **hard fail**
- Must measure rendered whitespace after final PDF render
- Must inspect the final PNG preview
- `scrollHeight`, page count, and “no overflow” alone are **not enough**
- Late patches that create overflow, stale PDFs, or third pages must be caught before sharing

I also added a deterministic checker:

```text
/Users/lcalderon/.hermes/skills/jobhunt/luis-resume-rules/scripts/measure_resume_whitespace.js
```

And I fixed the LPL resume again. Current QA passes:
- Resume: 2 pages
- Cover letter: 1 page
- Page 2 bottom whitespace: 27px
- No overflow or clipping
- No em dashes
- GitHub present
- Education dates removed
- Intuit on page 1

Revised resume:

```text
/Users/lcalderon/github/jobhunt/resumes-lpl-financial/Luis-Calderon-LPL-Financial-VP-AI-Innovation-Enablement-Leader.pdf
```

MEDIA:/Users/lcalderon/github/jobhunt/resumes-lpl-financial/Luis-Calderon-LPL-Financial-VP-AI-Innovation-Enablement-Leader.pdf
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
the Hermes session log at `~/.hermes/sessions/20260505_105331_f3ee33.jsonl`; this file
exists so the durable knowledge base has at least a pointer to what the
session produced. Future readers can consult the source session file for
the full transcript.
