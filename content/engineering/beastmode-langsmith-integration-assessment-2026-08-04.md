---
name: "beastmode-langsmith-integration-assessment"
title: "Beastmode to LangSmith integration and branch audit"
description: "Current repository state, remaining LangSmith integration work, safe merge strategy, and local onboarding commands."
publishedAt: "2026-08-04"
tags: [beastmode, langsmith, langgraph, observability, branch-audit]
keywords: [Beastmode, LangSmith, LangGraph Studio, acn-trace, provenance receipts]
author: "Codex"
source_session: "019fcf3b-66a5-71e0-a434-7a1e5d02ea94"
model: "gpt-5.6-sol"
sources:
  - "https://docs.langchain.com/langsmith/trace-with-langchain"
  - "https://docs.langchain.com/langsmith/quick-start-studio"
  - "https://docs.langchain.com/langsmith/application-structure"
  - "https://docs.langchain.com/langsmith/deployment-quickstart"
  - "https://docs.langchain.com/langsmith/trace-with-api"
  - "https://docs.langchain.com/langsmith/run-data-format"
  - "repo:beastmode@f8c49f0"
  - "branch:feat/beastmode-langsmith@661e0e0"
derived_from:
  - ".planning/observability/ROADMAP.md"
  - ".planning/langgraph/OPEN-QUESTIONS.md"
  - "references/observability.md"
regen_prompt: "Re-audit the Beastmode repository and official LangSmith documentation, then update the integration status, branch topology, gaps, and recommended merge/deployment plan."
---

# Beastmode to LangSmith integration and branch audit

## Outcome

Beastmode is already structurally ready for LangSmith at the LangGraph layer, but the complete integration is not merged or deployed.

Current `main` contains:

- a compiled LangGraph pipeline named `beastmode-pipeline`;
- `langgraph.json` mapping `pipeline` to `beastmode.langgraph.studio:studio_pipeline`;
- optional LangGraph and Studio dependencies in `python/pyproject.toml`;
- custom progress stream events;
- sanitized, vendor-neutral `trace_metadata` and reconstructed child receipt records;
- documentation for `LANGSMITH_TRACING`, `LANGSMITH_API_KEY`, `LANGSMITH_PROJECT`, and optional `LANGSMITH_ENDPOINT`.

With the LangGraph/LangSmith dependencies installed, standard LangGraph node traces require no additional instrumentation. LangSmith creates the tracing project on first ingestion if it does not already exist.

## Repository and branch state

Audit date: 2026-08-04.

- Current checkout: `main` at `f8c49f0`.
- Local `main` is five commits ahead of `origin/main`.
- GitHub `main` is still `0fc4fe2`.
- Current `main` has uncommitted hardening changes across 13 files.
- Separate worktree: `/home/lac5q/worktrees/beastmode`.
- Separate branch: `feat/beastmode-langsmith` at `661e0e0`.
- The feature worktree is clean.
- The LangSmith feature branch is not merged into `main`, is not an ancestor of `main`, and does not exist on the GitHub remote.

The branch's unique commit adds:

- `scripts/acn-trace`;
- `tests/test-acn-trace.sh`;
- onboarding text in the LangGraph adapter, Python README, and observability reference.

The branch test passes. An in-memory compatibility smoke test also confirmed that its `acn-trace` implementation works with current `main`'s newer `scripts/lib/acn_meta.py`.

## Why not merge the whole branch blindly

Both branches started at `0fc4fe2`, then diverged. Current `main` added extensive LangGraph and security hardening after that base. A full state comparison makes the feature branch look thousands of lines behind because it lacks those newer commits.

A three-way merge is mostly tractable, but `python/README.md` conflicts because current `main` added the stronger parent-owned attestation contract while the feature branch edited the older paragraph. The correct resolution must preserve main's attestation language and add only the LangSmith onboarding sentence.

The safe strategy is to port the feature commit's unique behavior onto current `main`, not replace current files with branch versions.

## What the feature branch actually solves

`scripts/acn-trace <run-dir>` converts canonical ACN `meta.json` receipts into one synthetic `beastmode.run` parent and one sanitized `beastmode.child` run per worker.

This is useful for every Beastmode harness—Pi, Hermes, Claude, Codex, and LangGraph—and deliberately sends only bounded receipt data such as model provenance, usage, status, and counts. It does not send prompts, source code, diffs, filenames, or raw command arguments. Tracing remains best-effort and never affects the offline provenance gate.

The branch implements planned V1 post-run visibility. It does not yet:

- call `acn-trace` automatically at phase close;
- provide live child visibility;
- link reconstructed subprocess children into the same native in-process LangGraph trace;
- configure a trusted executor/validator/reviewer for a managed LangSmith deployment;
- support `LANGSMITH_WORKSPACE_ID` / `x-tenant-id` for API keys associated with multiple workspaces.

The simple `POST /runs` API used by the branch is valid, though LangSmith documents it as slower and lower-rate-limit than batch ingestion.

## Recommended completion plan

1. Preserve and commit the current uncommitted hardening work independently.
2. Port `scripts/acn-trace` and its test onto current `main`.
3. Merge the documentation changes manually, preserving current security and attestation wording.
4. Add workspace-ID header support and a regression test.
5. Register `tests/test-acn-trace.sh` in the standard test runner/CI.
6. Run dry-run, disabled-tracing, missing-key, unreachable-endpoint, privacy, full shell, and Python tests.
7. For LangGraph runs, add an optional LangSmith SDK bridge so reconstructed receipt spans attach beneath the actual executor node; keep the post-run uploader for non-LangGraph harnesses.
8. Remove the feature worktree and local branch only after the integrated commit is verified.
9. Push `main` only with explicit release approval.

## Local Studio and tracing onboarding

After the integration is committed, local graph tracing and Studio require:

```bash
python -m pip install -e 'python[langgraph,studio]'
export LANGSMITH_TRACING=true
export LANGSMITH_API_KEY='<from secret manager>'
export LANGSMITH_PROJECT=beastmode
# If the key spans multiple workspaces:
export LANGSMITH_WORKSPACE_ID='<workspace id>'
langgraph dev
```

The current local environment does not have `langgraph` or `langsmith` installed, so the relevant Python smoke tests currently fail at import collection rather than at Beastmode code.

For privacy-sensitive graph runs, use a self-hosted endpoint or LangSmith input/output hiding. Keep tracing disabled by default and keep `acn-report` / `acn_meta.py` as the source of truth.

## Managed deployment boundary

The checked-in zero-argument Studio factory can render the graph, but a meaningful run intentionally blocks without trusted runtime dependencies: executor, validator, reviewer, run directory, and model attestation.

Therefore, do not treat `langgraph deploy` as the immediate next step. First add a deployment-safe factory that connects the LangSmith-hosted control graph to trusted isolated executors. The preferred architecture is:

- LangSmith/LangGraph Deployment hosts the durable control-plane graph, interrupts, threads, and in-process traces.
- Trusted Beastmode workers remain in isolated execution infrastructure with repository access and parent-owned model attestation.
- Distributed trace context or reconstructed receipt spans connect worker visibility back to the control-plane trace.
- Offline provenance remains authoritative even when LangSmith is unavailable.


## Concurrency addendum — 2026-08-04

During the audit, the current `main` worktree changed materially without this session editing it. The final observed status contained 53 entries: 49 modified paths and 4 untracked paths. Newly overlapping paths include the LangGraph adapter, observability reference, Python README, pipeline/runtime tests, and packaging files.

This indicates that another session or process is actively changing the same checkout. Treat the earlier small dirty-file count as a point-in-time observation, not the current count. Do not cherry-pick, merge, resolve conflicts, commit, or remove the feature worktree until the active writer is identified or the checkout stabilizes. Re-run `git status --short`, `git diff --stat`, and the branch comparison immediately before integration.
