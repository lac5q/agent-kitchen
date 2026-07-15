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

## Current backends.ts (relevant excerpt)
```typescript
import { MEM0_URL } from "@/lib/constants";
import type { MemoryTier } from "./tiers";
import type { MemoryAdapter, MemoryCapability, MemorySearchResult } from "./adapter";
import { getAdapters, registerAdapter } from "./registry";
import { getDb } from "@/lib/db";
import { filterAuthorizedMessageRows } from "@/lib/memory/policy-gate";
import type { MemoryTierHealth } from "./registry-contract";

export type { MemoryTierHealth } from "./registry-contract";

function timeoutSignal(ms: number): AbortSignal {
  return AbortSignal.timeout(ms);
}

function memorySearchTimeoutMs(): number {
  const parsed = Number(process.env.MEMROOS_MEMORY_SEARCH_TIMEOUT_MS ?? 15_000);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 15_000;
}

export function neo4jConfig() {
  return {
    url: (process.env.NEO4J_HTTP_URL || "http://localhost:7474").replace(/\/$/, ""),
    database: process.env.NEO4J_DATABASE || "neo4j",
    username: process.env.NEO4J_USERNAME || "neo4j",
    password: process.env.NEO4J_PASSWORD || "",
  };
}

// ─── Direct backend implementations ──────────────────────────────────────────
//
// These are the canonical direct implementations used by shims (below) and by
// concrete adapters. They do NOT delegate to the registry — the registry shims
// below decide which path to take.

async function _searchVectorMemoryDirect(query: string, limit: number) {
  const params = new URLSearchParams({ q: query || "recent", agent_id: "luis", limit: String(limit) });
  const response = await fetch(`${MEM0_URL}/memory/search?${params}`, { signal: timeoutSignal(memorySearchTimeoutMs()) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = typeof result.detail === "string" ? result.detail : "Vector memory backend unavailable";
    throw new Error(detail);
  }
  return result;
}

async function _queryGraphMemoryDirect(query: string, limit: number) {
  const config = neo4jConfig();
  if (!config.password) throw new Error("Neo4j password is not configured");

  const cypher = query
    ? `MATCH (n)
       WHERE toLower(coalesce(n.name, n.title, n.id, '')) CONTAINS $q
       OPTIONAL MATCH (n)-[r]-(m)
       RETURN properties(n) AS node, collect(DISTINCT type(r)) AS relationships, collect(DISTINCT properties(m)) AS neighbors
       LIMIT $limit`
    : `MATCH (n)
       OPTIONAL MATCH (n)-[r]-(m)
       RETURN properties(n) AS node, collect(DISTINCT type(r)) AS relationships, collect(DISTINCT properties(m)) AS neighbors
       LIMIT $limit`;

  const response = await fetch(`${config.url}/db/${encodeURIComponent(config.database)}/tx/commit`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(`${config.username}:${config.password}`).toString("base64")}`,
    },
    body: JSON.stringify({ statements: [{ statement: cypher, parameters: { q: query.toLowerCase(), limit } }] }),
    signal: timeoutSignal(5000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || (Array.isArray(result.errors) && result.errors.length > 0)) {
    throw new Error("Graph memory backend unavailable");
  }
  return result;
}

async function _checkVectorHealthDirect(): Promise<MemoryTierHealth> {
  try {
    const response = await fetch(`${MEM0_URL}/health`, { signal: timeoutSignal(3000) });
    if (!response.ok) {
      return { tier: "vector", backend: "mem0-qdrant", status: "down", detail: `HTTP ${response.status}` };
    }

    const body = await response.json().catch(() => ({}));
    const details: string[] = [];
    const queued = typeof body.queue?.queued === "number" ? body.queue.queued : 0;
    const vectorStore = typeof body.vector_store === "string" ? body.vector_store : "unknown";
    const runtime = body.memory_runtime as { status?: string; error?: string } | undefined;

    if (body.status === "degraded") details.push("mem0 reports degraded");
    if (queued > 0) details.push(`${queued} queued memory saves`);
    if (vectorStore !== "connected") {
      details.push(`vector store ${vectorStore}`);
    }
    if (runtime?.status && runtime.status !== "available") {
      details.push(`runtime ${runtime.status}${runtime.error ? `: ${runtime.error}` : ""}`);
    }

    return {
      tier: "vector",
      backend: "mem0-qdrant",
      status: details.length > 0 ? "degraded" : "up",
      detail: details.length > 0 ? details.join("; ") : undefined,
    };
  } catch (error) {
    return { tier: "vector", backend: "mem0-qdrant", status: "down", detail: error instanceof Error ? error.message : undefined };
  }
}

async function _checkGraphHealthDirect(): Promise<MemoryTierHealth> {
  const config = neo4jConfig();
  if (!config.password) return { tier: "graph", backend: "neo4j", status: "not_configured" };
  try {
    await _queryGraphMemoryDirect("", 1);
    return { tier: "graph", backend: "neo4j", status: "up" };
  } catch (error) {
    return { tier: "graph", backend: "neo4j", status: "down", detail: error instanceof Error ? error.message : undefined };
  }
}

```

Implement now. Output unified diffs only for allowed files.
