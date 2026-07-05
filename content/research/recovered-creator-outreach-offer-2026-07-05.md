---
title: "Creator outreach offer + Collabstr vetting (recovered)"
description: "Recovered research deliverable from session 20260519_173730_5a6fb4 — Collabstr creator vetting (top 3 picks with rates and engagement rates) and a backend-compensation offer structure to reduce upfront cash. Originally produced 2026-05-19 but only persisted to a draft folder outside the canonical knowledge repos; recovered by research-without-persist-detector cron on 2026-07-05."
publishedAt: "2026-07-05"
tags: [memroos, recovered, content-os, collabstr, creator-economy, creator-outreach, marketing]
keywords: [collabstr, creator-outreach, influencer-marketing, backend-compensation, offer-design]
author: "Alba [bot]"
source_session: "20260519_173730_5a6fb4"
model: "minimax-m3"
sources:
  - "https://collabstr.com"
  - "https://github.com/lac5q/memroos/blob/main/content/research/memroos-persist-failure-rca-2026-07-05.md"
derived_from:
  - "content/research/memroos-persist-failure-rca-2026-07-05.md"
  - "content/research/research-without-persist-backlog-2026-07-05.md"
regen_prompt: "Re-read the recovered session JSONL at ~/.hermes/sessions/20260519_173730_5a6fb4.jsonl, extract the longest assistant message containing the creator vetting report and backend-compensation proposal, and write this doc to memroos content/research/recovered-creator-outreach-offer-2026-07-05.md."
---

# Creator outreach offer + Collabstr vetting

**Recovered from session:** `20260519_173730_5a6fb4` (2026-05-19)
**Original ask:** "We need to make progress reaching out to new creators. What content and payment terms should put together for the offer? Can we reduce upfront costs and compensate them on the back end to reduce cash investment?"
**Persist gate status:** ⚠️  Partially — assistant said "Full report saved to `/Users/lcalderon/content-os/drafts/collabstr-influencer-vetting-report.md`" but that path is OUTSIDE the canonical `~/github/knowledge/` and `~/github/memroos/` repos, so the durable-research mission was not fulfilled.
**Recovered by:** `research-without-persist-detector` cron, 2026-07-05.

---

## Deliverable text (verbatim from assistant message)

Here's the vetting report. Out of 40 creators on that Collabstr list, I verified engagement on the top 3 and reviewed all 40 profiles.

## Top 3 Verified Picks

### 1. @_iamdemond (Demond Hicks) ⭐⭐⭐ BEST FIT
- **21K followers, 26.54% ER** (recent posts 0.85-3.55%, above average)
- Dad, author, entrepreneur in Indianapolis
- Fatherhood content, faith, family moments
- **$200/reel, $50/post, $50/story**
- **Perfect for both TY & MMJ** — male dad creator with authentic content

### 2. @capitao.diana (Diana Capitao) ⭐⭐⭐
- **15K followers, 3.43% ER** (Excellent — above median for 10K-50K)
- Toddler mom, parenting support in Beverly, MA
- **$300/reel, $100/story**
- **Best for TY** — toddler mom audience = #1 family gift buyer

### 3. @mo_bronco (Joe Hubbard) ⭐⭐
- **17K followers, 0.32-1.96% recent ER** (acceptable)
- 36yo dad of 2, outdoorsy, Ford trucks/Broncos in St. Louis
- **$200/reel, $50/story, $100/post**
- **Best for MMJ** — adventurous/epic dad angle

## Cost Summary (Top 3)
- **1 reel each:** $700 total
- **1 reel + 1 story each:** $900 total

## Backend Compensation Proposal
To reduce upfront cash:
- **50% upfront, 50% on performance** (tracked via unique discount code)
- **Revenue share:** 10-15% of sales from their code
- **Gifted product + commission:** Free portrait + 15% of all sales

Full report saved to `/Users/lcalderon/content-os/drafts/collabstr-influencer-vetting-report.md`. Want me to reach out to these creators, or check engagement on more from the list first?

---

## Top 3 verified creators (summary)

| Creator | Followers | Engagement | Rate (reel/story/post) | Best for |
|---|---|---|---|---|
| @_iamdemond (Demond Hicks) | 21K | 26.54% | $200 / $50 / $50 | Both TY & MMJ |
| @capitao.diana (Diana Capitao) | 15K | 3.43% | $300 / $100 / — | TY (toddler mom) |
| @mo_bronco (Joe Hubbard) | 17K | 0.32–1.96% | $200 / $50 / $100 | MMJ (adventurous dad) |

**Cost summary (top 3):** 1 reel each = $700. 1 reel + 1 story each = $900.

## Backend-compensation proposal

To reduce upfront cash investment:
- 50% upfront / 50% on performance (tracked via unique discount code)
- 10–15% revenue share on sales from their code
- Gifted product + 15% commission on all sales

## Provenance

- Source session: `~/.hermes/sessions/20260519_173730_5a6fb4.jsonl`
- 8 user messages, 10 assistant messages, 30 URLs cited
- 40 creators on Collabstr list reviewed; top 3 had engagement independently verified
- Original (non-canonical) draft at: `/Users/lcalderon/content-os/drafts/collabstr-influencer-vetting-report.md` (8.7 KB, 173 lines)

## Why this was missed

The assistant did mention saving the report to `~/Users/lcalderon/content-os/drafts/...` — but `content-os/drafts/` is not under either `~/github/knowledge/` (private KB) or `~/github/memroos/` (public product repo). The research did not durably land where the agent infrastructure expects it. This doc restores it to the canonical `memroos/content/research/` path.
