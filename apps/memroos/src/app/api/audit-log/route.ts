import type { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { authenticateUser } from '@/lib/auth/session';
import { listAuditLog } from '@/lib/store/audit';

export const dynamic = 'force-dynamic';

/**
 * GET /api/audit-log?limit=N
 *
 * Returns the last N audit log entries ordered by timestamp DESC.
 * limit is clamped to [1, 100]. Default: 20.
 *
 * SEC-02: Surfaces the audit trail for the dashboard AuditLogPanel.
 */
export async function GET(req: NextRequest) {
  const session = await authenticateUser(req);
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const url = req.nextUrl ?? new URL(req.url);
  const rawLimit = url.searchParams.get('limit');
  const parsedLimit = rawLimit !== null ? Number(rawLimit) : 20;
  const limit = Math.min(100, Math.max(1, isNaN(parsedLimit) ? 20 : parsedLimit));
  const db = getDb();

  const rows = listAuditLog(db, limit);

  return Response.json({ entries: rows, timestamp: new Date().toISOString() });
}
