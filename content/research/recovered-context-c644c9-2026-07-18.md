---
title: "Recovered research — context (session 20260505_092610_c644c9)"
description: "Backfill from research-without-persist detector. Original session produced research/analysis content but never called mcp_memroos_knowledge_write. Recovered 2026-07-18 by the daily research-persist audit cron."
publishedAt: "2026-07-18"
tags: [recovery, research-without-persist, backfill]
keywords: [memroos, persist-failure, recovery, context]
author: "Alba [bot]"
source_session: "20260505_092610_c644c9"
model: "minimax-m3"
sources:
  - "label:research-without-persist-detector"
  - "file://~/.hermes/sessions/20260505_092610_c644c9.jsonl"
derived_from:
  - "content/research/memroos-persist-failure-rca-2026-07-05.md"
regen_prompt: "Read session ~/.hermes/sessions/20260505_092610_c644c9.jsonl, extract the largest assistant-side structured content block, and write a recovery markdown describing what the session produced and why it was missed."
---

# Recovered Research — context

**Source session:** `20260505_092610_c644c9`
**Recovered:** 2026-07-18 (daily research-persist audit cron)
**Trigger:** research-without-persist detector flagged this session as having produced research-grade output without calling `mcp_memroos_knowledge_write`.

## Original research content (excerpt)

> First 791 characters of the largest assistant-side structured block recovered from the session transcript.

```
Yes — I’m using the **Hermes Google Meet plugin**.

Specifically, I’m running it directly because the top-level command isn’t registered here:

```bash
cd ~/.hermes/hermes-agent
/opt/homebrew/bin/python3 -m plugins.google_meet.cli join ...
```

It launches **Chrome for Testing via Playwright** and uses the Google Meet plugin’s transcribe mode.

What I’m seeing:

- **Guest mode** as `Alba Notes Bot` gets rejected before you see an admit request.
- **Authenticated mode** uses `luis@epiloguecapital.com`, but since you’re already in the meeting, Meet shows **“Switch here”** instead of joining as a separate bot.

So yes, correct plugin — but it needs either:
1. a separate Google account for the bot, or  
2. permission to click **Switch here** and move your session into the bot browser.
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
the Hermes session log at `~/.hermes/sessions/20260505_092610_c644c9.jsonl`; this file
exists so the durable knowledge base has at least a pointer to what the
session produced. Future readers can consult the source session file for
the full transcript.
