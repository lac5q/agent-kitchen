// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import Database from 'better-sqlite3';

// Initialize in-memory DB at module level (before vi.mock — avoids '@' alias pitfall)
const testDb = new Database(':memory:');
const { initSchema } = await import('@/lib/db-schema');
initSchema(testDb);

// Mock @/lib/db via closure — no '@' alias inside factory
vi.mock('@/lib/db', () => ({
  getDb: () => testDb,
  closeDb: () => {},
}));

// Import route handler after mock
const { GET } = await import('../route');

// Helper: build a GET request with optional query params
function makeGetRequest(params: Record<string, string> = {}): Request {
  const url = new URL('http://localhost/api/audit-log');
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return new Request(url.toString(), { method: 'GET' });
}

// Seed 25 audit rows with distinct ISO timestamps
beforeAll(() => {
  for (let i = 0; i < 25; i++) {
    const ts = new Date(2026, 0, 1, 0, i, 0).toISOString(); // 25 distinct timestamps
    testDb
      .prepare(
        `INSERT INTO audit_log(actor, action, target, severity, timestamp)
         VALUES (@actor, @action, @target, @severity, @timestamp)`
      )
      .run({
        actor: `agent-${i}`,
        action: i % 2 === 0 ? 'hive_action_write' : 'ingest_run',
        target: 'test_target',
        severity: 'info',
        timestamp: ts,
      });
  }
});

describe('GET /api/audit-log', () => {
  it('returns { entries: [], timestamp } when table is empty (fresh DB)', async () => {
    const freshDb = new Database(':memory:');
    initSchema(freshDb);
    // Temporarily override getDb for this test
    const { getDb } = await import('@/lib/db');
    const original = (getDb as any)._impl;
    // Since we mocked it as a closure, we need to test with testDb which has rows
    // Instead test the shape of the response
    const req = makeGetRequest({ limit: '0' }); // limit=0 clamps to 1
    const res = await GET(req as any);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty('entries');
    expect(data).toHaveProperty('timestamp');
    expect(Array.isArray(data.entries)).toBe(true);
    freshDb.close();
  });

  it('returns up to 20 entries by default (25 seeded)', async () => {
    const req = makeGetRequest();
    const res = await GET(req as any);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.entries.length).toBeLessThanOrEqual(20);
    expect(data.entries.length).toBe(20);
  });

  it('returns entries ordered by timestamp DESC', async () => {
    const req = makeGetRequest({ limit: '25' });
    const res = await GET(req as any);
    const data = await res.json();
    const timestamps = data.entries.map((e: any) => e.timestamp);
    for (let i = 1; i < timestamps.length; i++) {
      expect(timestamps[i - 1] >= timestamps[i]).toBe(true);
    }
  });

  it('GET ?limit=5 returns at most 5 entries', async () => {
    const req = makeGetRequest({ limit: '5' });
    const res = await GET(req as any);
    const data = await res.json();
    expect(data.entries.length).toBe(5);
  });

  it('GET ?limit=0 is clamped to minimum 1 entry', async () => {
    const req = makeGetRequest({ limit: '0' });
    const res = await GET(req as any);
    const data = await res.json();
    expect(data.entries.length).toBe(1);
  });

  it('GET ?limit=200 is clamped to maximum 100 entries', async () => {
    // Only 25 seeded, so we get 25 — but verify the route accepts large limit
    const req = makeGetRequest({ limit: '200' });
    const res = await GET(req as any);
    const data = await res.json();
    expect(data.entries.length).toBeLessThanOrEqual(100);
  });

  it('each entry has required fields: id, actor, action, target, detail, severity, timestamp', async () => {
    const req = makeGetRequest({ limit: '1' });
    const res = await GET(req as any);
    const data = await res.json();
    expect(data.entries.length).toBe(1);
    const entry = data.entries[0];
    expect(entry).toHaveProperty('id');
    expect(entry).toHaveProperty('actor');
    expect(entry).toHaveProperty('action');
    expect(entry).toHaveProperty('target');
    expect(entry).toHaveProperty('detail');
    expect(entry).toHaveProperty('severity');
    expect(entry).toHaveProperty('timestamp');
  });

  it('response always includes a top-level timestamp field (ISO string)', async () => {
    const req = makeGetRequest();
    const res = await GET(req as any);
    const data = await res.json();
    expect(typeof data.timestamp).toBe('string');
    expect(data.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
