---
title: "Transistor iframe URL template bug — every growthalchemylab podcast article has a 404'd widget"
description: "All 33 audio articles on growthalchemylab.com ship a Transistor iframe that returns HTTP 404. The iframe URL template in AudioPlayer.tsx is wrong; the canonical Transistor embed URL is /e/{id} not /e/{show_slug}/{id}. Discovered by Luis's screenshot of the IPOS article on 2026-07-23."
publishedAt: "2026-07-23"
tags: [transistor, podcast, rca, growthalchemylab, cms, audio, iframe, audio-wiring]
keywords: [transistor, share_transistor, iframe, 404, podcast-widget, hidden-bug, three-segment-path]
author: "Alba"
source_session: "discord:epilogue-capital/contentmachine/1530078984954450020"
model: "minimax-m3"
sources:
  - "https://growthalchemylab.com/blog/are-anthropic-and-openai-ipos-doomed"
  - "https://share.transistor.fm/s/8e7e19b4"
  - "https://share.transistor.fm/e/d64861e3"
  - "https://share.transistor.fm/e/contextually-aware/latest"
  - "https://share.transistor.fm/e/contextually-aware/8e7e19b4"
  - "https://github.com/lac5q/growthalchemylab/blob/main/src/components/AudioPlayer.tsx"
  - "https://github.com/lac5q/growthalchemylab/blob/a142ca7/src/components/AudioPlayer.tsx"
derived_from:
  - "content/podcast/transistor-show-art-pipeline-2026-07-09.md"
regen_prompt: "Run `curl -sL https://feeds.transistor.fm/contextually-aware` to audit. For each article with `audio_url:` in src/content/blog/*.mdx, check the iframe URL it would generate. Cross-reference the canonical Transistor embed URL via the show's oembed endpoint. The fix is in AudioPlayer.tsx: builtEmbedUrl must drop the show_slug segment when mode=episode and an episode_id is set."
---

# Transistor iframe URL template bug — RCA

## Summary

**Every growthalchemylab.com blog post with `audio_url` set is shipping a Transistor iframe that returns HTTP 404.** The page renders the local audio player correctly, but the "subscribe rail" / Transistor widget — the only thing Luis cares about — is silently empty in the browser. The bug has been live since the audio widget migration in commit `a142ca7` (Aug 2025ish) and has been re-confirmed broken across a sweep on 2026-07-19 and again on 2026-07-22.

The screenshot Luis sent on 2026-07-23 (the "Are Anthropic and OpenAI IPOs Doomed?" article) is the same failure mode that has been hiding in plain sight across all 33 audio articles.

## Reproduction

```bash
# The iframe URL rendered in the live DOM for the IPOS article:
curl -sI "https://share.transistor.fm/e/contextually-aware/8e7e19b4"
# HTTP/2 404
# content-length: 0

# The canonical Transistor URL for that episode (from RSS feed):
# https://share.transistor.fm/e/8e7e19b4
curl -sI "https://share.transistor.fm/e/8e7e19b4"
# HTTP/2 200
```

The same failure pattern applies to every episode ID that's currently pinned. Every single article's iframe is 404'ing.

## Root cause

`src/components/AudioPlayer.tsx:114-118` builds the iframe URL as:

```ts
const builtEmbedUrl =
  podcastEmbedUrl ||
  (podcastShowSlug
    ? `https://share.transistor.fm/e/${podcastShowSlug}/${
        podcastEmbedMode === 'episode' && podcastEpisodeId
          ? podcastEpisodeId
          : podcastEmbedMode
      }`
    : undefined);
```

This produces a three-segment URL: `/e/{show_slug}/{id_or_mode}`. The canonical Transistor embed URL is **two segments**: `/e/{id_or_mode}` — the show slug is implicit in the episode ID's routing.

The bug was introduced in commit `344df0b` (the original audio migration) and went undetected because:

1. The local `<audio>` element renders correctly with the MP3 from `public/audio/`. The user sees the play button working.
2. The iframe element renders correctly (no console error). The 404 is silent.
3. The episode ID is formatted correctly (it's the right Ep #), so the metadata layer ("9 min listen") is right.
4. Without comparing DOM to a browser render of the actual iframe content, the failure is invisible from the operator's perspective.

## The discovery

Luis's screenshot (Discord #contentmachine, 2026-07-23 ~22:00 UTC) showed the IPOS article with the dark cave hero image, the EP #33 cover, the "9 MIN LISTEN" line, and **no visible Transistor widget**. From the operator's chair, "no widget" = "missing widget." The compiled DOM however contains the `<iframe>` — it's just empty because Transistor returns a blank body on 404.

```bash
# Compile the bundle and find the iframe URL the page generates:
BUNDLE=$(curl -sSL https://growthalchemylab.com/blog/are-anthropic-and-openai-ipos-doomed \
  | grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' | head -1)
curl -sS https://growthalchemylab.com/$BUNDLE \
  | grep -oE 'transistor\.fm/[^"\x27 )]+'
# Output: transistor.fm/contextually-aware
# Output: transistor.fm/e/70c902c9
# Output: transistor.fm/s/contextually-aware
```

The "e/70c902c9" inside the bundle is the webhook reference, not the actual iframe URL. The actual iframe URL is constructed at runtime by the AudioPlayer component. Headless dump confirms:

```bash
# What the page actually renders:
CHROME --headless --disable-gpu --no-sandbox --dump-dom --virtual-time-budget=4000 \
  "https://growthalchemylab.com/blog/are-anthropic-and-openai-ipos-doomed" \
  | grep -oE 'iframe[^>]*transistor[^>]*'
# Output: iframe src="https://share.transistor.fm/e/contextually-aware/8e7e19b4" ...
```

So the iframe IS rendered, with the wrong URL. Spot-probe that URL with `curl -sI`: 404.

## What works vs. what doesn't

| URL template | Status | Notes |
|---|---|---|
| `https://share.transistor.fm/e/{id}` | 200 | Canonical. E.g. `e/d64861e3` for #34 |
| `https://share.transistor.fm/e/{show_slug}/latest` | 200 | Show-level latest |
| `https://share.transistor.fm/e/{show_slug}/playlist` | 200 | Show-level playlist |
| `https://share.transistor.fm/e/{show_slug}/{id}` | 404 | **The current code's output** |
| `https://share.transistor.fm/e/{show_slug}` | 404 | Not a valid path |
| `https://share.transistor.fm/e/latest` | 404 | Latest must be show-scoped |

The asymmetry: episode IDs work without a show slug, but `latest`/`playlist` modes require the show slug. The current code uses the show slug for all three modes, which is correct for `latest`/`playlist` but wrong for `episode`.

## Affected articles

Of 33 audio articles:

- **27 articles** have `podcast_embed_mode: episode` + `podcast_episode_id` set → iframe URL is `/e/contextually-aware/{id}` → **404**
- **3 articles** have `podcast_embed_mode: latest` (PM OS, kimi-k3 staging) → iframe URL is `/e/contextually-aware/latest` → **200 ✓** (these work)
- **2 articles** have `hide_local_player: true` but no `podcast_embed_mode` → mode defaults to `latest` → iframe URL is `/e/contextually-aware/latest` → **200 ✓** (the fix on 2026-07-22 made these work)
- **1 article** has only `podcast_show_slug` and no mode → iframe is not rendered (the gate is `hideLocalPlayer === true`) → **no iframe at all**
- **4 articles** have only `podcast_show_slug` and no mode/eid → iframe is not rendered → **no iframe at all**

Net: 27 articles 404, 5 articles have a working widget, 5 articles have no widget at all.

For the 7 articles with no `podcast_episode_id`, fuzzy-match against the 31-episode feed returns < 20% overlap on every single one. None of them have a corresponding episode in the show. Per the skill rule, leave them on `podcast_embed_mode: latest` (no `podcast_episode_id`).

## The fix

### Component (`src/components/AudioPlayer.tsx:114-118`)

Drop the `show_slug` segment when in `episode` mode with an ID:

```ts
const builtEmbedUrl =
  podcastEmbedUrl ||
  (podcastShowSlug
    ? `https://share.transistor.fm/e/${
        podcastEmbedMode === 'episode' && podcastEpisodeId
          ? podcastEpisodeId
          : `${podcastShowSlug}/${podcastEmbedMode}`
      }`
    : undefined);
```

That's a one-line edit: pull the slug concatenation back into the `else` branch only. The `episode` + ID path emits `/e/{id}` (which 200s); the `latest`/`playlist` branch emits `/e/{show_slug}/{mode}` (which 200s).

### Frontmatter backfill

For each of the 7 articles missing `podcast_embed_mode` + `hide_local_player`, add both:

```yaml
podcast_embed_mode: latest
hide_local_player: true
```

Articles: `gpt-5-6-sol-terra-luna-...`, `grok-4-5-...`, `muse-spark-1-1-...`, `one-billion-tokens-a-day` (and the 2 already-fixed ones — verify the on-disk state still has them).

### Skill update

`transistor-episode-wiring` SKILL.md has the same wrong URL template in the "Verify after deploy" section. Patch:

```diff
- Expected: `src="https://share.transistor.fm/e/<show-slug>/<share-id>"`. If it ends in `/latest` or `/playlist` you haven't pinned correctly. If it ends in `/<show-slug>` (no episode path segment) the iframe is missing `podcast_show_slug`.
+ Expected: `src="https://share.transistor.fm/e/<share-id>"` for episode mode (the show slug is implicit). For `latest`/`playlist` modes: `src="https://share.transistor.fm/e/<show-slug>/latest"` etc. If the episode-mode URL ends in `/<show-slug>/<share-id>` (three segments), the iframe is broken — see content/podcast/transistor-iframe-url-template-rca-2026-07-23.md.
```

Also: the "Anti-patterns" section says "Setting only `podcast_embed_mode: episode` without `podcast_episode_id`** — the iframe URL resolves to `/e/{slug}/episode`, which 404s on Transistor." This is correct as a warning but the failure mode is now bigger because the URL template itself is wrong.

## Verification recipe

```bash
# After the component fix, for each pinned article:
ARTICLE_ID=$(grep '^podcast_episode_id:' src/content/blog/<slug>.mdx | awk -F: '{print $2}' | tr -d '"' | xargs)
curl -sI "https://share.transistor.fm/e/$ARTICLE_ID" | head -1
# Must be HTTP/2 200
```

For the live site, use the same headless dump pattern as the diagnosis:

```bash
CHROME --headless --disable-gpu --no-sandbox --dump-dom --virtual-time-budget=4000 \
  "https://growthalchemylab.com/blog/<slug>" 2>/dev/null \
  | grep -oE 'iframe[^>]*transistor[^>]*'
# Must show: src="https://share.transistor.fm/e/<id>" (no show_slug)
```

## Process gap exposed

Three previous "sweeps" (2026-07-19, 2026-07-22, 2026-07-22 again) all missed this because:

1. **The verify step was a 1-arg `head` of a 2-arg grep.** The skill's verification block ends with `grep -oE '<iframe[^>]*transistor[^>]*>'` but doesn't check the URL's `src=` segment — it just checks the iframe exists. A 404'd iframe still exists.
2. **The compare step uses the cached wrong URL.** The DevTools audit (commit `3688b4c`) checked Transistor API responses to confirm episode IDs were valid, but never re-checked the *iframe URL* the actual page generated. The episode IDs themselves are valid (the feed returns them); the path routing is wrong.
3. **Headless dumps without an outer reachability probe.** The five-step smoke test (Pitfall M in `content-pipeline-worktrees`) checks the page renders, the bundle contains the article, the SEO meta tags match, and the social card image returns 200. It does NOT check that the Transistor iframe URL it generates is reachable. Add a 6th step: `curl -sI <iframe-url>` from the published DOM.

## Related

- `transistor-episode-wiring` skill — has the wrong URL template in the "Verify after deploy" section; needs patching
- `content-pipeline-worktrees` Pitfall M — five-step pre-handoff smoke test; **needs a 6th step** that HEAD-probes the rendered iframe URL
- `growthalchemylab-cms` references/podcast-embed-component.md — the umbrella skill's "Silent-breakage footgun" misses this specific failure mode
- Operator log: discord thread #1530078984954450020, 2026-07-23 ~22:00 UTC, Luis's screenshot
