/**
 * Graph catchup — projection helpers + incremental checkpoint / dry-run / Neo4j skip.
 */
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { initSchema } from "@/lib/db-schema";
import { listCronHealthJobs } from "@/lib/cron-health";
import {
  buildMemoryFactMergeCypher,
  countNeo4jNodes,
  GRAPH_CATCHUP_CRON_ID,
  isAfterVectorCursor,
  isNeo4jConfigured,
  mapEpisodicMessageToProjection,
  mapVectorMemoryToProjection,
  normalizeVectorMemoryPoint,
  projectMemoryFact,
  projectMemoryToGraph,
  readGraphCatchupCheckpoint,
  runGraphCatchup,
  scrollQdrantPoints,
  writeGraphCatchupCheckpoint,
} from "../graph-catchup";
import {
  runScheduledGraphCatchup,
  stopGraphCatchupScheduler,
} from "@/lib/memory-graph-catchup-scheduler";

const testDb = new Database(":memory:");

const mockNeo4jHttpQuery = vi.fn().mockResolvedValue({
  results: [{ data: [{ row: [5] }] }],
});

vi.mock("@/lib/memory/backends", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/memory/backends")>();
  return {
    ...actual,
    neo4jHttpQuery: (...args: unknown[]) => mockNeo4jHttpQuery(...args),
  };
});

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
  mockNeo4jHttpQuery.mockClear();
  mockNeo4jHttpQuery.mockResolvedValue({
    results: [{ data: [{ row: [5] }] }],
  });
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
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

  it("skips empty content with skipped:true", () => {
    const empty = projectMemoryToGraph({
      id: "mem-empty",
      content: "   ",
      userId: "luis",
    });
    expect(empty).toMatchObject({ skipped: true, reason: "empty_content", fact: null });
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
    expect(first.skipped).toBe(0);
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
    expect(second.skipped).toBe(0);
    expect(seen.filter((id) => id.startsWith("again:"))).toHaveLength(0);
  });

  it("rate-limits Neo4j writes via sleep between projections", async () => {
    process.env.NEO4J_PASSWORD = "test-secret";
    testDb
      .prepare(
        `INSERT INTO messages (session_id, project, agent_id, role, content, timestamp)
         VALUES ('s1', 'p1', 'luis', 'user', 'Rate limit memory one.', '2026-07-17T10:00:00.000Z')`
      )
      .run();
    testDb
      .prepare(
        `INSERT INTO messages (session_id, project, agent_id, role, content, timestamp)
         VALUES ('s1', 'p1', 'luis', 'user', 'Rate limit memory two.', '2026-07-17T11:00:00.000Z')`
      )
      .run();

    const sleepMs: number[] = [];
    await runGraphCatchup(testDb, {
      skipVector: true,
      writeDelayMs: 25,
      now: new Date("2026-07-17T12:00:00.000Z"),
      projectFact: async () => undefined,
      sleep: async (ms) => {
        sleepMs.push(ms);
      },
      log: () => undefined,
    });
    expect(sleepMs.length).toBeGreaterThanOrEqual(2);
    expect(sleepMs.every((ms) => ms === 25)).toBe(true);
  });

  it("does not leak Neo4j password in vector fetch error logs", async () => {
    process.env.NEO4J_PASSWORD = "test-fixture-password"; // pragma: allowlist secret
    process.env.QDRANT_URL = "http://qdrant.test.invalid:6333"; // pragma: allowlist secret
    const logs: string[] = [];
    const errorSpy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    });

    const summary = await runGraphCatchup(testDb, {
      skipEpisodic: true,
      now: new Date("2026-07-17T12:00:00.000Z"),
      fetchVectorPage: async () => {
        throw new Error("upstream failed");
      },
      sleep: async () => undefined,
      log: () => undefined,
    });

    expect(summary.errors).toBeGreaterThan(0);
    const joined = `${logs.join("\n")}\n${JSON.stringify(summary)}`;
    expect(joined).not.toContain("test-fixture-password");
    expect(joined.includes("NEO4J_PASSWORD=")).toBe(false);
    errorSpy.mockRestore();
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
    expect(
      isAfterVectorCursor(
        { id: "vector:older", createdAt: "2026-07-17T10:00:00.000Z" },
        { vectorLastCreatedAt: "2026-07-17T11:00:00.000Z", vectorLastId: "x" }
      )
    ).toBe(false);
    expect(
      isAfterVectorCursor(
        { id: "vector:c", createdAt: "2026-07-17T11:00:00.000Z" },
        { vectorLastCreatedAt: "2026-07-17T11:00:00.000Z", vectorLastId: "b" }
      )
    ).toBe(true);
    expect(
      isAfterVectorCursor(
        { id: "vector:only-id", createdAt: null },
        { vectorLastCreatedAt: null, vectorLastId: "aaa" }
      )
    ).toBe(true);
    expect(
      isAfterVectorCursor(
        { id: "vector:aaa", createdAt: null },
        { vectorLastCreatedAt: null, vectorLastId: "bbb" }
      )
    ).toBe(false);
  });

  it("normalizeVectorMemoryPoint returns null for unusable payloads", () => {
    expect(normalizeVectorMemoryPoint(null)).toBeNull();
    expect(normalizeVectorMemoryPoint({ payload: { data: "   " } })).toBeNull();
    expect(normalizeVectorMemoryPoint("not-an-object")).toBeNull();
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

  it("oneshot pages vector memories across fetchVectorPage cursors", async () => {
    process.env.NEO4J_PASSWORD = "test-secret";
    process.env.QDRANT_URL = "http://qdrant.test";
    const pages: Array<{
      items: Array<Record<string, unknown>>;
      nextCursor: string | null;
    }> = [
      {
        items: [
          {
            id: "v1",
            payload: {
              data: "Vector page one about MemRoOS.",
              user_id: "luis",
              created_at: "2026-07-17T10:00:00.000Z",
            },
          },
        ],
        nextCursor: "c1",
      },
      {
        items: [
          {
            id: "v2",
            payload: {
              data: "Vector page two about Neo4j.",
              user_id: "luis",
              created_at: "2026-07-17T11:00:00.000Z",
            },
          },
        ],
        nextCursor: null,
      },
    ];
    let pageIdx = 0;
    const seen: string[] = [];
    const summary = await runGraphCatchup(testDb, {
      oneshot: true,
      skipEpisodic: true,
      now: new Date("2026-07-17T12:00:00.000Z"),
      fetchVectorPage: async () => pages[pageIdx++]!,
      projectFact: async (item) => {
        seen.push(item.id);
      },
      sleep: async () => undefined,
      log: () => undefined,
    });
    expect(summary.status).toBe("completed");
    expect(summary.projected).toBe(2);
    expect(summary.pages).toBe(2);
    expect(seen).toEqual(["vector:v1", "vector:v2"]);
    expect(readGraphCatchupCheckpoint(testDb).vectorLastId).toBe("v2");
  });

  it("uses legacy fetchVectorMemories when Qdrant scroll is disabled", async () => {
    process.env.NEO4J_PASSWORD = "test-secret";
    delete process.env.QDRANT_URL;
    const seen: string[] = [];
    const summary = await runGraphCatchup(testDb, {
      skipEpisodic: true,
      useQdrantScroll: false,
      now: new Date("2026-07-17T12:00:00.000Z"),
      fetchVectorMemories: async () => [
        {
          id: "legacy-1",
          memory: "Legacy mem0 row about catchup.",
          user_id: "luis",
          created_at: "2026-07-17T09:00:00.000Z",
        },
        {
          id: "legacy-2",
          data: "Second legacy shape.",
          agent_id: "luis",
          createdAt: "2026-07-17T09:30:00.000Z",
        },
      ],
      projectFact: async (item) => {
        seen.push(item.id);
      },
      sleep: async () => undefined,
      log: () => undefined,
    });
    expect(summary.status).toBe("completed");
    expect(summary.projected).toBe(2);
    expect(seen[0]).toContain("vector:");
  });

  it("marks partial status and advances past a failed episodic projection", async () => {
    process.env.NEO4J_PASSWORD = "test-secret";
    testDb
      .prepare(
        `INSERT INTO messages (session_id, project, agent_id, role, content, timestamp)
         VALUES ('s1', 'p1', 'luis', 'user', 'First good memory.', '2026-07-17T10:00:00.000Z')`
      )
      .run();
    testDb
      .prepare(
        `INSERT INTO messages (session_id, project, agent_id, role, content, timestamp)
         VALUES ('s1', 'p1', 'luis', 'user', 'Second memory fails projection.', '2026-07-17T11:00:00.000Z')`
      )
      .run();

    let calls = 0;
    const summary = await runGraphCatchup(testDb, {
      skipVector: true,
      now: new Date("2026-07-17T12:00:00.000Z"),
      projectFact: async () => {
        calls += 1;
        if (calls > 1) throw new Error("neo4j_write_failed");
      },
      sleep: async () => undefined,
      log: () => undefined,
    });
    expect(summary.projected).toBe(1);
    expect(summary.errors).toBe(1);
    expect(summary.errorSamples?.[0]).toContain("neo4j_write_failed");
    expect(["partial", "failed", "completed"]).toContain(summary.status);
    expect(readGraphCatchupCheckpoint(testDb).episodicLastId).toBe(2);
  });

  it("continues oneshot vector projection after a single item failure", async () => {
    process.env.NEO4J_PASSWORD = "test-secret";
    process.env.QDRANT_URL = "http://qdrant.test";
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    let calls = 0;
    const summary = await runGraphCatchup(testDb, {
      oneshot: true,
      skipEpisodic: true,
      writeDelayMs: 5,
      now: new Date("2026-07-17T12:00:00.000Z"),
      fetchVectorPage: async () => ({
        items: [
          {
            id: "bad",
            payload: {
              data: "First vector fails.",
              user_id: "luis",
              created_at: "2026-07-17T10:00:00.000Z",
            },
          },
          {
            id: "good",
            payload: {
              data: "Second vector succeeds.",
              user_id: "luis",
              created_at: "2026-07-17T11:00:00.000Z",
            },
          },
        ],
        nextCursor: null,
      }),
      projectFact: async () => {
        calls += 1;
        if (calls === 1) throw new Error("vector_item_failed");
      },
      sleep: async () => undefined,
      log: () => undefined,
    });
    expect(summary.projected).toBe(1);
    expect(summary.errors).toBe(1);
    expect(summary.sources.vector.errors).toBe(1);
    expect(readGraphCatchupCheckpoint(testDb).vectorLastId).toBe("good");
    errorSpy.mockRestore();
  });

  it("stops incremental vector projection after the first failure", async () => {
    process.env.NEO4J_PASSWORD = "test-secret";
    process.env.QDRANT_URL = "http://qdrant.test";
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    writeGraphCatchupCheckpoint(testDb, {
      id: "default",
      episodicLastId: 0,
      vectorLastCreatedAt: "2026-07-17T09:00:00.000Z",
      vectorLastId: "older",
      updatedAt: "2026-07-17T09:00:00.000Z",
    });
    let calls = 0;
    const summary = await runGraphCatchup(testDb, {
      oneshot: false,
      skipEpisodic: true,
      now: new Date("2026-07-17T12:00:00.000Z"),
      fetchVectorPage: async () => ({
        items: [
          {
            id: "older",
            payload: {
              data: "Already caught up memory.",
              user_id: "luis",
              created_at: "2026-07-17T09:00:00.000Z",
            },
          },
          {
            id: "fail-me",
            payload: {
              data: "This should fail and stop the tick.",
              user_id: "luis",
              created_at: "2026-07-17T10:00:00.000Z",
            },
          },
          {
            id: "never",
            payload: {
              data: "Should not be projected in incremental mode.",
              user_id: "luis",
              created_at: "2026-07-17T11:00:00.000Z",
            },
          },
        ],
        nextCursor: null,
      }),
      projectFact: async () => {
        calls += 1;
        throw new Error("incremental_vector_fail");
      },
      sleep: async () => undefined,
      log: () => undefined,
    });
    expect(summary.skipped).toBeGreaterThanOrEqual(1);
    expect(calls).toBe(1);
    expect(summary.errors).toBe(1);
    errorSpy.mockRestore();
  });

  it("uses legacy vector path and stops on incremental project failure", async () => {
    process.env.NEO4J_PASSWORD = "test-secret";
    delete process.env.QDRANT_URL;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    let calls = 0;
    const summary = await runGraphCatchup(testDb, {
      skipEpisodic: true,
      useQdrantScroll: false,
      now: new Date("2026-07-17T12:00:00.000Z"),
      fetchVectorMemories: async () => [
        {
          id: "legacy-a",
          memory: "Legacy A about catchup.",
          user_id: "luis",
          created_at: "2026-07-17T09:00:00.000Z",
        },
        {
          id: "legacy-b",
          memory: "Legacy B about catchup.",
          user_id: "luis",
          created_at: "2026-07-17T09:30:00.000Z",
        },
      ],
      projectFact: async () => {
        calls += 1;
        throw new Error("legacy_fail");
      },
      sleep: async () => undefined,
      log: () => undefined,
    });
    expect(calls).toBe(1);
    expect(summary.errors).toBe(1);
    expect(summary.sources.vector.errors).toBe(1);
    errorSpy.mockRestore();
  });

  // MiniMax-M3 worker draft (Beastmode 20260718T151444Z); director-reviewed.
  it("increments summary.skipped when mapVectorMemoryToProjection returns null", async () => {
    process.env.NEO4J_PASSWORD = "test-secret";
    process.env.QDRANT_URL = "http://qdrant.test";
    const seen: string[] = [];
    const summary = await runGraphCatchup(testDb, {
      oneshot: true,
      skipEpisodic: true,
      now: new Date("2026-07-17T12:00:00.000Z"),
      fetchVectorPage: async () => ({
        items: [
          {
            id: "skip-empty",
            payload: {
              data: "   ",
              user_id: "luis",
              created_at: "2026-07-17T10:00:00.000Z",
            },
          },
          {
            id: "skip-missing",
            payload: {
              user_id: "luis",
              created_at: "2026-07-17T10:05:00.000Z",
            },
          },
          null,
        ],
        nextCursor: null,
      }),
      projectFact: async (item) => {
        seen.push(item.id);
      },
      sleep: async () => undefined,
      log: () => undefined,
    });
    expect(summary.skipped).toBeGreaterThanOrEqual(2);
    expect(summary.projected).toBe(0);
    expect(seen).toEqual([]);
  });

  it("honors maxPoints early-break in oneshot vector loop", async () => {
    process.env.NEO4J_PASSWORD = "test-secret";
    process.env.QDRANT_URL = "http://qdrant.test";
    const seen: string[] = [];
    const summary = await runGraphCatchup(testDb, {
      oneshot: true,
      skipEpisodic: true,
      maxPoints: 2,
      now: new Date("2026-07-17T12:00:00.000Z"),
      fetchVectorPage: async () => ({
        items: [
          {
            id: "max-1",
            payload: {
              data: "Vector one for max cap.",
              user_id: "luis",
              created_at: "2026-07-17T10:00:00.000Z",
            },
          },
          {
            id: "max-2",
            payload: {
              data: "Vector two for max cap.",
              user_id: "luis",
              created_at: "2026-07-17T10:30:00.000Z",
            },
          },
          {
            id: "max-3",
            payload: {
              data: "Vector three — should not be projected.",
              user_id: "luis",
              created_at: "2026-07-17T11:00:00.000Z",
            },
          },
        ],
        nextCursor: null,
      }),
      projectFact: async (item) => {
        seen.push(item.id);
      },
      sleep: async () => undefined,
      log: () => undefined,
    });
    expect(summary.status).toBe("completed");
    expect(summary.projected).toBe(2);
    expect(seen).toEqual(["vector:max-1", "vector:max-2"]);
  });

  it("skips empty episodic content and pages oneshot across batches", async () => {
    process.env.NEO4J_PASSWORD = "test-secret";
    // Insert empty + two real messages; batchSize=1 forces multi-loop oneshot paging.
    testDb
      .prepare(
        `INSERT INTO messages (session_id, project, agent_id, role, content, timestamp)
         VALUES ('s1', 'p1', 'luis', 'user', '   ', '2026-07-17T09:00:00.000Z')`
      )
      .run();
    testDb
      .prepare(
        `INSERT INTO messages (session_id, project, agent_id, role, content, timestamp)
         VALUES ('s1', 'p1', 'luis', 'user', 'First real episodic memory.', '2026-07-17T10:00:00.000Z')`
      )
      .run();
    testDb
      .prepare(
        `INSERT INTO messages (session_id, project, agent_id, role, content, timestamp)
         VALUES ('s1', 'p1', 'luis', 'user', 'Second real episodic memory.', '2026-07-17T11:00:00.000Z')`
      )
      .run();

    const seen: string[] = [];
    const summary = await runGraphCatchup(testDb, {
      oneshot: true,
      skipVector: true,
      batchSize: 1,
      now: new Date("2026-07-17T12:00:00.000Z"),
      projectFact: async (item) => {
        seen.push(item.id);
      },
      sleep: async () => undefined,
      log: () => undefined,
    });
    expect(summary.skipped).toBeGreaterThanOrEqual(1);
    expect(summary.projected).toBe(2);
    expect(seen).toEqual(["episodic:2", "episodic:3"]);
    expect(readGraphCatchupCheckpoint(testDb).episodicLastId).toBe(3);
  });
});

describe("graph-catchup Neo4j projection helpers", () => {
  it("buildMemoryFactMergeCypher returns idempotent MERGE cypher", () => {
    const cypher = buildMemoryFactMergeCypher();
    expect(cypher).toContain("MERGE (n:MemoryFact {id: $id})");
    expect(cypher).toContain("projectedBy = 'graph-catchup'");
  });

  it("countNeo4jNodes parses numeric and string counts from query results", async () => {
    const numeric = await countNeo4jNodes(async () => ({
      results: [{ data: [{ row: [42] }] }],
    }));
    expect(numeric).toBe(42);

    const stringCount = await countNeo4jNodes(async () => ({
      results: [{ data: [{ row: ["17"] }] }],
    }));
    expect(stringCount).toBe(17);

    const missing = await countNeo4jNodes(async () => ({}));
    expect(missing).toBe(0);
  });

  it("projectMemoryFact returns dry_run without calling Neo4j", async () => {
    const queryFn = vi.fn();
    const result = await projectMemoryFact(
      {
        id: "episodic:1",
        content: "Luis Calderon met Juan about PopSmiths.",
        source: "episodic",
      },
      { dryRun: true, queryFn }
    );
    expect(result).toBe("dry_run");
    expect(queryFn).not.toHaveBeenCalled();
  });

  it("projectMemoryFact MERGEs facts and tolerates entity projection failures", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const queryFn = vi
      .fn()
      .mockResolvedValueOnce({ results: [] })
      .mockRejectedValueOnce(new Error("entity_merge_failed"));

    const result = await projectMemoryFact(
      {
        id: "episodic:2",
        content: "Luis Calderon met Juan about PopSmiths on 2026-05-12.",
        source: "episodic",
        agentId: "luis",
        createdAt: "2026-07-17T10:00:00.000Z",
      },
      { queryFn }
    );
    expect(result).toBe("projected");
    expect(queryFn).toHaveBeenCalledTimes(2);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("projectMemoryFact projects entities when extraction finds matches", async () => {
    const queryFn = vi.fn().mockResolvedValue({ results: [] });
    await projectMemoryFact(
      {
        id: "vector:ent-1",
        content: "Luis Calderon met Juan about PopSmiths on 2026-05-12.",
        source: "vector",
      },
      { queryFn, projectEntities: true }
    );
    expect(queryFn).toHaveBeenCalledTimes(2);
    expect(String(queryFn.mock.calls[1]?.[0])).toContain("MemoryEntity");
  });

  it("readGraphCatchupCheckpoint returns defaults for unknown checkpoint ids", () => {
    const checkpoint = readGraphCatchupCheckpoint(testDb, "missing-checkpoint");
    expect(checkpoint.id).toBe("missing-checkpoint");
    expect(checkpoint.episodicLastId).toBe(0);
    expect(checkpoint.vectorLastCreatedAt).toBeNull();
    expect(checkpoint.vectorLastId).toBeNull();
  });

  it("isNeo4jConfigured treats whitespace-only passwords as unset", () => {
    expect(isNeo4jConfigured({ password: "   " })).toBe(false);
    expect(isNeo4jConfigured({ password: "secret" })).toBe(true);
  });
});

describe("graph-catchup vector mapping and fetch helpers", () => {
  it("mapEpisodicMessageToProjection truncates long content", () => {
    const mapped = mapEpisodicMessageToProjection({
      id: 7,
      content: "x".repeat(9000),
      agent_id: "luis",
      timestamp: "2026-07-17T10:00:00.000Z",
    });
    expect(mapped.id).toBe("episodic:7");
    expect(mapped.content.length).toBe(8000);
  });

  it("mapVectorMemoryToProjection supports alternate content and metadata fields", () => {
    expect(
      mapVectorMemoryToProjection({
        text: "  Text field memory about MemRoOS.  ",
        id: "t1",
        ingested_at: "2026-07-17T09:00:00.000Z",
      })
    ).toMatchObject({
      id: "vector:t1",
      createdAt: "2026-07-17T09:00:00.000Z",
    });

    expect(
      mapVectorMemoryToProjection({
        content: "Content field memory.",
        memory_id: "m1",
        metadata: { saved_by_agent: "hermes-agent" },
      })
    ).toMatchObject({
      id: "vector:m1",
      agentId: "hermes-agent",
    });

    expect(mapVectorMemoryToProjection({ data: "   " }, 3)).toBeNull();
    expect(mapVectorMemoryToProjection({ data: "anon" }, 3)?.id).toBe("vector:vector-anon-3");
  });

  it("scrollQdrantPoints scrolls with cursor, api key, and collection options", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        result: {
          points: [{ id: "p1", payload: { data: "hello" } }],
          next_page_offset: 99,
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const page = await scrollQdrantPoints("cursor-1", 25, {
      url: "http://qdrant.test/",
      apiKey: "test-key",
      collection: "custom_collection",
    });
    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).toBe("99");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://qdrant.test/collections/custom_collection/points/scroll",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "api-key": "test-key" }),
      })
    );
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.offset).toBe("cursor-1");

    vi.unstubAllGlobals();
  });

  it("scrollQdrantPoints throws when QDRANT_URL is missing", async () => {
    const saved = process.env.QDRANT_URL;
    delete process.env.QDRANT_URL;
    try {
      await scrollQdrantPoints(null, 10);
      throw new Error("expected scrollQdrantPoints to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toMatch(/QDRANT_URL is not configured/);
    } finally {
      if (saved) process.env.QDRANT_URL = saved;
    }
  });

  it("scrollQdrantPoints surfaces HTTP failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({}),
      })
    );
    try {
      await scrollQdrantPoints(null, 10, { url: "http://qdrant.test" });
      throw new Error("expected scrollQdrantPoints to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toMatch(/Qdrant scroll failed: HTTP 503/);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("marks failed status when every projection errors and none succeed", async () => {
    process.env.NEO4J_PASSWORD = "test-secret";
    testDb
      .prepare(
        `INSERT INTO messages (session_id, project, agent_id, role, content, timestamp)
         VALUES ('s1', 'p1', 'luis', 'user', 'Only memory and it fails.', '2026-07-17T10:00:00.000Z')`
      )
      .run();

    const summary = await runGraphCatchup(testDb, {
      skipVector: true,
      now: new Date("2026-07-17T12:00:00.000Z"),
      projectFact: async () => {
        throw new Error("total_failure");
      },
      sleep: async () => undefined,
      log: () => undefined,
    });
    expect(summary.status).toBe("failed");
    expect(summary.projected).toBe(0);
    expect(summary.errors).toBe(1);
  });

  it("skips vector rows at or before the incremental cursor", async () => {
    process.env.NEO4J_PASSWORD = "test-secret";
    process.env.QDRANT_URL = "http://qdrant.test";
    writeGraphCatchupCheckpoint(testDb, {
      id: "default",
      episodicLastId: 0,
      vectorLastCreatedAt: "2026-07-17T11:00:00.000Z",
      vectorLastId: "cursor-id",
      updatedAt: "2026-07-17T11:00:00.000Z",
    });
    const seen: string[] = [];
    const summary = await runGraphCatchup(testDb, {
      skipEpisodic: true,
      now: new Date("2026-07-17T12:00:00.000Z"),
      fetchVectorPage: async () => ({
        items: [
          {
            id: "cursor-id",
            payload: {
              data: "Already synced memory.",
              user_id: "luis",
              created_at: "2026-07-17T11:00:00.000Z",
            },
          },
          {
            id: "newer",
            payload: {
              data: "Newer memory after cursor.",
              user_id: "luis",
              created_at: "2026-07-17T12:00:00.000Z",
            },
          },
        ],
        nextCursor: null,
      }),
      projectFact: async (item) => {
        seen.push(item.id);
      },
      sleep: async () => undefined,
      log: () => undefined,
    });
    expect(summary.skipped).toBeGreaterThanOrEqual(1);
    expect(seen).toEqual(["vector:newer"]);
  });

  it("uses default log callback when none is supplied", async () => {
    process.env.NEO4J_PASSWORD = "test-secret";
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await runGraphCatchup(testDb, {
      skipEpisodic: true,
      skipVector: true,
      now: new Date("2026-07-17T12:00:00.000Z"),
      projectFact: async () => undefined,
      sleep: async () => undefined,
    });
    expect(logSpy.mock.calls.some((call) => String(call[0]).includes("[graph-catchup]"))).toBe(
      true
    );
    logSpy.mockRestore();
  });

  it("legacy mem0 path sorts by createdAt and respects incremental batchSize", async () => {
    process.env.NEO4J_PASSWORD = "test-secret";
    delete process.env.QDRANT_URL;
    const seen: string[] = [];
    const summary = await runGraphCatchup(testDb, {
      skipEpisodic: true,
      useQdrantScroll: false,
      batchSize: 1,
      now: new Date("2026-07-17T12:00:00.000Z"),
      fetchVectorMemories: async () => [
        {
          id: "later",
          memory: "Later memory about Neo4j.",
          user_id: "luis",
          created_at: "2026-07-17T11:00:00.000Z",
        },
        {
          id: "earlier",
          memory: "Earlier memory about MemRoOS.",
          user_id: "luis",
          created_at: "2026-07-17T10:00:00.000Z",
        },
      ],
      projectFact: async (item) => {
        seen.push(item.id);
      },
      sleep: async () => undefined,
      log: () => undefined,
    });
    expect(summary.projected).toBe(1);
    expect(seen).toEqual(["vector:earlier"]);
  });

  it("isAfterVectorCursor handles createdAt-only and cursor-only comparisons", () => {
    expect(
      isAfterVectorCursor(
        { id: "vector:z", createdAt: "2026-07-17T12:00:00.000Z" },
        { vectorLastCreatedAt: null, vectorLastId: null }
      )
    ).toBe(true);
    expect(
      isAfterVectorCursor(
        { id: "vector:aaa", createdAt: "2026-07-17T10:00:00.000Z" },
        { vectorLastCreatedAt: "2026-07-17T11:00:00.000Z", vectorLastId: "x" }
      )
    ).toBe(false);
    expect(
      isAfterVectorCursor(
        { id: "vector:bbb", createdAt: null },
        { vectorLastCreatedAt: "2026-07-17T11:00:00.000Z", vectorLastId: "x" }
      )
    ).toBe(false);
    expect(
      isAfterVectorCursor(
        { id: "vector:ccc", createdAt: null },
        { vectorLastCreatedAt: null, vectorLastId: "bbb" }
      )
    ).toBe(true);
  });

  it("runGraphCatchup uses default projectMemoryFact when projectFact is omitted", async () => {
    process.env.NEO4J_PASSWORD = "test-secret";
    testDb
      .prepare(
        `INSERT INTO messages (session_id, project, agent_id, role, content, timestamp)
         VALUES ('s1', 'p1', 'luis', 'user', 'Default projection path memory.', '2026-07-17T10:00:00.000Z')`
      )
      .run();
    mockNeo4jHttpQuery.mockClear();
    const summary = await runGraphCatchup(testDb, {
      skipVector: true,
      writeDelayMs: 0,
      now: new Date("2026-07-17T12:00:00.000Z"),
      log: () => undefined,
    });
    expect(summary.projected).toBe(1);
    expect(mockNeo4jHttpQuery).toHaveBeenCalled();
  });

  it("runGraphCatchup uses default mem0 fetch when Qdrant scroll is disabled", async () => {
    process.env.NEO4J_PASSWORD = "test-secret";
    delete process.env.QDRANT_URL;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          memories: [
            {
              id: "mem0-default",
              memory: "Default mem0 fetch memory about catchup.",
              user_id: "luis",
              created_at: "2026-07-17T10:00:00.000Z",
            },
          ],
        }),
      })
    );
    const summary = await runGraphCatchup(testDb, {
      skipEpisodic: true,
      useQdrantScroll: false,
      writeDelayMs: 0,
      now: new Date("2026-07-17T12:00:00.000Z"),
      log: () => undefined,
    });
    expect(summary.projected).toBe(1);
    expect(summary.sources.vector.projected).toBe(1);
  });

  it("runGraphCatchup uses scrollQdrantPoints when QDRANT_URL is configured", async () => {
    process.env.NEO4J_PASSWORD = "test-secret";
    process.env.QDRANT_URL = "http://qdrant.test";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          result: {
            points: [
              {
                id: "qdrant-default",
                payload: {
                  data: "Default Qdrant scroll memory.",
                  user_id: "luis",
                  created_at: "2026-07-17T10:00:00.000Z",
                },
              },
            ],
            next_page_offset: null,
          },
        }),
      })
    );
    const summary = await runGraphCatchup(testDb, {
      skipEpisodic: true,
      writeDelayMs: 0,
      now: new Date("2026-07-17T12:00:00.000Z"),
      log: () => undefined,
    });
    expect(summary.projected).toBe(1);
    expect(summary.pages).toBe(1);
  });

  it("legacy mem0 oneshot projects all sorted memories via default fetch", async () => {
    process.env.NEO4J_PASSWORD = "test-secret";
    delete process.env.QDRANT_URL;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          results: [
            {
              id: "later",
              memory: "Later oneshot memory.",
              user_id: "luis",
              created_at: "2026-07-17T11:00:00.000Z",
            },
            {
              id: "earlier",
              memory: "Earlier oneshot memory.",
              user_id: "luis",
              created_at: "2026-07-17T10:00:00.000Z",
            },
          ],
        }),
      })
    );
    const summary = await runGraphCatchup(testDb, {
      oneshot: true,
      skipEpisodic: true,
      useQdrantScroll: false,
      writeDelayMs: 0,
      now: new Date("2026-07-17T12:00:00.000Z"),
      log: () => undefined,
    });
    expect(summary.projected).toBe(2);
    expect(summary.sources.vector.projected).toBe(2);
  });
});
