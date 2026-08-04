import { createHash, randomUUID } from 'crypto';
import type Database from 'better-sqlite3';

import { initBehavioralJobSchema } from './seal/behavioral-schema';
import { assertNotDefaultInternalApiKey } from './internal-api-key';
import { scrubLegacyPackProvenance } from './ontology/pack-contract';
import { readVaultArtifact } from './vault/writer';

/**
 * Run a table rebuild with foreign_keys OFF, then restore prior state.
 * Must execute outside a transaction — SQLite silently ignores the pragma
 * inside a txn (Phase 199 criterion 6).
 */
export function withForeignKeysDisabled(db: Database.Database, fn: () => void): void {
  const wasOn = Boolean(db.pragma('foreign_keys', { simple: true }));
  try {
    db.pragma('foreign_keys = OFF');
    fn();
  } finally {
    if (wasOn) {
      db.pragma('foreign_keys = ON');
    }
  }
}

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

export const CURRENT_SCHEMA_VERSION = 39;

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
  {
    version: 12,
    name: 'skill-sync-governance-pins-proposals',
    up: applySkillSyncGovernanceSchema,
  },
  {
    version: 13,
    name: 'skill-sync-engine-state-table',
    up: applySkillSyncEngineSchema,
  },
  {
    version: 14,
    name: 'skill-lifecycle-states-and-dependencies',
    up: applySkillLifecycleSchema,
  },
  {
    version: 15,
    name: 'skill-pin-idempotency-keys',
    up: applySkillPinIdempotencySchema,
  },
  {
    version: 16,
    name: 'memory-retention-expiry-and-holds',
    up: applyMemoryRetentionLifecycleSchema,
  },
  {
    version: 17,
    name: 'memory-subject-erasure-decay',
    up: applyMemorySubjectErasureDecaySchema,
  },
  {
    version: 18,
    name: 'memory-consolidation-vault-dsar-offboarding-tombstones',
    up: applyMemoryConsolidationVaultDsarOffboardingTombstonesSchema,
  },
  {
    version: 19,
    name: 'memory-embedding-provenance-and-lifecycle',
    up: applyMemoryEmbeddingProvenanceSchema,
  },
  {
    version: 20,
    name: 'orch-msiq-adapter-and-federation',
    up: applyOrchMsiqAdapterAndFederationSchema,
  },
  {
    version: 21,
    name: 'orch-multihop-evidence-bundle-links',
    up: applyOrchMultihopEvidenceBundleSchema,
  },
  {
    version: 22,
    name: 'ontology-registry-versioning-packs',
    up: applyOntologyRegistrySchema,
  },
  {
    version: 23,
    name: 'ontology-candidates-seal-aliases-migrations',
    up: applyOntologyCandidateGovernanceSchema,
  },
  {
    version: 24,
    name: 'ontology-registry-pack-publication-hardening',
    up: applyOntologyRegistryPackHardeningSchema,
  },
  {
    version: 25,
    name: 'ontology-source-lifecycle-and-validity',
    up: applyOntologySourceLifecycleValiditySchema,
  },
  {
    version: 26,
    name: 'ontology-migration-snapshot-closure',
    up: applyOntologyMigrationSnapshotClosureSchema,
  },
  {
    version: 27,
    name: 'federation-action-proof-continuity',
    up: applyFederationActionProofContinuitySchema,
  },
  {
    version: 28,
    name: 'ontology-required-context-persistence',
    up: applyOntologyRequiredContextPersistenceSchema,
  },
  {
    version: 29,
    name: 'federation-admitted-coordinate-ledger',
    up: applyFederationAdmittedCoordinateLedgerSchema,
  },
  {
    version: 30,
    name: 'dsar-erasure-tombstones',
    up: applyDsarErasureTombstonesSchema,
  },
  {
    version: 31,
    name: 'graph-catchup-checkpoints',
    up: applyGraphCatchupCheckpointsSchema,
  },
  {
    version: 32,
    name: 'connector-sync-state',
    up: applyConnectorSyncStateSchema,
  },
  {
    version: 33,
    name: 'messages-fts-single-update-trigger',
    up: applyMessagesFtsUpdateTriggerFix,
  },
  {
    version: 34,
    name: 'user-identities-oidc',
    up: applyUserIdentitiesSchema,
  },
  {
    version: 35,
    name: 'mcp-oauth-authorization-server',
    up: applyMcpOauthSchema,
  },
  {
    version: 36,
    name: 'agent-shared-flag',
    up: applyAgentSharedFlagSchema,
  },
  {
    version: 37,
    name: 'agent-ownership-history',
    up: applyAgentOwnershipHistorySchema,
  },
  {
    version: 38,
    name: 'per-user-tool-connections',
    up: applyToolConnectionsSchema,
  },
  {
    version: 39,
    name: 'onboarding-token-nonces',
    up: applyOnboardingTokenNonceSchema,
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

/**
 * Migration 33 — repair messages_fts and stop it losing shared terms.
 *
 * The FTS triggers live in the main schema body, which only re-runs for a DB
 * below its migration version. An already-stamped database therefore keeps
 * whatever triggers it was created with, so editing the DDL in place fixes
 * new databases and silently leaves every existing one broken. This migration
 * is what actually reaches the deployed hosts.
 *
 * Two steps, and both are needed: recreate the triggers so no further updates
 * corrupt the index, then reproject, because fixing the trigger cannot restore
 * tokens already dropped.
 */
function applyMessagesFtsUpdateTriggerFix(db: Database.Database): void {
  db.exec(`
    DROP TRIGGER IF EXISTS messages_au;
    DROP TRIGGER IF EXISTS messages_au_delete;
    DROP TRIGGER IF EXISTS messages_au_insert;

    CREATE TRIGGER messages_au AFTER UPDATE ON messages
    BEGIN
      INSERT INTO messages_fts(messages_fts, rowid, content, project, timestamp, agent_id)
      SELECT 'delete', old.id, old.content, old.project, old.timestamp, old.agent_id
      WHERE old.policy = 'indexable'
        AND old.visibility IN ('internal','public_safe','public_approved');

      INSERT INTO messages_fts(rowid, content, project, timestamp, agent_id)
      SELECT new.id, new.content, new.project, new.timestamp, new.agent_id
      WHERE new.policy = 'indexable'
        AND new.visibility IN ('internal','public_safe','public_approved');
    END;
  `);

  // Reproject rather than 'rebuild': the projection is label-filtered, so a
  // bare rebuild would index rows the triggers deliberately exclude (sealed,
  // private) and make them searchable — turning an index repair into a
  // disclosure. rebuildMessageFtsProjection applies the same predicate the
  // triggers do.
  rebuildMessageFtsProjection(db);
}

/**
 * Migration 34 — create user_identities on already-stamped databases.
 *
 * Phase 203 added the table to the main schema body only. That body re-runs
 * for a database below its migration version, so fresh installs got the table
 * and every existing deployment silently did not — the same trap migration 33
 * documents. oracle-1 sat at version 33 and returned HTTP 500 on the Google
 * callback with `no such table: user_identities` for exactly this reason.
 *
 * The DDL is a verbatim copy of the main-body definition; keep them identical
 * so a fresh install and a migrated one converge on the same shape.
 */
function applyUserIdentitiesSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_identities (
      provider   TEXT NOT NULL CHECK(provider IN ('google')),
      subject    TEXT NOT NULL,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      PRIMARY KEY (provider, subject)
    );
    CREATE INDEX IF NOT EXISTS user_identities_user ON user_identities(user_id);
  `);
}

/**
 * Migration 35 — MCP OAuth authorization-server storage.
 *
 * Claude's custom-connector flow self-registers via RFC 7591, so clients are
 * created at runtime rather than configured ahead of time and need a home.
 *
 * Codes and tokens are stored **hashed**: this table is a credential store, and
 * a database read should not yield usable credentials. Both carry explicit
 * expiry plus a consumed/revoked stamp so a leaked code cannot be replayed and
 * a session can be cut off without waiting for expiry.
 */
function applyMcpOauthSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS mcp_oauth_clients (
      client_id          TEXT PRIMARY KEY,
      client_secret_hash TEXT,
      client_name        TEXT NOT NULL DEFAULT '',
      redirect_uris      TEXT NOT NULL DEFAULT '[]',
      created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      last_used_at       TEXT
    );

    CREATE TABLE IF NOT EXISTS mcp_oauth_codes (
      code_hash      TEXT PRIMARY KEY,
      client_id      TEXT NOT NULL REFERENCES mcp_oauth_clients(client_id) ON DELETE CASCADE,
      user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      redirect_uri   TEXT NOT NULL,
      code_challenge TEXT NOT NULL,
      scope          TEXT NOT NULL DEFAULT '',
      expires_at     TEXT NOT NULL,
      consumed_at    TEXT,
      created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );
    CREATE INDEX IF NOT EXISTS mcp_oauth_codes_client ON mcp_oauth_codes(client_id);

    CREATE TABLE IF NOT EXISTS mcp_oauth_tokens (
      token_hash TEXT PRIMARY KEY,
      client_id  TEXT NOT NULL REFERENCES mcp_oauth_clients(client_id) ON DELETE CASCADE,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind       TEXT NOT NULL CHECK(kind IN ('access','refresh')),
      scope      TEXT NOT NULL DEFAULT '',
      expires_at TEXT NOT NULL,
      revoked_at TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      last_used_at TEXT
    );
    CREATE INDEX IF NOT EXISTS mcp_oauth_tokens_user ON mcp_oauth_tokens(user_id, revoked_at);
    CREATE INDEX IF NOT EXISTS mcp_oauth_tokens_client ON mcp_oauth_tokens(client_id, revoked_at);
  `);
}

/**
 * Migration 36 — shared-agent flag.
 *
 * Ownership itself already exists: `registered_agents.owner_id` was added as an
 * additive column (REFERENCES users(id) ON DELETE SET NULL) and is populated
 * nowhere — every row is NULL, which is why every signed-in user could list the
 * whole fleet. No new ownership column is needed; the gap was that nothing wrote
 * to it and nothing filtered on it.
 *
 * SET NULL rather than CASCADE is the right existing behaviour and is kept:
 * hard-deleting a person should orphan their agents into an admin-only "needs an
 * owner" state that can be transferred, not silently destroy them.
 *
 * `is_shared` is the deliberate escape hatch from private-by-default. Sharing has
 * to be an explicit act by the owner rather than a side effect of belonging to the
 * same team — which is how "private" quietly stops being true.
 */
function applyAgentSharedFlagSchema(db: Database.Database): void {
  // A migration must tolerate a database that predates the table it alters —
  // partial fixtures and older installs both hit this, and throwing here would
  // block every later migration behind it.
  const tableExists = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'registered_agents'")
    .get();
  if (!tableExists) return;

  const columns = db.prepare("PRAGMA table_info(registered_agents)").all() as Array<{ name: string }>;
  if (!columns.some((c) => c.name === "is_shared")) {
    db.exec(
      `ALTER TABLE registered_agents
         ADD COLUMN is_shared INTEGER NOT NULL DEFAULT 0 CHECK(is_shared IN (0,1))`
    );
  }
  db.exec(
    `CREATE INDEX IF NOT EXISTS registered_agents_owner
       ON registered_agents(owner_id, deregistered_at);
     CREATE INDEX IF NOT EXISTS registered_agents_shared
       ON registered_agents(is_shared, deregistered_at);`
  );
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
/**
 * Who used to own an agent.
 *
 * `registered_agents.owner_id` only ever holds the current owner, and deleting
 * an agent takes even that away — so "who was responsible for this thing?"
 * became unanswerable exactly when it mattered most. This table outlives the
 * agent: no FK to registered_agents, so a hard delete leaves the trail intact.
 *
 * The FK to users is ON DELETE SET NULL for the same reason the agent's own
 * owner_id is: losing the person must not erase the record that they held it.
 */
function applyAgentOwnershipHistorySchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_ownership_history (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id    TEXT NOT NULL,
      agent_name  TEXT,
      owner_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
      owner_email TEXT,
      event       TEXT NOT NULL CHECK(event IN ('claimed','transferred','released','agent_deleted')),
      actor_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
      note        TEXT,
      recorded_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_agent_ownership_history_agent
      ON agent_ownership_history(agent_id, recorded_at);
  `);
}

/**
 * Phase 227: give each vault/Nango tool connection a local identity and an
 * accountable owner. Existing installations are deliberately shared and
 * marked for repair so the migration preserves their current behaviour while
 * making the missing ownership visible to the console.
 */
function applyToolConnectionsSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tool_connections (
      id                   TEXT PRIMARY KEY,
      provider_key         TEXT NOT NULL,
      auth_mode            TEXT NOT NULL CHECK(auth_mode IN ('oauth','api-key')),
      owner_id             TEXT REFERENCES users(id) ON DELETE SET NULL,
      is_shared            INTEGER NOT NULL DEFAULT 0 CHECK(is_shared IN (0,1)),
      needs_owner          INTEGER NOT NULL DEFAULT 0 CHECK(needs_owner IN (0,1)),
      nango_connection_id  TEXT,
      vault_artifact_id    TEXT,
      account_email        TEXT,
      created_at           TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS tool_connections_provider
      ON tool_connections(provider_key);
    CREATE INDEX IF NOT EXISTS tool_connections_owner
      ON tool_connections(owner_id);
    CREATE UNIQUE INDEX IF NOT EXISTS tool_connections_nango_connection
      ON tool_connections(nango_connection_id)
      WHERE nango_connection_id IS NOT NULL;
    CREATE TRIGGER IF NOT EXISTS tool_connections_owner_orphaned
      AFTER UPDATE OF owner_id ON tool_connections
      WHEN NEW.owner_id IS NULL AND OLD.owner_id IS NOT NULL
      BEGIN
        UPDATE tool_connections SET needs_owner = 1 WHERE id = NEW.id;
      END;
  `);

  const tableExists = (name: string): boolean => Boolean(
    db
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(name),
  );
  const hasUsers = tableExists('users');
  const hasUserRoles = tableExists('user_roles');
  const hasRawArtifacts = tableExists('raw_artifacts');

  const admin = hasUsers && hasUserRoles
    ? db
        .prepare(
          `SELECT u.id
           FROM users u
           JOIN user_roles ur ON ur.user_id = u.id
           WHERE ur.role = 'admin' AND u.disabled_at IS NULL
           ORDER BY u.created_at ASC, u.id ASC
           LIMIT 1`,
        )
        .get() as { id: string } | undefined
    : undefined;

  // Partial historical fixtures can be stamped at an old version without
  // the baseline vault tables. The migration still creates its own table and
  // simply has nothing to backfill in that shape.
  if (!hasRawArtifacts) return;

  const legacyRows = db
    .prepare(
      `SELECT id, source_id, artifact_path, created_at
       FROM raw_artifacts
       WHERE source_type = 'tool_connection'
       ORDER BY created_at ASC, id ASC`,
    )
    .all() as Array<{
      id: string;
      source_id: string | null;
      artifact_path: string;
      created_at: string;
    }>;

  const hasArtifact = db.prepare(
    `SELECT 1 FROM tool_connections WHERE vault_artifact_id = ? LIMIT 1`,
  );
  const hasNango = db.prepare(
    `SELECT 1 FROM tool_connections WHERE nango_connection_id = ? LIMIT 1`,
  );
  const insert = db.prepare(`
    INSERT INTO tool_connections
      (id, provider_key, auth_mode, owner_id, is_shared, needs_owner,
       nango_connection_id, vault_artifact_id, account_email, created_at)
    VALUES (?, ?, ?, ?, 1, 1, ?, ?, ?, ?)
  `);

  for (const row of legacyRows) {
    if (hasArtifact.get(row.id)) continue;

    let record: { providerKey?: unknown; authMode?: unknown; nangoConnectionId?: unknown; accountEmail?: unknown } = {};
    try {
      record = JSON.parse(readVaultArtifact(db, row.id).body) as typeof record;
    } catch {
      // Keep malformed or unavailable legacy metadata adoptable below.
    }

    const providerKey = typeof record.providerKey === 'string' && record.providerKey
      ? record.providerKey
      : row.source_id ?? 'unknown';
    const authMode = record.authMode === 'api-key' ? 'api-key' : 'oauth';
    const nangoConnectionId = typeof record.nangoConnectionId === 'string' && record.nangoConnectionId
      ? record.nangoConnectionId
      : null;
    if (nangoConnectionId && hasNango.get(nangoConnectionId)) continue;

    insert.run(
      randomUUID(),
      providerKey,
      authMode,
      admin?.id ?? null,
      nangoConnectionId,
      row.id,
      typeof record.accountEmail === 'string' ? record.accountEmail : null,
      row.created_at,
    );
  }
}

/** Migration 39 — single-use onboarding token nonce storage. */
function applyOnboardingTokenNonceSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS onboarding_token_nonces (
      nonce       TEXT PRIMARY KEY,
      agent_id    TEXT,
      consumed_at TEXT NOT NULL,
      expires_at  TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS onboarding_token_nonces_expiry
      ON onboarding_token_nonces(expires_at);
  `);
}

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

  if (rows.length > 0) {
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

  // SKILLTRUST-03 quarantine pipeline: rebuild skill_registry so the
  // dispatch_status CHECK constraint accepts 'quarantined'. SQLite cannot
  // ALTER a CHECK in place, so we follow the same pattern used for
  // hive_delegations: CREATE TABLE _new, INSERT SELECT, DROP, RENAME.
  // Guarded by a meta flag so subsequent migrations are no-ops.
  // VAL-SKILL-040: Fix idempotent guard and make DROP FK-safe.
  const quarantineCheckMigrated = db
    .prepare(
      `SELECT value FROM meta WHERE key = 'skill_registry_quarantine_check_v1'`
    )
    .get() as { value: string } | undefined;

  if (!quarantineCheckMigrated) {
    // Additional idempotency: if sqlite_master already contains the quarantined CHECK, skip rebuild.
    const registrySql = db
      .prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'skill_registry'`)
      .get() as { sql: string } | undefined;
    const alreadyHasQuarantined = registrySql?.sql?.includes("'quarantined'") ?? false;

    if (!alreadyHasQuarantined) {
      const columns = db
        .prepare(`PRAGMA table_info(skill_registry)`)
        .all() as Array<{ name: string }>;
      const columnNames = columns.map((c) => c.name);

      // Defensive: skip if the new column set is missing (e.g. partial
      // migration on a test DB that hasn't applied v11 yet).
      const required = [
        "id",
        "name",
        "description",
        "owner",
        "source_harness",
        "risk_tier",
        "dispatch_status",
        "version",
        "preconditions",
        "allowed_tools",
        "verification_checks",
        "rollback_behavior",
        "raw_body",
        "completeness_pct",
        "missing_fields_json",
        "imported_by",
        "imported_at",
        "evidence_examples",
        "content_hash",
        "signature",
        "signed_by",
        "signed_at",
        "trust_level",
        "public_key_fingerprint",
      ];
      const missing = required.filter((col) => !columnNames.includes(col));

      if (missing.length === 0) {
        const quotedColumns = required.map((c) => `"${c}"`).join(", ");

        // VAL-SKILL-040 / Phase 199: FK-safe rebuild outside a transaction.
        withForeignKeysDisabled(db, () => {
          db.exec(`
            CREATE TABLE skill_registry_new (
              id                  INTEGER PRIMARY KEY,
              name                TEXT    NOT NULL,
              description         TEXT,
              owner               TEXT,
              source_harness      TEXT    NOT NULL,
              risk_tier           TEXT,
              dispatch_status     TEXT    NOT NULL DEFAULT 'incomplete'
                                  CHECK(dispatch_status IN ('enabled','disabled','incomplete','review','quarantined')),
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

            INSERT INTO skill_registry_new (${quotedColumns})
              SELECT ${quotedColumns} FROM skill_registry;
            DROP TABLE skill_registry;
            ALTER TABLE skill_registry_new RENAME TO skill_registry;
          `);
        });
      }
    }

    db.prepare(
      `INSERT OR REPLACE INTO meta(key,value) VALUES('skill_registry_quarantine_check_v1','1')`
    ).run();
  }

  // SKILLTRUST-03 quarantine lane: skill_quarantine table persists every
  // stage transition for imported skills. The table is keyed on skill_id
  // (FK to skill_registry.id) and stores the full audit trail: scanner
  // output, eval score, approval decision, rejection reason, and the
  // operator who signed off. Approval status follows three values:
  // pending -> approved | rejected.
  db.exec(`
    CREATE TABLE IF NOT EXISTS skill_quarantine (
      id                INTEGER PRIMARY KEY,
      skill_id          INTEGER NOT NULL UNIQUE
                        REFERENCES skill_registry(id) ON DELETE CASCADE,
      stage             TEXT    NOT NULL DEFAULT 'imported'
                        CHECK(stage IN (
                          'imported','scanning','eval_sandbox',
                          'pending_approval','enabled','rejected'
                        )),
      scanner_result    TEXT    NOT NULL DEFAULT '{}',
      eval_score        REAL,
      approval_status   TEXT    NOT NULL DEFAULT 'pending'
                        CHECK(approval_status IN ('pending','approved','rejected')),
      approved_by       TEXT,
      approved_at       TEXT,
      rejection_reason  TEXT,
      created_at        TEXT    NOT NULL
                        DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      updated_at        TEXT    NOT NULL
                        DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );
    CREATE INDEX IF NOT EXISTS skill_quarantine_stage
      ON skill_quarantine(stage, updated_at DESC);
    CREATE INDEX IF NOT EXISTS skill_quarantine_approval
      ON skill_quarantine(approval_status, updated_at DESC);
  `);
}

function applySkillSyncGovernanceSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS skill_import_proposals (
      id                    TEXT    PRIMARY KEY,
      source_harness        TEXT    NOT NULL,
      skill_name            TEXT    NOT NULL,
      skill_identity        TEXT    NOT NULL,
      current_content_hash  TEXT,
      detected_content_hash TEXT    NOT NULL,
      prior_content_hash    TEXT,
      prior_version         TEXT,
      version               TEXT,
      diff_summary          TEXT    NOT NULL DEFAULT '',
      diff_payload          TEXT    NOT NULL DEFAULT '{}',
      status                TEXT    NOT NULL DEFAULT 'pending'
                            CHECK(status IN ('pending','approved','rejected')),
      proposed_by           TEXT    NOT NULL,
      proposed_at           TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      decided_by            TEXT,
      decided_at            TEXT,
      decision_reason       TEXT,
      affected_skill_id     INTEGER REFERENCES skill_registry(id) ON DELETE SET NULL,
      created_at            TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      updated_at            TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      UNIQUE(source_harness, skill_name, detected_content_hash)
    );
    CREATE INDEX IF NOT EXISTS skill_import_proposals_status
      ON skill_import_proposals(status);
    CREATE INDEX IF NOT EXISTS skill_import_proposals_harness_name
      ON skill_import_proposals(source_harness, skill_name);

    CREATE TABLE IF NOT EXISTS skill_version_pins (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id              TEXT    NOT NULL REFERENCES registered_agents(id) ON DELETE CASCADE,
      skill_name            TEXT    NOT NULL,
      skill_id              INTEGER REFERENCES skill_registry(id) ON DELETE SET NULL,
      current_version       TEXT    NOT NULL,
      current_content_hash  TEXT    NOT NULL,
      prior_version         TEXT,
      prior_content_hash    TEXT,
      prior_skill_id        INTEGER REFERENCES skill_registry(id) ON DELETE SET NULL,
      actor                 TEXT    NOT NULL,
      created_at            TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      updated_at            TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      rolled_back_at        TEXT,
      rolled_back_by        TEXT,
      last_rollback_event_id TEXT,
      UNIQUE(agent_id, skill_name)
    );
    CREATE INDEX IF NOT EXISTS skill_version_pins_agent
      ON skill_version_pins(agent_id);
  `);
}

// Phase 149 / SKILLTRUST-04 — Governed cross-harness sync engine.
//
// skill_sync_state is the per-(skill_name, source_harness) observability
// + proposal ledger for the auto-sync engine. A row tracks:
//   - the last_synced_hash (the hash that has been approved and applied to
//     the registry),
//   - a pending_proposal_id (UUID) plus the detected hash/version/diff that
//     are waiting for operator action,
//   - a version_pinned_to (TEXT) — when set, no new drift proposals are
//     created for this (skill_name, source_harness),
//   - last_check_at (timestamp of the most recent scan),
//   - prior_* fields for one-step rollback to the version that was current
//     immediately before the most recent approved proposal.
//
// All sync operations are additive and idempotent: re-running a check with
// no changes does not duplicate a pending proposal, and re-running a check
// with the same detected hash while a proposal is already pending returns
// the existing row. The table is the source of truth for "is this skill
// drifted?" — callers can derive drift=true when pending_proposal_id is set
// AND last_synced_hash != pending_detected_hash.
function applySkillSyncEngineSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS skill_sync_state (
      skill_name                TEXT    NOT NULL,
      source_harness            TEXT    NOT NULL,
      last_synced_hash          TEXT,
      pending_proposal_id       TEXT,
      pending_detected_hash     TEXT,
      pending_detected_version  TEXT,
      pending_diff_summary      TEXT    NOT NULL DEFAULT '',
      pending_diff_payload      TEXT    NOT NULL DEFAULT '{}',
      pending_proposed_by       TEXT,
      pending_proposed_at       TEXT,
      version_pinned_to         TEXT,
      last_check_at             TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      prior_version             TEXT,
      prior_content_hash        TEXT,
      prior_skill_id            INTEGER REFERENCES skill_registry(id) ON DELETE SET NULL,
      approved_by               TEXT,
      approved_at               TEXT,
      rejected_by               TEXT,
      rejected_at               TEXT,
      rejection_reason          TEXT,
      created_at                TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      updated_at                TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      PRIMARY KEY (skill_name, source_harness)
    );
    CREATE INDEX IF NOT EXISTS skill_sync_state_pending
      ON skill_sync_state(pending_proposal_id) WHERE pending_proposal_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS skill_sync_state_pin
      ON skill_sync_state(version_pinned_to) WHERE version_pinned_to IS NOT NULL;
    CREATE INDEX IF NOT EXISTS skill_sync_state_checked
      ON skill_sync_state(last_check_at DESC);
  `);
}

// Phase 150 / SKILLTRUST-05 — Skill Lifecycle Manager.
//
// Adds the lifecycle_state column to skill_registry with a CHECK constraint
// limiting values to draft|enabled|deprecated|retired. Backfills from
// dispatch_status so existing v13 rows remain dispatchable: rows with
// dispatch_status='enabled' map to lifecycle_state='enabled', all others
// map to 'draft'.
//
// Two new tables join to skill_registry.id:
//
//   skill_dependencies   -- durable ledger of agents that depend on a skill,
//                            with the skill_version they were last known to
//                            rely on. Used by transitionLifecycleState() to
//                            block deprecated -> retired when dependents
//                            still exist, and by getDependents() to surface
//                            the dependency graph.
//
//   skill_lifecycle_audit -- append-only transition log. Every state change
//                            records (skill_id, from_state, to_state, actor,
//                            reason, transitioned_at). The
//                            audit_entries table also receives a paired
//                            skill_lifecycle_transitioned row so existing
//                            audit-trail queries surface lifecycle events.
//
// All DDL is idempotent (ALTER wrapped in try/catch; CREATE TABLE IF NOT
// EXISTS). The migration may be re-run safely on already-migrated DBs.
function applySkillLifecycleSchema(db: Database.Database): void {
  // 1. Add lifecycle_state column if missing. The DEFAULT 'draft' is the
  //    safe initial value for any row that predates the migration. The
  //    inline CHECK at ALTER time enforces the lifecycle state enum so
  //    SQLite refuses INSERT/UPDATE values outside the canonical set
  //    without needing a v11-style table-rebuild.
  let needsBackfill = false;
  try {
    db.exec(
      "ALTER TABLE skill_registry ADD COLUMN lifecycle_state TEXT NOT NULL DEFAULT 'draft' " +
      "CHECK(lifecycle_state IN ('draft','enabled','deprecated','retired'))"
    );
    needsBackfill = true;
  } catch {
    // Column already exists; the backfill below is a no-op because all rows
    // are already populated.
  }

  // 2. CHECK constraint: the column-constraint CHECK added in step 1
  //    is sufficient. The v11-style table-rebuild (CREATE _new, INSERT
  //    SELECT, DROP, RENAME) is intentionally NOT performed because it
  //    can desynchronize the skill_quarantine foreign key on databases
  //    that already ran v11+. The column-constraint CHECK is enforced
  //    by SQLite at INSERT/UPDATE time regardless of whether the table
  //    was rebuilt. sqlite_master.sql will surface the lifecycle_state
  //    column + its inline CHECK constraint alongside the existing
  //    dispatch_status CHECK on a fresh install.
  // Note: the meta flag below is intentionally a no-op marker retained
  // for parity with the v11 quarantine CHECK rebuild so external
  // tooling that watches `meta` keys continues to see a recorded flag.
  db.prepare(
    `INSERT OR IGNORE INTO meta(key,value) VALUES('skill_registry_lifecycle_check_v14','1')`
  ).run();

  // 3. Backfill lifecycle_state from dispatch_status for legacy rows.
  //    The DEFAULT 'draft' already handled most rows; this only touches
  //    rows whose dispatch_status='enabled' so they map to
  //    lifecycle_state='enabled' and the SQL gate keeps dispatching them.
  if (needsBackfill) {
    db.exec(
      `UPDATE skill_registry
          SET lifecycle_state = 'enabled'
        WHERE dispatch_status = 'enabled'
          AND lifecycle_state = 'draft'`
    );
  }

  // 4. New tables — both idempotent so re-running the migration is safe.
  db.exec(`
    CREATE TABLE IF NOT EXISTS skill_dependencies (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      skill_id              INTEGER NOT NULL
                            REFERENCES skill_registry(id) ON DELETE CASCADE,
      dependent_agent_id    TEXT    NOT NULL,
      skill_version         TEXT    NOT NULL,
      registered_by         TEXT    NOT NULL,
      created_at            TEXT    NOT NULL
                            DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      updated_at            TEXT    NOT NULL
                            DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      UNIQUE(skill_id, dependent_agent_id)
    );
    CREATE INDEX IF NOT EXISTS skill_dependencies_skill
      ON skill_dependencies(skill_id);
    CREATE INDEX IF NOT EXISTS skill_dependencies_agent
      ON skill_dependencies(dependent_agent_id);

    CREATE TABLE IF NOT EXISTS skill_lifecycle_audit (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      skill_id         INTEGER NOT NULL
                       REFERENCES skill_registry(id) ON DELETE CASCADE,
      from_state       TEXT    NOT NULL,
      to_state         TEXT    NOT NULL,
      actor            TEXT    NOT NULL,
      reason           TEXT    NOT NULL DEFAULT '',
      transitioned_at  TEXT    NOT NULL
                       DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );
    CREATE INDEX IF NOT EXISTS skill_lifecycle_audit_skill
      ON skill_lifecycle_audit(skill_id, transitioned_at DESC);
    CREATE INDEX IF NOT EXISTS skill_lifecycle_audit_to_state
      ON skill_lifecycle_audit(to_state, transitioned_at DESC);
  `);
}

// Phase 149 (continued) / SKILLTRUST-04 — Pin idempotency keys.
//
// VAL-SKILL-030 requires that the same idempotency key produces one
// logical pin transition. We persist seen idempotency keys in a
// dedicated table so retries with the same key are recognized as
// duplicates and the same pin row is returned instead of being
// recreated (or rotated) under the agent.
//
// Each row records:
//   - id: deterministic key, unique per (agent_id, skill_name, key) tuple
//   - agent_id / skill_name: the pin target
//   - pin_id: the VersionPinRow id that was produced on first use
//   - request_hash: a content hash of the request body fields, so
//     reusing a key with a different body surfaces as a conflict
//   - created_at: when the key was first observed
//
// The table is keyed on (agent_id, skill_name, idempotency_key) so the
// first write wins; a UNIQUE constraint surfaces duplicate-key races
// as SQLite errors so the route can return 409 without rotating the
// pin.
function applySkillPinIdempotencySchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS skill_pin_idempotency_keys (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id          TEXT    NOT NULL,
      skill_name        TEXT    NOT NULL,
      idempotency_key   TEXT    NOT NULL,
      pin_id            INTEGER NOT NULL
                        REFERENCES skill_version_pins(id) ON DELETE CASCADE,
      request_hash      TEXT    NOT NULL,
      created_at        TEXT    NOT NULL
                        DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      UNIQUE(agent_id, skill_name, idempotency_key)
    );
    CREATE INDEX IF NOT EXISTS skill_pin_idempotency_keys_key
      ON skill_pin_idempotency_keys(idempotency_key);
  `);
}

function applyMemoryRetentionLifecycleSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS memory_retention_policies (
      id                   TEXT PRIMARY KEY,
      tenant_id            TEXT NOT NULL DEFAULT 'default-tenant',
      name                 TEXT NOT NULL,
      version              TEXT NOT NULL,
      ontology_type        TEXT NOT NULL,
      security_label_json  TEXT NOT NULL DEFAULT '{}',
      purpose              TEXT NOT NULL,
      scope_json           TEXT NOT NULL DEFAULT '{}',
      priority             INTEGER NOT NULL DEFAULT 0,
      duration_days        INTEGER NOT NULL CHECK(duration_days >= 0),
      action               TEXT NOT NULL DEFAULT 'expire'
                           CHECK(action IN ('expire','tombstone','review')),
      enabled              INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
      created_by           TEXT NOT NULL,
      created_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      updated_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      UNIQUE(tenant_id, name, version)
    );
    CREATE INDEX IF NOT EXISTS memory_retention_policies_lookup
      ON memory_retention_policies(tenant_id, enabled, ontology_type, purpose, priority DESC);

    CREATE TABLE IF NOT EXISTS memory_retention_records (
      id                   TEXT PRIMARY KEY,
      tenant_id            TEXT NOT NULL DEFAULT 'default-tenant',
      record_type          TEXT NOT NULL,
      record_id            TEXT NOT NULL,
      ontology_type        TEXT NOT NULL,
      security_label_json  TEXT NOT NULL DEFAULT '{}',
      purpose              TEXT NOT NULL,
      scope_json           TEXT NOT NULL DEFAULT '{}',
      policy_id            TEXT REFERENCES memory_retention_policies(id),
      policy_version       TEXT,
      retention_deadline   TEXT,
      status               TEXT NOT NULL DEFAULT 'active'
                           CHECK(status IN ('active','expired','policy_unavailable','failed')),
      content_hash         TEXT,
      created_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      updated_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      expired_at           TEXT,
      UNIQUE(tenant_id, record_type, record_id)
    );
    CREATE INDEX IF NOT EXISTS memory_retention_records_due
      ON memory_retention_records(tenant_id, status, retention_deadline);
    CREATE INDEX IF NOT EXISTS memory_retention_records_policy
      ON memory_retention_records(policy_id, policy_version);

    CREATE TABLE IF NOT EXISTS memory_legal_holds (
      id                   TEXT PRIMARY KEY,
      tenant_id            TEXT NOT NULL DEFAULT 'default-tenant',
      scope_json           TEXT NOT NULL DEFAULT '{}',
      reason_code          TEXT NOT NULL,
      created_by           TEXT NOT NULL,
      created_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      updated_by           TEXT,
      updated_at           TEXT,
      released_by          TEXT,
      released_at          TEXT,
      expires_at           TEXT,
      status               TEXT NOT NULL DEFAULT 'active'
                           CHECK(status IN ('active','released','expired'))
    );
    CREATE INDEX IF NOT EXISTS memory_legal_holds_scope
      ON memory_legal_holds(tenant_id, status, expires_at);

    CREATE TABLE IF NOT EXISTS memory_retention_expiry_runs (
      run_key              TEXT PRIMARY KEY,
      tenant_id            TEXT NOT NULL DEFAULT 'default-tenant',
      lease_owner          TEXT NOT NULL,
      lease_expires_at     TEXT NOT NULL,
      status               TEXT NOT NULL
                           CHECK(status IN ('running','completed','failed')),
      scope_json           TEXT NOT NULL DEFAULT '{}',
      started_at           TEXT NOT NULL,
      completed_at         TEXT,
      summary_json         TEXT NOT NULL DEFAULT '{}',
      error_message        TEXT
    );
    CREATE INDEX IF NOT EXISTS memory_retention_expiry_runs_tenant
      ON memory_retention_expiry_runs(tenant_id, started_at DESC);

    CREATE TABLE IF NOT EXISTS memory_retention_receipts (
      id                        TEXT PRIMARY KEY,
      tenant_id                 TEXT NOT NULL DEFAULT 'default-tenant',
      run_key                   TEXT,
      record_type               TEXT NOT NULL,
      record_id                 TEXT NOT NULL,
      policy_id                 TEXT,
      policy_version            TEXT,
      decision                  TEXT NOT NULL
                                CHECK(decision IN ('active','expired','held','skipped_future','skipped_already_expired','policy_unavailable','conflict','failed','retried')),
      reason                    TEXT NOT NULL,
      actor_id                  TEXT NOT NULL,
      scope_hash                TEXT NOT NULL,
      derivative_outcomes_json  TEXT NOT NULL DEFAULT '[]',
      metadata_json             TEXT NOT NULL DEFAULT '{}',
      created_at                TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      UNIQUE(run_key, record_type, record_id, decision, reason)
    );
    CREATE INDEX IF NOT EXISTS memory_retention_receipts_record
      ON memory_retention_receipts(tenant_id, record_type, record_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS memory_retention_receipts_run
      ON memory_retention_receipts(run_key, created_at DESC);
  `);
}


function applyMemorySubjectErasureDecaySchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS memory_erasure_reports (
      id                   TEXT PRIMARY KEY,
      tenant_id            TEXT NOT NULL DEFAULT 'default-tenant',
      canonical_id         TEXT NOT NULL,
      status               TEXT NOT NULL
                           CHECK(status IN ('completed','failed','pending','incomplete')),
      store_outcomes_json  TEXT NOT NULL DEFAULT '[]',
      actor_id             TEXT NOT NULL,
      scope_hash           TEXT NOT NULL,
      started_at           TEXT NOT NULL,
      completed_at         TEXT
    );
    CREATE INDEX IF NOT EXISTS memory_erasure_reports_tenant
      ON memory_erasure_reports(tenant_id, started_at DESC);
    CREATE INDEX IF NOT EXISTS memory_erasure_reports_canonical
      ON memory_erasure_reports(tenant_id, canonical_id, started_at DESC);

    CREATE TABLE IF NOT EXISTS memory_subject_erasure_plans (
      id                       TEXT PRIMARY KEY,
      tenant_id                TEXT NOT NULL DEFAULT 'default-tenant',
      subject_hash             TEXT NOT NULL,
      selector_hashes_json     TEXT NOT NULL DEFAULT '{}',
      status                   TEXT NOT NULL DEFAULT 'planned'
                               CHECK(status IN ('planned','approved','executing','completed','incomplete','blocked','failed','denied','ambiguous')),
      scope_json               TEXT NOT NULL DEFAULT '{}',
      scope_hash               TEXT NOT NULL,
      matched_records_json     TEXT NOT NULL DEFAULT '[]',
      excluded_records_json    TEXT NOT NULL DEFAULT '[]',
      coverage_json            TEXT NOT NULL DEFAULT '[]',
      holds_json               TEXT NOT NULL DEFAULT '[]',
      policy_json              TEXT NOT NULL DEFAULT '{}',
      estimated_effects_json   TEXT NOT NULL DEFAULT '{}',
      plan_hash                TEXT NOT NULL,
      source_version_hash      TEXT NOT NULL,
      created_by               TEXT NOT NULL,
      created_at               TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      reviewed_by              TEXT,
      reviewed_at              TEXT,
      executed_by              TEXT,
      executed_at              TEXT,
      result_json              TEXT,
      updated_at               TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      UNIQUE(tenant_id, plan_hash)
    );
    CREATE INDEX IF NOT EXISTS memory_subject_erasure_plans_tenant_status
      ON memory_subject_erasure_plans(tenant_id, status, created_at DESC);
    CREATE INDEX IF NOT EXISTS memory_subject_erasure_plans_subject
      ON memory_subject_erasure_plans(tenant_id, subject_hash, created_at DESC);

    CREATE TABLE IF NOT EXISTS memory_erasure_tombstones (
      id                         TEXT PRIMARY KEY,
      tenant_id                  TEXT NOT NULL DEFAULT 'default-tenant',
      subject_plan_id            TEXT REFERENCES memory_subject_erasure_plans(id) ON DELETE SET NULL,
      canonical_id               TEXT NOT NULL,
      record_type                TEXT NOT NULL,
      record_id                  TEXT NOT NULL,
      derivative_inventory_json  TEXT NOT NULL DEFAULT '[]',
      policy_json                TEXT NOT NULL DEFAULT '{}',
      outcome                    TEXT NOT NULL CHECK(outcome IN ('erased','blocked','failed')),
      erasure_id                 TEXT NOT NULL,
      scope_hash                 TEXT NOT NULL,
      created_at                 TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      UNIQUE(tenant_id, subject_plan_id, canonical_id, record_type, record_id)
    );
    CREATE INDEX IF NOT EXISTS memory_erasure_tombstones_tenant
      ON memory_erasure_tombstones(tenant_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS memory_erasure_tombstones_canonical
      ON memory_erasure_tombstones(tenant_id, canonical_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS memory_decay_runs (
      run_key             TEXT PRIMARY KEY,
      tenant_id           TEXT NOT NULL DEFAULT 'default-tenant',
      cycle_id            TEXT NOT NULL,
      status              TEXT NOT NULL CHECK(status IN ('completed','lease_held','failed')),
      scope_json          TEXT NOT NULL DEFAULT '{}',
      scope_hash          TEXT NOT NULL,
      actor_id            TEXT NOT NULL,
      scheduled_for       TEXT NOT NULL,
      started_at          TEXT NOT NULL,
      completed_at        TEXT,
      summary_json        TEXT NOT NULL DEFAULT '{}'
    );
    CREATE INDEX IF NOT EXISTS memory_decay_runs_tenant
      ON memory_decay_runs(tenant_id, scheduled_for DESC);

    CREATE TABLE IF NOT EXISTS memory_decay_receipts (
      id                 TEXT PRIMARY KEY,
      tenant_id          TEXT NOT NULL DEFAULT 'default-tenant',
      run_key            TEXT NOT NULL,
      cycle_id           TEXT NOT NULL,
      record_type        TEXT NOT NULL,
      record_id          TEXT NOT NULL,
      decision           TEXT NOT NULL CHECK(decision IN ('decayed','skipped')),
      reason             TEXT NOT NULL,
      before_score       REAL,
      after_score        REAL,
      scope_hash         TEXT NOT NULL,
      metadata_json      TEXT NOT NULL DEFAULT '{}',
      created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      UNIQUE(run_key, record_type, record_id, decision, reason)
    );
    CREATE INDEX IF NOT EXISTS memory_decay_receipts_record
      ON memory_decay_receipts(tenant_id, record_type, record_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS memory_decay_receipts_run
      ON memory_decay_receipts(run_key, created_at DESC);
  `);
}

function applyMemoryConsolidationVaultDsarOffboardingTombstonesSchema(db: Database.Database): void {
  // MEMLIFE-05: consolidation lineage, raw vault durability ledger, DSAR export/delete,
  // offboarding pending erasure, and chain-safe tombstones that preserve continuity
  // without payload. Additive, idempotent (uses try/catch + IF NOT EXISTS).

  db.exec(`
    -- Consolidation lineage: one canonical summary derived from a vault-locked batch.
    CREATE TABLE IF NOT EXISTS memory_consolidation_summaries (
      id                       TEXT PRIMARY KEY,
      tenant_id                TEXT NOT NULL DEFAULT 'default-tenant',
      ontology_type            TEXT NOT NULL,
      scope_hash               TEXT NOT NULL,
      scope_json               TEXT NOT NULL DEFAULT '{}',
      summary_type             TEXT NOT NULL CHECK(summary_type IN ('pattern','contradiction','summary','episodic_summary')),
      summary_content          TEXT NOT NULL,
      content_hash             TEXT NOT NULL,
      source_count             INTEGER NOT NULL DEFAULT 0,
      source_ids_json          TEXT NOT NULL DEFAULT '[]',
      source_vault_artifact_id TEXT NOT NULL,
      source_vault_hash        TEXT NOT NULL,
      classification_json      TEXT NOT NULL DEFAULT '{}',
      model_id                 TEXT,
      model_version             TEXT,
      run_id                   TEXT NOT NULL,
      run_key                  TEXT NOT NULL,
      lineage_hash             TEXT NOT NULL,
      status                   TEXT NOT NULL DEFAULT 'active'
                               CHECK(status IN ('active','superseded','rolled_back','failed')),
      superseded_by            TEXT,
      policy_id                TEXT,
      policy_version           TEXT,
      created_by               TEXT NOT NULL,
      created_at               TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      UNIQUE(tenant_id, lineage_hash)
    );
    CREATE INDEX IF NOT EXISTS memory_consolidation_summaries_tenant
      ON memory_consolidation_summaries(tenant_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS memory_consolidation_summaries_run
      ON memory_consolidation_summaries(run_key, created_at DESC);
    CREATE INDEX IF NOT EXISTS memory_consolidation_summaries_source_vault
      ON memory_consolidation_summaries(tenant_id, source_vault_artifact_id);

    -- Raw vault durability ledger: tracks writes, integrity verify results, and durability
    -- state transitions for replay-safe tenant reads.
    CREATE TABLE IF NOT EXISTS memory_vault_durability (
      id                  TEXT PRIMARY KEY,
      tenant_id           TEXT NOT NULL DEFAULT 'default-tenant',
      artifact_id         TEXT NOT NULL,
      artifact_uri        TEXT NOT NULL,
      content_hash        TEXT NOT NULL,
      classification_json TEXT NOT NULL DEFAULT '{}',
      label_version       INTEGER NOT NULL DEFAULT 1,
      write_state         TEXT NOT NULL DEFAULT 'pending'
                          CHECK(write_state IN ('pending','complete','failed','orphaned','replayed')),
      replay_state        TEXT NOT NULL DEFAULT 'pending'
                          CHECK(replay_state IN ('pending','complete','failed','mismatch')),
      retention_until     TEXT,
      failure_reason      TEXT,
      created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      UNIQUE(tenant_id, artifact_id)
    );
    CREATE INDEX IF NOT EXISTS memory_vault_durability_tenant
      ON memory_vault_durability(tenant_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS memory_vault_durability_state
      ON memory_vault_durability(tenant_id, write_state, replay_state);

    -- DSAR requests: identity-verified subject export/delete that delegates to the
    -- existing subject erasure coordinator. Receipts reference the original request
    -- identity (no raw payload).
    CREATE TABLE IF NOT EXISTS memory_dsar_requests (
      id                   TEXT PRIMARY KEY,
      tenant_id            TEXT NOT NULL DEFAULT 'default-tenant',
      request_type         TEXT NOT NULL CHECK(request_type IN ('export','delete')),
      subject_hash         TEXT NOT NULL,
      selector_hashes_json TEXT NOT NULL DEFAULT '{}',
      verification_method  TEXT NOT NULL,
      verification_hash    TEXT NOT NULL,
      scope_json           TEXT NOT NULL DEFAULT '{}',
      scope_hash           TEXT NOT NULL,
      status               TEXT NOT NULL DEFAULT 'pending'
                           CHECK(status IN ('pending','verified','exported','deleted','failed','denied','ambiguous')),
      plan_id              TEXT,
      result_json          TEXT NOT NULL DEFAULT '{}',
      denial_reason        TEXT,
      manifest_hash        TEXT,
      manifest_artifact_id TEXT,
      created_by           TEXT NOT NULL,
      created_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      completed_at         TEXT
    );
    CREATE INDEX IF NOT EXISTS memory_dsar_requests_tenant
      ON memory_dsar_requests(tenant_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS memory_dsar_requests_subject
      ON memory_dsar_requests(tenant_id, subject_hash, created_at DESC);

    -- Offboarding pending erasure: a scoped, honest pending MEMLIFE review that does NOT
    -- claim erasure complete. Idempotent: repeated offboarding for the same subject
    -- returns the same review ID.
    CREATE TABLE IF NOT EXISTS memory_offboarding_reviews (
      id                    TEXT PRIMARY KEY,
      tenant_id             TEXT NOT NULL DEFAULT 'default-tenant',
      subject_hash          TEXT NOT NULL,
      user_id               TEXT,
      review_kind           TEXT NOT NULL DEFAULT 'pending_erasure'
                            CHECK(review_kind IN ('pending_erasure','cancelled')),
      status                TEXT NOT NULL DEFAULT 'pending'
                            CHECK(status IN ('pending','in_progress','completed','cancelled','failed')),
      revoked_credentials   INTEGER NOT NULL DEFAULT 0,
      revoked_agents        INTEGER NOT NULL DEFAULT 0,
      pending_plan_id       TEXT,
      sla_seconds           INTEGER NOT NULL DEFAULT 86400,
      sla_deadline          TEXT NOT NULL,
      created_by            TEXT NOT NULL,
      created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      completed_at          TEXT,
      UNIQUE(tenant_id, subject_hash, review_kind)
    );
    CREATE INDEX IF NOT EXISTS memory_offboarding_reviews_subject
      ON memory_offboarding_reviews(tenant_id, subject_hash);

    -- Tombstones: scoped, non-sensitive pointers for completed erasure that preserve
    -- audit-chain continuity without storing payload. Append-only by convention;
    -- chain-verifiable via entryHash stored in audit metadata.
    CREATE TABLE IF NOT EXISTS memory_tombstones (
      id                         TEXT PRIMARY KEY,
      tenant_id                  TEXT NOT NULL DEFAULT 'default-tenant',
      subject_hash               TEXT NOT NULL,
      canonical_id               TEXT NOT NULL,
      record_type                TEXT NOT NULL,
      record_id                  TEXT NOT NULL,
      record_id_hash             TEXT NOT NULL,
      derivative_inventory_hash  TEXT NOT NULL,
      policy_id                  TEXT,
      policy_version             TEXT,
      erasure_id                 TEXT NOT NULL,
      scope_hash                 TEXT NOT NULL,
      outcome                    TEXT NOT NULL DEFAULT 'erased'
                                 CHECK(outcome IN ('erased','blocked','failed','partial')),
      created_at                 TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      UNIQUE(tenant_id, erasure_id, canonical_id, record_type, record_id)
    );
    CREATE INDEX IF NOT EXISTS memory_tombstones_tenant
      ON memory_tombstones(tenant_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS memory_tombstones_subject
      ON memory_tombstones(tenant_id, subject_hash, created_at DESC);
    CREATE INDEX IF NOT EXISTS memory_tombstones_canonical
      ON memory_tombstones(tenant_id, canonical_id, created_at DESC);
  `);
}

function applyMemoryEmbeddingProvenanceSchema(db: Database.Database): void {
  // MEMLIFE-03..04: embedding provenance + lifecycle. Embedding lifecycle is
  // provenance-linked (canonical id + model version + source) and removability is
  // wired to erasure. Additive, idempotent (uses try/catch + IF NOT EXISTS).

  // memory_embedding_provenance: one row per registered embedding projection
  // (local message_embeddings, external vector adapter rows, etc.). Used by the
  // erasure coordinator to discover and remove every vector derivative, and to
  // track stale/degraded provider state honestly.
  db.exec(`
    CREATE TABLE IF NOT EXISTS memory_embedding_provenance (
      id                 TEXT PRIMARY KEY,
      tenant_id          TEXT NOT NULL DEFAULT 'default-tenant',
      canonical_id       TEXT NOT NULL,
      store_id           TEXT NOT NULL,
      adapter_kind       TEXT NOT NULL DEFAULT 'local'
                         CHECK(adapter_kind IN ('local','external','cache','snapshot')),
      source_hash        TEXT NOT NULL,
      model_id           TEXT NOT NULL,
      model_version      TEXT,
      dimensionality     INTEGER NOT NULL DEFAULT 0,
      provenance         TEXT NOT NULL,
      lifecycle_state    TEXT NOT NULL DEFAULT 'active'
                         CHECK(lifecycle_state IN ('active','stale','degraded','removed','tombstoned')),
      removability       TEXT NOT NULL DEFAULT 'erasable'
                         CHECK(removability IN ('erasable','retained','deferred')),
      external_ref       TEXT,
      last_refreshed_at  TEXT,
      metadata_json      TEXT NOT NULL DEFAULT '{}',
      erasure_id         TEXT,
      removed_at         TEXT,
      created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      updated_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );
    CREATE INDEX IF NOT EXISTS memory_embedding_provenance_tenant_canonical
      ON memory_embedding_provenance(tenant_id, canonical_id);
    CREATE INDEX IF NOT EXISTS memory_embedding_provenance_store
      ON memory_embedding_provenance(tenant_id, store_id, lifecycle_state);
    CREATE INDEX IF NOT EXISTS memory_embedding_provenance_lifecycle
      ON memory_embedding_provenance(tenant_id, lifecycle_state, updated_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS memory_embedding_provenance_dedupe
      ON memory_embedding_provenance(tenant_id, canonical_id, store_id, model_id, adapter_kind);
  `);
}

function applyOrchMsiqAdapterAndFederationSchema(db: Database.Database): void {
  // MSIQ-04..05 / VAL-ORCH-001..011:
  //   - msiq_adapter_sessions: self-hosted Microsoft Agent Framework memory
  //     adapter sessions (no Foundry / paid credentials). Each row is a
  //     fail-closed session handle used by the adapter for idempotent writes
  //     and provenance. Holds the negotiated MCP protocol version + tool list.
  //   - msiq_adapter_idempotency: idempotency-keyed write ledger. Same key
  //     + same payload hash + same scope => one logical write across
  //     timeout / replay. Conflict => no overwrite, explicit error.
  //   - msiq_adapter_operations: per-operation receipts (write/read/search)
  //     with scope identity, MCP transcript hashes, policy/provenance
  //     receipts and timing.
  //   - federation_sources: explicitly registered federated retrieval
  //     sources. Foreign, disabled, expired, incomplete, or unknown
  //     sources are never accessed. One row per source identity with
  //     type, handle, tenant/space/purpose/labels, allowed operations,
  //     trust and expiry.
  //   - federation_source_outcomes: per-source receipt ledger. Each row
  //     records exactly one outcome (success, empty, denied, omitted,
  //     stale, injection, timeout, malformed, failed) plus the
  //     per-source policy decision and counts/hashes/timing.
  //   - federation_merges: deterministic merge ledger with stable pack
  //     hash, contributing source lineage, dedupe/rank metadata.
  db.exec(`
    CREATE TABLE IF NOT EXISTS msiq_adapter_sessions (
      id                    TEXT    PRIMARY KEY,
      tenant_id             TEXT    NOT NULL DEFAULT 'default-tenant',
      session_token         TEXT    NOT NULL UNIQUE,
      actor_id              TEXT    NOT NULL,
      actor_role            TEXT    NOT NULL,
      agent_id              TEXT,
      space_id              TEXT,
      scope_hash            TEXT    NOT NULL,
      mcp_protocol_version  TEXT    NOT NULL,
      tool_manifest_json    TEXT    NOT NULL DEFAULT '[]',
      capability_flags_json TEXT    NOT NULL DEFAULT '[]',
      discovery_transcript  TEXT    NOT NULL DEFAULT '[]',
      status                TEXT    NOT NULL DEFAULT 'active'
                            CHECK(status IN ('active','closed','expired','revoked','denied')),
      foundry_blocked       INTEGER NOT NULL DEFAULT 1 CHECK(foundry_blocked IN (0,1)),
      foundry_only_mode     INTEGER NOT NULL DEFAULT 0 CHECK(foundry_only_mode IN (0,1)),
      opened_at             TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      closed_at             TEXT,
      expires_at            TEXT,
      label_json            TEXT    NOT NULL DEFAULT '{\"visibility\":\"private\",\"policy\":\"agent_visible\"}'
    );
    CREATE INDEX IF NOT EXISTS msiq_adapter_sessions_tenant
      ON msiq_adapter_sessions(tenant_id, status, opened_at DESC);
    CREATE INDEX IF NOT EXISTS msiq_adapter_sessions_token
      ON msiq_adapter_sessions(session_token);

    CREATE TABLE IF NOT EXISTS msiq_adapter_idempotency (
      id                  TEXT    PRIMARY KEY,
      tenant_id           TEXT    NOT NULL DEFAULT 'default-tenant',
      session_id          TEXT    NOT NULL REFERENCES msiq_adapter_sessions(id) ON DELETE CASCADE,
      idempotency_key     TEXT    NOT NULL,
      scope_hash          TEXT    NOT NULL,
      request_payload     TEXT    NOT NULL,
      request_hash        TEXT    NOT NULL,
      response_payload    TEXT    NOT NULL,
      response_hash       TEXT    NOT NULL,
      canonical_memory_id TEXT,
      provenance_hash     TEXT,
      conflict            INTEGER NOT NULL DEFAULT 0 CHECK(conflict IN (0,1)),
      replay_count        INTEGER NOT NULL DEFAULT 0,
      created_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      updated_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      UNIQUE(tenant_id, idempotency_key, scope_hash)
    );
    CREATE INDEX IF NOT EXISTS msiq_adapter_idempotency_session
      ON msiq_adapter_idempotency(tenant_id, session_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS msiq_adapter_idempotency_key
      ON msiq_adapter_idempotency(tenant_id, idempotency_key);

    CREATE TABLE IF NOT EXISTS msiq_adapter_operations (
      id                    TEXT    PRIMARY KEY,
      tenant_id             TEXT    NOT NULL DEFAULT 'default-tenant',
      session_id            TEXT    NOT NULL REFERENCES msiq_adapter_sessions(id) ON DELETE CASCADE,
      operation_kind        TEXT    NOT NULL
                            CHECK(operation_kind IN ('initialize','tools_list','write','read','search','close')),
      decision              TEXT    NOT NULL
                            CHECK(decision IN ('allow','deny','redact','conflict','unavailable','error')),
      reason_code           TEXT    NOT NULL,
      tool_name             TEXT,
      scope_hash            TEXT    NOT NULL,
      scope_identity_json   TEXT    NOT NULL DEFAULT '{}',
      request_hash          TEXT,
      response_hash         TEXT,
      transcript_hash       TEXT,
      duration_ms           INTEGER NOT NULL DEFAULT 0,
      provenance_json       TEXT    NOT NULL DEFAULT '{}',
      created_at            TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );
    CREATE INDEX IF NOT EXISTS msiq_adapter_operations_session
      ON msiq_adapter_operations(tenant_id, session_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS msiq_adapter_operations_decision
      ON msiq_adapter_operations(tenant_id, decision, created_at DESC);

    CREATE TABLE IF NOT EXISTS federation_sources (
      id                       TEXT    PRIMARY KEY,
      tenant_id                TEXT    NOT NULL DEFAULT 'default-tenant',
      source_handle            TEXT    NOT NULL,
      source_kind              TEXT    NOT NULL
                              CHECK(source_kind IN ('memory','knowledge','mcp')),
      space_id                 TEXT,
      purpose                  TEXT    NOT NULL,
      label_policy_json        TEXT    NOT NULL DEFAULT '{}',
      allowed_operations_json  TEXT    NOT NULL DEFAULT '[]',
      trust_level              TEXT    NOT NULL DEFAULT 'registered'
                              CHECK(trust_level IN ('registered','trusted','revoked','unknown')),
      enabled                  INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
      has_expiry               INTEGER NOT NULL DEFAULT 0 CHECK(has_expiry IN (0,1)),
      expires_at               TEXT,
      transport                TEXT    NOT NULL DEFAULT 'local'
                              CHECK(transport IN ('local','inproc','memory','mcp_stdio','mcp_http')),
      descriptor_json          TEXT    NOT NULL DEFAULT '{}',
      registration_hash        TEXT    NOT NULL,
      last_health_at           TEXT,
      created_by               TEXT    NOT NULL,
      created_at               TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      updated_at               TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      UNIQUE(tenant_id, source_handle, source_kind)
    );
    CREATE INDEX IF NOT EXISTS federation_sources_tenant_kind
      ON federation_sources(tenant_id, source_kind, enabled);
    CREATE INDEX IF NOT EXISTS federation_sources_enabled
      ON federation_sources(tenant_id, enabled, expires_at);

    CREATE TABLE IF NOT EXISTS federation_source_outcomes (
      id                       TEXT    PRIMARY KEY,
      tenant_id                TEXT    NOT NULL DEFAULT 'default-tenant',
      federation_run_id        TEXT    NOT NULL,
      source_id                TEXT    NOT NULL REFERENCES federation_sources(id) ON DELETE CASCADE,
      outcome                  TEXT    NOT NULL
                              CHECK(outcome IN ('success','empty','denied','omitted','stale','injection','timeout','malformed','failed')),
      reason_code              TEXT    NOT NULL,
      policy_decision          TEXT    NOT NULL,
      policy_version           TEXT,
      result_count             INTEGER NOT NULL DEFAULT 0,
      result_bytes             INTEGER NOT NULL DEFAULT 0,
      duration_ms              INTEGER NOT NULL DEFAULT 0,
      request_hash             TEXT,
      response_hash            TEXT,
      payload_hash             TEXT,
      scope_hash               TEXT    NOT NULL,
      metadata_json            TEXT    NOT NULL DEFAULT '{}',
      created_at               TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );
    CREATE INDEX IF NOT EXISTS federation_source_outcomes_run
      ON federation_source_outcomes(tenant_id, federation_run_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS federation_source_outcomes_source
      ON federation_source_outcomes(tenant_id, source_id, outcome, created_at DESC);

    CREATE TABLE IF NOT EXISTS federation_merges (
      id                       TEXT    PRIMARY KEY,
      tenant_id                TEXT    NOT NULL DEFAULT 'default-tenant',
      federation_run_id        TEXT    NOT NULL,
      pack_hash                TEXT    NOT NULL,
      pack_bytes               INTEGER NOT NULL DEFAULT 0,
      pack_item_count          INTEGER NOT NULL DEFAULT 0,
      contributing_source_ids  TEXT    NOT NULL DEFAULT '[]',
      contributing_outcome_ids TEXT    NOT NULL DEFAULT '[]',
      dedupe_metadata_json     TEXT    NOT NULL DEFAULT '{}',
      rank_metadata_json       TEXT    NOT NULL DEFAULT '{}',
      budget_metadata_json     TEXT    NOT NULL DEFAULT '{}',
      bound_status             TEXT    NOT NULL DEFAULT 'bounded'
                              CHECK(bound_status IN ('bounded','partial_bounded','over_budget')),
      scope_hash               TEXT    NOT NULL,
      created_at               TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      UNIQUE(tenant_id, federation_run_id)
    );
    CREATE INDEX IF NOT EXISTS federation_merges_pack
      ON federation_merges(tenant_id, pack_hash);
  `);
}

function applyOrchMultihopEvidenceBundleSchema(db: Database.Database): void {
  // ORCH-FOLLOWUP-01 / VAL-ORCH-012..020:
  // Link generic task evidence bundles to deterministic multi-hop orchestration
  // evidence without storing raw action payloads. These fields are hashes/IDs
  // only, so existing bundle redaction and outbound filtering remain intact.
  for (const statement of [
    "ALTER TABLE task_evidence_bundles ADD COLUMN orchestration_run_id TEXT",
    "ALTER TABLE task_evidence_bundles ADD COLUMN orchestration_plan_hash TEXT",
    "ALTER TABLE task_evidence_bundles ADD COLUMN orchestration_bundle_hash TEXT",
  ]) {
    try {
      db.exec(statement);
    } catch {
      // Column already exists -- additive migration is safe to re-run.
    }
  }
  db.exec(`
    CREATE INDEX IF NOT EXISTS task_evidence_bundles_orchestration_run
      ON task_evidence_bundles(tenant_id, orchestration_run_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS task_evidence_bundles_orchestration_hash
      ON task_evidence_bundles(tenant_id, orchestration_bundle_hash);
  `);
}

function applyOntologyRegistrySchema(db: Database.Database): void {
  // ONTO-REGISTRY-01: canonical ontology publication, projection reconciliation,
  // immutable provenance bindings, and governed domain-pack lifecycle state.
  // Every statement is CREATE IF NOT EXISTS so the migration is additive and
  // remains safe when initialization is invoked more than once.
  db.exec(`
    CREATE TABLE IF NOT EXISTS ontology_registry (
      ontology_id             TEXT PRIMARY KEY,
      active_version          TEXT NOT NULL,
      active_content_hash     TEXT NOT NULL,
      updated_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );

    CREATE TABLE IF NOT EXISTS ontology_versions (
      ontology_id             TEXT NOT NULL,
      version                 TEXT NOT NULL,
      content_hash            TEXT NOT NULL,
      parent_ontology_id      TEXT,
      parent_version          TEXT,
      parent_content_hash     TEXT,
      definitions_json        TEXT NOT NULL,
      relationships_json      TEXT NOT NULL,
      published_by            TEXT NOT NULL,
      published_at            TEXT NOT NULL,
      PRIMARY KEY (ontology_id, version),
      UNIQUE (ontology_id, content_hash)
    );
    CREATE INDEX IF NOT EXISTS ontology_versions_published
      ON ontology_versions(ontology_id, published_at DESC);

    CREATE TABLE IF NOT EXISTS ontology_projection_mirrors (
      ontology_id             TEXT NOT NULL,
      version                 TEXT NOT NULL,
      projection              TEXT NOT NULL
                              CHECK(projection IN ('git','sqlite','frontmatter','graph','generated_graph')),
      content_hash            TEXT NOT NULL,
      status                  TEXT NOT NULL
                              CHECK(status IN ('current','stale','divergent','failed')),
      updated_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      PRIMARY KEY (ontology_id, version, projection),
      FOREIGN KEY (ontology_id, version)
        REFERENCES ontology_versions(ontology_id, version)
    );
    CREATE INDEX IF NOT EXISTS ontology_projection_mirrors_status
      ON ontology_projection_mirrors(ontology_id, version, status);

    CREATE TABLE IF NOT EXISTS ontology_provenance_bindings (
      id                      TEXT PRIMARY KEY,
      record_type             TEXT NOT NULL,
      record_id               TEXT NOT NULL,
      ontology_id             TEXT NOT NULL,
      ontology_version        TEXT NOT NULL,
      ontology_content_hash   TEXT NOT NULL,
      bound_by                TEXT NOT NULL,
      bound_at                TEXT NOT NULL,
      UNIQUE (record_type, record_id),
      FOREIGN KEY (ontology_id, ontology_version)
        REFERENCES ontology_versions(ontology_id, version)
    );
    CREATE INDEX IF NOT EXISTS ontology_provenance_bindings_ontology
      ON ontology_provenance_bindings(ontology_id, ontology_version, bound_at DESC);

    CREATE TRIGGER IF NOT EXISTS ontology_provenance_bindings_no_update
      BEFORE UPDATE ON ontology_provenance_bindings
    BEGIN
      SELECT RAISE(ABORT, 'ontology provenance bindings are immutable');
    END;
    CREATE TRIGGER IF NOT EXISTS ontology_provenance_bindings_no_delete
      BEFORE DELETE ON ontology_provenance_bindings
    BEGIN
      SELECT RAISE(ABORT, 'ontology provenance bindings are immutable');
    END;

    CREATE TABLE IF NOT EXISTS ontology_packs (
      id                      TEXT PRIMARY KEY,
      namespace               TEXT NOT NULL,
      owner                   TEXT NOT NULL,
      version                 TEXT NOT NULL,
      source_hash             TEXT NOT NULL,
      provenance_summary_json TEXT NOT NULL,
      ontology_id             TEXT NOT NULL,
      ontology_version        TEXT NOT NULL,
      ontology_content_hash   TEXT NOT NULL,
      types_json              TEXT NOT NULL,
      dependencies_json       TEXT NOT NULL,
      lifecycle_state         TEXT NOT NULL DEFAULT 'draft'
                              CHECK(lifecycle_state IN ('draft','approved','deprecated','retired')),
      created_by              TEXT NOT NULL,
      created_at              TEXT NOT NULL,
      approved_at             TEXT,
      deprecated_at           TEXT,
      deprecated_reason       TEXT,
      retired_at              TEXT,
      replacement_pack_id     TEXT,
      UNIQUE (namespace, version),
      FOREIGN KEY (ontology_id, ontology_version)
        REFERENCES ontology_versions(ontology_id, version)
    );
    CREATE INDEX IF NOT EXISTS ontology_packs_state
      ON ontology_packs(lifecycle_state, namespace, created_at DESC);

    CREATE TABLE IF NOT EXISTS ontology_pack_lifecycle_audit (
      id                      TEXT PRIMARY KEY,
      pack_id                 TEXT NOT NULL REFERENCES ontology_packs(id),
      from_state              TEXT NOT NULL,
      to_state                TEXT NOT NULL,
      actor                   TEXT NOT NULL,
      reason                  TEXT,
      replacement_pack_id     TEXT,
      transitioned_at         TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS ontology_pack_lifecycle_audit_pack
      ON ontology_pack_lifecycle_audit(pack_id, transitioned_at DESC);
  `);
}

function applyOntologyRegistryPackHardeningSchema(db: Database.Database): void {
  // Published definitions are append-only. Registry pointers and projection
  // mirrors intentionally remain mutable so successor publication and
  // reconciliation continue to work.
  try {
    db.exec(`ALTER TABLE ontology_packs ADD COLUMN relationships_json TEXT NOT NULL DEFAULT '[]'`);
  } catch {
    // Column already exists when this migration is replayed.
  }
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS ontology_versions_no_update
      BEFORE UPDATE ON ontology_versions
    BEGIN
      SELECT RAISE(ABORT, 'published ontology versions are immutable');
    END;
    CREATE TRIGGER IF NOT EXISTS ontology_versions_no_delete
      BEFORE DELETE ON ontology_versions
    BEGIN
      SELECT RAISE(ABORT, 'published ontology versions are immutable');
    END;
  `);

  // Earlier releases accepted a free-form JSON object. Upgrade rows to the
  // same non-content-bearing form used for all new registrations. A malformed
  // or unsafe legacy value is deliberately reduced to an empty object instead
  // of preserving unbounded source material.
  const rows = db.prepare(`SELECT id, provenance_summary_json FROM ontology_packs`).all() as Array<{
    id: string;
    provenance_summary_json: string;
  }>;
  const update = db.prepare(`UPDATE ontology_packs SET provenance_summary_json = ? WHERE id = ?`);
  for (const row of rows) {
    let raw: unknown = null;
    try {
      raw = JSON.parse(row.provenance_summary_json);
    } catch {
      // Unsafe malformed metadata is scrubbed below.
    }
    update.run(JSON.stringify(scrubLegacyPackProvenance(raw)), row.id);
  }
}

function applyOntologyCandidateGovernanceSchema(db: Database.Database): void {
  // ONTO-04..06: all extracted ontology material is an auditable observation
  // until a separately governed promotion commits it. These tables intentionally
  // retain hashes, IDs, and normalized coordinates only, never source content.
  db.exec(`
    CREATE TABLE IF NOT EXISTS ontology_candidates (
      id                    TEXT PRIMARY KEY,
      tenant_id             TEXT NOT NULL,
      space_id              TEXT NOT NULL,
      source_id             TEXT NOT NULL,
      source_hash           TEXT NOT NULL,
      source_spans_json     TEXT NOT NULL DEFAULT '[]',
      extractor_id          TEXT NOT NULL,
      extractor_version     TEXT NOT NULL,
      candidate_kind        TEXT NOT NULL CHECK(candidate_kind IN ('type','relationship','alias')),
      namespace             TEXT NOT NULL,
      proposed_json         TEXT NOT NULL,
      confidence_label      TEXT NOT NULL CHECK(confidence_label IN ('low','medium','high')),
      confidence_score      REAL NOT NULL CHECK(confidence_score >= 0 AND confidence_score <= 1),
      evidence_hash         TEXT NOT NULL,
      original_json         TEXT NOT NULL,
      status                TEXT NOT NULL DEFAULT 'pending'
                            CHECK(status IN ('pending','approved','rejected','deferred','superseded','invalidated','promoted')),
      invalidated_at        TEXT,
      superseded_by         TEXT,
      created_at            TEXT NOT NULL,
      UNIQUE(tenant_id, space_id, source_hash, extractor_id, extractor_version, evidence_hash)
    );
    CREATE INDEX IF NOT EXISTS ontology_candidates_scope
      ON ontology_candidates(tenant_id, space_id, status, created_at DESC);
    CREATE INDEX IF NOT EXISTS ontology_candidates_source
      ON ontology_candidates(tenant_id, space_id, source_id, source_hash);

    CREATE TABLE IF NOT EXISTS ontology_candidate_decisions (
      id                    TEXT PRIMARY KEY,
      candidate_id          TEXT NOT NULL REFERENCES ontology_candidates(id),
      tenant_id             TEXT NOT NULL,
      space_id              TEXT NOT NULL,
      decision              TEXT NOT NULL CHECK(decision IN ('approve','reject','defer','supersede','invalidate')),
      reviewer_id           TEXT NOT NULL,
      reason                TEXT NOT NULL,
      source_hash           TEXT NOT NULL,
      evidence_hash         TEXT NOT NULL,
      confidence_label      TEXT NOT NULL,
      confidence_score      REAL NOT NULL,
      original_json         TEXT NOT NULL,
      created_at            TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS ontology_candidate_decisions_candidate
      ON ontology_candidate_decisions(candidate_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS ontology_promotions (
      id                    TEXT PRIMARY KEY,
      candidate_id          TEXT NOT NULL REFERENCES ontology_candidates(id),
      tenant_id             TEXT NOT NULL,
      space_id              TEXT NOT NULL,
      seal_proposal_id      TEXT NOT NULL,
      seal_decision_id      TEXT NOT NULL,
      ontology_id           TEXT NOT NULL,
      ontology_version      TEXT NOT NULL,
      ontology_content_hash TEXT NOT NULL,
      namespace             TEXT NOT NULL,
      policy_context_hash   TEXT NOT NULL,
      idempotency_key       TEXT NOT NULL,
      promoted_by           TEXT NOT NULL,
      promoted_at           TEXT NOT NULL,
      UNIQUE(tenant_id, space_id, idempotency_key),
      UNIQUE(candidate_id)
    );

    CREATE TABLE IF NOT EXISTS ontology_policy_contexts (
      context_hash          TEXT PRIMARY KEY,
      tenant_id             TEXT NOT NULL,
      space_id              TEXT NOT NULL,
      policy_version        TEXT NOT NULL,
      registered_by         TEXT NOT NULL,
      expires_at            TEXT NOT NULL,
      created_at            TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ontology_canonical_definitions (
      id                    TEXT PRIMARY KEY,
      promotion_id          TEXT NOT NULL UNIQUE REFERENCES ontology_promotions(id),
      ontology_id           TEXT NOT NULL,
      ontology_version      TEXT NOT NULL,
      ontology_content_hash TEXT NOT NULL,
      namespace             TEXT NOT NULL,
      canonical_id          TEXT NOT NULL,
      definition_json       TEXT NOT NULL,
      created_at            TEXT NOT NULL,
      UNIQUE(ontology_id, ontology_version, canonical_id)
    );

    CREATE TABLE IF NOT EXISTS ontology_aliases (
      id                    TEXT PRIMARY KEY,
      ontology_id           TEXT NOT NULL,
      ontology_version      TEXT NOT NULL,
      ontology_content_hash TEXT NOT NULL,
      namespace             TEXT NOT NULL,
      alias                 TEXT NOT NULL,
      canonical_id          TEXT NOT NULL,
      status                TEXT NOT NULL CHECK(status IN ('active','redirected','deprecated','removed')),
      prior_target          TEXT,
      created_by            TEXT NOT NULL,
      created_at            TEXT NOT NULL,
      updated_by            TEXT,
      updated_at            TEXT,
      reason                TEXT,
      UNIQUE(ontology_id, ontology_version, namespace, alias)
    );
    CREATE INDEX IF NOT EXISTS ontology_aliases_lookup
      ON ontology_aliases(ontology_id, ontology_version, alias, status);

    CREATE TABLE IF NOT EXISTS ontology_alias_lifecycle_audit (
      id                    TEXT PRIMARY KEY,
      alias_id              TEXT NOT NULL REFERENCES ontology_aliases(id),
      action                TEXT NOT NULL CHECK(action IN ('add','redirect','deprecate','restore','remove')),
      prior_target          TEXT,
      next_target           TEXT,
      actor                 TEXT NOT NULL,
      reason                TEXT NOT NULL,
      ontology_content_hash TEXT NOT NULL,
      created_at            TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ontology_migration_plans (
      id                    TEXT PRIMARY KEY,
      tenant_id             TEXT NOT NULL,
      space_id              TEXT NOT NULL,
      source_ontology_id    TEXT NOT NULL,
      source_version        TEXT NOT NULL,
      source_hash           TEXT NOT NULL,
      target_ontology_id    TEXT NOT NULL,
      target_version        TEXT NOT NULL,
      target_hash           TEXT NOT NULL,
      mappings_json         TEXT NOT NULL,
      scope_hash            TEXT NOT NULL,
      plan_hash             TEXT NOT NULL,
      status                TEXT NOT NULL CHECK(status IN ('planned','approved','executing','incomplete','completed','rejected')),
      created_by            TEXT NOT NULL,
      approved_by           TEXT,
      approved_at           TEXT,
      created_at            TEXT NOT NULL,
      updated_at            TEXT NOT NULL,
      UNIQUE(tenant_id, space_id, plan_hash)
    );
    CREATE TABLE IF NOT EXISTS ontology_migration_checkpoints (
      id                    TEXT PRIMARY KEY,
      plan_id               TEXT NOT NULL REFERENCES ontology_migration_plans(id),
      record_type           TEXT NOT NULL,
      record_id             TEXT NOT NULL,
      source_type           TEXT NOT NULL,
      target_type           TEXT,
      outcome               TEXT NOT NULL CHECK(outcome IN ('migrated','ambiguous','unsupported','skipped')),
      reason                TEXT NOT NULL,
      created_at            TEXT NOT NULL,
      UNIQUE(plan_id, record_type, record_id)
    );

    CREATE TABLE IF NOT EXISTS ontology_versioned_records (
      id                    TEXT PRIMARY KEY,
      tenant_id             TEXT NOT NULL,
      space_id              TEXT NOT NULL,
      record_type           TEXT NOT NULL,
      record_id             TEXT NOT NULL,
      qualified_type        TEXT NOT NULL,
      ontology_id           TEXT NOT NULL,
      ontology_version      TEXT NOT NULL,
      ontology_content_hash TEXT NOT NULL,
      legacy_type           TEXT,
      mapping_path_json     TEXT NOT NULL DEFAULT '[]',
      created_at            TEXT NOT NULL,
      UNIQUE(tenant_id, space_id, record_type, record_id, ontology_content_hash)
    );
    CREATE INDEX IF NOT EXISTS ontology_versioned_records_lookup
      ON ontology_versioned_records(tenant_id, space_id, record_type, record_id);
  `);
}

function applyOntologySourceLifecycleValiditySchema(db: Database.Database): void {
  // Source material is the single authority for every derived ontology row.
  // The lifecycle and derivative tables deliberately retain only scoped IDs,
  // hashes, status, and reasons so historical evidence remains safe after a
  // source changes or is erased.
  db.exec(`
    CREATE TABLE IF NOT EXISTS ontology_source_lifecycle (
      tenant_id             TEXT NOT NULL,
      space_id              TEXT NOT NULL,
      source_id             TEXT NOT NULL,
      source_hash           TEXT NOT NULL,
      status                TEXT NOT NULL CHECK(status IN ('active','changed','erased','revoked')),
      updated_at            TEXT NOT NULL,
      updated_by            TEXT NOT NULL,
      reason_code           TEXT NOT NULL,
      PRIMARY KEY (tenant_id, space_id, source_id, source_hash)
    );
    CREATE INDEX IF NOT EXISTS ontology_source_lifecycle_current
      ON ontology_source_lifecycle(tenant_id, space_id, source_id, status, updated_at DESC);

    CREATE TABLE IF NOT EXISTS ontology_derivative_validity (
      id                    TEXT PRIMARY KEY,
      tenant_id             TEXT NOT NULL,
      space_id              TEXT NOT NULL,
      source_id             TEXT NOT NULL,
      source_hash           TEXT NOT NULL,
      derivative_type       TEXT NOT NULL CHECK(derivative_type IN ('candidate','promotion','canonical_definition','alias','versioned_record','provenance_binding')),
      derivative_id         TEXT NOT NULL,
      status                TEXT NOT NULL CHECK(status IN ('authoritative','revoked')),
      revocation_reason     TEXT,
      created_at            TEXT NOT NULL,
      revoked_at            TEXT,
      UNIQUE(derivative_type, derivative_id)
    );
    CREATE INDEX IF NOT EXISTS ontology_derivative_validity_source
      ON ontology_derivative_validity(tenant_id, space_id, source_id, source_hash, status);
    CREATE INDEX IF NOT EXISTS ontology_derivative_validity_lookup
      ON ontology_derivative_validity(tenant_id, space_id, derivative_type, derivative_id, status);
  `);

  // Versioned records created before this migration do not carry a verifiable
  // source lifecycle. They intentionally remain unavailable to
  // ontology-sensitive operations until a governed migration recreates them.
  for (const statement of [
    "ALTER TABLE ontology_versioned_records ADD COLUMN source_id TEXT",
    "ALTER TABLE ontology_versioned_records ADD COLUMN source_hash TEXT",
  ]) {
    try {
      db.exec(statement);
    } catch {
      // Additive migration replay.
    }
  }
}

function applyFederationActionProofContinuitySchema(db: Database.Database): void {
  // A bridge receipt is application-controlled proof that a persisted,
  // bounded federation merge may start a multi-hop action. It deliberately
  // stores only identifiers, hashes, and safe decisions, never result text.
  db.exec(`
    CREATE TABLE IF NOT EXISTS federation_action_artifacts (
      id                         TEXT PRIMARY KEY,
      tenant_id                  TEXT NOT NULL DEFAULT 'default-tenant',
      space_id                   TEXT NOT NULL,
      federation_run_id          TEXT NOT NULL,
      pack_hash                  TEXT NOT NULL,
      pack_bytes                 INTEGER NOT NULL,
      pack_item_count            INTEGER NOT NULL,
      bound_status               TEXT NOT NULL
                                 CHECK(bound_status IN ('bounded','partial_bounded')),
      scope_hash                 TEXT NOT NULL,
      policy_hash                TEXT NOT NULL,
      ontology_hash              TEXT NOT NULL,
      ontology_refs_json         TEXT NOT NULL DEFAULT '[]',
      source_ids_json            TEXT NOT NULL DEFAULT '[]',
      outcome_ids_json           TEXT NOT NULL DEFAULT '[]',
      artifact_hash              TEXT NOT NULL,
      status                     TEXT NOT NULL DEFAULT 'active'
                                 CHECK(status IN ('active','invalidated','unavailable','denied')),
      invalidation_reason        TEXT,
      invalidated_at             TEXT,
      orchestration_run_id       TEXT,
      orchestration_plan_hash    TEXT,
      orchestration_bundle_hash  TEXT,
      created_at                 TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      updated_at                 TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      UNIQUE(tenant_id, federation_run_id, pack_hash)
    );
    CREATE INDEX IF NOT EXISTS federation_action_artifacts_scope
      ON federation_action_artifacts(tenant_id, space_id, status, created_at DESC);
    CREATE INDEX IF NOT EXISTS federation_action_artifacts_run
      ON federation_action_artifacts(tenant_id, federation_run_id, pack_hash);

    -- One row per canonical source result makes source or subject erasure
    -- discoverable without ever persisting source payloads.
    CREATE TABLE IF NOT EXISTS federation_action_derivatives (
      id                         TEXT PRIMARY KEY,
      tenant_id                  TEXT NOT NULL DEFAULT 'default-tenant',
      artifact_id                TEXT NOT NULL
                                 REFERENCES federation_action_artifacts(id) ON DELETE CASCADE,
      canonical_id               TEXT NOT NULL,
      canonical_hash             TEXT NOT NULL,
      source_id                  TEXT NOT NULL,
      status                     TEXT NOT NULL DEFAULT 'active'
                                 CHECK(status IN ('active','invalidated')),
      invalidated_at             TEXT,
      erasure_id                 TEXT,
      created_at                 TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      UNIQUE(tenant_id, artifact_id, canonical_hash, source_id)
    );
    CREATE INDEX IF NOT EXISTS federation_action_derivatives_canonical
      ON federation_action_derivatives(tenant_id, canonical_id, status);
    CREATE INDEX IF NOT EXISTS federation_action_derivatives_source
      ON federation_action_derivatives(tenant_id, source_id, status);
  `);
}

function applyFederationAdmittedCoordinateLedgerSchema(db: Database.Database): void {
  // This ledger contains only the server-derived canonical hash and source
  // coordinates admitted to a persisted merge. It deliberately excludes every
  // candidate payload, content identifier, score, and route-supplied value.
  db.exec(`
    CREATE TABLE IF NOT EXISTS federation_merged_coordinates (
      id                TEXT PRIMARY KEY,
      tenant_id         TEXT NOT NULL DEFAULT 'default-tenant',
      federation_run_id TEXT NOT NULL,
      pack_hash         TEXT NOT NULL,
      canonical_id      TEXT NOT NULL,
      canonical_hash    TEXT NOT NULL,
      source_id         TEXT NOT NULL REFERENCES federation_sources(id) ON DELETE CASCADE,
      created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      UNIQUE(tenant_id, federation_run_id, pack_hash, canonical_hash, source_id)
    );
    CREATE INDEX IF NOT EXISTS federation_merged_coordinates_merge
      ON federation_merged_coordinates(tenant_id, federation_run_id, pack_hash);
  `);
  try {
    db.exec("ALTER TABLE federation_action_artifacts ADD COLUMN coordinate_ledger_hash TEXT");
  } catch {
    // Existing databases already carrying the additive column are safe to re-run.
  }
}

/**
 * Phase 127 / ENTOPS-08: DSAR right-to-delete compliance-window tombstones.
 *
 * Distinct from `memory_erasure_tombstones` (MEMLIFE subject erasure). This
 * table is a non-destructive marker only — NEVER deletes audit_entries rows
 * and must not break knowledge/memory hash chains. Full derivative purge is
 * a later MEMLIFE milestone (`purged_at` stays null until then).
 */
function applyDsarErasureTombstonesSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS erasure_tombstones (
      id                   TEXT PRIMARY KEY,
      tenant_id            TEXT NOT NULL DEFAULT 'default-tenant',
      entity_type          TEXT NOT NULL,
      entity_id            TEXT NOT NULL,
      reason               TEXT NOT NULL DEFAULT 'dsar',
      tombstoned_by        TEXT NOT NULL,
      tombstoned_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      scheduled_purge_at   TEXT NOT NULL,
      purged_at            TEXT,
      UNIQUE(tenant_id, entity_type, entity_id, reason)
    );
    CREATE INDEX IF NOT EXISTS erasure_tombstones_tenant
      ON erasure_tombstones(tenant_id, tombstoned_at DESC);
    CREATE INDEX IF NOT EXISTS erasure_tombstones_purge
      ON erasure_tombstones(tenant_id, scheduled_purge_at)
      WHERE purged_at IS NULL;
  `);
}

function applyGraphCatchupCheckpointsSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS graph_catchup_checkpoints (
      id                      TEXT PRIMARY KEY,
      episodic_last_id        INTEGER NOT NULL DEFAULT 0,
      vector_last_created_at  TEXT,
      vector_last_id          TEXT,
      updated_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );
  `);
  db.prepare(
    `INSERT OR IGNORE INTO graph_catchup_checkpoints (id, episodic_last_id)
     VALUES ('default', 0)`
  ).run();
}

/**
 * connector_sync_state: per-(connection, tool) high-water mark for the
 * connector ingestion job. Mirrors ingest_meta's role for JSONL files.
 *
 * `cursor_value` holds the provider's incremental key (for Linear, the
 * `updatedAt` of the newest record seen) so the next cycle asks only for what
 * changed. `page_cursor` is non-null only mid-backfill: a first sync over a
 * large workspace spans many cycles, and parking the page cursor here makes it
 * resumable rather than restarting the sweep every interval.
 */
function applyConnectorSyncStateSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS connector_sync_state (
      connection_id TEXT NOT NULL,
      provider_key  TEXT NOT NULL,
      tool          TEXT NOT NULL,
      cursor_value  TEXT,
      page_cursor   TEXT,
      last_run_at   TEXT,
      last_status   TEXT,
      rows_written  INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (connection_id, tool)
    );
  `);
}

function applyOntologyRequiredContextPersistenceSchema(db: Database.Database): void {
  // Ontology-sensitive sources and queued belief reviews retain only
  // server-verified coordinates. The source lifecycle is re-resolved at use
  // time, so a later revocation or ontology change denies use before policy,
  // context injection, or belief promotion.
  for (const statement of [
    "ALTER TABLE federation_sources ADD COLUMN ontology_record_type TEXT",
    "ALTER TABLE federation_sources ADD COLUMN ontology_record_id TEXT",
    "ALTER TABLE federation_sources ADD COLUMN ontology_id TEXT",
    "ALTER TABLE federation_sources ADD COLUMN ontology_version TEXT",
    "ALTER TABLE federation_sources ADD COLUMN ontology_content_hash TEXT",
    "ALTER TABLE federation_sources ADD COLUMN ontology_canonical_id TEXT",
    "ALTER TABLE federation_sources ADD COLUMN ontology_source_id TEXT",
    "ALTER TABLE federation_sources ADD COLUMN ontology_source_hash TEXT",
    "ALTER TABLE federation_sources ADD COLUMN ontology_derivative_id TEXT",
    "ALTER TABLE belief_review_queue ADD COLUMN ontology_record_type TEXT",
    "ALTER TABLE belief_review_queue ADD COLUMN ontology_record_id TEXT",
    "ALTER TABLE belief_review_queue ADD COLUMN ontology_space_id TEXT",
    "ALTER TABLE belief_review_queue ADD COLUMN ontology_id TEXT",
    "ALTER TABLE belief_review_queue ADD COLUMN ontology_version TEXT",
    "ALTER TABLE belief_review_queue ADD COLUMN ontology_content_hash TEXT",
    "ALTER TABLE belief_review_queue ADD COLUMN ontology_canonical_id TEXT",
    "ALTER TABLE belief_review_queue ADD COLUMN ontology_source_id TEXT",
    "ALTER TABLE belief_review_queue ADD COLUMN ontology_source_hash TEXT",
    "ALTER TABLE belief_review_queue ADD COLUMN ontology_derivative_id TEXT",
  ]) {
    try {
      db.exec(statement);
    } catch {
      // The migration is additive and safe to replay.
    }
  }
  db.exec(`
    CREATE INDEX IF NOT EXISTS federation_sources_ontology_context
      ON federation_sources(tenant_id, space_id, ontology_record_type, ontology_record_id);
    CREATE INDEX IF NOT EXISTS belief_review_queue_ontology_context
      ON belief_review_queue(tenant_id, status, ontology_record_type, ontology_record_id);
  `);
}

function applyOntologyMigrationSnapshotClosureSchema(db: Database.Database): void {
  // Migration execution must be derived from a plan-time snapshot, never a
  // caller-provided execution subset. Snapshot rows carry only scoped
  // identifiers and ontology/source coordinates, not source content.
  db.exec(`
    CREATE TABLE IF NOT EXISTS ontology_migration_snapshots (
      id                    TEXT PRIMARY KEY,
      plan_id               TEXT NOT NULL UNIQUE REFERENCES ontology_migration_plans(id),
      tenant_id             TEXT NOT NULL,
      space_id              TEXT NOT NULL,
      source_ontology_id    TEXT NOT NULL,
      source_version        TEXT NOT NULL,
      source_hash           TEXT NOT NULL,
      inventory_hash        TEXT NOT NULL,
      item_count            INTEGER NOT NULL CHECK(item_count > 0),
      created_by            TEXT NOT NULL,
      created_at            TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ontology_migration_snapshot_items (
      id                    TEXT PRIMARY KEY,
      snapshot_id           TEXT NOT NULL REFERENCES ontology_migration_snapshots(id),
      ordinal               INTEGER NOT NULL CHECK(ordinal >= 0),
      tenant_id             TEXT NOT NULL,
      space_id              TEXT NOT NULL,
      record_type           TEXT NOT NULL,
      record_id             TEXT NOT NULL,
      source_type           TEXT NOT NULL,
      source_ontology_id    TEXT NOT NULL,
      source_version        TEXT NOT NULL,
      source_hash           TEXT NOT NULL,
      source_versioned_record_id TEXT NOT NULL,
      source_id             TEXT NOT NULL,
      source_lifecycle_hash TEXT NOT NULL,
      source_record_hash    TEXT NOT NULL,
      created_at            TEXT NOT NULL,
      UNIQUE(snapshot_id, ordinal),
      UNIQUE(snapshot_id, record_type, record_id)
    );
    CREATE INDEX IF NOT EXISTS ontology_migration_snapshot_items_scope
      ON ontology_migration_snapshot_items(snapshot_id, tenant_id, space_id, ordinal);
  `);

  for (const statement of [
    "ALTER TABLE ontology_migration_checkpoints ADD COLUMN snapshot_id TEXT",
    "ALTER TABLE ontology_migration_checkpoints ADD COLUMN snapshot_item_id TEXT",
    "ALTER TABLE ontology_migration_checkpoints ADD COLUMN source_ontology_id TEXT",
    "ALTER TABLE ontology_migration_checkpoints ADD COLUMN source_version TEXT",
    "ALTER TABLE ontology_migration_checkpoints ADD COLUMN source_hash TEXT",
    "ALTER TABLE ontology_migration_checkpoints ADD COLUMN source_id TEXT",
    "ALTER TABLE ontology_migration_checkpoints ADD COLUMN source_lifecycle_hash TEXT",
    "ALTER TABLE ontology_migration_checkpoints ADD COLUMN source_record_hash TEXT",
    "ALTER TABLE ontology_migration_checkpoints ADD COLUMN versioned_record_id TEXT",
    "ALTER TABLE ontology_versioned_records ADD COLUMN migration_snapshot_id TEXT",
    "ALTER TABLE ontology_versioned_records ADD COLUMN migration_snapshot_item_id TEXT",
  ]) {
    try {
      db.exec(statement);
    } catch {
      // Additive migration replay.
    }
  }

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS ontology_migration_checkpoints_snapshot_item
      ON ontology_migration_checkpoints(snapshot_item_id)
      WHERE snapshot_item_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS ontology_versioned_records_snapshot_item
      ON ontology_versioned_records(migration_snapshot_item_id)
      WHERE migration_snapshot_item_id IS NOT NULL;

    CREATE TRIGGER IF NOT EXISTS ontology_migration_snapshots_no_update
      BEFORE UPDATE ON ontology_migration_snapshots
      BEGIN SELECT RAISE(ABORT, 'ontology migration snapshots are immutable'); END;
    CREATE TRIGGER IF NOT EXISTS ontology_migration_snapshots_no_delete
      BEFORE DELETE ON ontology_migration_snapshots
      BEGIN SELECT RAISE(ABORT, 'ontology migration snapshots are immutable'); END;
    CREATE TRIGGER IF NOT EXISTS ontology_migration_snapshot_items_no_update
      BEFORE UPDATE ON ontology_migration_snapshot_items
      BEGIN SELECT RAISE(ABORT, 'ontology migration snapshot items are immutable'); END;
    CREATE TRIGGER IF NOT EXISTS ontology_migration_snapshot_items_no_delete
      BEFORE DELETE ON ontology_migration_snapshot_items
      BEGIN SELECT RAISE(ABORT, 'ontology migration snapshot items are immutable'); END;
  `);
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

    -- ONE update trigger, not a delete-trigger plus an insert-trigger.
    --
    -- SQLite does not guarantee the firing order of two AFTER UPDATE triggers
    -- on the same table, and in practice the insert fired first: the paired
    -- 'delete' then removed the tokens the insert had just written. The net
    -- effect was that every term appearing in BOTH the old and the new
    -- content silently vanished from the index, while terms unique to the new
    -- content survived — an index that looks populated and is quietly wrong.
    --
    -- Reproduced on cordant-hermes-01 after connector rows began being
    -- rewritten: a Notion page stored as
    --   https://app.notion.com/p/Teamspace-Home-...
    -- and updated to "Teamspace Home. Give your colleagues a place..."
    -- matched 'colleagues' but NOT 'Teamspace' or 'Home'. This was latent for
    -- as long as nothing rewrote indexed content, and affects any connector
    -- record edited upstream (a reworded Linear issue), not just Notion.
    --
    -- Both statements now live in one trigger body, where SQLite executes
    -- them in written order, so the delete always precedes the insert. The
    -- per-row label conditions move from WHEN into each statement's WHERE so
    -- the old-row and new-row cases stay independently gated.
    CREATE TRIGGER messages_au AFTER UPDATE ON messages
    BEGIN
      INSERT INTO messages_fts(messages_fts, rowid, content, project, timestamp, agent_id)
      SELECT 'delete', old.id, old.content, old.project, old.timestamp, old.agent_id
      WHERE old.policy = 'indexable'
        AND old.visibility IN ('internal','public_safe','public_approved');

      INSERT INTO messages_fts(rowid, content, project, timestamp, agent_id)
      SELECT new.id, new.content, new.project, new.timestamp, new.agent_id
      WHERE new.policy = 'indexable'
        AND new.visibility IN ('internal','public_safe','public_approved');
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


  // connector_sync_state is created by migration 32 (applyConnectorSyncStateSchema)
  // so existing databases pick it up too — a table added only here would never
  // reach a DB already stamped at an earlier version.

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
    // Phase 199: rebuild outside a transaction with FK toggled OFF/ON.
    withForeignKeysDisabled(db, () => {
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
    });
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
      revoked_at   TEXT,
      expires_at   TEXT
    );
    CREATE INDEX IF NOT EXISTS agent_api_keys_hash
      ON agent_api_keys(key_hash);
    CREATE INDEX IF NOT EXISTS agent_api_keys_agent
      ON agent_api_keys(agent_id, revoked_at);
  `);
  // Phase 199: additive expires_at for existing DBs created before this column.
  try {
    db.exec(`ALTER TABLE agent_api_keys ADD COLUMN expires_at TEXT`);
  } catch {
    // Column already exists.
  }

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
    // Phase 199: rebuild outside a transaction with FK toggled OFF/ON.
    withForeignKeysDisabled(db, () => {
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
    });
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
      last_login_at TEXT,
      disabled_at   TEXT
    );
    CREATE INDEX IF NOT EXISTS users_email ON users(email);
    CREATE INDEX IF NOT EXISTS users_tenant ON users(tenant_id);

    CREATE TABLE IF NOT EXISTS user_roles (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role    TEXT NOT NULL CHECK(role IN ('admin','operator','reviewer')),
      PRIMARY KEY (user_id, role)
    );

    -- Phase 203: external OIDC identities (Google console registration/login).
    -- One row per (provider, subject); a user may hold several providers.
    CREATE TABLE IF NOT EXISTS user_identities (
      provider   TEXT NOT NULL CHECK(provider IN ('google')),
      subject    TEXT NOT NULL,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      PRIMARY KEY (provider, subject)
    );
    CREATE INDEX IF NOT EXISTS user_identities_user ON user_identities(user_id);

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

  // Phase 199: soft-disable column for existing DBs (offboarding without hard delete).
  try {
    db.exec(`ALTER TABLE users ADD COLUMN disabled_at TEXT`);
  } catch {
    // Column already exists.
  }

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
