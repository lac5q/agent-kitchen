# GOAL STATE — v8.12 MemRoOS MCP Memory Gate Resilience (Codex)

**Created:** 2026-07-15T20:45:27Z  
**Updated:** 2026-07-15T20:45:27Z  
**Version:** 2026-07-15.1  
**Branch:** `beastmode/v8.12-mcp-memory-gate-resilience`  
**Director:** Grok 4.5 (Beastmode + GSD orchestrator)  
**Worker:** MiniMax-M3 (preferred)  
**Watcher:** Grok 4.5 (adversarial BinEval)

## Problem

Codex launches MemRoOS MCP with `MEMROOS_REQUIRE_SERVER_MEMORY=1`. The operator
probe to Mem0 `/health` uses a **3s** abort while live Mem0 health on Qdrant Cloud
often takes **9–31s**. Transient probe timeouts report `vector=down`, the strict
gate exits `78`, and Codex never lists MemRoOS tools for that session.

Secondary causes:
- Mem0 background checker self-HTTP loops to `localhost:3201/health` (can hang itself).
- Home-directory `df%` alone can mark overall health degraded → vector tier fails strict gate even when Qdrant Cloud is fine.

## Locked Product Decisions

- Keep `MEMROOS_REQUIRE_SERVER_MEMORY=1`
- Do **not** fix by allow-degraded defaults or unsetting strict
- Vectors already on Qdrant Cloud; fix probe honesty + hang immunity + diagnostics

## Goal State (done when)

1. **Phase 154** — Mem0 health probe default timeout is **15s**, overridable via `MEM0_HEALTH_TIMEOUT_MS`; tests prove timeout honesty (no false `vector=down` from 3s abort on slow-but-healthy Mem0).
2. **Phase 155** — Mem0 no longer self-HTTP health-loops; Qdrant probe remains cached; optional `/livez`; `healthcheck.sh` can auto-restart hung Mem0 with cooldown.
3. **Phase 156** — Strict-gate failure messages expose tier/detail/disk vs vector; path-scoped disk checks so home `df%` alone does not map to `vector=down`.

## Non-goals

- Unsetting strict memory / widening `MEMROOS_ALLOWED_MEMORY_TIER_STATUSES` as the fix
- Replacing Qdrant Cloud
- Unrelated AGENTS.md / eval JSON / init.sh churn

## Mac follow-up (operator verify)

```bash
# After merge + pull on Mac
MEMROOS_REQUIRE_SERVER_MEMORY=1 MEMROOS_MCP_CLIENT=codex \
  scripts/memroos-mcp.sh --agent-env-status
MEMROOS_REQUIRE_SERVER_MEMORY=1 MEMROOS_MCP_CLIENT=codex \
  scripts/memroos-mcp.sh --strict-memory-check
# Expect pass when Mem0/Qdrant healthy; probe must tolerate slow /health
curl -sS -m 20 http://localhost:3201/health | jq '{status,vector_store,disk}'
curl -sS -m 5 http://localhost:3201/livez 2>/dev/null || true
```
