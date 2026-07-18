---
title: "Recovered research — context (session 20260512_090704_93ddc0)"
description: "Backfill from research-without-persist detector. Original session produced research/analysis content but never called mcp_memroos_knowledge_write. Recovered 2026-07-18 by the daily research-persist audit cron."
publishedAt: "2026-07-18"
tags: [recovery, research-without-persist, backfill]
keywords: [memroos, persist-failure, recovery, context]
author: "Alba [bot]"
source_session: "20260512_090704_93ddc0"
model: "minimax-m3"
sources:
  - "label:research-without-persist-detector"
  - "file://~/.hermes/sessions/20260512_090704_93ddc0.jsonl"
derived_from:
  - "content/research/memroos-persist-failure-rca-2026-07-05.md"
regen_prompt: "Read session ~/.hermes/sessions/20260512_090704_93ddc0.jsonl, extract the largest assistant-side structured content block, and write a recovery markdown describing what the session produced and why it was missed."
---

# Recovered Research — context

**Source session:** `20260512_090704_93ddc0`
**Recovered:** 2026-07-18 (daily research-persist audit cron)
**Trigger:** research-without-persist detector flagged this session as having produced research-grade output without calling `mcp_memroos_knowledge_write`.

## Original research content (excerpt)

> First 1212 characters of the largest assistant-side structured block recovered from the session transcript.

```
Done. I set up the weekly dashboard report flow.

What changed:
- Added weekly Meta report and weekly Google report.
- Each report includes:
  - High-level summary.
  - What was good and needs more budget.
  - What was bad and needs cuts/fixes.
  - Campaign-level winners/losers.
  - Ad-level winners/losers.
  - Clear budget recommendations.
- Updated the dashboard to point to stable latest links:
  - `latest_meta_ads_report.html`
  - `latest_google_ads_report.html`
- Kept dated report copies for history.
- Added a low-API generation path so we reuse the weekly deep-dive snapshot instead of hammering Meta/Google every time.
- Scheduled it to run every Tuesday at 3am PT and post back here.
- Committed and pushed to `mkt-hub`.

Latest commit: `b4cb1096`

Current week snapshot:
- Total spend: `$2,817.57`
- Revenue: `$6,822.09`
- MER: `2.42x`
- Google: `4.37x ROAS`, generally strong.
- Meta: `1.26x ROAS`, mixed, needs tighter cuts.
- Strong areas: TY Brand Search, MMJ Brand Search, TY DSA, TY CBO Mother’s Day.
- Weak areas: TY Shopping, MMJ PMax Feed Only, TY/MMJ video-view campaigns with zero ROAS.

Cron is live:
- `Weekly Ads Dashboard Reports`
- Tuesdays at `3:00am PT`
- Next run: `May 19, 2026`
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
the Hermes session log at `~/.hermes/sessions/20260512_090704_93ddc0.jsonl`; this file
exists so the durable knowledge base has at least a pointer to what the
session produced. Future readers can consult the source session file for
the full transcript.
