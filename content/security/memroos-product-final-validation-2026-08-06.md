---
title: "Final security and correctness validation: onboarding and memory resilience"
description: "Final review of the MemroOS staged and unstaged worktree changes for remote MCP onboarding, authorization, memory alerts, Mem0 retry behavior, and QMD launchd migration."
publishedAt: "2026-08-06"
tags: [security, validation, onboarding, remote-mcp, memory, qmd]
keywords: [Claude Cowork, ChatGPT Workspace Agent, OAuth, tenant authorization, Mem0, Gmail ingestion, launchd]
author: "Codex"
source_session: "codex-2026-08-06"
model: "gpt-5"
sources:
  - "label:memroos-product HEAD-to-worktree review"
  - "label:repository AGENTS.md and local security-validation guidance"
  - "label:focused test and static inspection results"
derived_from: []
regen_prompt: "Re-run a read-only HEAD-to-worktree security and correctness review of the onboarding, remote MCP authorization, memory healthcheck, Mem0 queue, Gmail detection, and QMD launchd paths, then update file/line evidence."
---

# Final security and correctness validation

## Verdict

FAIL

## Findings

### HIGH — Remote OAuth is not bound to tenant, role, or scope

The OAuth authorization endpoint persists caller-supplied scope without allowlist enforcement, while the Python resource-server verifier validates only token activity. MCP knowledge tools accept caller-supplied agent, role, tenant, and user values. The central knowledge-audit endpoint authenticates only the MCP host key and records those body values without checking them against the OAuth principal. A remote Cowork/ChatGPT user can therefore invoke write/delete-capable tools with a read token and select another tenant or admin role; the audit trail does not prevent the mismatch.

Evidence: `apps/memroos/src/app/api/auth/mcp/authorize/route.ts:87,145-150`; `services/knowledge-mcp/knowledge_system/mcp_server.py:190-228,539-565,789-816,889-990`; `apps/memroos/src/app/api/audit/knowledge/route.ts:107-140,143-200`.

### MEDIUM — OAuth workspace agents cannot use the governed memory API as their owned identity

The MCP service prefers a single static agent API key, otherwise forwards the OAuth bearer to `/api/memory/*`. The app memory route accepts only hashed agent API keys. Additionally, `memory_save` defaults to the explicit `shared` identity, which wins over the token-derived agent. Remote OAuth memory search/save therefore returns unauthorized or is attributed to a shared/static identity instead of the connecting owner.

Evidence: `services/knowledge-mcp/knowledge_system/mcp_server.py:568-600,1082-1123`; `apps/memroos/src/app/api/memory/add/route.ts:28-43`; `apps/memroos/src/lib/agent/registry.ts:754-784`.

### MEDIUM — Mem0 permission failures are queued and retried indefinitely

`PERMISSION_DENIED` is classified as retryable, and `MAX_RETRIES=3` is declared but never incremented or enforced by replay. A permanent auth/configuration failure is returned as queued, the payload remains durable, and the worker retries it every ten seconds forever.

Evidence: `services/memory/mem0-server.py:85-96,425-428,848-867`; `services/memory/mem0_queue.py:19-32,114-165`.

### MEDIUM — The configured critical disk-percent threshold is downgraded to warning

With the defaults `DISK_CRITICAL_PERCENT=95`, `healthcheck_disk_level 95 35 90 95 25 10` returns `warning`; the new regression test explicitly locks in that result. The healthcheck therefore does not emit the critical alert at the configured critical percentage unless the free-GB threshold is also crossed.

Evidence: `services/memory/healthcheck-policy.sh:25-41`; `services/memory/healthcheck.sh:45-48,239-262`; `services/memory/tests/test_healthcheck_policy.sh:18-21`.

### MEDIUM — Gmail log inspection can report recovery for a failed or incomplete run

The latest log block is considered healthy whenever it lacks one of four exact failure strings. A current block containing only a start marker, or a generic nonzero/error message, therefore clears `email_ingestion_failed`; no success/completion marker or run-state check is required.

Evidence: `services/memory/healthcheck-policy.sh:44-46`; `services/memory/healthcheck.sh:520-538`.

### MEDIUM — The QMD migration is not actually Node/launchd-safe

The generated plist excludes the documented `~/.local/bin` Node path and does not set `QMD_NODE_BIN`; the launcher instead chooses a sibling `node` beside the qmd executable, which is not proven ABI-compatible with QMD's native `better-sqlite3`. The historical plist is booted out but left on disk, so a later LaunchAgents reload can load both jobs and race for port 9472.

Evidence: `scripts/install-memory-resilience.mjs:13-24,167-175`; `services/memory/start-qmd-http.sh:4-29`; `content/diagnostics/2026-07-31-qmd-down-better-sqlite3-abi-mismatch.md:30-34,55-59`.

## Verification limits

`bash -n` and both git whitespace checks passed. The focused Vitest, pytest, and shell-policy runs could not start because this read-only sandbox cannot create temporary files under `/tmp`; no product files were edited. The memory-engine decision command passed fail-closed with `decision=emulate` because required evidence is absent. Production/workspace-admin onboarding smoke remains explicitly blocked in `.planning/REQUIREMENTS.md:15`.
