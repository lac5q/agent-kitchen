---
title: "Recovered research — user (session 20260414_210258_3bf226aa)"
description: "Backfill from research-without-persist detector. Original session produced research/analysis content but never called mcp_memroos_knowledge_write. Recovered 2026-07-18 by the daily research-persist audit cron."
publishedAt: "2026-07-18"
tags: [recovery, research-without-persist, backfill]
keywords: [memroos, persist-failure, recovery, user]
author: "Alba [bot]"
source_session: "20260414_210258_3bf226aa"
model: "minimax-m3"
sources:
  - "label:research-without-persist-detector"
  - "file://~/.hermes/sessions/20260414_210258_3bf226aa.jsonl"
derived_from:
  - "content/research/memroos-persist-failure-rca-2026-07-05.md"
regen_prompt: "Read session ~/.hermes/sessions/20260414_210258_3bf226aa.jsonl, extract the largest assistant-side structured content block, and write a recovery markdown describing what the session produced and why it was missed."
---

# Recovered Research — user

**Source session:** `20260414_210258_3bf226aa`
**Recovered:** 2026-07-18 (daily research-persist audit cron)
**Trigger:** research-without-persist detector flagged this session as having produced research-grade output without calling `mcp_memroos_knowledge_write`.

## Original research content (excerpt)

> First 1554 characters of the largest assistant-side structured block recovered from the session transcript.

```
Perfect — all 8 of your photos loaded successfully and face encodings are ready. Here's the summary:

---

**Room Presence Detector is ready.** Script: `~/.hermes/scripts/room_detector.py`

**⚠️ Important note:** qwen3.5-omni is **NOT available** on your DashScope coding plan. Your plan only supports `qwen3-coder-plus` (text-only). So I built this with **local face recognition** instead — which is actually better:

| | qwen3.5-omni (cloud) | Local face-recognition |
|---|---|---|
| Latency | 3-10 sec per check | **Instant** |
| Cost | API calls | **Free** |
| Offline | ❌ | ✅ |
| Privacy | Face data sent to cloud | **Stays on your machine** |

**To run it on your Mac:**
```bash
# Watch for Luis (camera window opens):
python3 ~/.hermes/scripts/room_detector.py

# Adjust sensitivity (lower = stricter match):
python3 ~/.hermes/scripts/room_detector.py --tolerance 0.4

# More frequent checks:
python3 ~/.hermes/scripts/room_detector.py --interval 2

# No voice, just log:
python3 ~/.hermes/scripts/room_detector.py --no-voice

# Register a new person:
python3 ~/.hermes/scripts/room_detector.py --add "Maria"
```

**Dependencies are installed:** dlib, face-recognition, opencv-python, httpx

**What it does:**
- Opens your webcam, checks every 3 seconds
- Detects all faces, compares against your 8 reference photos
- Draws green box + your name when it recognizes you
- Announces "Luis is in the room!" via ElevenLabs TTS (first detection, then 60s cooldown)
- Press `q` to quit

Run it on your Mac (needs a webcam) and it'll work immediately. 🎯
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
the Hermes session log at `~/.hermes/sessions/20260414_210258_3bf226aa.jsonl`; this file
exists so the durable knowledge base has at least a pointer to what the
session produced. Future readers can consult the source session file for
the full transcript.
