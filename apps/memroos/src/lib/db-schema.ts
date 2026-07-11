import { createHash } from 'crypto';
import type Database from 'better-sqlite3';

import { initBehavioralJobSchema } from './seal/behavioral-schema';
import { assertNotDefaultInternalApiKey } from './internal-api-key';

const LABEL_TABLES = [
  "messages",
  "audit_log",
  "hive_actions",
  "agent_memory_writes",
  "recall_log",
] as const;

function addSecurityLabelColumns(db: Database.Database): void {
  for (const table of LABEL_TABLES) {
    for (const statement of [
      `ALTER TABLE ${table} ADD COLUMN visibility TEXT NOT NULL DEFAULT 'private'`,
      `ALTER TABLE ${table} ADD COLUMN domain TEXT`,
      `ALTER TABLE ${table} ADD COLUMN sensitivity TEXT`,
      `ALTER TABLE ${table} ADD COLUMN policy TEXT NOT NULL DEFAULT 'sealed'`,
    ]) {
      try {
        db.exec(statement);
      } catch {
        // Column already exists -- additive migration is safe to re-run.
      }
    }
  }
}

function addEmbeddingProvenanceColumns(db: Database.Database): void {
  for (const statement of [
    "ALTER TABLE message_embeddings ADD COLUMN artifact_id TEXT",
    "ALTER TABLE message_embeddings ADD COLUMN source_span TEXT",
    "ALTER TABLE message_embeddings ADD COLUMN modality TEXT NOT NULL DEFAULT 'text'",
    "ALTER TABLE message_embeddings ADD COLUMN model_version TEXT",
    "ALTER TABLE message_embeddings ADD COLUMN label_version INTEGER NOT NULL DEFAULT 1",
  ]) {
    try {
      db.exec(statement);
    } catch {
      // Column already exists -- additive migration is safe to re-run.
    }
  }
}

function addSkillForgeTraceabilityColumns(db: Database.Database): void {
  for (const statement of [
    "ALTER TABLE skillforge_proposals ADD COLUMN edit_hash TEXT",
    "ALTER TABLE skillforge_proposals ADD COLUMN validation_split_id TEXT",
    "ALTER TABLE skillforge_proposals ADD COLUMN held_out_split_id TEXT",
    "ALTER TABLE skillforge_proposals ADD COLUMN baseline_w REAL",
    "ALTER TABLE skillforge_proposals ADD COLUMN validation_w REAL",
    "ALTER TABLE skillforge_proposals ADD COLUMN held_out_w REAL",
    "ALTER TABLE skillforge_proposals ADD COLUMN evaluator_receipts TEXT NOT NULL DEFAULT '[]'",
    "ALTER TABLE skillforge_proposals ADD COLUMN typed_edit_ops TEXT NOT NULL DEFAULT '[]'",
  ]) {
    try {
      db.exec(statement);
    } catch {
      // Column already exists -- additive migration is safe to re-run.
    }
  }
}

export const CURRENT_SCHEMA_VERSION = 11;

type SchemaMigration = {
  version: number;
  name: string;
  up: (db: Database.Database) => void;
};

export function getSchemaVersion(db: Database.Database): number {
  const version = db.pragma('user_version', { simple: true });
  return typeof version === 'number' ? version : Number(version);
}

function setSchemaVersion(db: Database.Database, version: number): void {
  if (!Number.isInteger(version) || version < 0) {
    throw new Error(`Invalid SQLite schema version: ${version}`);
  }
  db.pragma(`user_version = ${version}`);
}

const SCHEMA_MIGRATIONS: SchemaMigration[] = [
  {
    version: 1,
    name: 'baseline-additive-schema',
    up: applyCurrentSchema,
  },
  {
    version: 2,
    name: 'efficiency-telemetry-events',
    up: applyEfficiencyTelemetrySchema,
  },
  {
    version: 3,
    name: 'belief-stage-promotion',
    up: applyBeliefStagePromotionSchema,
  },
  {
    version: 4,
    name: 'spaces-and-team-scale-access',
    up: applySpacesAndTeamScaleAccessSchema,
  },
  {
    version: 5,
    name: 'identity-lifecycle-and-owner-gates',
    up: applyIdentityLifecycleAndOwnerGatesSchema,
  },
  {
    version: 6,
    name: 'active-workspace',
    up: applyActiveWorkspaceSchema,
  },
  {
    version: 7,
    name: 'write-rules-and-document-directory',
    up: applyWriteRulesAndDocumentDirectorySchema,
  },
  {
    version: 8,
    name: 'shared-space-toggle',
    up: applySharedSpaceSchema,
  },
  {
    version: 9,
    name: 'per-space-cache-invalidation-surface',
    up: applySpaceCacheSchema,
  },
  {
    version: 10,
    name: 'save-artifact-gate-auto-readme',
    up: applyArtifactGateSchema,
  },
  {
    version: 11,
    name: 'skill-trust-chain-enhanced-contracts',
    up: applySkillTrustChainSchema,
  },
];

function runSchemaMigrations(db: Database.Database): void {
  const currentVersion = getSchemaVersion(db);
  if (currentVersion > CURRENT_SCHEMA_VERSION) {
    throw new Error(
      `SQLite schema version ${currentVersion} is newer than this code supports (${CURRENT_SCHEMA_VERSION})`
    );
  }

  const migrations = [...SCHEMA_MIGRATIONS].sort((a, b) => a.version - b.version);
  for (const migration of migrations) {
    if (migration.version <= currentVersion) continue;
    db.transaction(() => {
      migration.up(db);
      setSchemaVersion(db, migration.version);
    })();
  }
}

export function rebuildMessageFtsProjection(db: Database.Database): void {
  db.exec(`
    INSERT INTO messages_fts(messages_fts) VALUES('delete-all');
    INSERT INTO messages_fts(rowid, content, project, timestamp, agent_id)
    SELECT id, content, project, timestamp, agent_id
    FROM messages
    WHERE policy = 'indexable'
      AND visibility IN ('internal','public_safe','public_approved');
  `);
}

/**
 * Initializes the SQLite schema for the conversation store.
 * Schema changes are ordered and stamped through PRAGMA user_version.
 */
export function initSchema(db: Database.Database): void {
  runSchemaMigrations(db);
}

function applyEfficiencyTelemetrySchema(db: Database.Database): void {
  try {
    db.exec("ALTER TABLE agent_memory_traces ADD COLUMN agent_id TEXT");
  } catch {
    // Column already exists -- additive migration is safe to re-run.
  }

  db.exec(`
    -- Phase 117: NOC efficiency telemetry event foundation (EFFTEL-01..05)
    CREATE TABLE IF NOT EXISTS efficiency_events (
      id          INTEGER PRIMARY KEY,
      tenant_id   TEXT    NOT NULL DEFAULT 'default-tenant'
                           REFERENCES tenants(id),
      event_type  TEXT    NOT NULL CHECK(event_type IN (
        'retrieval_trace',
        'source_read',
        'token_ledger',
        'operator_question',
        'memory_write'
      )),
      task_id     TEXT,
      agent_id    TEXT,
      payload     TEXT    NOT NULL DEFAULT '{}',
      created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );
    CREATE INDEX IF NOT EXISTS efficiency_events_type_ts
      ON efficiency_events(tenant_id, event_type, created_at DESC);
    CREATE INDEX IF NOT EXISTS efficiency_events_task
      ON efficiency_events(tenant_id, task_id, created_at DESC);
  `);
}

function addBeliefStageColumns(db: Database.Database): void {
  // Additive ALTERs on agent_memory_candidates. Mirrors the existing
  // try/catch idempotency pattern for additive columns in this file.
  for (const statement of [
    `ALTER TABLE agent_memory_candidates ADD COLUMN belief_stage TEXT NOT NULL DEFAULT 'silver_candidate_claim'`,
    `ALTER TABLE agent_memory_candidates ADD COLUMN promoted_at TEXT`,
    `ALTER TABLE agent_memory_candidates ADD COLUMN promoted_by TEXT`,
    `ALTER TABLE agent_memory_candidates ADD COLUMN demoted_at TEXT`,
    `ALTER TABLE agent_memory_candidates ADD COLUMN demotion_reason TEXT`,
  ]) {
    try {
      db.exec(statement);
    } catch {
      // Column already exists -- additive migration is safe to re-run.
    }
  }
}

function applyBeliefStagePromotionSchema(db: Database.Database): void {
  // Phase 122: belief-stage promotion pipeline (BELIEF-PROMO-01..08).
  // Migration v3 wires the silver -> gold pipeline:
  //   - additive belief_stage + provenance columns on agent_memory_candidates
  //   - belief_promotion_decisions: append-only receipt log (hash-chained)
  //   - belief_review_queue: human-review queue for high-stakes categories
  // Receipts are append-only; UPDATE/DELETE forbidden via code convention.
  // Receipt metadata contains hashes + ids only -- no raw candidate content.
  addBeliefStageColumns(db);

  db.exec(`
    CREATE TABLE IF NOT EXISTS belief_promotion_decisions (
      id                  TEXT    PRIMARY KEY,
      tenant_id           TEXT    NOT NULL DEFAULT 'default-tenant'
                              REFERENCES tenants(id),
      candidate_id        TEXT    NOT NULL
                          REFERENCES agent_memory_candidates(id) ON DELETE CASCADE,
      decision_type       TEXT    NOT NULL
                          CHECK(decision_type IN (
                            'promoted','demoted','queued_for_review','review_approved','review_rejected',
                            'admission_denied'
                          )),
      category            TEXT    NOT NULL,
      actor_id            TEXT,
      actor_role          TEXT    NOT NULL,
      from_stage          TEXT    NOT NULL,
      to_stage            TEXT    NOT NULL,
      reason              TEXT,
      metadata_json       TEXT    NOT NULL DEFAULT '{}',
      previous_entry_hash TEXT,
      entry_hash          TEXT    NOT NULL,
      created_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );
    CREATE INDEX IF NOT EXISTS belief_promotion_decisions_candidate
      ON belief_promotion_decisions(tenant_id, candidate_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS belief_promotion_decisions_tenant_chain
      ON belief_promotion_decisions(tenant_id, created_at ASC);
    CREATE INDEX IF NOT EXISTS belief_promotion_decisions_type
      ON belief_promotion_decisions(tenant_id, decision_type, created_at DESC);

    CREATE TABLE IF NOT EXISTS belief_review_queue (
      id              TEXT    PRIMARY KEY,
      tenant_id       TEXT    NOT NULL DEFAULT 'default-tenant'
                      REFERENCES tenants(id),
      candidate_id    TEXT    NOT NULL
                      REFERENCES agent_memory_candidates(id) ON DELETE CASCADE,
      category        TEXT    NOT NULL,
      status          TEXT    NOT NULL DEFAULT 'open'
                      CHECK(status IN ('open','approved','rejected')),
      opened_by       TEXT,
      resolved_by     TEXT,
      resolution_note TEXT,
      opened_at       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      resolved_at     TEXT
    );
    CREATE INDEX IF NOT EXISTS belief_review_queue_open
      ON belief_review_queue(tenant_id, status, opened_at DESC);
    CREATE INDEX IF NOT EXISTS belief_review_queue_candidate
      ON belief_review_queue(candidate_id);
  `);

  // Backfill belief_stage for any rows already present in
  // agent_memory_candidates created before v3. Bronze -> silver default
  // is enforced at the column level; existing rows simply inherit it.
  // No data loss: a candidate only ever moves bronze -> silver -> gold
  // through the promotion pipeline, never via the default.
}

function applySpacesAndTeamScaleAccessSchema(db: Database.Database): void {
  // Phase 130 / TEAMSCALE-01: spaces + space_members + messages.space_id.
  //
  // Spaces are the team-scale scoping unit. Each space belongs to a tenant,
  // and humans/agents become members. The messages.space_id column is the
  // row-level scope on the conversation store; existing rows remain valid
  // because the column is nullable, and `filterBySpace` falls back to the
  // legacy `project` column for backward compatibility.
  db.exec(`
    CREATE TABLE IF NOT EXISTS spaces (
      id                   TEXT PRIMARY KEY,
      tenant_id            TEXT NOT NULL DEFAULT 'default-tenant'
                           REFERENCES tenants(id) ON DELETE CASCADE,
      name                 TEXT NOT NULL,
      default_labels_json  TEXT NOT NULL DEFAULT '{}',
      created_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );
    CREATE INDEX IF NOT EXISTS spaces_tenant ON spaces(tenant_id);
    CREATE UNIQUE INDEX IF NOT EXISTS spaces_tenant_name ON spaces(tenant_id, name);

    CREATE TABLE IF NOT EXISTS space_members (
      space_id    TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
      member_id   TEXT NOT NULL,
      member_type TEXT NOT NULL CHECK(member_type IN ('human', 'agent')),
      role        TEXT NOT NULL DEFAULT 'member',
      created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      PRIMARY KEY (space_id, member_id)
    );
    CREATE INDEX IF NOT EXISTS space_members_member ON space_members(member_id);
  `);

  // Additive: nullable space_id on messages. Existing rows stay NULL;
  // filterBySpace falls back to project-name matching when space_id is null.
  try {
    db.exec('ALTER TABLE messages ADD COLUMN space_id TEXT REFERENCES spaces(id) ON DELETE SET NULL');
  } catch {
    // Column already exists -- additive migration is safe to re-run.
  }
  try {
    db.exec('CREATE INDEX IF NOT EXISTS messages_space ON messages(space_id)');
  } catch {
    // Index already exists -- safe to ignore.
  }
}

function applyIdentityLifecycleAndOwnerGatesSchema(db: Database.Database): void {
  // Phase 131 / TEAMSCALE-02..06: identity lifecycle + delegation + NOC + owner gates.
  //
  // This migration is purely additive. It creates:
  //   - agent_owners: nullable ownership linkage on registered_agents so the
  //     lifecycle code can identify "orphaned" agents (live key, owner gone).
  //   - owner_gate_approvals: standing + per-use approval grants on assets.
  // Both tables are referenced from new code in src/lib/identity/*. The
  // migration is idempotent (CREATE TABLE IF NOT EXISTS / try/catch on
  // ALTER) so it is safe to re-run on already-migrated databases.

  // Additive: nullable owner_id on registered_agents. Existing rows stay NULL.
  try {
    db.exec("ALTER TABLE registered_agents ADD COLUMN owner_id TEXT REFERENCES users(id) ON DELETE SET NULL");
  } catch {
    // Column already exists -- additive migration is safe to re-run.
  }

  db.exec(`
    -- owner_gate_approvals: standing or per-use grants from an asset owner.
    --   approval_mode = 'standing'   -> allows any agent (agent_id NULL)
    --   approval_mode = 'per_use'    -> scoped to a specific agent_id
    -- Both modes honor revoked_at: a row with revoked_at NOT NULL is inactive.
    CREATE TABLE IF NOT EXISTS owner_gate_approvals (
      id            INTEGER PRIMARY KEY,
      tenant_id     TEXT    NOT NULL DEFAULT 'default-tenant'
                    REFERENCES tenants(id) ON DELETE CASCADE,
      owner_id      TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      asset_type    TEXT    NOT NULL,
      asset_id      TEXT    NOT NULL,
      approval_mode TEXT    NOT NULL
                    CHECK(approval_mode IN ('standing','per_use')),
      agent_id      TEXT    REFERENCES registered_agents(id) ON DELETE CASCADE,
      created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      revoked_at    TEXT
    );
    CREATE INDEX IF NOT EXISTS owner_gate_approvals_asset
      ON owner_gate_approvals(asset_type, asset_id, revoked_at);
    CREATE INDEX IF NOT EXISTS owner_gate_approvals_owner
      ON owner_gate_approvals(owner_id, revoked_at);
    CREATE INDEX IF NOT EXISTS owner_gate_approvals_agent
      ON owner_gate_approvals(agent_id, revoked_at);
  `);
}

function applyActiveWorkspaceSchema(db: Database.Database): void {
  // Phase 137 / WORKLOAD-01..05: single-load workspace foundation.
  //
  // One row per "load workspace" event. The "active" workspace is the row
  // with cleared_at IS NULL (only one is allowed at a time -- loadWorkspace
  // marks the previous row cleared before inserting a new one). Headless
  // runs surface via is_headless=1 so downstream tooling can distinguish
  // automatic loads from interactive ones.
  db.exec(`
    CREATE TABLE IF NOT EXISTS active_workspace (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      space_id    TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
      loaded_by   TEXT NOT NULL,
      loaded_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      is_headless INTEGER NOT NULL DEFAULT 0,
      cleared_at  TEXT
    );
    CREATE INDEX IF NOT EXISTS active_workspace_active
      ON active_workspace(cleared_at) WHERE cleared_at IS NULL;
    CREATE INDEX IF NOT EXISTS active_workspace_space
      ON active_workspace(space_id, loaded_at DESC);
  `);
}

function applyWriteRulesAndDocumentDirectorySchema(db: Database.Database): void {
  // Phase 138 / WRITERULES-01..06: operator-visible write rules + document directory.
  //
  // write_rules: per-space routing rules that map a data_type to a target
  // document. When an agent writes memory, resolveWriteTarget consults these
  // rules to decide where the write lands. fallback_rule='reject' blocks
  // unmatched writes; 'default_doc' routes them to a configured fallback.
  //
  // document_directory: per-space catalog of named documents with optional
  // resource_id pointers and human-readable purposes. Entries are the
  // targets referenced by write_rules.target_document.
  //
  // Both tables use optimistic locking via a version column that is
  // incremented on every update. All mutations write to audit_entries for
  // the run ledger.
  db.exec(`
    CREATE TABLE IF NOT EXISTS write_rules (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      space_id      TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
      data_type     TEXT NOT NULL,
      target_document TEXT NOT NULL,
      fallback_rule TEXT NOT NULL DEFAULT 'reject' CHECK(fallback_rule IN ('reject','default_doc')),
      version       INTEGER NOT NULL DEFAULT 1,
      created_by    TEXT NOT NULL,
      created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      updated_at    TEXT,
      updated_by    TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS write_rules_space_type ON write_rules(space_id, data_type);
    CREATE INDEX IF NOT EXISTS write_rules_space ON write_rules(space_id);

    CREATE TABLE IF NOT EXISTS document_directory (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      space_id      TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
      name          TEXT NOT NULL,
      purpose       TEXT,
      resource_id   TEXT,
      version       INTEGER NOT NULL DEFAULT 1,
      created_by    TEXT NOT NULL,
      created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      updated_at    TEXT,
      updated_by    TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS document_directory_space_name ON document_directory(space_id, name);
    CREATE INDEX IF NOT EXISTS document_directory_space ON document_directory(space_id);
  `);
}

function applySharedSpaceSchema(db: Database.Database): void {
  // Phase 139 / SHAREDRO-01..03: is_shared read-only toggle on spaces.
  //
  // A space with is_shared=1 is treated as read-only for writes
  // (assertWritableSpace throws) and records a policy receipt for every
  // read (assertReadableSpace writes an audit_entries row). Both columns
  // are additive and idempotent: re-running the migration on an
  // already-migrated database is a no-op.
  try {
    db.exec("ALTER TABLE spaces ADD COLUMN is_shared INTEGER NOT NULL DEFAULT 0");
  } catch {
    // Column already exists -- additive migration is safe to re-run.
  }
  try {
    db.exec("ALTER TABLE spaces ADD COLUMN shared_reason TEXT");
  } catch {
    // Column already exists -- additive migration is safe to re-run.
  }
}

function applySpaceCacheSchema(db: Database.Database): void {
  // Phase 140 / CACHEADMIN-01..05: per-space cache + invalidation surface.
  //
  // Tracks per-resource cache state for each space and records
  // invalidation events in audit_entries for operator visibility.
  // All DDL is idempotent (CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS).
  db.exec(`
    CREATE TABLE IF NOT EXISTS space_cache_state (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      space_id        TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
      resource_id     TEXT NOT NULL,
      last_fetched    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      cached_size     INTEGER NOT NULL DEFAULT 0,
      retrieval_count INTEGER NOT NULL DEFAULT 0,
      invalidated_at  TEXT,
      UNIQUE(space_id, resource_id)
    );
    CREATE INDEX IF NOT EXISTS space_cache_state_space ON space_cache_state(space_id);
  `);
}

function applyArtifactGateSchema(db: Database.Database): void {
  // Phase 141 / ARTGATE-01..03: save-artifact gate + auto-README update.
  //
  // space_artifact_settings holds per-space artifact-save metadata:
  //   - auto_readme_update: toggle for the auto-README-update behavior
  //     (default 1 = enabled). When enabled, saveArtifact updates the
  //     last_artifact_* pointer columns after a successful save.
  //   - last_artifact_resource_id / name / saved_at: the most recent
  //     artifact saved into this space, surfaced for README auto-update.
  //   - updated_by / updated_at: provenance for the last settings mutation.
  // All DDL is idempotent (CREATE TABLE IF NOT EXISTS).
  db.exec(`
    CREATE TABLE IF NOT EXISTS space_artifact_settings (
      space_id              TEXT PRIMARY KEY REFERENCES spaces(id) ON DELETE CASCADE,
      auto_readme_update    INTEGER NOT NULL DEFAULT 1,
      last_artifact_resource_id TEXT,
      last_artifact_name    TEXT,
      last_artifact_saved_at TEXT,
      updated_by            TEXT,
      updated_at            TEXT
    );
  `);
}

// Phase 148 / SKILLTRUST-01..02: Enhanced contracts + content hashing/signing.
//
// Migration v11 adds the `evidence_examples` column (SKILLTRUST-01) and the
// content_hash / signature / signed_by / signed_at / trust_level /
// public_key_fingerprint columns (SKILLTRUST-02). It also backfills existing
// v10 rows so dispatch remains fail-closed — any row that predates the
// evidence_examples column has `completeness_pct` lowered from 100 to 91
// (one field short) and `evidence_examples` appended to its
// `missing_fields_json` list. This keeps the SQL gate authoritative — a
// legacy complete skill without evidence_examples must score below 100 and
// be denied by lookupSkillContract. All migrations are additive and
// idempotent (try/catch swallows duplicate-column errors).
function applySkillTrustChainSchema(db: Database.Database): void {
  for (const statement of [
    "ALTER TABLE skill_registry ADD COLUMN evidence_examples TEXT",
    "ALTER TABLE skill_registry ADD COLUMN content_hash TEXT",
    "ALTER TABLE skill_registry ADD COLUMN signature TEXT",
    "ALTER TABLE skill_registry ADD COLUMN signed_by TEXT",
    "ALTER TABLE skill_registry ADD COLUMN signed_at TEXT",
    "ALTER TABLE skill_registry ADD COLUMN trust_level TEXT NOT NULL DEFAULT 'unsigned'",
    "ALTER TABLE skill_registry ADD COLUMN public_key_fingerprint TEXT",
  ]) {
    try {
      db.exec(statement);
    } catch {
      // Column already exists -- additive migration is safe to re-run.
    }
  }

  // SKILLTRUST-01 backfill: existing v10 rows whose evidence_examples column
  // was just added with the DEFAULT '' must regress below 100% completeness so
  // dispatch remains fail-closed. We touch only rows where evidence_examples
  // is empty or whitespace-only and completeness_pct was 100. Other rows are
  // left untouched.
  const rows = db
    .prepare(
      `SELECT id, completeness_pct, missing_fields_json
         FROM skill_registry
        WHERE evidence_examples IS NULL OR trim(evidence_examples) = ''`
    )
    .all() as Array<{
      id: number;
      completeness_pct: number;
      missing_fields_json: string | null;
    }>;

  if (rows.length === 0) {
    return;
  }

  const update = db.prepare(
    `UPDATE skill_registry
        SET completeness_pct = ?,
            missing_fields_json = ?
      WHERE id = ?`
  );

  for (const row of rows) {
    let missingFields: string[];
    try {
      const parsed = JSON.parse(row.missing_fields_json ?? "[]");
      missingFields = Array.isArray(parsed)
        ? parsed.filter((field): field is string => typeof field === "string")
        : [];
    } catch {
      missingFields = [];
    }

    if (!missingFields.includes("evidence_examples")) {
      missingFields.push("evidence_examples");
    }

    const completenessPct = row.completeness_pct >= 100 ? 91 : row.completeness_pct;
    update.run(completenessPct, JSON.stringify(missingFields), row.id);
  }
}

function applyCurrentSchema(db: Database.Database): void {
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
  addSecurityLabelColumns(db);

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

  // Keep FTS index triggers in sync with classification labels. Run the DDL as
  // one transaction so parallel test workers cannot interleave drop/create.
  db.transaction(() => {
    db.exec(`
    DROP TRIGGER IF EXISTS messages_ai;
    DROP TRIGGER IF EXISTS messages_au;
    DROP TRIGGER IF EXISTS messages_au_delete;
    DROP TRIGGER IF EXISTS messages_au_insert;
    DROP TRIGGER IF EXISTS messages_ad;

    CREATE TRIGGER messages_ai AFTER INSERT ON messages
    WHEN new.policy = 'indexable' AND new.visibility IN ('internal','public_safe','public_approved')
    BEGIN
      INSERT INTO messages_fts(rowid, content, project, timestamp, agent_id)
      VALUES (new.id, new.content, new.project, new.timestamp, new.agent_id);
    END;

    CREATE TRIGGER messages_au_delete AFTER UPDATE ON messages
    WHEN old.policy = 'indexable' AND old.visibility IN ('internal','public_safe','public_approved')
    BEGIN
      INSERT INTO messages_fts(messages_fts, rowid, content, project, timestamp, agent_id)
      VALUES('delete', old.id, old.content, old.project, old.timestamp, old.agent_id);
    END;

    CREATE TRIGGER messages_au_insert AFTER UPDATE ON messages
    WHEN new.policy = 'indexable' AND new.visibility IN ('internal','public_safe','public_approved')
    BEGIN
      INSERT INTO messages_fts(rowid, content, project, timestamp, agent_id)
      VALUES (new.id, new.content, new.project, new.timestamp, new.agent_id);
    END;

    CREATE TRIGGER messages_ad AFTER DELETE ON messages
    WHEN old.policy = 'indexable' AND old.visibility IN ('internal','public_safe','public_approved')
    BEGIN
      INSERT INTO messages_fts(messages_fts, rowid, content, project, timestamp, agent_id)
      VALUES('delete', old.id, old.content, old.project, old.timestamp, old.agent_id);
    END;
  `);
  })();

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

  // raw_artifacts / artifact_labels: append-only raw evidence vault metadata (MEMSEC-01/02)
  db.exec(`
    CREATE TABLE IF NOT EXISTS raw_artifacts (
      id                TEXT PRIMARY KEY,
      tenant_id         TEXT    NOT NULL DEFAULT 'default-tenant',
      project           TEXT,
      source_type       TEXT    NOT NULL,
      source_id         TEXT,
      session_id        TEXT,
      artifact_uri      TEXT    NOT NULL,
      artifact_path     TEXT    NOT NULL,
      content_hash      TEXT    NOT NULL,
      compression       TEXT    NOT NULL DEFAULT 'zstd',
      key_id            TEXT,
      uncompressed_size INTEGER NOT NULL DEFAULT 0,
      compressed_size   INTEGER NOT NULL DEFAULT 0,
      replay_state      TEXT    NOT NULL DEFAULT 'complete'
                        CHECK(replay_state IN ('pending','complete','failed')),
      replay_metadata   TEXT    NOT NULL DEFAULT '{}',
      retention_until   TEXT,
      created_at        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );
    CREATE INDEX IF NOT EXISTS raw_artifacts_tenant_created
      ON raw_artifacts(tenant_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS raw_artifacts_source
      ON raw_artifacts(source_type, source_id);
    CREATE INDEX IF NOT EXISTS raw_artifacts_session
      ON raw_artifacts(session_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS artifact_labels (
      id            INTEGER PRIMARY KEY,
      artifact_id   TEXT    NOT NULL REFERENCES raw_artifacts(id) ON DELETE CASCADE,
      visibility    TEXT    NOT NULL DEFAULT 'private',
      domain        TEXT,
      sensitivity   TEXT,
      policy        TEXT    NOT NULL DEFAULT 'sealed',
      label_version INTEGER NOT NULL DEFAULT 1,
      labeled_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      UNIQUE(artifact_id, label_version)
    );
    CREATE INDEX IF NOT EXISTS artifact_labels_artifact_version
      ON artifact_labels(artifact_id, label_version DESC);

    CREATE TABLE IF NOT EXISTS classification_reviews (
      id                    TEXT PRIMARY KEY,
      tenant_id             TEXT NOT NULL DEFAULT 'default-tenant',
      artifact_id           TEXT NOT NULL REFERENCES raw_artifacts(id) ON DELETE CASCADE,
      source_type           TEXT NOT NULL,
      source_id             TEXT,
      session_id            TEXT,
      status                TEXT NOT NULL DEFAULT 'open'
                            CHECK(status IN ('open','approved','denied','redacted')),
      reason_codes_json     TEXT NOT NULL DEFAULT '[]',
      evidence_spans_json   TEXT NOT NULL DEFAULT '[]',
      proposed_visibility   TEXT NOT NULL DEFAULT 'private',
      proposed_domain       TEXT,
      proposed_sensitivity  TEXT,
      proposed_policy       TEXT NOT NULL DEFAULT 'requires_human_review',
      reviewer_id           TEXT,
      decision              TEXT,
      decision_note         TEXT,
      decided_at            TEXT,
      hil_escalation_id     TEXT,
      created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );
    CREATE INDEX IF NOT EXISTS classification_reviews_status
      ON classification_reviews(tenant_id, status, created_at DESC);
    CREATE INDEX IF NOT EXISTS classification_reviews_artifact
      ON classification_reviews(artifact_id, status);
  `);

  // message_embeddings: per-message vector storage for semantic recall (RECALL-01, RECALL-02)
  // Embeddings are packed as Float32 BLOBs to keep the table compact.
  // Qdrant is untouched — message embeddings live exclusively in conversations.db (D-02).
  db.exec(`
    CREATE TABLE IF NOT EXISTS message_embeddings (
      message_id INTEGER PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE,
      model      TEXT    NOT NULL,
      dim        INTEGER NOT NULL,
      vector     BLOB    NOT NULL,
      artifact_id TEXT,
      source_span TEXT,
      modality   TEXT    NOT NULL DEFAULT 'text',
      model_version TEXT,
      label_version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );
    CREATE INDEX IF NOT EXISTS message_embeddings_model
      ON message_embeddings(model);
  `);

  // registered_agents: canonical v2.0 agent registry (REST, UI, future A2A adapters)
  db.exec(`
    CREATE TABLE IF NOT EXISTS registered_agents (
      id                TEXT PRIMARY KEY,
      name              TEXT    NOT NULL,
      role              TEXT    NOT NULL,
      company           TEXT,
      platform          TEXT    NOT NULL,
      protocol          TEXT    NOT NULL
                        CHECK(protocol IN ('rest','a2a','ui','local')),
      status            TEXT    NOT NULL DEFAULT 'dormant'
                        CHECK(status IN ('active','idle','dormant','error')),
      current_task      TEXT,
      last_heartbeat_at TEXT,
      location          TEXT    NOT NULL DEFAULT 'local'
                        CHECK(location IN ('local','tailscale','cloudflare')),
      host              TEXT,
      port              INTEGER,
      health_endpoint   TEXT,
      tunnel_url        TEXT,
      latency_ms        INTEGER,
      metadata          TEXT    NOT NULL DEFAULT '{}',
      created_at        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      updated_at        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      deregistered_at   TEXT
    );
    CREATE INDEX IF NOT EXISTS registered_agents_status
      ON registered_agents(status, last_heartbeat_at DESC);
    CREATE INDEX IF NOT EXISTS registered_agents_protocol
      ON registered_agents(protocol);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_api_keys (
      id           INTEGER PRIMARY KEY,
      agent_id     TEXT    NOT NULL REFERENCES registered_agents(id) ON DELETE CASCADE,
      key_prefix   TEXT    NOT NULL,
      key_hash     TEXT    NOT NULL UNIQUE,
      created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      last_used_at TEXT,
      revoked_at   TEXT
    );
    CREATE INDEX IF NOT EXISTS agent_api_keys_hash
      ON agent_api_keys(key_hash);
    CREATE INDEX IF NOT EXISTS agent_api_keys_agent
      ON agent_api_keys(agent_id, revoked_at);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_capabilities (
      id          INTEGER PRIMARY KEY,
      agent_id    TEXT    NOT NULL REFERENCES registered_agents(id) ON DELETE CASCADE,
      capability_id TEXT  NOT NULL,
      name        TEXT    NOT NULL,
      description TEXT    NOT NULL DEFAULT '',
      tags        TEXT    NOT NULL DEFAULT '[]',
      created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      UNIQUE(agent_id, capability_id)
    );
    CREATE INDEX IF NOT EXISTS agent_capabilities_lookup
      ON agent_capabilities(capability_id, agent_id);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_skill_reports (
      id          INTEGER PRIMARY KEY,
      agent_id    TEXT    NOT NULL REFERENCES registered_agents(id) ON DELETE CASCADE,
      skill_id    TEXT    NOT NULL,
      action      TEXT    NOT NULL,
      metadata    TEXT    NOT NULL DEFAULT '{}',
      reported_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );
    CREATE INDEX IF NOT EXISTS agent_skill_reports_agent_ts
      ON agent_skill_reports(agent_id, reported_at DESC);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_memory_writes (
      id          INTEGER PRIMARY KEY,
      agent_id    TEXT    NOT NULL REFERENCES registered_agents(id) ON DELETE CASCADE,
      memory_type TEXT,
      content_hash TEXT,
      metadata    TEXT    NOT NULL DEFAULT '{}',
      result      TEXT    NOT NULL DEFAULT '{}',
      written_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );
    CREATE INDEX IF NOT EXISTS agent_memory_writes_agent_ts
      ON agent_memory_writes(agent_id, written_at DESC);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_tool_outcomes (
      id          INTEGER PRIMARY KEY,
      agent_id    TEXT    NOT NULL REFERENCES registered_agents(id) ON DELETE CASCADE,
      tool_id     TEXT    NOT NULL,
      outcome     TEXT    NOT NULL,
      metadata    TEXT    NOT NULL DEFAULT '{}',
      recorded_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );
    CREATE INDEX IF NOT EXISTS agent_tool_outcomes_agent_ts
      ON agent_tool_outcomes(agent_id, recorded_at DESC);
    CREATE INDEX IF NOT EXISTS agent_tool_outcomes_tool
      ON agent_tool_outcomes(tool_id, recorded_at DESC);
  `);

  // a2a_tasks / a2a_task_events: durable transport-level task state (Phase 35)
  db.exec(`
    CREATE TABLE IF NOT EXISTS a2a_tasks (
      task_id             TEXT PRIMARY KEY,
      context_id          TEXT NOT NULL,
      caller_agent_id     TEXT NOT NULL,
      target_agent_id     TEXT,
      state               TEXT NOT NULL
                          CHECK(state IN ('submitted','working','input-required','completed','failed','canceled')),
      message_json        TEXT NOT NULL,
      artifacts_json      TEXT NOT NULL DEFAULT '[]',
      metadata_json       TEXT NOT NULL DEFAULT '{}',
      created_at          TEXT NOT NULL,
      updated_at          TEXT NOT NULL,
      terminal_at         TEXT,
      cancel_requested_at TEXT
    );
    CREATE INDEX IF NOT EXISTS a2a_tasks_context
      ON a2a_tasks(context_id);
    CREATE INDEX IF NOT EXISTS a2a_tasks_caller_state
      ON a2a_tasks(caller_agent_id, state, updated_at DESC);
    CREATE INDEX IF NOT EXISTS a2a_tasks_target_state
      ON a2a_tasks(target_agent_id, state, updated_at DESC);

    CREATE TABLE IF NOT EXISTS a2a_task_events (
      id           INTEGER PRIMARY KEY,
      task_id      TEXT NOT NULL,
      sequence     INTEGER NOT NULL,
      event_type   TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at   TEXT NOT NULL,
      UNIQUE(task_id, sequence),
      FOREIGN KEY(task_id) REFERENCES a2a_tasks(task_id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS a2a_task_events_task_sequence
      ON a2a_task_events(task_id, sequence);
  `);

  // eval_runs / eval_run_examples: Phase 57 composite W audit history
  db.exec(`
    CREATE TABLE IF NOT EXISTS eval_runs (
      id                       TEXT PRIMARY KEY,
      trace_id                 TEXT NOT NULL,
      agent_id                 TEXT NOT NULL,
      role                     TEXT NOT NULL,
      composite_w              REAL NOT NULL,
      trusted                  INTEGER NOT NULL,
      drift_agreement          REAL NOT NULL,
      drift_status             TEXT NOT NULL,
      layer_breakdown_json     TEXT NOT NULL,
      scorer_results_json      TEXT NOT NULL,
      judge_provider           TEXT NOT NULL,
      judge_model              TEXT NOT NULL,
      judge_model_family       TEXT NOT NULL,
      prompt_template_version  TEXT NOT NULL,
      prompt_hash              TEXT NOT NULL,
      golden_set_path          TEXT NOT NULL,
      golden_set_version       TEXT NOT NULL,
      config_hash              TEXT NOT NULL,
      started_at               TEXT NOT NULL,
      completed_at             TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS eval_runs_completed
      ON eval_runs(completed_at DESC);
    CREATE INDEX IF NOT EXISTS eval_runs_agent
      ON eval_runs(agent_id, completed_at DESC);

    CREATE TABLE IF NOT EXISTS eval_run_examples (
      id            INTEGER PRIMARY KEY,
      run_id        TEXT NOT NULL REFERENCES eval_runs(id) ON DELETE CASCADE,
      example_id    TEXT NOT NULL,
      human_score   REAL NOT NULL,
      judge_score   REAL NOT NULL,
      agreed        INTEGER NOT NULL,
      created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );
    CREATE INDEX IF NOT EXISTS eval_run_examples_run
      ON eval_run_examples(run_id);
  `);

  // Phase 61: business_outcome_events — adapter pull sink for L3 scorer.
  // tenant_id defaults to 'default-tenant'; Phase 62 backfills real tenant IDs.
  db.exec(`
    CREATE TABLE IF NOT EXISTS business_outcome_events (
      id              INTEGER PRIMARY KEY,
      tenant_id       TEXT    NOT NULL DEFAULT 'default-tenant',
      correlation_id  TEXT    NOT NULL,
      source_system   TEXT    NOT NULL CHECK(source_system IN ('crm','helpdesk','finance')),
      adapter         TEXT    NOT NULL,
      event_type      TEXT    NOT NULL,
      kpi_key         TEXT    NOT NULL,
      kpi_value       REAL    NOT NULL,
      raw_json        TEXT    NOT NULL,
      agent_id        TEXT,
      polled_at       TEXT    NOT NULL,
      created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      UNIQUE(tenant_id, correlation_id, adapter, event_type, polled_at)
    );
    CREATE INDEX IF NOT EXISTS boe_correlation
      ON business_outcome_events(correlation_id);
    CREATE INDEX IF NOT EXISTS boe_agent
      ON business_outcome_events(agent_id, polled_at DESC);
    CREATE INDEX IF NOT EXISTS boe_tenant
      ON business_outcome_events(tenant_id, polled_at DESC);
    CREATE INDEX IF NOT EXISTS boe_adapter
      ON business_outcome_events(adapter, polled_at DESC);
  `);

  const boeSchema = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'business_outcome_events'")
    .get() as { sql: string } | undefined;
  if (boeSchema?.sql.includes("UNIQUE(correlation_id, adapter, event_type, polled_at)")) {
    db.exec(`
      CREATE TABLE business_outcome_events_new (
        id              INTEGER PRIMARY KEY,
        tenant_id       TEXT    NOT NULL DEFAULT 'default-tenant',
        correlation_id  TEXT    NOT NULL,
        source_system   TEXT    NOT NULL CHECK(source_system IN ('crm','helpdesk','finance')),
        adapter         TEXT    NOT NULL,
        event_type      TEXT    NOT NULL,
        kpi_key         TEXT    NOT NULL,
        kpi_value       REAL    NOT NULL,
        raw_json        TEXT    NOT NULL,
        agent_id        TEXT,
        polled_at       TEXT    NOT NULL,
        created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
        UNIQUE(tenant_id, correlation_id, adapter, event_type, polled_at)
      );
      INSERT OR IGNORE INTO business_outcome_events_new
        (id, tenant_id, correlation_id, source_system, adapter, event_type,
         kpi_key, kpi_value, raw_json, agent_id, polled_at, created_at)
      SELECT id, tenant_id, correlation_id, source_system, adapter, event_type,
             kpi_key, kpi_value, raw_json, agent_id, polled_at, created_at
      FROM business_outcome_events;
      DROP TABLE business_outcome_events;
      ALTER TABLE business_outcome_events_new RENAME TO business_outcome_events;
    `);
  }
  db.exec(`
    CREATE INDEX IF NOT EXISTS boe_correlation
      ON business_outcome_events(correlation_id);
    CREATE INDEX IF NOT EXISTS boe_agent
      ON business_outcome_events(agent_id, polled_at DESC);
    CREATE INDEX IF NOT EXISTS boe_tenant
      ON business_outcome_events(tenant_id, polled_at DESC);
    CREATE INDEX IF NOT EXISTS boe_adapter
      ON business_outcome_events(adapter, polled_at DESC);
  `);

  // Phase 60 agent autogen tables — additive only (CREATE TABLE IF NOT EXISTS).

  // agent_instructions: mutation target for agent_instruction_patch proposals
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_instructions (
      id                INTEGER PRIMARY KEY,
      agent_id          TEXT    NOT NULL REFERENCES registered_agents(id) ON DELETE CASCADE,
      instructions_text TEXT    NOT NULL,
      version           INTEGER NOT NULL DEFAULT 1,
      proposal_id       TEXT    REFERENCES seal_proposals(id),
      is_active         INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
      created_at        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );
    CREATE INDEX IF NOT EXISTS agent_instructions_active
      ON agent_instructions(agent_id, is_active, version DESC);
  `);

  // proposed_skills: staging/promotion target for skill_addition proposals.
  // proposal_id is nullable so applyShadow can embed it in diff and update post-persist.
  db.exec(`
    CREATE TABLE IF NOT EXISTS proposed_skills (
      id          INTEGER PRIMARY KEY,
      agent_id    TEXT    NOT NULL REFERENCES registered_agents(id) ON DELETE CASCADE,
      skill_id    TEXT    NOT NULL,
      action      TEXT    NOT NULL,
      metadata    TEXT    NOT NULL DEFAULT '{}',
      proposal_id TEXT    REFERENCES seal_proposals(id),
      status      TEXT    NOT NULL DEFAULT 'proposed'
                  CHECK(status IN ('proposed','promoted','rolled_back')),
      created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );
    CREATE INDEX IF NOT EXISTS proposed_skills_proposal
      ON proposed_skills(proposal_id, status);
  `);

  // agent_tool_routing_policies: mutation target for tool_routing_update proposals
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_tool_routing_policies (
      id                INTEGER PRIMARY KEY,
      agent_id          TEXT    NOT NULL REFERENCES registered_agents(id) ON DELETE CASCADE,
      tool_name         TEXT    NOT NULL,
      context_pattern   TEXT    NOT NULL DEFAULT '*',
      preference_weight REAL    NOT NULL DEFAULT 1.0,
      proposal_id       TEXT    REFERENCES seal_proposals(id),
      is_active         INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
      created_at        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );
    CREATE INDEX IF NOT EXISTS agent_tool_routing_active
      ON agent_tool_routing_policies(agent_id, tool_name, is_active);
  `);

  // Phase 62: tenants + tenant_api_keys (multi-tenant public API isolation).
  db.exec(`
    CREATE TABLE IF NOT EXISTS tenants (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );
    INSERT OR IGNORE INTO tenants (id, name) VALUES ('default-tenant', 'Default Tenant');

    CREATE TABLE IF NOT EXISTS tenant_api_keys (
      id         TEXT PRIMARY KEY,
      tenant_id  TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      key_hash   TEXT NOT NULL UNIQUE,
      scopes     TEXT NOT NULL DEFAULT 'eval:submit,eval:read,proposals:read',
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      revoked_at TEXT
    );
    CREATE INDEX IF NOT EXISTS tak_tenant ON tenant_api_keys(tenant_id);
    CREATE INDEX IF NOT EXISTS tak_hash   ON tenant_api_keys(key_hash);
  `);

  const internalApiKey = process.env.MEMROOS_INTERNAL_API_KEY;
  if (internalApiKey) {
    assertNotDefaultInternalApiKey(internalApiKey);
    const defaultKeyHash = createHash("sha256").update(internalApiKey).digest("hex");
    db.prepare(
      "INSERT OR IGNORE INTO tenant_api_keys (id, tenant_id, key_hash) VALUES (?, ?, ?)"
    ).run("tak-internal-env", "default-tenant", defaultKeyHash);
  }

  // Phase 62: additive tenant_id column on eval_runs and eval_run_examples only
  // (seal_proposals and other tables are created later in this function).
  // Those tables are migrated after their CREATE TABLE IF NOT EXISTS statements below.
  for (const table of ["eval_runs", "eval_run_examples"]) {
    try {
      db.exec(`ALTER TABLE ${table} ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default-tenant'`);
    } catch {
      // Column already exists — safe to ignore on re-runs.
    }
  }

  // seal_*: Phase 58 self-improvement substrate. Additive-only DDL.
  db.exec(`
    CREATE TABLE IF NOT EXISTS seal_proposals (
      id                  TEXT PRIMARY KEY,
      trace_id            TEXT NOT NULL,
      run_id              TEXT NOT NULL REFERENCES eval_runs(id),
      agent_id            TEXT NOT NULL,
      proposal_type       TEXT NOT NULL,
      status              TEXT NOT NULL DEFAULT 'pending'
                          CHECK(status IN ('pending','approved','rejected','applied','rolled_back')),
      diff_json           TEXT NOT NULL,
      rationale           TEXT NOT NULL,
      forecast_w_delta    REAL NOT NULL,
      baseline_w          REAL NOT NULL,
      baseline_run_id     TEXT NOT NULL REFERENCES eval_runs(id),
      baseline_layer_json TEXT NOT NULL,
      created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );
    CREATE INDEX IF NOT EXISTS seal_proposals_status
      ON seal_proposals(status, created_at DESC);
    CREATE INDEX IF NOT EXISTS seal_proposals_agent
      ON seal_proposals(agent_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS seal_proposal_decisions (
      id          TEXT PRIMARY KEY,
      proposal_id TEXT NOT NULL REFERENCES seal_proposals(id),
      action      TEXT NOT NULL CHECK(action IN ('approved','rejected','applied','rolled_back')),
      operator    TEXT NOT NULL,
      reasoning   TEXT,
      decided_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );

    CREATE TABLE IF NOT EXISTS seal_audit_log (
      id              TEXT PRIMARY KEY,
      -- No FK to seal_proposals: an append-only audit log must always record,
      -- even if the referenced proposal is absent or later purged (phase 64).
      proposal_id     TEXT NOT NULL,
      event           TEXT NOT NULL
                      CHECK(event IN ('proposed','approved','rejected','apply_started','apply_succeeded','apply_failed','rolled_back')),
      baseline_w      REAL,
      post_apply_w    REAL,
      delta_l1        REAL,
      delta_l2        REAL,
      delta_l3        REAL,
      delta_composite REAL,
      detail_json     TEXT NOT NULL DEFAULT '{}',
      timestamp       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );
    CREATE INDEX IF NOT EXISTS seal_audit_log_ts
      ON seal_audit_log(timestamp DESC);
    CREATE INDEX IF NOT EXISTS seal_audit_log_proposal
      ON seal_audit_log(proposal_id, timestamp DESC);
  `);

  // Phase 62: additive tenant_id column on remaining v2.5 tables
  // (created above in this function — safe to migrate now).
  for (const table of [
    "seal_proposals",
    "seal_proposal_decisions",
    "seal_audit_log",
    "agent_instructions",
    "proposed_skills",
    "agent_tool_routing_policies",
  ]) {
    try {
      db.exec(`ALTER TABLE ${table} ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default-tenant'`);
    } catch {
      // Column already exists — safe to ignore on re-runs.
    }
  }

  // Phase 62: indexes for tenant-scoped queries (after all tables and tenant_id columns exist).
  db.exec(`
    CREATE INDEX IF NOT EXISTS eval_runs_tenant
      ON eval_runs(tenant_id, completed_at DESC);
    CREATE INDEX IF NOT EXISTS seal_proposals_tenant
      ON seal_proposals(tenant_id, created_at DESC);
  `);

  // Phase 72: behavioral eval job substrate — additive schema (SEAL-04, SEAL-05, SEAL-06)
  // Tables: seal_eval_jobs, seal_evidence_bundles.
  // All DDL is guarded with IF NOT EXISTS — safe on every startup.
  initBehavioralJobSchema(db);

  // Phase 80: declarative cron/sink health registry.
  db.exec(`
    CREATE TABLE IF NOT EXISTS cron_health_jobs (
      id                         TEXT PRIMARY KEY,
      name                       TEXT NOT NULL,
      source_family              TEXT NOT NULL,
      schedule                   TEXT NOT NULL,
      owner                      TEXT NOT NULL DEFAULT 'memroos',
      status                     TEXT NOT NULL DEFAULT 'active'
                                 CHECK(status IN ('active','paused','stopped')),
      health_endpoint            TEXT,
      expected_interval_minutes  INTEGER NOT NULL DEFAULT 60,
      last_run_at                TEXT,
      last_success_at            TEXT,
      last_failure_at            TEXT,
      items_processed            INTEGER NOT NULL DEFAULT 0,
      warning                    TEXT,
      metadata_json              TEXT NOT NULL DEFAULT '{}',
      updated_at                 TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );
    CREATE INDEX IF NOT EXISTS cron_health_jobs_status_updated
      ON cron_health_jobs(status, updated_at DESC);
    CREATE INDEX IF NOT EXISTS cron_health_jobs_source
      ON cron_health_jobs(source_family, status);
  `);

  // Phase 81: universal task evidence bundles keyed to dispatched/A2A task ids.
  db.exec(`
    CREATE TABLE IF NOT EXISTS task_evidence_bundles (
      id                            TEXT PRIMARY KEY,
      task_id                       TEXT NOT NULL,
      tenant_id                     TEXT NOT NULL DEFAULT 'default-tenant'
                                    REFERENCES tenants(id),
      status                        TEXT NOT NULL DEFAULT 'open'
                                    CHECK(status IN ('open','verified','failed','superseded')),
      plan_json                     TEXT NOT NULL DEFAULT '[]',
      context_json                  TEXT NOT NULL DEFAULT '[]',
      permissions_json              TEXT NOT NULL DEFAULT '[]',
      tools_json                    TEXT NOT NULL DEFAULT '[]',
      actions_json                  TEXT NOT NULL DEFAULT '[]',
      verification_json             TEXT NOT NULL DEFAULT '[]',
      memories_json                 TEXT NOT NULL DEFAULT '[]',
      sources_json                  TEXT NOT NULL DEFAULT '[]',
      assumptions_json              TEXT NOT NULL DEFAULT '[]',
      residual_risks_json           TEXT NOT NULL DEFAULT '[]',
      replay_handle                 TEXT,
      rollback_handle               TEXT,
      created_at                    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      updated_at                    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );
    CREATE INDEX IF NOT EXISTS task_evidence_bundles_task
      ON task_evidence_bundles(task_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS task_evidence_bundles_tenant_status
      ON task_evidence_bundles(tenant_id, status, updated_at DESC);
  `);

  // AGENTMEM-FOLLOWUP-01: MemRoOS-native coding-agent continuity capture.
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_session_captures (
      id                       TEXT PRIMARY KEY,
      tenant_id                TEXT NOT NULL DEFAULT 'default-tenant'
                               REFERENCES tenants(id),
      source_agent_id          TEXT NOT NULL,
      runtime                  TEXT NOT NULL,
      project                  TEXT,
      repo_path                TEXT,
      session_id               TEXT NOT NULL,
      task_id                  TEXT,
      status                   TEXT NOT NULL DEFAULT 'captured'
                               CHECK(status IN ('captured','handoff_ready','failed','ignored')),
      capture_health           TEXT NOT NULL DEFAULT 'ok'
                               CHECK(capture_health IN ('ok','redacted','warning','failed')),
      model_route_json         TEXT NOT NULL DEFAULT '{}',
      summary                  TEXT NOT NULL DEFAULT '',
      decision_intent_json     TEXT NOT NULL DEFAULT '{}',
      sources_json             TEXT NOT NULL DEFAULT '[]',
      files_json               TEXT NOT NULL DEFAULT '[]',
      commands_json            TEXT NOT NULL DEFAULT '[]',
      errors_json              TEXT NOT NULL DEFAULT '[]',
      verification_json        TEXT NOT NULL DEFAULT '[]',
      metadata_json            TEXT NOT NULL DEFAULT '{}',
      raw_artifact_id          TEXT REFERENCES raw_artifacts(id),
      capture_hash             TEXT NOT NULL,
      captured_at              TEXT NOT NULL,
      updated_at               TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );
    CREATE INDEX IF NOT EXISTS agent_session_captures_task
      ON agent_session_captures(tenant_id, task_id, captured_at DESC);
    CREATE INDEX IF NOT EXISTS agent_session_captures_session
      ON agent_session_captures(tenant_id, session_id, captured_at DESC);
    CREATE INDEX IF NOT EXISTS agent_session_captures_agent
      ON agent_session_captures(tenant_id, source_agent_id, captured_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS agent_session_captures_hash
      ON agent_session_captures(tenant_id, capture_hash)
      WHERE capture_hash <> '';

    CREATE TABLE IF NOT EXISTS agent_memory_candidates (
      id                TEXT PRIMARY KEY,
      tenant_id         TEXT NOT NULL DEFAULT 'default-tenant'
                        REFERENCES tenants(id),
      capture_id        TEXT NOT NULL REFERENCES agent_session_captures(id) ON DELETE CASCADE,
      agent_id          TEXT NOT NULL,
      memory_type       TEXT NOT NULL
                        CHECK(memory_type IN ('decision_intent','task_state','lesson','runbook','source_pointer','verification')),
      content           TEXT NOT NULL,
      content_hash      TEXT NOT NULL,
      status            TEXT NOT NULL DEFAULT 'candidate'
                        CHECK(status IN ('candidate','promoted','rejected')),
      metadata_json     TEXT NOT NULL DEFAULT '{}',
      created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      UNIQUE(capture_id, content_hash)
    );
    CREATE INDEX IF NOT EXISTS agent_memory_candidates_capture
      ON agent_memory_candidates(capture_id, status);
    CREATE INDEX IF NOT EXISTS agent_memory_candidates_agent
      ON agent_memory_candidates(agent_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS agent_handoff_packs (
      id                      TEXT PRIMARY KEY,
      tenant_id               TEXT NOT NULL DEFAULT 'default-tenant'
                              REFERENCES tenants(id),
      from_agent_id           TEXT,
      to_agent_id             TEXT,
      task_id                 TEXT,
      session_id              TEXT,
      title                   TEXT NOT NULL,
      status                  TEXT NOT NULL DEFAULT 'ready'
                              CHECK(status IN ('ready','consumed','expired','superseded')),
      context_pack_json       TEXT NOT NULL,
      source_capture_ids_json TEXT NOT NULL DEFAULT '[]',
      token_budget            INTEGER NOT NULL DEFAULT 4000,
      redaction_state         TEXT NOT NULL DEFAULT 'none'
                              CHECK(redaction_state IN ('none','redacted','review_required')),
      created_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );
    CREATE INDEX IF NOT EXISTS agent_handoff_packs_task
      ON agent_handoff_packs(tenant_id, task_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS agent_handoff_packs_session
      ON agent_handoff_packs(tenant_id, session_id, created_at DESC);
  `);
  try {
    db.exec("ALTER TABLE agent_session_captures ADD COLUMN capture_hash TEXT NOT NULL DEFAULT ''");
  } catch {
    // Column already exists.
  }

  // Skill promotion audit: MemRoOS-native suggestions from recent activity.
  db.exec(`
    CREATE TABLE IF NOT EXISTS skill_suggestions (
      id                         TEXT PRIMARY KEY,
      name                       TEXT NOT NULL,
      source_pattern             TEXT NOT NULL,
      recommendation             TEXT NOT NULL,
      confidence                 REAL NOT NULL DEFAULT 0,
      evidence_json              TEXT NOT NULL DEFAULT '[]',
      compared_harnesses_json    TEXT NOT NULL DEFAULT '{}',
      status                     TEXT NOT NULL DEFAULT 'proposed'
                                 CHECK(status IN ('proposed','approved','promoted','dismissed')),
      created_at                 TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      promoted_at                TEXT
    );
    CREATE INDEX IF NOT EXISTS skill_suggestions_status_confidence
      ON skill_suggestions(status, confidence DESC, created_at DESC);
  `);

  // Phase 63: human team member auth tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      email         TEXT NOT NULL UNIQUE,
      display_name  TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      tenant_id     TEXT NOT NULL DEFAULT 'default-tenant'
                    REFERENCES tenants(id) ON DELETE CASCADE,
      created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      last_login_at TEXT
    );
    CREATE INDEX IF NOT EXISTS users_email ON users(email);
    CREATE INDEX IF NOT EXISTS users_tenant ON users(tenant_id);

    CREATE TABLE IF NOT EXISTS user_roles (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role    TEXT NOT NULL CHECK(role IN ('admin','operator','reviewer')),
      PRIMARY KEY (user_id, role)
    );

    CREATE TABLE IF NOT EXISTS user_api_keys (
      id           TEXT PRIMARY KEY,
      user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      key_hash     TEXT NOT NULL UNIQUE,
      label        TEXT NOT NULL DEFAULT '',
      created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      last_used_at TEXT,
      revoked_at   TEXT
    );
    CREATE INDEX IF NOT EXISTS uak_user ON user_api_keys(user_id, revoked_at);
    CREATE INDEX IF NOT EXISTS uak_hash ON user_api_keys(key_hash);

    CREATE TABLE IF NOT EXISTS user_refresh_tokens (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      revoked_at TEXT
    );
    CREATE INDEX IF NOT EXISTS urt_user ON user_refresh_tokens(user_id, revoked_at);
    CREATE INDEX IF NOT EXISTS urt_hash ON user_refresh_tokens(token_hash);

    CREATE TABLE IF NOT EXISTS team_invitations (
      id         TEXT PRIMARY KEY,
      token_hash TEXT NOT NULL UNIQUE,
      role       TEXT NOT NULL CHECK(role IN ('admin','operator','reviewer')),
      invited_by TEXT NOT NULL REFERENCES users(id),
      email_hint TEXT,
      used_at    TEXT,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );
    CREATE INDEX IF NOT EXISTS inv_token ON team_invitations(token_hash, used_at);

    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      used_at    TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );
    CREATE INDEX IF NOT EXISTS prt_hash ON password_reset_tokens(token_hash, used_at);

    CREATE TABLE IF NOT EXISTS user_email_verifications (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      email      TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      verified_at TEXT,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );
    CREATE INDEX IF NOT EXISTS uev_user ON user_email_verifications(user_id, verified_at);

    CREATE TABLE IF NOT EXISTS auth_events (
      id          TEXT PRIMARY KEY,
      user_id     TEXT,
      event_type  TEXT NOT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );
    CREATE INDEX IF NOT EXISTS auth_events_type_created
      ON auth_events(event_type, created_at DESC);
  `);

  // Phase 64: audit_entries unified immutable log (AUDIT-01)
  // Two-layer immutability: SQLite triggers + service code convention (no UPDATE/DELETE exports).
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_entries (
      id            TEXT PRIMARY KEY,
      tenant_id     TEXT NOT NULL DEFAULT 'default-tenant'
                    REFERENCES tenants(id),
      actor_id      TEXT NOT NULL,
      actor_role    TEXT NOT NULL,
      event_type    TEXT NOT NULL,
      entity_type   TEXT NOT NULL,
      entity_id     TEXT NOT NULL,
      reason        TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );
    CREATE INDEX IF NOT EXISTS audit_entries_created
      ON audit_entries(created_at DESC);
    CREATE INDEX IF NOT EXISTS audit_entries_entity
      ON audit_entries(entity_type, entity_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS audit_entries_event_type
      ON audit_entries(event_type, created_at DESC);
    CREATE INDEX IF NOT EXISTS audit_entries_actor
      ON audit_entries(actor_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS audit_entries_tenant
      ON audit_entries(tenant_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS audit_entries_tenant_event
      ON audit_entries(tenant_id, event_type, created_at DESC);

    CREATE TRIGGER IF NOT EXISTS audit_entries_no_update
      BEFORE UPDATE ON audit_entries
    BEGIN
      SELECT RAISE(ABORT, 'audit_entries is append-only: UPDATE is not permitted');
    END;

    CREATE TRIGGER IF NOT EXISTS audit_entries_no_delete
      BEFORE DELETE ON audit_entries
    BEGIN
      SELECT RAISE(ABORT, 'audit_entries is append-only: DELETE is not permitted');
    END;
  `);

  // Phase 71: recording consent for Daily.co meeting bot joins.
  // Deliberately stores only an opaque meeting_id and human label; room URLs and
  // join tokens remain transient and must never be persisted here.
  db.exec(`
    CREATE TABLE IF NOT EXISTS meeting_consents (
      meeting_id    TEXT PRIMARY KEY,
      operator_id   TEXT NOT NULL,
      meeting_label TEXT,
      consented     INTEGER NOT NULL DEFAULT 1 CHECK(consented IN (0,1)),
      consented_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );
    CREATE INDEX IF NOT EXISTS meeting_consents_operator
      ON meeting_consents(operator_id, consented_at DESC);
  `);

  // Phase 64: hil_escalations — mutable open-work-item state (AUDIT-04)
  // Each lifecycle event (created/resolved/sla_breached) writes to audit_entries.
  db.exec(`
    CREATE TABLE IF NOT EXISTS hil_escalations (
      id              TEXT PRIMARY KEY,
      tenant_id       TEXT NOT NULL DEFAULT 'default-tenant'
                      REFERENCES tenants(id),
      entity_type     TEXT NOT NULL,
      entity_id       TEXT NOT NULL,
      escalation_type TEXT NOT NULL
                      CHECK(escalation_type IN ('agent_escalate','seal_approval','eval_below_threshold')),
      sla_seconds     INTEGER NOT NULL,
      sla_deadline    TEXT NOT NULL,
      status          TEXT NOT NULL DEFAULT 'open'
                      CHECK(status IN ('open','resolved','sla_breached')),
      assigned_to     TEXT REFERENCES users(id),
      opened_by       TEXT NOT NULL,
      resolved_by     TEXT REFERENCES users(id),
      resolution_note TEXT,
      resolved_at     TEXT,
      created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );
    CREATE INDEX IF NOT EXISTS hil_status_deadline
      ON hil_escalations(status, sla_deadline ASC);
    CREATE INDEX IF NOT EXISTS hil_tenant_status
      ON hil_escalations(tenant_id, status, sla_deadline ASC);
    CREATE INDEX IF NOT EXISTS hil_entity
      ON hil_escalations(entity_type, entity_id);
  `);

  // Phase 64: one-shot backfill migration (AUDIT-01)
  // Guarded by meta flag; maps legacy seal_audit_log + audit_log rows into audit_entries.
  const backfillDone = db
    .prepare(`SELECT value FROM meta WHERE key = 'audit_entries_backfill_done'`)
    .get() as { value: string } | undefined;
  if (!backfillDone) {
    const sealEventMap: Record<string, string> = {
      proposed: "seal.proposed",
      approved: "seal.approved",
      rejected: "seal.rejected",
      apply_started: "seal.apply_started",
      apply_succeeded: "seal.apply_succeeded",
      apply_failed: "seal.apply_failed",
      rolled_back: "seal.rolled_back",
    };

    type SealAuditRow = {
      id: string;
      proposal_id: string;
      event: string;
      baseline_w: number | null;
      post_apply_w: number | null;
      delta_l1: number | null;
      delta_l2: number | null;
      delta_l3: number | null;
      delta_composite: number | null;
      detail_json: string;
      timestamp: string;
      tenant_id?: string;
    };

    const sealTableExists = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='seal_audit_log'`)
      .get();
    if (sealTableExists) {
      const sealRows = db.prepare("SELECT * FROM seal_audit_log").all() as SealAuditRow[];
      const insertSeal = db.prepare(
        "INSERT OR IGNORE INTO audit_entries (id, tenant_id, actor_id, actor_role, event_type, entity_type, entity_id, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
      );
      const sealBackfill = db.transaction(() => {
        for (const row of sealRows) {
          const eventType = sealEventMap[row.event] ?? `seal.${row.event}`;
          const metadata = JSON.stringify({
            baseline_w: row.baseline_w,
            post_apply_w: row.post_apply_w,
            delta_l1: row.delta_l1,
            delta_l2: row.delta_l2,
            delta_l3: row.delta_l3,
            delta_composite: row.delta_composite,
            ...JSON.parse(row.detail_json || "{}"),
          });
          insertSeal.run(
            `seal-backfill-${row.id}`,
            row.tenant_id ?? "default-tenant",
            "system",
            "system",
            eventType,
            "seal_proposal",
            `seal_proposal:${row.proposal_id}`,
            metadata,
            row.timestamp
          );
        }
      });
      sealBackfill();
    }

    type AuditLogRow = {
      id: number;
      actor: string;
      action: string;
      target: string;
      detail: string | null;
      severity: string;
      timestamp: string;
    };
    const auditTableExists = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='audit_log'`)
      .get();
    if (auditTableExists) {
      const auditRows = db.prepare("SELECT * FROM audit_log").all() as AuditLogRow[];
      const insertAudit = db.prepare(
        "INSERT OR IGNORE INTO audit_entries (id, tenant_id, actor_id, actor_role, event_type, entity_type, entity_id, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
      );
      const auditBackfill = db.transaction(() => {
        for (const row of auditRows) {
          const metadata = JSON.stringify({
            severity: row.severity,
            legacy_action: row.action,
            legacy_detail: row.detail,
          });
          insertAudit.run(
            `audit-backfill-${row.id}`,
            "default-tenant",
            row.actor,
            "system",
            `agent.${row.action}`,
            "agent",
            `agent:${row.target}`,
            metadata,
            row.timestamp
          );
        }
      });
      auditBackfill();
    }

    db.prepare(`INSERT OR REPLACE INTO meta(key,value) VALUES('audit_entries_backfill_done','1')`).run();
  }

  // Phase 72: skill_registry — governed cross-harness skill contracts (SKILL-01, SKILL-02)
  // Additive DDL only. Imported content is stored as data; the parser never executes it.
  // Indexes support paginated list/search (source_harness, dispatch_status) per perf note.
  db.exec(`
    CREATE TABLE IF NOT EXISTS skill_registry (
      id                  INTEGER PRIMARY KEY,
      name                TEXT    NOT NULL,
      description         TEXT,
      owner               TEXT,
      source_harness      TEXT    NOT NULL,
      risk_tier           TEXT,
      dispatch_status     TEXT    NOT NULL DEFAULT 'incomplete'
                          CHECK(dispatch_status IN ('enabled','disabled','incomplete','review')),
      version             TEXT,
      preconditions       TEXT,
      allowed_tools       TEXT,
      verification_checks TEXT,
      rollback_behavior   TEXT,
      raw_body            TEXT    NOT NULL DEFAULT '',
      completeness_pct    INTEGER NOT NULL DEFAULT 0,
      missing_fields_json TEXT    NOT NULL DEFAULT '[]',
      imported_by         TEXT    NOT NULL,
      imported_at         TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      evidence_examples   TEXT,
      content_hash        TEXT,
      signature           TEXT,
      signed_by           TEXT,
      signed_at           TEXT,
      trust_level         TEXT    NOT NULL DEFAULT 'unsigned'
                          CHECK(trust_level IN ('unsigned','signed','verified')),
      public_key_fingerprint TEXT,
      UNIQUE(name, source_harness)
    );
    CREATE INDEX IF NOT EXISTS skill_registry_source_status
      ON skill_registry(source_harness, dispatch_status);
    CREATE INDEX IF NOT EXISTS skill_registry_dispatch
      ON skill_registry(dispatch_status, imported_at DESC);
    CREATE INDEX IF NOT EXISTS skill_registry_imported
      ON skill_registry(imported_at DESC);
  `);

  addSecurityLabelColumns(db);
  addEmbeddingProvenanceColumns(db);

  // Phase 85: SkillForge — governed skill optimization tables (SKILLFORGE-01)
  db.exec(`
    CREATE TABLE IF NOT EXISTS skillforge_proposals (
      id                  TEXT    PRIMARY KEY,
      seal_proposal_id    TEXT    REFERENCES seal_proposals(id),
      source_skill_id     TEXT    NOT NULL,
      source_version      TEXT    NOT NULL,
      proposed_diff       TEXT    NOT NULL,
      status              TEXT    NOT NULL DEFAULT 'pending'
                          CHECK(status IN ('pending','analyzing','eval_running','gated','pending_approval','approved','rejected','applied','exported')),
      edit_hash           TEXT,
      train_split_id      TEXT,
      validation_split_id TEXT,
      held_out_split_id   TEXT,
      baseline_w          REAL,
      validation_w        REAL,
      held_out_w          REAL,
      validation_results  TEXT,
      held_out_results    TEXT,
      w_delta             REAL,
      evaluator_receipts  TEXT    NOT NULL DEFAULT '[]',
      typed_edit_ops      TEXT    NOT NULL DEFAULT '[]',
      rejected_edits      TEXT    NOT NULL DEFAULT '[]',
      residual_risks      TEXT    NOT NULL DEFAULT '[]',
      created_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      updated_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );
  `);
  addSkillForgeTraceabilityColumns(db);

  db.exec(`
    CREATE INDEX IF NOT EXISTS skillforge_proposals_status
      ON skillforge_proposals(status, created_at DESC);
    CREATE INDEX IF NOT EXISTS skillforge_proposals_skill
      ON skillforge_proposals(source_skill_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS skillforge_proposals_edit_hash
      ON skillforge_proposals(edit_hash);

    CREATE TABLE IF NOT EXISTS skillforge_splits (
      id          TEXT    PRIMARY KEY,
      skill_id    TEXT    NOT NULL,
      split_type  TEXT    NOT NULL
                  CHECK(split_type IN ('train','validation','held_out')),
      task_samples TEXT   NOT NULL DEFAULT '[]',
      created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );
    CREATE INDEX IF NOT EXISTS skillforge_splits_skill
      ON skillforge_splits(skill_id, split_type);

    CREATE TABLE IF NOT EXISTS skillforge_rejected_edits (
      id          TEXT    PRIMARY KEY,
      skill_id    TEXT    NOT NULL,
      edit_hash   TEXT    NOT NULL UNIQUE,
      reason      TEXT    NOT NULL,
      rejected_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      expires_at  TEXT    NOT NULL
    );
    CREATE INDEX IF NOT EXISTS skillforge_rejected_edits_skill
      ON skillforge_rejected_edits(skill_id, expires_at);
    CREATE INDEX IF NOT EXISTS skillforge_rejected_edits_hash
      ON skillforge_rejected_edits(edit_hash);

    CREATE TABLE IF NOT EXISTS skillforge_run_log (
      id                  INTEGER PRIMARY KEY,
      run_id              TEXT    NOT NULL UNIQUE,
      started_at          TEXT    NOT NULL,
      completed_at        TEXT    NOT NULL,
      status              TEXT    NOT NULL
                          CHECK(status IN ('success','partial','failure')),
      entries_processed   INTEGER NOT NULL DEFAULT 0,
      proposals_created   INTEGER NOT NULL DEFAULT 0,
      proposals_submitted INTEGER NOT NULL DEFAULT 0,
      errors              TEXT    NOT NULL DEFAULT '[]'
    );
    CREATE INDEX IF NOT EXISTS skillforge_run_log_completed
      ON skillforge_run_log(completed_at DESC);

    -- Phase 92: Skill Marketplace tables
    CREATE TABLE IF NOT EXISTS skill_marketplace (
      id                TEXT    PRIMARY KEY,
      skill_id          TEXT    NOT NULL,
      name              TEXT    NOT NULL,
      description       TEXT    NOT NULL,
      author            TEXT    NOT NULL,
      tags              TEXT    NOT NULL DEFAULT '[]',
      version           TEXT    NOT NULL,
      changelog         TEXT    NOT NULL DEFAULT '',
      rating            REAL    NOT NULL DEFAULT 0
                        CHECK(rating >= 0 AND rating <= 5),
      review_count      INTEGER NOT NULL DEFAULT 0,
      download_count    INTEGER NOT NULL DEFAULT 0,
      category          TEXT    NOT NULL,
      published_at      TEXT    NOT NULL,
      updated_at        TEXT    NOT NULL,
      deprecated        INTEGER NOT NULL DEFAULT 0,
      deprecation_reason TEXT
    );
    CREATE INDEX IF NOT EXISTS skill_marketplace_category
      ON skill_marketplace(category, rating DESC);
    CREATE INDEX IF NOT EXISTS skill_marketplace_search
      ON skill_marketplace(name, description);

    CREATE TABLE IF NOT EXISTS skill_reviews (
      id          TEXT    PRIMARY KEY,
      listing_id  TEXT    NOT NULL REFERENCES skill_marketplace(id) ON DELETE CASCADE,
      reviewer    TEXT    NOT NULL,
      rating      INTEGER NOT NULL
                  CHECK(rating >= 1 AND rating <= 5),
      text        TEXT    NOT NULL,
      verified    INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT    NOT NULL
    );
    CREATE INDEX IF NOT EXISTS skill_reviews_listing
      ON skill_reviews(listing_id, created_at DESC);

    -- Phase 93: Multi-agent skill sync log
    CREATE TABLE IF NOT EXISTS skill_sync_log (
      id            INTEGER PRIMARY KEY,
      skill_id      TEXT    NOT NULL,
      target_agent  TEXT    NOT NULL,
      package_id    TEXT    NOT NULL,
      status        TEXT    NOT NULL DEFAULT 'pending'
                      CHECK(status IN ('pending','sent','confirmed','failed')),
      timestamp     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );
    CREATE INDEX IF NOT EXISTS skill_sync_log_skill
      ON skill_sync_log(skill_id, timestamp DESC);

    -- Phase 95: Eval receipts for local/cloud judge comparison
    CREATE TABLE IF NOT EXISTS eval_receipts (
      id          INTEGER PRIMARY KEY,
      skill_id    TEXT    NOT NULL,
      provider    TEXT    NOT NULL,
      model       TEXT    NOT NULL,
      dimensions  TEXT    NOT NULL,
      timestamp   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );
    CREATE INDEX IF NOT EXISTS eval_receipts_skill
      ON eval_receipts(skill_id, timestamp DESC);

    -- Phase 103: agent_checkpoints (AGENTMEM-FOLLOWUP-02)
    CREATE TABLE IF NOT EXISTS agent_checkpoints (
      id                        TEXT PRIMARY KEY,
      tenant_id                 TEXT NOT NULL DEFAULT 'default-tenant' REFERENCES tenants(id),
      run_id                    TEXT NOT NULL,
      owner_agent_id            TEXT NOT NULL,
      objective                 TEXT NOT NULL,
      completed_steps_json      TEXT NOT NULL DEFAULT '[]',
      remaining_steps_json      TEXT NOT NULL DEFAULT '[]',
      decisions_json            TEXT NOT NULL DEFAULT '{}',
      artifact_refs_json        TEXT NOT NULL DEFAULT '[]',
      verification_state_json   TEXT NOT NULL DEFAULT '{}',
      next_safe_action          TEXT NOT NULL,
      rollback_notes            TEXT,
      provenance_pointers_json  TEXT NOT NULL DEFAULT '[]',
      checkpoint_size           INTEGER NOT NULL DEFAULT 0,
      write_latency_ms          REAL NOT NULL DEFAULT 0,
      created_at                TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );
    CREATE INDEX IF NOT EXISTS agent_checkpoints_run
      ON agent_checkpoints(tenant_id, run_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS agent_checkpoints_agent
      ON agent_checkpoints(tenant_id, owner_agent_id, created_at DESC);

    -- Phase 104: agent_memory_traces (AGENTMEM-FOLLOWUP-03)
    CREATE TABLE IF NOT EXISTS agent_memory_traces (
      id                        TEXT PRIMARY KEY,
      tenant_id                 TEXT NOT NULL DEFAULT 'default-tenant' REFERENCES tenants(id),
      task_id                   TEXT,
      run_id                    TEXT NOT NULL,
      causal_path_json          TEXT NOT NULL,
      failure_classification    TEXT CHECK(failure_classification IN ('retrieval_miss','bad_ranking','stale_memory','corrupted_memory','policy_redaction','consolidation_error','benchmark_error','model_misuse')),
      root_cause                TEXT,
      replay_handle             TEXT,
      proposed_repair           TEXT,
      created_at                TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );
    CREATE INDEX IF NOT EXISTS agent_memory_traces_run
      ON agent_memory_traces(tenant_id, run_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS agent_memory_traces_task
      ON agent_memory_traces(tenant_id, task_id, created_at DESC);

    -- Phase 105: agent_versions (AGENTCICD-FOLLOWUP-01)
    CREATE TABLE IF NOT EXISTS agent_versions (
      id                        TEXT PRIMARY KEY,
      tenant_id                 TEXT NOT NULL DEFAULT 'default-tenant' REFERENCES tenants(id),
      agent_id                  TEXT NOT NULL,
      version                   TEXT NOT NULL,
      profile                   TEXT NOT NULL CHECK(profile IN ('local','dev','test','prod')),
      model_route_json          TEXT NOT NULL DEFAULT '{}',
      system_instructions       TEXT NOT NULL,
      skills_contracts_json     TEXT NOT NULL DEFAULT '[]',
      runtime_config_json       TEXT NOT NULL DEFAULT '{}',
      eval_dataset_versions_json TEXT NOT NULL DEFAULT '{}',
      policy_metadata_json      TEXT NOT NULL DEFAULT '{}',
      gates_status_json         TEXT NOT NULL DEFAULT '{}',
      status                    TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','promoted','active','rolled_back')),
      promoted_at               TEXT,
      promoted_by               TEXT,
      created_at                TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      updated_at                TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      UNIQUE(tenant_id, agent_id, version)
    );
    CREATE INDEX IF NOT EXISTS agent_versions_lookup
      ON agent_versions(tenant_id, agent_id, status, version DESC);
  `);

  try {
    db.exec("ALTER TABLE agent_versions ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''");
  } catch {
    // Column already exists.
  }

  // FTS projection repair is intentionally explicit. Rebuilding it here blocks
  // the Next.js event loop during cold starts and makes unrelated screens hang.
}
