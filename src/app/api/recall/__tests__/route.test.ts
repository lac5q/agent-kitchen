// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import os from 'os';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

// Use a unique temp DB for this test suite
const TEST_DB_DIR = path.join(os.tmpdir(), `recall-route-test-${crypto.randomUUID()}`);
const TEST_DB_PATH = path.join(TEST_DB_DIR, 'test-recall.db');

// Set env vars before any imports
process.env.SQLITE_DB_PATH = TEST_DB_PATH;

// Mock the db module so we use our temp DB
vi.mock('@/lib/db', async () => {
  fs.mkdirSync(TEST_DB_DIR, { recursive: true });
  const Database = (await import('better-sqlite3')).default;
  const { initSchema } = await import('@/lib/db-schema');
  const db = new Database(TEST_DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  initSchema(db);
  return {
    getDb: () => db,
    closeDb: () => db.close(),
  };
});

afterAll(() => {
  if (fs.existsSync(TEST_DB_DIR)) {
    fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
  }
});

// ─── GET /api/recall ───────────────────────────────────────────────────────────

describe('GET /api/recall', () => {
  beforeEach(async () => {
    vi.resetModules();
  });

  it('returns empty results array when q is missing', async () => {
    const { GET } = await import('../route');
    const req = new Request('http://localhost/api/recall');
    const res = await GET(req as unknown as import('next/server').NextRequest);
    const body = await res.json();
    expect(Array.isArray(body.results)).toBe(true);
    expect(body.results.length).toBe(0);
    expect(body.timestamp).toBeDefined();
  });

  it('returns empty results array when q is empty string', async () => {
    const { GET } = await import('../route');
    const req = new Request('http://localhost/api/recall?q=');
    const res = await GET(req as unknown as import('next/server').NextRequest);
    const body = await res.json();
    expect(Array.isArray(body.results)).toBe(true);
    expect(body.results.length).toBe(0);
  });

  it('returns results array and query field when q is provided', async () => {
    const { GET } = await import('../route');
    const req = new Request('http://localhost/api/recall?q=test');
    const res = await GET(req as unknown as import('next/server').NextRequest);
    const body = await res.json();
    expect(Array.isArray(body.results)).toBe(true);
    expect(body.query).toBe('test');
    expect(body.timestamp).toBeDefined();
  });

  it('persists last_recall_query to meta table', async () => {
    const { GET } = await import('../route');
    const { getDb } = await import('@/lib/db');
    const req = new Request('http://localhost/api/recall?q=uniquerecallquery');
    await GET(req as unknown as import('next/server').NextRequest);
    const db = getDb();
    const row = db.prepare("SELECT value FROM meta WHERE key='last_recall_query'").get() as
      | { value: string }
      | undefined;
    expect(row?.value).toBe('uniquerecallquery');
  });
});

// ─── GET /api/recall access_count increment (MEM-02) ─────────────────────────

describe('GET /api/recall -- access_count increment', () => {
  it('increments access_count and sets last_accessed on memory_salience for recalled messages', async () => {
    // Insert a message and a FTS entry so recall can find it
    const { getDb } = await import('@/lib/db');
    const db = getDb();

    const msgId = db.prepare(
      "INSERT INTO messages(session_id, project, agent_id, role, content, timestamp) VALUES(?,?,?,?,?,?)"
    ).run('sess-ac1', 'p1', 'agent', 'user', 'zypherium keyword unique', '2024-01-01T00:00:00Z').lastInsertRowid as number;

    // Seed memory_salience with access_count=0
    db.prepare('INSERT OR IGNORE INTO memory_salience(message_id, access_count) VALUES(?, 0)').run(msgId);

    // Verify initial state
    const before = db.prepare('SELECT access_count, last_accessed FROM memory_salience WHERE message_id = ?').get(msgId) as { access_count: number; last_accessed: string | null };
    expect(before.access_count).toBe(0);
    expect(before.last_accessed).toBeNull();

    vi.resetModules();
    const { GET } = await import('../route');
    const req = new Request('http://localhost/api/recall?q=zypherium');
    await GET(req as unknown as import('next/server').NextRequest);

    // Verify access_count incremented and last_accessed set
    const after = db.prepare('SELECT access_count, last_accessed FROM memory_salience WHERE message_id = ?').get(msgId) as { access_count: number; last_accessed: string | null };
    expect(after.access_count).toBe(1);
    expect(after.last_accessed).not.toBeNull();
  });
});

// ─── GET /api/recall/stats ────────────────────────────────────────────────────

describe('GET /api/recall/stats', () => {
  it('returns all 4 stat fields: rowCount, lastIngest, lastRecallQuery, dbSizeBytes', async () => {
    const { GET } = await import('../stats/route');
    const req = new Request('http://localhost/api/recall/stats');
    const res = await GET(req as unknown as import('next/server').NextRequest);
    const body = await res.json();
    expect(body).toHaveProperty('rowCount');
    expect(body).toHaveProperty('lastIngest');
    expect(body).toHaveProperty('lastRecallQuery');
    expect(body).toHaveProperty('dbSizeBytes');
    expect(body).toHaveProperty('timestamp');
    expect(typeof body.rowCount).toBe('number');
    expect(typeof body.dbSizeBytes).toBe('number');
  });
});

// ─── POST /api/recall/ingest ──────────────────────────────────────────────────

describe('POST /api/recall/ingest', () => {
  it('returns filesProcessed, rowsInserted, filesSkipped, and timestamp', async () => {
    const { POST } = await import('../ingest/route');
    const req = new Request('http://localhost/api/recall/ingest', { method: 'POST' });
    const res = await POST(req as unknown as import('next/server').NextRequest);
    const body = await res.json();
    expect(body).toHaveProperty('filesProcessed');
    expect(body).toHaveProperty('rowsInserted');
    expect(body).toHaveProperty('filesSkipped');
    expect(body).toHaveProperty('timestamp');
    expect(typeof body.filesProcessed).toBe('number');
    expect(typeof body.rowsInserted).toBe('number');
    expect(typeof body.filesSkipped).toBe('number');
  });

  it('returns HTTP 200 on success', async () => {
    const { POST } = await import('../ingest/route');
    const req = new Request('http://localhost/api/recall/ingest', { method: 'POST' });
    const res = await POST(req as unknown as import('next/server').NextRequest);
    expect(res.status).toBe(200);
  });
});
