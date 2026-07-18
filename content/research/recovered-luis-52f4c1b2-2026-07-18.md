---
title: "Recovered research — luis (session 20260419_010237_52f4c1b2)"
description: "Backfill from research-without-persist detector. Original session produced research/analysis content but never called mcp_memroos_knowledge_write. Recovered 2026-07-18 by the daily research-persist audit cron."
publishedAt: "2026-07-18"
tags: [recovery, research-without-persist, backfill]
keywords: [memroos, persist-failure, recovery, luis]
author: "Alba [bot]"
source_session: "20260419_010237_52f4c1b2"
model: "minimax-m3"
sources:
  - "label:research-without-persist-detector"
  - "file://~/.hermes/sessions/20260419_010237_52f4c1b2.jsonl"
derived_from:
  - "content/research/memroos-persist-failure-rca-2026-07-05.md"
regen_prompt: "Read session ~/.hermes/sessions/20260419_010237_52f4c1b2.jsonl, extract the largest assistant-side structured content block, and write a recovery markdown describing what the session produced and why it was missed."
---

# Recovered Research — luis

**Source session:** `20260419_010237_52f4c1b2`
**Recovered:** 2026-07-18 (daily research-persist audit cron)
**Trigger:** research-without-persist detector flagged this session as having produced research-grade output without calling `mcp_memroos_knowledge_write`.

## Original research content (excerpt)

> First 1710 characters of the largest assistant-side structured block recovered from the session transcript.

```
✅ **All 10 Hermes Atlas skills installed.** Here's the full rundown:

---

### ✅ Installed to `~/.openclaw/skills/`

| # | Skill | Stars | Audit | Notes |
|---|-------|-------|-------|-------|
| 1 | `anthropic-cybersecurity-skills` | ★4.6K | ✅ Low | 754 skills, MITRE ATT&CK/NIST mapped |
| 2 | `avoid-ai-writing` | ★1.1K | ✅ Low | Removes AI writing patterns |
| 3 | `wondelai-skills` | ★642 | ✅ Low | 42-skill cross-platform library |
| 4 | `drawio-skill` | ★322 | ✅ Low | Natural language → draw.io diagrams |
| 5 | `pydantic-ai-skills` | ★245 | ⚠️ HIGH | 3 HIGH findings (hardcoded secrets in examples) — blocked by audit threshold but installed |
| 6 | `litprog-skill` | ★97 | ✅ Low | Literate programming |
| 7 | `chainlink-agent-skills` | ★86 | ✅ Low | 3 Chainlink skills (data feeds, CCIP, CRE) |
| 8 | `icarus-plugin` | ★58 | ⚠️ HIGH | Python shell execution in test scripts |
| 9 | `skilldock-io` | ★55 | ✅ Low | Skill registry SDK |
| 10 | `black-forest-labs-skills` | ★50 | ✅ Low | FLUX image gen (bfl-api, flux-best-practices) |

---

### ⚠️ Two flagged for review
- **`pydantic-ai-skills`** — hardcoded secrets in example code. Don't use the examples as-is.
- **`icarus-plugin`** — shell execution in test scripts. Review before giving it sensitive access.

---

### 📹 Video generation — heads up
**Atlas has zero video generation skills.** The only media skill is `black-forest-labs/skills` for FLUX images. Your existing `minimax-video` and `video-generation-multi` skills are actually *ahead* of what's in the Atlas ecosystem right now — nothing to pull from there on that front.

---

Want me to audit those two flagged skills more closely, or sync them across to any other agent directories?
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
the Hermes session log at `~/.hermes/sessions/20260419_010237_52f4c1b2.jsonl`; this file
exists so the durable knowledge base has at least a pointer to what the
session produced. Future readers can consult the source session file for
the full transcript.
