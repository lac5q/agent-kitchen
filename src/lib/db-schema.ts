import type Database from 'better-sqlite3';

/**
 * Initializes the SQLite schema for the conversation store.
 * All DDL uses CREATE IF NOT EXISTS — safe to call on every startup.
 */
export function initSchema(db: Database.Database): void {
  // messages: primary conversation store
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id          INTEGER PRIMARY KEY,
      session_id  TEXT    NOT NULL,
      project     TEXT    NOT NULL,
      agent_id    TEXT    NOT NULL,
      role        TEXT    NOT NULL,
      content     TEXT    NOT NULL,
      timestamp   TEXT    NOT NULL,
      cwd         TEXT,
      git_branch  TEXT,
      request_id  TEXT,
      UNIQUE(session_id, request_id)
    );
  `);

  // messages_fts: FTS5 external-content table pointing at messages
  // external content avoids duplicating large text in the FTS index
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts
      USING fts5(
        content,
        project UNINDEXED,
        timestamp UNINDEXED,
        agent_id UNINDEXED,
        content=messages,
        content_rowid=id,
        tokenize='unicode61'
      );
  `);

  // AFTER INSERT trigger keeps FTS index in sync with messages table
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
      INSERT INTO messages_fts(rowid, content, project, timestamp, agent_id)
      VALUES (new.id, new.content, new.project, new.timestamp, new.agent_id);
    END;
  `);

  // ingest_meta: tracks JSONL file state for incremental ingestion
  db.exec(`
    CREATE TABLE IF NOT EXISTS ingest_meta (
      file_path   TEXT PRIMARY KEY,
      mtime_ms    INTEGER NOT NULL,
      file_size   INTEGER NOT NULL,
      row_count   INTEGER NOT NULL DEFAULT 0,
      ingested_at TEXT    NOT NULL
    );
  `);

  // meta: key-value store for last_ingest_ts, last_recall_query, etc.
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key   TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  // hive_actions: append-only cross-agent action log (HIVE-01, HIVE-02, HIVE-05)
  db.exec(`
    CREATE TABLE IF NOT EXISTS hive_actions (
      id          INTEGER PRIMARY KEY,
      agent_id    TEXT    NOT NULL,
      action_type TEXT    NOT NULL
                  CHECK(action_type IN ('continue','loop','checkpoint','trigger','stop','error')),
      summary     TEXT    NOT NULL,
      artifacts   TEXT,
      session_id  TEXT,
      timestamp   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );
    CREATE INDEX IF NOT EXISTS hive_actions_agent_ts
      ON hive_actions(agent_id, timestamp DESC);
  `);

  // hive_actions_fts: FTS5 external-content table (same pattern as messages_fts)
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS hive_actions_fts
      USING fts5(
        summary,
        agent_id    UNINDEXED,
        action_type UNINDEXED,
        timestamp   UNINDEXED,
        content=hive_actions,
        content_rowid=id,
        tokenize='unicode61'
      );
  `);

  // AFTER INSERT trigger keeps FTS index in sync with hive_actions
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS hive_actions_ai AFTER INSERT ON hive_actions BEGIN
      INSERT INTO hive_actions_fts(rowid, summary, agent_id, action_type, timestamp)
      VALUES (new.id, new.summary, new.agent_id, new.action_type, new.timestamp);
    END;
  `);

  // AFTER DELETE trigger for FTS cleanup (hive_actions is append-only, but ensures correctness)
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS hive_actions_ad AFTER DELETE ON hive_actions BEGIN
      INSERT INTO hive_actions_fts(hive_actions_fts, rowid, summary, agent_id, action_type, timestamp)
      VALUES ('delete', old.id, old.summary, old.agent_id, old.action_type, old.timestamp);
    END;
  `);

  // hive_delegations: mutable task tracking with checkpoint recovery (HIVE-03)
  db.exec(`
    CREATE TABLE IF NOT EXISTS hive_delegations (
      id            INTEGER PRIMARY KEY,
      task_id       TEXT    NOT NULL UNIQUE,
      from_agent    TEXT    NOT NULL,
      to_agent      TEXT    NOT NULL,
      task_summary  TEXT    NOT NULL,
      priority      INTEGER NOT NULL DEFAULT 5,
      status        TEXT    NOT NULL DEFAULT 'pending'
                    CHECK(status IN ('pending','active','paused','completed','failed')),
      checkpoint    TEXT,
      created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      updated_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );
    CREATE INDEX IF NOT EXISTS hive_delegations_to_agent
      ON hive_delegations(to_agent, status);
  `);
}
