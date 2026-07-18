/**
 * Graph catchup — projection helpers + incremental checkpoint / dry-run / Neo4j skip.
 */
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { initSchema } from "@/lib/db-schema";
import { listCronHealthJobs } from "@/lib/cron-health";
import {
  GRAPH_CATCHUP_CRON_ID,
  isAfterVectorCursor,
  isNeo4jConfigured,
  mapVectorMemoryToProjection,
  normalizeVectorMemoryPoint,
  projectMemoryToGraph,
  readGraphCatchupCheckpoint,
  runGraphCatchup,
  writeGraphCatchupCheckpoint,
} from "../graph-catchup";
import {
  runScheduledGraphCatchup,
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
  vi.restoreAllMocks();
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
});
