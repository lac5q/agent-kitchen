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

describe('SQLite DB layer', () => {
  beforeEach(async () => {
    // Re-import fresh each time by resetting module state via closeDb
    if (closeDb) closeDb();
    // Re-import fresh module to reset singleton
    const dbModule = await import('../db');
    const constantsModule = await import('../constants');
    getDb = dbModule.getDb;
    closeDb = dbModule.closeDb;
    SQLITE_DB_PATH = constantsModule.SQLITE_DB_PATH;
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

  it('Test 6: WAL mode is enabled', () => {
    const db = getDb();
    const result = db.pragma('journal_mode') as { journal_mode: string }[];
    expect(result[0].journal_mode).toBe('wal');
  });
});
