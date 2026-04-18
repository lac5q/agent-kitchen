import type { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { recallByKeyword } from '@/lib/db-ingest';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const url = req.nextUrl ?? new URL(req.url);
  const q = url.searchParams.get('q') ?? '';
  const limitParam = Number(url.searchParams.get('limit') ?? '20');
  const agentId = url.searchParams.get('agent_id');
  const timestamp = new Date().toISOString();

  // When agent_id is provided but q is empty, return messages for that agent
  if (agentId && !q.trim()) {
    const db = getDb();
    const safeLimit = Math.min(limitParam, 100);
    const rows = db.prepare(
      `SELECT id, session_id, project, agent_id, role, content, timestamp
       FROM messages
       WHERE agent_id = ?
       ORDER BY timestamp DESC
       LIMIT ?`
    ).all(agentId, safeLimit) as Array<{
      id: number; session_id: string; project: string; agent_id: string;
      role: string; content: string; timestamp: string;
    }>;
    return Response.json({ results: rows, agent_id: agentId, timestamp });
  }

  // Return empty results for blank query (no agent_id filter either)
  if (!q.trim()) {
    return Response.json({ results: [], timestamp });
  }

  const db = getDb();

  // Persist last recall query for Ledger panel (DASH-01)
  db.prepare("INSERT OR REPLACE INTO meta(key, value) VALUES('last_recall_query', ?)").run(q);

  const rawResults = recallByKeyword(db, q, limitParam);
  // When agent_id is also provided, post-filter FTS results by agent_id
  const results = agentId
    ? rawResults.filter((r: { agent_id: string }) => r.agent_id === agentId)
    : rawResults;

  // ANA-04: fire-and-forget insert into recall_log for time-series analytics
  try {
    db.prepare('INSERT INTO recall_log(query, results) VALUES(?, ?)').run(q, results.length);
  } catch {
    // recall_log may not exist on older DB -- silently ignore
  }

  // MEM-02: increment access_count on memory_salience for recalled messages
  // Fire-and-forget so it never blocks or breaks the recall response (T-23-07)
  const ids = results.map((r: { id: number }) => r.id).filter(Boolean);
  if (ids.length > 0) {
    try {
      const placeholders = ids.map(() => '?').join(',');
      db.prepare(`
        UPDATE memory_salience
        SET access_count = access_count + 1,
            last_accessed = strftime('%Y-%m-%dT%H:%M:%SZ','now')
        WHERE message_id IN (${placeholders})
      `).run(...ids);
    } catch {
      // memory_salience table may not exist yet (pre-Phase 23) -- silently ignore
    }
  }

  return Response.json({ results, query: q, timestamp });
}
