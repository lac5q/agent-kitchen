---
title: "Recovered research — context (session 20260511_132746_af7019)"
description: "Backfill from research-without-persist detector. Original session produced research/analysis content but never called mcp_memroos_knowledge_write. Recovered 2026-07-18 by the daily research-persist audit cron."
publishedAt: "2026-07-18"
tags: [recovery, research-without-persist, backfill]
keywords: [memroos, persist-failure, recovery, context]
author: "Alba [bot]"
source_session: "20260511_132746_af7019"
model: "minimax-m3"
sources:
  - "label:research-without-persist-detector"
  - "file://~/.hermes/sessions/20260511_132746_af7019.jsonl"
derived_from:
  - "content/research/memroos-persist-failure-rca-2026-07-05.md"
regen_prompt: "Read session ~/.hermes/sessions/20260511_132746_af7019.jsonl, extract the largest assistant-side structured content block, and write a recovery markdown describing what the session produced and why it was missed."
---

# Recovered Research — context

**Source session:** `20260511_132746_af7019`
**Recovered:** 2026-07-18 (daily research-persist audit cron)
**Trigger:** research-without-persist detector flagged this session as having produced research-grade output without calling `mcp_memroos_knowledge_write`.

## Original research content (excerpt)

> First 1293 characters of the largest assistant-side structured block recovered from the session transcript.

```
Continued and finished.

Why it failed:
- The cron job was still using an LLM turn.
- I set it to `qwen/qwen-3-coder-plus`, but that is not a valid OpenRouter model ID.
- Even worse, model choice should not matter for this job at all, because cleanup is deterministic code.

What I changed:
- Added repo-owned maintenance entrypoint:
  - `scripts/agent-kitchen-maintenance.py`
- It runs:
  - `scripts/knowledge-health.py`
  - `scripts/knowledge-prune.py --apply`
- It prints **nothing** when everything is healthy, so cron stays silent.
- It prints only if it prunes files or finds a health issue.

Cron is now fixed:
- Job: `Agent Kitchen Health Check & Prune`
- Runs every 6 hours
- Now uses `no_agent=true`
- Uses script: `agent-kitchen-maintenance.sh`
- No model call, no Gemini quota, no Qwen model ID issue, no LLM cost.

Verified:
- Health check passes:
  - 5,731 markdown files
  - 0 stale files
  - wiki OK at `llm-wiki/wiki`
- Maintenance script returns 0 bytes on healthy no-op, exactly what we want for silent cron.

Code is in the repo and pushed:
- Commit: `da4ce16 chore: add deterministic knowledge maintenance`
- Pushed to `origin/master`

One note: GitHub warned that `logs/mem0-server.log` is already a 60 MB tracked file. Separate cleanup item, but not part of this change.
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
the Hermes session log at `~/.hermes/sessions/20260511_132746_af7019.jsonl`; this file
exists so the durable knowledge base has at least a pointer to what the
session produced. Future readers can consult the source session file for
the full transcript.
