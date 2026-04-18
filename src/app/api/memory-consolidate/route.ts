import { runConsolidation } from '@/lib/memory-consolidation';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    await runConsolidation();
    return Response.json({ ok: true, timestamp: new Date().toISOString() });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
