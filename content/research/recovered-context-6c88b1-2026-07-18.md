---
title: "Recovered research — context (session 20260519_101303_6c88b1)"
description: "Backfill from research-without-persist detector. Original session produced research/analysis content but never called mcp_memroos_knowledge_write. Recovered 2026-07-18 by the daily research-persist audit cron."
publishedAt: "2026-07-18"
tags: [recovery, research-without-persist, backfill]
keywords: [memroos, persist-failure, recovery, context]
author: "Alba [bot]"
source_session: "20260519_101303_6c88b1"
model: "minimax-m3"
sources:
  - "label:research-without-persist-detector"
  - "file://~/.hermes/sessions/20260519_101303_6c88b1.jsonl"
derived_from:
  - "content/research/memroos-persist-failure-rca-2026-07-05.md"
regen_prompt: "Read session ~/.hermes/sessions/20260519_101303_6c88b1.jsonl, extract the largest assistant-side structured content block, and write a recovery markdown describing what the session produced and why it was missed."
---

# Recovered Research — context

**Source session:** `20260519_101303_6c88b1`
**Recovered:** 2026-07-18 (daily research-persist audit cron)
**Trigger:** research-without-persist detector flagged this session as having produced research-grade output without calling `mcp_memroos_knowledge_write`.

## Original research content (excerpt)

> First 1741 characters of the largest assistant-side structured block recovered from the session transcript.

```
Now I have a complete understanding. Let me explain the issues and what was fixed.

**Issue 1: Dashboard 5/16 MER 2.97x vs Executive Brief 6.29x**

This was a **bug**. The dashboard's `api/mer-data-cached.js` had a `mergeRows()` function that was overwriting correct JSON data with stale Google Ads API data from the "live overlay" (which fetches last 7 days from APIs). For 5/16, this was adding phantom Google spend ($171) and Google revenue ($272) that shouldn't have been there, making the total spend $320 instead of the correct $149.51.

**Fixed**: Modified `mergeRows()` to only fill in missing values from the live overlay, not overwrite existing JSON data. The dashboard will now show the correct MER of 6.36x for 5/16.

**Issue 2: 2025 Google Rev $2,470 + Meta Rev $4,476 > Total Rev $1,844**

This is **expected behavior**, not a bug. The "Rev '25" columns under Meta and Google show **attributed revenue** (what each ad platform claims credit for), not actual revenue. Due to attribution windows (7-day click, 1-day view), multiple platforms can claim credit for the same order. The "Total Rev '25" column shows actual Shopify revenue, which is the correct number.

This is a labeling issue - the columns should probably say "Attributed Rev" to be clearer, but the data itself is correct.

**Executive Brief vs Dashboard discrepancy**: The executive brief reads directly from JSON files (correct), while the dashboard was using stale live overlay data (bug, now fixed). The small difference in MER (6.29x vs 6.36x) is due to different data sources/timing - the executive brief may have been generated at a slightly different time.

The fix is committed and will deploy to Vercel. The dashboard should now show correct MER values.
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
the Hermes session log at `~/.hermes/sessions/20260519_101303_6c88b1.jsonl`; this file
exists so the durable knowledge base has at least a pointer to what the
session produced. Future readers can consult the source session file for
the full transcript.
