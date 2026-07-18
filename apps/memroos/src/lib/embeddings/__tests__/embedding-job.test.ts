// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { initSchema } from "@/lib/db-schema";
import { getEmbedding } from "../store";
import {
  EMBEDDING_CYCLE_LIMIT,
  EMBEDDING_INTERVAL_MS,
  runEmbeddingCycle,
  startEmbeddingJob,
} from "../embedding-job";

vi.mock("../provider", () => ({
  embedText: vi.fn(),
  embeddingProviderEnabled: vi.fn(() => true),
}));

import { embedText, embeddingProviderEnabled } from "../provider";

function makeDb(): Database.Database {
  const db = new Database(":memory:");
  initSchema(db);
  return db;
}

function insertMessage(db: Database.Database, index: number): number {
  const result = db
    .prepare(
      `INSERT INTO messages(session_id, project, agent_id, role, content, timestamp, visibility, policy)
       VALUES(?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      "embedding-job-test",
      "test-project",
      "test-agent",
      "user",
      `message ${index}`,
      new Date().toISOString(),
      "public_approved",
      "indexable"
    );
  return result.lastInsertRowid as number;
}

describe("embedding background job", () => {
  let db: Database.Database;
  const mockEmbedText = vi.mocked(embedText);
  const mockEmbeddingProviderEnabled = vi.mocked(embeddingProviderEnabled);

  beforeEach(() => {
    db = makeDb();
    vi.clearAllMocks();
    mockEmbeddingProviderEnabled.mockReturnValue(true);
  });

  afterEach(() => {
    db.close();
  });

  it("uses a 5-minute interval and 50-message cycle cap", () => {
    expect(EMBEDDING_INTERVAL_MS).toBe(300_000);
    expect(EMBEDDING_CYCLE_LIMIT).toBe(50);
  });

  it("embeds at most 50 messages per cycle", async () => {
    const ids = Array.from({ length: 55 }, (_, index) => insertMessage(db, index));
    mockEmbedText.mockResolvedValue({ embedding: [0.1, 0.2, 0.3], degraded: false });

    const result = await runEmbeddingCycle(db);

    expect(result).toEqual({ embedded: 50, degraded: false });
    const embeddedCount = ids.filter((id) => getEmbedding(db, id)).length;
    expect(embeddedCount).toBe(50);
  });

  it("writes no rows and does not throw when embeddings are degraded", async () => {
    const id = insertMessage(db, 1);
    mockEmbedText.mockResolvedValue({ embedding: null, degraded: true });

    await expect(runEmbeddingCycle(db)).resolves.toEqual({ embedded: 0, degraded: true });
    expect(getEmbedding(db, id)).toBeNull();
  });

  it("returns the partial count when a later embedding degrades", async () => {
    const firstId = insertMessage(db, 1);
    const secondId = insertMessage(db, 2);
    mockEmbedText
      .mockResolvedValueOnce({ embedding: [0.1, 0.2, 0.3], degraded: false })
      .mockResolvedValueOnce({ embedding: null, degraded: true });

    await expect(runEmbeddingCycle(db)).resolves.toEqual({ embedded: 1, degraded: true });
    expect(getEmbedding(db, secondId)).toBeTruthy();
    expect(getEmbedding(db, firstId)).toBeNull();
  });

  it("marks the cycle degraded when message lookup fails", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const brokenDb = {
      prepare() {
        throw new Error("db unavailable");
      },
    } as unknown as Database.Database;

    await expect(runEmbeddingCycle(brokenDb)).resolves.toEqual({
      embedded: 0,
      degraded: true,
    });
    expect(consoleSpy).toHaveBeenCalledWith(
      "[embeddings] embedding cycle failed:",
      expect.any(Error)
    );
    consoleSpy.mockRestore();
  });

  it("does not schedule the job when the provider is disabled", () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const intervalSpy = vi.spyOn(global, "setInterval");
    mockEmbeddingProviderEnabled.mockReturnValue(false);

    startEmbeddingJob();

    expect(infoSpy).toHaveBeenCalledWith(
      "[embeddings] provider disabled; embedding job not scheduled"
    );
    expect(intervalSpy).not.toHaveBeenCalled();
    infoSpy.mockRestore();
    intervalSpy.mockRestore();
  });
});
