---
title: "Recovered research — context (session 20260423_123953_cd05ad)"
description: "Backfill from research-without-persist detector. Original session produced research/analysis content but never called mcp_memroos_knowledge_write. Recovered 2026-07-18 by the daily research-persist audit cron."
publishedAt: "2026-07-18"
tags: [recovery, research-without-persist, backfill]
keywords: [memroos, persist-failure, recovery, context]
author: "Alba [bot]"
source_session: "20260423_123953_cd05ad"
model: "minimax-m3"
sources:
  - "label:research-without-persist-detector"
  - "file://~/.hermes/sessions/20260423_123953_cd05ad.jsonl"
derived_from:
  - "content/research/memroos-persist-failure-rca-2026-07-05.md"
regen_prompt: "Read session ~/.hermes/sessions/20260423_123953_cd05ad.jsonl, extract the largest assistant-side structured content block, and write a recovery markdown describing what the session produced and why it was missed."
---

# Recovered Research — context

**Source session:** `20260423_123953_cd05ad`
**Recovered:** 2026-07-18 (daily research-persist audit cron)
**Trigger:** research-without-persist detector flagged this session as having produced research-grade output without calling `mcp_memroos_knowledge_write`.

## Original research content (excerpt)

> First 987 characters of the largest assistant-side structured block recovered from the session transcript.

```
Locked in. Here's the situation:

**Can't auto-post right now** — no social accounts are connected:
- LinkedIn: not logged in on browser
- X/Twitter (xurl): not authenticated
- Upload-Post API: no platforms linked

**Your launch package (ready to copy/paste):**

📄 **Post copy:** `~/Downloads/linkedin-post-claude-dangerous.txt`

🖼️ **Danger zone image:** `~/Downloads/claude-code-danger-zone.png`

📰 **Full article HTML:** `~/github/cordant/claude-dangerous-article-preview.html`

---

**To launch manually:**
1. Open LinkedIn → "Start a post"
2. Copy text from `~/Downloads/linkedin-post-claude-dangerous.txt`
3. Attach `~/Downloads/claude-code-danger-zone.png`
4. Hit post

---

**Want me to set up auto-posting for next time?** I can:
- Walk you through connecting LinkedIn to Upload-Post API (one-time setup)
- Or authenticate xurl for X/Twitter posting
- Then future articles post with one command

Your call — manual launch now, or invest 2 minutes in setup for future automation?
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
the Hermes session log at `~/.hermes/sessions/20260423_123953_cd05ad.jsonl`; this file
exists so the durable knowledge base has at least a pointer to what the
session produced. Future readers can consult the source session file for
the full transcript.
