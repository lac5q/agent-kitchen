---
title: "Recovered research — context (session 20260512_123144_bbe78a)"
description: "Backfill from research-without-persist detector. Original session produced research/analysis content but never called mcp_memroos_knowledge_write. Recovered 2026-07-18 by the daily research-persist audit cron."
publishedAt: "2026-07-18"
tags: [recovery, research-without-persist, backfill]
keywords: [memroos, persist-failure, recovery, context]
author: "Alba [bot]"
source_session: "20260512_123144_bbe78a"
model: "minimax-m3"
sources:
  - "label:research-without-persist-detector"
  - "file://~/.hermes/sessions/20260512_123144_bbe78a.jsonl"
derived_from:
  - "content/research/memroos-persist-failure-rca-2026-07-05.md"
regen_prompt: "Read session ~/.hermes/sessions/20260512_123144_bbe78a.jsonl, extract the largest assistant-side structured content block, and write a recovery markdown describing what the session produced and why it was missed."
---

# Recovered Research — context

**Source session:** `20260512_123144_bbe78a`
**Recovered:** 2026-07-18 (daily research-persist audit cron)
**Trigger:** research-without-persist detector flagged this session as having produced research-grade output without calling `mcp_memroos_knowledge_write`.

## Original research content (excerpt)

> First 2427 characters of the largest assistant-side structured block recovered from the session transcript.

```
Using skills: marketing-strategy-pmm, contentpublisher-os, postpeer.

For MemroOS, I’d promote this as a **developer/product launch**, not a generic startup promo.

Core angle:

**“Agents forget between runs. MemroOS gives them a shared memory layer so product, sales, and engineering workflows keep context.”**

Promotion plan:

1. **Update owned surfaces first**
   - Put the new video on `memroos.com`
   - Add it to the GitHub README
   - Add a short “Watch the demo” CTA near the top
   - Make sure the repo description says: “Memory OS for agent workflows”

2. **Launch post from Luis**
   - X thread with the video
   - LinkedIn post with the video
   - CTA: try the site + star the repo
   - Message: not “AI memory database”, but “runtime context packs for agent workflows”

3. **Developer proof post**
   - Follow-up thread: “How MemroOS works”
   - Explain: retain → retrieve → reinforce
   - Include screenshots or short clips from the video
   - CTA: GitHub repo

4. **Use-case posts**
   Three separate posts, each with one concrete workflow:
   - Product: context packs for launch planning and specs
   - Sales: account memory, objections, follow-ups
   - Engineering: persistent repo/workflow context across agents

5. **Community distribution**
   After owned posts are live:
   - Hacker News: “Show HN: MemroOS, shared memory for agent workflows”
   - Reddit carefully, likely r/LocalLLaMA, r/AI_Agents, r/ArtificialIntelligence if rules allow
   - Discord/Slack AI builder communities
   - GitHub topic discovery via stars and README keywords

6. **Short-form cutdowns**
   Use the new video to create:
   - 20s “agents forget” hook
   - 30s “context packs” explainer
   - 45s “product/sales/engineering workflows” demo
   These can go to X, LinkedIn, YouTube Shorts, TikTok if you want broader reach.

7. **Week-two credibility push**
   - Publish “Why agent memory needs an OS layer”
   - Add comparison framing: prompts vs RAG vs memory layer vs runtime context
   - Add a small benchmark/demo: same agent with and without MemroOS context

Success metrics:

- GitHub stars
- Website clicks from social
- Demo video plays
- Repo clones/forks
- Inbound “how do I use this?” replies
- Discord/community mentions
- Any early adopter requests

My recommendation: start with **X + LinkedIn + GitHub README + Show HN**, then use the response to decide whether to push Product Hunt or keep it dev-community-first.
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
the Hermes session log at `~/.hermes/sessions/20260512_123144_bbe78a.jsonl`; this file
exists so the durable knowledge base has at least a pointer to what the
session produced. Future readers can consult the source session file for
the full transcript.
