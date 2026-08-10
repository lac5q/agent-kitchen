---
title: "GitHub issues 15-17 verification follow-up"
description: "Verification of the product-repository knowledge durability and Heroku safety fixes for issues 15, 16, and superseded PR 17."
publishedAt: "2026-08-10"
tags: [github, issues, knowledge, git-safety, durability, verification]
keywords: [issue-15, issue-16, issue-17, knowledge-root, heroku, git-worktree, memroos]
author: "Codex"
source_session: "019fdac3-ab4e-7a21-bbef-f37ee440470a"
model: "gpt-5.6"
sources:
  - "https://github.com/lac5q/memroos-product/issues/15"
  - "https://github.com/lac5q/memroos-product/issues/16"
  - "https://github.com/lac5q/memroos-product/pull/17"
  - "label:commit-910fe602"
derived_from:
  - "content/research/github-issues-15-17-verification-2026-08-10.md"
regen_prompt: "Re-fetch product issues 15-17, inspect the fix commit and tests, rerun the knowledge-MCP suite, and verify both operator deployments."
---

# Verification

## Current GitHub state

- Issue #15 is open: knowledge writes must not report success without a durable commit.
- Issue #16 is open: knowledge storage and git operations must reject ancestor/Heroku repositories.
- PR #17 is closed and superseded; its directive changes are present in the mainline fix.

## Implemented fix

Commit `910fe602` enforces the requested behavior:

- `KnowledgeStore` requires the configured root to be its own Git worktree.
- Heroku remotes are rejected before status, staging, commit, or write success.
- Explicit paths are staged; broad `git add .` / `git add -A` behavior is removed.
- Auto-commit cannot return `status: ok` without a non-empty commit SHA.
- Health output includes sanitized remotes/hosts and degrades for an unsafe or non-repository root.
- `agents/AGENTS_TEMPLATE.md` pins fallback commands to `git -C "$MEMROOS_ROOT"`, requires the toplevel/remote preflight, and forbids Heroku knowledge stores.

## Verification evidence

- Focused regression suite: `services/knowledge-mcp/tests/test_git_safety.py` — 8 passed.
- Full knowledge-MCP suite: `services/knowledge-mcp/tests` — 232 passed.
- Production checkout fingerprints:
  - oracle-1 `/home/opc/memroos`: `180217a1`, main.
  - cordant-hermes-01 `/home/ubuntu/memroos`: `180217a1`, main.
- Both `memroos-mcp-http.service` (Cordant) and the Oracle Docker stack are healthy.
- Public `/api/health` returned HTTP 200 for both operator hosts.
- Onboarding bad-token probes returned HTTP 403 with the expected invalid-token responses on both hosts.

## Remaining governance action

No code defect remains for these three items in the current checkout. Issues #15 and #16 remain open in GitHub because changing issue state or posting an external status comment is an outbound action that needs explicit operator approval. PR #17 is already closed/superseded.

No credentials or tokens were included.


## Independent validator

- Fable 5 via `claude -p --model fable --effort high` returned `VERDICT: PASS`.
- It found no gap after reading only the guarded store, MCP health facade, regression tests, and directive.
