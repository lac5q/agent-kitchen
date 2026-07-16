/**
 * Shared "truthful metric" contract used by Operations NOC adapters and UI.
 *
 * Every metric rendered on NOC surfaces must carry:
 *   - value:        the measured number when the source succeeded, otherwise null
 *   - status:       one of the canonical truthful states (see METRIC_STATUSES)
 *   - source:       a stable identifier of the underlying source
 *   - observedAt:   ISO timestamp of the latest successful observation, or null
 *   - freshnessMs:  observed age in milliseconds (null when unknown)
 *   - scope:        the selected window and workspace this metric honors
 *   - reason:       human-readable explanation for any non-live state
 */

export const METRIC_STATUSES = [
  "live",
  "zero",
  "empty",
  "stale",
  "blocked",
  "unavailable",
  "degraded",
  "error",
] as const;

export type MetricStatus = (typeof METRIC_STATUSES)[number];

export interface MetricScope {
  window: string;
  workspace: string;
}

export interface MetricEnvelope<T = number> {
  value: T | null;
  status: MetricStatus;
  source: string;
  observedAt: string | null;
  freshnessMs: number | null;
  scope: MetricScope;
  reason: string | null;
}

const DEFAULT_REASONS: Record<MetricStatus, string> = {
  live: "Successful source measurement",
  zero: "Measured zero from a successful source",
  empty: "Healthy source has no observations in the selected window",
  stale: "Latest observation is older than the freshness threshold",
  blocked: "Collection or access is intentionally blocked",
  unavailable: "Source is unconfigured, unreachable, or has no producer",
  degraded: "Some but not all required inputs are available",
  error: "Request, parse, schema, or query failed",
};

export interface MetricEnvelopeInput<T = number> {
  value: T | null;
  status: MetricStatus;
  source: string;
  observedAt: string | null;
  freshnessMs?: number | null;
  scope: MetricScope;
  reason?: string | null;
}

/**
 * Build a fully populated metric envelope. Ensures reason is always set
 * (defaults to a canonical explanation when the caller does not supply one)
 * and clamps value to null for any non-live status, so adapters cannot
 * accidentally present a number for a non-successful state.
 */
export function metricEnvelope<T = number>(input: MetricEnvelopeInput<T>): MetricEnvelope<T> {
  const status = input.status;
  // Carry the supplied value only when the status represents a *successful*
  // measurement or a known zero result. Non-success statuses
  // (blocked, error, empty, stale, degraded, unavailable) collapse value
  // to null so adapters cannot accidentally display a number for a
  // failed or non-measured source.
  const carriesValue = status === "live" || status === "zero";
  const value = carriesValue ? input.value : null;

  const reason =
    typeof input.reason === "string" && input.reason.length > 0
      ? input.reason
      : DEFAULT_REASONS[status];

  return {
    value,
    status,
    source: input.source,
    observedAt: input.observedAt,
    freshnessMs: typeof input.freshnessMs === "number" ? input.freshnessMs : null,
    scope: input.scope,
    reason,
  };
}

/**
 * Decorate an existing envelope with additional provenance metadata without
 * touching its status or measured value.
 */
export function withSourceMeta<T>(
  env: MetricEnvelope<T>,
  patch: { freshnessMs?: number | null; reason?: string | null; observedAt?: string | null }
): MetricEnvelope<T> {
  return {
    ...env,
    freshnessMs: typeof patch.freshnessMs === "number" ? patch.freshnessMs : env.freshnessMs,
    reason: typeof patch.reason === "string" ? patch.reason : env.reason,
    observedAt: typeof patch.observedAt === "string" ? patch.observedAt : env.observedAt,
  };
}

export interface ClassifyScalarInput {
  rowCount: number;
  sourceOk: boolean;
  latestAt: string | null;
  freshnessMs: number | null;
  /** Age (ms) beyond which a healthy observation is considered stale. */
  freshnessThresholdMs?: number;
  /** Override current time (for deterministic tests). */
  now?: number;
}

export interface ClassifyScalarResult {
  status: MetricStatus;
  reason: string;
  freshnessMs: number | null;
}

/**
 * Classify a scalar metric query into one of the truthful statuses.
 *
 * Critical invariant: a failed query (`sourceOk === false`) NEVER yields
 * "zero" or "live", regardless of row count returned by the adapter.
 */
export function classifyScalar(input: ClassifyScalarInput): ClassifyScalarResult {
  if (!input.sourceOk) {
    return {
      status: "error",
      reason: "Underlying source query failed; metric is unavailable until source recovers.",
      freshnessMs: null,
    };
  }

  const threshold = input.freshnessThresholdMs ?? null;
  const now = typeof input.now === "number" ? input.now : Date.now();
  if (input.latestAt && threshold !== null) {
    const observed = Date.parse(input.latestAt);
    if (Number.isFinite(observed)) {
      const ageMs = now - observed;
      if (ageMs > threshold) {
        return {
          status: "stale",
          reason: `Latest observation is ${Math.round(ageMs / 1000)}s old, threshold is ${Math.round(threshold / 1000)}s`,
          freshnessMs: ageMs,
        };
      }
    }
  }

  if (input.rowCount > 0) {
    return {
      status: "live",
      reason: `Measured ${input.rowCount} successful rows`,
      freshnessMs: input.freshnessMs,
    };
  }

  if (input.latestAt === null) {
    return {
      status: "empty",
      reason: "Healthy source has no observations in the selected window",
      freshnessMs: input.freshnessMs,
    };
  }

  return {
    status: "zero",
    reason: "Successful source measured exactly zero in the selected window",
    freshnessMs: input.freshnessMs,
  };
}

/**
 * Map the legacy panel status union to the truthful metric contract.
 * A "degraded" panel that lost its source surfaces as "error".
 */
export function panelStatusToMetricStatus(
  panelStatus: "live" | "empty" | "degraded" | "missing",
  context: { sourceOk: boolean; rowCount: number }
): MetricStatus {
  if (panelStatus === "live") return "live";
  if (panelStatus === "empty") return context.sourceOk ? "empty" : "error";
  if (panelStatus === "missing") return context.sourceOk ? "empty" : "unavailable";
  return context.sourceOk && context.rowCount > 0 ? "degraded" : "error";
}

/**
 * Compute the human-readable display state for a metric envelope.
 */
export function describeMetricEnvelope(env: MetricEnvelope): {
  label: string;
  tone: "live" | "zero" | "warn" | "alert" | "info";
} {
  switch (env.status) {
    case "live":
      return { label: "live", tone: "live" };
    case "zero":
      return { label: "measured zero", tone: "zero" };
    case "empty":
      return { label: "empty", tone: "info" };
    case "stale":
      return { label: "stale", tone: "warn" };
    case "blocked":
      return { label: "blocked", tone: "warn" };
    case "unavailable":
      return { label: "unavailable", tone: "warn" };
    case "degraded":
      return { label: "degraded", tone: "warn" };
    case "error":
      return { label: "error", tone: "alert" };
  }
}

/**
 * Returns true ONLY when the envelope represents a successful measurement of
 * zero. Any other status returns false.
 */
export function isTruthfulZeroEnvelope(env: MetricEnvelope): boolean {
  return env.status === "zero" && env.value === 0;
}

/**
 * Coerce a partially-trusted scope into a deterministic one. Used by adapters
 * that read `?window=` and `?workspace=` from the request to ensure the
 * envelope always carries the same window/workspace as the response filters.
 */
export function normalizeScope(
  scope: Partial<MetricScope> | null | undefined,
  defaultWindow: string,
  defaultWorkspace: string
): MetricScope {
  return {
    window: typeof scope?.window === "string" && scope.window.length > 0 ? scope.window : defaultWindow,
    workspace:
      typeof scope?.workspace === "string" && scope.workspace.length > 0
        ? scope.workspace
        : defaultWorkspace,
  };
}
