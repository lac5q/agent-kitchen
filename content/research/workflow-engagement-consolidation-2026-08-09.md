---
name: workflow-engagement-consolidation-2026-08-09
title: "Workflow & Engagement consolidation review"
description: "Kimi K3 design review and production verification for the unified Workflow Map and Engagement surface."
publishedAt: "2026-08-09"
tags: ["ui", "workflow", "engagement", "dispatch", "kimi-k3", "production"]
keywords: ["Workflow & Engagement", "AgentEngagementConsole", "dispatch redirect", "NOC drilldown"]
author: "codex-root"
source_session: "019fdac3-558f-72f1-9ca4-ac23f294db7e"
model: "gpt-5.6-codex"
sources:
  - "repository:/home/lac5q/github/memroos-product@0cdf80c7"
  - "validation:Kimi K3 via Pi"
  - "validation:Vitest/TypeScript/ESLint/production smoke"
derived_from:
  - "user request: merge Workflow Map and Engagement/Dispatch"
  - "Kimi K3 design review"
regen_prompt: "Review the canonical Workflow & Engagement surface, legacy dispatch compatibility, NOC drilldown context, and production deployment evidence; report design defects and verification status without exposing secrets."
---

# Workflow & Engagement consolidation review — 2026-08-09

## Outcome

Workflow Map and Engagement/Dispatch now have one canonical operator surface at `/flow?section=engagement`. The old `/dispatch` page is a compatibility redirect, and the sidebar/NOC quick link point to the canonical surface.

## Kimi K3 review

Initial Kimi K3 review found two concrete defects:

1. The legacy `/dispatch` redirect discarded NOC drilldown parameters.
2. The NOC quick link still used the stale “Dispatch” label and copy.

Both were fixed in `0cdf80c7`. A final Kimi K3 read-only validation returned **PASS**, confirming:

- one `AgentEngagementConsole` render in the canonical flow surface;
- `from_window`, `from_workspace`, and `from_scope_note` are preserved through the legacy redirect;
- the NOC link is canonical “Engage” and carries scope context;
- reduced-motion scrolling is guarded and animation-frame cleanup is safe.

## Verification

- Focused UI tests: 37 passed.
- Full fast suite: 4,154 passed, 55 skipped (507 files; 2 skipped).
- Typecheck: passed.
- ESLint: passed with 90 pre-existing warnings, 0 errors.
- Production build: passed on local, Oracle, and Cordant image builds.
- Oracle and Cordant are healthy on `0cdf80c7`.
- Public onboarding verifier: both hosts return expected HTTP 403 for invalid tokens and signature checks.
- Public `/api/health`: 200 on both hosts.

No credentials or tokens are included.
