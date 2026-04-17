import type { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest) {
  const db = getDb();

  const rowCount = (
    db.prepare('SELECT COUNT(*) as c FROM messages').get() as { c: number }
  ).c;

  const lastIngest =
    (
      db
        .prepare("SELECT value FROM meta WHERE key='last_ingest_ts'")
        .get() as { value: string } | undefined
    )?.value ?? null;

  const lastRecallQuery =
    (
      db
        .prepare("SELECT value FROM meta WHERE key='last_recall_query'")
        .get() as { value: string } | undefined
    )?.value ?? null;

  const dbSizeBytes = (
    db
      .prepare(
        'SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()'
      )
      .get() as { size: number }
  ).size;

  return Response.json({
    rowCount,
    lastIngest,
    lastRecallQuery,
    dbSizeBytes,
    timestamp: new Date().toISOString(),
  });
}
