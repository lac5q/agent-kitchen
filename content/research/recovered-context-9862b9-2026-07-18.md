---
title: "Recovered research — context (session 20260511_131652_9862b9)"
description: "Backfill from research-without-persist detector. Original session produced research/analysis content but never called mcp_memroos_knowledge_write. Recovered 2026-07-18 by the daily research-persist audit cron."
publishedAt: "2026-07-18"
tags: [recovery, research-without-persist, backfill]
keywords: [memroos, persist-failure, recovery, context]
author: "Alba [bot]"
source_session: "20260511_131652_9862b9"
model: "minimax-m3"
sources:
  - "label:research-without-persist-detector"
  - "file://~/.hermes/sessions/20260511_131652_9862b9.jsonl"
derived_from:
  - "content/research/memroos-persist-failure-rca-2026-07-05.md"
regen_prompt: "Read session ~/.hermes/sessions/20260511_131652_9862b9.jsonl, extract the largest assistant-side structured content block, and write a recovery markdown describing what the session produced and why it was missed."
---

# Recovered Research — context

**Source session:** `20260511_131652_9862b9`
**Recovered:** 2026-07-18 (daily research-persist audit cron)
**Trigger:** research-without-persist detector flagged this session as having produced research-grade output without calling `mcp_memroos_knowledge_write`.

## Original research content (excerpt)

> First 1301 characters of the largest assistant-side structured block recovered from the session transcript.

```
Done.

Implemented Phase 2 for Agent Kitchen Iris:

- Added `apps/kitchen/src/lib/iris-scanner.ts`
- Added Iris tests in `apps/kitchen/src/lib/__tests__/iris-scanner.test.ts`
- Wired Iris pre-flight blocking into:
  - `POST /api/dispatch`
  - `sendA2aMessage`
- Added dispatch and A2A tests proving prompt injection gets blocked before dispatch/task persistence
- Preserved current external semantics:
  - Dispatch still returns `403 CONTENT_BLOCKED`
  - A2A still throws `UNAUTHORIZED`
  - Audit action remains `content_blocked`
- Updated the Agent Shield/Iris plan doc with Phase 2 results
- Posted hive checkpoint

Verification:

- Targeted Iris/dispatch/A2A tests: 21/21 passed
- Existing content scanner tests: 16/16 passed
- Full Kitchen suite: 477/477 passed across 76 files
- ESLint: exits 0, only 11 pre-existing warnings
- Build: passed, with one existing Turbopack NFT trace warning in `next.config.ts`
- GitNexus change detection: HIGH risk, expected due `sendA2aMessage` A2A blast radius

Note: I did not touch the pre-existing `.planning/*` changes beyond the earlier roadmap work. Current git status still includes those unrelated planning files plus the Iris implementation files.

Want me to commit this as a focused Iris Phase 2 commit, excluding the unrelated `.planning/*` changes?
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
the Hermes session log at `~/.hermes/sessions/20260511_131652_9862b9.jsonl`; this file
exists so the durable knowledge base has at least a pointer to what the
session produced. Future readers can consult the source session file for
the full transcript.
