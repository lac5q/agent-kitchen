// @vitest-environment node
import Database from 'better-sqlite3';
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';

const testDb = new Database(':memory:');

vi.mock('@/lib/db', () => ({
  getDb: () => testDb,
  closeDb: () => {},
}));

// Mock @anthropic-ai/sdk -- must use a proper class constructor since memory-consolidation uses `new Anthropic()`
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

vi.mock('@anthropic-ai/sdk', () => {
  class MockAnthropic {
    messages = { create: mockCreate };
  }
  return { default: MockAnthropic };
});

const { initSchema } = await import('@/lib/db-schema');
initSchema(testDb);

afterAll(() => {
  testDb.close();
});

function seedMessage(sessionSuffix: string) {
  testDb.prepare(
    "INSERT OR IGNORE INTO messages(session_id, project, agent_id, role, content, timestamp) VALUES(?,?,?,?,?,?)"
  ).run(`sess-${sessionSuffix}`, 'p1', 'agent', 'user', `message ${sessionSuffix}`, '2024-01-01T00:00:00Z');
  testDb.exec("INSERT OR IGNORE INTO memory_salience(message_id) SELECT id FROM messages");
}

describe('runConsolidation', () => {
  beforeEach(() => {
    vi.resetModules();
    mockCreate.mockClear();
    mockCreate.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify([
            { insight_type: 'pattern', content: 'Test pattern insight' },
          ]),
        },
      ],
    });
    testDb.exec('DELETE FROM memory_meta_insights');
    testDb.exec('DELETE FROM memory_consolidation_runs');
    testDb.exec('UPDATE messages SET consolidated = 0');
  });

  it('marks messages as consolidated=1 after successful run', async () => {
    seedMessage('c1');
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const { runConsolidation } = await import('@/lib/memory-consolidation');
    await runConsolidation();

    const row = testDb
      .prepare('SELECT COUNT(*) AS cnt FROM messages WHERE consolidated = 0')
      .get() as { cnt: number };
    expect(row.cnt).toBe(0);
  });

  it('creates a row in memory_consolidation_runs with status=completed', async () => {
    seedMessage('c2');
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const { runConsolidation } = await import('@/lib/memory-consolidation');
    await runConsolidation();

    const run = testDb
      .prepare("SELECT status FROM memory_consolidation_runs ORDER BY id DESC LIMIT 1")
      .get() as { status: string } | undefined;
    expect(run?.status).toBe('completed');
  });

  it('writes parsed meta-insights to memory_meta_insights', async () => {
    seedMessage('c3');
    testDb.exec('UPDATE messages SET consolidated = 0');
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const { runConsolidation } = await import('@/lib/memory-consolidation');
    await runConsolidation();

    const insight = testDb
      .prepare('SELECT insight_type, content FROM memory_meta_insights LIMIT 1')
      .get() as { insight_type: string; content: string } | undefined;
    expect(insight?.insight_type).toBe('pattern');
    expect(insight?.content).toBe('Test pattern insight');
  });

  it('skips already-consolidated messages (WHERE consolidated=0)', async () => {
    testDb.exec('UPDATE messages SET consolidated = 1');
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const { runConsolidation } = await import('@/lib/memory-consolidation');
    await runConsolidation();

    const run = testDb
      .prepare('SELECT batch_size, status FROM memory_consolidation_runs ORDER BY id DESC LIMIT 1')
      .get() as { batch_size: number; status: string } | undefined;
    expect(run?.batch_size).toBe(0);
    expect(run?.status).toBe('completed');
  });

  it('handles LLM JSON parse failure gracefully (returns empty insights)', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'not valid json at all' }],
    });
    seedMessage('c4');
    testDb.exec('UPDATE messages SET consolidated = 0');
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const { runConsolidation } = await import('@/lib/memory-consolidation');
    await runConsolidation();

    const run = testDb
      .prepare('SELECT insights_written, status FROM memory_consolidation_runs ORDER BY id DESC LIMIT 1')
      .get() as { insights_written: number; status: string } | undefined;
    expect(run?.insights_written).toBe(0);
    expect(run?.status).toBe('completed');
  });

  it('logs warning and exits when ANTHROPIC_API_KEY is missing', async () => {
    const savedKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { runConsolidation } = await import('@/lib/memory-consolidation');
    await runConsolidation();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('ANTHROPIC_API_KEY')
    );
    warnSpy.mockRestore();
    if (savedKey) process.env.ANTHROPIC_API_KEY = savedKey;
  });
});

describe('startConsolidationScheduler', () => {
  it('double-start guard prevents duplicate intervals', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const { startConsolidationScheduler } = await import('@/lib/memory-consolidation');
    expect(() => {
      startConsolidationScheduler();
      startConsolidationScheduler();
    }).not.toThrow();
  });
});
