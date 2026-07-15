---
title: "Dev-stack caching audit and provider-native cache plan"
description: "Evidence-backed audit of local agent harness caching, compression, proxy, and memory layers, with a provider-native prompt-cache recommendation."
publishedAt: "2026-07-15"
tags: ["caching", "prompt-caching", "developer-tools", "llm-routing", "cost-optimization"]
keywords: ["RTK", "Headroom", "LiteLLM", "VibeProxy", "Redis", "MemRoOS", "Claude", "Codex", "MiniMax M3", "Grok 4.5"]
author: "Codex"
model: "gpt-5"
sources:
  - "local: /Users/lcalderon/.codex/config.toml, /Users/lcalderon/.claude/settings.json, /Users/lcalderon/.factory/settings.json, /Users/lcalderon/.hermes/config.yaml, /Users/lcalderon/.openclaw/openclaw.json"
  - "local: live process, listener, Redis, and health probes on 2026-07-15"
  - "https://platform.claude.com/docs/en/build-with-claude/prompt-caching"
  - "https://developers.openai.com/api/docs/guides/prompt-caching"
  - "https://docs.x.ai/developers/advanced-api-usage/prompt-caching/how-it-works"
  - "https://platform.minimax.io/docs/api-reference/text-prompt-caching"
  - "https://platform.minimax.io/docs/api-reference/anthropic-api-compatible-cache"
derived_from: []
regen_prompt: "Audit the local macOS agent harnesses for active cache, compression, proxy, and memory paths; validate them with process/config/health evidence; then map the supported native prompt-cache semantics for Claude, OpenAI/Codex, MiniMax M3, and Grok 4.5."
---

# Executive finding

The local stack does not have one coherent, measurable caching plane. It has several different mechanisms that solve different problems:

- RTK is working and has historical evidence of substantial terminal-output reduction. It is lossy output filtering, not provider prompt caching.
- Headroom is the active Claude Code path: it is healthy, has an internal cache enabled, and routes to Anthropic. It does not expose cache read/write or hit/miss metrics in its health surface.
- Hermes enables a five-minute `prompt_caching` setting and stores web/tool/delegation artifacts locally, but no provider-cache counters were found.
- LiteLLM is live on port 4000 but its active configuration contains no cache backend, Redis configuration, or cache callback.
- Redis is live on port 6379 but was idle at audit time: four commands total (the audit probes), zero cache hits, zero misses, no evictions, and no Mem0 connection.
- VibeProxy is live and exposes the expected provider model catalog, but no cache behavior or cache-key/header injection was configured.
- Mem0/MemRoOS at port 3201 was reachable at TCP level but its `/health` request timed out. It connects to Ollama and Qdrant, not Redis. It is a memory/retrieval service, not a prompt-cache gateway.

Therefore, do not put MemRoOS in the inference path to try to create universal prompt caching. Keep it as durable knowledge and retrieval. Build provider-native cache adapters at the request-construction boundary and a common metrics schema above them.

# Live local inventory

| Layer | Current evidence | Status | What it actually does |
|---|---|---|---|
| RTK 0.43.0 | `rtk gain --history`: 20,218 commands; 826.1M estimated tokens saved; recent use on 2026-07-14 | Working | Reduces terminal output before it enters agent context; not an LLM API cache |
| Headroom | Claude base URL points to `127.0.0.1:8787`; process is `headroom ... --mode token --backend anthropic`; health is ready and cache enabled | Running, opaque | Claude-side compression/cache/rate-limit proxy |
| Hermes | `prompt_caching.cache_ttl: 5m`; 193 local cache artifacts; `openrouter.response_cache: true` for 300 seconds | Configured, not measured | Local artifacts plus a provider-specific response-cache setting |
| LiteLLM | Process on port 4000; health and models return 401 as expected without its key; config lacks a cache backend | Running, not caching | Gateway/routing only in this configuration |
| Redis | Port 6379; four processed commands, zero hits/misses; Mem0 has no Redis connection | Idle | Unused KV service, not an active prompt-cache backend |
| VibeProxy | Ports 8317/8318 serve catalog including `gpt-5.6-terra`, `grok-4.5`, Claude, Gemini, and GLM IDs | Running, no cache proof | OAuth/model bridge |
| Factory legacy custom models | Three entries target port 3456; no process listens there | Broken stale config | Those models cannot be called through that path |
| OpenClaw | `contextPruning.mode: cache-ttl`, one-hour TTL | Configured, not provider caching | Context-retention/pruning policy, not cache-control emission |
| Mem0/MemRoOS | Process on port 3201; `/health` timed out; connections to Ollama and remote Qdrant | Degraded | Memory/retrieval service, not a KV/prompt cache |

# What is and is not broken

## Proven working

1. RTK works as terminal-output reduction. Its savings are estimated against unfiltered command output; they should not be read as billed-provider prompt-cache savings.
2. Headroom is reachable and has a healthy upstream to Anthropic. Its health response reports its internal cache as enabled and ready.
3. VibeProxy serves a live model list on both configured ports.

## Proven broken or inactive

1. Factory still contains old model definitions pointed at `http://127.0.0.1:3456`, but that port has no listener.
2. Redis is not receiving application cache traffic and is not connected to the Mem0 process.
3. Mem0's health request times out, so it should not be used as a dependable new routing dependency until repaired.

## Configured but unproven

1. Headroom's cache has no observable read/write/hit/miss counter in its health payload.
2. Hermes' `prompt_caching` setting does not prove that provider requests carry the required native cache controls or that responses return cache-read fields.
3. OpenClaw's `cache-ttl` is context pruning; it does not prove prompt caching at the provider.
4. LiteLLM and VibeProxy may forward provider-native fields if callers supply them, but the audited configurations do not add cache keys, breakpoints, or metrics.

# Provider-native cache reality

The copied “Anthropic `cache_control` everywhere” playbook is not universal.

| Provider / route | Correct mechanism | Verification field | Local implication |
|---|---|---|---|
| Anthropic Claude | Explicit `cache_control` blocks; 5-minute default or paid one-hour TTL | `cache_creation_input_tokens`, `cache_read_input_tokens` | Ensure Headroom preserves those fields and log them; do not assume its internal cache equals Anthropic prompt-cache billing |
| OpenAI / Codex API | Automatic caching from 1024 input tokens; for GPT-5.6+ use stable `prompt_cache_key`, optionally explicit breakpoints | `cached_tokens`, `cache_write_tokens` | Use native OpenAI API request options where the harness exposes them; a generic OpenAI-compatible proxy is insufficient unless it forwards them unchanged |
| MiniMax M3 | Passive automatic repeated-context caching | `cache_read_input_tokens` | Your direct `https://api.minimax.io/v1` Factory path can benefit if it preserves an exact static prefix. M3 is listed for passive caching, not the MiniMax explicit Anthropic-compatible cache-control support table |
| MiniMax M2-series through Anthropic API | Explicit `cache_control`, five-minute TTL | `cache_creation_input_tokens`, `cache_read_input_tokens` | Applicable only when using the compatible endpoint and supported M2 models |
| xAI Grok 4.5 | Exact-prefix cache; set stable `x-grok-conv-id` or Responses `prompt_cache_key` | `usage.prompt_tokens_details.cached_tokens` or Responses equivalent | VibeProxy config currently does not establish a conversation ID or cache metric; add at the caller if the proxy forwards headers |

# Recommended target architecture

## Keep

- Keep RTK for noisy CLI output. It is immediately useful and complementary to native prompt caching.
- Keep Headroom only for Claude Code after adding usage telemetry. It is currently the only clearly active provider path with a health-checked cache.
- Keep MemRoOS out of the hot inference path. Use it for durable memory, document selection, and stable-context versioning.

## Simplify

1. Remove or repair the Factory port-3456 models; they are dead routes.
2. Do not keep Redis merely because it exists. Either give it one explicit owner (for example, a semantic/response cache with a documented key and TTL) or shut it down.
3. Do not count LiteLLM or VibeProxy as caching until they log actual provider usage fields. A proxy that forwards requests is not automatically a prompt cache.

## Add one small cache-aware adapter library, not another universal proxy

Place it where each harness builds provider requests. It should:

1. Canonicalize stable content: tools, system prompt, versioned skill bundle, and selected knowledge documents first; dynamic user turn and volatile timestamps last.
2. Compute a stable `context_version` from content hashes, rather than inserting a timestamp or unsorted JSON into the prefix.
3. Emit the native control for the selected provider: Anthropic `cache_control`; OpenAI `prompt_cache_key` and breakpoints; Grok conversation key; MiniMax stable prefix.
4. Record one structured event per call: `provider`, `model`, `route`, `context_version`, `input_tokens`, `cache_read_tokens`, `cache_write_tokens`, `cache_hit`, `latency_ms`, and error class.
5. Maintain a rolling dashboard by harness and provider. The cache is considered healthy only when a repeated two-call probe shows a non-zero native cache-read field.

This preserves the advantages of provider-native KV caching without falsely claiming that Anthropic-format fields work for OpenAI, MiniMax M3, or Grok.

# Next implementation gate

Before changing routing, run a controlled two-request probe per provider using a non-sensitive static prefix of at least 1,200 tokens and a unique test conversation/context key. The second response must show the provider-native cache-read counter above zero. Do this through the exact harness route that will be used in production:

1. Claude Code through Headroom.
2. Native OpenAI/Codex route.
3. Factory direct MiniMax M3 route.
4. Factory or Hermes Grok 4.5 route through VibeProxy, confirming the conversation header survives.

Only then choose whether a proxy stays in the path. This test incurs normal first-request token cost and should be run with the account owner’s approval.
