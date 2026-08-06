---
title: "Codex Cloud environment migration for memroos-product"
description: "Decision record for reusing the existing MemRoOS Codex Cloud environment with the private memroos-product repository."
publishedAt: "2026-08-06"
tags: [codex, cloud, memroos-product, environment, setup]
keywords: [Codex Cloud, memroos-product, environment settings, setup script, cache reset]
author: "codex"
source_session: "019fd8b6-2749-7922-a260-d68d3024d55c"
model: "gpt-5"
sources:
  - "https://learn.chatgpt.com/docs/cloud"
  - "https://learn.chatgpt.com/docs/environments/cloud-environment"
  - "workspace:/home/lac5q/.codex/worktrees/182f/memroos-product/docs/codex-cloud-development.md"
derived_from: []
regen_prompt: "Re-check the official Codex Cloud environment docs and the memroos-product repository, then update the recommended migration steps, cache guidance, and setup-script references."
---

## Decision

Reuse the existing MemRoOS Codex Cloud environment if its settings page permits changing the repository and display name. Point it to the private `lac5q/memroos-product` repository and rename it `memroos-product`.

Keep:
- setup script: `bash scripts/setup-codex-cloud.sh`
- maintenance script: `bash scripts/setup-codex-cloud.sh --maintenance`
- existing service variables and secrets, after checking that they are scoped for this environment

Remove stale absolute `MEMROOS_ROOT` and `KNOWLEDGE_ROOT` values so the bootstrap derives paths from the cloud checkout. Reset the environment cache after the repository or bootstrap scripts change.

If the settings UI does not expose both repository editing and renaming, create a second environment for `lac5q/memroos-product` with the same settings. The repository bootstrap is already checkout-path independent.

## Evidence

The official Codex Cloud guide directs users to create/configure environments from Codex settings and describes setup scripts, variables/secrets, and cache reset behavior. The repository's cloud documentation and bootstrap comments now identify `lac5q/memroos-product`.
