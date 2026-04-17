import type { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { recallByKeyword } from '@/lib/db-ingest';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const url = req.nextUrl ?? new URL(req.url);
  const q = url.searchParams.get('q') ?? '';
  const limitParam = Number(url.searchParams.get('limit') ?? '20');
  const timestamp = new Date().toISOString();

  // Return empty results for blank query
  if (!q.trim()) {
    return Response.json({ results: [], timestamp });
  }

  const db = getDb();

  // Persist last recall query for Ledger panel (DASH-01)
  db.prepare("INSERT OR REPLACE INTO meta(key, value) VALUES('last_recall_query', ?)").run(q);

  const results = recallByKeyword(db, q, limitParam);
  return Response.json({ results, query: q, timestamp });
}
