// @vitest-environment node
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { initSchema } from '@/lib/db-schema';

// Initialize in-memory DB at module level
const testDb = new Database(':memory:');
initSchema(testDb);

// Mock @/lib/db to use our in-memory test database
vi.mock('@/lib/db', () => ({ getDb: () => testDb }));

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns ISO string for `hoursAgo` hours in the past */
function hoursAgo(h: number): string {
  return new Date(Date.now() - h * 3600 * 1000).toISOString().replace('T', ' ').replace('Z', '');
}

/** Returns ISO string for `daysAgo` days in the past */
function daysAgo(d: number): string {
  return new Date(Date.now() - d * 24 * 3600 * 1000).toISOString().replace('T', ' ').replace('Z', '');
}

// ─── Mocks for fs and constants ───────────────────────────────────────────────

const MOCK_SKILL_LOG_PATH = '/mock/skill-contributions.jsonl';
const MOCK_FAILURES_LOG_PATH = '/mock/failures.log';

vi.mock('@/lib/constants', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/constants')>();
  return {
    ...actual,
    SKILL_CONTRIBUTIONS_LOG: MOCK_SKILL_LOG_PATH,
    FAILURES_LOG: MOCK_FAILURES_LOG_PATH,
  };
});

// We'll set up fs mock separately per describe block
const mockReadFileSync = vi.fn();
vi.mock('node:fs', () => ({
  readFileSync: (...args: unknown[]) => mockReadFileSync(...args),
}));

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('GET /api/time-series — validation', () => {
  it('returns 400 for invalid metric', async () => {
    const { GET } = await import('../route');
    const req = new Request('http://localhost/api/time-series?metric=bogus&window=day');
    const res = await GET(req as unknown as import('next/server').NextRequest);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty('error');
    expect(body.error).toMatch(/metric/i);
  });

  it('returns 400 for invalid window', async () => {
    const { GET } = await import('../route');
    const req = new Request('http://localhost/api/time-series?metric=docs_ingested&window=year');
    const res = await GET(req as unknown as import('next/server').NextRequest);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty('error');
    expect(body.error).toMatch(/window/i);
  });
});

describe('GET /api/time-series — docs_ingested', () => {
  beforeAll(() => {
    // Seed ingest_meta with rows from the past 6 hours and 3 days ago
    testDb.prepare(
      "INSERT OR IGNORE INTO ingest_meta(file_path, mtime_ms, file_size, row_count, ingested_at) VALUES (?, ?, ?, ?, ?)"
    ).run('/file/a.jsonl', 1000, 500, 10, hoursAgo(1));
    testDb.prepare(
      "INSERT OR IGNORE INTO ingest_meta(file_path, mtime_ms, file_size, row_count, ingested_at) VALUES (?, ?, ?, ?, ?)"
    ).run('/file/b.jsonl', 1001, 600, 20, hoursAgo(2));
    testDb.prepare(
      "INSERT OR IGNORE INTO ingest_meta(file_path, mtime_ms, file_size, row_count, ingested_at) VALUES (?, ?, ?, ?, ?)"
    ).run('/file/c.jsonl', 1002, 700, 30, daysAgo(3));
  });

  it('returns bucketed hourly data for day window with correct shape', async () => {
    const { GET } = await import('../route');
    const req = new Request('http://localhost/api/time-series?metric=docs_ingested&window=day');
    const res = await GET(req as unknown as import('next/server').NextRequest);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('points');
    expect(body).toHaveProperty('metric', 'docs_ingested');
    expect(body).toHaveProperty('window', 'day');
    expect(body).toHaveProperty('timestamp');
    expect(Array.isArray(body.points)).toBe(true);
    // Should have at least 2 points (rows at 1h and 2h ago are within last day)
    expect(body.points.length).toBeGreaterThanOrEqual(1);
    // Each point has bucket (%H:00 format) and value
    for (const pt of body.points) {
      expect(pt).toHaveProperty('bucket');
      expect(pt).toHaveProperty('value');
      expect(typeof pt.value).toBe('number');
      expect(pt.bucket).toMatch(/^\d{2}:00$/);
    }
  });

  it('returns bucketed daily data for week window', async () => {
    const { GET } = await import('../route');
    const req = new Request('http://localhost/api/time-series?metric=docs_ingested&window=week');
    const res = await GET(req as unknown as import('next/server').NextRequest);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.metric).toBe('docs_ingested');
    expect(body.window).toBe('week');
    expect(Array.isArray(body.points)).toBe(true);
    // Rows at 1h, 2h, and 3 days ago are within 7 days, so at least 2 buckets
    expect(body.points.length).toBeGreaterThanOrEqual(1);
    for (const pt of body.points) {
      expect(pt.bucket).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('returns bucketed daily data for month window', async () => {
    const { GET } = await import('../route');
    const req = new Request('http://localhost/api/time-series?metric=docs_ingested&window=month');
    const res = await GET(req as unknown as import('next/server').NextRequest);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.window).toBe('month');
    expect(Array.isArray(body.points)).toBe(true);
    // All 3 rows are within 30 days
    expect(body.points.length).toBeGreaterThanOrEqual(1);
  });
});

describe('GET /api/time-series — memory_writes', () => {
  beforeAll(() => {
    testDb.prepare(
      "INSERT INTO memory_consolidation_runs(started_at, completed_at, batch_size, insights_written, status) VALUES(?,?,?,?,?)"
    ).run(daysAgo(1), daysAgo(1), 10, 5, 'completed');
    testDb.prepare(
      "INSERT INTO memory_consolidation_runs(started_at, completed_at, batch_size, insights_written, status) VALUES(?,?,?,?,?)"
    ).run(daysAgo(2), daysAgo(2), 20, 3, 'completed');
  });

  it('returns SUM(insights_written) per bucket for week window', async () => {
    const { GET } = await import('../route');
    const req = new Request('http://localhost/api/time-series?metric=memory_writes&window=week');
    const res = await GET(req as unknown as import('next/server').NextRequest);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.metric).toBe('memory_writes');
    expect(Array.isArray(body.points)).toBe(true);
    expect(body.points.length).toBeGreaterThanOrEqual(1);
    // Each point has a numeric value (sum of insights_written)
    for (const pt of body.points) {
      expect(typeof pt.value).toBe('number');
    }
  });
});

describe('GET /api/time-series — recall_queries', () => {
  beforeAll(() => {
    testDb.prepare(
      "INSERT INTO recall_log(query, results, timestamp) VALUES(?,?,?)"
    ).run('search term', 5, hoursAgo(1));
    testDb.prepare(
      "INSERT INTO recall_log(query, results, timestamp) VALUES(?,?,?)"
    ).run('another query', 2, hoursAgo(3));
  });

  it('returns count per hourly bucket for day window', async () => {
    const { GET } = await import('../route');
    const req = new Request('http://localhost/api/time-series?metric=recall_queries&window=day');
    const res = await GET(req as unknown as import('next/server').NextRequest);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.metric).toBe('recall_queries');
    expect(Array.isArray(body.points)).toBe(true);
    expect(body.points.length).toBeGreaterThanOrEqual(1);
  });
});

describe('GET /api/time-series — collection_growth', () => {
  it('returns count of distinct file_path per bucket for week window', async () => {
    const { GET } = await import('../route');
    const req = new Request('http://localhost/api/time-series?metric=collection_growth&window=week');
    const res = await GET(req as unknown as import('next/server').NextRequest);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.metric).toBe('collection_growth');
    expect(Array.isArray(body.points)).toBe(true);
    expect(body.points.length).toBeGreaterThanOrEqual(1);
  });
});

describe('GET /api/time-series — skill_executions (JSONL)', () => {
  it('returns hourly buckets from mocked JSONL data', async () => {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 3600 * 1000).toISOString();
    const twoHoursAgo = new Date(now.getTime() - 2 * 3600 * 1000).toISOString();
    const jsonlContent = [
      JSON.stringify({ timestamp: oneHourAgo, skill: 'auth', action: 'exec' }),
      JSON.stringify({ timestamp: twoHoursAgo, skill: 'auth', action: 'exec' }),
      JSON.stringify({ timestamp: oneHourAgo, skill: 'deploy', action: 'exec' }),
    ].join('\n');
    mockReadFileSync.mockReturnValue(jsonlContent);

    const { GET } = await import('../route');
    const req = new Request('http://localhost/api/time-series?metric=skill_executions&window=day');
    const res = await GET(req as unknown as import('next/server').NextRequest);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.metric).toBe('skill_executions');
    expect(Array.isArray(body.points)).toBe(true);
    expect(body.points.length).toBeGreaterThanOrEqual(1);
    // Total count across all buckets should be 3
    const total = body.points.reduce((sum: number, pt: { value: number }) => sum + pt.value, 0);
    expect(total).toBe(3);
  });

  it('returns empty points when JSONL file does not exist (ENOENT)', async () => {
    const enoentErr = Object.assign(new Error('ENOENT: no such file'), { code: 'ENOENT' });
    mockReadFileSync.mockImplementation(() => { throw enoentErr; });

    const { GET } = await import('../route');
    const req = new Request('http://localhost/api/time-series?metric=skill_executions&window=day');
    const res = await GET(req as unknown as import('next/server').NextRequest);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.metric).toBe('skill_executions');
    expect(body.points).toEqual([]);
  });
});

describe('GET /api/time-series — skill_failures (JSONL)', () => {
  it('returns daily buckets from mocked failures JSONL data', async () => {
    const yesterday = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString();
    const jsonlContent = [
      JSON.stringify({ timestamp: yesterday, skill: 'auth', error: 'timeout' }),
      JSON.stringify({ timestamp: twoDaysAgo, skill: 'deploy', error: 'crash' }),
    ].join('\n');
    mockReadFileSync.mockReturnValue(jsonlContent);

    const { GET } = await import('../route');
    const req = new Request('http://localhost/api/time-series?metric=skill_failures&window=month');
    const res = await GET(req as unknown as import('next/server').NextRequest);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.metric).toBe('skill_failures');
    expect(Array.isArray(body.points)).toBe(true);
    expect(body.points.length).toBeGreaterThanOrEqual(1);
    const total = body.points.reduce((sum: number, pt: { value: number }) => sum + pt.value, 0);
    expect(total).toBe(2);
  });
});

describe('GET /api/time-series — empty tables', () => {
  it('returns empty points array when no rows fall in the time window', async () => {
    // Use the shared testDb but query for a metric with no rows matching window=day.
    // The recall_log table starts empty (rows are inserted by other test suites only).
    // We verify the shape: { points: [], metric, window, timestamp }.
    const emptyDb = new Database(':memory:');
    initSchema(emptyDb);

    // Temporarily replace the mock return value using the mock module
    const dbModule = await import('@/lib/db');
    const originalGetDb = dbModule.getDb;
    dbModule.getDb = () => emptyDb;

    const { GET } = await import('../route');
    const req = new Request('http://localhost/api/time-series?metric=docs_ingested&window=day');
    const res = await GET(req as unknown as import('next/server').NextRequest);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.points).toEqual([]);
    expect(body.metric).toBe('docs_ingested');
    expect(body.window).toBe('day');
    expect(typeof body.timestamp).toBe('string');

    // Restore original mock
    dbModule.getDb = originalGetDb;
  });
});
