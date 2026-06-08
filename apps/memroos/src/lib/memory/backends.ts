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

// ─── Concrete Adapters ────────────────────────────────────────────────────────

/**
 * Vector memory adapter — wraps the mem0 HTTP write path and searchVectorMemory.
 *
 * Constraint (T-70-11): write() routes through the mem0 HTTP service only.
 * Never calls agent_memory Qdrant directly.
 * No getClient() or client property (T-70-10, MEM-06).
 */
export class VectorMemoryAdapter implements MemoryAdapter {
  readonly tiers: MemoryTier[] = ["vector"];
  readonly capabilities: MemoryCapability[] = ["semantic", "tenantScoped"];

  async search(query: string, limit: number): Promise<MemorySearchResult[]> {
    const raw = await _searchVectorMemoryDirect(query, limit);
    // Normalize mem0 response to MemorySearchResult[]
    const items: unknown[] = Array.isArray(raw)
      ? raw
      : Array.isArray(raw?.results)
        ? raw.results
        : Array.isArray(raw?.memories)
          ? raw.memories
          : [];
    return items.map((item, index): MemorySearchResult => {
      const r = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
      const content =
        typeof r.memory === "string" ? r.memory :
        typeof r.content === "string" ? r.content :
        typeof r.text === "string" ? r.text : JSON.stringify(item);
      return {
        id: typeof r.id === "string" || typeof r.id === "number" ? r.id : `vector-${index}`,
        content,
        score: typeof r.score === "number" ? r.score : undefined,
        metadata: r,
      };
    });
  }

  async write(payload: Record<string, unknown>): Promise<void> {
    // mem0 HTTP-only path — never call Qdrant directly (T-70-11)
    const response = await fetch(`${MEM0_URL}/memory/add`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: timeoutSignal(5000),
    });
    if (!response.ok) {
      throw new Error("Vector memory write failed");
    }
  }

  async health(): Promise<MemoryTierHealth> {
    return _checkVectorHealthDirect();
  }
}

/**
 * Graph memory adapter — wraps Neo4j HTTP API for search and health.
 *
 * No getClient(), driver, or Neo4j session property (T-70-10, MEM-06).
 * All access goes through the Neo4j HTTP transactional API.
 */
export class GraphMemoryAdapter implements MemoryAdapter {
  readonly tiers: MemoryTier[] = ["graph"];
  readonly capabilities: MemoryCapability[] = ["graphTraversal", "reasoningTrace", "auditEdges"];

  async search(query: string, limit: number): Promise<MemorySearchResult[]> {
    const raw = await _queryGraphMemoryDirect(query, limit);
    // Normalize Neo4j HTTP result rows to MemorySearchResult[]
    const results = !raw || typeof raw !== "object" ? [] : (raw as Record<string, unknown>).results;
    if (!Array.isArray(results)) return [];
    const rows = results.flatMap((result) => {
      if (!result || typeof result !== "object") return [];
      const data = (result as Record<string, unknown>).data;
      return Array.isArray(data) ? data : [];
    });
    return rows.map((row, index): MemorySearchResult => {
      const values =
        row && typeof row === "object" && Array.isArray((row as Record<string, unknown>).row)
          ? ((row as Record<string, unknown>).row as unknown[])
          : [row];
      const node = values[0];
      const nodeStr =
        !node || typeof node !== "object" ? JSON.stringify(node) :
        typeof (node as Record<string, unknown>).name === "string" ? String((node as Record<string, unknown>).name) :
        typeof (node as Record<string, unknown>).title === "string" ? String((node as Record<string, unknown>).title) :
        JSON.stringify(node);
      return {
        id: `graph-${index}`,
        content: nodeStr,
        metadata: { node, relationships: values[1], neighbors: values[2] },
      };
    }).filter((r) => r.content.trim().length > 0);
  }

  async write(payload: Record<string, unknown>): Promise<void> {
    // Graph writes go through mem0 HTTP with neo4j graph tier metadata
    const response = await fetch(`${MEM0_URL}/memory/add`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, type: "graph" }),
      signal: timeoutSignal(5000),
    });
    if (!response.ok) {
      throw new Error("Graph memory write failed");
    }
  }

  async health(): Promise<MemoryTierHealth> {
    return _checkGraphHealthDirect();
  }
}

/**
 * Episodic memory adapter — wraps recallByKeyword via a () => Database factory.
 *
 * Constraint (T-70-13, RESEARCH.md Open Q3):
 * - Constructor accepts a () => Database factory — the DB handle is never returned from any method.
 * - The synchronous better-sqlite3 call is wrapped as Promise.resolve(...) for async compatibility.
 */
export class EpisodicMemoryAdapter implements MemoryAdapter {
  readonly tiers: MemoryTier[] = ["episodic"];
  readonly capabilities: MemoryCapability[] = ["bufferedWrite"];

  // DB factory held internally — never exposed via any public method (T-70-13)
  readonly #dbFactory: () => import("better-sqlite3").Database;

  constructor(dbFactory: () => import("better-sqlite3").Database) {
    this.#dbFactory = dbFactory;
  }

  async search(query: string, limit: number): Promise<MemorySearchResult[]> {
    // Import recallByKeyword lazily to avoid circular deps; wrap sync call as async
    const { recallByKeyword } = await import("@/lib/db-ingest");
    const db = this.#dbFactory();
    const results = await Promise.resolve(recallByKeyword(db, query, limit));
    const allowed = filterAuthorizedMessageRows(
      db,
      results,
      { id: "memory-adapter:episodic", role: "system", capability: "memory_search" },
      "memory_search"
    );
    return allowed.map((r) => ({
      id: r.id,
      content: r.snippet,
      metadata: {
        session_id: r.session_id,
        project: r.project,
        agent_id: r.agent_id,
        role: r.role,
        timestamp: r.timestamp,
        rank: r.rank,
      },
    }));
  }

  async write(payload: Record<string, unknown>): Promise<void> {
    // Episodic writes are handled by the ingest pipeline (db-ingest.ts) — not by this adapter.
    // This method is a no-op stub to satisfy the MemoryAdapter contract.
    // Direct SQLite writes require the full ingest pipeline to maintain FTS5 index integrity.
    void payload;
  }

  async health(): Promise<MemoryTierHealth> {
    try {
      const db = this.#dbFactory();
      // Lightweight health check: count messages table rows
      const row = db.prepare("SELECT COUNT(*) as count FROM messages").get() as { count: number } | undefined;
      return {
        tier: "episodic",
        backend: "sqlite-fts5",
        status: "up",
        count: row?.count ?? null,
      };
    } catch (error) {
      return {
        tier: "episodic",
        backend: "sqlite-fts5",
        status: "down",
        detail: error instanceof Error ? error.message : undefined,
      };
    }
  }
}

// ─── Module-init Registration ─────────────────────────────────────────────────
//
// Registers the three concrete adapters once at module init.
// Idempotency guard (_registered) prevents double-registration on re-imports (Pitfall 4, T-70-12).
// This runs synchronously on first import of this module.
//
// Episodic adapter uses a lazy db factory: getDb() is resolved only on first use, not at
// module init. This prevents better-sqlite3 native module loading in test environments that
// mock or skip the DB layer (RESEARCH.md Open Q3, T-70-13).

let _registered = false;

function _registerDefaultAdapters(): void {
  if (_registered) return;
  _registered = true;

  registerAdapter(new VectorMemoryAdapter());
  registerAdapter(new GraphMemoryAdapter());

  // Episodic adapter receives getDb as the () => Database factory (RESEARCH.md Open Q3).
  // getDb() is a synchronous singleton — the factory is only invoked when search()/health()
  // are called, not at construction time.
  registerAdapter(new EpisodicMemoryAdapter(getDb));
}

_registerDefaultAdapters();

// ─── Exported Shims ───────────────────────────────────────────────────────────
//
// Existing callers (search/route.ts, graph/route.ts, multi-search/route.ts, memory-recall-evals.ts)
// continue to call these same-named functions unchanged.
//
// Delegation contract (RESEARCH.md Pattern 5, Pitfall 4):
//   - If a registered adapter exists for a tier, delegate to it exclusively.
//   - If no adapter is registered, fall back to the direct implementation.
//   - Exactly ONE path per tier executes — no concurrent direct + adapter writes (T-70-12).

export async function searchVectorMemory(query: string, limit: number) {
  // Shim: delegate to vector adapter when registered; fallback to direct call otherwise.
  const adapters = getAdapters("vector");
  if (adapters.length > 0) {
    return adapters[0].search(query, limit);
  }
  return _searchVectorMemoryDirect(query, limit);
}

export async function queryGraphMemory(query: string, limit: number) {
  // Shim: delegate to graph adapter when registered; fallback to direct call otherwise.
  const adapters = getAdapters("graph");
  if (adapters.length > 0) {
    return adapters[0].search(query, limit);
  }
  return _queryGraphMemoryDirect(query, limit);
}

export async function checkVectorHealth(): Promise<MemoryTierHealth> {
  // Shim: delegate to vector adapter health() when registered; fallback to direct otherwise.
  const adapters = getAdapters("vector");
  if (adapters.length > 0) {
    return adapters[0].health();
  }
  return _checkVectorHealthDirect();
}

export async function checkGraphHealth(): Promise<MemoryTierHealth> {
  // Shim: delegate to graph adapter health() when registered; fallback to direct otherwise.
  const adapters = getAdapters("graph");
  if (adapters.length > 0) {
    return adapters[0].health();
  }
  return _checkGraphHealthDirect();
}
