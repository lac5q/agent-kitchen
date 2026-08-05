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


## Merge verification — 2026-08-05

The earlier pending/concurrency assessment is superseded by this verification.

### Final repository state

- `main` and `origin/main` both point to `3dfe8494650c9b30a0e5d4cffa98af070b3eadc3`.
- The working tree is clean.
- The separate feature worktree and local `feat/beastmode-langsmith` branch are gone.
- Original LangSmith commit `661e0e0` is an ancestor of `main`.
- Integration commit `75681b8` is present with subject `merge: add LangSmith receipt tracing`.
- `scripts/acn-trace`, `tests/test-acn-trace.sh`, documentation, and test-runner wiring are tracked on `main`.

### Verification evidence

Run against `3dfe849`:

- `./tests/run-all.sh`: 12/12 steps green.
- Python tests in the hash-locked CI environment: 140 passed.
- Import-linter: framework-neutral core contract kept; 0 broken.
- LangGraph Studio discovery/health smoke: passed.
- Source distribution and wheel build: passed.
- Public artifact guard against `HEAD`, wheel, and sdist: clean.
- Isolated no-dependency wheel smoke: passed.
- Repository remained clean after verification.

The GitHub connector returned no attached status contexts or pull-request workflow runs for the head SHA, so this assessment relies on the complete local CI-equivalent gates rather than claiming a hosted Actions result.

### Conclusion

The LangSmith code is not merely ready to merge; it is already merged and pushed to `origin/main`. It is code-ready and release-green locally.

Operational use still requires LangSmith configuration and a credential. No live trace submission was performed during this verification. Standard graph tracing uses `LANGSMITH_TRACING`, `LANGSMITH_API_KEY`, and `LANGSMITH_PROJECT`. The standalone direct-HTTP `scripts/acn-trace` uploader does not currently add the optional `LANGSMITH_WORKSPACE_ID` / `x-tenant-id` header used by multi-workspace API keys; that is a follow-up compatibility enhancement, not a blocker for single-workspace keys or SDK-managed graph tracing.


## Hosted LangSmith setup procedure — 2026-08-05

This procedure connects the checked-in Beastmode LangGraph runtime to hosted LangSmith for local Studio and observability.

### 1. Create the credential

Sign in at `https://smith.langchain.com`, open **Settings → API Keys**, and create a key. Prefer a service key scoped to exactly one workspace for an application; a PAT is acceptable for personal local testing. Copy it when shown and keep it in a password manager or secret manager.

A single-workspace key is also the current compatibility path for Beastmode's standalone direct-HTTP `scripts/acn-trace` uploader. The LangSmith SDK supports `LANGSMITH_WORKSPACE_ID` for multi-workspace keys, but the standalone uploader does not yet emit the corresponding `x-tenant-id` header.

### 2. Install locally

From the repository root:

```bash
cd /home/lac5q/github/beastmode
python3 --version
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -e 'python[langgraph,studio]'
```

Python 3.11 or newer is required. `.venv/` is gitignored.

### 3. Configure the current shell without putting the key in shell history

```bash
read -rsp "LangSmith API key: " LANGSMITH_API_KEY
printf '\n'
export LANGSMITH_API_KEY
export LANGSMITH_TRACING=true
export LANGSMITH_PROJECT=beastmode
```

For a multi-workspace SDK key, also export `LANGSMITH_WORKSPACE_ID`. For non-US regions set the documented regional `LANGSMITH_ENDPOINT`. Optional first-run privacy masking:

```bash
export LANGSMITH_HIDE_INPUTS=true
export LANGSMITH_HIDE_OUTPUTS=true
```

Leave metadata visible if requested/actual model, drift, and provenance fields should be filterable.

### 4. Start the local Agent Server and Studio

```bash
langgraph dev
```

The checked-in `langgraph.json` exposes graph `pipeline`. The command serves the local API at `http://127.0.0.1:2024` and opens/prints the LangSmith Studio URL. If Brave or Safari blocks localhost, use `langgraph dev --tunnel`, then manually approve the tunnel URL in Studio.

The zero-argument Studio factory is suitable for discovery and visualization. A real end-to-end Beastmode execution requires trusted executor, attestor, validator, and reviewer commands; placeholders must not be used.

### 5. Verify a real completed Beastmode receipt directory

First inspect the sanitized payload without sending:

```bash
scripts/acn-trace /path/to/run-dir \
  --dry-run \
  --project beastmode \
  --goal-id setup-test \
  --harness pi \
  --autonomy medium
```

Then remove `--dry-run` to submit it:

```bash
scripts/acn-trace /path/to/run-dir \
  --project beastmode \
  --goal-id setup-test \
  --harness pi \
  --autonomy medium
```

Use the actual harness name. The run directory must be a real completed Beastmode run containing canonical child `meta.json` receipts.

### 6. Confirm in LangSmith

Open the `beastmode` tracing project in LangSmith. A submitted receipt run appears as a `beastmode.run` parent with `beastmode.child` spans. Filter on `drift`, `unverifiable`, `phase:*`, or `seat:*`.

### 7. Live execution boundary

For live LangGraph execution, use `bm --harness langgraph` only after supplying four real trusted commands:

```bash
bm "add a health check" --harness langgraph \
  --executor-command 'your-child-driver' \
  --attestor-command /trusted/bin/read-harness-journal \
  --validator-command /trusted/bin/validate-result \
  --reviewer-command /trusted/bin/review-result
```

The repository intentionally does not invent these environment-specific helpers. They must satisfy the contracts in `references/beastmode-on-langgraph.md`.


## Deployment update — 2026-08-05

- `maeve-u1`: repository `/home/lac5q/github/beastmode` was clean on `main` at `3dfe849` (the merged LangSmith integration). Installed the editable `beastmode[langgraph,studio]` runtime in `.venv`.
- Verified versions: Beastmode 2.4.0, LangGraph 1.2.10, LangSmith 0.10.15, LangGraph CLI 0.4.31.
- Verified `python/scripts/studio-smoke.py`: LangGraph Studio manifest discovery and health smoke passed.
- Host prerequisites present: Python, Git, 1Password CLI 2.35.0, and bubblewrap.
- Credential binding remains blocked: the `my.1password.com` account is configured on maeve-u1 but has no active session. The Windows-side 1Password integration has a deleted service-account token and the desktop app was unavailable. No secret was read, printed, copied, or stored.
- `main-mac` is online at its Tailscale peer address, with its known host key already verified, but rejected the available `lac5q` SSH identities. No Mac changes were made.
- Completion condition: unlock/sign in to 1Password on maeve-u1 (or restore an approved service account) and authorize an SSH identity on main-mac; then create an `op://`-backed LangSmith env file and validate `Client().list_projects(limit=1)` plus Studio tracing.
