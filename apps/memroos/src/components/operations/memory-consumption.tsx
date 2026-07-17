"use client";

import { AreaStack } from "@/components/shared/charts";
import { useMemoryStats, useTimeSeries } from "@/lib/api-client";
import { nocWindowLabel, nocWindowToTimeSeriesWindow, type NocFilters } from "@/lib/noc-filters";
import { NOC, NOC_FONT_MONO } from "@/lib/noc-theme";
import {
  Eyebrow,
  Legend,
  Mono,
  NocCard,
  NocPanelHeader,
  SourceStatusBadge,
} from "./noc-primitives";

function labelsForWindow(window: NocFilters["window"]) {
  if (window === "24h") {
    const now = new Date();
    return Array.from({ length: 24 }, (_, i) => {
      const date = new Date(now.getTime() - (23 - i) * 60 * 60 * 1000);
      return `${date.toISOString().slice(11, 13)}:00`;
    });
  }

  const days = window === "7d" ? 7 : 30;
  return Array.from({ length: days }, (_, i) => {
    const date = new Date(Date.now() - (days - 1 - i) * 24 * 60 * 60 * 1000);
    return date.toISOString().slice(5, 10);
  });
}


interface SeriesValues {
  values: (number | null)[];
  /** True when the source returned at least one data point for the series. */
  hasAnyPoint: boolean;
}

function valuesForLabels(
  labels: string[],
  points?: Array<{ bucket: string; value: number }>
): SeriesValues {
  const buckets = new Map(
    (points ?? []).map((p) => [
      p.bucket.includes("-") ? p.bucket.slice(5, 10) : p.bucket,
      p.value,
    ])
  );
  let hasAnyPoint = false;
  const values: (number | null)[] = labels.map((label) => {
    const found = buckets.get(label);
    if (found === undefined) return null;
    hasAnyPoint = true;
    return found;
  });
  return { values, hasAnyPoint };
}
function compact(value: number): string {
  return new Intl.NumberFormat("en", { notation: value >= 1000 ? "compact" : "standard" }).format(value);
}

interface MemoryConsumptionProps {
  filters: NocFilters;
}


export function MemoryConsumption({ filters }: MemoryConsumptionProps) {
  const timeWindow = nocWindowToTimeSeriesWindow(filters.window);
  // /api/time-series is windowed only — it does NOT partition by workspace.
  // Workspace selection is honored only by /api/memory-stats (tier inventory +
  // pending consolidation). The chart must therefore disclose that it is
  // windowed-across-all-workspaces, never the requested workspace.
  const memory = useMemoryStats({ window: timeWindow, workspace: filters.workspace });
  const writes = useTimeSeries("memory_writes", timeWindow);
  const recalls = useTimeSeries("recall_queries", timeWindow);
  const labels = labelsForWindow(filters.window);
  const writeSeries = valuesForLabels(labels, writes.data?.points);
  const recallSeries = valuesForLabels(labels, recalls.data?.points);
  // Finding (3) — round 3: absent series buckets are NOT zero-filled.
  // When the source returns no points at all, the chart receives `[]`
  // so a flat zero baseline cannot masquerade as measured activity.
  // When the source returns SOME points but is missing intervals,
  // the missing buckets stay `null` and are forwarded to AreaStack
  // which renders them as visible gaps (not measured zeros). The
  // `hasAnyPoint` flag plus the explicit empty-state block ensure we
  // never present a numeric zero when nothing was measured.
  const writeValuesForChart: (number | null)[] = writeSeries.hasAnyPoint
    ? writeSeries.values
    : [];
  const recallValuesForChart: (number | null)[] = recallSeries.hasAnyPoint
    ? recallSeries.values
    : [];
  const totalTierCount = memory.data?.tierStats.reduce((sum, tier) => sum + tier.count, 0) ?? 0;
  const highTier = memory.data?.tierStats.find((tier) => tier.tier === "high" || tier.tier === "pinned")?.count ?? 0;
  const lowTier = memory.data?.tierStats.find((tier) => tier.tier === "low")?.count ?? 0;
  const lastRunStatus = memory.data?.lastRun?.status;
  const lastRunError = memory.data?.lastRun?.error_message?.replace(/\s+/g, " ").slice(0, 140) ?? null;
  const sourceError = memory.isError || writes.isError || recalls.isError;
  const sourcesLoaded = !memory.isLoading && !writes.isLoading && !recalls.isLoading;
  const hasWindowedData = writeSeries.hasAnyPoint || recallSeries.hasAnyPoint;
  const noPoints = !hasWindowedData;

  type SubStatus =
    | "live"
    | "zero"
    | "empty"
    | "stale"
    | "blocked"
    | "unavailable"
    | "degraded"
    | "error";
  function classifyWindowedSeries(): SubStatus {
    if (memory.isError || writes.isError || recalls.isError) return "error";
    if (memory.isLoading || writes.isLoading || recalls.isLoading) return "blocked";
    if (sourcesLoaded && !hasWindowedData) return "empty";
    if (sourcesLoaded && hasWindowedData) return "live";
    return "unavailable";
  }
  function classifyTierInventory(): SubStatus {
    if (memory.isError) return "error";
    if (memory.isLoading) return "blocked";
    return memory.data ? "live" : "unavailable";
  }
  function classifyConsolidation(): SubStatus {
    if (memory.isError) return "error";
    if (memory.isLoading) return "blocked";
    if (!memory.data?.lastRun) return "unavailable";
    if (lastRunStatus === "failed") return "error";
    return "live";
  }

  const windowedStatus = classifyWindowedSeries();
  const tierStatus = classifyTierInventory();
  const consolidationStatus = classifyConsolidation();

  return (
    <NocCard pad={16}>
      <NocPanelHeader
        title={`Memory activity · ${nocWindowLabel(filters.window)}`}
        // Memory activity chart is windowed across ALL workspaces (the source
        // does not partition by workspace). Tier inventory and consolidation
        // state DO honor the selected workspace.
        hint={`Window=${filters.window}. Chart series are windowed across all workspaces (workspace selection does not partition /api/time-series). Tier inventory and consolidation state are cumulative across the SQLite store.`}
        right={
          <div style={{ display: "flex", gap: 10, fontSize: 11, color: NOC.muted, alignItems: "center" }}>
            <Legend color={NOC.terra} label="Writes" />
            <Legend color={NOC.ink} label="Recall" />
            <SourceStatusBadge status={windowedStatus} label={`series ${windowedStatus}`} />
          </div>
        }
      />
      {sourceError && (
        <div
          style={{
            fontSize: 12,
            color: NOC.terra,
            marginBottom: 8,
            padding: "6px 8px",
            background: NOC.peach,
            border: `1px solid ${NOC.peach}`,
            fontFamily: NOC_FONT_MONO,
            lineHeight: 1.4,
          }}
        >
          /api/memory-stats or /api/time-series failed: {memory.error?.message ?? writes.error?.message ?? recalls.error?.message ?? "see network log"}
        </div>
      )}
      {writeSeries.hasAnyPoint || recallSeries.hasAnyPoint ? (
        <AreaStack
          w={720}
          h={210}
          labels={labels}
          series={[
            { color: NOC.terra, values: writeValuesForChart },
            { color: NOC.ink, values: recallValuesForChart },
          ]}
          data-empty={false}
        />
      ) : (
        <div
          style={{
            height: 210,
            border: `1px dashed ${NOC.rule}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: NOC.muted,
            fontFamily: NOC_FONT_MONO,
            fontSize: 11.5,
            padding: 8,
            textAlign: "center",
          }}
          data-status-block="chart-empty"
          data-empty={true}
        >
          Chart withheld: zero buckets recorded for {nocWindowLabel(filters.window)}.
          Source returns no measured activity; numeric zeros are NOT rendered.
        </div>
      )}
      {noPoints && !sourceError && (
        <div
          style={{
            fontSize: 11.5,
            color: NOC.muted,
            marginTop: 6,
            padding: "6px 8px",
            background: NOC.fog,
            border: `1px solid ${NOC.rule}`,
          }}
          data-status-block="empty-series"
        >
          No memory write or recall buckets recorded for {nocWindowLabel(filters.window)} (chart series span all workspaces, not workspace={filters.workspace}). The chart is intentionally withheld — these zeros are NOT a measured source value.
        </div>
      )}      <div
        style={{
          marginTop: 10,
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 10,
        }}
      >
        {[
          {
            label: "Tier rows",
            sublabel: "cumulative (all windows)",
            value: compact(totalTierCount),
            status: tierStatus,
            color: tierStatus === "error" ? NOC.terra : NOC.ink,
          },
          {
            label: "High/pinned",
            sublabel: "cumulative tier snapshot",
            value: compact(highTier),
            status: tierStatus,
            color: tierStatus === "error" ? NOC.terra : NOC.success,
          },
          {
            label: "Low tier",
            sublabel: "cumulative tier snapshot",
            value: compact(lowTier),
            status: tierStatus,
            color: tierStatus === "error" ? NOC.terra : NOC.warn,
          },
          {
            label: "Pending consolidation",
            sublabel: `current snapshot, window=${filters.window}, workspace=${filters.workspace}`,
            value:
              consolidationStatus === "live" && memory.data
                ? compact(memory.data.pendingUnconsolidated)
                : "—",
            status: consolidationStatus,
            color:
              consolidationStatus === "error"
                ? NOC.terra
                : consolidationStatus === "unavailable"
                  ? NOC.warn
                  : NOC.warn,
          },
        ].map(({ label, sublabel, value, status, color }) => (
          <div
            key={label}
            style={{ borderLeft: `2px solid ${color}`, paddingLeft: 10 }}
            data-submetric={label}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Eyebrow>{label}</Eyebrow>
              <SourceStatusBadge status={status} />
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                marginTop: 4,
              }}
            >
              <Mono size={16}>{value}</Mono>
            </div>
            <div
              style={{
                fontSize: 10.5,
                color: NOC.soft,
                fontFamily: NOC_FONT_MONO,
                marginTop: 3,
                lineHeight: 1.4,
                overflowWrap: "anywhere",
              }}
            >
              {sublabel}
              {lastRunError && consolidationStatus === "error" ? ` — ${lastRunError}` : null}
            </div>
          </div>
        ))}
      </div>
    </NocCard>
  );
}
