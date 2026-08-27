---
title: Beastmode Gemini, Antigravity, and VibeProxy support implementation
date: 2026-08-26
model: "Codex GPT-5 runtime (exact serving identity not independently exposed)"
sources:
  - "beastmode commit 3995ad4"
  - "https://geminicli.com/docs/cli/cli-reference/"
  - "https://antigravity.google/docs/cli/headless/"
  - "https://antigravity.google/docs/cli/permissions/"
  - "content/beastmode/gemini-antigravity-vibeproxy-support-discovery-2026-08-26.md"
derived_from:
  - "adversarial support-contract review"
  - "independent Google CLI, installer, VibeProxy, and integrated-wiring reviews"
  - "repository and focused verification receipts"
regen_prompt: "Audit Beastmode commit 3995ad4 and regenerate the support matrix, security boundaries, review findings, and exact verification results for Gemini, Gemini CLI, Antigravity, Antigravity CLI, and VibeProxy direct-API subworkers."
---

# Outcome

Beastmode local `main` was fast-forwarded to commit `3995ad4`. The implementation adds explicit support surfaces for Gemini, Gemini CLI, Antigravity desktop, Antigravity CLI, and VibeProxy direct-API subworkers without installing providers, authenticating, changing credentials, or making live provider calls.

## Public support matrix

- `--harness gemini` is a tested pure alias for `gemini-cli`.
- `--harness gemini-cli` invokes only the guarded, context-free Gemini CLI advisory adapter.
- `--harness antigravity` represents desktop skill/context integration and deliberately exits 2 for terminal dispatch; no GUI automation is claimed.
- `--harness antigravity-cli` invokes only the guarded `agy` advisory adapter.
- `--harness vibeproxy` invokes the isolated VibeProxy parent broker and reviewed Pi bridge for a direct-API subworker draft.
- Gemini and Antigravity CLI automation is advisory-only. VibeProxy is subworker-only. Every successful result is `UNVERIFIED_DRAFT`, reports `actual_model: null`, and has no validator, executor, merge, or provenance authority.

## Security boundaries

Google CLI lanes require exact registry model IDs, an absolute operator qualification receipt, an identity-pinned executable closure, isolated owned settings/policy, Bubblewrap, filtered Secret Service access, bounded parent-mediated egress, strict JSONL parsing, and unchanged exit codes: 1 failure, 2 unavailable, 3 draft. Bare `PATH` discovery is forbidden after an unrelated `/snap/bin/gemini` collision launched a GUI OAuth flow during discovery; it was terminated without authentication.

VibeProxy keeps `BEASTMODE_VIBEPROXY_API_KEY` only in the parent broker. It permits only literal `127.0.0.1:8317/v1`, disables proxy/redirect/DNS alternatives, validates the catalog and an unequal random invalid bearer, loads only the reviewed Pi bridge and permission closure, and permits at most eight serialized requests. The accepted real-host fixture proved two turns, tool-result fidelity, and that FD 3 and the provider key were absent from the spawned tool process. Loopback does not prove vendor identity; same-UID port hijacking remains a documented residual risk.

Protected preflight runs before `BM_SKIP_MODEL_CHECK` and remote dispatch. The new lanes require an explicit frontier model and reject remote execution, economy/watcher fan-out, Claude-subscription routing, and worker-network flags. Prompts use stdin; model, receipt, repository, and commit remain separate argv fields.

## Installer boundary

The full Beastmode snapshot contains the runtime adapters and exposes the new harnesses. Installer targets were added for Gemini and Antigravity skill roots with ownership-safe lifecycle handling. The standalone Pi bootstrap remains immutably pinned to its v2.4.0 runner hash and explicitly does not include or advertise the new automated lanes.

## Review history

The initial Google and VibeProxy implementations were rejected for synthetic or non-operational proof. Repairs added real sandbox/broker paths, artifact-closure validation, bounded I/O, strict parsing, and real two-turn Pi evidence. Integrated wiring was also rejected once because the Pi installer paired an unreleased working-tree hash with immutable v2.4.0 content; the repair restored the actual v2.4.0 hash and made the support boundary explicit. Independent final reviews accepted the installer, Google CLI lane, VibeProxy lane, and shared wiring.

Requested subagent capacities were Luna/high for executors and Terra/high for reviewers. The collaboration runtime did not independently expose actual subagent model identity, so no silent substitution or serving-model attestation is claimed.

## Verification

- `bash tests/run-all.sh`: 15/15 groups passed.
- Google advisory focused suite: 11/11 passed.
- VibeProxy focused suite: 15/15 passed, including the real host Bubblewrap 0.9.0 and Pi 0.84.3 two-turn fixture.
- Complete Python suite: 166 passed from a disposable worktree named `beastmode`. The integration worktree first produced 165 passed plus one pre-existing basename assertion because its directory was named `beastmode-integration-gemini-antigravity`.
- Installer lifecycle, integrity, shell-security, ACN parity, syntax, JSON, and diff checks passed.
- GitNexus was rebuilt after an FTS-cache inconsistency and is current at `3995ad4` with 2,040 nodes, 3,712 edges, 64 clusters, and 150 flows.
- Pre-merge GitNexus change detection reported CRITICAL blast radius: 463 changed symbols across 56 flows. This warning was retained and addressed through isolation, focused tests, independent reviews, and full-suite verification; it was not downgraded or ignored.

No push was performed for the Beastmode repository. Local `main` is ahead of `origin/main` by seven commits, five of which implement this support goal.
