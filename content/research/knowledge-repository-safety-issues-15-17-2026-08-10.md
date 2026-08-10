---
name: knowledge-repository-safety-issues-15-17-2026-08-10
description: Resolution and production verification for GitHub issues 15, 16, and 17 covering MemroOS knowledge repository boundaries and commit safety.
model: gpt-5.6
sources:
  - github:lac5q/memroos-product/issues/15
  - github:lac5q/memroos-product/issues/16
  - github:lac5q/memroos-product/issues/17
  - repository:services/knowledge-mcp/knowledge_system/store.py
  - repository:services/knowledge-mcp/knowledge_system/mcp_server.py
derived_from: repository inspection, GitNexus impact analysis, automated tests, production smoke checks
regen_prompt: Review GitHub issues 15-17 and verify knowledge-repository boundary, commit reporting, and Heroku remote protections in code and deployments.
---

# Knowledge repository safety — issues 15–17

Date: 2026-08-10

## Resolution

Issues 15 and 16 were addressed in `910fe602`, with the concurrent directive merge recorded in `2a9d4d04`. The implementation now:

- Requires the configured knowledge root itself to be a Git worktree; ancestor repositories are rejected.
- Reports safe Git metadata (root, worktree state, remotes by name/host) through health/status without exposing credentials.
- Rejects Heroku remotes for durable knowledge storage.
- Stages explicit, validated repository-relative paths rather than broad `git add .`/ `-A`.
- Treats missing/failed/empty commit SHAs as write failures instead of reporting success.
- Documents the exact-root and remote-safety requirements in the agent directive.

Issue 17 is closed upstream; its directive change is present in the merged main history.

## Phase 239 follow-on

The deterministic inference recompute scheduler was merged as `6f040f07` and deployed with the safety fixes. It adds a scoped dirty-scope queue, schema version 54, startup scheduling, and regression coverage.

## Verification

- Knowledge MCP: 232 passed.
- MemroOS Vitest: 511 files passed (2 skipped); 4,192 tests passed (55 skipped).
- Typecheck: passed.
- Lint: 0 errors (existing warnings only).
- Oracle production: commit `6f040f07`, application healthy, MCP HTTP service active.
- Cordant Hermes production: commit `6f040f07`, application healthy, MCP HTTP service active.
- Public onboarding bad-token checks: HTTP 403 on both production domains.
- Public health checks: HTTP 200 on both domains.
- Optional RTK/QMD degradation remains expected when those local binaries are not installed.

GitHub issues 15 and 16 remain open because no issue-closing action was requested; the code, tests, and deployments are complete.
