import { randomUUID } from "crypto";
import type Database from "better-sqlite3";

export type CronJobStatus = "active" | "paused" | "stopped";
export type CronHealthState = "healthy" | "warning" | "paused" | "stopped" | "unknown";

export interface CronHealthJobInput {
  id: string;
  name: string;
  sourceFamily: string;
  schedule: string;
  owner?: string;
  status?: CronJobStatus;
  healthEndpoint?: string | null;
  expectedIntervalMinutes?: number;
  lastRunAt?: string | null;
  lastSuccessAt?: string | null;
  lastFailureAt?: string | null;
  itemsProcessed?: number;
  warning?: string | null;
  metadata?: Record<string, unknown>;
}

export interface CronHealthJob extends Required<Omit<CronHealthJobInput, "metadata">> {
  health: CronHealthState;
  caughtUp: boolean;
  metadata: Record<string, unknown>;
  updatedAt: string;
}

const DEFAULT_JOBS: CronHealthJobInput[] = [
  {
    id: "observe-sidecar",
    name: "Observe session sidecar",
    sourceFamily: "observe",
    schedule: "every 5 minutes",
    expectedIntervalMinutes: 5,
  },
  {
    id: "observe-capture-gate",
    name: "Session capture gate",
    sourceFamily: "observe",
    schedule: "on session stop",
    expectedIntervalMinutes: 5,
  },
  {
    id: "memory-consolidation",
    name: "Memory consolidation",
    sourceFamily: "memory",
    schedule: "every 15 minutes",
    expectedIntervalMinutes: 15,
  },
  {
    id: "memory-decay",
    name: "Memory decay",
    sourceFamily: "memory",
    schedule: "hourly",
    expectedIntervalMinutes: 60,
  },
  {
    id: "memory-retention-expiry",
    name: "Memory retention expiry",
    sourceFamily: "memory",
    schedule: "hourly",
    expectedIntervalMinutes: 60,
    healthEndpoint: "/api/memory-lifecycle/expiry",
  },
  {
    id: "hil-sla",
    name: "HIL SLA escalation",
    sourceFamily: "orchestration",
    schedule: "every 60 seconds",
    expectedIntervalMinutes: 2,
  },
  {
    id: "embeddings",
    name: "Embedding backfill",
    sourceFamily: "memory",
    schedule: "every 5 minutes when provider enabled",
    expectedIntervalMinutes: 5,
  },
  {
    id: "graph-catchup",
    name: "Graph memory catchup",
    sourceFamily: "memory",
    schedule: "every 30 minutes when Neo4j configured",
    expectedIntervalMinutes: 30,
    healthEndpoint: "/api/memory-lifecycle/graph-catchup",
  },
  {
    id: "wiki-digest",
    name: "Memory → wiki digest",
    sourceFamily: "memory",
    schedule: "every 6 hours",
    expectedIntervalMinutes: 360,
    healthEndpoint: "/api/wiki/digest",
  },
  {
    id: "apo-skill-improvement",
    name: "APO skill improvement",
    sourceFamily: "skills",
    schedule: "external cron",
    expectedIntervalMinutes: 1440,
  },
];

function parseJson(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function normalizeStatus(value: string | null | undefined): CronJobStatus {
  return value === "paused" || value === "stopped" ? value : "active";
}

function computeHealth(job: {
  status: CronJobStatus;
  expectedIntervalMinutes: number;
  lastRunAt: string | null;
  lastFailureAt: string | null;
  warning: string | null;
}): { health: CronHealthState; caughtUp: boolean } {
  if (job.status === "paused") return { health: "paused", caughtUp: true };
  if (job.status === "stopped") return { health: "stopped", caughtUp: false };
  if (job.warning || job.lastFailureAt) return { health: "warning", caughtUp: false };
  if (!job.lastRunAt) return { health: "unknown", caughtUp: false };

  const lastRunMs = new Date(job.lastRunAt).getTime();
  if (!Number.isFinite(lastRunMs)) return { health: "unknown", caughtUp: false };
  const toleranceMs = Math.max(job.expectedIntervalMinutes, 1) * 90_000;
  const caughtUp = Date.now() - lastRunMs <= toleranceMs;
  return { health: caughtUp ? "healthy" : "warning", caughtUp };
}

export function ensureDefaultCronJobs(db: Database.Database): void {
  for (const job of DEFAULT_JOBS) {
    const existing = db.prepare("SELECT id FROM cron_health_jobs WHERE id = ?").get(job.id);
    // Seed-only: never overwrite pause/stop or heartbeat fields on existing rows.
    if (!existing) upsertCronHealthJob(db, job);
  }
}

export function upsertCronHealthJob(
  db: Database.Database,
  input: CronHealthJobInput
): CronHealthJob {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO cron_health_jobs (
       id, name, source_family, schedule, owner, status, health_endpoint,
       expected_interval_minutes, last_run_at, last_success_at, last_failure_at,
       items_processed, warning, metadata_json, updated_at
     ) VALUES (
       @id, @name, @sourceFamily, @schedule, @owner, @status, @healthEndpoint,
       @expectedIntervalMinutes, @lastRunAt, @lastSuccessAt, @lastFailureAt,
       @itemsProcessed, @warning, @metadataJson, @updatedAt
     )
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       source_family = excluded.source_family,
       schedule = excluded.schedule,
       owner = excluded.owner,
       status = excluded.status,
       health_endpoint = excluded.health_endpoint,
       expected_interval_minutes = excluded.expected_interval_minutes,
       last_run_at = excluded.last_run_at,
       last_success_at = excluded.last_success_at,
       last_failure_at = excluded.last_failure_at,
       items_processed = excluded.items_processed,
       warning = excluded.warning,
       metadata_json = excluded.metadata_json,
       updated_at = excluded.updated_at`
  ).run({
    id: input.id || randomUUID(),
    name: input.name,
    sourceFamily: input.sourceFamily,
    schedule: input.schedule,
    owner: input.owner ?? "memroos",
    status: normalizeStatus(input.status),
    healthEndpoint: input.healthEndpoint ?? null,
    expectedIntervalMinutes: input.expectedIntervalMinutes ?? 60,
    lastRunAt: input.lastRunAt ?? null,
    lastSuccessAt: input.lastSuccessAt ?? null,
    lastFailureAt: input.lastFailureAt ?? null,
    itemsProcessed: input.itemsProcessed ?? 0,
    warning: input.warning ?? null,
    metadataJson: JSON.stringify(input.metadata ?? {}),
    updatedAt: now,
  });

  const row = db.prepare("SELECT * FROM cron_health_jobs WHERE id = ?").get(input.id);
  return mapCronHealthJob(row as Record<string, unknown>);
}

export function updateCronJobStatus(
  db: Database.Database,
  id: string,
  status: CronJobStatus
): CronHealthJob | null {
  const result = db
    .prepare("UPDATE cron_health_jobs SET status = ?, updated_at = ? WHERE id = ?")
    .run(status, new Date().toISOString(), id);
  if (result.changes === 0) return null;
  const row = db.prepare("SELECT * FROM cron_health_jobs WHERE id = ?").get(id);
  return mapCronHealthJob(row as Record<string, unknown>);
}

/** True when the job is paused/stopped, or missing after seeding defaults. */
export function isCronJobRunnable(db: Database.Database, id: string): boolean {
  ensureDefaultCronJobs(db);
  const row = db.prepare("SELECT status FROM cron_health_jobs WHERE id = ?").get(id) as
    | { status: string }
    | undefined;
  if (!row) return false;
  return normalizeStatus(row.status) === "active";
}

/**
 * Heartbeat after a scheduler tick. Seeds the job definition if missing, then
 * updates only run-related columns so pause/stop state is preserved.
 */
export function recordCronHealthRun(
  db: Database.Database,
  id: string,
  input: {
    success: boolean;
    itemsProcessed?: number;
    warning?: string | null;
    now?: Date;
    metadata?: Record<string, unknown>;
  }
): CronHealthJob | null {
  ensureDefaultCronJobs(db);
  const now = (input.now ?? new Date()).toISOString();
  const existing = db.prepare("SELECT * FROM cron_health_jobs WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
  if (!existing) return null;

  const priorMeta = parseJson(String(existing.metadata_json ?? "{}"));
  const mergedMeta = { ...priorMeta, ...(input.metadata ?? {}) };
  db.prepare(
    `UPDATE cron_health_jobs SET
       last_run_at = ?,
       last_success_at = CASE WHEN ? THEN ? ELSE last_success_at END,
       last_failure_at = CASE WHEN ? THEN ? ELSE NULL END,
       items_processed = ?,
       warning = ?,
       metadata_json = ?,
       updated_at = ?
     WHERE id = ?`
  ).run(
    now,
    input.success ? 1 : 0,
    now,
    input.success ? 0 : 1,
    now,
    input.itemsProcessed ?? Number(existing.items_processed ?? 0),
    input.warning ?? null,
    JSON.stringify(mergedMeta),
    now,
    id
  );
  const row = db.prepare("SELECT * FROM cron_health_jobs WHERE id = ?").get(id);
  return row ? mapCronHealthJob(row as Record<string, unknown>) : null;
}

export function listCronHealthJobs(db: Database.Database): CronHealthJob[] {
  ensureDefaultCronJobs(db);
  const rows = db
    .prepare("SELECT * FROM cron_health_jobs ORDER BY source_family ASC, name ASC")
    .all() as Array<Record<string, unknown>>;
  return rows.map(mapCronHealthJob);
}

function mapCronHealthJob(row: Record<string, unknown>): CronHealthJob {
  const status = normalizeStatus(String(row.status ?? "active"));
  const expectedIntervalMinutes = Number(row.expected_interval_minutes ?? 60);
  const lastRunAt = typeof row.last_run_at === "string" ? row.last_run_at : null;
  const lastFailureAt = typeof row.last_failure_at === "string" ? row.last_failure_at : null;
  const warning = typeof row.warning === "string" ? row.warning : null;
  const { health, caughtUp } = computeHealth({
    status,
    expectedIntervalMinutes,
    lastRunAt,
    lastFailureAt,
    warning,
  });

  return {
    id: String(row.id),
    name: String(row.name),
    sourceFamily: String(row.source_family),
    schedule: String(row.schedule),
    owner: String(row.owner ?? "memroos"),
    status,
    healthEndpoint: typeof row.health_endpoint === "string" ? row.health_endpoint : null,
    expectedIntervalMinutes,
    lastRunAt,
    lastSuccessAt: typeof row.last_success_at === "string" ? row.last_success_at : null,
    lastFailureAt,
    itemsProcessed: Number(row.items_processed ?? 0),
    warning,
    metadata: parseJson(String(row.metadata_json ?? "{}")),
    updatedAt: String(row.updated_at),
    health,
    caughtUp,
  };
}
