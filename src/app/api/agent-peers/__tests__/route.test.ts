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

describe('GET /api/agent-peers', () => {
  it.todo('returns correct GROUP BY result from hive_actions');
  it.todo('excludes agents with no activity inside window');
  it.todo('window param caps at 1440 minutes');
  it.todo('response includes current_task, status, last_seen fields');
});
