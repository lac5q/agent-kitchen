import { apiError } from "@/lib/api-error";
import { getDb } from "@/lib/db";
import { checkGraphHealth, checkVectorHealth, type MemoryTierHealth } from "@/lib/memory/backends";
import { authorizeRegistryWrite, registryWriteUnauthorizedResponse } from "@/lib/operator-auth";

export const dynamic = "force-dynamic";

function episodicHealth(): MemoryTierHealth {
  const db = getDb();
  const row = db.prepare("SELECT COUNT(*) AS count, MAX(written_at) AS lastWrite FROM agent_memory_writes WHERE memory_type = 'episodic'").get() as { count: number; lastWrite: string | null };
  return { tier: "episodic", backend: "sqlite", status: "up", count: row.count, lastWrite: row.lastWrite };
}

async function buildMemoryHealthResponse(request: Request) {
  if (!authorizeRegistryWrite(request)) {
    return registryWriteUnauthorizedResponse();
  }

  const [vector, graph] = await Promise.all([checkVectorHealth(), checkGraphHealth()]);
  return Response.json({ ok: true, tiers: [vector, graph, episodicHealth()], timestamp: new Date().toISOString() });
}

export async function GET(request: Request) {
  try {
    return await buildMemoryHealthResponse(request);
  } catch (error: unknown) {
    return apiError(500, error instanceof Error ? error.message : "Internal server error");
  }
}
