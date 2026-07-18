---
title: "Recovered research — context (session 20260507_111744_44331f)"
description: "Backfill from research-without-persist detector. Original session produced research/analysis content but never called mcp_memroos_knowledge_write. Recovered 2026-07-18 by the daily research-persist audit cron."
publishedAt: "2026-07-18"
tags: [recovery, research-without-persist, backfill]
keywords: [memroos, persist-failure, recovery, context]
author: "Alba [bot]"
source_session: "20260507_111744_44331f"
model: "minimax-m3"
sources:
  - "label:research-without-persist-detector"
  - "file://~/.hermes/sessions/20260507_111744_44331f.jsonl"
derived_from:
  - "content/research/memroos-persist-failure-rca-2026-07-05.md"
regen_prompt: "Read session ~/.hermes/sessions/20260507_111744_44331f.jsonl, extract the largest assistant-side structured content block, and write a recovery markdown describing what the session produced and why it was missed."
---

# Recovered Research — context

**Source session:** `20260507_111744_44331f`
**Recovered:** 2026-07-18 (daily research-persist audit cron)
**Trigger:** research-without-persist detector flagged this session as having produced research-grade output without calling `mcp_memroos_knowledge_write`.

## Original research content (excerpt)

> First 1146 characters of the largest assistant-side structured block recovered from the session transcript.

```
Using skill: `native-mcp`.

Yep — GitHub deploy is done too:

- Pushed `main` to `https://github.com/lac5q/agent-kitchen.git`
- Commit: `037b28d feat: expose Agent Kitchen as MCP server`
- Shared server is still running on this Mac
- Maria/Sophia should connect to **this server**, not run their own.

Send them this:

```text
Add Agent Kitchen as a remote MCP server.

Do NOT run a local Agent Kitchen server. Use Luis/Alba’s shared Agent Kitchen MCP endpoint:

http://100.68.222.60:8765/mcp

If your MCP client uses JSON config:

{
  "mcpServers": {
    "agentkitchen": {
      "url": "http://100.68.222.60:8765/mcp"
    }
  }
}

If you are using Hermes Agent, add this to ~/.hermes/config.yaml:

mcp_servers:
  agentkitchen:
    url: "http://100.68.222.60:8765/mcp"
    timeout: 180
    connect_timeout: 60

Then restart your agent so MCP tools are discovered.

Expected tools should show up prefixed like:
mcp_agentkitchen_knowledge_health
mcp_agentkitchen_knowledge_search
mcp_agentkitchen_knowledge_read
```

Short version for them: **“Point your MCP config at `http://100.68.222.60:8765/mcp`; don’t clone or start Agent Kitchen locally.”**
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
the Hermes session log at `~/.hermes/sessions/20260507_111744_44331f.jsonl`; this file
exists so the durable knowledge base has at least a pointer to what the
session produced. Future readers can consult the source session file for
the full transcript.
