import {
  GRAPH_CATCHUP_CRON_ID,
  runGraphCatchup,
} from "@/lib/memory/graph-catchup";
import { getDb } from "@/lib/db";
import {
  ensureDefaultCronJobs,
  isCronJobRunnable,
  recordCronHealthRun,
} from "@/lib/cron-health";
import { authorizeRegistryWrite, registryWriteUnauthorizedResponse } from "@/lib/operator-auth";

type Body = Record<string, unknown>;

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function asOptionalNumber(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return value;
}

export async function POST(request: Request): Promise<Response> {
  if (!authorizeRegistryWrite(request)) return registryWriteUnauthorizedResponse();

  try {
    const body = ((await request.json().catch(() => ({}))) ?? {}) as Body;
    const dryRun = asOptionalBoolean(body.dryRun) ?? false;
    const db = getDb();
    ensureDefaultCronJobs(db);

    if (!isCronJobRunnable(db, GRAPH_CATCHUP_CRON_ID) && body.force !== true) {
      return Response.json(
        { ok: false, error: "graph-catchup cron is paused or stopped", jobId: GRAPH_CATCHUP_CRON_ID },
        { status: 409 }
      );
    }

    const summary = await runGraphCatchup(db, {
      dryRun,
      batchSize: asOptionalNumber(body.batchSize),
      agentId: asOptionalString(body.agentId),
      skipVector: asOptionalBoolean(body.skipVector),
      skipEpisodic: asOptionalBoolean(body.skipEpisodic),
      oneshot: asOptionalBoolean(body.oneshot),
      now: body.now ? new Date(String(body.now)) : undefined,
    });

    recordCronHealthRun(db, GRAPH_CATCHUP_CRON_ID, {
      success: summary.status !== "failed",
      itemsProcessed: summary.projected,
      warning:
        summary.status === "failed"
          ? summary.reason ?? "graph_catchup_failed"
          : summary.status === "partial"
            ? `graph_catchup_partial_errors:${summary.errors}`
            : summary.status === "skipped"
              ? summary.reason ?? null
              : null,
      metadata: {
        status: summary.status,
        considered: summary.considered,
        projected: summary.projected,
        errors: summary.errors,
        dry_run: summary.dryRun,
        via: "api",
      },
    });

    return Response.json(
      {
        ok: summary.status === "completed" || summary.status === "partial" || summary.status === "skipped",
        summary,
      },
      { status: summary.status === "failed" ? 500 : 200 }
    );
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }
}

export async function GET(request: Request): Promise<Response> {
  if (!authorizeRegistryWrite(request)) return registryWriteUnauthorizedResponse();
  const db = getDb();
  ensureDefaultCronJobs(db);
  const { readGraphCatchupCheckpoint, isNeo4jConfigured } = await import("@/lib/memory/graph-catchup");
  const { listCronHealthJobs } = await import("@/lib/cron-health");
  const job = listCronHealthJobs(db).find((j) => j.id === GRAPH_CATCHUP_CRON_ID) ?? null;
  return Response.json({
    ok: true,
    neo4jConfigured: isNeo4jConfigured(),
    checkpoint: readGraphCatchupCheckpoint(db),
    job,
  });
}
