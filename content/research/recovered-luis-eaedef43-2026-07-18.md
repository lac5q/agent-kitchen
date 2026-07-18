---
title: "Recovered research — luis (session 20260511_035115_eaedef43)"
description: "Backfill from research-without-persist detector. Original session produced research/analysis content but never called mcp_memroos_knowledge_write. Recovered 2026-07-18 by the daily research-persist audit cron."
publishedAt: "2026-07-18"
tags: [recovery, research-without-persist, backfill]
keywords: [memroos, persist-failure, recovery, luis]
author: "Alba [bot]"
source_session: "20260511_035115_eaedef43"
model: "minimax-m3"
sources:
  - "label:research-without-persist-detector"
  - "file://~/.hermes/sessions/20260511_035115_eaedef43.jsonl"
derived_from:
  - "content/research/memroos-persist-failure-rca-2026-07-05.md"
regen_prompt: "Read session ~/.hermes/sessions/20260511_035115_eaedef43.jsonl, extract the largest assistant-side structured content block, and write a recovery markdown describing what the session produced and why it was missed."
---

# Recovered Research — luis

**Source session:** `20260511_035115_eaedef43`
**Recovered:** 2026-07-18 (daily research-persist audit cron)
**Trigger:** research-without-persist detector flagged this session as having produced research-grade output without calling `mcp_memroos_knowledge_write`.

## Original research content (excerpt)

> First 1159 characters of the largest assistant-side structured block recovered from the session transcript.

```
Done. Here's what I set up:

**Installed:** birdclaw v0.4.1 via npm, initialized `~/.birdclaw/birdclaw.sqlite`

**Built skill:** `social-media/birdclaw` — covers the full lifecycle:
- **Post-sync plan:** after every post, run `sync likes` + `sync bookmarks` + `sync timeline` + `sync mention-threads` + `db stats` to keep the SQLite fresh
- **Search:** FTS5 queries across all tweets, bookmarks, likes, DMs
- **Review:** `db stats`, `graph events`, `graph mutuals`, `inbox --score`
- **Moderation:** blocks, mutes, bans

**Initial sync landed:**
- 24 home timeline tweets
- 5 bookmarks (synced)
- 5 likes (synced)
- 2 mentions

**Config set:** `~/.birdclaw/config.json` defaults transport to `bird` (xurl times out on oauth1-only account).

**Important note:** birdclaw doesn't have a `sync tweets` command for our own tweets. Our posted tweets only land in the DB via archive import or manual capture. The post-sync plan captures everything *around* our posts (timeline, engagement, mentions) but not our own tweet text. If you want that, we'd need to either import your Twitter archive or add a step that captures our post ID after xurl and queries it back.
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
the Hermes session log at `~/.hermes/sessions/20260511_035115_eaedef43.jsonl`; this file
exists so the durable knowledge base has at least a pointer to what the
session produced. Future readers can consult the source session file for
the full transcript.
