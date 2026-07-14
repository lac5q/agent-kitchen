---
title: "Podcast show-art pipeline — Transistor + cover assets"
description: "Canonical podcast cover path, dimensions, show_id, and the Transistor PATCH /v1/shows/<id> flow for swapping show art."
publishedAt: "2026-07-09"
tags: [podcast, transistor, show-art, cover, operations]
keywords: [transistor, podcast-cover, show-art, 3000x3000, contextually-aware]
author: "alba"
model: "minimax-m3"
sources:
  - "label:1password:vl3wi7c73lsid746m5ttzj3fry@Clawdbot"
  - "label:transistor:show_id:72261"
  - "label:filesystem:~/github/Podcast/brand/covers/podcast-cover-1.png"
regen_prompt: "List the canonical podcast cover path + dimensions, the Transistor show_id for Contextually Aware, the 1Password token name + vault, and the PATCH /v1/shows/<id> flow for swapping show art (catbox.moe upload → form-encoded show[image_url] → verify GET)."
derived_from: []
---

# Podcast show-art pipeline

## Canonical assets

- **Cover image**: `~/github/Podcast/brand/covers/podcast-cover-1.png`
  - Dimensions: **3000×3000**
  - File size: ~2.7 MB
- **Show**: Contextually Aware
- **Transistor show_id**: `72261`

## Credentials

- **1Password**: item `Transistor` / token `vl3wi7c73lsid746m5ttzj3fry`
- **Vault**: `Clawdbot`

## Swap show art — recipe

1. Upload replacement image to a public host (typical: `catbox.moe`).
2. `PATCH /v1/shows/72261` with form-encoded body `show[image_url]={public_url}`. Auth header from the 1Password token.
3. Verify via `GET /v1/shows/72261` — confirm `image_url` matches.
4. Reusable script (when present): `/tmp/transistor_show_art.py`.

## Pitfalls

- Transistor rejects images that don't meet the size/format spec. Always export at exactly 3000×3000 PNG/JPG before upload.
- Public-host URLs sometimes 403 from Transistor's fetcher depending on CDN. Prefer `catbox.moe` — known-good.
- Don't re-upload the same URL repeatedly; Transistor may cache and the GET will look unchanged even after a successful PATCH.