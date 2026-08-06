---
name: "memroos-product-final-security-validation-2026-08-06"
title: "MemroOS Product Final Security Validation"
description: "Read-only security and correctness validation of onboarding, MCP OAuth, memory alerting, Mem0 retry behavior, and QMD launchd migration."
publishedAt: "2026-08-06"
tags:
  - security
  - validation
  - onboarding
  - memory
  - qmd
keywords:
  - Claude Cowork
  - ChatGPT Workspace Agent
  - remote MCP
  - tenant authorization
  - memory alerts
  - Mem0
  - QMD
author: "Codex"
model: "gpt-5"
sources:
  - "local:apps/memroos/src/app/api/auth/mcp/register/route.ts"
  - "local:apps/memroos/src/app/api/auth/mcp/authorize/route.ts"
  - "local:apps/memroos/src/app/api/onboarding/register/route.ts"
  - "local:services/memory/healthcheck.sh"
  - "local:services/memory/mem0_queue.py"
  - "local:services/memory/start-qmd-http.sh"
derived_from: []
regen_prompt: "Re-run a read-only final security and correctness review of the current staged and unstaged diffs, focusing on remote MCP onboarding, owner/tenant authorization, platform spoofing, memory health alerting, Mem0 retries, and QMD launchd."
---

# Final Security Validation

Verdict: FAIL.

## High

- The public MCP OAuth flow has no consent or client-initiation binding. Dynamic registration accepts arbitrary HTTPS redirect URIs; an attacker can register a client, send a logged-in user to authorize, receive a code at the attacker's redirect, and redeem it with the attacker's PKCE verifier for the user's MCP token. PKCE and exact redirect matching do not prevent attacker-initiated authorization. References: apps/memroos/src/app/api/auth/mcp/register/route.ts:7-12,22-52; apps/memroos/src/app/api/auth/mcp/authorize/route.ts:120-156; apps/memroos/src/app/api/auth/mcp/token/route.ts:51-73.

## Medium

- The local/remote platform boundary is not enforced server-side. A shell onboarding token's signed defaultPlatform is ignored when register accepts the caller's platform, so a local token can register a row as chatgpt or cowork. References: apps/memroos/src/app/api/onboarding/register/route.ts:28-31,96-104; apps/memroos/src/lib/agent/onboarding.ts:175-184.

- Platform metadata is caller-spoofable and functional. Open dynamic registration plus client_name classification accepts ChatGPT/Cowork labels with unrelated redirects, while chat runtime uses the label for provider/runtime routing. References: apps/memroos/src/app/api/auth/mcp/register/route.ts:7-12,46-52; apps/memroos/src/lib/auth/mcp-oauth-store.ts:212-241; apps/memroos/src/app/api/chat/chat-runtime.ts:54-61,270-288.

- Alert deduplication records the 24-hour timestamp before notification delivery. If all sinks fail and the macOS fallback fails, the alert is suppressed for 24 hours. References: services/memory/healthcheck-policy.sh:13-22; services/memory/healthcheck.sh:176-214.

- Gmail false-success detection is not wired to a producer or launchd environment in this repository. The check only runs if /tmp/personal-ingestion-email.log exists, while the installer does not set EMAIL_INGESTION_LOG; freshness state can therefore report a successful run without checking the ingestion result. References: services/memory/healthcheck.sh:520-539; scripts/install-memory-resilience.mjs:27-41; services/memory/.env.example:20-24.

- Mem0 replay is unbounded for permanent failures and remains at-least-once without an idempotency key. A committed request can be duplicated after timeout, and poison requests are retried indefinitely because MAX_RETRIES is not applied. References: services/memory/mem0_queue.py:18-20,114-165; services/memory/mem0-server.py:431-475,595-599,826-867,1221-1234.

- The new QMD launchd job is not Node-pinned. It derives Node beside the qmd executable and does not set QMD_NODE_BIN, so symlinked/global qmd installations can fail or select an unintended Node version. References: services/memory/start-qmd-http.sh:4-39; scripts/install-memory-resilience.mjs:13-24; scripts/launchd-start.sh:20-28.

## Validation

- Focused Vitest/Pytest/shell/installer checks could not execute because the read-only sandbox prevents temporary-directory creation under /tmp. Bash/Python syntax checks, pure disk/email helper checks, and the memory-engine decision evaluation completed; the evaluation correctly withheld production rollout with no evidence.
