/**
 * Truthful liveness classification for the Agents NOC surface.
 *
 * Agents can be "alive" from three independent signals:
 *
 *   1. Heartbeats (`registered_agents.last_heartbeat_at`) — produced by
 *      agents calling /api/heartbeat with a bearer key.
 *   2. Hive actions (`hive_actions`) — produced by agent dispatch flows.
 *   3. Local runtime scans (`local-agent-runtime`) — only available in
 *      developer-host environments and never authoritative in production.
 *
 * A missing or stale observation must NEVER be displayed as a healthy
 * "active" agent or a healthy zero workload. This module classifies
 * every agent's liveness into one of:
 *
 *   - `live`: a heartbeat (or hive action) is fresh within the threshold.
 *   - `stale`: an observation exists but is older than the threshold.
 *   - `never`: the agent has never produced a heartbeat or hive action.
 *   - `missing`: the agent source itself is unavailable (sqlite or runtime
 *     probe failed).
 *   - `error`: a query, parse, or schema failure prevented classification.
 *
 * Each classification carries `observedAt`, `freshnessMs`, and a
 * human-readable `reason`. Per-agent summaries are aggregated via
 * `summarizeLivenessStates` so the top-card totals never silently become
 * a healthy zero.
 */

import type { RegisteredAgent } from "@/types";
import { metricEnvelope, type MetricEnvelope, type MetricScope } from "@/lib/metric-status";

export type LivenessState = "live" | "stale" | "never" | "missing" | "error";

export const LIVENESS_STATES: LivenessState[] = [
  "live",
  "stale",
  "never",
  "missing",
  "error",
];

/** Default heartbeat freshness window. Mirrors RECENT_ACTIVITY_WINDOW_MS
 *  used by hive-actions derivation. Production tuneable via env. */
export const DEFAULT_LIVENESS_THRESHOLD_MS =
  Number(process.env.MEMROOS_AGENT_LIVENESS_THRESHOLD_MS ?? 30 * 60 * 1000);

export interface LivenessObservation {
  state: LivenessState;
  observedAt: string | null;
  freshnessMs: number | null;
  source: string;
  reason: string;
}

export interface ClassifyLivenessInput {
  lastHeartbeat: string | null;
  /** Optional latest hive activity timestamp; wins over heartbeat if newer. */
  hiveActivityAt?: string | null;
  /** Local runtime scan timestamp; only used when no other observation exists. */
  localRuntimeAt?: string | null;
  freshnessThresholdMs?: number;
  /** Override current time for deterministic tests. */
  now?: number;
}

function parseIso(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Classify a single agent's liveness into one of the canonical states.
 *
 * Critical invariant: a `null` heartbeat, `null` hive activity, and a
 * `null` local-runtime probe NEVER yield "live" — the agent is "never"
 * until an observation is recorded. The returned observation carries
 * the timestamp of the actual signal that produced the state.
 */
export function classifyLiveness(input: ClassifyLivenessInput): LivenessObservation {
  const threshold = input.freshnessThresholdMs ?? DEFAULT_LIVENESS_THRESHOLD_MS;
  const now = typeof input.now === "number" ? input.now : Date.now();

  const hbMs = parseIso(input.lastHeartbeat);
  const hiveMs = parseIso(input.hiveActivityAt ?? null);
  const localMs = parseIso(input.localRuntimeAt ?? null);

  const candidates: Array<{ ms: number; source: string }> = [];
  if (hbMs !== null) candidates.push({ ms: hbMs, source: "sqlite://registered_agents.last_heartbeat_at" });
  if (hiveMs !== null) candidates.push({ ms: hiveMs, source: "sqlite://hive_actions.timestamp" });
  if (localMs !== null) candidates.push({ ms: localMs, source: "host://local-agent-runtime.scan" });

  if (candidates.length === 0) {
    return {
      state: "never",
      observedAt: null,
      freshnessMs: null,
      source: "sqlite://registered_agents.last_heartbeat_at",
      reason:
        "Agent has never produced a heartbeat, hive action, or local-runtime observation",
    };
  }

  let latest = candidates[0]!;
  for (const candidate of candidates) {
    if (candidate.ms > latest.ms) latest = candidate;
  }

  const ageMs = Math.max(0, now - latest.ms);
  const observedAt = new Date(latest.ms).toISOString();
  if (ageMs > threshold) {
    return {
      state: "stale",
      observedAt,
      freshnessMs: ageMs,
      source: latest.source,
      reason: `Latest observation is ${Math.round(ageMs / 1000)}s old, threshold is ${Math.round(threshold / 1000)}s`,
    };
  }
  return {
    state: "live",
    observedAt,
    freshnessMs: ageMs,
    source: latest.source,
    reason: `Fresh observation from ${latest.source} within ${Math.round(threshold / 1000)}s`,
  };
}

export interface AgentWithLiveness extends RegisteredAgent {
  liveness: LivenessObservation;
}

export interface LivenessCounts {
  live: number;
  stale: number;
  never: number;
  missing: number;
  error: number;
  total: number;
}

export const EMPTY_LIVENESS_COUNTS: LivenessCounts = {
  live: 0,
  stale: 0,
  never: 0,
  missing: 0,
  error: 0,
  total: 0,
};

/**
 * Aggregate per-agent liveness observations into counts. Missing and
 * error are kept distinct so a probe failure cannot be hidden as "never".
 */
export function summarizeLivenessStates(
  observations: LivenessObservation[]
): LivenessCounts {
  const counts: LivenessCounts = { ...EMPTY_LIVENESS_COUNTS };
  for (const obs of observations) {
    counts[obs.state] += 1;
    counts.total += 1;
  }
  return counts;
}

export interface BuildLivenessEnvelopeInput {
  counts: LivenessCounts;
  scope: MetricScope;
  /** Freshest observedAt across the per-agent liveness observations. */
  observedAt: string | null;
  /** Freshest freshnessMs across per-agent observations. */
  freshnessMs: number | null;
  /** True when the probe that produced the counts succeeded. */
  sourceOk: boolean;
  /** Failure reason when sourceOk is false. */
  sourceError?: string | null;
}

/**
 * Wrap a liveness aggregate into a truthful MetricEnvelope.
 *
 * - sourceOk=false → status="error", value=null.
 * - counts.total===0 → status="empty" (healthy source, no agents at all).
 * - counts.live===counts.total && counts.total>0 → status="live".
 * - counts.error>0 → status="degraded" (some agents failed classification).
 * - any stale/never → status="degraded" if others are live, else "stale".
 */
export function buildLivenessEnvelope(input: BuildLivenessEnvelopeInput): MetricEnvelope<number> {
  const { counts, scope, observedAt, freshnessMs, sourceOk, sourceError } = input;
  if (!sourceOk) {
    return {
      value: null,
      status: "error",
      source: "sqlite://registered_agents",
      observedAt: null,
      freshnessMs: null,
      scope,
      reason: sourceError ?? "Liveness probe failed; cannot summarize agent liveness",
    };
  }
  if (counts.total === 0) {
    return metricEnvelope<number>({
      value: 0,
      status: "empty",
      source: "sqlite://registered_agents",
      observedAt: null,
      freshnessMs: null,
      scope,
      reason: "No agents are registered; liveness aggregate is empty, not zero",
    });
  }
  if (counts.error > 0) {
    return {
      value: counts.total - counts.error,
      status: "degraded",
      source: "sqlite://registered_agents",
      observedAt,
      freshnessMs,
      scope,
      reason: `${counts.error} of ${counts.total} agents failed liveness classification`,
    };
  }
  if (counts.live === counts.total) {
    return {
      value: counts.live,
      status: "live",
      source: "sqlite://registered_agents",
      observedAt,
      freshnessMs,
      scope,
      reason: `All ${counts.total} registered agents are within the freshness threshold`,
    };
  }
  if (counts.live === 0 && counts.stale === counts.total) {
    return {
      value: 0,
      status: "stale",
      source: "sqlite://registered_agents",
      observedAt,
      freshnessMs,
      scope,
      reason: `All ${counts.total} registered agents have stale observations`,
    };
  }
  return {
    value: counts.live,
    status: "degraded",
    source: "sqlite://registered_agents",
    observedAt,
    freshnessMs,
    scope,
    reason: `${counts.live} live, ${counts.stale} stale, ${counts.never} never of ${counts.total} registered agents`,
  };
}

export interface ReadinessSummary {
  average: number | null;
  min: number | null;
  max: number | null;
  withCapabilities: number;
  total: number;
}

/**
 * Summarize readiness scores across the registry. The result is exposed
 * to the UI as a MetricEnvelope in the page so an empty/zero roster is
 * distinguishable from a roster of zero-readiness agents.
 */
export function summarizeReadiness(scores: number[]): ReadinessSummary {
  if (scores.length === 0) {
    return { average: null, min: null, max: null, withCapabilities: 0, total: 0 };
  }
  let sum = 0;
  let min = scores[0]!;
  let max = scores[0]!;
  for (const score of scores) {
    sum += score;
    if (score < min) min = score;
    if (score > max) max = score;
  }
  return {
    average: Math.round(sum / scores.length),
    min,
    max,
    withCapabilities: scores.filter((score) => score > 0).length,
    total: scores.length,
  };
}
