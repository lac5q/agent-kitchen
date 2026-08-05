---
name: "phase-228-onboarding-rescue-validator"
title: "Phase 228 Onboarding Rescue validator review"
description: "Adversarial review of the unstaged Phase 228 onboarding-rescue implementation against ONBRESCUE-01..05."
publishedAt: "2026-08-04"
tags: [memroos-product, code-review, onboarding, security, beastmode]
keywords: [ONBRESCUE, shell-injection, URL-validation, signing-kid, backward-compatibility]
author: "Codex validator"
source_session: "BM-RUN-228-v4"
model: "gpt-5-codex"
sources:
  - "repo:.beastmode/worker-prompts/228-onboarding-rescue.md"
  - "repo:.planning/phases/228-onboarding-rescue/228-01-PLAN.md"
  - "repo:unstaged-working-tree-diff-2026-08-04"
derived_from:
  - ".planning/phases/228-onboarding-rescue/228-01-PLAN.md"
regen_prompt: "Adversarially review the Phase 228 unstaged diff and specified untracked files against ONBRESCUE-01..05, focusing on URL and shell safety, kid leakage, old-token compatibility, and regression-test coverage."
---

# Phase 228 Onboarding Rescue validator review

## Verdict

Reject. The implementation has a shell-template injection vulnerability and does not robustly reject all doubled-host corruptions. The deploy verifier also cannot exercise the signing-key mismatch branch it claims to diagnose.

## Findings

### P1 — Mintable URL values can inject commands into the onboarding shell

`assertMintableUrl` validates whitespace, commas, credentials, hostname characters/repetition, and protocol, but permits shell metacharacters in the path/query. It returns a parsed URL, but `createAgentOnboardingToken` ignores that return value and stores the original raw string. The script route then replaces `__MEMROOS_URL__` directly inside a double-quoted shell assignment.

For example, `https://good.example/$(id)` is accepted by the WHATWG URL parser, contains no rejected whitespace/comma/credentials, has an allowed hostname, and uses HTTPS. When the invitee executes the returned script, command substitution occurs while evaluating `MEMROOS_URL="..."`.

Relevant paths:
- `apps/memroos/src/lib/agent/onboarding.ts:121`
- `apps/memroos/src/lib/agent/onboarding.ts:159`
- `apps/memroos/src/app/api/onboarding/invite/route.ts:54`
- `apps/memroos/src/app/api/onboarding/script/route.ts:433`

The URL must be constrained/canonicalized as inert origin data or safely shell-quoted at template insertion, with an attack-shaped regression test.

### P1 — Doubled-host detection is bypassable by a leading label

`hasRepeatedHostnameSegment` detects repeated dot-label suffixes and exact repetition of the whole hostname. It misses concatenated repeated suffixes when another label precedes them. For example, `sub.a.coma.com` passes even though its suffix contains `a.com` twice consecutively.

Relevant paths:
- `apps/memroos/src/lib/agent/onboarding.ts:103`
- `apps/memroos/src/lib/agent/__tests__/onboarding.test.ts:31`

The tests cover only the exact whole-host example `a.coma.com`, so this bypass remains unguarded.

### P1 — Deploy verification cannot detect cross-host signing-secret mismatch

The script sends the literal `token=bad` to each host. Verification rejects that token at the structural split check as `Invalid onboarding token` before HMAC verification, payload decoding, or kid comparison. Therefore the `Invalid onboarding token signature` branch in the deploy script is unreachable for its own probe, and no cross-host secret mismatch is tested.

Relevant paths:
- `scripts/verify-onboarding-deploy.sh:36`
- `scripts/verify-onboarding-deploy.sh:40`
- `apps/memroos/src/lib/agent/onboarding.ts:182`

A real token minted by one host (or a structurally valid token with controlled provenance) must be checked on the intended verifying host for this diagnostic to provide evidence.

### P2 — Old no-kid tokens are compatible today but lack a regression test

The verifier does not require `kid` after a valid signature, so pre-change in-flight tokens with no `kid` still verify at runtime. However, no test constructs a legacy signed payload without `kid`. The new TypeScript payload interface makes `kid` required, increasing the chance a future validation change accidentally rejects old tokens without the suite noticing.

Relevant paths:
- `apps/memroos/src/lib/agent/onboarding.ts:202`
- `apps/memroos/src/lib/agent/__tests__/onboarding.test.ts:53`

### P2 — Fallback-audit coverage tests only the helper, not either mint route

The ONBRESCUE-05 test invokes `recordOnboardingBaseUrlFallback` directly. It would still pass if bootstrap or invite stopped calling the helper. There is no route-level test proving a production mint produces the audit receipt and a configured env suppresses it.

Relevant path:
- `apps/memroos/src/lib/http/__tests__/public-base-url.test.ts:76`

Also, the invite route records the request-derived fallback before choosing a caller-supplied `memroosUrl`, so it can claim a fallback host was used when the minted token actually used the explicit input URL.

## Requirements assessment

- ONBRESCUE-01: Core code and email call sites implemented. The full plan also requested cordant/oracle deploy documentation; only `.env.example` was updated.
- ONBRESCUE-02: Typed mint errors and basic validation implemented, but shell-safety and doubled-host validation are incomplete.
- ONBRESCUE-03: Mint/verify kid diagnostics implemented without exposing the secret. Existing no-kid tokens remain accepted.
- ONBRESCUE-04: Multi-host 403 smoke implemented; signing-secret mismatch verification is not actually exercised.
- ONBRESCUE-05: Detailed URL source and audit helper implemented; route-level coverage is missing and the explicit-input invite case can emit a false fallback receipt.

## Mechanical evidence

The director reported 3,781 fast tests passing, clean typecheck, and `detect_changes` matching expected scope. This validator did not rerun the full mechanical suite; the rejection is based on adversarial diff and data-flow review.
