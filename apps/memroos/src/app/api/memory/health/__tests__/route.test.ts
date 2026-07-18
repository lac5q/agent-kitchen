// @vitest-environment node
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let db: Database.Database;

vi.mock("@/lib/db", () => ({
  getDb: () => db,
}));

vi.mock("@/lib/memory/backends", () => ({
  checkVectorHealth: vi.fn(async () => ({
    tier: "vector",
    backend: "mem0-qdrant",
    status: "up",
  })),
  checkGraphHealth: vi.fn(async () => ({
    tier: "graph",
    backend: "neo4j",
    status: "not_configured",
  })),
}));

const { GET } = await import("../route");

describe("/api/memory/health", () => {
  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(`
      CREATE TABLE agent_memory_writes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        memory_type TEXT NOT NULL,
        written_at TEXT
      );
      CREATE TABLE meta (
        key TEXT PRIMARY KEY,
        value TEXT
      );
    `);
  });

  afterEach(() => {
    db.close();
    delete process.env.MEMROOS_RECALL_INGEST_STALE_AFTER_HOURS;
  });

  it("rejects external callers without operator or agent credentials", async () => {
    const response = await GET(new Request("https://memroos.example.com/api/memory/health"));

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: "Registry write authorization required",
    });
  });

  it("returns tier health and marks invalid recall ingest timestamps stale", async () => {
    db.prepare("INSERT INTO agent_memory_writes(memory_type, written_at) VALUES ('episodic', ?)").run(
      "2026-07-18T09:00:00.000Z"
    );
    db.prepare("INSERT INTO meta(key, value) VALUES ('last_ingest_ts', 'not-a-date')").run();
    process.env.MEMROOS_RECALL_INGEST_STALE_AFTER_HOURS = "-5";

    const response = await GET(new Request("http://localhost/api/memory/health"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.tiers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tier: "vector", status: "up" }),
        expect.objectContaining({ tier: "graph", status: "not_configured" }),
        expect.objectContaining({
          tier: "episodic",
          status: "up",
          count: 1,
          lastWrite: "2026-07-18T09:00:00.000Z",
        }),
      ])
    );
    expect(json.recallIngest).toMatchObject({
      status: "stale",
      lastIngest: "not-a-date",
      staleAfterHours: 24,
      detail: "Last recall ingest timestamp is invalid",
    });
  });

  it("reports missing, fresh, and stale recall ingest timestamps", async () => {
    const missing = await GET(new Request("http://localhost/api/memory/health"));
    expect((await missing.json()).recallIngest).toMatchObject({
      status: "stale",
      ageHours: null,
      detail: "No recall ingest run has been recorded",
    });

    process.env.MEMROOS_RECALL_INGEST_STALE_AFTER_HOURS = "1";
    db.prepare("INSERT INTO meta(key, value) VALUES ('last_ingest_ts', ?)").run(
      new Date(Date.now() - 15 * 60_000).toISOString()
    );
    const fresh = await GET(new Request("http://localhost/api/memory/health"));
    expect((await fresh.json()).recallIngest).toMatchObject({
      status: "up",
      staleAfterHours: 1,
    });

    db.prepare("UPDATE meta SET value = ? WHERE key = 'last_ingest_ts'").run(
      new Date(Date.now() - 2 * 60 * 60_000).toISOString()
    );
    const stale = await GET(new Request("http://localhost/api/memory/health"));
    const staleJson = await stale.json();
    expect(staleJson.recallIngest.status).toBe("stale");
    expect(staleJson.recallIngest.detail).toMatch(/Recall ingest is stale/);
  });
});
