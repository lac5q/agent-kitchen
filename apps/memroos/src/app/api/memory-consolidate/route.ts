import type { NextRequest } from 'next/server';

import { runConsolidation } from '@/lib/memory/consolidation-scheduler';
import { getDb } from '@/lib/db';
import { writeAuditLogFromEntry as writeAuditLog } from '@/lib/store/audit';
import { authenticateUser } from '@/lib/auth/session';
import { requireRole } from '@/lib/auth/middleware-roles';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const session = await authenticateUser(req);
  if (!session) {
    return Response.json({ error: 'authentication required' }, { status: 401 });
  }
  const roleError = requireRole(session.role, 'operator');
  if (roleError) return roleError;
  try {
    const run = await runConsolidation();
    const db = getDb();
    writeAuditLog(db, {
      actor: 'system',
      action: 'consolidation_run',
      target: 'consolidation',
      severity: run.status === 'failed' ? 'medium' : 'info',
      detail: JSON.stringify(run),
    });
    return Response.json({ ok: run.status !== 'failed', run, timestamp: new Date().toISOString() });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
