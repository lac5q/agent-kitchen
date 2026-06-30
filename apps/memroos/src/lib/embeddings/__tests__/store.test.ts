/**
 * Wave 0 RED test scaffold for RECALL-01 / RECALL-02.
 *
 * These tests pin the contract for the message_embeddings store module
 * BEFORE implementation exists. They must fail until store.ts and the
 * message_embeddings table DDL in db-schema.ts are created.
 *
 * Contract:
 *   - upsertEmbedding(db, messageId, vector, model) inserts a row
 *   - A second upsert for the same message_id updates (no duplicate)
 *   - getEmbedding(db, messageId) round-trips the vector as number[]
 *   - messagesNeedingEmbedding(db, limit) returns ids of messages with no embedding row
 */

import { describe, it, expect, afterEach } from "vitest";
import type Database from "better-sqlite3";

// These imports will fail (Cannot find module) until store.ts is implemented — RED
import { upsertEmbedding, getEmbedding, messagesNeedingEmbedding } from "../store";
import { getDb, closeDb } from "@/lib/db";

function insertTestMessage(db: Database.Database, sessionId: string, n: number): number {
  const stmt = db.prepare(
    `INSERT INTO messages(session_id, project, agent_id, role, content, timestamp, visibility, policy)
     VALUES(?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const result = stmt.run(
    sessionId,
    "test-project",
    "test-agent",
    "user",
    `message ${n}`,
    new Date().toISOString(),
    "public_approved",
    "indexable"
  );
  return result.lastInsertRowid as number;
}

describe("message_embeddings store (RECALL-02)", () => {
  afterEach(() => {
    closeDb();
  });

  it("upsertEmbedding inserts a row for a new message_id", () => {
    const db = getDb();
    const msgId = insertTestMessage(db, `sess-${Date.now()}-a`, 1);
    const vector = [0.1, 0.2, 0.3, 0.4];

    upsertEmbedding(db, msgId, vector, "nomic-embed-text");

    const row = db
      .prepare("SELECT message_id, model, dim FROM message_embeddings WHERE message_id = ?")
      .get(msgId) as { message_id: number; model: string; dim: number } | undefined;

    expect(row).toBeDefined();
    expect(row!.message_id).toBe(msgId);
    expect(row!.model).toBe("nomic-embed-text");
    expect(row!.dim).toBe(4);
  });

  it("upsertEmbedding stores source provenance and inherited label version", () => {
    const db = getDb();
    const msgId = insertTestMessage(db, `sess-${Date.now()}-prov`, 101);

    upsertEmbedding(db, msgId, [0.2, 0.4], "nomic-embed-text", {
      artifactId: "artifact-1",
      sourceSpan: "line:1-2",
      modality: "text",
      modelVersion: "nomic-embed-text@2026-05",
      labelVersion: 3,
    });

    const row = db
      .prepare(
        `SELECT artifact_id, source_span, modality, model_version, label_version
         FROM message_embeddings WHERE message_id = ?`
      )
      .get(msgId) as {
      artifact_id: string | null;
      source_span: string | null;
      modality: string;
      model_version: string | null;
      label_version: number;
    };

    expect(row).toEqual({
      artifact_id: "artifact-1",
      source_span: "line:1-2",
      modality: "text",
      model_version: "nomic-embed-text@2026-05",
      label_version: 3,
    });
  });


  it("upsertEmbedding updates (no duplicate) on a second call for the same message_id", () => {
    const db = getDb();
    const msgId = insertTestMessage(db, `sess-${Date.now()}-b`, 2);

    upsertEmbedding(db, msgId, [0.1, 0.2], "nomic-embed-text");
    upsertEmbedding(db, msgId, [0.9, 0.8], "nomic-embed-text");

    const rows = db
      .prepare("SELECT COUNT(*) as cnt FROM message_embeddings WHERE message_id = ?")
      .get(msgId) as { cnt: number };

    expect(rows.cnt).toBe(1); // no duplicate
  });

  it("getEmbedding round-trips the vector back to number[]", () => {
    const db = getDb();
    const msgId = insertTestMessage(db, `sess-${Date.now()}-c`, 3);
    const vector = [0.1, 0.2, 0.3, 0.4, 0.5];

    upsertEmbedding(db, msgId, vector, "nomic-embed-text");
    const retrieved = getEmbedding(db, msgId);

    expect(retrieved).not.toBeNull();
    expect(retrieved).toHaveLength(vector.length);
    // Float32 round-trip loses some precision — use toBeCloseTo
    vector.forEach((v, i) => {
      expect(retrieved![i]).toBeCloseTo(v, 5);
    });
  });

  it("getEmbedding returns null for a message with no embedding", () => {
    const db = getDb();
    const msgId = insertTestMessage(db, `sess-${Date.now()}-d`, 4);

    const result = getEmbedding(db, msgId);
    expect(result).toBeNull();
  });

  it("messagesNeedingEmbedding returns ids of messages without an embedding row", () => {
    const db = getDb();
    const session = `sess-${Date.now()}-e`;

    const id1 = insertTestMessage(db, session, 10);
    const id2 = insertTestMessage(db, session, 11);
    const id3 = insertTestMessage(db, session, 12);

    // Embed only id1
    upsertEmbedding(db, id1, [0.1, 0.2], "nomic-embed-text");

    const needsEmbedding = messagesNeedingEmbedding(db, 100);

    expect(needsEmbedding).toContain(id2);
    expect(needsEmbedding).toContain(id3);
    expect(needsEmbedding).not.toContain(id1);
  });

  it("messagesNeedingEmbedding respects the limit parameter", () => {
    const db = getDb();
    const session = `sess-${Date.now()}-f`;

    for (let i = 0; i < 5; i++) {
      insertTestMessage(db, session, i + 100);
    }

    const needsEmbedding = messagesNeedingEmbedding(db, 2);
    expect(needsEmbedding.length).toBeLessThanOrEqual(2);
  });

  it("messagesNeedingEmbedding skips private sealed messages", () => {
    const db = getDb();
    const publicId = insertTestMessage(db, `sess-${Date.now()}-g`, 201);
    const privateId = db.prepare(
      `INSERT INTO messages(session_id, project, agent_id, role, content, timestamp, visibility, policy)
       VALUES(?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      `sess-${Date.now()}-g`,
      "test-project",
      "test-agent",
      "user",
      "private message",
      new Date().toISOString(),
      "private",
      "sealed"
    ).lastInsertRowid as number;

    const needsEmbedding = messagesNeedingEmbedding(db, 100);

    expect(needsEmbedding).toContain(publicId);
    expect(needsEmbedding).not.toContain(privateId);
  });

  it("messagesNeedingEmbedding skips blank messages that cannot produce useful vectors", () => {
    const db = getDb();
    const session = `sess-${Date.now()}-h`;
    const blankId = db.prepare(
      `INSERT INTO messages(session_id, project, agent_id, role, content, timestamp, visibility, policy)
       VALUES(?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      session,
      "test-project",
      "test-agent",
      "user",
      "   \n\t",
      new Date().toISOString(),
      "public_approved",
      "indexable"
    ).lastInsertRowid as number;
    const contentId = insertTestMessage(db, session, 301);

    const needsEmbedding = messagesNeedingEmbedding(db, 100);

    expect(needsEmbedding).toContain(contentId);
    expect(needsEmbedding).not.toContain(blankId);
  });
});
