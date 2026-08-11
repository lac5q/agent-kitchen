---
name: "validator-cost-control-gsd-plan-2026-08-10"
title: "Beastmode validator cost control GSD plan"
description: "Implementation-ready plan for cheap-first mechanical validation, bounded Opus judgment, packet caching, and fail-closed budget/provenance gates."
publishedAt: "2026-08-10"
tags: [beastmode, validator-cost, gsd, model-routing, provenance, budget-control]
keywords: [Luna Max, Claude Opus, review packet, cache key, GitNexus, cheap-first validation]
author: "Codex"
source_session: "019fee69-0137-7811-9acc-a1fc33ec9ada"
model: "Codex director; gpt-5.6-luna requested implementor; claude-opus-5 observed validator"
sources:
  - "repo:beastmode@ecfa0da"
  - "repo:beastmode branch codex/validator-cost-control-gsd@c25188e"
  - "SKILL.md v2.5.0"
  - "references/model-routing.md"
  - "schema/acn-contract.json"
  - "scripts/lib/acn_meta.py"
  - "GitNexus impact: review HIGH (7 symbols, 2 direct callers, 4 processes)"
  - "GitNexus impact: build_pipeline HIGH (5 symbols, 5 direct callers, 3 processes)"
derived_from:
  - "/home/lac5q/github/beastmode-validator-cost/.planning/validator-cost-control/CONTEXT.md"
  - "/home/lac5q/github/beastmode-validator-cost/.planning/validator-cost-control/ACCEPTANCE.md"
  - "/home/lac5q/github/beastmode-validator-cost/.planning/validator-cost-control/DESIGN.md"
  - "/home/lac5q/github/beastmode-validator-cost/.planning/validator-cost-control/PLAN.md"
regen_prompt: "Regenerate the validator-cost-control GSD plan from the Beastmode v2.5 routing rules, the acceptance contract, current LangGraph and harness surfaces, fresh GitNexus impact evidence, and the final Opus review findings."
---

# Executive summary

Beastmode should spend expensive validator tokens only after deterministic evidence has made the judgment small and meaningful. Luna Max (openai-codex/gpt-5.6-luna, reasoning max) is the requested implementor and mechanical-validation lane. Opus high is the requested, read-only judgment lane: one aggregate packet at the appropriate phase/risk/merge gate, never one call per worker. The director owns architecture, impact gates, escalation, final verification, and merge.

This artifact is a plan, not runtime implementation. The plan branch is codex/validator-cost-control-gsd, commit c25188e; canonical local main is clean at ecfa0da, with recovered Claude-associated fixes in commits 54be5e0 and ecfa0da. No push was performed.

## Locked controls

1. Deterministic preflight, mechanical tests/lint, and parent-owned provenance run before Opus. Any mechanical, provenance, packet-schema, overflow, drift, missing-effort, impact, budget, or watcher failure makes zero Opus calls and remains pending/blocked, never validated.
2. Aggregate independent work into one bounded packet. A rejection permits at most one Luna repair and one delta-only Opus review; a second rejection ends repair_exhausted/blocked.
3. The packet is an explicit top-level and nested allowlist. Unknown fields are packet_schema_invalid; missing required fields block. Raw logs, transcripts, unchanged files, secrets, and worker narratives cannot enter.
4. The receipt cache key hashes policy, requested/actual model and effort, acceptance, mechanical report, base/head, and packet. Unavailable evidence uses typed sentinels such as actual_effort:UNAVAILABLE; it cannot collide with verified evidence.
5. GitNexus HIGH impact requires fresh trusted evidence. Dirty worktrees without a matching diff hash, index revision mismatch, absent tool, nonzero exit, timeout, malformed output, or partial output are stale/unavailable and block.
6. The effective budget is min(remaining_run_budget, remaining_phase_budget), with run budget dominating. The parent ledger performs atomic reserve -> dispatch -> settle(actual) or release(error/skip). Resume keys bind run ID plus monotonic attempt, are single-use, and re-check budget.
7. Claude validation receives packet bytes on stdin through scripts/claude-pro --model opus --effort high. The wrapper forwards --effort high to claude -p --permission-mode plan --tools "", scrubs Anthropic API variables, and stays single-seat. Parent transport usage/journal, never model prose, supplies actual model and effort. Missing effort is actual_effort_unavailable and blocks.
8. Self-improvement is one run/receipt-keyed, append-idempotent, redacted entry no larger than 2 KiB with six required Beastmode headings. Oversize/missing headings produce a fixed redacted entry_omitted stub; the learning file is append-only evidence and never a gate input.

## Policy and packet defaults

The proposed parent-owned policy uses off, shadow, and enforce modes, defaulting to off for compatibility. The requested validator is the single anthropic/claude-opus-4-7 Opus alias at effort high, read-only. Per-call caps are one call, 98,304 packet bytes, and 24,576 conservative estimated tokens; phase caps allow two calls for an initial plus delta path; run caps allow four. Risk classes are low (phase gate), medium (merge gate), high (risk gate with fresh impact), and critical (explicit-risk gate plus director acknowledgement). All classes aggregate and allow at most one initial, one repair, and one delta call within the ledger.

The canonical packet contains only schema/run/goal/gate, risk, selected acceptance, mechanical facts, provenance, changed diff/symbol/hunk slices, bounded prior findings, normalized usage, and hashes. Required section and diff caps return explicit overflow without truncating evidence or calling Opus. Estimated tokens are ceil(utf8_bytes / 4); provider-reported input, cached input, output, and reasoning remain separate measured or unavailable fields.

## Implementation phases

- Phase 0 — schemas and fixtures: add policy, packet, and receipt schemas; parent mode loader; low/medium/high/critical and invalid fixtures; provenance, effort, stale-impact, unknown-field, and frontmatter lint checks.
- Phase 1 — pure compiler/receipt/ledger: deterministic canonical hashing, redaction, allowlist validation, caps, token estimate, typed unavailable sentinels, cache validation, atomic budget reserve/settle/release, and single-use resume behavior.
- Phase 2 — LangGraph integration: update trusted bounded state and preflight; retain mechanical/provenance ordering; add one aggregate review, one bounded Luna repair, delta review, repair-exhausted terminal, and merge receipt gate. Before editing review or build_pipeline, rerun upstream GitNexus impact; current indexed evidence is HIGH for both.
- Phase 3 — harness/Claude: add scripts/validator-review; extend scripts/claude-pro, bm, prompts, and acn-report; enforce stdin-only packet, --tools "", effort preflight/read-back, single-seat transport, cache-hit zero invocation, fake watcher no-write tests, and shell security.
- Phase 4 — rollout: capture off baseline; run shadow dry packets for low/medium/HIGH/repair/overflow/drift/cache/missing-metric cases; enable enforce low/medium then all classes; verify rollback to off; append exactly one bounded learning entry.

Required tests include zero calls for every fail-closed condition, aggregation, exact cache reuse and every evidence mismatch, packet overflow/allowlist, missing usage/model/effort, stale impact, one repair plus delta, budget lifecycle/concurrency/resume, fake Claude arguments/env/no-write behavior, provider-preservation, and the existing Beastmode suite.

## Evidence and review

A tiny Luna documentation repair measured 183,099 input tokens, 161,024 cached input, 3,828 output tokens, and max reasoning; this is context/prefix evidence, not inferred validator billing. The final bounded Opus review returned PASS with no unresolved material findings. Its CLI envelope exposed actual model claude-opus-5; actual effort was not exposed, so the result is evidence-only, not a high-effort attestation. The plan retains missing effort as fail-closed.

The repo suite was rerun on the plan branch: ./tests/run-all.sh completed 12/12 green (including 46 ACN parity checks, model preflight, shell security, installer/dependency integrity, artifact guard, and Pi security). GitNexus staged detection reported no symbol/process changes because the commit is planning/learning documentation only.
