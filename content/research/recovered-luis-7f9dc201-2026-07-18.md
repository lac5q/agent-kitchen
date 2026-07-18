---
title: "Recovered research — luis (session 20260412_100003_7f9dc201)"
description: "Backfill from research-without-persist detector. Original session produced research/analysis content but never called mcp_memroos_knowledge_write. Recovered 2026-07-18 by the daily research-persist audit cron."
publishedAt: "2026-07-18"
tags: [recovery, research-without-persist, backfill]
keywords: [memroos, persist-failure, recovery, luis]
author: "Alba [bot]"
source_session: "20260412_100003_7f9dc201"
model: "minimax-m3"
sources:
  - "label:research-without-persist-detector"
  - "file://~/.hermes/sessions/20260412_100003_7f9dc201.jsonl"
derived_from:
  - "content/research/memroos-persist-failure-rca-2026-07-05.md"
regen_prompt: "Read session ~/.hermes/sessions/20260412_100003_7f9dc201.jsonl, extract the largest assistant-side structured content block, and write a recovery markdown describing what the session produced and why it was missed."
---

# Recovered Research — luis

**Source session:** `20260412_100003_7f9dc201`
**Recovered:** 2026-07-18 (daily research-persist audit cron)
**Trigger:** research-without-persist detector flagged this session as having produced research-grade output without calling `mcp_memroos_knowledge_write`.

## Original research content (excerpt)

> First 1313 characters of the largest assistant-side structured block recovered from the session transcript.

```
Here's the revised version:

---

Principles:
1) Be harness/tech agnostic — it's all changing too fast
2) Multi-agent, multi-dev CLI so one agent's learning benefits all
3) Think long-term — how many markdown files will you actually manage?

We hit all three. Our stack:

• **Qdrant** — vector similarity search for semantic memory. Not just storing facts, but retrieving what's actually relevant to the current context. RAG without the folder-diving.

• **mem0** — memory layer on top of vector stores. Handles extraction, deduplication, and decay automatically. We fixed the Chroma persistence issues early — learned that one the hard way.

• **QMD** — personal knowledge base search across notes, docs, meeting transcripts. Bridges the gap between structured and unstructured memory.

• **GitNexus** — code knowledge graph with Cypher queries. The graph IS the memory for codebases. Impact analysis, execution flow tracing, caller/callee resolution.

• **SQLite + FTS5** — session store with full-text search. Cross-session recall without scanning files.

Garry's right about thin harnesses. But markdown-as-memory breaks at scale. You need a queryable layer between the files and the agent.

The harness should be thin. The memory should be smart.

---

Better? I can tweak further or post it if you're happy.
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
the Hermes session log at `~/.hermes/sessions/20260412_100003_7f9dc201.jsonl`; this file
exists so the durable knowledge base has at least a pointer to what the
session produced. Future readers can consult the source session file for
the full transcript.
