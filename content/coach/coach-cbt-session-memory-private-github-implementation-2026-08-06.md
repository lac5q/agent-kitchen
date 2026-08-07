---
title: Coach CBT session memory and private GitHub implementation
date: 2026-08-06
artifact_type: implementation-record
status: deployed
model: gpt-5.6-sol
sources:
  - https://www.nhs.uk/mental-health/self-help/guides-tools-and-activities/tips-to-improve-your-mental-wellbeing/
  - https://www.nice.org.uk/guidance/cg90
  - https://www.cci.health.wa.gov.au/Resources/Looking-After-Yourself
  - https://github.com/lac5q/coach
derived_from:
  - Terra-high implementation design and security review
  - gpt-5.6-luna max-reasoning isolated implementation
  - vibeproxy/kimi-k3 high-thinking independent validation
  - local Coach pilot source and regression suite
regen_prompt: Re-audit the private lac5q/coach main branch for guided freeze-first CBT-informed coaching, bounded non-transcript session memory, explicit learning confirmation, correction and forgetting, fail-closed provider/model egress, safe cron behavior, exact sanitized release inventory, and current test/reviewer evidence. Do not read or export the local Coach database or generated personal context.
tags:
  - coach
  - cbt-informed
  - session-memory
  - privacy
  - github
---

# Coach CBT session memory and private GitHub implementation

## Outcome

The Coach pilot now guides a blocked user instead of presenting an intake
form. It prioritizes a freeze-first micro-action, offers at most one static
CBT-informed tool, and keeps all recommendations advisory and reversible. The
toolbox contains eleven coaching tools spanning behavioral activation, graded
tasks, thought checking, balanced reframing, problem solving, worry handling,
behavioral experiments, if-then planning, self-compassion, and maintenance.
It does not diagnose or claim to provide therapy.

## Memory and learning boundary

Optional local memory is off by default. When enabled, each session stores an
exact seven-field structured summary rather than a transcript. Text and
reference fields are bounded and reject transcript-like and contact-like
values. Sessions support correction through a new current revision and full
forgetting from future context/export.

Feedback may create a candidate learning item. A candidate cannot affect
future context until the user explicitly confirms it. Learning items can be
confirmed, rejected, or forgotten. This makes the learning loop reviewable
and prevents the system from silently turning an inference into a durable
fact.

## Daily pipeline and egress

The optional 07:00 America/Los_Angeles user cron runs two subscription lanes
in order: `gpt-5.6-luna` at max reasoning for bounded data gathering, followed
by `gpt-5.6-sol` at high reasoning for one daily strategy. The account has no
separate `gpt-5.6-luna-max` catalog model; max is the reasoning-effort setting
on `gpt-5.6-luna`.

Cloud routing is disabled unless a distinct egress policy binds the supported
`openai-codex-subscription` provider, both exact models, purpose, allowed
context categories, retention statement, and explicit acknowledgement. The
pipeline fails closed on provider/model drift. Generated files remain local
with private modes and are ignored by git.

## Security and validation

The private GitHub release was constructed from an explicit allow-list. It
excludes the SQLite database, generated context, session exports, attachments,
backups, credentials, logs, model event streams, and local learning/run
records. Its manifest contains SHA-256 hashes and the builder asserts the
physical inventory before release.

- Local test suite: 27/27 passed.
- Sanitized release suite: 27/27 passed with bytecode writes disabled.
- Release inventory: 36 expected files, 36 actual, zero missing or extra.
- Manifest SHA-256: `8a4c11f4e92fcddbf64cfc0b8ce6e933d922e511ceb757b6a82da6816f4d220a`.
- Terra final security review: PASS, no blockers.
- Kimi K3 high final review: PASS, no blockers; requested
  `vibeproxy/kimi-k3`, observed provider `vibeproxy`, model `kimi-k3`, response
  model `k3`.
- GitHub: private `lac5q/coach`, branch `main`, commit
  `2146e8f79bf533825aa7aec7ce5b05e42d46bb36`.

Reviewer findings remediated before publication included exact provider
binding, contact validation in reference fields, aborting on malformed cron
managed blocks, removing local absolute paths from the portable release,
freeze-first behavior in the headless strategy prompt, and exact release
inventory checks.

## Installed operation

The finalized `coach-execute` skill was installed into Codex, Claude, Hermes,
and Pi with identical hashes. The private cron entry was reconverged to 07:00.
The live database and generated `coach-context.md` remain only in the local
Coach workspace and were not published or sent to reviewers.

