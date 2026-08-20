---
title: "Hermes VibeProxy 403 RCA — WAF blocks the OpenAI SDK User-Agent"
date: 2026-08-19
type: rca
status: resolved
model: claude-opus-5[1m]
tags: [hermes, vibeproxy, waf, cloudflare, openai-sdk, user-agent, fallback-providers]
sources:
  - ~/.hermes/profiles/maria/logs/errors.log
  - ~/.hermes/profiles/maria/sessions/request_dump_20260819_1758*.json
  - ~/.hermes/hermes-agent/agent/auxiliary_client.py
  - ~/.hermes/hermes-agent/run_agent.py
derived_from: hermes-vibeproxy-runtime-diagnostics.md (proxy-model-registry-sync skill)
regen_prompt: "Re-diagnose Hermes VibeProxy 403/429 failures on maeve-u1: bisect headers vs payload, verify main turn AND fallback turn."
---

# Hermes VibeProxy 403 — RCA

Reported as "every model keeps failing" on `maeve-u1`. Two unrelated faults were
interleaved, which is why it looked like a total outage.

## Fault 1 — HTTP 403 "Your request was blocked." (the actual bug)

**Root cause.** VibeProxy's edge WAF rejects any request whose `User-Agent`
contains the literal token `OpenAI/Python` — the default sent by the `openai`
Python SDK that Hermes uses for `transport: chat_completions`. The reply is a
bare `403` with the plain-text body `Your request was blocked.` and no JSON error
envelope, surfaced by Hermes as
`openai.PermissionDeniedError: Your request was blocked.`

Not auth, not quota, not payload, not model availability. VibeProxy itself was
healthy throughout; `GET /v1/models` returned 200 with all 61 models.

**Evidence.** The byte-identical body captured in the 403 request dump returned
`200` under `curl`. Adding headers one at a time isolated it:

| Request | Result |
|---|---|
| dumped body, `curl` UA | 200 |
| same body + `stream: true` | 200 |
| same body + all `X-Stainless-*` | 200 |
| same body + `User-Agent: OpenAI/Python 1.109.1` | **403** |
| same body + `User-Agent: OpenAI/Python` | **403** |
| same body + `User-Agent: OpenAI` | 200 |
| same body + `HermesAgent/0.20.4` (+ all X-Stainless) | 200 |

Only the UA token matters. `X-Stainless-*` is not part of the block.

**Why it read as "every model".** The block follows the header, not the model, so
Claude, Gemini and Grok IDs all failed together and all recovered together —
which reads as a dead provider rather than a header fingerprint.

**Fix.** Per-provider UA override, applied to all three profiles that declare
VibeProxy (default, `maria`, `sketchpop`):

```bash
hermes -p <profile> config set providers.vibeproxy.extra_headers \
  '{"User-Agent": "HermesAgent/0.20.4"}'
```

`providers.<name>.extra_headers` matches on normalized `base_url` and is applied
last, so it overrides that provider only. Deliberately **not** the global
`model.default_headers`, which takes precedence over the provider-specific UAs
that `openai-codex`, `xai`, `qwen` and `routermint` require and would have
broken them. RouterMint already solves the identical Cloudflare-1010 problem the
same way — see `_routermint_headers()` in `run_agent.py`.

## Fault 2 — HTTP 429 "The usage limit has been reached" (not a bug)

A genuine ChatGPT `prolite` plan quota on the upstream OpenAI account
(`resets_at` 1787197252 → 20:40 local). It hit both the direct `openai-codex`
provider and the `gpt-5.x` IDs on VibeProxy, because both terminate at the same
OpenAI account. VibeProxy's Anthropic / Gemini / xAI models were unaffected.

Aggravating factor: every profile's default model was OpenAI-family and **no
fallback chain was configured**, so a quota 429 killed the turn outright.

**Fix.** Added a fallback chain (user-approved) to all three profiles:

```yaml
fallback_providers:
  - {provider: vibeproxy, model: claude-sonnet-5,  base_url: https://vibeproxy.epiloguecapital.com/v1}
  - {provider: vibeproxy, model: claude-opus-4-6,  base_url: https://vibeproxy.epiloguecapital.com/v1}
```

## Latent bug found while verifying the fallback

The first fallback turn still 403'd. Through Hermes **0.20.4**, the
auxiliary/fallback client (`agent/auxiliary_client.py`) honored only the global
`model.default_headers` and never the per-provider `extra_headers` that the main
agent client applies via
`apply_custom_provider_extra_headers_to_client_kwargs` (`run_agent.py`).

Consequence: a provider behind a header-fingerprint WAF works on the main turn
but still 403s on fallback, title, compression and vision calls to the same
endpoint — the exact failure this config was meant to fix.

Patched locally by adding `_apply_provider_scoped_headers(headers, base_url)`,
which applies the global level then the per-provider level, and wiring it into
the 7 call sites in `auxiliary_client.py` that had a base_url in scope. Matching
is on normalized route identity, so other providers are untouched (verified:
`chatgpt.com/backend-api/codex` keeps its own UA).

**This is a local modification to a git checkout and will be reverted by
`hermes update`.** Worth upstreaming — it is the same class as issue #40033,
which fixed only the main client.

## Lessons

1. A healthy `/v1/models` proves catalog reachability, nothing about inference.
2. When `curl` succeeds with a byte-identical body, bisect **headers** before
   payload. Two requests settle it; payload-chasing can burn hours.
3. Prefer per-provider `extra_headers` to global `model.default_headers` —
   the global key silently overrides provider-specific UAs other providers need.
4. Verify a real **fallback** turn, not just the main turn. Main-path and
   auxiliary-path client construction are separate code and can disagree.
5. Simultaneous 403 + 429 from different providers reads as one outage. Split by
   `provider=` in the log line before theorizing.
