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

/** Mem0 `/health` probe timeout for vector tier health (strict MCP gate path). */
export function mem0HealthTimeoutMs(): number {
  const parsed = Number(process.env.MEM0_HEALTH_TIMEOUT_MS ?? 15_000);
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

/** Aura Free blocks legacy /tx/commit (403); use Query API v2 there. */
export function neo4jUsesQueryApi(url: string): boolean {
  return /databases\.neo4j\.io/i.test(url);
}

/**
 * Run a Cypher statement against Neo4j HTTP.
 * Returns a tx/commit-compatible shape: { results: [{ columns, data: [{ row }] }], errors: [] }
 * so callers/inventory parseCount keep working.
 */
export async function neo4jHttpQuery(
  statement: string,
  parameters: Record<string, unknown> = {},
  timeoutMs = 5000
): Promise<{ results: Array<{ columns?: string[]; data: Array<{ row: unknown[] }> }>; errors: unknown[] }> {
  const config = neo4jConfig();
  if (!config.password) throw new Error("Neo4j password is not configured");

  const auth = `Basic ${Buffer.from(`${config.username}:${config.password}`).toString("base64")}`;
  const db = encodeURIComponent(config.database);

  if (neo4jUsesQueryApi(config.url)) {
    const response = await fetch(`${config.url}/db/${db}/query/v2`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: auth,
      },
      body: JSON.stringify({ statement, parameters }),
      signal: timeoutSignal(timeoutMs),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail =
        typeof body === "object" && body && Array.isArray((body as { errors?: unknown[] }).errors)
          ? JSON.stringify((body as { errors: unknown[] }).errors)
          : `HTTP ${response.status}`;
      throw new Error(`Neo4j query/v2 failed: ${detail}`);
    }
    const data = (body as { data?: { fields?: string[]; values?: unknown[][] } }).data;
    const columns = Array.isArray(data?.fields) ? data.fields : [];
    const values = Array.isArray(data?.values) ? data.values : [];
    return {
      results: [
        {
          columns,
          data: values.map((row) => ({ row: Array.isArray(row) ? row : [row] })),
        },
      ],
      errors: [],
    };
  }

  const response = await fetch(`${config.url}/db/${db}/tx/commit`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: auth,
    },
    body: JSON.stringify({ statements: [{ statement, parameters }] }),
    signal: timeoutSignal(timeoutMs),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || (Array.isArray((result as { errors?: unknown[] }).errors) && (result as { errors: unknown[] }).errors.length > 0)) {
    throw new Error("Graph memory backend unavailable");
  }
  return result as { results: Array<{ columns?: string[]; data: Array<{ row: unknown[] }> }>; errors: unknown[] };
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

  return neo4jHttpQuery(cypher, { q: query.toLowerCase(), limit }, 5000);
}

async function _checkVectorHealthDirect(): Promise<MemoryTierHealth> {
  try {
    const response = await fetch(`${MEM0_URL}/health`, { signal: timeoutSignal(mem0HealthTimeoutMs()) });
    if (!response.ok) {
      return { tier: "vector", backend: "mem0-qdrant", status: "down", detail: `HTTP ${response.status}` };
    }

    const body = await response.json().catch(() => ({}));
    const details: string[] = [];
    const queued = typeof body.queue?.queued === "number" ? body.queue.queued : 0;
    const vectorStore = typeof body.vector_store === "string" ? body.vector_store : "unknown";
    const runtime = body.memory_runtime as { status?: string; error?: string } | undefined;
    const disk = body.disk as {
      critical?: boolean;
      warning?: boolean;
      home_advisory?: { critical?: boolean; percent_used?: number };
    } | undefined;

    const vectorOk = vectorStore === "connected";
    const runtimeOk = !runtime?.status || runtime.status === "available";
    const pathDiskCritical = Boolean(disk?.critical);
    const homeAdvisoryCritical = Boolean(disk?.home_advisory?.critical);

    if (!vectorOk) details.push(`vector store ${vectorStore}`);
    if (!runtimeOk) {
      details.push(`runtime ${runtime?.status ?? "unavailable"}${runtime?.error ? `: ${runtime.error}` : ""}`);
    }
    if (queued > 0) details.push(`${queued} queued memory saves`);
    if (pathDiskCritical) details.push("mem0 path-scoped disk critical");
    else if (disk?.warning) details.push("mem0 disk warning");
    if (homeAdvisoryCritical) {
      details.push(`home disk advisory critical (${disk?.home_advisory?.percent_used ?? "?"}%)`);
    }

    // Fail closed on vector/runtime. Never map home df% alone → vector=down.
    let status: MemoryTierHealth["status"];
    if (!vectorOk || !runtimeOk) {
      status = "down";
    } else if (queued > 0 || pathDiskCritical) {
      status = "degraded";
    } else {
      status = "up";
    }

    return {
      tier: "vector",
      backend: "mem0-qdrant",
      status,
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
    // Read + write probe: proves Aura/local can actually store graph facts.
    await neo4jHttpQuery(
      `MERGE (n:MemRoOSHealthProbe {id: 'operator-health'})
       SET n.lastOk = datetime(), n.source = 'memroos-health'
       RETURN n.id AS id`,
      {},
      8000
    );
    return { tier: "graph", backend: "neo4j", status: "up" };
  } catch (error) {
    return {
      tier: "graph",
      backend: "neo4j",
      status: "down",
      detail: error instanceof Error ? error.message : "Neo4j write/read probe failed — graph is NOT storing",
    };
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
    // Prefer direct Neo4j write when configured (Aura / local graph).
    // Fall back to mem0 HTTP with graph tier metadata for legacy paths.
    const config = neo4jConfig();
    if (config.password) {
      const content =
        typeof payload.content === "string"
          ? payload.content
          : typeof payload.memory === "string"
            ? payload.memory
            : JSON.stringify(payload);
      const id =
        typeof payload.id === "string"
          ? payload.id
          : `graph-${Date.now().toString(36)}`;
      await neo4jHttpQuery(
        `MERGE (n:MemoryFact {id: $id})
         SET n.content = $content, n.updatedAt = datetime(), n.source = coalesce($source, 'memroos')
         RETURN n.id AS id`,
        {
          id,
          content,
          source: typeof payload.agent_id === "string" ? payload.agent_id : "memroos",
        },
        8000
      );
      return;
    }

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
