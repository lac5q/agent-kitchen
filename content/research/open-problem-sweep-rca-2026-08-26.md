---
title: Open-problem sweep RCA — 2026-08-26
date: 2026-08-26
model: claude-opus-5
agent: claude-opus-maeve-u1
host: maeve-u1
sources:
  - lac5q/memroos-product GitHub issues (open)
  - lac5q/memroos GitHub issues (open)
  - .planning/issues/queue
  - .planning/ROADMAP.md open milestones
  - live inspection of memroos-ec-1
derived_from: beastmode director run, executor lane agy/gemini-3.7-flash
regen_prompt: "Re-run an open-problem sweep across GitHub issues (both repos), the local issue queue, problem-memories, and the roadmap's open milestones; name every unnamed problem SLUG-NN; fix what is tractable; report what needs operator action."
---

# Open-problem sweep RCA — 2026-08-26

A beastmode director run over every open-problem source at once. Ten defects
named, five fixed and verified, one production host recovered.

## The finding that generalises

**Four separate defects sat between "the operator asked for the Gemini lane" and
"the Gemini lane runs a task", and none was visible from reading code.** They
only surfaced from trying to start the thing:

1. `GEMCFG-01` — the MemroOS installer wrote `connectTimeout` into the shared
   `mcpServers` block for every JSON target. No JSON MCP consumer implements the
   key; it is a camelCase mistranslation of the YAML targets' `connect_timeout`.
   Harmless until gemini-cli 0.57 started validating strictly, at which point the
   CLI refused to start at all and the memroos MCP was unreachable from every
   Gemini session. Six live host configs were already poisoned.
2. `GEMKEY-01` — the 1Password item `Gemini Work API Key` is revoked in both
   vaults and surfaces as a bare HTTP 400.
3. `GEMQUOTA-01` — the working key is free-tier at 20 requests/day, and on
   429/503 gemini-cli **silently falls back to another model** rather than
   failing closed. Pinned `gemini-3.7-flash`, actual `gemini-3.5-flash`, disclosed
   only inside a stack trace. Real capacity drift.
4. `SKILLFM-01` — the Beastmode `antigravity-cli` and `gemini-cli` adapter
   skills had no YAML frontmatter, so Codex failed to load them. The skill
   documenting the correct lane was itself unloadable.

The requested lane — `agy` (Antigravity CLI) on `gemini-3.7-flash` — works, and
authenticates through OAuth rather than the API key, so the free-tier ceiling
never applied to it. Finding it took going through three broken doors first.

**Lesson: prove a lane end-to-end before delegating to it, and treat a lane that
degrades silently as unavailable rather than degraded.** A pinned model that
retries into a different model produces work that cannot count as verified.

## The production finding

memroos-ec-1 root was at 94% (5.7 GB free) with four healthcheck issues open
against it. Three were stale. The one real alert had a misattributed cause.

**It was not logs.** 121 of the host's 127 Docker images were dangling `<none>`
layers from repeated rebuilds of the same six tagged images, plus 98 GB of build
cache. All six tagged images were in use by running containers, so the
conservative prune reclaimed everything without endangering a rollback target.

| | before | after |
|---|---|---|
| root filesystem | 78G used / 5.7G free / 94% | 41G used / 43G free / 49% |
| images | 127 (95.46 GB) | 6 (2.89 GB) |
| build cache | 546 entries (98.42 GB) | 37 entries (1.83 GB) |

The recurring disk-pressure cycle that memroos#43 proposes to fix with log
rotation is unpruned Docker state. Log rotation would not have prevented it.

`HEALTHPATH-01`: the alerts' numbers were correct but every path in them was
unactionable — mem0 now runs as a container and reports its container-internal
path, and the alert template's remediation step names a third path that exists
nowhere.

## Test-suite findings

`npm test -- --run` was **red on a clean tree** before any of this work, which
the roadmap did not record. Two tests (`REGTEST-01`) grepped the register route
for a platform literal that the GROKHOST-03 refactor deliberately deleted in
favour of a shared server-owned set. The behaviour was intact; the tests asserted
an implementation detail. They now assert the contract.

**Lesson: a source-grep assertion is a refactor tripwire, not a behaviour test.**
It fails when the code improves.

`TESTHYG-01` (the suite rewriting a tracked config file) did not reproduce in
either full run. The mechanism was closed anyway — the one unmocked writer
depended on a module-load-time env assignment that other suites hard-delete from
a shared `process.env` — but this is recorded as closing a mechanism, not as a
verified repro fix.

## What still needs a human

- `CI-DEAD-01` — every GitHub Actions run has failed in ~4s with no runner since
  2026-08-15. The Phase 219 repository-visibility assertion and every leak/PII
  scanner have therefore **not executed since then**; their red X is a startup
  failure, not a scan result. Account/billing-level setting only the operator can
  reach. This is the highest-consequence open item in the sweep.
- `GEMKEY-01` — rotate or delete the revoked credential in both vaults.
- `GEMQUOTA-01` — a billed key, if the API-key path is wanted at all.
