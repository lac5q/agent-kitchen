/**
 * Graph catchup — projection helpers + incremental checkpoint / dry-run / Neo4j skip.
 */
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { initSchema } from "@/lib/db-schema";
import { listCronHealthJobs, updateCronJobStatus } from "@/lib/cron-health";
import {
  buildMemoryFactMergeCypher,
  GRAPH_CATCHUP_CRON_ID,
  countNeo4jNodes,
  isAfterVectorCursor,
  isNeo4jConfigured,
  mapEpisodicMessageToProjection,
  mapVectorMemoryToProjection,
  normalizeVectorMemoryRaw,
  normalizeVectorMemoryPoint,
  projectMemoryFact,
  projectMemoryToGraph,
  readGraphCatchupCheckpoint,
  runGraphCatchup,
  scrollQdrantPoints,
  writeGraphCatchupCheckpoint,
} from "../graph-catchup";
import {
  GRAPH_CATCHUP_INTERVAL_MS,
  runScheduledGraphCatchup,
  startGraphCatchupScheduler,
  stopGraphCatchupScheduler,
} from "@/lib/memory-graph-catchup-scheduler";

const testDb = new Database(":memory:");

vi.mock("@/lib/db", () => ({
  getDb: () => testDb,
  closeDb: () => {},
}));

initSchema(testDb);

afterEach(() => {
  stopGraphCatchupScheduler();
  testDb.exec("DELETE FROM messages");
  testDb.exec("DELETE FROM graph_catchup_checkpoints");
  testDb.exec("DELETE FROM cron_health_jobs");
  delete process.env.NEO4J_PASSWORD;
  delete process.env.QDRANT_URL;
  delete process.env.QDRANT_API_KEY;
  delete process.env.QDRANT_COLLECTION;
  delete process.env.MEM0_COLLECTION;
  delete process.env.GRAPH_CATCHUP_WRITE_DELAY_MS;
  delete process.env.GRAPH_CATCHUP_AGENT_ID;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("graph-catchup projection mapping", () => {
  it("normalizes Qdrant scroll payloads into vector memory points", () => {
    const point = normalizeVectorMemoryPoint({
      id: "abc-123",
      payload: {
        data: "Khizar Nisar joined the EC Team Booking meeting.",
        user_id: "luis",
        hash: "deadbeef",
        created_at: "2026-05-29T12:00:00Z",
      },
    });
    expect(point).toEqual({
      id: "abc-123",
      content: "Khizar Nisar joined the EC Team Booking meeting.",
      userId: "luis",
      hash: "deadbeef",
      createdAt: "2026-05-29T12:00:00Z",
      metadata: undefined,
    });
  });

  it("maps Qdrant/mem0 rows for Neo4j projection", () => {
    const mapped = mapVectorMemoryToProjection({
      id: "abc-123",
      payload: {
        data: "Khizar Nisar joined the EC Team Booking meeting.",
        user_id: "luis",
        created_at: "2026-05-29T12:00:00Z",
      },
    });
    expect(mapped).toMatchObject({
      id: "vector:abc-123",
      source: "vector",
      agentId: "luis",
    });
  });

  it("rejects malformed vector memories and falls back across supported fields", () => {
    expect(normalizeVectorMemoryRaw(null)).toBeNull();
    expect(mapVectorMemoryToProjection({ id: "empty", memory: "   " })).toBeNull();

    const mapped = mapVectorMemoryToProjection(
      {
        uuid: "uuid-1",
        text: "x".repeat(8100),
        updated_at: "2026-07-17T12:00:00.000Z",
        metadata: { saved_by_agent: "agent-from-meta" },
      },
      7
    );

    expect(mapped).toMatchObject({
      id: "vector:uuid-1",
      source: "vector",
      agentId: "agent-from-meta",
      createdAt: "2026-07-17T12:00:00.000Z",
    });
    expect(mapped?.content).toHaveLength(8000);

    expect(
      mapVectorMemoryToProjection({
        memory: "anonymous memory",
        timestamp: "2026-07-17T13:00:00.000Z",
      })
    ).toMatchObject({
      id: "vector:vector-anon-0",
      createdAt: "2026-07-17T13:00:00.000Z",
    });
  });

  it("maps episodic messages and empty graph previews consistently", () => {
    expect(
      mapEpisodicMessageToProjection({
        id: 99,
        content: "y".repeat(8100),
        agent_id: null,
        timestamp: null,
      })
    ).toMatchObject({
      id: "episodic:99",
      source: "episodic",
      agentId: null,
      createdAt: null,
      episodicId: 99,
      content: "y".repeat(8000),
    });

    expect(projectMemoryToGraph({ id: "blank", content: "  " })).toEqual({
      skipped: true,
      reason: "empty_content",
      fact: null,
      entities: [],
      relationships: [],
    });
  });

  it("projects a MemoryFact with stable id and MENTIONS entities", () => {
    const projection = projectMemoryToGraph({
      id: "mem-1",
      content: "Luis Calderon met Juan about PopSmiths on 2026-05-12.",
      userId: "luis",
      hash: "h1",
    });
    expect(projection.skipped).toBe(false);
    expect(projection.fact).toMatchObject({
      id: "mem-1",
      source: "luis",
      hash: "h1",
    });
    expect(projection.fact?.content).toContain("Luis Calderon");
    expect(projection.entities.length).toBeGreaterThan(0);
    expect(projection.relationships.every((r) => r.factId === "mem-1" && r.type === "MENTIONS")).toBe(
      true
    );
    const again = projectMemoryToGraph({
      id: "mem-1",
      content: "Luis Calderon met Juan about PopSmiths on 2026-05-12.",
      userId: "luis",
    });
    expect(again.entities.map((e) => e.id).sort()).toEqual(
      projection.entities.map((e) => e.id).sort()
    );
  });

  it("orders every vector cursor edge case", () => {
    expect(
      isAfterVectorCursor(
        { id: "vector:any", createdAt: null },
        { vectorLastCreatedAt: null, vectorLastId: null }
      )
    ).toBe(true);
    expect(
      isAfterVectorCursor(
        { id: "vector:a", createdAt: "2026-07-17T10:00:00.000Z" },
        { vectorLastCreatedAt: "2026-07-17T11:00:00.000Z", vectorLastId: "z" }
      )
    ).toBe(false);
    expect(
      isAfterVectorCursor(
        { id: "vector:a", createdAt: "2026-07-17T10:00:00.000Z" },
        { vectorLastCreatedAt: null, vectorLastId: "z" }
      )
    ).toBe(true);
    expect(
      isAfterVectorCursor(
        { id: "vector:z", createdAt: null },
        { vectorLastCreatedAt: "2026-07-17T10:00:00.000Z", vectorLastId: "a" }
      )
    ).toBe(false);
    expect(
      isAfterVectorCursor(
        { id: "vector:b", createdAt: null },
        { vectorLastCreatedAt: null, vectorLastId: "a" }
      )
    ).toBe(true);
  });
});

describe("graph-catchup Neo4j helpers", () => {
  it("builds the MemoryFact merge and counts Neo4j rows from number-like values", async () => {
    expect(buildMemoryFactMergeCypher()).toContain("MERGE (n:MemoryFact {id: $id})");

    const numericQuery = vi.fn(async () => ({
      results: [{ data: [{ row: [5] }] }],
    }));
    await expect(countNeo4jNodes(numericQuery)).resolves.toBe(5);

    const stringQuery = vi.fn(async () => ({
      results: [{ data: [{ row: ["7"] }] }],
    }));
    await expect(countNeo4jNodes(stringQuery)).resolves.toBe(7);

    const emptyQuery = vi.fn(async () => ({ results: [] }));
    await expect(countNeo4jNodes(emptyQuery)).resolves.toBe(0);
  });

  it("projects facts, honors dry-run, and treats entity projection as best effort", async () => {
    const item = {
      id: "vector:fact-1",
      content: "Luis Calderon met Juan about PopSmiths.",
      source: "vector" as const,
      agentId: "luis",
      createdAt: "2026-07-17T12:00:00.000Z",
    };

    const queryFn = vi.fn(async () => ({ results: [] }));
    await expect(projectMemoryFact(item, { dryRun: true, queryFn })).resolves.toBe("dry_run");
    expect(queryFn).not.toHaveBeenCalled();

    await expect(projectMemoryFact(item, { queryFn, projectEntities: false })).resolves.toBe("projected");
    expect(queryFn).toHaveBeenCalledTimes(1);
    expect(queryFn.mock.calls[0][1]).toMatchObject({
      id: "vector:fact-1",
      content: "Luis Calderon met Juan about PopSmiths.",
      source: "vector",
      agentId: "luis",
      createdAt: "2026-07-17T12:00:00.000Z",
    });

    let calls = 0;
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const flakyEntityQuery = vi.fn(async () => {
      calls += 1;
      if (calls === 2) throw new Error("entity boom");
      return { results: [] };
    });

    await expect(projectMemoryFact(item, { queryFn: flakyEntityQuery })).resolves.toBe("projected");
    expect(flakyEntityQuery).toHaveBeenCalledTimes(2);
    expect(warnSpy).toHaveBeenCalledWith(
      "[graph-catchup] entity projection failed",
      "vector:fact-1",
      "entity boom"
    );
  });

  it("scrolls Qdrant with encoded collection, optional API key, cursor, and errors", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        result: {
          points: [{ id: "p1", payload: { data: "Memory one" } }],
          next_page_offset: 42,
        },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      scrollQdrantPoints("offset-1", 2, {
        url: "https://qdrant.example/",
        apiKey: "qdrant-key",
        collection: "agent/memory",
      })
    ).resolves.toEqual({
      items: [{ id: "p1", payload: { data: "Memory one" } }],
      nextCursor: "42",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://qdrant.example/collections/agent%2Fmemory/points/scroll",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json", "api-key": "qdrant-key" },
        body: JSON.stringify({
          limit: 2,
          with_payload: true,
          with_vector: false,
          offset: "offset-1",
        }),
      })
    );

    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    });
    let qdrantError: unknown;
    try {
      await scrollQdrantPoints(null, 1, { url: "https://qdrant.example", collection: "agent_memory" });
    } catch (err) {
      qdrantError = err;
    }
    expect(qdrantError).toBeInstanceOf(Error);
    expect((qdrantError as Error).message).toBe("Qdrant scroll failed: HTTP 500");

    let missingUrlError: unknown;
    try {
      await scrollQdrantPoints(null, 1, { url: "" });
    } catch (err) {
      missingUrlError = err;
    }
    expect(missingUrlError).toBeInstanceOf(Error);
    expect((missingUrlError as Error).message).toBe("QDRANT_URL is not configured");
  });
});

describe("graph-catchup incremental checkpointing", () => {
  beforeEach(() => {
    listCronHealthJobs(testDb);
  });

  it("registers graph-catchup in cron health defaults", () => {
    const jobs = listCronHealthJobs(testDb);
    expect(jobs.some((job) => job.id === GRAPH_CATCHUP_CRON_ID)).toBe(true);
  });

  it("returns an empty checkpoint for missing non-default checkpoint ids", () => {
    expect(readGraphCatchupCheckpoint(testDb, "missing")).toEqual({
      id: "missing",
      episodicLastId: 0,
      vectorLastCreatedAt: null,
      vectorLastId: null,
      updatedAt: "1970-01-01T00:00:00.000Z",
    });
  });

  it("skips when Neo4j is not configured", async () => {
    delete process.env.NEO4J_PASSWORD;
    expect(isNeo4jConfigured()).toBe(false);
    const summary = await runGraphCatchup(testDb, {
      skipVector: true,
      now: new Date("2026-07-17T12:00:00.000Z"),
    });
    expect(summary).toMatchObject({
      status: "skipped",
      reason: "neo4j_not_configured",
      projected: 0,
      neo4jConfigured: false,
    });
  });

  it("dry-run projects without advancing the persisted checkpoint", async () => {
    process.env.NEO4J_PASSWORD = "test-secret";
    testDb
      .prepare(
        `INSERT INTO messages (session_id, project, agent_id, role, content, timestamp)
         VALUES ('s1', 'p1', 'luis', 'user', 'Luis Calderon shipped graph catchup.', '2026-07-17T10:00:00.000Z')`
      )
      .run();

    expect(readGraphCatchupCheckpoint(testDb).episodicLastId).toBe(0);

    const projected: string[] = [];
    const summary = await runGraphCatchup(testDb, {
      dryRun: true,
      skipVector: true,
      now: new Date("2026-07-17T12:00:00.000Z"),
      projectFact: async (item) => {
        projected.push(item.id);
      },
      sleep: async () => undefined,
      log: () => undefined,
    });

    expect(summary.status).toBe("completed");
    expect(summary.dryRun).toBe(true);
    expect(summary.projected).toBe(1);
    expect(projected).toEqual(["episodic:1"]);
    expect(readGraphCatchupCheckpoint(testDb).episodicLastId).toBe(0);
    expect(summary.checkpointAfter.episodicLastId).toBe(1);
  });

  it("advances episodic checkpoint and does not reprocess on second run", async () => {
    process.env.NEO4J_PASSWORD = "test-secret";
    testDb
      .prepare(
        `INSERT INTO messages (session_id, project, agent_id, role, content, timestamp)
         VALUES ('s1', 'p1', 'luis', 'user', 'First memory about MemRoOS.', '2026-07-17T10:00:00.000Z')`
      )
      .run();
    testDb
      .prepare(
        `INSERT INTO messages (session_id, project, agent_id, role, content, timestamp)
         VALUES ('s1', 'p1', 'luis', 'user', 'Second memory about Neo4j catchup.', '2026-07-17T11:00:00.000Z')`
      )
      .run();

    const seen: string[] = [];
    const first = await runGraphCatchup(testDb, {
      skipVector: true,
      batchSize: 10,
      now: new Date("2026-07-17T12:00:00.000Z"),
      projectFact: async (item) => {
        seen.push(item.id);
      },
      sleep: async () => undefined,
      log: () => undefined,
    });
    expect(first.projected).toBe(2);
    expect(readGraphCatchupCheckpoint(testDb).episodicLastId).toBe(2);

    const second = await runGraphCatchup(testDb, {
      skipVector: true,
      now: new Date("2026-07-17T12:30:00.000Z"),
      projectFact: async (item) => {
        seen.push(`again:${item.id}`);
      },
      sleep: async () => undefined,
      log: () => undefined,
    });
    expect(second.projected).toBe(0);
    expect(seen.filter((id) => id.startsWith("again:"))).toHaveLength(0);
  });

  it("skips blank episodic messages while advancing the in-run checkpoint", async () => {
    testDb
      .prepare(
        `INSERT INTO messages (session_id, project, agent_id, role, content, timestamp)
         VALUES ('s1', 'p1', 'luis', 'user', '   ', '2026-07-17T10:00:00.000Z')`
      )
      .run();

    const summary = await runGraphCatchup(testDb, {
      dryRun: true,
      skipVector: true,
      now: new Date("2026-07-17T12:00:00.000Z"),
      log: () => undefined,
    });

    expect(summary).toMatchObject({
      status: "completed",
      considered: 0,
      projected: 0,
      skipped: 1,
    });
    expect(summary.checkpointAfter.episodicLastId).toBe(1);
  });

  it("reports partial status and samples when episodic projection fails after a success", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    testDb
      .prepare(
        `INSERT INTO messages (session_id, project, agent_id, role, content, timestamp)
         VALUES ('s1', 'p1', 'luis', 'user', 'First memory about MemRoOS.', '2026-07-17T10:00:00.000Z')`
      )
      .run();
    testDb
      .prepare(
        `INSERT INTO messages (session_id, project, agent_id, role, content, timestamp)
         VALUES ('s1', 'p1', 'luis', 'user', 'Second memory about Neo4j catchup.', '2026-07-17T11:00:00.000Z')`
      )
      .run();

    const summary = await runGraphCatchup(testDb, {
      dryRun: true,
      skipVector: true,
      now: new Date("2026-07-17T12:00:00.000Z"),
      projectFact: async (item) => {
        if (item.id === "episodic:2") throw new Error("episodic boom");
      },
      log: () => undefined,
    });

    expect(summary.status).toBe("partial");
    expect(summary.projected).toBe(1);
    expect(summary.errors).toBe(1);
    expect(summary.sources.episodic).toMatchObject({ considered: 2, projected: 1, errors: 1 });
    expect(summary.errorSamples).toEqual(["episodic boom"]);
    expect(summary.checkpointAfter.episodicLastId).toBe(1);
    expect(errorSpy).toHaveBeenCalledWith(
      "[graph-catchup] episodic project failed",
      2,
      expect.any(Error)
    );
  });

  it("orders vector cursor comparisons correctly", () => {
    expect(
      isAfterVectorCursor(
        { id: "vector:b", createdAt: "2026-07-17T12:00:00.000Z" },
        { vectorLastCreatedAt: "2026-07-17T11:00:00.000Z", vectorLastId: "a" }
      )
    ).toBe(true);
    expect(
      isAfterVectorCursor(
        { id: "vector:a", createdAt: "2026-07-17T11:00:00.000Z" },
        { vectorLastCreatedAt: "2026-07-17T11:00:00.000Z", vectorLastId: "a" }
      )
    ).toBe(false);
  });

  it("paginates vector catchup in oneshot mode and continues after item failures", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchVectorPage = vi.fn(async (cursor: string | null) => {
      if (cursor === null) {
        return {
          items: [
            { id: "bad", payload: { data: "   " } },
            {
              id: "a",
              payload: {
                data: "Alice met Bob.",
                user_id: "luis",
                created_at: "2026-07-17T10:00:00.000Z",
              },
            },
          ],
          nextCursor: "cursor-2",
        };
      }
      return {
        items: [
          { id: "b", memory: "Beta memory.", created_at: "2026-07-17T11:00:00.000Z" },
          { id: "c", memory: "Gamma memory.", created_at: "2026-07-17T12:00:00.000Z" },
        ],
        nextCursor: null,
      };
    });
    const projected: string[] = [];

    const summary = await runGraphCatchup(testDb, {
      dryRun: true,
      skipEpisodic: true,
      oneshot: true,
      pageSize: 2,
      fetchVectorPage,
      now: new Date("2026-07-17T13:00:00.000Z"),
      projectFact: async (item) => {
        projected.push(item.id);
        if (item.id === "vector:b") throw new Error("vector boom");
      },
      log: () => undefined,
    });

    expect(summary.status).toBe("partial");
    expect(summary.pages).toBe(2);
    expect(summary.skipped).toBe(1);
    expect(summary.projected).toBe(2);
    expect(summary.errors).toBe(1);
    expect(summary.sources.vector).toMatchObject({ considered: 3, projected: 2, errors: 1 });
    expect(summary.checkpointAfter.vectorLastId).toBe("c");
    expect(projected).toEqual(["vector:a", "vector:b", "vector:c"]);
    expect(errorSpy).toHaveBeenCalledWith(
      "[graph-catchup] vector project failed",
      "vector:b",
      expect.any(Error)
    );
  });

  it("skips vector page items at or before the incremental cursor", async () => {
    writeGraphCatchupCheckpoint(testDb, {
      id: "default",
      episodicLastId: 0,
      vectorLastCreatedAt: "2026-07-17T11:00:00.000Z",
      vectorLastId: "b",
      updatedAt: "2026-07-17T11:30:00.000Z",
    });
    const fetchVectorPage = vi.fn(async () => ({
      items: [
        { id: "b", memory: "Already caught up.", created_at: "2026-07-17T11:00:00.000Z" },
        { id: "c", memory: "New memory.", created_at: "2026-07-17T12:00:00.000Z" },
      ],
      nextCursor: "ignored-incremental-cursor",
    }));
    const projected: string[] = [];

    const summary = await runGraphCatchup(testDb, {
      dryRun: true,
      skipEpisodic: true,
      pageSize: 2,
      fetchVectorPage,
      now: new Date("2026-07-17T13:00:00.000Z"),
      projectFact: async (item) => {
        projected.push(item.id);
      },
      log: () => undefined,
    });

    expect(summary.status).toBe("completed");
    expect(fetchVectorPage).toHaveBeenCalledTimes(1);
    expect(projected).toEqual(["vector:c"]);
    expect(summary.skipped).toBe(1);
    expect(summary.checkpointAfter.vectorLastId).toBe("c");
  });

  it("breaks cleanly on an empty vector page with no cursor", async () => {
    const log = vi.fn();
    const summary = await runGraphCatchup(testDb, {
      dryRun: true,
      skipEpisodic: true,
      pageSize: 2,
      fetchVectorPage: async () => ({ items: [{ id: "empty", memory: "   " }], nextCursor: null }),
      now: new Date("2026-07-17T13:00:00.000Z"),
      log,
    });

    expect(summary.status).toBe("completed");
    expect(summary.pages).toBe(1);
    expect(summary.skipped).toBe(1);
    expect(log).not.toHaveBeenCalledWith("vector page", expect.anything());
  });

  it("uses default log and sleep hooks when projecting writable pages", async () => {
    process.env.NEO4J_PASSWORD = "test-secret";
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const summary = await runGraphCatchup(testDb, {
      dryRun: false,
      skipEpisodic: true,
      pageSize: 1,
      fetchVectorPage: async () => ({
        items: [{ id: "sleepy", memory: "Sleepy vector memory.", created_at: "2026-07-17T12:00:00.000Z" }],
        nextCursor: null,
      }),
      writeDelayMs: 1,
      now: new Date("2026-07-17T13:00:00.000Z"),
      projectFact: async () => undefined,
    });

    expect(summary.projected).toBe(1);
    expect(logSpy).toHaveBeenCalledWith("[graph-catchup] vector page", expect.any(Object));
  });

  it("projects legacy mem0 memories in cursor order with incremental batch limits", async () => {
    writeGraphCatchupCheckpoint(testDb, {
      id: "default",
      episodicLastId: 0,
      vectorLastCreatedAt: "2026-07-17T10:00:00.000Z",
      vectorLastId: "m1",
      updatedAt: "2026-07-17T10:30:00.000Z",
    });
    const projected: string[] = [];

    const summary = await runGraphCatchup(testDb, {
      dryRun: true,
      skipEpisodic: true,
      useQdrantScroll: false,
      batchSize: 2,
      fetchVectorMemories: async () => [
        { id: "m3", memory: "Third memory.", created_at: "2026-07-17T12:00:00.000Z" },
        { id: "m0", memory: "Old memory.", created_at: "2026-07-17T09:00:00.000Z" },
        { id: "m2", data: "Second memory.", created_at: "2026-07-17T11:00:00.000Z" },
        { id: "bad", memory: " " },
      ],
      now: new Date("2026-07-17T13:00:00.000Z"),
      projectFact: async (item) => {
        projected.push(item.id);
      },
      log: () => undefined,
    });

    expect(summary.status).toBe("completed");
    expect(summary.pages).toBe(1);
    expect(projected).toEqual(["vector:m2", "vector:m3"]);
    expect(summary.checkpointAfter.vectorLastId).toBe("m3");
  });

  it("stops incremental legacy mem0 projection after an item failure", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const summary = await runGraphCatchup(testDb, {
      dryRun: true,
      skipEpisodic: true,
      useQdrantScroll: false,
      fetchVectorMemories: async () => [
        { id: "m1", memory: "First legacy memory.", created_at: "2026-07-17T10:00:00.000Z" },
        { id: "m2", memory: "Second legacy memory.", created_at: "2026-07-17T11:00:00.000Z" },
      ],
      now: new Date("2026-07-17T13:00:00.000Z"),
      projectFact: async (item) => {
        throw new Error(`legacy boom:${item.id}`);
      },
      log: () => undefined,
    });

    expect(summary.status).toBe("failed");
    expect(summary.errors).toBe(1);
    expect(summary.errorSamples).toEqual(["legacy boom:vector:m1"]);
    expect(errorSpy).toHaveBeenCalledWith(
      "[graph-catchup] vector project failed",
      "vector:m1",
      expect.any(Error)
    );
  });

  it("uses the default mem0 fetcher shapes and surfaces fetch failures", async () => {
    const response = (body: unknown) => ({
      ok: true,
      status: 200,
      json: async () => body,
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ memories: [{ id: "memories", memory: "From memories." }] }))
      .mockResolvedValueOnce(response({ results: [{ id: "results", memory: "From results." }] }))
      .mockResolvedValueOnce(response([{ id: "array", memory: "From array." }]))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error("bad json");
        },
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({}),
      });
    vi.stubGlobal("fetch", fetchMock);

    const runDefaultMem0 = () =>
      runGraphCatchup(testDb, {
        dryRun: true,
        skipEpisodic: true,
        useQdrantScroll: false,
        oneshot: true,
        now: new Date("2026-07-17T13:00:00.000Z"),
        log: () => undefined,
      });

    await expect(runDefaultMem0()).resolves.toMatchObject({ status: "completed", projected: 1 });
    await expect(runDefaultMem0()).resolves.toMatchObject({ status: "completed", projected: 1 });
    await expect(runDefaultMem0()).resolves.toMatchObject({ status: "completed", projected: 1 });
    await expect(runDefaultMem0()).resolves.toMatchObject({ status: "completed", projected: 0 });
    await expect(runDefaultMem0()).resolves.toMatchObject({
      status: "failed",
      errors: 1,
      reason: "vector_fetch_failed:mem0 /memory/all failed: HTTP 503",
    });
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("scheduler heartbeats cron_health and skips when Neo4j missing", async () => {
    delete process.env.NEO4J_PASSWORD;
    const result = await runScheduledGraphCatchup({
      now: new Date("2026-07-17T12:00:00.000Z"),
    });
    expect(result).toEqual({ status: "skipped", reason: "neo4j_not_configured" });
    const job = listCronHealthJobs(testDb).find((j) => j.id === GRAPH_CATCHUP_CRON_ID);
    expect(job?.lastRunAt).toBeTruthy();
    expect(job?.lastSuccessAt).toBeTruthy();
    expect(job?.metadata).toMatchObject({ skipped: true, reason: "neo4j_not_configured" });
  });

  it("scheduler skips paused jobs before running catchup", async () => {
    updateCronJobStatus(testDb, GRAPH_CATCHUP_CRON_ID, "paused");

    await expect(
      runScheduledGraphCatchup({
        dryRun: true,
        now: new Date("2026-07-17T12:00:00.000Z"),
      })
    ).resolves.toEqual({ status: "skipped", reason: "cron_paused_or_stopped" });
  });

  it("scheduler records completed, partial, and failed catchup summaries", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = (body: unknown) => ({
      ok: true,
      status: 200,
      json: async () => body,
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    fetchMock.mockResolvedValueOnce(response({ memories: [] }));
    await expect(
      runScheduledGraphCatchup({
        dryRun: true,
        now: new Date("2026-07-17T12:00:00.000Z"),
      })
    ).resolves.toMatchObject({ status: "completed", projected: 0 });
    let job = listCronHealthJobs(testDb).find((j) => j.id === GRAPH_CATCHUP_CRON_ID);
    expect(job?.warning).toBeNull();
    expect(job?.metadata).toMatchObject({ status: "completed", dry_run: true, projected: 0 });

    testDb
      .prepare(
        `INSERT INTO messages (session_id, project, agent_id, role, content, timestamp)
         VALUES ('s1', 'p1', 'luis', 'user', 'First memory about MemRoOS.', '2026-07-17T10:00:00.000Z')`
      )
      .run();
    fetchMock.mockRejectedValueOnce(new Error("mem0 down"));
    await expect(
      runScheduledGraphCatchup({
        dryRun: true,
        now: new Date("2026-07-17T13:00:00.000Z"),
      })
    ).resolves.toMatchObject({ status: "partial", projected: 1, errors: 1 });
    job = listCronHealthJobs(testDb).find((j) => j.id === GRAPH_CATCHUP_CRON_ID);
    expect(job?.warning).toBe("graph_catchup_partial_errors:1");
    expect(job?.lastSuccessAt).toBe("2026-07-17T13:00:00.000Z");

    testDb.exec("DELETE FROM messages");
    fetchMock.mockRejectedValueOnce(new Error("mem0 down"));
    await expect(
      runScheduledGraphCatchup({
        dryRun: true,
        now: new Date("2026-07-17T14:00:00.000Z"),
      })
    ).resolves.toMatchObject({ status: "failed", projected: 0, errors: 1 });
    job = listCronHealthJobs(testDb).find((j) => j.id === GRAPH_CATCHUP_CRON_ID);
    expect(job?.warning).toBe("vector_fetch_failed:mem0 down");
    expect(job?.lastFailureAt).toBe("2026-07-17T14:00:00.000Z");
    expect(errorSpy).toHaveBeenCalledWith("[graph-catchup] vector fetch failed", expect.any(Error));
  });

  it("startGraphCatchupScheduler is idempotent and stop clears the interval", () => {
    vi.useFakeTimers();
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    startGraphCatchupScheduler();
    const interval = globalThis._graphCatchupInterval;
    expect(interval).toBeDefined();
    expect(infoSpy).toHaveBeenCalledWith(
      "[graph-catchup] Neo4j not configured; scheduler idle until password is set"
    );
    expect(logSpy).toHaveBeenCalledWith("[graph-catchup] scheduler started (interval: 30m)");

    startGraphCatchupScheduler();
    expect(globalThis._graphCatchupInterval).toBe(interval);

    vi.advanceTimersByTime(GRAPH_CATCHUP_INTERVAL_MS);
    stopGraphCatchupScheduler();
    expect(globalThis._graphCatchupInterval).toBeUndefined();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("writeGraphCatchupCheckpoint round-trips", () => {
    const written = writeGraphCatchupCheckpoint(testDb, {
      id: "default",
      episodicLastId: 42,
      vectorLastCreatedAt: "2026-07-17T09:00:00.000Z",
      vectorLastId: "vec-9",
      updatedAt: "2026-07-17T12:00:00.000Z",
    });
    expect(written).toMatchObject({
      episodicLastId: 42,
      vectorLastId: "vec-9",
    });
    expect(readGraphCatchupCheckpoint(testDb).episodicLastId).toBe(42);
  });
});
