---
title: "Recovered research — luis (session 20260412_093636_443c8ba6)"
description: "Backfill from research-without-persist detector. Original session produced research/analysis content but never called mcp_memroos_knowledge_write. Recovered 2026-07-18 by the daily research-persist audit cron."
publishedAt: "2026-07-18"
tags: [recovery, research-without-persist, backfill]
keywords: [memroos, persist-failure, recovery, luis]
author: "Alba [bot]"
source_session: "20260412_093636_443c8ba6"
model: "minimax-m3"
sources:
  - "label:research-without-persist-detector"
  - "file://~/.hermes/sessions/20260412_093636_443c8ba6.jsonl"
derived_from:
  - "content/research/memroos-persist-failure-rca-2026-07-05.md"
regen_prompt: "Read session ~/.hermes/sessions/20260412_093636_443c8ba6.jsonl, extract the largest assistant-side structured content block, and write a recovery markdown describing what the session produced and why it was missed."
---

# Recovered Research — luis

**Source session:** `20260412_093636_443c8ba6`
**Recovered:** 2026-07-18 (daily research-persist audit cron)
**Trigger:** research-without-persist detector flagged this session as having produced research-grade output without calling `mcp_memroos_knowledge_write`.

## Original research content (excerpt)

> First 3823 characters of the largest assistant-side structured block recovered from the session transcript.

```
Here's your **V3** package for review:

---

## 📹 Video

MEDIA:/Users/lcalderon/.hermes/audio_cache/linkedin-v3-final.mp4

**Specs:** 1280x720, H.264 video + AAC audio, ~117 seconds, 7.1 MB

**What's in it:**
- Real GitHub README walkthroughs with **actual content** from each repo
- Simulated browser navigation: lands on repo → shows Code tab → scrolls through README sections
- "Why It Matters" callout overlay for each repo
- MiniMax voice (your cloned voice `moss_audio_911b69b8`) for the main content
- The outro last ~4 seconds has a slight voice transition since MiniMax hit its daily TTS limit

**Timeline:**
- **0:00-0:05** — Title: "5 Trending AI Repos — A walkthrough with Luis Calderon"
- **0:05-0:26** — **#1 Hermes Agent** — lands on repo, scrolls README (Overview, Features, Architecture), "Why It Matters" overlay
- **0:26-0:47** — **#2 Archon** — lands on repo, scrolls README (Problem, Concepts, Usage), "Why It Matters" overlay
- **0:47-1:08** — **#3 Google AI Edge Gallery** — lands on repo, scrolls README (Features, Get Started, Tech), "Why It Matters" overlay
- **1:08-1:29** — **#4 LiteRT-LM** — lands on repo, scrolls README (What's New, Features, Quick Start), "Why It Matters" overlay
- **1:29-1:50** — **#5 Cua** — lands on repo, scrolls README (Sandboxes, CuaBot, Benchmarks), "Why It Matters" overlay
- **1:50-1:57** — Summary: "The Pattern Is Clear" with all repos listed

---

## 📝 LinkedIn Post Copy

```
Five artificial intelligence agent repos just EXPLODED with 15,000+ stars this week.

Here's what's actually worth your attention:

→ Hermes Agent (65.8k ★): Self-improving agent framework that learns from feedback and remembers who you are across sessions. Most agents are static. This one gets better the more you use it.

→ Archon (17k ★): The first open-source harness builder for AI coding. Define workflows in YAML and get deterministic, repeatable results. Like Dockerfiles for AI coding.

→ Google AI Edge Gallery (20.7k ★): Run powerful language models on your mobile device. Fully offline. Fully private. Zero latency. Your data never leaves your device.

→ LiteRT-LM (9.8k ★): Edge inference engine that runs LLMs on phones at native speeds. Cross-platform with hardware acceleration. Production-grade models in your pocket.

→ Cua (13.5k ★): Open-source infrastructure for computer-use agents. Sandboxes, SDKs, and benchmarks so agents can actually interact with any operating system.

The pattern is clear. Artificial intelligence is moving from cloud services to local, deterministic, and composable systems.

Full repo links in comments 👇

#AI #MachineLearning #GitHub #OpenSource #Developers #ArtificialIntelligence #TechTrends
```

---

## 💬 First Comment (Repo Links)

```
Repo links:

1. Hermes Agent (65.8k ⭐): https://github.com/nousresearch/hermes-agent
   - Self-improving autonomous agent with multi-agent orchestration

2. Archon (17k ⭐): https://github.com/coleam00/archon
   - Deterministic AI coding harness builder with YAML workflows

3. Google AI Edge Gallery (20.7k ⭐): https://github.com/google-ai-edge/gallery
   - On-device foundation models, zero latency, full privacy

4. LiteRT-LM (9.8k ⭐): https://github.com/google-ai-edge/litert-lm
   - Edge inference engine for mobile LLMs at native speeds

5. Cua (13.5k ⭐): https://github.com/trycua/cua
   - Open-source infrastructure for computer-use agents
```

---

## ⚠️ Known Issues

1. **MiniMax TTS quota exhausted** — The last ~4 seconds of audio uses Edge TTS (different voice) because MiniMax hit its daily limit. The main content (repos 1-5 and intro) all uses your cloned MiniMax voice consistently.

2. **4th repo replaced** — `openscreen/openscreen` doesn't exist on GitHub, so I used `trycua/cua` (13.5k stars, computer-use agents) as the 5th repo instead.

Want any changes before posting?
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
the Hermes session log at `~/.hermes/sessions/20260412_093636_443c8ba6.jsonl`; this file
exists so the durable knowledge base has at least a pointer to what the
session produced. Future readers can consult the source session file for
the full transcript.
