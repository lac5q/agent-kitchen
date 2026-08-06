---
title: "Coach Execute Cross-Harness Skill"
description: "Portable coach-execute skill installed for Codex, Claude, Hermes, and Pi, with a shared interactive protocol and a pinned Luna-to-Sol headless pipeline."
publishedAt: "2026-08-06"
tags: [coach, executive-coaching, skills, codex, claude, hermes, pi, local-first]
keywords: [coach-execute, daily check-in, gpt-5.6-luna, gpt-5.6-sol, harness adapter]
author: "Codex"
source_session: "019fd7b7-7882-76c1-81ae-b838892c1bcb"
model: "gpt-5.6-terra"
sources:
  - "workspace:/home/lac5q/github/coach/skills/coach-execute"
  - "workspace:/home/lac5q/github/coach/scripts/run-daily-coach.sh"
derived_from:
  - "content/coach/coach-context-file-2026-08-06.md"
regen_prompt: "Inspect the Coach repository's portable coach-execute skill, verify its frontmatter and installer, and document its cross-harness protocol and model-routing boundaries."
---

# Coach Execute Cross-Harness Skill

## Delivered

A canonical skill now lives at:

    /home/lac5q/github/coach/skills/coach-execute

It was installed in the user skill roots for:

- Codex: /home/lac5q/.codex/skills/coach-execute
- Claude: /home/lac5q/.claude/skills/coach-execute
- Hermes: /home/lac5q/.hermes/skills/coach-execute
- Pi: /home/lac5q/.pi/agent/skills/coach-execute

All installed SKILL.md copies match the canonical SHA-256.

## Shared behavior

Interactive use renders the bounded Coach context, collects date/focus/energy/stress/vital-minutes/busy-minutes plus an optional short context sentence, and returns:

1. What is known.
2. What is unknown.
3. One evidence-backed pattern with confidence and alternative explanation.
4. One smallest reversible recommendation.
5. One if-then precommitment.
6. One check-in metric and stop condition.
7. One correction question.

It does not diagnose, monitor, send, schedule, purchase, or infer access to unconnected systems.

## Headless routing

The Coach repository runner is the canonical subscription pipeline:

1. Render local context.
2. Run supported gpt-5.6-luna with max reasoning for the evidence memo.
3. Run gpt-5.6-sol with high reasoning for the strategy.
4. Fail closed on model or effort drift and record per-stage metadata.

There is no separate gpt-5.6-luna-max catalog ID. The runner therefore requests gpt-5.6-luna with max effort and records actual provenance. “Gather data” currently means local Coach state only; connector ingestion is deferred.

## Reinstallation

From the canonical skill directory:

    scripts/install.sh --targets codex,claude,hermes,pi

Use copy mode by default. Symlink mode is available only when every harness can read the canonical workspace.


## Provenance gate refinement

The headless runner now uses the short-lived Codex session metadata to attest actual model and reasoning effort because Codex JSONL does not include those fields in every invocation. It fails on absent or mismatched provenance and removes the session record after a successful stage; failed or drifted stages retain evidence for diagnosis.
