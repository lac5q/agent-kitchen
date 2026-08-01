import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkGraphHealth,
  checkVectorHealth,
  EpisodicMemoryAdapter,
  GraphMemoryAdapter,
  mem0HealthTimeoutMs,
  neo4jConfig,
  neo4jHttpQuery,
  neo4jUsesQueryApi,
  queryGraphMemory,
  searchVectorMemory,
  VectorMemoryAdapter,
} from "../backends";
import * as registry from "../registry";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) delete process.env[key];
  }
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    process.env[key] = value;
  }
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("mem0HealthTimeoutMs", () => {
  it("defaults to 15_000ms when env var is unset", () => {
    delete process.env.MEM0_HEALTH_TIMEOUT_MS;
    expect(mem0HealthTimeoutMs()).toBe(15_000);
  });

  it("defaults to 15_000ms when env var is empty string", () => {
    process.env.MEM0_HEALTH_TIMEOUT_MS = "";
    expect(mem0HealthTimeoutMs()).toBe(15_000);
  });

  it("accepts a positive integer override", () => {
    process.env.MEM0_HEALTH_TIMEOUT_MS = "7500";
    expect(mem0HealthTimeoutMs()).toBe(7_500);
  });

  it("accepts a numeric string and truncates fractional values", () => {
    process.env.MEM0_HEALTH_TIMEOUT_MS = "12345.9";
    expect(mem0HealthTimeoutMs()).toBe(12_345);
  });

  it("falls back to 15_000ms when override is zero", () => {
    process.env.MEM0_HEALTH_TIMEOUT_MS = "0";
    expect(mem0HealthTimeoutMs()).toBe(15_000);
  });

  it("falls back to 15_000ms when override is negative", () => {
    process.env.MEM0_HEALTH_TIMEOUT_MS = "-100";
    expect(mem0HealthTimeoutMs()).toBe(15_000);
  });

  it("falls back to 15_000ms when override is NaN", () => {
    process.env.MEM0_HEALTH_TIMEOUT_MS = "not-a-number";
    expect(mem0HealthTimeoutMs()).toBe(15_000);
  });

  it("integrates a live override via direct read", () => {
    process.env.MEM0_HEALTH_TIMEOUT_MS = "20000";
    expect(mem0HealthTimeoutMs()).toBe(20_000);
    delete process.env.MEM0_HEALTH_TIMEOUT_MS;
    expect(mem0HealthTimeoutMs()).toBe(15_000);
  });
});

describe("checkVectorHealth timeout honesty", () => {
  it("reports vector down with timeout detail when the Mem0 probe aborts", async () => {
    process.env.MEM0_HEALTH_TIMEOUT_MS = "50";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        const signal = init?.signal;
        await new Promise<void>((_resolve, reject) => {
          if (!signal) {
            reject(new Error("TimeoutError: The operation was aborted due to timeout"));
            return;
          }
          if (signal.aborted) {
            reject(signal.reason ?? new DOMException("The operation was aborted due to timeout", "TimeoutError"));
            return;
          }
          signal.addEventListener("abort", () => {
            reject(signal.reason ?? new DOMException("The operation was aborted due to timeout", "TimeoutError"));
          });
        });
        return new Response("{}");
      }),
    );

    const health = await checkVectorHealth();
    expect(health.tier).toBe("vector");
    expect(health.status).toBe("down");
    expect(String(health.detail ?? "").toLowerCase()).toMatch(/abort|timeout/);
  });

  it("reports vector up when Mem0 health returns ok within the probe window", async () => {
    process.env.MEM0_HEALTH_TIMEOUT_MS = "5000";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          status: "ok",
          vector_store: "connected",
          queue: { queued: 0 },
          memory_runtime: { status: "available" },
        }),
      ),
    );

    const health = await checkVectorHealth();
    expect(health).toMatchObject({ tier: "vector", backend: "mem0-qdrant", status: "up" });
  });

  it("marks vector degraded when queued saves are pending", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          status: "ok",
          vector_store: "connected",
          queue: { queued: 3 },
          memory_runtime: { status: "available" },
          disk: { critical: false },
        }),
      ),
    );

    const health = await checkVectorHealth();
    expect(health.status).toBe("degraded");
    expect(String(health.detail)).toMatch(/3 queued memory saves/);
  });

  it("marks vector down when memory runtime is unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          status: "degraded",
          vector_store: "connected",
          queue: { queued: 0 },
          memory_runtime: { status: "error", error: "worker offline" },
          disk: { critical: false },
        }),
      ),
    );

    const health = await checkVectorHealth();
    expect(health.status).toBe("down");
    expect(String(health.detail)).toMatch(/runtime error/);
  });

  it("marks vector down on non-OK HTTP responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("service unavailable", { status: 503 })),
    );

    const health = await checkVectorHealth();
    expect(health.status).toBe("down");
    expect(String(health.detail)).toMatch(/HTTP 503/);
  });

  it("neo4jConfig returns trimmed defaults and env overrides", () => {
    const original = {
      url: process.env.NEO4J_HTTP_URL,
      database: process.env.NEO4J_DATABASE,
      username: process.env.NEO4J_USERNAME,
      password: process.env.NEO4J_PASSWORD,
    };
    process.env.NEO4J_HTTP_URL = "http://neo4j.example.com/";
    process.env.NEO4J_DATABASE = "graphdb";
    process.env.NEO4J_USERNAME = "graph-user";
    process.env.NEO4J_PASSWORD = "graph-pass";
    expect(neo4jConfig()).toEqual({
      url: "http://neo4j.example.com",
      database: "graphdb",
      username: "graph-user",
      password: "graph-pass",
    });
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key as keyof typeof original];
      else process.env[key as keyof typeof original] = value;
    }
  });

  it("queryGraphMemory and checkGraphHealth use the direct Neo4j HTTP path when no adapter is registered", async () => {
    const getAdaptersSpy = vi.spyOn(registry, "getAdapters").mockReturnValue([]);
    process.env.NEO4J_PASSWORD = "graph-pass";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        expect(String(url)).toContain("/tx/commit");
        expect(init?.method).toBe("POST");
        return Response.json({
          results: [{ data: [{ row: [{ name: "Node A" }, ["KNOWS"], [{ title: "Node B" }]] }] }],
        });
      }),
    );

    const graphResults = await queryGraphMemory("node", 3);
    expect(graphResults).toEqual({
      results: [{ data: [{ row: [{ name: "Node A" }, ["KNOWS"], [{ title: "Node B" }]] }] }],
    });

    const health = await checkGraphHealth();
    expect(health).toMatchObject({ tier: "graph", backend: "neo4j", status: "up" });
    getAdaptersSpy.mockRestore();
  });
});

describe("neo4jHttpQuery and neo4jUsesQueryApi", () => {
  it("detects Aura Query API hosts", () => {
    expect(neo4jUsesQueryApi("https://abc.databases.neo4j.io")).toBe(true);
    expect(neo4jUsesQueryApi("http://localhost:7474")).toBe(false);
  });

  it("throws when Neo4j password is not configured", async () => {
    process.env.NEO4J_HTTP_URL = "http://localhost:7474";
    process.env.NEO4J_PASSWORD = "";
    let error: unknown;
    try {
      await neo4jHttpQuery("MATCH (n) RETURN n");
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("Neo4j password is not configured");
  });

  it("uses query/v2 for Aura URLs and normalizes the response shape", async () => {
    process.env.NEO4J_HTTP_URL = "https://unit-test.databases.neo4j.io";
    process.env.NEO4J_PASSWORD = "aura-secret";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        expect(String(url)).toContain("/query/v2");
        return Response.json({ data: { fields: ["count"], values: [[17]] } });
      }),
    );

    const result = await neo4jHttpQuery("MATCH (n) RETURN count(n) AS count");
    expect(result.results[0]?.data[0]?.row[0]).toBe(17);
    expect(result.errors).toEqual([]);
  });

  it("throws when query/v2 returns a non-OK HTTP status", async () => {
    process.env.NEO4J_HTTP_URL = "https://unit-test.databases.neo4j.io";
    process.env.NEO4J_PASSWORD = "aura-secret";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ errors: [{ code: "Neo.ClientError", message: "bad cypher" }] }, { status: 400 })
      ),
    );

    let error: unknown;
    try {
      await neo4jHttpQuery("INVALID");
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/query\/v2 failed/);
  });

  it("throws when tx/commit returns graph errors", async () => {
    process.env.NEO4J_HTTP_URL = "http://localhost:7474";
    process.env.NEO4J_PASSWORD = "local-secret";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ errors: [{ message: "commit failed" }] })),
    );

    let error: unknown;
    try {
      await neo4jHttpQuery("MATCH (n) RETURN n");
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("Graph memory backend unavailable");
  });
});

describe("direct backend error and adapter paths", () => {
  beforeEach(() => {
    vi.spyOn(registry, "getAdapters").mockReturnValue([]);
  });

  it("searchVectorMemory surfaces mem0 search failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ detail: "vector search offline" }, { status: 503 })),
    );

    let error: unknown;
    try {
      await searchVectorMemory("roadmap", 3);
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("vector search offline");
  });

  it("VectorMemoryAdapter write throws when mem0 add fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("/memory/add")) {
          return new Response("write failed", { status: 500 });
        }
        return Response.json({ memories: [] });
      }),
    );

    const adapter = new VectorMemoryAdapter();
    let error: unknown;
    try {
      await adapter.write({ content: "payload" });
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("Vector memory write failed");
  });

  it("GraphMemoryAdapter write falls back to mem0 when Neo4j is not configured", async () => {
    delete process.env.NEO4J_PASSWORD;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (String(url).includes("/memory/add")) {
          expect(init?.method).toBe("POST");
          return new Response(null, { status: 201 });
        }
        return new Response("not found", { status: 404 });
      }),
    );

    const adapter = new GraphMemoryAdapter();
    await expect(adapter.write({ content: "graph fact", type: "graph" })).resolves.toBeUndefined();
  });

  it("GraphMemoryAdapter write throws when mem0 fallback fails", async () => {
    delete process.env.NEO4J_PASSWORD;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("/memory/add")) {
          return new Response("nope", { status: 500 });
        }
        return new Response("not found", { status: 404 });
      }),
    );

    const adapter = new GraphMemoryAdapter();
    let error: unknown;
    try {
      await adapter.write({ content: "graph fact" });
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("Graph memory write failed");
  });

  it("marks vector degraded on mem0 disk warning without path-critical failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          status: "ok",
          vector_store: "connected",
          queue: { queued: 0 },
          memory_runtime: { status: "available" },
          disk: { critical: false, warning: true },
        }),
      ),
    );

    const health = await checkVectorHealth();
    expect(health.status).toBe("up");
    expect(String(health.detail)).toMatch(/disk warning/);
  });

  it("reports graph down when the Neo4j probe throws", async () => {
    process.env.NEO4J_PASSWORD = "graph-pass";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 503 })));

    const health = await checkGraphHealth();
    expect(health.status).toBe("down");
    expect(String(health.detail)).toMatch(/503|unavailable|failed/i);
  });

  it("delegates checkVectorHealth to a registered adapter", async () => {
    const mockHealth = vi.fn().mockResolvedValue({
      tier: "vector",
      backend: "mock",
      status: "up",
    });
    vi.spyOn(registry, "getAdapters").mockReturnValue([
      {
        tiers: ["vector"],
        capabilities: [],
        search: vi.fn(),
        write: vi.fn(),
        health: mockHealth,
      },
    ]);

    const health = await checkVectorHealth();
    expect(mockHealth).toHaveBeenCalled();
    expect(health).toMatchObject({ tier: "vector", status: "up" });
  });

  it("EpisodicMemoryAdapter search maps recall rows and health reports down on db errors", async () => {
    const { getDb } = await import("@/lib/db");
    const { initSchema } = await import("@/lib/db-schema");
    const database = getDb();
    initSchema(database);
    database
      .prepare(
        `INSERT INTO messages(session_id, project, agent_id, role, content, timestamp, visibility, policy)
         VALUES (?, ?, ?, ?, ?, ?, 'internal', 'indexable')`
      )
      .run("sess-ep", "proj", "agent", "user", "episodic recall target", "2026-01-01T00:00:00Z");

    const adapter = new EpisodicMemoryAdapter(() => database);
    const results = await adapter.search("recall", 5);
    expect(results.some((r) => r.content.includes("episodic"))).toBe(true);

    const broken = new EpisodicMemoryAdapter(() => {
      throw new Error("sqlite unavailable");
    });
    const health = await broken.health();
    expect(health).toMatchObject({ tier: "episodic", status: "down" });
    expect(String(health.detail)).toMatch(/sqlite unavailable/);
  });
});
