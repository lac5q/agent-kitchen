---
title: "Recovered research — context (session 20260412_091508_2e1b0e4a)"
description: "Backfill from research-without-persist detector. Original session produced research/analysis content but never called mcp_memroos_knowledge_write. Recovered 2026-07-18 by the daily research-persist audit cron."
publishedAt: "2026-07-18"
tags: [recovery, research-without-persist, backfill]
keywords: [memroos, persist-failure, recovery, context]
author: "Alba [bot]"
source_session: "20260412_091508_2e1b0e4a"
model: "minimax-m3"
sources:
  - "label:research-without-persist-detector"
  - "file://~/.hermes/sessions/20260412_091508_2e1b0e4a.jsonl"
derived_from:
  - "content/research/memroos-persist-failure-rca-2026-07-05.md"
regen_prompt: "Read session ~/.hermes/sessions/20260412_091508_2e1b0e4a.jsonl, extract the largest assistant-side structured content block, and write a recovery markdown describing what the session produced and why it was missed."
---

# Recovered Research — context

**Source session:** `20260412_091508_2e1b0e4a`
**Recovered:** 2026-07-18 (daily research-persist audit cron)
**Trigger:** research-without-persist detector flagged this session as having produced research-grade output without calling `mcp_memroos_knowledge_write`.

## Original research content (excerpt)

> First 942 characters of the largest assistant-side structured block recovered from the session transcript.

```
Done — aborting. Here's the clean summary:

**Pinterest Pin Fix — Final Status**
- ✅ **169 pins fixed** and pointing to correct `/shared/{shortCode}` URLs
- ⏳ **48 pins remaining** — still pointing to old URLs

**What's blocking:** Chrome needs to be launched with `--remote-debugging-port=50220` from the terminal for Playwright CDP to connect. I can't get it to start listening on that port from this session (macOS app launching restrictions).

**To finish the last 48, you have two options:**

1. **You launch Chrome with debug mode**, then I run the script:
   ```
   /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=50220 --no-first-run
   ```
   Once it's open, tell me and I'll run `python3 fix-pins-ui-batch.py --apply --delay 10`. It'll take ~8 minutes.

2. **I give you a CSV** with the 48 pin IDs + target URLs so you can edit them manually or hand off to another agent.

Which works for you?
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
the Hermes session log at `~/.hermes/sessions/20260412_091508_2e1b0e4a.jsonl`; this file
exists so the durable knowledge base has at least a pointer to what the
session produced. Future readers can consult the source session file for
the full transcript.
