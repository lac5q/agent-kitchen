---
name: "bm-run-229-v1-agent-issue-reporting-validation"
title: "BM-RUN 229-v1 Agent Issue Reporting Validation"
description: "Adversarial validation of Phase 229 AGENTREPORT-01..05 against the unstaged working-tree patch."
publishedAt: "2026-08-04"
tags: [memroos, security-review, beastmode, agent-reporting, onboarding]
keywords: [AGENTREPORT-01, AGENTREPORT-02, AGENTREPORT-03, AGENTREPORT-04, AGENTREPORT-05, proxy, OAuth, rate-limit]
author: "Codex"
source_session: "BM-RUN: 229-v1"
model: "gpt-5-codex"
sources:
  - "repo:.beastmode/worker-prompts/229-validate.txt"
  - "repo:.beastmode/worker-prompts/229-agent-issue-reporting.md"
  - "repo:.planning/phases/229-agent-issue-reporting/229-01-PLAN.md"
  - "repo:apps/memroos/src/proxy.ts"
  - "repo:apps/memroos/src/app/api/agent-report/route.ts"
  - "repo:apps/memroos/src/app/api/agent-report/__tests__/route.test.ts"
  - "repo:services/knowledge-mcp/knowledge_system/mcp_server.py"
derived_from:
  - ".planning/phases/229-agent-issue-reporting/229-01-PLAN.md"
regen_prompt: "Read the Phase 229 validator prompt and adversarially review the full unstaged patch, including the Next.js proxy boundary, against AGENTREPORT-01..05."
---

# BM-RUN 229-v1 validation

## Verdict

Reject.

## Release blocker

The new `POST /api/agent-report` handler is not reachable through its intended weak credentials in the deployed Next.js request path. `apps/memroos/src/proxy.ts` does not include `POST /api/agent-report` in `ROUTE_LOCAL_AUTH_API_ROUTES`. Consequently the proxy applies its human-JWT gate before the handler:

1. Agent API keys are not human JWTs and receive 401.
2. MCP OAuth access tokens are resolved by the handler's `resolveAccessToken`, but the proxy rejects them first as non-JWTs.
3. Anonymous onboarding posts have no JWT and receive 401 before the special lane can validate `component=onboarding` and `tokenKid`.

This defeats AGENTREPORT-01, AGENTREPORT-02, and AGENTREPORT-04. The safe fix shape is a method-specific route-local-auth exemption for POST only; GET and PATCH must remain behind the human JWT/operator boundary and retain handler role checks.

## Why the tests missed it

The new route tests import and invoke `POST`, `GET`, and `PATCH` directly. They do not exercise `apps/memroos/src/proxy.ts`, so the agent-key, OAuth, and anonymous-onboarding tests are handler-only and cannot prove the production auth matrix.

Required coverage is also incomplete:

- no operator-session POST test;
- no anonymous general-component rejection test;
- no title/body cap boundary tests;
- only the Bearer secret pattern is tested, not `ak_`, `SG.`, and 64-hex;
- no proxy-boundary test proving POST passes through to route-local auth while GET/PATCH remain protected.

## Additional DoS concern

After the proxy blocker is fixed, anonymous request parsing and field validation occur before the onboarding IP rate limiter. Invalid JSON, oversized JSON, and invalid payloads therefore do not consume a limiter bucket. Also, scoped rate-limit buckets are retained indefinitely and trusted `x-forwarded-for` values directly select bucket identity. This is lower severity than the release blocker but should be addressed or explicitly accepted before calling the anonymous lane DoS-bounded.

## Controls that were correctly implemented

- OAuth tokens are verified server-side via hashed token resolution, expiry, and revocation checks.
- SQL filters and transitions use bound parameters; no SQL injection was found.
- Team/NOC output uses React text rendering rather than raw HTML, so stored report text is escaped.
- The required title/body credential-shaped regexes are present and return the exact 422 coaching response.
- MCP credential precedence is agent key then request bearer, with no-credential failure returned as `unavailable`.
- The onboarding report payload is generated through Python JSON serialization, scrubs the onboarding token and credential patterns, quotes shell arguments, and makes reporting failure non-fatal.
- Schema/store, NOC aggregation, Team issue list, ack/resolve audit events, CORE_TOOLS registration, orientation text, and agent directive propagation are present.

## Verification notes

The director supplied evidence that the full fast suite, typecheck, and SQLite allowlist ratchet passed. Independent targeted Vitest and pytest reruns were attempted, but this validator session had a read-only filesystem with no usable temporary directory, so both runners failed during temporary-directory setup before executing tests. `git diff --check` passed.
