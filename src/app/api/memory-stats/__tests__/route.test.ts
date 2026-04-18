// @vitest-environment node
import Database from 'better-sqlite3';
import { describe, it, vi } from 'vitest';

const testDb = new Database(':memory:');

vi.mock('@/lib/db', () => ({
  getDb: () => testDb,
  closeDb: () => {},
}));

const { initSchema } = await import('@/lib/db-schema');
initSchema(testDb);

describe('GET /api/memory-stats', () => {
  it.todo('returns lastRun, pendingUnconsolidated, and tierStats');
  it.todo('returns null lastRun when no consolidation runs exist');
  it.todo('pendingUnconsolidated decreases after marking messages consolidated');
});
