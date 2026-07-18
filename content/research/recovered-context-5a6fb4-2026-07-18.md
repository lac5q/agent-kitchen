---
title: "Recovered research — context (session 20260519_173730_5a6fb4)"
description: "Backfill from research-without-persist detector. Original session produced research/analysis content but never called mcp_memroos_knowledge_write. Recovered 2026-07-18 by the daily research-persist audit cron."
publishedAt: "2026-07-18"
tags: [recovery, research-without-persist, backfill]
keywords: [memroos, persist-failure, recovery, context]
author: "Alba [bot]"
source_session: "20260519_173730_5a6fb4"
model: "minimax-m3"
sources:
  - "label:research-without-persist-detector"
  - "file://~/.hermes/sessions/20260519_173730_5a6fb4.jsonl"
derived_from:
  - "content/research/memroos-persist-failure-rca-2026-07-05.md"
regen_prompt: "Read session ~/.hermes/sessions/20260519_173730_5a6fb4.jsonl, extract the largest assistant-side structured content block, and write a recovery markdown describing what the session produced and why it was missed."
---

# Recovered Research — context

**Source session:** `20260519_173730_5a6fb4`
**Recovered:** 2026-07-18 (daily research-persist audit cron)
**Trigger:** research-without-persist detector flagged this session as having produced research-grade output without calling `mcp_memroos_knowledge_write`.

## Original research content (excerpt)

> First 1503 characters of the largest assistant-side structured block recovered from the session transcript.

```
Here's the vetting report. Out of 40 creators on that Collabstr list, I verified engagement on the top 3 and reviewed all 40 profiles.

## Top 3 Verified Picks

### 1. @_iamdemond (Demond Hicks) ⭐⭐⭐ BEST FIT
- **21K followers, 26.54% ER** (recent posts 0.85-3.55%, above average)
- Dad, author, entrepreneur in Indianapolis
- Fatherhood content, faith, family moments
- **$200/reel, $50/post, $50/story**
- **Perfect for both TY & MMJ** — male dad creator with authentic content

### 2. @capitao.diana (Diana Capitao) ⭐⭐⭐
- **15K followers, 3.43% ER** (Excellent — above median for 10K-50K)
- Toddler mom, parenting support in Beverly, MA
- **$300/reel, $100/story**
- **Best for TY** — toddler mom audience = #1 family gift buyer

### 3. @mo_bronco (Joe Hubbard) ⭐⭐
- **17K followers, 0.32-1.96% recent ER** (acceptable)
- 36yo dad of 2, outdoorsy, Ford trucks/Broncos in St. Louis
- **$200/reel, $50/story, $100/post**
- **Best for MMJ** — adventurous/epic dad angle

## Cost Summary (Top 3)
- **1 reel each:** $700 total
- **1 reel + 1 story each:** $900 total

## Backend Compensation Proposal
To reduce upfront cash:
- **50% upfront, 50% on performance** (tracked via unique discount code)
- **Revenue share:** 10-15% of sales from their code
- **Gifted product + commission:** Free portrait + 15% of all sales

Full report saved to `/Users/lcalderon/content-os/drafts/collabstr-influencer-vetting-report.md`. Want me to reach out to these creators, or check engagement on more from the list first?
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
the Hermes session log at `~/.hermes/sessions/20260519_173730_5a6fb4.jsonl`; this file
exists so the durable knowledge base has at least a pointer to what the
session produced. Future readers can consult the source session file for
the full transcript.
