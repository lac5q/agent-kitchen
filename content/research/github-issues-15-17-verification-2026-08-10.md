---
title: "GitHub issues 15, 16, and 17 verification"
description: "Acceptance evidence for the MemroOS product repository knowledge durability and Git remote safety fixes."
publishedAt: "2026-08-10"
tags: ["github", "issues", "knowledge-mcp", "git-safety", "durability", "verification"]
keywords: ["lac5q/memroos-product", "#15", "#16", "#17", "Heroku", "knowledge_write", "knowledge_health"]
author: "Codex"
source_session: "019fdac3-ab4e-7a21-bbef-f37ee440470a"
model: "gpt-5.6"
sources:
  - "https://github.com/lac5q/memroos-product/issues/15"
  - "https://github.com/lac5q/memroos-product/issues/16"
  - "https://github.com/lac5q/memroos-product/pull/17"
  - "label:commit:910fe602"
  - "label:commit:d61fe014"
derived_from:
  - "content/research/github-issues-15-17-resolution-2026-08-10.md"
regen_prompt: "Re-check product-repository GitHub items 15, 16, and 17 against main, run the knowledge-MCP safety suite, and verify both production deployments."
---

# Verification result

Scope is the local product repository `lac5q/memroos-product`; its remote is `https://github.com/lac5q/memroos-product.git`.

## Findings

- **#15 remains administratively OPEN**, but its implementation acceptance is met. `knowledge_write(auto_commit=true)` returns `commit_failed` with an empty SHA when the root is not a safe repository, and returns `ok` only with a 40-character commit SHA.
- **#16 remains administratively OPEN**, but its safety acceptance is met. Git operations require the configured root to be the exact Git toplevel, reject Heroku remotes, expose sanitized remote/health metadata, and stage explicit pathspecs only.
- **#17 is a CLOSED, unmerged pull request**, not an open issue. Its directive changes are present in `main` through the equivalent current-main fixes (`910fe602` and `d61fe014`), including the `git -C "$MEMROOS_ROOT"` fallback, exact-toplevel guard, explicit path staging, and Heroku refusal.

## Verification

- `python -m pytest -q services/knowledge-mcp`: **232 passed**.
- `bash -n scripts/memroos-mcp.sh`, `git diff --check`, and Python bytecode compilation: **passed**.
- Repository and origin are clean and synchronized at `180217a1`.
- Oracle and Cordant production checkouts are both at `180217a1`; MCP services are active; local and public `/api/health` return HTTP 200.
- Invalid onboarding token returns HTTP 403 on Oracle.
- No credentials or secret values were included.

## Administrative note

No GitHub issue/PR was closed or commented on during this verification because external outbound mutations require explicit operator approval. The code and deployments are addressed; #15 and #16 can be closed after the operator reviews this evidence.
