// @vitest-environment node
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import os from 'os';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

// Use a unique temp directory per test run to avoid conflicts with parallel agents
const TEST_DB_DIR = path.join(os.tmpdir(), `db-test-${crypto.randomUUID()}`);
const TEST_DB_PATH = path.join(TEST_DB_DIR, 'test-conversations.db');

// Override the env var before importing db module
process.env.SQLITE_DB_PATH = TEST_DB_PATH;

// Lazy imports after env var is set
let getDb: () => import('better-sqlite3').Database;
let closeDb: () => void;
let SQLITE_DB_PATH: string;
let initSchema: (db: import('better-sqlite3').Database) => void;
let rebuildMessageFtsProjection: (db: import('better-sqlite3').Database) => void;

describe('SQLite DB layer', () => {
  beforeEach(async () => {
    // Re-import fresh each time by resetting module state via closeDb
    if (closeDb) closeDb();
    // Re-import fresh module to reset singleton
    const dbModule = await import('../db');
    const constantsModule = await import('../constants');
    const schemaModule = await import('../db-schema');
    getDb = dbModule.getDb;
    closeDb = dbModule.closeDb;
    SQLITE_DB_PATH = constantsModule.SQLITE_DB_PATH;
    initSchema = schemaModule.initSchema;
    rebuildMessageFtsProjection = schemaModule.rebuildMessageFtsProjection;
  });

  afterAll(() => {
    if (closeDb) closeDb();
    // Clean up temp DB directory
    if (fs.existsSync(TEST_DB_DIR)) {
      fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
    }
  });

  it('Test 1: SQLITE_DB_PATH is exported and defaults to data/conversations.db relative path', () => {
    expect(SQLITE_DB_PATH).toBeDefined();
    // When env var overridden, should use env var value
    expect(SQLITE_DB_PATH).toBe(TEST_DB_PATH);
  });

  it('Test 2: getDb() returns a Database instance', () => {
    const db = getDb();
    expect(db).toBeDefined();
    expect(typeof db.prepare).toBe('function');
    expect(typeof db.pragma).toBe('function');
  });

  it('Test 3: getDb() returns the SAME instance on second call (singleton)', () => {
    const db1 = getDb();
    const db2 = getDb();
    expect(db1).toBe(db2);
  });

  it('Test 4: After getDb(), tables messages, messages_fts, ingest_meta, meta all exist', () => {
    const db = getDb();
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type IN ('table', 'shadow') OR (type='table' AND name NOT LIKE 'sqlite_%')"
    ).all() as { name: string }[];
    const names = tables.map((t) => t.name);
    expect(names).toContain('messages');
    expect(names).toContain('ingest_meta');
    expect(names).toContain('meta');

    // FTS5 virtual table check — check via sqlite_master with type='table'
    const allEntries = db.prepare(
      "SELECT name, type FROM sqlite_master WHERE name LIKE 'messages%'"
    ).all() as { name: string; type: string }[];
    const allNames = allEntries.map((e) => e.name);
    expect(allNames).toContain('messages_fts');
  });

  it('Test 4b: initSchema stamps the current schema version in PRAGMA user_version', () => {
    const db = getDb();
    const version = db.pragma('user_version', { simple: true }) as number;
    expect(version).toBeGreaterThan(0);
  });

  it('Test 4c: initSchema upgrades an unstamped legacy database to the current schema version', async () => {
    const Database = (await import('better-sqlite3')).default;
    const legacyDb = new Database(':memory:');
    expect(legacyDb.pragma('user_version', { simple: true })).toBe(0);

    initSchema(legacyDb);

    const version = legacyDb.pragma('user_version', { simple: true }) as number;
    const tables = legacyDb
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='messages'")
      .all();
    expect(version).toBeGreaterThan(0);
    expect(tables).toHaveLength(1);
    legacyDb.close();
  });

  it('Test 4c.1: initSchema rejects a database stamped with a future schema version', async () => {
    const Database = (await import('better-sqlite3')).default;
    const futureDb = new Database(':memory:');
    futureDb.pragma('user_version = 999');

    expect(() => initSchema(futureDb)).toThrow(/newer than this code supports/);
    futureDb.close();
  });

  it('Test 4d: getDb returns only after default admin seeding has completed', () => {
    if (closeDb) closeDb();
    fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
    fs.mkdirSync(TEST_DB_DIR, { recursive: true });

    const previousEmail = process.env.MEMROOS_ADMIN_EMAIL;
    const previousPassword = process.env.MEMROOS_ADMIN_PASSWORD;
    process.env.MEMROOS_ADMIN_EMAIL = `admin-${crypto.randomUUID()}@example.com`;
    process.env.MEMROOS_ADMIN_PASSWORD = `password-${crypto.randomUUID()}`;

    try {
      const db = getDb();
      const row = db
        .prepare('SELECT email FROM users WHERE email = ?')
        .get(process.env.MEMROOS_ADMIN_EMAIL) as { email: string } | undefined;

      expect(row?.email).toBe(process.env.MEMROOS_ADMIN_EMAIL);
    } finally {
      if (previousEmail === undefined) delete process.env.MEMROOS_ADMIN_EMAIL;
      else process.env.MEMROOS_ADMIN_EMAIL = previousEmail;
      if (previousPassword === undefined) delete process.env.MEMROOS_ADMIN_PASSWORD;
      else process.env.MEMROOS_ADMIN_PASSWORD = previousPassword;
    }
  });

  it('Test 4e: getDb seeds registered agents from the repo config when enabled', () => {
    if (closeDb) closeDb();
    fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
    fs.mkdirSync(TEST_DB_DIR, { recursive: true });

    const previousSeed = process.env.MEMROOS_SEED_REGISTERED_AGENTS;
    process.env.MEMROOS_SEED_REGISTERED_AGENTS = 'true';

    try {
      const db = getDb();
      const agents = db
        .prepare('SELECT id, name, platform, protocol FROM registered_agents ORDER BY id')
        .all() as Array<{ id: string; name: string; platform: string; protocol: string }>;
      const apiKeys = db.prepare('SELECT COUNT(*) AS count FROM agent_api_keys').get() as { count: number };
      const capabilities = db
        .prepare(
          `SELECT agent_id, capability_id
           FROM agent_capabilities
           WHERE agent_id IN ('alba', 'codex-desktop-luis-mbp')
           ORDER BY agent_id, capability_id`
        )
        .all() as Array<{ agent_id: string; capability_id: string }>;

      expect(agents).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: 'alba', name: 'Alba', platform: 'hermes' }),
          expect.objectContaining({ id: 'claude-code-luis-mbp', name: 'Claude Code', platform: 'claude' }),
          expect.objectContaining({ id: 'cline-desktop-luis-mbp', name: 'Cline Desktop', platform: 'cline' }),
          expect.objectContaining({ id: 'codex-cloud-memroos', name: 'Codex Cloud', platform: 'codex' }),
          expect.objectContaining({ id: 'codex-desktop-luis-mbp', name: 'Codex Desktop', platform: 'codex' }),
          expect.objectContaining({ id: 'cursor-cloud-memroos', name: 'Cursor Cloud', platform: 'cursor' }),
          expect.objectContaining({ id: 'cursor-desktop-luis-mbp', name: 'Cursor Desktop', platform: 'cursor' }),
          expect.objectContaining({ id: 'gemini-cli-luis-mbp', name: 'Gemini CLI', platform: 'gemini' }),
          expect.objectContaining({ id: 'opencode', name: 'OpenCode', platform: 'opencode', protocol: 'rest' }),
          expect.objectContaining({ id: 'openclaw-desktop-luis-mbp', name: 'OpenClaw Desktop', platform: 'openclaw' }),
          expect.objectContaining({ id: 'qwen-cli-luis-mbp', name: 'Qwen CLI', platform: 'qwen' }),
          expect.objectContaining({ id: 'sophia', name: 'Sophia', platform: 'openclaw' }),
          expect.objectContaining({ id: 'zcode-desktop-luis-mbp', name: 'ZCode Desktop', platform: 'zcode' }),
        ])
      );
      expect(apiKeys.count).toBe(0);
      expect(capabilities).toEqual(
        expect.arrayContaining([
          { agent_id: 'alba', capability_id: 'memory:write:episodic' },
          { agent_id: 'alba', capability_id: 'memory:write:vector' },
          { agent_id: 'codex-desktop-luis-mbp', capability_id: 'memory:write:episodic' },
          { agent_id: 'codex-desktop-luis-mbp', capability_id: 'memory:write:vector' },
        ])
      );
    } finally {
      if (previousSeed === undefined) delete process.env.MEMROOS_SEED_REGISTERED_AGENTS;
      else process.env.MEMROOS_SEED_REGISTERED_AGENTS = previousSeed;
    }
  });

  it('Test 5: messages table has expected columns', () => {
    const db = getDb();
    const cols = db.pragma('table_info(messages)') as { name: string }[];
    const colNames = cols.map((c) => c.name);
    expect(colNames).toContain('id');
    expect(colNames).toContain('session_id');
    expect(colNames).toContain('project');
    expect(colNames).toContain('agent_id');
    expect(colNames).toContain('role');
    expect(colNames).toContain('content');
    expect(colNames).toContain('timestamp');
    expect(colNames).toContain('cwd');
    expect(colNames).toContain('git_branch');
    expect(colNames).toContain('request_id');
  });

  it('Test 5b: messages FTS projection only indexes promoted indexable rows', () => {
    const db = getDb();
    const sealedNeedle = `sealed${crypto.randomUUID().replace(/-/g, '')}`;
    const publicNeedle = `public${crypto.randomUUID().replace(/-/g, '')}`;

    db.prepare(
      `INSERT INTO messages(session_id, project, agent_id, role, content, timestamp, visibility, policy)
       VALUES
       (?, 'test-project', 'test-agent', 'user', ?, ?, 'private', 'sealed'),
       (?, 'test-project', 'test-agent', 'user', ?, ?, 'public_approved', 'indexable')`
    ).run(
      `sealed-${sealedNeedle}`,
      `restricted ${sealedNeedle}`,
      new Date().toISOString(),
      `public-${publicNeedle}`,
      `approved ${publicNeedle}`,
      new Date().toISOString()
    );

    const sealed = db.prepare("SELECT rowid FROM messages_fts WHERE messages_fts MATCH ?").all(sealedNeedle);
    const approved = db.prepare("SELECT rowid FROM messages_fts WHERE messages_fts MATCH ?").all(publicNeedle);

    expect(sealed).toHaveLength(0);
    expect(approved).toHaveLength(1);
  });

  it('Test 5c: repeat schema initialization does not rebuild the messages FTS projection', () => {
    const db = getDb();
    const needle = `repeatinit${crypto.randomUUID().replace(/-/g, '')}`;
    const timestamp = new Date().toISOString();
    const info = db.prepare(
      `INSERT INTO messages(session_id, project, agent_id, role, content, timestamp, visibility, policy)
       VALUES (?, 'test-project', 'test-agent', 'user', ?, ?, 'public_approved', 'indexable')`
    ).run(`repeat-${needle}`, `approved ${needle}`, timestamp);
    const rowid = Number(info.lastInsertRowid);

    expect(db.prepare("SELECT rowid FROM messages_fts WHERE messages_fts MATCH ?").all(needle)).toHaveLength(1);

    db.prepare(
      `INSERT INTO messages_fts(messages_fts, rowid, content, project, timestamp, agent_id)
       VALUES('delete', ?, ?, 'test-project', ?, 'test-agent')`
    ).run(rowid, `approved ${needle}`, timestamp);

    expect(db.prepare("SELECT rowid FROM messages_fts WHERE messages_fts MATCH ?").all(needle)).toHaveLength(0);

    initSchema(db);
    expect(db.prepare("SELECT rowid FROM messages_fts WHERE messages_fts MATCH ?").all(needle)).toHaveLength(0);

    rebuildMessageFtsProjection(db);
    expect(db.prepare("SELECT rowid FROM messages_fts WHERE messages_fts MATCH ?").all(needle)).toHaveLength(1);
  });

  it('Test 6: WAL mode is enabled', () => {
    const db = getDb();
    const result = db.pragma('journal_mode') as { journal_mode: string }[];
    expect(result[0].journal_mode).toBe('wal');
  });
});
