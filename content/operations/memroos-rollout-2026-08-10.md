---
name: memroos-rollout-2026-08-10
title: "MemroOS engagement, knowledge isolation, and Grok budget rollout"
description: "Production rollout evidence for engagement dispatch, group-scoped knowledge collections, and the fail-closed Grok quota guard."
date: "2026-08-10"
model: "gpt-5.6"
sources:
  - "memroos-product commit 68cab8a1d957"
  - "Oracle and Cordant production health checks"
  - "Beastmode Grok budget regression suite"
derived_from: "Production rollout and validation of engagement dispatch, dynamic knowledge groups, and worker-model quota controls"
regen_prompt: "Summarize the rollout evidence, safeguards, and remaining operational caveats without including credentials."
---

## Summary

Commit `68cab8a1d957` was deployed to both operator instances. Oracle runs with `MEMROOS_KNOWLEDGE_GROUP=oracle`; Cordant runs with `MEMROOS_KNOWLEDGE_GROUP=cordant`. The containers were recreated after the build so the runtime environment is active.

## Engagement and dispatch

The engagement console is a single responsive direct-chat/group-room surface with an explicit queue action, partial-delivery status, durable dispatch receipts, and an inline read-last-reply voice action. The legacy dispatch URL redirects to the engagement section. Dispatch diagnostics are protected by operator authorization both at the proxy and route boundary. New onboarding defaults include `task:accept` and episodic-write capability; agents registered before this change must be re-onboarded or updated before they can receive queued work.

## Knowledge isolation

Knowledge collections are discovered from live supported files with bounded recursion/scan limits, hidden/vendor directory exclusions, short-lived caching, and group-namespaced collection keys. Display labels include the group (for example, `Oracle / Business` and `Cordant / Business`) so categories do not appear shared across deployments.

## Worker budget policy

Beastmode's Grok lane is fail-closed. A Grok seat is used only when `BEASTMODE_GROK_WEEKLY_REMAINING_PCT` is present, numeric, and at least `BEASTMODE_GROK_MIN_WEEKLY_REMAINING_PCT` (default 40). Missing, malformed, or below-threshold readings switch the seat to Luna Max (`openai-codex/gpt-5.6-luna`). Exactly 40% remains allowed. The regression suite passed 17/17 and made no provider call.

## Verification

- Typecheck, lint, and production build passed.
- Full forked fast suite: 505 files passed, 4,162 tests passed, 55 skipped.
- Post-hardening focused suite: 90/90 passed.
- Python service suites: 214 passed.
- Fable/Claude final read-only validation: PASS.
- Oracle and Cordant public health: core services up; RTK/QMD are optional degraded services.
- Invalid onboarding token: HTTP 403 on both public domains.
