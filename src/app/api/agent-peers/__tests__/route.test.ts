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

function seedAction(agentId: string, summary: string, actionType = 'continue', offsetMinutes = 0) {
  // offsetMinutes=0 means now, negative = in the past
  const ts = new Date(Date.now() - Math.abs(offsetMinutes) * 60 * 1000).toISOString();
  testDb.prepare(
    "INSERT INTO hive_actions(agent_id, action_type, summary, timestamp) VALUES(?,?,?,?)"
  ).run(agentId, actionType, summary, ts);
}

describe('GET /api/agent-peers', () => {
  beforeEach(() => {
    vi.resetModules();
    testDb.exec('DELETE FROM hive_actions');
  });

  it('returns correct GROUP BY result from hive_actions', async () => {
    seedAction('agent-a', 'working on task X');
    seedAction('agent-b', 'reviewing PR');

    const { GET } = await import('../route');
    const req = new Request('http://localhost/api/agent-peers');
    const res = await GET(req as unknown as import('next/server').NextRequest);
    const body = await res.json();

    expect(body).toHaveProperty('peers');
    expect(Array.isArray(body.peers)).toBe(true);
    const agentIds = body.peers.map((p: { agent_id: string }) => p.agent_id);
    expect(agentIds).toContain('agent-a');
    expect(agentIds).toContain('agent-b');
  });

  it('excludes agents with no activity inside window', async () => {
    // Add an agent active 200 minutes ago (outside default 60-min window)
    seedAction('old-agent', 'old task', 'stop', 200);
    // Add a recent agent
    seedAction('new-agent', 'fresh task', 'continue', 5);

    const { GET } = await import('../route');
    const req = new Request('http://localhost/api/agent-peers?window=60');
    const res = await GET(req as unknown as import('next/server').NextRequest);
    const body = await res.json();

    const agentIds = body.peers.map((p: { agent_id: string }) => p.agent_id);
    expect(agentIds).toContain('new-agent');
    expect(agentIds).not.toContain('old-agent');
  });

  it('window param caps at 1440 minutes', async () => {
    const { GET } = await import('../route');
    const req = new Request('http://localhost/api/agent-peers?window=9999');
    const res = await GET(req as unknown as import('next/server').NextRequest);
    const body = await res.json();

    expect(body.window_minutes).toBe(1440);
  });

  it('response includes current_task, status, last_seen fields', async () => {
    seedAction('agent-c', 'current job', 'loop');

    const { GET } = await import('../route');
    const req = new Request('http://localhost/api/agent-peers');
    const res = await GET(req as unknown as import('next/server').NextRequest);
    const body = await res.json();

    const peer = body.peers.find((p: { agent_id: string }) => p.agent_id === 'agent-c');
    expect(peer).toBeDefined();
    expect(peer).toHaveProperty('current_task');
    expect(peer).toHaveProperty('status');
    expect(peer).toHaveProperty('last_seen');
  });
});
