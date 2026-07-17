"use client";

import { useState } from "react";
import {
  useModelRoutingDashboard,
  useModelRoutingEvals,
  useModelRoutingRecommendations,
} from "@/lib/api-client";
import { metricEnvelope, type MetricEnvelope } from "@/lib/metric-status";

const TASK_TYPES = ["engineering", "product", "sales", "support"] as const;
const STRATEGIES = ["balanced", "quality", "cost", "latency"] as const;

type NumberEnvelope = MetricEnvelope<number>;

function summaryToRunsEnvelope(
  summary: { totalRuns: number } | undefined,
  source: string,
  window: string,
  error: unknown,
  isLoading: boolean,
  observedAt: string | null
): NumberEnvelope {
  if (error) {
    return metricEnvelope<number>({
      value: null,
      status: "error",
      source,
      observedAt: null,
      freshnessMs: null,
      scope: { window, workspace: "all" },
      reason: error instanceof Error ? error.message : "Failed to load model-routing summary",
    });
  }
  if (isLoading) {
    return metricEnvelope<number>({
      value: null,
      status: "blocked",
      source,
      observedAt: null,
      freshnessMs: null,
      scope: { window, workspace: "all" },
      reason: `Loading ${source}`,
    });
  }
  if (!summary) {
    return metricEnvelope<number>({
      value: null,
      status: "unavailable",
      source,
      observedAt,
      freshnessMs: null,
      scope: { window, workspace: "all" },
      reason: `Source ${source} returned no summary`,
    });
  }
  if (summary.totalRuns === 0) {
    return metricEnvelope<number>({
      value: 0,
      status: "zero",
      source,
      observedAt,
      freshnessMs: null,
      scope: { window, workspace: "all" },
      reason: `Successful ${source} measured exactly zero runs`,
    });
  }
  return metricEnvelope<number>({
    value: summary.totalRuns,
    status: "live",
    source,
    observedAt,
    freshnessMs: null,
    scope: { window, workspace: "all" },
    reason: `${summary.totalRuns} routing events from ${source}`,
  });
}

function summaryToRateEnvelope(
  summary: { successRate: number | null } | undefined,
  source: string,
  window: string,
  error: unknown,
  isLoading: boolean,
  observedAt: string | null
): NumberEnvelope {
  if (error) {
    return metricEnvelope<number>({
      value: null,
      status: "error",
      source,
      observedAt: null,
      freshnessMs: null,
      scope: { window, workspace: "all" },
      reason: error instanceof Error ? error.message : "Failed to load routing success rate",
    });
  }
  if (isLoading) {
    return metricEnvelope<number>({
      value: null,
      status: "blocked",
      source,
      observedAt: null,
      freshnessMs: null,
      scope: { window, workspace: "all" },
      reason: `Loading ${source}`,
    });
  }
  if (!summary || summary.successRate === null) {
    return metricEnvelope<number>({
      value: null,
      status: "unavailable",
      source,
      observedAt,
      freshnessMs: null,
      scope: { window, workspace: "all" },
      reason: `Successful ${source} returned no scored runs; quality cannot be measured as zero`,
    });
  }
  return metricEnvelope<number>({
    value: summary.successRate,
    status: "live",
    source,
    observedAt,
    freshnessMs: null,
    scope: { window, workspace: "all" },
    reason: `${(summary.successRate * 100).toFixed(1)}% of routing runs succeeded`,
  });
}

function summaryToQualityEnvelope(
  summary: { averageQuality: number | null } | undefined,
  source: string,
  window: string,
  error: unknown,
  isLoading: boolean,
  observedAt: string | null
): NumberEnvelope {
  if (error) {
    return metricEnvelope<number>({
      value: null,
      status: "error",
      source,
      observedAt: null,
      freshnessMs: null,
      scope: { window, workspace: "all" },
      reason: error instanceof Error ? error.message : "Failed to load routing quality",
    });
  }
  if (isLoading) {
    return metricEnvelope<number>({
      value: null,
      status: "blocked",
      source,
      observedAt: null,
      freshnessMs: null,
      scope: { window, workspace: "all" },
      reason: `Loading ${source}`,
    });
  }
  if (!summary || summary.averageQuality === null) {
    return metricEnvelope<number>({
      value: null,
      status: "unavailable",
      source,
      observedAt,
      freshnessMs: null,
      scope: { window, workspace: "all" },
      reason: `Successful ${source} returned no scored runs; quality is N/A, never a fabricated zero`,
    });
  }
  return metricEnvelope<number>({
    value: summary.averageQuality,
    status: "live",
    source,
    observedAt,
    freshnessMs: null,
    scope: { window, workspace: "all" },
    reason: `Average quality across scored routing runs from ${source}`,
  });
}

function summaryToLatencyEnvelope(
  summary: { averageLatencyMs: number | null } | undefined,
  source: string,
  window: string,
  error: unknown,
  isLoading: boolean,
  observedAt: string | null
): NumberEnvelope {
  if (error) {
    return metricEnvelope<number>({
      value: null,
      status: "error",
      source,
      observedAt: null,
      freshnessMs: null,
      scope: { window, workspace: "all" },
      reason: error instanceof Error ? error.message : "Failed to load routing latency",
    });
  }
  if (isLoading) {
    return metricEnvelope<number>({
      value: null,
      status: "blocked",
      source,
      observedAt: null,
      freshnessMs: null,
      scope: { window, workspace: "all" },
      reason: `Loading ${source}`,
    });
  }
  if (!summary || summary.averageLatencyMs === null) {
    return metricEnvelope<number>({
      value: null,
      status: "unavailable",
      source,
      observedAt,
      freshnessMs: null,
      scope: { window, workspace: "all" },
      reason: `Successful ${source} returned no timed runs; latency is N/A, never a fabricated zero`,
    });
  }
  return metricEnvelope<number>({
    value: summary.averageLatencyMs,
    status: "live",
    source,
      observedAt,
    freshnessMs: null,
    scope: { window, workspace: "all" },
    reason: `Average latency across timed routing runs from ${source}`,
  });
}

function statusBadge(status: NumberEnvelope["status"]): { label: string; background: string; color: string } {
  if (status === "live") return { label: "live", background: "rgba(16,185,129,0.12)", color: "#10b981" };
  if (status === "zero") return { label: "measured zero", background: "rgba(16,185,129,0.12)", color: "#10b981" };
  if (status === "empty") return { label: "no data", background: "rgba(148,163,184,0.15)", color: "#64748b" };
  if (status === "blocked") return { label: "loading", background: "rgba(148,163,184,0.15)", color: "#64748b" };
  if (status === "error") return { label: "error", background: "rgba(244,63,94,0.12)", color: "#f43f5e" };
  return { label: status, background: "rgba(245,158,11,0.12)", color: "#f59e0b" };
}

function envelopeValueLabel(env: NumberEnvelope): string {
  if (env.status === "live" || env.status === "zero") {
    if (env.value === null) return "0";
    return env.value.toLocaleString();
  }
  if (env.status === "empty") return "no data";
  if (env.status === "blocked") return "loading";
  if (env.status === "unavailable") return "N/A";
  if (env.status === "error") return "error";
  return env.status;
}

function recommendationValue(
  rec: { averageQuality: number | null },
  source: string
): NumberEnvelope {
  if (rec.averageQuality === null) {
    return metricEnvelope<number>({
      value: null,
      status: "unavailable",
      source,
      observedAt: null,
      freshnessMs: null,
      scope: { window: "lifetime", workspace: "all" },
      reason: `Successful ${source} returned no scored observations for this model; quality is N/A, never zero`,
    });
  }
  return metricEnvelope<number>({
    value: rec.averageQuality,
    status: "live",
    source,
    observedAt: null,
    freshnessMs: null,
    scope: { window: "lifetime", workspace: "all" },
    reason: `Average quality across ${source} scored observations for this model`,
  });
}

export function ModelRoutingPanel() {
  const [taskType, setTaskType] = useState<(typeof TASK_TYPES)[number]>("engineering");
  const [strategy, setStrategy] = useState<(typeof STRATEGIES)[number]>("balanced");
  const dashboard = useModelRoutingDashboard(8);
  const recommendations = useModelRoutingRecommendations(taskType, strategy);
  const evals = useModelRoutingEvals();

  const summary = dashboard.data?.summary;
  const observedAt = dashboard.data?.timestamp ?? null;
  const recs = recommendations.data?.recommendations ?? [];

  const runsEnv = summaryToRunsEnvelope(
    summary,
    "/api/model-routing/telemetry",
    "lifetime",
    dashboard.error,
    dashboard.isLoading,
    observedAt
  );
  const successEnv = summaryToRateEnvelope(
    summary,
    "/api/model-routing/telemetry",
    "lifetime",
    dashboard.error,
    dashboard.isLoading,
    observedAt
  );
  const qualityEnv = summaryToQualityEnvelope(
    summary,
    "/api/model-routing/telemetry",
    "lifetime",
    dashboard.error,
    dashboard.isLoading,
    observedAt
  );
  const latencyEnv = summaryToLatencyEnvelope(
    summary,
    "/api/model-routing/telemetry",
    "lifetime",
    dashboard.error,
    dashboard.isLoading,
    observedAt
  );

  return (
    <div
      className="rounded-xl border border-stone-200 bg-white/90 p-5"
      data-routing-scope={`taskType=${taskType},strategy=${strategy}`}
    >
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div>
          <h3 className="text-lg font-semibold text-stone-700">Model Routing</h3>
          <p className="mt-1 text-xs text-stone-500">
            Telemetry, recommendations, and eval coverage.
            <span className="ml-1 text-[10px] text-stone-400" data-routing-source>
              /api/model-routing/{`{telemetry,recommendations,evals}`} (workspace=all)
            </span>
          </p>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          {TASK_TYPES.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setTaskType(item)}
              className={`border px-2.5 py-1 text-xs ${taskType === item ? "border-amber-500 text-amber-300" : "border-stone-300 text-stone-500"}`}
              data-routing-task-toggle={item}
            >
              {item}
            </button>
          ))}
          {STRATEGIES.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setStrategy(item)}
              className={`border px-2.5 py-1 text-xs ${strategy === item ? "border-sky-500 text-sky-300" : "border-stone-300 text-stone-500"}`}
              data-routing-strategy-toggle={item}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <RoutingMetricCard label="Runs" envelope={runsEnv} valueLabel={(env) => envelopeValueLabel(env)} />
        <RoutingMetricCard
          label="Success"
          envelope={successEnv}
          valueLabel={(env) => {
            if (env.status === "live" || env.status === "zero") {
              if (env.value === null) return "0%";
              return `${Math.round(env.value * 100)}%`;
            }
            return envelopeValueLabel(env);
          }}
        />
        <RoutingMetricCard
          label="Quality"
          envelope={qualityEnv}
          valueLabel={(env) => {
            if (env.status === "live" || env.status === "zero") {
              if (env.value === null) return "0.00";
              return env.value.toFixed(2);
            }
            return envelopeValueLabel(env);
          }}
        />
        <RoutingMetricCard
          label="Latency"
          envelope={latencyEnv}
          valueLabel={(env) => {
            if (env.status === "live" || env.status === "zero") {
              if (env.value === null) return "N/A";
              return `${env.value}ms`;
            }
            return envelopeValueLabel(env);
          }}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="border border-stone-200 bg-white p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-stone-500">
              Recommendations ({taskType}/{strategy})
            </p>
            {recommendations.error && (
              <span
                className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                style={{ background: "rgba(244,63,94,0.12)", color: "#f43f5e" }}
                data-routing-rec-status="error"
              >
                error
              </span>
            )}
          </div>
          {recommendations.isLoading ? (
            <p className="py-5 text-center text-sm text-stone-500">Loading recommendations...</p>
          ) : (
            <div className="space-y-2" data-routing-rec-source={`/api/model-routing/recommendations?taskType=${taskType}&strategy=${strategy}`}>
              {recs.length === 0 && (
                <p className="py-3 text-xs text-stone-500" data-routing-rec-empty>
                  No recommendations available for taskType={taskType}, strategy={strategy}.
                </p>
              )}
              {recs.map((rec) => {
                const q = recommendationValue(rec, "/api/model-routing/recommendations");
                const qBadge = statusBadge(q.status);
                return (
                  <div
                    key={`${rec.provider}:${rec.model}`}
                    className="grid gap-2 border-b border-stone-200 pb-2 last:border-0 last:pb-0"
                    data-routing-rec-row={`${rec.provider}:${rec.model}`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-stone-700">{rec.model}</span>
                      <span className="rounded border border-stone-300 bg-stone-100 px-1.5 py-0.5 text-xs text-stone-500">
                        {rec.provider}
                      </span>
                      <span
                        className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                        style={{ background: qBadge.background, color: qBadge.color }}
                        data-routing-rec-quality-status={q.status}
                      >
                        quality {qBadge.label}
                      </span>
                      <span className="ml-auto tabular-nums text-sm text-amber-300">{rec.score.toFixed(3)}</span>
                    </div>
                    <p className="text-xs text-stone-500">
                      {rec.label} · {rec.observations} observations · quality{" "}
                      {q.status === "live" && q.value !== null ? q.value.toFixed(2) : qBadge.label}
                    </p>
                    {!q.reason ? null : (
                      <p className="text-[10px] text-stone-400">{q.reason}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="border border-stone-200 bg-white p-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-stone-500">
            Eval Dimensions
            <span className="ml-2 text-[10px] text-stone-400">/api/model-routing/evals</span>
          </p>
          <div className="space-y-2">
            {(evals.data?.dimensions ?? []).map((dimension) => (
              <div key={dimension.id} className="border-b border-stone-200 pb-2 last:border-0 last:pb-0">
                <p className="text-sm font-medium text-stone-700">{dimension.label}</p>
                <p className="mt-1 text-xs leading-5 text-stone-500">{dimension.rubric}</p>
              </div>
            ))}
            {evals.data?.dimensions?.length === 0 && !evals.isLoading && (
              <p className="text-xs text-stone-500" data-routing-eval-empty>
                No eval dimensions configured.
              </p>
            )}
            {evals.error && (
              <p className="text-xs text-rose-400" data-routing-eval-status="error">
                Failed to load /api/model-routing/evals: {evals.error instanceof Error ? evals.error.message : "unknown error"}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function RoutingMetricCard({
  label,
  envelope,
  valueLabel,
}: {
  label: string;
  envelope: NumberEnvelope;
  valueLabel: (env: NumberEnvelope) => string;
}) {
  const badge = statusBadge(envelope.status);
  return (
    <div
      className="border border-stone-200 bg-white p-3"
      data-routing-metric={label}
      data-routing-metric-status={envelope.status}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-stone-500">{label}</p>
        <span
          className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
          style={{ background: badge.background, color: badge.color }}
          data-routing-metric-badge={envelope.status}
        >
          {badge.label}
        </span>
      </div>
      <p className="mt-1 text-2xl font-semibold text-stone-950">{valueLabel(envelope)}</p>
      <p className="mt-1 text-[10px] text-stone-400" data-routing-metric-source>
        {envelope.source}
      </p>
      {envelope.reason && envelope.status !== "live" && envelope.status !== "zero" && (
        <p className="mt-1 text-[10px] text-rose-400" data-routing-metric-reason>
          {envelope.reason}
        </p>
      )}
    </div>
  );
}
