---
title: "MemRoOS MCP Tools Unavailable in Codex Session"
description: "Live diagnosis of why MemRoOS MCP tools were absent from a Codex desktop session on 2026-07-05."
publishedAt: "2026-07-05"
tags: ["memroos", "mcp", "codex", "rca", "agent-runtime"]
keywords: ["MemRoOS MCP", "Codex tools", "MEMROOS_REQUIRE_SERVER_MEMORY", "vector tier", "mcp startup"]
author: "Codex"
source_session: "019f34a1-9f86-7f60-b827-7080643ec9ba"
model: "gpt-5.5"
sources:
  - "local:/Users/USERNAME/.codex/config.toml"
  - "local:/Users/USERNAME/.codex/logs_2.sqlite"
  - "local:scripts/memroos-mcp.sh"
  - "local:apps/memroos/src/app/api/memory/health/route.ts"
  - "local:apps/memroos/src/lib/memory/backends.ts"
derived_from:
  - "content/research/memroos-persist-failure-rca-2026-07-05.md"
regen_prompt: "Re-run the Codex MemRoOS MCP startup diagnosis: inspect active tool exposure, Codex config, MemRoOS launcher env, authenticated memory health, Codex MCP logs, and direct stdio launch behavior."
---

## Summary

MemRoOS MCP tools were unavailable in the Codex desktop session even though `~/.codex/config.toml` contained a valid `[mcp_servers.memroos]` block. The current failure was not a totally dead MemRoOS stack. The operator app was listening on `localhost:3002`, mem0 was healthy on `localhost:3201`, and authenticated agent-context access succeeded.

The decisive failure was the strict memory gate in `scripts/memroos-mcp.sh`. Codex launches MemRoOS with `MEMROOS_REQUIRE_SERVER_MEMORY=1`; when `/api/memory/health` briefly reported `vector=down`, the launcher exited `78` before Codex could list the server tools.

## Evidence

- Active Codex config included MemRoOS stdio launch with `MEMROOS_REQUIRE_SERVER_MEMORY=1`, `MEMROOS_APP_URL=http://localhost:3002`, and `MEMROOS_AGENT_ID=codex-desktop-luis-mbp`.
- `scripts/memroos-mcp.sh --agent-env-status` resolved `agent_id=codex-desktop-luis-mbp`, found the local agent key, and confirmed the strict gate when run with `MEMROOS_REQUIRE_SERVER_MEMORY=1`.
- The operator app returned `200` from `http://localhost:3002/api/health`; RTK, mem0, QMD, Agents, and APO were up. Graph memory was degraded because Neo4j was not configured.
- mem0 returned healthy from `http://localhost:3201/health` with `vector_store=connected`, `memory_runtime.status=available`, and `queue.queued=0`.
- Direct stdio launch of `scripts/memroos-mcp.sh` initially exited `78` with: `MemRoOS server memory unavailable: memory tiers are not healthy: vector=down`.
- A subsequent authenticated `/api/memory/health` check showed `vector:up graph:not_configured episodic:up`, and five repeated checks stayed up. This indicates an intermittent vector health flap or startup race, not a persistently dead vector backend.
- Codex logs showed `server_name=memroos` included among MCP servers and `waiting for MCP server tools ... startup_complete=true`, but no matching `listed MCP server tools` line for MemRoOS. Other servers did list tools.
- `tool_search` still returned zero MemRoOS tools after vector recovered, indicating the current Codex session did not hot-recover a usable MemRoOS tool snapshot.

## Root Cause

MemRoOS MCP tool exposure in Codex is fail-closed on server-memory health. A transient `vector=down` response from `/api/memory/health` caused the stdio launcher to exit before tool enumeration completed. Once Codex built the session's tool list without a valid MemRoOS snapshot, the tools remained unavailable in that session even after the vector tier recovered.

## What Is Separate

- `localhost:8765` was not listening, but the active Codex config uses stdio, so that explains HTTP MCP clients, not the Codex stdio failure.
- The older RCA's statement that local health endpoints were broadly unavailable is stale for this run. On this run, `localhost:3002` and `localhost:3201` were reachable.
- `localhost:3100` was not listening, but it was not the blocker for the Codex MemRoOS MCP launcher path verified here.

## Recommendations

1. Keep the strict fail-closed rule, but add retry/backoff in `require_server_memory_access` before exiting `78`, especially for the vector tier.
2. Add a compact startup smoke command that runs the exact Codex launcher env and performs MCP `tools/list`, not only `--agent-env-status`.
3. Consider setting `MEMROOS_ALLOWED_MEMORY_TIER_STATUSES=not_configured,degraded` only for local development if fail-open behavior is acceptable; do not use that for production trust boundaries without an explicit policy decision.
4. Start a fresh Codex session after vector health is stable. The current session did not hot-add MemRoOS tools after recovery.
5. Separately repair or remove the stale HTTP MCP expectation on port `8765` so ChatGPT/HTTP-client diagnostics do not get mixed with Codex stdio diagnostics.
