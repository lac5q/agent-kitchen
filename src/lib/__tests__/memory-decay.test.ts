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

describe('runDecay', () => {
  it.todo('applies correct multiplier per tier (high=0.99, mid=0.98, low=0.95)');
  it.todo('pinned tier salience_score never changes');
  it.todo('salience_score never goes below 0 after multiple decay cycles');
  it.todo('last_decay_at updated; second same-day run does NOT decay again');
  it.todo('LOG() probe stored module-level and determines SQL variant');
});
