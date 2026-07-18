import { getDb } from "@/lib/db";
import {
  ensureDefaultCronJobs,
  isCronJobRunnable,
  recordCronHealthRun,
  listCronHealthJobs,
} from "@/lib/cron-health";
import {
  authorizeRegistryWrite,
  registryWriteUnauthorizedResponse,
} from "@/lib/operator-auth";
import { WIKI_DIGEST_CRON_ID, runWikiDigest } from "@/lib/wiki-digest";

type Body = Record<string, unknown>;

function asOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
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

    if (!isCronJobRunnable(db, WIKI_DIGEST_CRON_ID) && body.force !== true) {
      return Response.json(
        { ok: false, error: "wiki-digest cron is paused or stopped", jobId: WIKI_DIGEST_CRON_ID },
        { status: 409 }
      );
    }

    const summary = await runWikiDigest({
      dryRun,
      agentId: asOptionalString(body.agentId),
      limit: asOptionalNumber(body.limit),
      knowledgeBasePath: asOptionalString(body.knowledgeBasePath),
      now: body.now ? new Date(String(body.now)) : undefined,
    });

    recordCronHealthRun(db, WIKI_DIGEST_CRON_ID, {
      success: summary.status !== "failed",
      itemsProcessed: summary.written,
      warning:
        summary.status === "failed"
          ? summary.reason ?? "wiki_digest_failed"
          : summary.status === "partial"
            ? `wiki_digest_partial_errors:${summary.errors}`
            : summary.status === "skipped"
              ? summary.reason ?? null
              : null,
      metadata: {
        status: summary.status,
        considered: summary.considered,
        written: summary.written,
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
  const job = listCronHealthJobs(db).find((j) => j.id === WIKI_DIGEST_CRON_ID) ?? null;
  return Response.json({ ok: true, job });
}
