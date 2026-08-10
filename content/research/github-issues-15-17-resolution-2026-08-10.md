---
name: github-issues-15-17-resolution-2026-08-10
description: Verification report for MemroOS GitHub issues 15, 16, and 17 and the corresponding production rollout.
model: gpt-5.6-luna
sources:
  - GitHub issues #15 and #16 in lac5q/memroos-product
  - GitHub pull request #17 in lac5q/memroos-product
  - commit 910fe602 (knowledge repository safety fix)
  - commit 9d42ee13 (coverage additions and deployment)
  - repository test and deployment gates run 2026-08-10
derived_from: repository inspection, focused tests, full test gates, and production health checks
regen_prompt: Re-run the issue-state inspection, knowledge MCP safety tests, full app gates, and both production verification gates for GitHub issues 15, 16, and 17.
---

# GitHub issues 15–17 resolution report

## Scope

This report covers the three knowledge-repository safety items requested for today:

- **#15** — knowledge writes must not report success when the configured root is not a Git repository.
- **#16** — knowledge storage must never resolve to or use a Heroku application repository.
- **#17** — the directive change that pins Git operations to the configured knowledge root; the pull request is closed.

## Resolution

Commit `910fe602` implements the shared fix:

- exact-root Git worktree validation (no ancestor-repository fallback);
- Heroku remote detection and refusal;
- secret-safe remote host metadata in health output;
- explicit path staging with `git -C <root> add -- <path>`;
- loud `commit_failed` responses when a write cannot produce a commit SHA;
- regression coverage for ancestor roots, Heroku remotes, clean commits, and SHA presence;
- updated agent directive prohibiting broad staging and Heroku-backed knowledge storage.

The Main-Mac coverage additions were merged onto `main` as `9d42ee13` and add 29 route/lifecycle regression tests without changing production behavior.

## Verification

- Knowledge MCP tests: **232 passed**.
- Full fast app suite: **4,221 passed, 55 skipped** across 516 files.
- Slow split: **55 passed, 4,221 skipped** across 3 files.
- TypeScript typecheck: **passed**.
- ESLint: **0 errors**, 91 existing warnings.
- Oracle and Cordant production builds: **passed** at `9d42ee13`.
- Both production app containers restarted; remote MCP systemd service active.
- Both public `/api/health` endpoints returned HTTP 200.
- Both onboarding bad-token checks returned HTTP 403, including the signature-rejection check.

## GitHub state

- #15: **open**, with the fix deployed and verified. Closing/commenting was not performed because issue-state changes are external actions requiring an explicit operator send/close approval.
- #16: **open**, with the fix deployed and verified. Closing/commenting was not performed for the same reason.
- #17: **closed** pull request; its directive changes are present in `main`.

No credentials or tokens were included in this report.
