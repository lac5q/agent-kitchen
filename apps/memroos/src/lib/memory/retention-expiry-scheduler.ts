/**
 * MEMLIFE-01: in-process scheduled retention expiry enforcement.
 *
 * Mirrors memory-decay / consolidation: setInterval under the scheduler
 * singleton lock, respects cron_health pause/stop, and heartbeats the
 * memory-retention-expiry registry job after each tick.
 */
import { getDb } from "@/lib/db";
import {
  ensureDefaultCronJobs,
  isCronJobRunnable,
  recordCronHealthRun,
} from "@/lib/cron-health";
import { runRetentionExpiry, type RetentionExpiryRunSummary } from "@/lib/memory/retention-expiry";
import { scopeHash, type RetentionScope } from "@/lib/memory/retention-policy";

declare global {
  // eslint-disable-next-line no-var
  var _retentionExpiryInterval: ReturnType<typeof setInterval> | undefined;
}

export const RETENTION_EXPIRY_CRON_ID = "memory-retention-expiry";
export const RETENTION_EXPIRY_INTERVAL_MS = 60 * 60 * 1000;

function hourBucket(now: Date): string {
  return now.toISOString().slice(0, 13); // YYYY-MM-DDTHH
}

/**
 * One scheduled tick: lease-keyed runRetentionExpiry for the default tenant
 * (or provided tenant), producing receipts via the existing runner.
 */
export function runScheduledRetentionExpiry(options: {
  tenantId?: string;
  actorId?: string;
  scope?: RetentionScope;
  now?: Date;
  runKey?: string;
} = {}): RetentionExpiryRunSummary | { status: "skipped"; reason: string } {
  const db = getDb();
  ensureDefaultCronJobs(db);

  if (!isCronJobRunnable(db, RETENTION_EXPIRY_CRON_ID)) {
    return { status: "skipped", reason: "cron_paused_or_stopped" };
  }

  const tenantId = options.tenantId ?? "default-tenant";
  const now = options.now ?? new Date();
  const scope: RetentionScope = options.scope ?? { tenantId };
  const hash = scopeHash(scope);
  const runKey =
    options.runKey ?? `retention:${tenantId}:${hourBucket(now)}:${hash.slice(0, 12)}`;
  const actorId = options.actorId ?? "system";

  try {
    const summary = runRetentionExpiry(db, {
      tenantId,
      runKey,
      actorId,
      leaseOwner: `scheduler:${process.pid}`,
      scope,
      now,
    });

    const success = summary.status === "completed" || summary.status === "replayed";
    recordCronHealthRun(db, RETENTION_EXPIRY_CRON_ID, {
      success: success || summary.status === "lease_held",
      itemsProcessed: summary.expired + summary.held,
      warning:
        summary.status === "failed"
          ? "retention_expiry_failed"
          : summary.failed > 0
            ? `retention_expiry_partial_failures:${summary.failed}`
            : null,
      now,
      metadata: {
        run_key: summary.runKey,
        status: summary.status,
        considered: summary.considered,
        expired: summary.expired,
        held: summary.held,
        failed: summary.failed,
      },
    });

    return summary;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    recordCronHealthRun(db, RETENTION_EXPIRY_CRON_ID, {
      success: false,
      warning: `retention_expiry_error:${message.slice(0, 120)}`,
      now,
    });
    throw err;
  }
}

export function startRetentionExpiryScheduler(): void {
  if (typeof globalThis._retentionExpiryInterval !== "undefined") return;
  console.log("[retention-expiry] scheduler started (interval: 60m)");
  try {
    runScheduledRetentionExpiry();
  } catch (err) {
    console.error("[retention-expiry] initial tick failed", err);
  }
  globalThis._retentionExpiryInterval = setInterval(() => {
    try {
      runScheduledRetentionExpiry();
    } catch (err) {
      console.error("[retention-expiry] tick failed", err);
    }
  }, RETENTION_EXPIRY_INTERVAL_MS);
}

export function stopRetentionExpiryScheduler(): void {
  if (typeof globalThis._retentionExpiryInterval !== "undefined") {
    clearInterval(globalThis._retentionExpiryInterval);
    globalThis._retentionExpiryInterval = undefined;
  }
}
