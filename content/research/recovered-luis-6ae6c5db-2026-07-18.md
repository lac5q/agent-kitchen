---
title: "Recovered research — luis (session 20260414_053203_6ae6c5db)"
description: "Backfill from research-without-persist detector. Original session produced research/analysis content but never called mcp_memroos_knowledge_write. Recovered 2026-07-18 by the daily research-persist audit cron."
publishedAt: "2026-07-18"
tags: [recovery, research-without-persist, backfill]
keywords: [memroos, persist-failure, recovery, luis]
author: "Alba [bot]"
source_session: "20260414_053203_6ae6c5db"
model: "minimax-m3"
sources:
  - "label:research-without-persist-detector"
  - "file://~/.hermes/sessions/20260414_053203_6ae6c5db.jsonl"
derived_from:
  - "content/research/memroos-persist-failure-rca-2026-07-05.md"
regen_prompt: "Read session ~/.hermes/sessions/20260414_053203_6ae6c5db.jsonl, extract the largest assistant-side structured content block, and write a recovery markdown describing what the session produced and why it was missed."
---

# Recovered Research — luis

**Source session:** `20260414_053203_6ae6c5db`
**Recovered:** 2026-07-18 (daily research-persist audit cron)
**Trigger:** research-without-persist detector flagged this session as having produced research-grade output without calling `mcp_memroos_knowledge_write`.

## Original research content (excerpt)

> First 2141 characters of the largest assistant-side structured block recovered from the session transcript.

```
Now let me write the posts.

---

**LINKEDIN POST:**

Your AI is bleeding tokens. You just can't see it yet.

Every MCP server you connect to Claude — Gmail, Drive, Zapier, whatever — uploads its entire tool schema into the context window before you type a single word.

Not after. Before.

Here's what the data shows:

10–20 MCP servers can consume 25–72% of a 200k context window. That's 82,000 tokens gone. Just sitting there. Doing nothing.

Add Zapier MCP (8,000+ apps) on top of direct Google connectors? You're paying the context tax twice for the same capabilities. Claude doesn't deduplicate. It just burns.

This is context rot. It's invisible. It's expensive. And it's getting worse with every new server you add.

The fix is boring:

1. Audit your MCP integrations. All of them.
2. Remove duplicates — Zapier OR direct Google, not both.
3. Prune servers you added "just in case."
4. Measure actual tool usage. If you haven't called it in a week, cut it.

More connectors ≠ smarter AI. The data shows the opposite.

A lean setup with 3–4 focused servers outperforms a bloated one with 20. Every time.

Your context window is your most expensive resource. Stop treating it like it's free.

—

**X POST:**

Your AI is quietly burning 40% of its brain before you even say hello.

Every MCP server you connect dumps its entire tool schema into Claude's context window upfront.

10 servers = 82k tokens gone.
Zapier + Google = paying twice for the same tools.
Claude doesn't deduplicate. It just burns.

This is context rot.

It's invisible. It's expensive. And it's making your AI dumber.

The fix:

1. Audit every MCP server
2. Kill duplicates (Zapier OR direct Google, not both)
3. Prune "just in case" connectors
4. If you haven't called a tool in a week → cut it

More tools ≠ smarter AI.

Fewer tools, faster responses, better results.

Your context window is your most expensive resource. Stop treating it like it's free. 🧵

---

![LinkedIn visual — crushed AI chip under cable overload](https://v3b.fal.media/files/b/0a963868/sRIQewlmsUOPa-kZztMds_EaoV3AA8.png)

Want me to post these to your accounts, or tweak the tone first?
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
the Hermes session log at `~/.hermes/sessions/20260414_053203_6ae6c5db.jsonl`; this file
exists so the durable knowledge base has at least a pointer to what the
session produced. Future readers can consult the source session file for
the full transcript.
