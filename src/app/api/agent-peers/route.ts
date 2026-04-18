import type { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const url = req.nextUrl ?? new URL(req.url);
  const rawWindow = Number(url.searchParams.get('window') ?? '60');

  // Clamp to [1, 1440] -- T-23-01 mitigation
  const windowMin = Math.min(Math.max(1, isNaN(rawWindow) ? 60 : rawWindow), 1440);
  const windowOffset = `-${windowMin} minutes`;

  const db = getDb();

  const peers = db
    .prepare(
      `SELECT
         agent_id,
         summary   AS current_task,
         action_type AS status,
         MAX(timestamp) AS last_seen
       FROM hive_actions
       WHERE timestamp > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', ?)
       GROUP BY agent_id
       ORDER BY last_seen DESC`
    )
    .all(windowOffset) as {
      agent_id: string;
      current_task: string;
      status: string;
      last_seen: string;
    }[];

  return Response.json({
    peers,
    window_minutes: windowMin,
    timestamp: new Date().toISOString(),
  });
}
