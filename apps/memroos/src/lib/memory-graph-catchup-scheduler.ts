/**
 * In-process scheduled graph catchup.
 *
 * Mirrors retention-expiry / consolidation: setInterval under the scheduler
 * singleton lock, respects cron_health pause/stop, heartbeats graph-catchup.
 */
import { getDb } from "@/lib/db";
import {
  ensureDefaultCronJobs,
  isCronJobRunnable,
  recordCronHealthRun,
} from "@/lib/cron-health";
import {
  GRAPH_CATCHUP_CRON_ID,
  isNeo4jConfigured,
  runGraphCatchup,
  type GraphCatchupSummary,
} from "@/lib/memory/graph-catchup";

declare global {
  // eslint-disable-next-line no-var
  var _graphCatchupInterval: ReturnType<typeof setInterval> | undefined;
}

export { GRAPH_CATCHUP_CRON_ID };
export const GRAPH_CATCHUP_INTERVAL_MS = 30 * 60 * 1000; // every 30 minutes

export function runScheduledGraphCatchup(options: {
  dryRun?: boolean;
  batchSize?: number;
  agentId?: string;
  now?: Date;
} = {}): Promise<GraphCatchupSummary | { status: "skipped"; reason: string }> {
  const db = getDb();
  ensureDefaultCronJobs(db);

  if (!isCronJobRunnable(db, GRAPH_CATCHUP_CRON_ID)) {
    return Promise.resolve({ status: "skipped", reason: "cron_paused_or_stopped" });
  }

  if (!isNeo4jConfigured() && !options.dryRun) {
    recordCronHealthRun(db, GRAPH_CATCHUP_CRON_ID, {
      success: true,
      itemsProcessed: 0,
      warning: null,
      now: options.now,
      metadata: { skipped: true, reason: "neo4j_not_configured" },
    });
    return Promise.resolve({ status: "skipped", reason: "neo4j_not_configured" });
  }

  return runGraphCatchup(db, {
    dryRun: options.dryRun,
    batchSize: options.batchSize,
    agentId: options.agentId,
    now: options.now,
  })
    .then((summary) => {
      const success = summary.status === "completed" || summary.status === "partial" || summary.status === "skipped";
      recordCronHealthRun(db, GRAPH_CATCHUP_CRON_ID, {
        success: summary.status !== "failed",
        itemsProcessed: summary.projected,
        warning:
          summary.status === "failed"
            ? summary.reason ?? "graph_catchup_failed"
            : summary.status === "partial"
              ? `graph_catchup_partial_errors:${summary.errors}`
              : summary.reason && summary.status === "skipped"
                ? summary.reason
                : null,
        now: options.now,
        metadata: {
          status: summary.status,
          considered: summary.considered,
          projected: summary.projected,
          skipped: summary.skipped,
          errors: summary.errors,
          dry_run: summary.dryRun,
          episodic_last_id: summary.checkpointAfter.episodicLastId,
          vector_last_id: summary.checkpointAfter.vectorLastId,
        },
      });
      void success;
      return summary;
    })
    .catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      recordCronHealthRun(db, GRAPH_CATCHUP_CRON_ID, {
        success: false,
        warning: `graph_catchup_error:${message.slice(0, 120)}`,
        now: options.now,
      });
      throw err;
    });
}

export function startGraphCatchupScheduler(): void {
  if (typeof globalThis._graphCatchupInterval !== "undefined") return;

  if (!isNeo4jConfigured()) {
    console.info("[graph-catchup] Neo4j not configured; scheduler idle until password is set");
  }

  console.log("[graph-catchup] scheduler started (interval: 30m)");
  void runScheduledGraphCatchup().catch((err) => {
    console.error("[graph-catchup] initial tick failed", err);
  });

  globalThis._graphCatchupInterval = setInterval(() => {
    void runScheduledGraphCatchup().catch((err) => {
      console.error("[graph-catchup] tick failed", err);
    });
  }, GRAPH_CATCHUP_INTERVAL_MS);
}

export function stopGraphCatchupScheduler(): void {
  if (typeof globalThis._graphCatchupInterval !== "undefined") {
    clearInterval(globalThis._graphCatchupInterval);
    globalThis._graphCatchupInterval = undefined;
  }
}
