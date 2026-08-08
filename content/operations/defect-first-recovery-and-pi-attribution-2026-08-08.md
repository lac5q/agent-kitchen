---
name: "Defect-first recovery deployment and Pi-agent attribution"
title: "Defect-first recovery deployment and Pi-agent attribution"
description: "Root causes, fixes, and production verification for recovery routes, onboarding issue intake, connector errors, and the supplied Pi-agent report."
publishedAt: "2026-08-08"
tags: [memroos, operations, defects, onboarding, pi-agent, deployment]
keywords: [forgot-password, google-oidc, agent-report, issue-dashboard, prime-agent, pi-agent, nango]
author: "Codex"
source_session: "019fdac3-ab4e-7a21-bbef-f37ee440470a"
model: "gpt-5.6"
sources:
  - "label:memroos-product@aec8404e"
  - "label:production-smoke@2026-08-08"
derived_from:
  - ".planning/ROADMAP.md"
  - ".planning/STATE.md"
regen_prompt: "Re-run the defect-first production probes and inspect the current roadmap before updating this checkpoint."
---

## Outcome

The runtime fix commit `07508cbd` was pushed to `main` and rebuilt on both operator hosts. The docs-only attribution/deployment checkpoint is `aec8404e`. Public recovery routes, onboarding token rejection, app health, and internal required-service probes passed.

## Root causes and fixes

- The unauthenticated UI proxy redirected `/forgot-password` and `/reset-password/*` to `/login`; the public allowlist now permits those routes.
- Google OIDC is configured on Oracle but not Cordant. The status endpoint now returns an explicit `reason: "google_oidc_not_configured"`, and the login page explains the state.
- Agent reports now use the canonical `/api/agent-report` contract with secret-shaped-content rejection, bounded diagnostics, deduplication, `Retry-After` handling, and a dedicated authenticated `/issues` queue. Onboarding scripts self-report registration and client-install failures without forwarding to arbitrary agents.
- Prime Agent receives a private REST memory bridge because no native Prime MCP config surface was verified. Pi remains a first-class shared platform target.
- Nango non-JSON upstream responses no longer cause a JSON parse crash, and unavailable usage is rendered as unavailable instead of an unlimited quota.

## Attribution correction

The transcript that reported successful loopback/security checks, missing episodic capability, native MCP `401`, and a message sent to Lucia should be attributed to **Pi Agent**, not Prime Agent. It is not evidence of a Prime Agent native MCP test or a Prime-specific failure. The shared onboarding/reporting contract is intentionally harness-neutral.

## Verification

- Both public hosts: `/forgot-password` and `/reset-password/test-token` returned HTTP 200.
- Both public hosts: invalid onboarding token returned HTTP 403; structurally valid but unsigned token returned the expected signature error.
- Oracle: `/api/auth/google/status` returned `{"configured":true,"reason":null}`.
- Cordant: `/api/auth/google/status` returned `{"configured":false,"reason":"google_oidc_not_configured"}`.
- Host-local verifier passed for memroos-app, mem0, orchestration, and connmem on both hosts.
- Repository gates: focused tests (116 passed), full fast suite (4,011 passed / 55 skipped), build, lint (0 errors), roadmap-priority gate, and GitNexus change detection completed successfully.
