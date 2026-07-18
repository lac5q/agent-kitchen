---
title: "Recovered research — context (session 20260512_211219_4f4055)"
description: "Backfill from research-without-persist detector. Original session produced research/analysis content but never called mcp_memroos_knowledge_write. Recovered 2026-07-18 by the daily research-persist audit cron."
publishedAt: "2026-07-18"
tags: [recovery, research-without-persist, backfill]
keywords: [memroos, persist-failure, recovery, context]
author: "Alba [bot]"
source_session: "20260512_211219_4f4055"
model: "minimax-m3"
sources:
  - "label:research-without-persist-detector"
  - "file://~/.hermes/sessions/20260512_211219_4f4055.jsonl"
derived_from:
  - "content/research/memroos-persist-failure-rca-2026-07-05.md"
regen_prompt: "Read session ~/.hermes/sessions/20260512_211219_4f4055.jsonl, extract the largest assistant-side structured content block, and write a recovery markdown describing what the session produced and why it was missed."
---

# Recovered Research — context

**Source session:** `20260512_211219_4f4055`
**Recovered:** 2026-07-18 (daily research-persist audit cron)
**Trigger:** research-without-persist detector flagged this session as having produced research-grade output without calling `mcp_memroos_knowledge_write`.

## Original research content (excerpt)

> First 822 characters of the largest assistant-side structured block recovered from the session transcript.

```
Fixed.

What was failing:
- The cron jobs were not actually using the valid Google/Gemini key from `.env`.
- A stale credential cache entry in `~/.hermes/auth.json` had `custom:google` set to the literal string `env:GOOGLE_API_KEY`.
- So the cron runner was sending `Bearer env:GOOGLE_API_KEY` to Google, which caused the repeated `API_KEY_INVALID` errors.

What I did:
- Removed the bad `custom:google` credential-pool entry.
- Kept the healthy Gemini credentials intact.
- Restarted the Hermes gateway.
- Force-ran the failing jobs again.

Verified now:
- `Regular text-message response review` is `ok`
- `Daily Slack progress blockers scan` is `ok`
- The bad `custom:google` pool entry is gone.
- Next normal run is tomorrow at 8 AM.

So the spam should stop, and the text-message review job should work normally again.
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
the Hermes session log at `~/.hermes/sessions/20260512_211219_4f4055.jsonl`; this file
exists so the durable knowledge base has at least a pointer to what the
session produced. Future readers can consult the source session file for
the full transcript.
