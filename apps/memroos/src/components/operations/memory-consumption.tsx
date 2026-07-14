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

function valuesForLabels(labels: string[], points?: Array<{ bucket: string; value: number }>) {
  const byDay = new Map((points ?? []).map((p) => [p.bucket.includes("-") ? p.bucket.slice(5, 10) : p.bucket, p.value]));
  return labels.map((label) => byDay.get(label) ?? 0);
}

function compact(value: number): string {
  return new Intl.NumberFormat("en", { notation: value >= 1000 ? "compact" : "standard" }).format(value);
}

interface MemoryConsumptionProps {
  filters: NocFilters;
}

export function MemoryConsumption({ filters }: MemoryConsumptionProps) {
  const timeWindow = nocWindowToTimeSeriesWindow(filters.window);
  const memory = useMemoryStats({ window: timeWindow, workspace: filters.workspace });
  const writes = useTimeSeries("memory_writes", timeWindow);
  const recalls = useTimeSeries("recall_queries", timeWindow);
  const labels = labelsForWindow(filters.window);
  const writeValues = valuesForLabels(labels, writes.data?.points);
  const recallValues = valuesForLabels(labels, recalls.data?.points);
  const totalTierCount = memory.data?.tierStats.reduce((sum, tier) => sum + tier.count, 0) ?? 0;
  const highTier = memory.data?.tierStats.find((tier) => tier.tier === "high" || tier.tier === "pinned")?.count ?? 0;
  const lowTier = memory.data?.tierStats.find((tier) => tier.tier === "low")?.count ?? 0;
  const lastRunStatus = memory.data?.lastRun?.status;
  const lastRunError = memory.data?.lastRun?.error_message?.replace(/\s+/g, " ").slice(0, 140) ?? null;
  const sourceError = memory.isError || writes.isError || recalls.isError;
  const noPoints = writeValues.every((v) => v === 0) && recallValues.every((v) => v === 0);
  const sourcesLoaded = !memory.isLoading && !writes.isLoading && !recalls.isLoading;
  const hasWindowedData = writeValues.some((v) => v > 0) || recallValues.some((v) => v > 0);

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
        hint={`Window=${filters.window}, workspace=${filters.workspace}. Tier inventory and consolidation state are cumulative across the SQLite store.`}
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
      <AreaStack
        w={720}
        h={210}
        labels={labels}
        series={[
          { color: NOC.terra, values: writeValues },
          { color: NOC.ink, values: recallValues },
        ]}
      />
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
          No memory write or recall buckets recorded in the {nocWindowLabel(filters.window)} for workspace={filters.workspace}. Chart series are intentionally rendered as zero so the empty state is visible — not a measured zero in source.
        </div>
      )}
      <div
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
            value: compact(memory.data?.pendingUnconsolidated ?? 0),
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
