// @vitest-environment node
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

import { CURRENT_SCHEMA_VERSION, initSchema } from "@/lib/db-schema";

describe("migration 40 — polymorphic memory salience", () => {
  it("preserves legacy message salience and admits agent records", () => {
    const db = new Database(":memory:");
    initSchema(db);

    const messageId = Number(
      db.prepare(
        `INSERT INTO messages (session_id, project, agent_id, role, content, timestamp)
         VALUES ('salience-session', 'SAVEQ', 'agent-1', 'assistant', 'legacy memory', '2026-08-04T00:00:00Z')`
      ).run().lastInsertRowid
    );

    db.exec(`
      DROP INDEX memory_salience_message_id;
      DROP INDEX memory_salience_record;
      DROP INDEX memory_salience_tier;
      DROP INDEX memory_salience_record_type;
      DROP TABLE memory_salience;
      CREATE TABLE memory_salience (
        message_id INTEGER PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE,
        tier TEXT NOT NULL DEFAULT 'mid',
        salience_score REAL NOT NULL DEFAULT 1.0,
        access_count INTEGER NOT NULL DEFAULT 0,
        last_accessed TEXT,
        last_decay_at TEXT NOT NULL DEFAULT '2026-08-01T00:00:00Z',
        created_at TEXT NOT NULL DEFAULT '2026-08-01T00:00:00Z'
      );
      INSERT INTO memory_salience (message_id, tier, salience_score, access_count)
      VALUES (${messageId}, 'high', 0.82, 3);
      PRAGMA user_version = 39;
    `);

    initSchema(db);

    expect(db.pragma("user_version", { simple: true })).toBe(CURRENT_SCHEMA_VERSION);
    expect(db.prepare("SELECT message_id, record_type, record_id, salience_score, access_count FROM memory_salience").get())
      .toEqual({ message_id: messageId, record_type: "message", record_id: String(messageId), salience_score: 0.82, access_count: 3 });

    db.prepare(
      `INSERT INTO memory_salience (record_type, record_id, tier, salience_score)
       VALUES ('agent_memory_write', '17', 'mid', 0.7)`
    ).run();
    expect(db.prepare("SELECT record_type, record_id FROM memory_salience WHERE record_id = '17'").get())
      .toEqual({ record_type: "agent_memory_write", record_id: "17" });

    db.close();
  });
});
