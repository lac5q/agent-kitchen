---
title: "RCA — Duplicate Transistor Drafts on Episode-026 (One Billion Tokens a Day)"
date: 2026-07-10
agent: alba
sources:
  - session:20260709_193424_94b6c8
  - session:20260710 (current)
derived_from: incident response to Luis's "two episodes that failed" report
regen_prompt: "duplicate Transistor drafts stuck on missing audio file"
model: minimax-m3
tags: [podcast, transistor, rca, dedup, audio-processing, pitfall-102]
---

# RCA — Duplicate Transistor Drafts on Episode-026

## Summary

Two identical Transistor drafts (`3386085`, `3386087`) for episode-026 "One Billion Tokens a Day" both showed "Missing audio file" in the dashboard. Root cause: `publish_draft.py` was invoked twice within 70 seconds (likely a retry from a partially-failed prior session). Neither run completed Transistor's post-processing pipeline. Audio on disk is correct; CMS MDX audio wiring is correct. Recovery: (1) flagged the duplicate with `[DUPLICATE-DELETE-ME]` title prefix, (2) re-bound audio on the keeper with a fresh authorize URL, (3) assigned `number=26` so it shows correctly in the dashboard. **Transistor's audio processing for the keeper remains stuck after 5+ minutes of retries — the dashboard warning is real and unresolvable from the API; requires manual Transistor support intervention or dashboard rebuild.**

## Key facts

- Two drafts created at `2026-07-09T19:44:29Z` (`3386085`) and `2026-07-09T19:45:32Z` (`3386087`)
- Both stuck on `audio_processing=true` + `audio_url=None` after 24+ hours
- `media_url` set on both but returns **HTTP 404** on the CDN — the URL is in the DB but the bytes were never committed to the served path
- Audio file on disk: `~/github/Podcast/episodes/episode-026/audio/episode-026.mp3` (6,198,378 bytes, 387.32s) — valid, correct
- CMS audio file `~/github/growthalchemylab/public/audio/one-billion-tokens-a-day.mp3` is byte-identical to the canonical episode audio (md5 match) — MDX wiring was correct
- Two re-bind attempts with fresh authorize URLs both failed to update `media_url` — Transistor is not unsticking from API
- Transistor `DELETE /v1/episodes/{id}` returns 500 — manual dashboard removal required

## What changed (skill updates)

- **Pitfall #102** added to `article-to-podcast-pipeline` SKILL.md: pre-create dedup gate in `publish_draft.py`
- **`publish_draft.py`**: queries show listing before `POST /v1/episodes`, reuses existing draft if title matches and audio is ready, flags stuck duplicates with `[DUPLICATE-DELETE-ME]` and continues
- **Pitfall #103** added: tone accessibility rule (jargon gloss, metaphors, no "as you know", two-channel explanation) for articles/podcast/X/LinkedIn
- **Pitfall #104** added: X + LinkedIn voice defaults — conversational, self-deprecating, sarcastic (NOT snarky)
- **`content-publishing-os` SKILL.md**: new "Tone & Accessibility for X + LinkedIn" section consolidating both rules
- **`copywriting/luis-writing-style` SKILL.md**: "Accessibility for the tech-aware-but-not-deep reader" section added

## Prevention

- The dedup gate (Pitfall #102) prevents the same title from being published twice in the future
- A future enhancement (not yet done): `verify_after_publish.py` that runs after every `publish_draft.py` invocation and confirms exactly one draft exists per `script.json.title`
- Existing Pitfall #69 covers batch verification; existing Pitfall #65 covers stuck-audio reprocess — both applied, neither unblocked this incident

## Outstanding manual step

Luis needs to open the Transistor dashboard, find the draft titled `[DUPLICATE-DELETE-ME] One Billion Tokens a Day: A Working Hypothesis, Not a Flex`, and click Delete manually. Then either click Publish on `3386087` once Transistor's processing recovers, or contact Transistor support to force the audio to commit (the bytes are uploaded but the CDN is not serving them).

## Reference

Full RCA at `~/github/Podcast/retros/2026-07-10-duplicate-transistor-drafts.md`