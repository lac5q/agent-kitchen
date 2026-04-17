import type { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { ingestAllSessions } from '@/lib/db-ingest';

export const dynamic = 'force-dynamic';

export async function POST(_req: NextRequest) {
  try {
    const db = getDb();
    const { filesProcessed, rowsInserted, filesSkipped } = ingestAllSessions(db);
    return Response.json({
      filesProcessed,
      rowsInserted,
      filesSkipped,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
