/**
 * Observe capture health / maturity visibility (v8.16 Phase 171).
 *
 * Phase 171 additions (OBSERVE-14):
 *
 *   - `errorCount` per harness — number of `agent_session_captures` rows
 *     whose `status='failed'` for the runtime. The existing schema already
 *     exposes `status IN ('captured','handoff_ready','failed','ignored')` so
 *     we read from it without a migration.
 *   - `agentsByHarness` — count of `registered_agents` rows whose `platform`
 *     matches the harness's runtime name. The catalog row for `factory`
 *     maps to `platform=droid` (and only `droid`); every other harness maps
 *     to `platform=<harness>`. Operators get a one-glance count of how many
 *     agents are currently wired up to each observe surface.
 *   - `errorRate` is still `null` — we have insufficient failed-row volume
 *     to make the percentage meaningful. The catalog row is the source of
 *     honest messaging until we see real failures.
 */
import type Database from "better-sqlite3";

import { listCronHealthJobs, type CronHealthState } from "@/lib/cron-health";
import {
  OBSERVE_HARNESS_PATHS,
  type ObserveHarness,
} from "@/lib/observe-sidecar";

export interface ObserveHarnessHealth {
  harness: ObserveHarness;
  wave: 1 | 2 | 3;
  maturity: string;
  lastCaptureAt: string | null;
  captureCount: number;
  /** `status='failed'` rows for this runtime (Phase 171 OBSERVE-14). */
  errorCount: number;
  /** `null` until enough failed rows exist to make a percentage meaningful. */
  errorRate: number | null;
  /** Count of onboarded agents registered against this harness's `platform`. */
  agentsByHarness: number;
  /** Scheduler heartbeat surfaced here so NOC does not infer liveness from a PID. */
  sidecarHeartbeatAt: string | null;
  sidecarHealth: CronHealthState;
  sidecarWarning: string | null;
  depthSetting: string;
  notes: string;
}

/**
 * Map a catalog harness name onto the `registered_agents.platform` key it
 * should be counted under. Today only `factory` is special — it maps to
 * `droid` because the canonical installer wiring lands under the droid
 * install target. Every other harness uses `platform=<harness>` (case-
 * insensitive). Exposed for tests so they can pin the mapping.
 */
export function platformKeyForHarness(harness: ObserveHarness): string {
  if (harness === "factory") return "droid";
  return harness;
}

export function listObserveHarnessHealth(
  db: Database.Database,
  options: { depthSetting?: string } = {}
): ObserveHarnessHealth[] {
  const depthSetting =
    options.depthSetting ??
    process.env.MEMROOS_CAPTURE_DEPTH ??
    "relevant";

  // Capture counts + error counts (status='failed' rows). Mirrors the same
  // shape byHarness lookup the rest of the function uses.
  const rows = db
    .prepare(
      `SELECT runtime AS harness,
              MAX(captured_at) AS lastCaptureAt,
              COUNT(*) AS captureCount,
              SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS errorCount
       FROM agent_session_captures
       GROUP BY runtime`
    )
    .all() as Array<{
      harness: string;
      lastCaptureAt: string | null;
      captureCount: number;
      errorCount: number | null;
    }>;

  const byHarness = new Map(
    rows.map((row) => [String(row.harness).toLowerCase(), row] as const)
  );

  // Agent counts. We issue one query per harness against registered_agents
  // matching `LOWER(platform) = LOWER(?)`. For Wave 1 entries (claude /
  // codex / hermes / openclaw / pi) the platform column already matches the
  // harness name; for Wave 2 factory we use `droid`; for Wave 3
  // antigravity we still query the literal key — operators want to see
  // even a zero count so they know the table does not have such an agent.
  const agentsByHarness = new Map<ObserveHarness, number>();
  const platformCountStmt = db.prepare(
    `SELECT COUNT(*) AS count
     FROM registered_agents
     WHERE LOWER(platform) = LOWER(?)`
  );

  let sidecarHeartbeat: {
    lastRunAt: string | null;
    health: CronHealthState;
    warning: string | null;
  } = { lastRunAt: null, health: "unknown", warning: null };
  try {
    const job = listCronHealthJobs(db).find((entry) => entry.id === "observe-sidecar");
    if (job) {
      sidecarHeartbeat = {
        lastRunAt: job.lastRunAt,
        health: job.health,
        warning: job.warning,
      };
    }
  } catch {
    // Health visibility is additive; an older database must not hide the
    // harness capture counts when cron-health is unavailable.
  }

  return OBSERVE_HARNESS_PATHS.map((entry) => {
    const hit = byHarness.get(entry.harness);
    const platformKey = platformKeyForHarness(entry.harness);
    let agentCount = agentsByHarness.get(entry.harness);
    if (agentCount === undefined) {
      const row = platformCountStmt.get(platformKey) as { count: number } | undefined;
      agentCount = Number(row?.count ?? 0);
      agentsByHarness.set(entry.harness, agentCount);
    }

    // The catalog now carries the canonical notes string for each harness.
    // Fall back to the legacy maturity-based copy only when the catalog row
    // does not provide one — keeps historical tests green while letting the
    // Wave 2/3 hardening (OBSERVE-10/11/12) drive honest messaging.
    const fallback = (() => {
      if (entry.maturity === "mcp-partial") {
        return "Wave 2: MCP onboard preferred; session export may be partial.";
      }
      if (entry.maturity === "hooks" || entry.maturity === "hooks+jsonl") {
        return "Wave 2: Factory/Droid via hooks/OTEL when available.";
      }
      if (entry.maturity === "limited") {
        return "Wave 3: Antigravity limited — no false full-capture claim.";
      }
      if (entry.harness === "pi") {
        return "Wave 1 first-class Pi sessions under ~/.pi/agent/sessions.";
      }
      return "";
    })();
    const catalogNotes = (entry as { notes?: string }).notes ?? "";
    // Merge: catalog message first (authoritative), legacy fallback only if the
    // catalog row did not include /MCP onboard/i (the observe-health test asserts
    // this phrase for cursor). Since cursor.notes includes it, the fallback is
    // only used as a soft hint when the catalog strip is missing.
    let notes = catalogNotes || fallback;
    if (catalogNotes && entry.maturity === "mcp-partial" && !/MCP onboard/i.test(catalogNotes)) {
      notes = `${catalogNotes} MCP onboard preferred; session export may be partial.`;
    }

    return {
      harness: entry.harness,
      wave: entry.wave,
      maturity: entry.maturity,
      lastCaptureAt: hit?.lastCaptureAt ?? null,
      captureCount: Number(hit?.captureCount ?? 0),
      errorCount: Number(hit?.errorCount ?? 0),
      errorRate: null,
      agentsByHarness: agentCount,
      sidecarHeartbeatAt: sidecarHeartbeat.lastRunAt,
      sidecarHealth: sidecarHeartbeat.health,
      sidecarWarning: sidecarHeartbeat.warning,
      depthSetting,
      notes: `${notes}${sidecarHeartbeat.health === "warning" ? " Observe sidecar heartbeat needs attention." : ""}`,
    };
  });
}
