---
title: "Recovered research — context (session 20260506_220650_07141f)"
description: "Backfill from research-without-persist detector. Original session produced research/analysis content but never called mcp_memroos_knowledge_write. Recovered 2026-07-18 by the daily research-persist audit cron."
publishedAt: "2026-07-18"
tags: [recovery, research-without-persist, backfill]
keywords: [memroos, persist-failure, recovery, context]
author: "Alba [bot]"
source_session: "20260506_220650_07141f"
model: "minimax-m3"
sources:
  - "label:research-without-persist-detector"
  - "file://~/.hermes/sessions/20260506_220650_07141f.jsonl"
derived_from:
  - "content/research/memroos-persist-failure-rca-2026-07-05.md"
regen_prompt: "Read session ~/.hermes/sessions/20260506_220650_07141f.jsonl, extract the largest assistant-side structured content block, and write a recovery markdown describing what the session produced and why it was missed."
---

# Recovered Research — context

**Source session:** `20260506_220650_07141f`
**Recovered:** 2026-07-18 (daily research-persist audit cron)
**Trigger:** research-without-persist detector flagged this session as having produced research-grade output without calling `mcp_memroos_knowledge_write`.

## Original research content (excerpt)

> First 1269 characters of the largest assistant-side structured block recovered from the session transcript.

```
Using skills: `hermes-agent`, `postpeer`, `content-registry`.

Done. I made the ContentPublisher profile explicitly require DB storage.

Changed:

- `~/.hermes/profiles/contentpublisher/SOUL.md`
  - Added `content-registry` as a required skill.
  - Added a **Content Registry Database Gate**:
    - every content task is `context_store_required=true` unless you opt out
    - before completion it must write/verify `~/content-registry/content.db`
    - must store source context, final copy, assets, target platforms, approval/scheduling context, PostPeer IDs/live URLs
    - final response must include `content_id`

- Installed/synced the `content-registry` skill into the `contentpublisher` profile.

- Updated `~/content-registry/content_registry.py`
  - added `--metadata` JSON support, so it can store the flag cleanly:
    ```bash
    --metadata '{"context_store_required":true,"agent":"contentpublisher"}'
    ```
  - made DB parent directory creation safer.

Verified:

- CLI metadata flag smoke test passed: `metadata_flag_verified`
- `contentpublisher` self-audit returned: `REGISTRY_GATE_OK`
- `contentpublisher skills list` shows `content-registry` enabled.

So going forward, publishing is not “done” unless the context is in the registry DB and verified.
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
the Hermes session log at `~/.hermes/sessions/20260506_220650_07141f.jsonl`; this file
exists so the durable knowledge base has at least a pointer to what the
session produced. Future readers can consult the source session file for
the full transcript.
