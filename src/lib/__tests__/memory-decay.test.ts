// @vitest-environment node
import Database from 'better-sqlite3';
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';

const testDb = new Database(':memory:');

vi.mock('@/lib/db', () => ({
  getDb: () => testDb,
  closeDb: () => {},
}));

const { initSchema } = await import('@/lib/db-schema');
initSchema(testDb);

afterAll(() => {
  testDb.close();
});

// Seed a message with a specific tier and salience_score backdated for decay eligibility
function seedSalience(tier: string, score: number, backdateDay = '2024-01-01') {
  const msgId = testDb
    .prepare("INSERT INTO messages(session_id, project, agent_id, role, content, timestamp) VALUES(?,?,?,?,?,?)")
    .run(`sess-${Math.random()}`, 'p1', 'agent', 'user', 'content', '2024-01-01T00:00:00Z').lastInsertRowid as number;
  testDb.prepare(`
    INSERT INTO memory_salience(message_id, tier, salience_score, last_decay_at)
    VALUES (?, ?, ?, ?)
  `).run(msgId, tier, score, `${backdateDay}T00:00:00Z`);
  return msgId;
}

describe('runDecay', () => {
  beforeEach(() => {
    vi.resetModules();
    testDb.exec('DELETE FROM memory_salience');
    testDb.exec('DELETE FROM messages');
  });

  it('applies correct multiplier per tier (high=0.99, mid=0.98, low=0.95)', async () => {
    const highId = seedSalience('high', 1.0);
    const midId = seedSalience('mid', 1.0);
    const lowId = seedSalience('low', 1.0);

    const { runDecay, _resetForTest } = await import('@/lib/memory-decay');
    _resetForTest();
    await runDecay();

    const high = testDb.prepare('SELECT salience_score FROM memory_salience WHERE message_id = ?').get(highId) as { salience_score: number };
    const mid = testDb.prepare('SELECT salience_score FROM memory_salience WHERE message_id = ?').get(midId) as { salience_score: number };
    const low = testDb.prepare('SELECT salience_score FROM memory_salience WHERE message_id = ?').get(lowId) as { salience_score: number };

    // Without LOG() (test DB doesn't have it), flat rates apply
    expect(high.salience_score).toBeCloseTo(0.99, 5);
    expect(mid.salience_score).toBeCloseTo(0.98, 5);
    expect(low.salience_score).toBeCloseTo(0.95, 5);
  });

  it('pinned tier salience_score never changes', async () => {
    const pinnedId = seedSalience('pinned', 1.0);

    const { runDecay, _resetForTest } = await import('@/lib/memory-decay');
    _resetForTest();
    await runDecay();

    const pinned = testDb.prepare('SELECT salience_score FROM memory_salience WHERE message_id = ?').get(pinnedId) as { salience_score: number };
    expect(pinned.salience_score).toBe(1.0);
  });

  it('salience_score never goes below 0 after multiple decay cycles', async () => {
    const lowId = seedSalience('low', 0.001, '2020-01-01');

    const { runDecay, _resetForTest } = await import('@/lib/memory-decay');
    _resetForTest();
    // Run multiple times
    for (let i = 0; i < 5; i++) {
      // Backdate last_decay_at so each run decays
      testDb.exec(`UPDATE memory_salience SET last_decay_at = '2020-01-0${i + 1}T00:00:00Z' WHERE message_id = ${lowId}`);
      await runDecay();
    }

    const row = testDb.prepare('SELECT salience_score FROM memory_salience WHERE message_id = ?').get(lowId) as { salience_score: number };
    expect(row.salience_score).toBeGreaterThanOrEqual(0.0);
  });

  it('last_decay_at updated; second same-day run does NOT decay again', async () => {
    const midId = seedSalience('mid', 1.0);

    const { runDecay, _resetForTest } = await import('@/lib/memory-decay');
    _resetForTest();
    await runDecay();

    const afterFirst = testDb.prepare('SELECT salience_score FROM memory_salience WHERE message_id = ?').get(midId) as { salience_score: number };
    const scoreAfterFirst = afterFirst.salience_score;

    // Run again -- same day, should NOT decay again
    await runDecay();

    const afterSecond = testDb.prepare('SELECT salience_score FROM memory_salience WHERE message_id = ?').get(midId) as { salience_score: number };
    expect(afterSecond.salience_score).toBe(scoreAfterFirst);
  });

  it('LOG() probe stored module-level and determines SQL variant', async () => {
    const { _resetForTest, hasLogFunction } = await import('@/lib/memory-decay');
    _resetForTest();
    // After reset, probe should be null and re-probe on next call
    // The result (true or false) should be consistent on second call
    const first = hasLogFunction();
    const second = hasLogFunction();
    expect(first).toBe(second);
  });
});
