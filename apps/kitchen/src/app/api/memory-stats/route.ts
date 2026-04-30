import type { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest) {
  const db = getDb();

  const lastRunRow = db
    .prepare(
      'SELECT completed_at, batch_size, insights_written, status FROM memory_consolidation_runs ORDER BY id DESC LIMIT 1'
    )
    .get() as {
      completed_at: string | null;
      batch_size: number;
      insights_written: number;
      status: string;
    } | undefined;

  const pendingRow = db
    .prepare('SELECT COUNT(*) AS cnt FROM messages WHERE consolidated = 0')
    .get() as { cnt: number };

  const tierStats = db
    .prepare(
      'SELECT tier, COUNT(*) AS count, AVG(salience_score) AS avg_score FROM memory_salience GROUP BY tier'
    )
    .all() as { tier: string; count: number; avg_score: number }[];

  // Source breakdown — count distinct agent_ids so the panel can show what was ingested
  const sourcesRows = db
    .prepare('SELECT agent_id, COUNT(*) AS cnt FROM messages GROUP BY agent_id ORDER BY cnt DESC')
    .all() as { agent_id: string; cnt: number }[];

  const consolidationModel = process.env.CONSOLIDATION_MODEL ?? 'claude-haiku-4-5-20251001';

  return Response.json({
    lastRun: lastRunRow ?? null,
    pendingUnconsolidated: pendingRow.cnt,
    tierStats,
    consolidationModel,
    sources: sourcesRows,
    timestamp: new Date().toISOString(),
  });
}
