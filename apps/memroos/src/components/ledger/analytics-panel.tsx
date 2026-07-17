"use client";

import { useState } from "react";
import { useTimeSeries, type TimeSeriesWindow } from "@/lib/api-client";
import { TimeSeriesChart } from "@/components/shared/time-series-chart";
import { COLORS } from "@/lib/ui-constants";
import {
  metricEnvelope,
  type MetricEnvelope,
} from "@/lib/metric-status";

type TruthfulStatus = MetricEnvelope<number>["status"];

function pointsEnvelope(
  points: Array<{ bucket: string; value: number }> | undefined,
  source: string,
  window: TimeSeriesWindow,
  error: unknown,
  isLoading: boolean,
  observedAt: string | null
): MetricEnvelope<number> {
  if (error) {
    return metricEnvelope<number>({
      value: null,
      status: "error",
      source,
      observedAt: null,
      freshnessMs: null,
      scope: { window, workspace: "all" },
      reason: error instanceof Error ? error.message : "Failed to load time-series source",
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
      reason: `Loading ${source} for window=${window}`,
    });
  }
  const list = points ?? [];
  const total = list.reduce((sum, point) => sum + (Number.isFinite(point.value) ? point.value : 0), 0);
  if (list.length === 0) {
    return metricEnvelope<number>({
      value: null,
      status: "empty",
      source,
      observedAt,
      freshnessMs: null,
      scope: { window, workspace: "all" },
      reason: `Healthy ${source} returned no ${window} buckets`,
    });
  }
  if (total === 0) {
    return metricEnvelope<number>({
      value: 0,
      status: "zero",
      source,
      observedAt,
      freshnessMs: null,
      scope: { window, workspace: "all" },
      reason: `Successful ${source} measured exactly zero across ${list.length} ${window} buckets`,
    });
  }
  return metricEnvelope<number>({
    value: total,
    status: "live",
    source,
    observedAt,
    freshnessMs: null,
    scope: { window, workspace: "all" },
    reason: `Sum of ${list.length} ${window} buckets from ${source}`,
  });
}

function statusBadgeStyle(status: TruthfulStatus): { background: string; color: string; label: string } {
  if (status === "live" || status === "zero") {
    return { background: "rgba(16, 185, 129, 0.12)", color: "#10b981", label: status === "zero" ? "measured zero" : "live" };
  }
  if (status === "empty") return { background: "rgba(148, 163, 184, 0.15)", color: "#64748b", label: "empty" };
  if (status === "error") return { background: "rgba(244, 63, 94, 0.12)", color: "#f43f5e", label: "error" };
  return { background: "rgba(245, 158, 11, 0.12)", color: "#f59e0b", label: status };
}

function TruthfulChartHeader({ envelope }: { envelope: MetricEnvelope<number> }) {
  const badge = statusBadgeStyle(envelope.status);
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-stone-400" data-trend-source-label>
          {envelope.source}
        </span>
        <span
          className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
          style={{ background: badge.background, color: badge.color }}
          data-trend-status={envelope.status}
        >
          {badge.label}
        </span>
      </div>
      <span className="text-[10px] text-stone-400" data-trend-source>
        scope: window={envelope.scope.window}, workspace={envelope.scope.workspace}
      </span>
    </div>
  );
}

function TruthfulChartCaption({ envelope }: { envelope: MetricEnvelope<number> }) {
  const isLive = envelope.status === "live" || envelope.status === "zero";
  return (
    <div
      className="text-[10px] leading-4 text-stone-500"
      style={{ fontFamily: "ui-monospace, monospace" }}
      data-trend-reason
    >
      <div>
        observed: {envelope.observedAt ?? "—"} ·{" "}
        {envelope.freshnessMs === null ? "fresh" : `${Math.round(envelope.freshnessMs / 1000)}s ago`}
      </div>
      {!isLive && envelope.reason && (
        <div style={{ color: "#f43f5e" }}>{envelope.reason}</div>
      )}
    </div>
  );
}

function TruthfulChartPanel({
  title,
  envelope,
  points,
  window,
  onWindowChange,
  isLoading,
  lineColor,
}: {
  title: string;
  envelope: MetricEnvelope<number>;
  points: Array<{ bucket: string; value: number }>;
  window: TimeSeriesWindow;
  onWindowChange: (w: TimeSeriesWindow) => void;
  isLoading: boolean;
  lineColor: string;
}) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white/90 p-4" data-trend-source-anchor={envelope.source}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-stone-500" data-trend-title={title}>
          {title}
        </span>
        <div className="flex gap-1">
          {[
            { label: "Day", value: "day" as TimeSeriesWindow },
            { label: "Week", value: "week" as TimeSeriesWindow },
            { label: "Month", value: "month" as TimeSeriesWindow },
          ].map((w) => (
            <button
              key={w.value}
              onClick={() => onWindowChange(w.value)}
              className={[
                "px-2 py-0.5 text-xs rounded transition-colors",
                w.value === window
                  ? "text-amber-500 bg-amber-500/10"
                  : "text-stone-500 hover:text-stone-500",
              ].join(" ")}
              data-trend-window-toggle={w.value}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>
      <TruthfulChartHeader envelope={envelope} />
      <div className="mt-2">
        <TimeSeriesChart
          title=" "
          points={envelope.status === "error" ? [] : points}
          window={window}
          onWindowChange={onWindowChange}
          isLoading={isLoading}
          lineColor={lineColor}
        />
      </div>
      <TruthfulChartCaption envelope={envelope} />
    </div>
  );
}

export function LedgerAnalyticsPanel() {
  const [window, setWindow] = useState<TimeSeriesWindow>("week");

  const docsIngested = useTimeSeries("docs_ingested", window);
  const memoryWrites = useTimeSeries("memory_writes", window);
  const recallQueries = useTimeSeries("recall_queries", window);

  const docsEnvelope = pointsEnvelope(
    docsIngested.data?.points,
    "/api/time-series?metric=docs_ingested",
    window,
    docsIngested.error,
    docsIngested.isLoading,
    docsIngested.data?.timestamp ?? null
  );
  const writesEnvelope = pointsEnvelope(
    memoryWrites.data?.points,
    "/api/time-series?metric=memory_writes",
    window,
    memoryWrites.error,
    memoryWrites.isLoading,
    memoryWrites.data?.timestamp ?? null
  );
  const recallEnvelope = pointsEnvelope(
    recallQueries.data?.points,
    "/api/time-series?metric=recall_queries",
    window,
    recallQueries.error,
    recallQueries.isLoading,
    recallQueries.data?.timestamp ?? null
  );

  return (
    <div className="space-y-6" data-trend-scope={window}>
      <h3 className="text-lg font-semibold text-stone-700">
        Usage Trends
        <span className="ml-2 text-xs font-normal text-stone-500" data-trend-window-label>
          window={window} (workspace=all, time-series is windowed only)
        </span>
      </h3>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <TruthfulChartPanel
          title="Docs Ingested"
          envelope={docsEnvelope}
          points={docsIngested.data?.points ?? []}
          window={window}
          onWindowChange={setWindow}
          isLoading={docsIngested.isLoading}
          lineColor={COLORS.accent}
        />
        <TruthfulChartPanel
          title="Memory Writes"
          envelope={writesEnvelope}
          points={memoryWrites.data?.points ?? []}
          window={window}
          onWindowChange={setWindow}
          isLoading={memoryWrites.isLoading}
          lineColor={COLORS.info}
        />
        <TruthfulChartPanel
          title="Recall Queries"
          envelope={recallEnvelope}
          points={recallQueries.data?.points ?? []}
          window={window}
          onWindowChange={setWindow}
          isLoading={recallQueries.isLoading}
          lineColor={COLORS.success}
        />
      </div>
    </div>
  );
}
