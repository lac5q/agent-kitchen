/**
 * In-process scheduled wiki digest (nightly-ish; default 6h).
 */
import { getDb } from "@/lib/db";
import {
  ensureDefaultCronJobs,
  isCronJobRunnable,
  recordCronHealthRun,
} from "@/lib/cron-health";
import {
  WIKI_DIGEST_CRON_ID,
  runWikiDigest,
  type WikiDigestSummary,
} from "@/lib/wiki-digest";

declare global {
  // eslint-disable-next-line no-var
  var _wikiDigestInterval: ReturnType<typeof setInterval> | undefined;
}

export { WIKI_DIGEST_CRON_ID };
export const WIKI_DIGEST_INTERVAL_MS = 6 * 60 * 60 * 1000;

export function runScheduledWikiDigest(options: {
  dryRun?: boolean;
  agentId?: string;
  now?: Date;
} = {}): Promise<WikiDigestSummary | { status: "skipped"; reason: string }> {
  const db = getDb();
  ensureDefaultCronJobs(db);

  if (!isCronJobRunnable(db, WIKI_DIGEST_CRON_ID)) {
    return Promise.resolve({ status: "skipped", reason: "cron_paused_or_stopped" });
  }

  return runWikiDigest({
    dryRun: options.dryRun,
    agentId: options.agentId,
    now: options.now,
  })
    .then((summary) => {
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
        now: options.now,
        metadata: {
          status: summary.status,
          considered: summary.considered,
          written: summary.written,
          skipped: summary.skipped,
          errors: summary.errors,
          dry_run: summary.dryRun,
        },
      });
      return summary;
    })
    .catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      recordCronHealthRun(db, WIKI_DIGEST_CRON_ID, {
        success: false,
        warning: `wiki_digest_error:${message.slice(0, 120)}`,
        now: options.now,
      });
      throw err;
    });
}

export function startWikiDigestScheduler(): void {
  if (typeof globalThis._wikiDigestInterval !== "undefined") return;

  const tick = () => {
    void runScheduledWikiDigest().catch((err) => {
      console.error(
        "[wiki-digest] scheduled run failed",
        err instanceof Error ? err.message : String(err)
      );
    });
  };

  globalThis._wikiDigestInterval = setInterval(tick, WIKI_DIGEST_INTERVAL_MS);
  // Soft first tick after boot (non-blocking).
  setTimeout(tick, 45_000);
}

export function stopWikiDigestScheduler(): void {
  if (typeof globalThis._wikiDigestInterval !== "undefined") {
    clearInterval(globalThis._wikiDigestInterval);
    globalThis._wikiDigestInterval = undefined;
  }
}
