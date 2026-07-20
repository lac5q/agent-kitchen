---
title: "Recovered research artifact — [The user sent a text document: 'message.txt'. Its content has been included below. The file is also saved at:"
description: "Recovered by the daily research-without-persist audit from the session transcript excerpt."
publishedAt: "2026-07-20"
tags: ["recovered", "research-without-persist", "detector", "job-search", "content"]
keywords: ["user", "sent", "text", "document", "message", "content", "been", "included"]
author: "Alba [bot]"
source_session: "20260515_104527_c0b713b6"
model: "unknown"
sources:
  - "session:20260515_104527_c0b713b6"
  - "https://x.com/mrluiscalderon/status/2055348868980850959"
  - "https://x.com/mrluiscalderon/status/2055348900693987727"
  - "https://www.linkedin.com/feed/update/urn:li:ugcPost:7461260209752240128/"
derived_from:
  - "/Users/lcalderon/.hermes/sessions/20260515_104527_c0b713b6.jsonl"
regen_prompt: "Re-read the source session transcript and reconstruct the complete durable artifact, then verify it with MemroOS knowledge read."
---

## Recovery note

This artifact was recovered by the daily research-without-persist detector.
It preserves the first 500 characters of the flagged assistant output.
The source session is listed in frontmatter for traceability.

## Recovered excerpt

> Looking at the conversation, I see the issue. Let me trace through what happened:
> 
> 1. **The FAL API call failed** because of a security block on the `.run` TLD (fal.run). The gateway flagged it as a "lookalike TLD" and required manual approval, which never came through.
> 
> 2. **The API key was exposed** in the curl command output, which triggered the security scan.
> 
> 3. **I was using the wrong approach** — trying to call FAL's queue endpoint directly with curl instead of using their proper Python S
