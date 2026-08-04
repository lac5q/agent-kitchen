import { apiError } from "@/lib/api-error";
import { authenticateAgentHeaders } from "@/lib/agent/registry";
import { getDb } from "@/lib/db";
import { checkGraphHealth, checkVectorHealth, type MemoryTierHealth } from "@/lib/memory/backends";
import { authorizeRegistryWrite, registryWriteUnauthorizedResponse } from "@/lib/operator-auth";

export const dynamic = "force-dynamic";

function episodicHealth(): MemoryTierHealth {
  const db = getDb();
  const row = db.prepare("SELECT COUNT(*) AS count, MAX(written_at) AS lastWrite FROM agent_memory_writes WHERE memory_type = 'episodic'").get() as { count: number; lastWrite: string | null };
  return { tier: "episodic", backend: "sqlite", status: "up", count: row.count, lastWrite: row.lastWrite };
}

function recallIngestHealth() {
  const db = getDb();
  const row = db.prepare("SELECT value FROM meta WHERE key = 'last_ingest_ts'").get() as { value: string } | undefined;
  const lastIngest = row?.value ?? null;
  const staleAfterHours = Number(process.env.MEMROOS_RECALL_INGEST_STALE_AFTER_HOURS ?? 24);
  const maxAgeHours = Number.isFinite(staleAfterHours) && staleAfterHours > 0 ? staleAfterHours : 24;

  if (!lastIngest) {
    return {
      status: "stale" as const,
      backend: "sqlite-recall",
      lastIngest,
      ageHours: null,
      staleAfterHours: maxAgeHours,
      detail: "No recall ingest run has been recorded",
    };
  }

  const parsed = Date.parse(lastIngest);
  if (!Number.isFinite(parsed)) {
    return {
      status: "stale" as const,
      backend: "sqlite-recall",
      lastIngest,
      ageHours: null,
      staleAfterHours: maxAgeHours,
      detail: "Last recall ingest timestamp is invalid",
    };
  }

  const ageHours = Math.max(0, (Date.now() - parsed) / 3_600_000);
  return {
    status: ageHours > maxAgeHours ? ("stale" as const) : ("up" as const),
    backend: "sqlite-recall",
    lastIngest,
    ageHours: Number(ageHours.toFixed(2)),
    staleAfterHours: maxAgeHours,
    detail: ageHours > maxAgeHours ? `Recall ingest is stale by ${Number(ageHours.toFixed(2))}h` : undefined,
  };
}

async function buildMemoryHealthResponse(request: Request) {
  if (!authorizeRegistryWrite(request) && !authenticateAgentHeaders(request.headers)) {
    return registryWriteUnauthorizedResponse();
  }

  const [vector, graph] = await Promise.all([checkVectorHealth(), checkGraphHealth()]);
  return Response.json({
    ok: true,
    tiers: [vector, graph, episodicHealth()],
    recallIngest: recallIngestHealth(),
    timestamp: new Date().toISOString(),
  });
}

export async function GET(request: Request) {
  try {
    return await buildMemoryHealthResponse(request);
  } catch (error: unknown) {
    return apiError(500, error instanceof Error ? error.message : "Internal server error");
  }
}
