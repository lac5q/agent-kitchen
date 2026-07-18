---
title: "Recovered research — context (session 20260511_134857_ebd574)"
description: "Backfill from research-without-persist detector. Original session produced research/analysis content but never called mcp_memroos_knowledge_write. Recovered 2026-07-18 by the daily research-persist audit cron."
publishedAt: "2026-07-18"
tags: [recovery, research-without-persist, backfill]
keywords: [memroos, persist-failure, recovery, context]
author: "Alba [bot]"
source_session: "20260511_134857_ebd574"
model: "minimax-m3"
sources:
  - "label:research-without-persist-detector"
  - "file://~/.hermes/sessions/20260511_134857_ebd574.jsonl"
derived_from:
  - "content/research/memroos-persist-failure-rca-2026-07-05.md"
regen_prompt: "Read session ~/.hermes/sessions/20260511_134857_ebd574.jsonl, extract the largest assistant-side structured content block, and write a recovery markdown describing what the session produced and why it was missed."
---

# Recovered Research — context

**Source session:** `20260511_134857_ebd574`
**Recovered:** 2026-07-18 (daily research-persist audit cron)
**Trigger:** research-without-persist detector flagged this session as having produced research-grade output without calling `mcp_memroos_knowledge_write`.

## Original research content (excerpt)

> First 1630 characters of the largest assistant-side structured block recovered from the session transcript.

```
I see what happened. Let me clarify:

**I DID build the HTML dashboard today** (commit `334ab4b`). It didn't exist before that. The commit message says:

```
feat: add HTML artifacts layer to LLM wiki
- scripts/generate-artifacts.py: generator script for standalone HTML
- wiki/artifacts/wiki-dashboard.html: interactive dashboard (29 pages)
- wiki/artifacts/_templates/: template directory for new artifacts
- wiki/SCHEMA.md: updated with artifacts conventions
- skill: wiki-artifacts created in research category
```

So when you said "I thought the HTML dashboard was part of the repo," it actually wasn't. I built it because you asked about HTML artifacts and how to view the wiki.

Now, your point about Obsidian: **yes, Obsidian can render HTML files**, but with limitations:

| Feature | Obsidian HTML Preview | Browser (Chrome/Safari) |
|---------|----------------------|------------------------|
| Open HTML files | Yes, via file explorer | Yes, via `open` or double-click |
| Basic HTML/CSS | Yes | Yes |
| **JavaScript (Chart.js, search, filters)** | **No / limited** | **Full support** |
| Interactive charts | Static fallback | Live, interactive |
| Search/filter tables | Static | Live filtering |

So the question is: **do you want the interactive features (charts, search, stats) or just a static view?**

If you want interactivity, the HTML dashboard is useful. If you're fine with static, we could:
1. Keep the HTML dashboard for browser use
2. Create an Obsidian-friendly markdown dashboard (MOC - Map of Content) with dataview queries
3. Or just use Obsidian's graph view and file explorer

What do you prefer?
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
the Hermes session log at `~/.hermes/sessions/20260511_134857_ebd574.jsonl`; this file
exists so the durable knowledge base has at least a pointer to what the
session produced. Future readers can consult the source session file for
the full transcript.
