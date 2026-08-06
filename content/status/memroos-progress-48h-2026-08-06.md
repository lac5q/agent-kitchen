---
name: memroos-progress-48h-2026-08-06
description: Factual engineering and operations progress snapshot for the prior 48 hours.
version: 1.0.0
date: 2026-08-06
model: openai-codex/gpt-5.6
sources:
  - private memroos-product working tree and test receipts
  - Gmail MemRoOS alert thread reviewed 2026-08-06
  - read-only main-mac health and ingestion logs
  - exact gpt-5.6-luna Max Beastmode review
derived_from:
  - active GSD, onboarding, deployment, Luna worker, and LangSmith goal
regen_prompt: Rebuild this snapshot from git status and logs, test receipts, Gmail alerts, host health logs, and validator reports.
sensitivity: restricted
domain: engineering-operations
authoritative: false
verified_at: 2026-08-06
---

# MemRoOS progress — prior 48 hours

## Completed or proven

- Repo references fetched: local base and origin/main matched at `11da622b8b6e36d616cd989bb992ba3caf96b019`. Six remote Claude branches have zero unique commits; deletion awaits operator GO.
- Beastmode exact `gpt-5.6-luna` Max worker proven read-only on main-mac and maeve-u1. Worker state is now isolated with ephemeral Codex/XDG directories; shell security tests pass.
- Remote OAuth onboarding implemented for Claude Cowork and ChatGPT Workspace Agents: no local tokens/installers, OAuth-principal ownership, behalf-of rejection, signed platform/protocol binding, remote API-key rejection, and 2xx logical-failure redaction.
- Onboarding tests passed: focused 25/25, isolated slow 46/46, plus typecheck.
- Phase 231 completed with EMULATE decision. Evidence includes 43/43 Vitest and 22/22 Python; promotion remains evidence-gated.
- Memory durability implemented: cached-Qdrant queueing, proven replay acknowledgements, bounded retries, dead-letter retention, and degraded health. Queue tests 19/19; memory-engine tests 17/17.
- Alert fixes implemented locally: combined disk/free-space thresholds, invalid-measurement fail-closed behavior, QMD launcher path fix, structured Gmail completion, failure-before-staleness classification, and cooldown.
- Durable RCA exists at `content/devops/main-mac-memory-alert-storm-rca-2026-08-06.md`.

## Live alert state

Review of 48 alert emails found disk percentage noise, QMD entrypoint/Node failure, transient Mem0/Qdrant health, and Gmail auth.

At about 12:21 PDT, main-mac showed disk healthy at 92%/33 GB free, Mem0 connected, QMD healthy, and source indexing healthy. No new disk, QMD, or Mem0 alerts occurred after the 10:17 recovery.

Gmail is a real remaining failure: all three `gwsa` sessions are stale and the personal token lacks identity scopes. Required interactive command on main-mac: `/Users/lcalderon/bin/gwsa gmail login`.

A tested replacement for the deployed partial health script and a two-line structured-result ingestion-wrapper patch are ready locally but not deployed.

## Exact Luna result and open work

Exact Luna Max ran read-only, exit 0, 454,294 tokens, and returned FAIL on:

1. OAuth MCP identity fields are not fully bound to the introspected principal.
2. Governed memory add rejects OAuth work-agent bearers and `memory_save` defaults to shared.
3. Contradictory `{ok:false,status:"ok"}` replay responses are accepted.
4. QMD launchd migration had PATH/runtime/legacy-plist weaknesses.

The service PATH, legacy-plist deletion, and disk critical-threshold issue were fixed locally after review. OAuth binding/writes, contradictory replay, and a separate canonical-email collision issue remain.

Also incomplete: GSD phases 232–237; clean commit series; remote cleanup/push/merge/deploy; live Cordant Linear/Circleback/Notion proof; live LangSmith trace proof; Fable 5 high or Opus 5 xhigh final validation; and rotation of previously exposed 1Password/Qdrant credentials.
