---
title: "Luis's AI Vendor Footprint and Decision Rules (2026-07-22)"
description: "Durable record of which AI subscriptions Luis runs, their real burn rates, and the rules for choosing between them. Built so future agents don't re-ask the lay of the land."
publishedAt: "2026-07-22"
tags: [ai, inference, vendors, footprint, rules, codexbar]
keywords: [MiniMax M3, Gemini 3.6 Flash, Codex Pro 5x, Claude Pro, OpenRouter, Alibaba Coding Plan, token costs]
author: "Alba"
source_session: "discord-epilogue-1529624249533206609"
model: "MiniMax-M3"
sources:
  - "https://ai.google.dev/pricing"
  - "https://www.artificialintelligence-news.com/news/googles-gemini-3-6-flash-targets-enterprise-agent-token-costs/"
  - "label:codexbar-snapshot-2026-07-22"
derived_from:
  - "agent-operations/ai-inference-usage-audit/SKILL.md"
regen_prompt: "Pull current CodexBar snapshot for codex/minimax/claude/openrouter/gemini/alibaba-coding-plan, sum credits and windows per skill cookbook, ask Luis which plan comparison he wants this week, output breakeven table."
---

# Luis's AI Vendor Footprint and Decision Rules

Snapshot date: **2026-07-22**. CodexBar is the only ground-truth source for bundled sub burn (per MEMORY, 2026-07-22).

## Active subscriptions (CodexBar live)

| Vendor | Plan | $/mo | 30d burn (heavy-user est.) | Source |
|---|---|---|---|---|
| Codex | Pro 5x | $200 | ~419M tokens (4,189 credits × ~100K tok/credit) | CodexBar `openaiDashboard.dailyBreakdown` sum |
| MiniMax M3 | Max | $50 | ~1.2B tokens (37% weekly × 750M cap × 4.33 wk) | CodexBar weekly % |
| Claude | Pro | $20 | ~85M tokens (26% weekly × 50M cap × 4.33 wk + Daily Routines 0%) | CodexBar weekly % |
| OpenRouter | Prepaid | ~$25 amortized | ~300M tokens (mixed model, $0.50/M blended) | PostPeer + CodexBar balance |
| Alibaba Coding Plan | Flat | $20 | ~50M (mostly idle after 2026-07-03 expiry) | Past sessions |
| Gemini | Free + API | $0 | <5M | CodexBar 0% window |

**Total:** ~2.06B tokens/mo across ~$315/mo of subscriptions. Heavy-agent workload, 4-8 concurrent sessions.

## Vendor-by-vendor rules

### Codex Pro 5x ($200/mo, bundled credits)
- **Use for:** frontier reasoning (GPT-5.x), Exec/CLI surface (workhorse)
- **Don't use for:** cheap fill-in (Gemini/Claude Haiku does that cheaper per-token)
- **Heavy-user ratio:** ~100K tokens/credit. Naive "1 credit = 100 tokens" is wrong by 4-6×.
- **Codexbar dashboard wins over state.db** — state.db undercounts by 10-100× because it only sees API-key-billed traffic, not Desktop/CLI/Exec bundles.

### MiniMax M3 Max ($50/mo)
- **Use for:** default reasoning layer when Codex burns out, M3 capability is in the right tier for 70% of tasks.
- **Weekly cap is 750M, NOT 5.05B.** The 5.05B figure is the API promo rate. CodexBar reads the 750M cap and that's what counts.
- **At Luis's current 278M/wk burn:** the $50 plan is ~108× cheaper than equivalent Gemini 3.6 Flash paid volume.

### Claude Pro ($20/mo)
- **Use for:** specific Claude-isms (long-context summarization, code review), not as default.
- **Weekly cap:** 50M tokens (Anthropic published). Not unlimited like M3.

### OpenRouter (prepaid, balance-based)
- **Use for:** one-off frontier calls (Opus, Sonnet 4.5, etc.) when M3/Codex run out.
- **Default blended assumption:** $0.50/M (mixed model mix). Re-extract if heavy Claude/GPT frontier.

### Alibaba Coding Plan (subscribed 2026-03 → expired 2026-07-03, currently idle)
- **Status:** cancelled.
- **Key gotcha:** API key format `sk-sp-*` only works against `coding-intl.dashscope.aliyuncs.com/v1`, not standard dashscope.

### Gemini (free tier + API)
- **Free tier:** rate-limited, no SLA. Good for prototypes and tests, not for production agents.
- **API:** paid tier useful for batch/async workloads (Flash batch is half off).

## The 3-line decision rule

```
If tokens/mo < 30M    → Gemini 3.6 Flash free or paid
If tokens/mo 30M–1.5B → MiniMax M3 Max ($50) is cheaper than Gemini paid
If tokens/mo > 1.5B   → Add Codex Pro 5x or OpenRouter prepaid, M3 alone won't cover
```

## Calibration knobs Luis has corrected on (per MEMORY, 2026-07-21)

- Codexbar wins over user-stated plan tier (people misremember what they bought).
- `state.db` only sees API-key-billed traffic, not Desktop/CLI/Exec → use CodexBar for bundled-sub burn (10-100× underestimate risk).
- Unpinned cron jobs fail with "global inference config drifted" after `hermes config set model.provider` — re-pin via `cronjob action='update' model={...}`.

## Agent operating rules (do not re-explain to Luis)

1. Don't ask "what does your inference footprint look like" again — it's above. Read this entry first.
2. Don't ask "how much do you actually spend on AI" — this entry + CodexBar live data has it.
3. Don't quote price-card numbers without anchoring on Luis's actual CodexBar 30-day burn.
4. Don't recommend M3 for a sub-30M-tokens/mo workload (Gemini free is better).
5. Don't recommend Gemini paid for a 1B+ tokens/mo workload (M3 is ~108× cheaper at current Luis volume).
6. When the user pastes a credential in chat, treat it as compromised, refuse to write it into commands/scripts/env files. Offer the dashboard paste-back path instead.
7. When the user says "ship it" for stage-6, cherry-pick onto main with `--force-with-lease` and a one-line disclosure; otherwise wait.

## Related artifacts

- Skill: `agent-operations/ai-inference-usage-audit/SKILL.md` — pulls the numbers
- Script: `~/.hermes/scripts/inference-breakeven.py` — computes breakeven tables
- Recipe: `agent-operations/ai-inference-usage-audit/references/vendor-decision-recipe.md` — answers "is X better than Y" questions
- Comparison: `content/research/gemini-3-6-flash-vs-minimax-m3-2026-07-22.md` — the specific question that prompted this entry

## Update cadence

Refresh this entry when:
- A subscription starts/ends/cancels
- The weekly burn on any vendor changes by >50% vs the snapshot above
- Luis corrects an assumption or adds a new vendor

Triggers: session_search for "vendor footprint" or "codexbar burn" with `sort=newest` will surface the latest version.
