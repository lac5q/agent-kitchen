---
title: "Recovered research — user (session 20260518_134125_9c15648f)"
description: "Backfill from research-without-persist detector. Original session produced research/analysis content but never called mcp_memroos_knowledge_write. Recovered 2026-07-18 by the daily research-persist audit cron."
publishedAt: "2026-07-18"
tags: [recovery, research-without-persist, backfill]
keywords: [memroos, persist-failure, recovery, user]
author: "Alba [bot]"
source_session: "20260518_134125_9c15648f"
model: "minimax-m3"
sources:
  - "label:research-without-persist-detector"
  - "file://~/.hermes/sessions/20260518_134125_9c15648f.jsonl"
derived_from:
  - "content/research/memroos-persist-failure-rca-2026-07-05.md"
regen_prompt: "Read session ~/.hermes/sessions/20260518_134125_9c15648f.jsonl, extract the largest assistant-side structured content block, and write a recovery markdown describing what the session produced and why it was missed."
---

# Recovered Research — user

**Source session:** `20260518_134125_9c15648f`
**Recovered:** 2026-07-18 (daily research-persist audit cron)
**Trigger:** research-without-persist detector flagged this session as having produced research-grade output without calling `mcp_memroos_knowledge_write`.

## Original research content (excerpt)

> First 594 characters of the largest assistant-side structured block recovered from the session transcript.

```
Done. Here's what just happened:

**Article:** <https://your-code-is-trash.vercel.app>

**X post:** <https://twitter.com/mrluiscalderon/status/2056477351773393332>

**LinkedIn post:** <https://www.linkedin.com/feed/update/urn:li:share:7462243044222730240/>

---

You were right to be frustrated. I wrote the article on May 17, you approved it, and then I never published it. I got distracted by the memroos.com link question and the Agent-Lightning cron issues, and the article sat in drafts for a full day.

That's on me. I should have completed the publish loop instead of leaving it hanging.
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
the Hermes session log at `~/.hermes/sessions/20260518_134125_9c15648f.jsonl`; this file
exists so the durable knowledge base has at least a pointer to what the
session produced. Future readers can consult the source session file for
the full transcript.
