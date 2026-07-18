import Database from "better-sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";
import { initSchema } from "@/lib/db-schema";
import {
  checkVectorHealth,
  EpisodicMemoryAdapter,
  GraphMemoryAdapter,
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

describe("vector health disk vs vector separation", () => {
  it("keeps vector up when Qdrant is connected and only home disk advisory is critical", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          status: "ok",
          vector_store: "connected",
          queue: { queued: 0 },
          memory_runtime: { status: "available" },
          disk: {
            critical: false,
            warning: true,
            home_advisory: { critical: true, percent_used: 97.2 },
            paths: [{ path: "/tmp/mem0", critical: false }],
          },
        }),
      ),
    );

    const health = await checkVectorHealth();
    expect(health.status).toBe("up");
    expect(String(health.detail)).toMatch(/home disk advisory critical/);
  });

  it("marks vector down when vector_store is disconnected", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          status: "degraded",
          vector_store: "disconnected",
          queue: { queued: 0 },
          memory_runtime: { status: "available" },
          disk: { critical: false },
        }),
      ),
    );

    const health = await checkVectorHealth();
    expect(health.status).toBe("down");
    expect(String(health.detail)).toMatch(/vector store disconnected/);
  });

  it("marks vector degraded (not down) when path-scoped disk is critical but vector is connected", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          status: "degraded",
          vector_store: "connected",
          queue: { queued: 0 },
          memory_runtime: { status: "available" },
          disk: { critical: true, warning: true },
        }),
      ),
    );

    const health = await checkVectorHealth();
    expect(health.status).toBe("degraded");
    expect(health.status).not.toBe("down");
  });

  it("searchVectorMemory falls back to the direct mem0 HTTP path when no adapter is registered", async () => {
    const getAdaptersSpy = vi.spyOn(registry, "getAdapters").mockReturnValue([]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("/memory/search")) {
          return Response.json({ memories: [{ id: "m2", text: "direct hit" }] });
        }
        return new Response("not found", { status: 404 });
      }),
    );

    const results = await searchVectorMemory("roadmap", 2);
    expect(results).toEqual({ memories: [{ id: "m2", text: "direct hit" }] });
    getAdaptersSpy.mockRestore();
  });

  it("surfaces direct vector search detail and vector write failures", async () => {
    const getAdaptersSpy = vi.spyOn(registry, "getAdapters").mockReturnValue([]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("/memory/search")) {
          return {
            ok: false,
            status: 503,
            json: async () => ({ detail: "mem0 search rejected" }),
          };
        }
        return { ok: false };
      }),
    );

    let searchError: unknown;
    try {
      await searchVectorMemory("roadmap", 2);
    } catch (error) {
      searchError = error;
    }
    expect(searchError).toBeInstanceOf(Error);
    expect((searchError as Error).message).toBe("mem0 search rejected");
    let writeError: unknown;
    try {
      await new VectorMemoryAdapter().write({ content: "secret" });
    } catch (error) {
      writeError = error;
    }
    expect(writeError).toBeInstanceOf(Error);
    expect((writeError as Error).message).toBe("Vector memory write failed");
    getAdaptersSpy.mockRestore();
  });

  it("normalizes vector search response items from the adapter", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json([
          { id: "memory-id", memory: "from memory", score: 0.9 },
          { id: 7, content: "from content" },
          { text: "from text" },
          42,
        ]),
      ),
    );

    const results = await new VectorMemoryAdapter().search("", 4);

    expect(results).toEqual([
      expect.objectContaining({ id: "memory-id", content: "from memory", score: 0.9 }),
      expect.objectContaining({ id: 7, content: "from content" }),
      expect.objectContaining({ id: "vector-2", content: "from text" }),
      expect.objectContaining({ id: "vector-3", content: "42" }),
    ]);
  });

  it("normalizes graph search rows and ignores malformed result groups", async () => {
    process.env.NEO4J_PASSWORD = "graph-pass";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          results: [
            null,
            {
              data: [
                { row: [{ title: "Graph Title" }, ["REL"], [{ name: "Neighbor" }]] },
                { row: [{ name: "" }] },
              ],
            },
          ],
        }),
      ),
    );

    const results = await new GraphMemoryAdapter().search("graph", 5);

    expect(results).toEqual([
      {
        id: "graph-0",
        content: "Graph Title",
        metadata: { node: { title: "Graph Title" }, relationships: ["REL"], neighbors: [{ name: "Neighbor" }] },
      },
    ]);
  });

  it("returns an empty graph result set when Neo4j shape has no results array", async () => {
    process.env.NEO4J_PASSWORD = "graph-pass";
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({})));

    await expect(new GraphMemoryAdapter().search("", 5)).resolves.toEqual([]);
  });

  it("writes graph facts through Neo4j when configured and mem0 fallback otherwise", async () => {
    process.env.NEO4J_PASSWORD = "graph-pass";
    const fetchMock = vi.fn(async () => Response.json({ results: [{ data: [{ row: ["graph-id"] }] }] }));
    vi.stubGlobal("fetch", fetchMock);

    await new GraphMemoryAdapter().write({ id: "graph-id", memory: "graph content", agent_id: "agent-a" });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/tx/commit");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)).statements[0].parameters).toMatchObject({
      id: "graph-id",
      content: "graph content",
      source: "agent-a",
    });

    delete process.env.NEO4J_PASSWORD;
    fetchMock.mockResolvedValueOnce(new Response("nope", { status: 500 }));
    await expect(new GraphMemoryAdapter().write({ content: "fallback graph" })).rejects.toThrow();
    expect(String(fetchMock.mock.calls.at(-1)?.[0])).toContain("/memory/add");
    expect(JSON.parse(String(fetchMock.mock.calls.at(-1)?.[1]?.body))).toMatchObject({ content: "fallback graph", type: "graph" });
  });

  it("searches episodic memory through the lazy DB factory and keeps write as a no-op", async () => {
    const database = new Database(":memory:");
    try {
      initSchema(database);
      const messageId = Number(
        database
          .prepare(
            `INSERT INTO messages(session_id, project, agent_id, role, content, timestamp, visibility, policy)
             VALUES (?, ?, ?, ?, ?, ?, 'internal', 'indexable')`,
          )
          .run("sess-episodic", "proj", "agent", "user", "episodic searchable memory", "2026-01-01T00:00:00Z")
          .lastInsertRowid,
      );

      const adapter = new EpisodicMemoryAdapter(() => database);
      const results = await adapter.search("episodic", 5);
      await expect(adapter.write({ ignored: true })).resolves.toBeUndefined();

      expect(results).toEqual([
        expect.objectContaining({
          id: messageId,
          content: expect.stringMatching(/episodic.*searchable memory/),
          metadata: expect.objectContaining({ session_id: "sess-episodic", project: "proj" }),
        }),
      ]);
    } finally {
      database.close();
    }
  });
});
