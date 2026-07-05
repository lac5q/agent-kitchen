import { getDb } from '@/lib/db';
import { ingestAllSessions } from '@/lib/db-ingest';
import { writeAuditLog } from '@/lib/audit';
import { authorizeRegistryWrite, registryWriteUnauthorizedResponse } from '@/lib/operator-auth';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!authorizeRegistryWrite(request)) {
    return registryWriteUnauthorizedResponse();
  }

  try {
    const db = getDb();
    const { filesProcessed, rowsInserted, filesSkipped } = ingestAllSessions(db);
    writeAuditLog(db, {
      actor: 'system',
      action: 'ingest_run',
      target: 'recall',
      detail: JSON.stringify({ filesProcessed, rowsInserted, filesSkipped }),
      severity: 'info',
    });
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
