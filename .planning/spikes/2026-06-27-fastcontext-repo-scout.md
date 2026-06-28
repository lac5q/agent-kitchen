# FastContext Repo-Scout Spike

Requirement: `FASTCONTEXT-FOLLOWUP-01`

Status: completed bounded spike, 2026-06-27

## External Signal

FastContext frames repository exploration as a delegated code-navigation task. The paper reports improved end-to-end coding-agent outcomes and lower main-model token use when a compact explorer handles repository localization.

Sources:

- https://github.com/microsoft/fastcontext
- https://arxiv.org/html/2606.14066v1

## Repo Baseline

MemRoOS already has:

- GitNexus graph index for symbol, route, API, and impact navigation
- `rg` as the fast text-search baseline
- route and contract gates added in Phase 115
- code-navigation tasks implied by recent ARCHREV work: find proxy bypasses, route-local auth, A2A contract fields, public eval schema, and qmd freshness scripts

## Comparison Result

FastContext's useful pattern is not a new source of truth. It is a benchmark shape: ask an explorer to return files, symbols, and line evidence before the main coding agent edits.

The safe local comparison is 20-50 read-only MemRoOS tasks scored on correct file hit, correct symbol hit, line-citation usefulness, elapsed time, and token/command count. GitNexus remains the graph source of truth; `rg` remains the text baseline.

## Decision

Do not add FastContext as a runtime dependency, upload the repo, replace GitNexus, or allow automatic edits from an explorer.

If pursued later, implement a local benchmark fixture under `evals/repo-scout/` with answers derived from existing MemRoOS route/symbol ownership.

## Guardrails

- No runtime dependency.
- No hosted or private repo upload.
- No GitNexus replacement.
- No automatic code edits from FastContext output.

## Verification

Bounded spike artifact is checked by `npm run check:future-spikes`.
