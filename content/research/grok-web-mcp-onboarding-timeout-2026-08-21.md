---
name: "grok-web-mcp-onboarding-timeout-2026-08-21"
title: "Grok web MCP onboarding timeout RCA"
description: "Root cause and remediation for Grok web MCP authentication appearing to hang during MemRoOS onboarding."
publishedAt: "2026-08-21"
tags: ["rca", "onboarding", "mcp", "oauth", "grok"]
keywords: ["Grok", "MCP", "OAuth", "CORS", "timeout", "onboarding"]
author: "Pi"
source_session: "01a02622-9d7e-7c84-aac8-5085df708a4f"
model: "gpt-5.6-luna"
sources:
  - "apps/memroos/src/app/api/auth/mcp/register/route.ts"
  - "apps/memroos/src/app/api/auth/mcp/token/route.ts"
  - "apps/memroos/src/app/api/onboarding/script/route.ts"
  - "apps/memroos/src/lib/auth/mcp-oauth-store.ts"
  - "https://memroos.epiloguecapital.com/mcp"
  - "https://memroos.epiloguecapital.com/.well-known/oauth-protected-resource/mcp"
derived_from: []
regen_prompt: "Re-check the Grok web MCP OAuth discovery, dynamic registration, token exchange, and generated onboarding command for unbounded waits or missing browser CORS, then update this RCA with live probes and tests."
---

# Grok web MCP onboarding timeout RCA

## RCA

Grok web was being treated as a local CLI platform. The invite flow therefore exposed a shell/bootstrap path instead of a first-class remote MCP OAuth path. The OAuth discovery documents had CORS headers, but dynamic client registration and token exchange did not return browser CORS headers on success or validation errors. A browser-hosted MCP client could register or redeem successfully at the server while being unable to read the response, leaving its UI stuck on authentication.

The copied onboarding command and generated script also used curl without a connect or total-request timeout. A failed or unreachable deployment could wait indefinitely; the failure-report fallback had the same risk. CLI setup subprocesses could also wait forever, including the interactive MCP login lane.

## Remediation

- Classify Grok as a remote MCP/OAuth platform and keep it out of shell bootstrap generation.
- Add CORS headers to dynamic registration and token responses, including errors and preflight responses.
- Detect Grok client names and exact Grok/x.ai redirect hosts so OAuth agents are recorded as grok, not the generic Claude platform.
- Give generated downloads and registration/report requests bounded curl timeouts; download to a temporary file so curl failure prevents bash from running.
- Bound client setup commands and the Claude/Codex login subprocess, with a clear timeout message.
- Show Grok web instructions in the invite page, operator invite prompt, and generated script; stale OAuth entries are removed and re-added rather than receiving an agent API key.

## Verification

- npm run test:fast: 4,975 passed, 58 skipped.
- Slow onboarding suite: 52 passed.
- Targeted MCP/OAuth, onboarding, identity, prompt, and platform tests: 50 passed.
- npm run typecheck: passed.
- npm run build: passed; Next emitted only the existing workspace-root and broad file-pattern warnings.
- npm run lint: 0 errors; existing repository warnings remain.
- Live pre-fix probe showed /mcp returned an immediate stale-token 401 and OAuth discovery returned 200; dynamic registration lacked the CORS response headers that the fix adds.
