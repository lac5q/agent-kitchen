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

  // memory_salience: tracks tier, decay score, and access resistance per message (MEM-02)
  db.exec(`
    CREATE TABLE IF NOT EXISTS memory_salience (
      message_id     INTEGER PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE,
      tier           TEXT    NOT NULL DEFAULT 'mid'
                     CHECK(tier IN ('pinned','high','mid','low')),
      salience_score REAL    NOT NULL DEFAULT 1.0
                     CHECK(salience_score >= 0.0 AND salience_score <= 1.0),
      access_count   INTEGER NOT NULL DEFAULT 0,
      last_accessed  TEXT,
      last_decay_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      created_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );
    CREATE INDEX IF NOT EXISTS memory_salience_tier
      ON memory_salience(tier, last_decay_at);
  `);

  // memory_consolidation_runs: audit log of consolidation runs (MEM-01)
  db.exec(`
    CREATE TABLE IF NOT EXISTS memory_consolidation_runs (
      id               INTEGER PRIMARY KEY,
      started_at       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      completed_at     TEXT,
      batch_size       INTEGER NOT NULL DEFAULT 0,
      insights_written INTEGER NOT NULL DEFAULT 0,
      status           TEXT    NOT NULL DEFAULT 'running'
                       CHECK(status IN ('running','completed','failed')),
      error_message    TEXT
    );
  `);

  // memory_meta_insights: LLM-extracted patterns/contradictions/summaries (MEM-01)
  db.exec(`
    CREATE TABLE IF NOT EXISTS memory_meta_insights (
      id           INTEGER PRIMARY KEY,
      run_id       INTEGER NOT NULL REFERENCES memory_consolidation_runs(id),
      insight_type TEXT    NOT NULL
                   CHECK(insight_type IN ('pattern','contradiction','summary')),
      content      TEXT    NOT NULL,
      source_ids   TEXT    NOT NULL,
      created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );
  `);

  // Additive migration: add consolidated column to messages (safe on re-run)
  try {
    db.exec('ALTER TABLE messages ADD COLUMN consolidated INTEGER NOT NULL DEFAULT 0');
  } catch {
    // Column already exists -- safe to ignore on subsequent startups
  }

  // Additive migration: add context_id to hive_delegations (dispatch chain grouping)
  try {
    db.exec('ALTER TABLE hive_delegations ADD COLUMN context_id TEXT');
  } catch {
    // Column already exists
  }

  // Additive migration: add result to hive_delegations (terminal payload storage)
  try {
    db.exec('ALTER TABLE hive_delegations ADD COLUMN result TEXT');
  } catch {
    // Column already exists
  }

  // One-shot migration: rebuild hive_delegations CHECK constraint to add 'canceled' status.
  // Guarded by meta flag -- SQLite cannot ALTER a CHECK constraint in place.
  const migrated = db
    .prepare(`SELECT value FROM meta WHERE key = 'hive_delegations_v2_migrated'`)
    .get() as { value: string } | undefined;
  if (!migrated) {
    db.exec(`
      CREATE TABLE hive_delegations_new (
        id            INTEGER PRIMARY KEY,
        task_id       TEXT    NOT NULL UNIQUE,
        from_agent    TEXT    NOT NULL,
        to_agent      TEXT    NOT NULL,
        task_summary  TEXT    NOT NULL,
        priority      INTEGER NOT NULL DEFAULT 5,
        status        TEXT    NOT NULL DEFAULT 'pending'
                      CHECK(status IN ('pending','active','paused','completed','failed','canceled')),
        checkpoint    TEXT,
        context_id    TEXT,
        result        TEXT,
        created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
        updated_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
      );
      INSERT INTO hive_delegations_new
        SELECT id, task_id, from_agent, to_agent, task_summary, priority, status,
               checkpoint, context_id, result, created_at, updated_at
        FROM hive_delegations;
      DROP TABLE hive_delegations;
      ALTER TABLE hive_delegations_new RENAME TO hive_delegations;
    `);
    db.prepare(`INSERT OR REPLACE INTO meta(key,value) VALUES('hive_delegations_v2_migrated','1')`).run();
  }

  // Indexes for dispatch query patterns
  db.exec(`
    CREATE INDEX IF NOT EXISTS hive_delegations_context
      ON hive_delegations(context_id);
    CREATE INDEX IF NOT EXISTS hive_delegations_status_priority
      ON hive_delegations(status, priority DESC, created_at ASC);
  `);

  // One-time salience seed: ensures every existing message has a salience row
  db.exec('INSERT OR IGNORE INTO memory_salience(message_id) SELECT id FROM messages');

  // audit_log: immutable record of all significant agent actions (SEC-02)
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id        INTEGER PRIMARY KEY,
      actor     TEXT    NOT NULL,
      action    TEXT    NOT NULL,
      target    TEXT    NOT NULL,
      detail    TEXT,
      severity  TEXT    NOT NULL DEFAULT 'info'
                CHECK(severity IN ('info','medium','high')),
      timestamp TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );
    CREATE INDEX IF NOT EXISTS audit_log_ts
      ON audit_log(timestamp DESC);
  `);

  // recall_log: time-series tracking of recall queries (ANA-04)
  db.exec(`
    CREATE TABLE IF NOT EXISTS recall_log (
      id        INTEGER PRIMARY KEY,
      query     TEXT    NOT NULL,
      results   INTEGER NOT NULL DEFAULT 0,
      timestamp TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );
    CREATE INDEX IF NOT EXISTS recall_log_ts ON recall_log(timestamp);
  `);
}
