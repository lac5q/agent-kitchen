# Worker Contract — Phase 156 Strict-Gate Diagnostics + Path-Scoped Disk

**Model:** MiniMax-M3  
**Director:** Grok 4.5  
**Date:** 2026-07-15

## Goal
GATE-RESILE-03: Better strict-gate diagnostics; path-scoped disk so home df% alone does not map to vector=down.

## Scope (ALLOWED FILES ONLY)
1. `services/memory/mem0-server.py` — path-scoped `check_disk_space` / health disk aggregation
2. `apps/memroos/src/lib/memory/backends.ts` — vector mapping: connected vector_store + available runtime must not become `down` solely from disk; prefer `up` with disk detail or keep disk out of vector status
3. `scripts/memroos-mcp.sh` — enrich failure messages with tier=status(+detail) without printing API keys
4. Tests:
   - `services/memory/tests/test_path_scoped_disk.py` (create)
   - `apps/memroos/src/lib/memory/__tests__/backends-disk-vector.test.ts` (create)

## Non-goals
- Do not widen MEMROOS_ALLOWED_MEMORY_TIER_STATUSES defaults
- Do not unset MEMROOS_REQUIRE_SERVER_MEMORY
- Do not commit/push

## Constraints
- Keep MEMROOS_REQUIRE_SERVER_MEMORY=1 semantics
- Disk critical on home alone must NOT force vector tier `down` when vector_store=connected
- Prefer checking QUEUE_DB_PATH parent + LOG_DIR for critical disk decisions
- Diagnostics must never print MEMROOS_AGENT_API_KEY / bearer tokens

## Required output
Unified diffs + summary + tests.
