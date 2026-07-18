---
title: "Recovered research — context (session 20260507_011506_e822a8)"
description: "Backfill from research-without-persist detector. Original session produced research/analysis content but never called mcp_memroos_knowledge_write. Recovered 2026-07-18 by the daily research-persist audit cron."
publishedAt: "2026-07-18"
tags: [recovery, research-without-persist, backfill]
keywords: [memroos, persist-failure, recovery, context]
author: "Alba [bot]"
source_session: "20260507_011506_e822a8"
model: "minimax-m3"
sources:
  - "label:research-without-persist-detector"
  - "file://~/.hermes/sessions/20260507_011506_e822a8.jsonl"
derived_from:
  - "content/research/memroos-persist-failure-rca-2026-07-05.md"
regen_prompt: "Read session ~/.hermes/sessions/20260507_011506_e822a8.jsonl, extract the largest assistant-side structured content block, and write a recovery markdown describing what the session produced and why it was missed."
---

# Recovered Research — context

**Source session:** `20260507_011506_e822a8`
**Recovered:** 2026-07-18 (daily research-persist audit cron)
**Trigger:** research-without-persist detector flagged this session as having produced research-grade output without calling `mcp_memroos_knowledge_write`.

## Original research content (excerpt)

> First 1213 characters of the largest assistant-side structured block recovered from the session transcript.

```
Using skills: `professional-content-creation`, `hyperframes`, `sag`.

Fixed V5.

MEDIA:/Users/lcalderon/Downloads/agentic-ai-barriers-review/video/agentic-ai-barriers-v5-luisvoice-synced.mp4

MEDIA:/Users/lcalderon/Downloads/agentic-ai-barriers-review/assets/contact-sheet-v5.jpg

What changed:
- Voice now opens with: **“This is the virtual voice of Luis Calderon.”**
- Made the delivery more excited.
- Rebuilt the narration as **scene-level audio segments**, then tied the video cuts to those exact segment timings so the voice and visuals advance together.
- Kept the V4 layout fixes: bigger padded text boxes, `May 2026`, LinkedIn reference, QR ending, Bernard Marr credit.

Important note: I tried the ElevenLabs voice named **Luis**, but ElevenLabs still blocks it with a Creator-tier entitlement error. So for this review render I used the available ElevenLabs cloned voice in the account: **Jarvis Voice Clone**.

QA passed:
- Sync timing verified from the same segment timing manifest.
- Contact sheet checked.
- Intro frame checked.
- Closing QR frame checked.
- No cramped boxes, no footer collisions, no visible ugly draft-status copy.

Nothing went live. This is still review-only until you approve.
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
the Hermes session log at `~/.hermes/sessions/20260507_011506_e822a8.jsonl`; this file
exists so the durable knowledge base has at least a pointer to what the
session produced. Future readers can consult the source session file for
the full transcript.
