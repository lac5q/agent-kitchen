---
title: "Recovered research — user (session 20260514_132346_40cc3d5d)"
description: "Backfill from research-without-persist detector. Original session produced research/analysis content but never called mcp_memroos_knowledge_write. Recovered 2026-07-18 by the daily research-persist audit cron."
publishedAt: "2026-07-18"
tags: [recovery, research-without-persist, backfill]
keywords: [memroos, persist-failure, recovery, user]
author: "Alba [bot]"
source_session: "20260514_132346_40cc3d5d"
model: "minimax-m3"
sources:
  - "label:research-without-persist-detector"
  - "file://~/.hermes/sessions/20260514_132346_40cc3d5d.jsonl"
derived_from:
  - "content/research/memroos-persist-failure-rca-2026-07-05.md"
regen_prompt: "Read session ~/.hermes/sessions/20260514_132346_40cc3d5d.jsonl, extract the largest assistant-side structured content block, and write a recovery markdown describing what the session produced and why it was missed."
---

# Recovered Research — user

**Source session:** `20260514_132346_40cc3d5d`
**Recovered:** 2026-07-18 (daily research-persist audit cron)
**Trigger:** research-without-persist detector flagged this session as having produced research-grade output without calling `mcp_memroos_knowledge_write`.

## Original research content (excerpt)

> First 4003 characters of the largest assistant-side structured block recovered from the session transcript.

```
## Honest Review: Content Publishing Agent Status

**Bottom line first: The agent is NOT working. Nothing for tomorrow is actually scheduled. The PRD LinkedIn post from yesterday went out, but that's it.**

---

### What Actually Happened Today

**Yesterday's LinkedIn post (PRD Is Becoming a Test Harness):**
- ✅ Scheduled via PostPeer, postId `6a04f855dc609740a26fb548`
- ✅ Went live May 13 at 17:15 PT
- ❓ No native LinkedIn metrics captured yet (PostPeer returns null for your LinkedIn account, as noted in the skill)

**Today's cron runs (job e6a319800f81):**
- **06:30 run:** Failed with HTTP 429 (engine overloaded). Nothing produced.
- **10:11 run:** The agent recovered, created a full run folder for May 15 (`2026-05-15-daily-slate`), drafted 3 X threads + 1 LinkedIn post, generated all 4 animated MP4/GIF assets...
- **But:** The scheduling script has a **corrupted API key line** (`os.env...EY")`) and exits immediately with "Missing POSTPEER_API_KEY"
- **Result:** Nothing is scheduled for tomorrow. The run folder sits in `active/` with no `scheduler.md` and no posts in PostPeer.

---

### Critical Problems

**1. The scheduling script is broken**
Line 6: `API_KEY=os.env...EY")` — truncated/corrupted. This is why nothing gets published. The agent generates content, creates assets, then fails at the last mile.

**2. No Content Registry updates**
The skill requires recording every post in Content Registry with DNA metadata. I see zero registry activity. The agent isn't closing the loop.

**3. No reply execution**
The strategy calls for 2 strategic replies per weekday. The drafts identify reply targets (Sam Altman Codex tweet, SAP Sapphire post) but there's no evidence any replies were actually posted.

**4. No feedback loop**
After the PRD LinkedIn post went live, there's no performance capture, no native screenshot, no winner/loser classification. The agent isn't learning.

---

### Is It Posting Too Much?

**No. It's posting too little.** You have:
- 1 LinkedIn post in the last 2 days
- 0 X posts scheduled for tomorrow (despite full drafts ready)
- 0 replies executed

The cadence target is 3 X originals + 2 replies + 1 LinkedIn per weekday. You're at roughly 5% of target.

---

### Strategy Alignment: Good Intent, Bad Execution

**What's working:**
- The content quality is actually strong. The Uber token-burn thread, Anthropic vs OpenAI reframe, and ERP old-world/new-world framework all follow the winner-replication playbook.
- Animated assets are being generated (4 MP4s + GIFs + static fallbacks) in the right GAL style.
- Source signals are timely (Ramp AI Index, SAP Sapphire, Uber CTO quote).

**What's not working:**
- **No publish step.** The agent drafts well but can't ship because of the broken API key.
- **No HIL gate actually happening.** The skill says "NO API CALLS until Luis approves" but the agent is supposed to draft and present for review. Instead it tries to auto-schedule and fails silently.
- **No reply execution.** Replies are half the X strategy and they're completely absent.
- **No performance feedback.** Without metrics, the winner-replication loop is dead.

---

### What Needs to Happen Now

**Immediate (today):**
1. Fix the `schedule_posts.py` script — restore the proper `os.environ.get("POSTPEER_API_KEY")` line
2. Manually schedule tomorrow's slate (3 X threads + LinkedIn) since drafts and assets are ready
3. Execute the 2 reply targets identified in the draft package

**This week:**
4. Add a verification step to the cron that checks if posts actually got scheduled (not just "script ran")
5. Build a reply execution path — replies can't go through the same HIL gate as originals, they need a faster lane
6. Capture LinkedIn native metrics (screenshot or export) since PostPeer returns null

**The agent is generating good content but failing at the one job that matters: getting it in front of people.** Fix the API key, close the loop on scheduling verification, and start executing replies. Everything else is noise.
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
the Hermes session log at `~/.hermes/sessions/20260514_132346_40cc3d5d.jsonl`; this file
exists so the durable knowledge base has at least a pointer to what the
session produced. Future readers can consult the source session file for
the full transcript.
