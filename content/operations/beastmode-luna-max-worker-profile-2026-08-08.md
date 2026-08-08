---
name: beastmode-luna-max-worker-profile-2026-08-08
title: "Beastmode Luna-Max worker profile verification"
description: "Non-secret verification of Pi and Beastmode worker routing on Maeve, Cordant, and Oracle."
publishedAt: "2026-08-08"
tags: [operations, beastmode, pi, model-routing]
keywords: [gpt-5.6-luna, luna-max, worker, subagent, cordant, oracle, maeve]
author: "codex-root"
source_session: "019fd5b9-558f-72f1-9ca4-ac23f294db7e"
model: "gpt-5.6-luna"
sources:
  - "local:~/.pi/workflows/model-tiers.json"
  - "local:~/github/beastmode/scripts/tier-aliases.json"
  - "command:beastmode model preflight"
  - "ssh:cordant-hermes-01 and oracle-1 host checks"
derived_from:
  - ".planning/STATE.md"
regen_prompt: "Verify Beastmode/Pi worker model routing on Maeve, Cordant, and Oracle; record only non-secret evidence."
---

# Beastmode Luna-Max worker profile

## Verified

- Maeve (maeve-u1) maps Pi dynamic-workflow tiers small, medium, and big to openai-codex/gpt-5.6-luna:max.
- Maeve lists openai-codex/gpt-5.6-luna; Beastmode model preflight and Pi permission-policy checks pass.
- A bounded local Beastmode smoke with --economy luna-max --autonomy high --interview off returned LUNA MAX BM OK.
- Cordant (cordant-hermes-01) was converged from the prior MiniMax tier map to the same openai-codex/gpt-5.6-luna:max map, and its Pi model catalog lists Luna.
- Oracle already had a Luna worker profile through vibeproxy/gpt-5.6-luna with max reasoning and was left unchanged.
- main-man is not present in Tailscale status, DNS, or reachable SSH from Maeve; no change was attempted and main-mac was not substituted.

## Not claimed

Pi's isolated native child smoke reached the workflow approval gate but could not run in non-interactive mode; the collaboration API does not expose a Luna spawn model. No Luna child completion is claimed. The verified path is the direct Beastmode Luna executor plus deterministic tier configuration and model preflight.

## Follow-up

Restore or identify main-man, then apply the same tier map and run a host-local Pi catalog/preflight check. For native child evidence, run one foreground Pi workflow with an interactive approval UI and record the child model metadata.
