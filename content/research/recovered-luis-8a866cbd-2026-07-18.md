---
title: "Recovered research — luis (session 20260413_085341_8a866cbd)"
description: "Backfill from research-without-persist detector. Original session produced research/analysis content but never called mcp_memroos_knowledge_write. Recovered 2026-07-18 by the daily research-persist audit cron."
publishedAt: "2026-07-18"
tags: [recovery, research-without-persist, backfill]
keywords: [memroos, persist-failure, recovery, luis]
author: "Alba [bot]"
source_session: "20260413_085341_8a866cbd"
model: "minimax-m3"
sources:
  - "label:research-without-persist-detector"
  - "file://~/.hermes/sessions/20260413_085341_8a866cbd.jsonl"
derived_from:
  - "content/research/memroos-persist-failure-rca-2026-07-05.md"
regen_prompt: "Read session ~/.hermes/sessions/20260413_085341_8a866cbd.jsonl, extract the largest assistant-side structured content block, and write a recovery markdown describing what the session produced and why it was missed."
---

# Recovered Research — luis

**Source session:** `20260413_085341_8a866cbd`
**Recovered:** 2026-07-18 (daily research-persist audit cron)
**Trigger:** research-without-persist detector flagged this session as having produced research-grade output without calling `mcp_memroos_knowledge_write`.

## Original research content (excerpt)

> First 1418 characters of the largest assistant-side structured block recovered from the session transcript.

```
Here's what I did:

**1. Fixed the QA script** (`paperclip-qa-review.py`):
- Added boilerplate filter — ignores `---`, `## headers`, `**Run ID**:`, blank lines, summary stats
- Extracts actual error messages instead of dumping raw context
- Normalizes similar patterns (e.g., "Process lost" variants → one canonical form)
- Deduplicates before logging — no more 358K-line skill-updates.md

**2. Cleaned up skill-updates.md**:
- Went from **8MB / 358K lines** → **2KB / 50 lines** with only real recurring issues
- 4 documented patterns, all actionable

**3. Diagnosis results**:
- **Server is currently healthy** (port 3100 returns 200)
- **`opencode models` works now** — responded instantly with 200+ models. The 20s timeout was likely load-dependent or transient
- **"Process lost" is the real problem** — same run ID fails 4-5 times in 50-min windows. Happened Apr 11, 12, and 13. Server is crashing mid-workflow, not just slow

**New QA output** (half as long):
```
Paperclip QA Review — 2026-04-13
Reports: 14 | Failures: 4 | Systemic: 1

Systemic patterns:
  [2x] Process lost — server may have restarted

Skill updates logged: 0
```

**Next action needed**: The "Process lost" pattern suggests the Paperclip node process is crashing during workflow execution (possible OOM kill or unhandled exception). Should I check server logs for crash evidence, or set up process supervision (pm2/launchd) to auto-recover?
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
the Hermes session log at `~/.hermes/sessions/20260413_085341_8a866cbd.jsonl`; this file
exists so the durable knowledge base has at least a pointer to what the
session produced. Future readers can consult the source session file for
the full transcript.
