// @vitest-environment node
import Database from 'better-sqlite3';
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';

const testDb = new Database(':memory:');

vi.mock('@/lib/db', () => ({
  getDb: () => testDb,
  closeDb: () => {},
}));

vi.mock('@anthropic-ai/sdk', () => {
  const mockCreate = vi.fn().mockResolvedValue({
    content: [
      {
        type: 'text',
        text: JSON.stringify([
          { insight_type: 'pattern', content: 'Test pattern insight' },
        ]),
      },
    ],
  });
  return {
    default: vi.fn().mockImplementation(() => ({
      messages: { create: mockCreate },
    })),
  };
});

const { initSchema } = await import('@/lib/db-schema');
initSchema(testDb);

afterAll(() => {
  testDb.close();
});

describe('runConsolidation', () => {
  beforeEach(() => {
    vi.resetModules();
    testDb.exec('DELETE FROM memory_meta_insights');
    testDb.exec('DELETE FROM memory_consolidation_runs');
    testDb.exec('UPDATE messages SET consolidated = 0');
  });

  it.todo('marks messages as consolidated=1 after successful run');
  it.todo('creates a row in memory_consolidation_runs with status=completed');
  it.todo('writes parsed meta-insights to memory_meta_insights');
  it.todo('skips already-consolidated messages (WHERE consolidated=0)');
  it.todo('handles LLM JSON parse failure gracefully (returns empty insights)');
  it.todo('logs warning and exits when ANTHROPIC_API_KEY is missing');
});

describe('startConsolidationScheduler', () => {
  it.todo('double-start guard prevents duplicate intervals');
});
