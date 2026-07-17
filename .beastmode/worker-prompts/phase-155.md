# Worker Contract — Phase 155 Mem0 Hang Immunity

**Model:** MiniMax-M3  
**Director:** Grok 4.5  
**Date:** 2026-07-15

## Goal
GATE-RESILE-02: Remove self-HTTP health loop; cache Qdrant on /health; add /livez; healthcheck.sh auto-restart hung Mem0 with cooldown.

## Scope (ALLOWED FILES ONLY)
1. `services/memory/mem0-server.py`
2. `services/memory/healthcheck.sh`
3. `services/memory/tests/test_mem0_hang_immunity.py` (create)

## Non-goals
- Do not change apps/memroos TS probe timeout
- Do not change disk path-scoping (phase 156)
- Do not commit/push
- Do not unset strict memory

## Constraints
1. `_qdrant_health_checker` must NOT call `http://localhost:3201/health` or self-POST `/memory/reset` via HTTP. Use in-process `check_qdrant_vector_store` / `reset_memory()` / `get_memory(force_reset=True)` instead.
2. `/health` Qdrant status must use interval cache (reuse `_qdrant_probe_*` or add `_health_qdrant_*` cache) — not a live HTTP probe on every /health when within interval.
3. Add `GET /livez` returning `{"status":"ok"}` (or similar) without Qdrant/disk/sqlite/queue work.
4. `healthcheck.sh`: if Mem0 health curl fails/times out (hung), attempt restart via `launchctl kickstart -k gui/$(id -u)/com.mem0.server` (or documented fallback) with cooldown state file under `$ALERT_STATE_DIR` (e.g. 15–30 min). Do not restart-storm.
5. Prefer `asyncio.to_thread` for sync health/qdrant checks inside async checker.

## Required output
Unified diffs for allowed files + brief summary + test cases.
