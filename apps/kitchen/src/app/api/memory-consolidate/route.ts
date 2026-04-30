import { runConsolidation } from '@/lib/memory-consolidation';
import { getDb } from '@/lib/db';
import { writeAuditLog } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    await runConsolidation();
    const db = getDb();
    writeAuditLog(db, {
      actor: 'system',
      action: 'consolidation_run',
      target: 'consolidation',
      severity: 'info',
    });
    return Response.json({ ok: true, timestamp: new Date().toISOString() });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
