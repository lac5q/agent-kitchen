---
title: "Recovered research — context (session 20260507_003410_5561dd)"
description: "Backfill from research-without-persist detector. Original session produced research/analysis content but never called mcp_memroos_knowledge_write. Recovered 2026-07-18 by the daily research-persist audit cron."
publishedAt: "2026-07-18"
tags: [recovery, research-without-persist, backfill]
keywords: [memroos, persist-failure, recovery, context]
author: "Alba [bot]"
source_session: "20260507_003410_5561dd"
model: "minimax-m3"
sources:
  - "label:research-without-persist-detector"
  - "file://~/.hermes/sessions/20260507_003410_5561dd.jsonl"
derived_from:
  - "content/research/memroos-persist-failure-rca-2026-07-05.md"
regen_prompt: "Read session ~/.hermes/sessions/20260507_003410_5561dd.jsonl, extract the largest assistant-side structured content block, and write a recovery markdown describing what the session produced and why it was missed."
---

# Recovered Research — context

**Source session:** `20260507_003410_5561dd`
**Recovered:** 2026-07-18 (daily research-persist audit cron)
**Trigger:** research-without-persist detector flagged this session as having produced research-grade output without calling `mcp_memroos_knowledge_write`.

## Original research content (excerpt)

> First 1736 characters of the largest assistant-side structured block recovered from the session transcript.

```
Using skills: agent-operations + paperclip.

You were right. The local Agent-Lightning loop wasn’t really Agent-Lightning’s upstream repo problem — it was our OpenClaw historical audit script being too Paperclip-centered and missing an explicit dev CLI/harness scan.

Patched:

- `~/.openclaw/scripts/hermes-historical-audit.py`
  - Added `scan_dev_cli_harness()`.
  - New source label: `🧰 Dev CLI/Harness`.
  - Scans/log-tails these surfaces:
    - Hermes/Alba
    - OpenClaw harness
    - Codex CLI
    - Claude Code CLI
    - Gemini CLI
    - OpenCode CLI
    - GitNexus harness
    - Agent Kitchen/tool-attention harness
  - Adds secret redaction before writing proposal context.
  - Uses bounded log tail reads so huge CLI logs don’t stall the audit.
  - Added `HERMES_HISTORICAL_AUDIT_DRY_RUN=1` so we can test without writing proposals or sending Telegram alerts.
  - Main audit now runs all 5 sources: Paperclip, OpenClaw gateway, Dev CLI/Harness, PMO memory, QMD.

- `~/.openclaw/scripts/agent-lightning-cron.sh`
  - Changed misleading `YOLO Mode` log to `HITL Draft Mode`.
  - Clarified executor creates human-reviewed drafts, not silent live rewrites.

Verified:

- `python3 -m py_compile ~/.openclaw/scripts/hermes-historical-audit.py` ✅
- `bash -n ~/.openclaw/scripts/agent-lightning-cron.sh` ✅
- Dry run completed with no proposal writes and no Telegram send:
  - Paperclip: 0 failures
  - OpenClaw gateway: found errors
  - Dev CLI/Harness: found errors across broader surfaces
  - PMO memories: found signals
  - QMD: partially worked but had existing timeout behavior

Net: AgentLight is no longer just staring at Paperclip. It now watches the dev harness surface area too, while staying human-gated through APO drafts.
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
the Hermes session log at `~/.hermes/sessions/20260507_003410_5561dd.jsonl`; this file
exists so the durable knowledge base has at least a pointer to what the
session produced. Future readers can consult the source session file for
the full transcript.
