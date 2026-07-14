---
slug: meta-muse-spark-1-1-race-and-chinese-models-2026-07-09
title: "Meta's Muse Spark 1.1 Drops. The Race Just Got Louder — and the Chinese Models Aren't Backing Down."
date: 2026-07-09
author: Luis Calderon
model: MiniMax-M3 (Alba session)
status: published-as-discord-article
sources:
  - https://x.com/finkd/status/2075218444056707458
  - https://x.com/ArtificialAnlys/status/2041913043379220801
  - https://ai.meta.com/blog/introducing-muse-spark-msl
  - https://x.com/AndrewCurran_/status/2072858780816330833
  - https://observer.com/2026/06/alexandr-wang-defends-meta-muse-spark-model
  - https://deepseek.ai/pricing
  - https://aitoolsrecap.com/Blog/kimi-k2-6-review-2026
  - https://felloai.com/qwen-3-7-max-review
  - https://serenitiesai.com/articles/glm-5-1-zhipu-coding-benchmark-claude-opus-comparison-2026
  - https://www.aimagicx.com/blog/llm-api-pricing-comparison-2026
derived_from: Zuck X thread + Artificial Analysis + April 2026 Muse Spark launch coverage
regen_prompt: "Write an operator-first article on Meta Muse Spark 1.1 for the @contentmachine Discord thread. Cover: (1) what was actually shipped, (2) where Spark wins/loses on benchmarks, (3) the price war with Chinese models (DeepSeek V4, Kimi K2.6, Qwen3.7-Max, GLM-5.1), (4) honest daily-driver verdict for someone currently on MiniMax-M2.7."
---

# Meta's Muse Spark 1.1 Drops. The Race Just Got Louder — and the Chinese Models Aren't Backing Down.

**By Luis Calderon · July 9, 2026 · 4 min read**

Mark Zuckerberg returned to X today with a one-line announcement that nobody in AI expected to actually move the needle:

> "Today we're releasing Muse Spark 1.1 — a strong agentic and coding model at a very low price. It's available through our new Meta Model API and in Meta AI." — [@finkd, Jul 9 2026](https://x.com/finkd/status/2075218444056707458)

The reason it's interesting isn't the model itself. It's the timing, the price positioning, and who it actually competes with. Because if you read the benchmark sheets carefully, Muse Spark 1.1 isn't trying to beat GPT-5.4 or Claude Opus 4.6. It's trying to break the Chinese model price floor — and that's a much different fight.

## What Meta Actually Shipped

Muse Spark 1.1 is the first major upgrade to the model Meta dropped back in April as the debut product of **Meta Superintelligence Labs (MSL)** — the rebuilt AI unit Zuck stood up nine months ago after the Llama 4 fiasco, with Scale AI's Alexandr Wang installed as chief AI officer after a $14.3B deal.

Quick refresher on the lineage:

- **Llama 4** (April 2025) — publicly benchmark-contaminated. Departing AI leadership confirmed it. Meta got burned.
- **Muse Spark v1** (April 8, 2026) — first MSL release. Closed weights. Multimodal. AA Intelligence Index v9: **52**. Behind Gemini 3.1 Pro, GPT-5.4, Claude Opus 4.6. Ahead of Claude Sonnet 4.6, GLM-5.1, MiniMax-M2.7, Grok 4.20.
- **Muse Spark 1.1** (today, July 9, 2026) — Zuck's tweet promises big jumps in agentic and coding. Public Meta Model API opens.

Wang himself was candid in June: *"The new Muse Spark model that we released is not at the tier of the leading frontier models... we expect the upcoming models we release to be quite competitive with the leading models in the world."* 1.1 is the first of those.

## Where Spark Actually Wins (and Where It Doesn't)

The honest read from the original Spark benchmarks tells the story:

**Where it leads:**
- **CharXiv Reasoning** (figure understanding): 86.4 — beats GPT-5.4 (82.8), Gemini (80.2), Opus (65.3).
- **HealthBench Hard**: 42.8 vs Opus's 14.8 and Gemini's 20.6. Meta trained with 1,000+ physicians on health reasoning.
- **Token efficiency**: notably better than peers at the same intelligence tier.

**Where it trails badly:**
- **ARC-AGI 2** (abstract reasoning): 42.5 vs Gemini 76.5 / GPT-5.4 76.1 / Opus 63.3. A 34-point deficit to the leader.
- **Terminal-Bench 2.0** (agentic coding): 59.0 vs GPT-5.4 75.1 / Gemini 68.5 / Opus 65.4. Last place.
- **GDPval-AA Elo** (office work): 1444 vs GPT-5.4 1672 / Opus 1606.

That's the pattern. **Spark dominates multimodal perception and health. Competitive on search. Trails on agentic coding and abstract reasoning.**

This is also exactly the gap 1.1 is supposed to close. The Andrew Curran report from July 3 quotes Wang promising "big improvements in coding and agentic capabilities to be more competitive with other leading models." Until third-party benchmarks land for 1.1, treat today's announcement as a claim, not a result.

## The Real Fight: Spark 1.1 vs The Chinese Price Floor

Here's what matters for the race. Spark 1.1 isn't going head-to-head with GPT-5.5 or Claude Opus 4.8. Those models cost $5/M input and $25–30/M output. Nobody buys Spark because it's smarter than Opus.

You buy Spark because Zuck said "very low price" — and the only models that have actually nailed "very low price" are Chinese.

Per-million-token pricing, in / out, July 2026:

| Model | Input | Output | License | Notes |
|---|---|---|---|---|
| **DeepSeek V4 Flash** | **$0.14** | **$0.28** | Open weights | Cheapest frontier-class API in the world |
| DeepSeek V4 Pro | $1.74 | $3.48 | Open weights | Cache hit $0.0145; flagship reasoning |
| **Kimi K2.6** (Moonshot) | **$0.95** | **$4.00** | Open weights | Ties GPT-5.5 on SWE-Bench Pro at 1/5 the price |
| **GLM-5.1** (Z.ai) | **$1.40** | **$4.40** | MIT (open) | Trained on Huawei chips; 754B MoE |
| Qwen3.7-Max | $2.50 | ~$10 | Proprietary | #5 on AA Intelligence Index; 1M context |
| Llama 4 Maverick (Meta self-host) | $0.19–$0.49 | — | Open weights | Meta's own cost estimate |
| GPT-5.5 / Claude Opus 4.8 | $5 | $25–30 | Closed | Premium tier |
| **Muse Spark 1.1** | **?** | **?** | **Closed** | **Zuck: "very low price." No public number yet.** |

That last row is the headline. **Meta hasn't published pricing.** Until they do, "very low" is a claim, not a number. But the competitive positioning is obvious: Spark 1.1 needs to land somewhere in the **$0.50–$1.50 input** band to matter against DeepSeek V4 Flash and Kimi K2.6. If Meta copies the Llama 4 Maverick self-host cost story ($0.19–0.49/M blended), the marketing alone is a problem for every Western frontier vendor.

## The "Chinese Models Are Catching Up" Story, Verified

Three months ago the consensus take was: *"Chinese models are good but a tier behind."* That story is dead.

- **DeepSeek V4 Pro** holds an Intelligence Index above every Chinese model that came before it, at a price that makes Western API math look indefensible.
- **Kimi K2.6** ties GPT-5.5 on SWE-Bench Pro (58.6%) and leads on Humanity's Last Exam with tools (54.0%) — at 80% lower cost. Moonshot shipped K2.6 three days *before* GPT-5.5.
- **Qwen3.7-Max** is #5 on Artificial Analysis Intelligence Index. Alibaba ran a 35-hour autonomous coding session firing 1,158 tool calls. Highest-ranked Chinese model on that leaderboard to date.
- **GLM-5.1** scores 45.3 on coding benchmarks — 94.6% of Opus 4.6. Open MIT license. Trained entirely on Huawei Ascend chips, no NVIDIA. Geopolitics aside, that's a flex.

The "challenge to Chinese models" question is the wrong frame. The right frame is: **the Chinese models forced Meta to come back.** Zuck didn't reopen the AI war because he loves coding agents. He reopened it because DeepSeek cratered NVIDIA's stock in January 2025 and every Western frontier lab is now racing toward a price point that used to be uniquely Chinese.

## So Is Spark 1.1 a Daily Driver? Honest Verdict.

Depends what you're driving.

**Yes, if:**
- You do multimodal work — chart reasoning, visual Q&A, document parsing. Spark wins here.
- You do anything in health, wellness, nutrition, fitness. The 1,000-physician data advantage is real and measurable.
- You want token-efficient reasoning and the new 1.1 coding/agentic improvements hold up under your workload.
- Cost matters and Meta actually publishes a price under $1.50/M input.

**No, if:**
- You ship agentic code in production. Terminal-Bench 2.0 has Spark dead last among peers. 1.1 needs to prove the gap closed.
- You do hard abstract reasoning (ARC-AGI 2) — Spark was 34 points behind Gemini in April. Until 1.1 numbers land, assume no fix.
- You need open weights for self-hosting, compliance, or cost control. Spark is closed. Llama 4 Maverick at $0.19–0.49/M is still your answer there.
- You depend on a mature ecosystem — Claude Code, Cursor, Aider, Devin, Hermes Agent. Spark 1.1 integration will lag.

**My current daily driver** is MiniMax-M2.7 — which Muse Spark already beats on AA Intelligence Index (52 vs M2.7's spot). So yes, I'll be running 1.1 through its paces on real agent and coding work this week. But "beats my daily driver on a single composite index" is a much weaker claim than "beats Claude Opus 4.6 on Terminal-Bench 2.0." One number moves you off your stack. The other doesn't.

## Bottom Line

Meta is back in the conversation. That's the actual news. Whether Muse Spark 1.1 is *frontier* is still a question mark Wang himself hasn't claimed yes to. But it doesn't need to be frontier to matter — it needs to be good enough, agentic enough, and cheap enough to keep Western enterprise dollars from drifting permanently to DeepSeek and Kimi.

The race isn't "Western vs Chinese" anymore. It's "closed frontier premium vs open-weight cheap" — and Spark 1.1 is Meta's first honest move into the cheap seat at its own table.

Watch the **Meta Model API pricing page** the moment Meta publishes numbers. That's the actual story.

---

## Notes (operator log)

- Image generation failed: FAL balance exhausted. Per Luis's standing rule (2026-07-09), no FAL retry. Article shipped text-only.
- Muse Spark 1.1 price not publicly disclosed by Meta as of publish time — flagged explicitly in body and table.
- All benchmarks cited are from the original Spark v1 (April 2026); 1.1-specific benchmark sheet not yet released by Meta or Artificial Analysis.
- Persisted to MemroOS via fallback path (no `mcp_memroos_*` tools available in this session).