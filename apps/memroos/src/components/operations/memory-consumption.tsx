"use client";

import { AreaStack } from "@/components/shared/charts";
import { useMemoryStats, useMemoryTierHealth, useTimeSeries } from "@/lib/api-client";
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
  // The widest-window probe keeps no-history/window-empty workspace-scoped.
  const memoryHistory = useMemoryStats({ workspace: filters.workspace });
  const health = useMemoryTierHealth() ?? {
    data: undefined,
    isLoading: true,
    isError: false,
  };
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
  const hasWindowedData = writeSeries.hasAnyPoint || recallSeries.hasAnyPoint;
  const workspaceSeriesSupported = filters.workspace === "all";
  const hasScopedWindowMemory =
    totalTierCount > 0 ||
    (memory.data?.sources.length ?? 0) > 0 ||
    (memory.data?.pendingUnconsolidated ?? 0) > 0;
  const widestTierCount =
    memoryHistory.data?.tierStats.reduce((sum, tier) => sum + tier.count, 0) ?? 0;
  const hasScopedMemoryHistory =
    widestTierCount > 0 ||
    (memoryHistory.data?.sources.length ?? 0) > 0 ||
    (memoryHistory.data?.pendingUnconsolidated ?? 0) > 0 ||
    memoryHistory.data?.lastRun != null;
  const sourceError =
    memory.isError ||
    memoryHistory.isError ||
    (workspaceSeriesSupported && (writes.isError || recalls.isError));
  const sourcesLoaded =
    !memory.isLoading &&
    !memoryHistory.isLoading &&
    (!workspaceSeriesSupported || (!writes.isLoading && !recalls.isLoading));

  type ActivitySemantic = "live" | "window_empty" | "no_history" | "stale_or_error" | "loading";
  const activitySemantic: ActivitySemantic = sourceError
    ? "stale_or_error"
    : !sourcesLoaded
      ? "loading"
      : workspaceSeriesSupported && hasWindowedData
        ? "live"
        : hasScopedWindowMemory
          ? "live"
          : hasScopedMemoryHistory
            ? "window_empty"
            : "no_history";

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
    if (activitySemantic === "stale_or_error") return "error";
    if (!sourcesLoaded) return "blocked";
    if (activitySemantic === "live") return "live";
    return "empty";
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
        hint={`window=${filters.window}, workspace=${filters.workspace}. Inventory and consolidation counts come from the filtered /api/memory-stats response. Activity timing is shown only for workspace=all because /api/time-series cannot partition by workspace. Tier backend health is a current global operational snapshot.`}
        right={
          <div style={{ display: "flex", gap: 10, fontSize: 11, color: NOC.muted, alignItems: "center" }}>
            <Legend color={NOC.terra} label="Writes" />
            <Legend color={NOC.ink} label="Recall" />
            <SourceStatusBadge status={windowedStatus} label={`series ${windowedStatus}`} />
            <span
              data-filters={`window=${filters.window}&workspace=${filters.workspace}`}
              style={{ fontSize: 10, color: NOC.soft, fontFamily: NOC_FONT_MONO }}
            >
              window={filters.window}/workspace={filters.workspace}
            </span>
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
          /api/memory-stats{workspaceSeriesSupported ? " or /api/time-series" : ""} failed: {memory.error?.message ?? memoryHistory.error?.message ?? (workspaceSeriesSupported ? writes.error?.message ?? recalls.error?.message : null) ?? "see network log"}
        </div>
      )}
      {workspaceSeriesSupported && hasWindowedData ? (
        <div style={{ overflowX: "auto", maxWidth: "100%" }}>
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
        </div>
      ) : (
        <div
          style={{
            minHeight: 150,
            border: `1px dashed ${sourceError ? NOC.warn : NOC.rule}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: sourceError ? NOC.warn : NOC.muted,
            fontFamily: NOC_FONT_MONO,
            fontSize: 11.5,
            padding: 12,
            textAlign: "center",
          }}
          data-status-block={activitySemantic}
          data-empty={true}
        >
          {sourceError
            ? "Memory activity is stale or unavailable; the filtered stats source may be down."
            : !sourcesLoaded
              ? "Loading memory activity…"
              : hasScopedWindowMemory
                ? workspaceSeriesSupported
                  ? `Memory is live for window=${filters.window}, workspace=${filters.workspace}; filtered inventory exists, but no activity timing buckets were returned.`
                  : `Memory is live for window=${filters.window}, workspace=${filters.workspace}. Timing is withheld because /api/time-series cannot partition by workspace; filtered inventory counts remain available below.`
                : activitySemantic === "window_empty"
                  ? `Nothing in ${nocWindowLabel(filters.window)} for workspace=${filters.workspace}; memory history exists outside this window. Widen the window?`
                  : `No memory activity history yet for workspace=${filters.workspace}. Messages and successful consolidation populate this panel. Try: run an agent exchange.`}
        </div>
      )}
      <div
        style={{
          marginTop: 10,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 10,
        }}
      >
        {[
          {
            label: "Tier rows",
            sublabel: `selected window/workspace count (not cumulative) · ${filters.window}/${filters.workspace}`,
            value: compact(totalTierCount),
            status: tierStatus,
            color: tierStatus === "error" ? NOC.terra : NOC.ink,
          },
          {
            label: "High/pinned",
            sublabel: `filtered tier snapshot · ${filters.window}/${filters.workspace}`,
            value: compact(highTier),
            status: tierStatus,
            color: tierStatus === "error" ? NOC.terra : NOC.success,
          },
          {
            label: "Low tier",
            sublabel: `filtered tier snapshot · ${filters.window}/${filters.workspace}`,
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
      <div
        data-testid="memory-tier-health"
        data-scope="global-backend-health"
        style={{
          borderTop: `1px solid ${NOC.rule}`,
          marginTop: 14,
          paddingTop: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Eyebrow>Tier health</Eyebrow>
          <SourceStatusBadge
            status={
              health.isError
                ? "error"
                : health.isLoading
                  ? "blocked"
                  : (health.data?.tiers.length ?? 0) > 0
                    ? health.data?.tiers.some((tier) => tier.status === "down")
                      ? "error"
                      : health.data?.tiers.some((tier) => tier.status === "degraded")
                        ? "degraded"
                        : "live"
                    : "empty"
            }
          />
        </div>
        {health.isError ? (
          <div
            data-status-block="stale_or_error"
            style={{ color: NOC.warn, fontSize: 11.5, marginTop: 8 }}
          >
            Memory tier health is stale or unavailable; the health source may be down.
          </div>
        ) : health.isLoading ? (
          <div style={{ color: NOC.soft, fontSize: 11.5, marginTop: 8 }}>
            Loading memory tier health…
          </div>
        ) : (health.data?.tiers.length ?? 0) === 0 ? (
          <div
            data-status-block="no_history"
            style={{ color: NOC.soft, fontSize: 11.5, marginTop: 8 }}
          >
            No memory tier health history yet. Configure a memory backend to populate this current snapshot.
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))",
              gap: 8,
              marginTop: 8,
            }}
          >
            {health.data?.tiers.map((tier) => {
              const status: SubStatus =
                tier.status === "up"
                  ? "live"
                  : tier.status === "degraded"
                    ? "degraded"
                    : tier.status === "down"
                      ? "error"
                      : "unavailable";
              return (
                <div
                  key={tier.tier}
                  data-memory-tier={tier.tier}
                  style={{ background: NOC.fog, border: `1px solid ${NOC.rule}`, padding: 9 }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                    <span style={{ color: NOC.ink, fontSize: 12, textTransform: "capitalize" }}>{tier.tier}</span>
                    <SourceStatusBadge status={status} label={tier.status.replace("_", " ")} />
                  </div>
                  <div style={{ color: NOC.soft, fontFamily: NOC_FONT_MONO, fontSize: 10.5, marginTop: 5 }}>
                    {tier.backend}{tier.count != null && filters.workspace === "all" ? ` · ${tier.count} rows` : ""}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div style={{ color: NOC.soft, fontFamily: NOC_FONT_MONO, fontSize: 10, marginTop: 8 }}>
          source: /api/memory/health · global backend liveness; window and workspace filters do not alter this operational check.
        </div>
      </div>
    </NocCard>
  );
}
