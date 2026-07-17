import {
  DEFAULT_PERFORMANCE_BUDGETS,
  performanceBudgetStatus,
  responseCache,
} from "@/lib/response-cache";
import {
  metricEnvelope,
  type MetricEnvelope,
  type MetricScope,
} from "@/lib/metric-status";

export const dynamic = "force-dynamic";

const SCOPE: MetricScope = { window: "all", workspace: "all" };

export function GET() {
  const raw = responseCache.stats();
  const performance = performanceBudgetStatus(DEFAULT_PERFORMANCE_BUDGETS);
  const observedAt = new Date().toISOString();
  const hitRate = (() => {
    if (typeof raw.hits === "number" && typeof raw.misses === "number") {
      const total = raw.hits + raw.misses;
      return total > 0 ? raw.hits / total : null;
    }
    return null;
  })();
  const metrics: Record<string, MetricEnvelope<number | null>> = {
    entries: metricEnvelope<number | null>({
      value: typeof raw.entries === "number" ? raw.entries : 0,
      status: typeof raw.entries === "number" ? "live" : "unavailable",
      source: "node://response-cache#entries",
      observedAt,
      scope: SCOPE,
      reason: typeof raw.entries === "number"
        ? `${raw.entries} response cache entries cached`
        : "Response cache entry count unavailable",
    }),
    hits: metricEnvelope<number | null>({
      value: typeof raw.hits === "number" ? raw.hits : null,
      status: typeof raw.hits === "number" ? "live" : "unavailable",
      source: "node://response-cache#hits",
      observedAt,
      scope: SCOPE,
      reason: typeof raw.hits === "number" ? `${raw.hits} cache hits` : "hits counter unavailable",
    }),
    misses: metricEnvelope<number | null>({
      value: typeof raw.misses === "number" ? raw.misses : null,
      status: typeof raw.misses === "number" ? "live" : "unavailable",
      source: "node://response-cache#misses",
      observedAt,
      scope: SCOPE,
      reason: typeof raw.misses === "number" ? `${raw.misses} cache misses` : "misses counter unavailable",
    }),
    hitRate: metricEnvelope<number | null>({
      value: hitRate,
      status: hitRate === null ? "unavailable" : hitRate === 0 ? "zero" : "live",
      source: "node://response-cache#hitRate",
      observedAt,
      scope: SCOPE,
      reason:
        hitRate === null
          ? "hits/misses counters not yet populated"
          : hitRate === 0
            ? "0% cache hit rate; cache cold"
            : `${(hitRate * 100).toFixed(2)}% cache hit rate`,
    }),
    performanceOk: metricEnvelope<number | null>({
      value: performance.ok ? 1 : 0,
      status: performance.ok ? "live" : "degraded",
      source: "node://response-cache#performance",
      observedAt,
      scope: SCOPE,
      reason: performance.ok
        ? "All performance budgets within tolerance"
        : `One or more performance budgets exceeded: ${(performance.routes ?? []).filter((r) => r.status !== "pass").map((r) => r.route).join(", ") || "unknown"}`,
    }),
  };
  return Response.json({
    stats: raw,
    performance,
    metrics,
    timestamp: observedAt,
  });
}
