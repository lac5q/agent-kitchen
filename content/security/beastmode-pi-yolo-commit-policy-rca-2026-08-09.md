---
title: "Beastmode Pi yolo and Git publication policy RCA"
description: "Root-cause analysis of Pi refusing ordinary Git commits and pushes, with the final policy fixes and residual worker-authority risk."
publishedAt: "2026-08-09"
tags: [beastmode, pi, permissions, git, security, rca]
keywords: [yoloMode, pi-permission-system, git commit, git push, project trust, worker authority]
author: "Codex"
source_session: "codex-thread-2026-08-09"
model: "gpt-5"
sources:
  - "https://github.com/lac5q/beastmode"
  - "beastmode:pi/config/pi-permission-system.json@bceb6bb"
  - "beastmode:scripts/bm@bceb6bb"
  - "beastmode:Codex Security scan f3101c90-47b2-41a6-820e-5efb41fc0c1b"
derived_from: []
regen_prompt: "Re-audit the current Beastmode Pi permission, launcher, worker, installer, and publication paths; explain why ordinary director Git actions are allowed or denied, verify the active global/project policy, and rerun the security and artifact gates."
---

# Beastmode Pi yolo and Git publication policy RCA

## RCA

The refusal was caused by explicit `deny` rules in the Beastmode Pi permission
policy, not by `yoloMode` being disabled. Pi's yolo rewrite changes `ask` to
`allow`; it deliberately preserves `deny`. The original project and installed
global policy therefore denied `git commit` and `git push` even when the
session reported yolo mode enabled.

The project policy was also only checked as bytes on disk. The launcher did not
prove that Pi had trusted and loaded the project-local policy before starting a
headless session, so a fallback global policy could be active in a different
checkout or trust state.

## Fix shipped

- Ordinary director `git commit` and `git push` rules are `ask`, so yolo
  approves them.
- Force, delete, mirror, short-form destructive flags, and destructive
  refspecs remain explicit `deny` rules.
- `scripts/bm` passes Pi `--approve` on every headless run, forcing the
  project-local policy/trust path for that invocation.
- The canonical policy, project copy, installed skill template, and active
  global Pi extension were synchronized with yolo enabled and secret/path
  protections retained.
- The worker sandbox validates Git's common directory before mounting it and
  rejects symlink escapes or paths outside the repository's `.git` directory.

## Verification

The published `main` branch was verified at commits `00a387a` and `bceb6bb`,
with `origin/main` resolving to `bceb6bb527e3c5564abd479d271b75ec22323940`.

- Pi security regressions: passed.
- Shell security regressions: passed.
- Installer integrity and pinned hashes: passed.
- Focused executor tests: 24 passed.
- Public artifact guard, including reachable history: clean.
- Full Python test collection remains incomplete in this environment because
  optional `langgraph` and `langchain_core` dependencies are not installed.

The final Codex Security standard scan (`f3101c90-47b2-41a6-820e-5efb41fc0c1b`)
covered the final revision and found five residual findings: one high, two
medium, and two low.

## Residual blocker

Pi dynamic-workflows workers still do not receive a universally enforced
deny-only Git role. The worker prohibition remains a contract and documented
workflow requirement, while ordinary Git asks are available in the shared Pi
policy. A future hardening change should require every worker invocation to
use an executable worker role that denies commit/push and should make the
preflight reject unscoped worker calls.

The same scan records medium-risk ACP arbitrary-cwd/ambient-environment and
installer integrity TOCTOU findings, plus low-risk worker-output forwarding and
committed-tree-only artifact scanning. These do not change the root cause of
the original commit refusal, but they should be resolved before treating the
release path as fully hardened.
