# Worker Contract — Phase 154 Probe Timeout Honesty

**Model:** MiniMax-M3  
**Director:** Grok 4.5  
**Date:** 2026-07-15

## Goal
Implement GATE-RESILE-01: Mem0 health probe default 15s + `MEM0_HEALTH_TIMEOUT_MS`.

## Scope (ALLOWED FILES ONLY)
1. `apps/memroos/src/lib/memory/backends.ts`
2. `apps/memroos/src/lib/memory/__tests__/backends-health-timeout.test.ts` (create)

## Non-goals
- Do not change search timeout, memory-inventory, memroos-mcp.sh, mem0-server.py
- Do not unset strict memory / change allow-lists
- Do not commit, push, or modify unrelated files

## Constraints
- Export or testably implement `mem0HealthTimeoutMs()` (export the helper if tests need it)
- Default 15_000; positive int env override; invalid/zero/NaN → 15_000
- `_checkVectorHealthDirect` must use this timeout instead of hardcoded 3000
- Mirror style of existing `memorySearchTimeoutMs()`
- No secrets in code/comments

## Verification the Worker should describe
```
cd apps/memroos && npx vitest run src/lib/memory/__tests__/backends-health-timeout.test.ts
```

## Required output
1. Brief summary
2. Unified diffs for the allowed files only
3. Exact test cases included
