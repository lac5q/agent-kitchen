---
name: "coach-pilot-control-plane-implementation-status-2026-08-06"
title: "Coach Pilot Control Plane — Implementation Status"
description: "Local-only first implementation of the executive-coaching concierge pilot, including policy boundaries, verification evidence, and model-lane limits."
publishedAt: "2026-08-06"
tags: [coach, executive-coaching, local-first, governance, beastmode]
keywords: [Gate 0, concierge pilot, claims ledger, baseline, advisory coaching]
author: "Codex"
source_session: "019fd7b7-7882-76c1-81ae-b838892c1bcb"
model: "gpt-5.6-terra (architecture); gpt-5.6-luna (smoke/fallback); claude-opus-4-8 (smoke)"
sources:
  - "workspace:/home/lac5q/github/coach"
  - "run-record:run-records/20260806-luna-fallback-meta.json"
derived_from:
  - "content/coach/luis-executive-coaching-integration-plan-2026-08-06.md"
regen_prompt: "Inspect the local coach pilot implementation, run its standard-library checks, and document its policy boundaries, acceptance evidence, and model-validation status."
---

# Coach Pilot Control Plane — Implementation Status

## Scope delivered

A local, standard-library Python concierge pilot control plane was created in
the shared workspace. It deliberately implements no connectors, monitoring,
email/calendar actions, raw conversation ingestion, Google Doc writes, or
psychological diagnosis.

Core controls:

- Gate 0 requires an outcome, one behavior, reason, source:purpose permission,
  advisory-only acknowledgement, and a 7-14 day baseline.
- A twelve-question interview labels known and unknown answers with source,
  confidence, and correction/forget instructions.
- SQLite claim ledger supports provenance, purpose/scope, counter-evidence,
  review date, correction, and forgetting. Forgetting removes the statement
  and source from future use while retaining a minimal audit tombstone.
- A structured, observation-only baseline permits only bounded metrics and
  280-character notes.
- Only one active experiment can exist and it requires a completed baseline,
  consent, burden, comparator, target, and stop condition.
- Morning briefs are user-triggered advisory text. Checkpoints explicitly
  return insufficient-evidence when no result can be supported.
- Audit and policy commands expose enforced boundaries.

## Workspace artifacts

- README.md
- pyproject.toml
- src/coach/core.py
- src/coach/cli.py
- tests/test_core.py
- docs/acceptance-contract.md
- docs/gate-0-decision.md
- docs/source-permission-matrix.yaml
- docs/threat-model.md
- docs/google-doc-append-protocol.md
- run-records/20260806-luna-fallback-meta.json

## Local verification evidence

Passed on 2026-08-06:

- PYTHONPATH=src python3 -m unittest discover -s tests -v — 8 tests passed.
- python3 -m compileall -q src — passed.
- PYTHONPATH=src python3 -m coach --help — passed.
- Policy smoke confirms no connectors/autonomous actions.
- Gate smoke confirms premature brief is denied before a baseline.
- Gate/baseline/brief/report/interview smoke confirms advisory output and
  insufficient-evidence reporting.

## Model-routing record

- Terra-high completed the implementation architecture.
- Exact requested executor gpt-5.6-luna-max was explicitly unsupported by the
  authenticated ChatGPT-backed Codex account.
- Nearest gpt-5.6-luna passed a smoke test, but its isolated coding session
  stopped before writing files. It is recorded as an unvalidated fallback
  attempt, not as successful Luna implementation work.
- claude-opus-4-8 with high effort passed an isolated smoke test.
- A full Opus code review was not run because sending the local project source
  and documents to external Claude was rejected as an unapproved data export.
  The user must explicitly approve that export before Opus validation may be
  claimed.

## Remaining gate

The pilot is locally verified but not externally Opus-reviewed. It also cannot
be recorded as Luna-Max-built because that exact account model is unavailable.


## Kimi K3 high watcher preflight update

The requested watcher lane was rechecked on 2026-08-06.

- Pi's model catalog displayed Kimi K3, but the configured local VibeProxy
  endpoint at localhost:8317 was unreachable.
- A direct Kimi CLI invocation with model kimi-k3 and enabled thinking returned
  "LLM not set."
- No Kimi/VibeProxy process, user service, or Docker container was running.
- No source code or documents were sent to Kimi.

The Kimi K3 high review is therefore unavailable, not failed review. Its
required operator action is to configure a live K3 provider (or restore the
local proxy) and explicitly authorize sending the local project source for
review. Corresponding run records are in the workspace:
run-records/20260806-kimi-k3-validator-meta.json and
run-records/20260806-kimi-k3-validator-output.md.
