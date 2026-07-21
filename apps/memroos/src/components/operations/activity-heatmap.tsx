"use client";

import { Heatmap } from "@/components/shared/charts";
import { useOperationsNoc, useTimeSeries } from "@/lib/api-client";
import type { MetricStatus } from "@/lib/metric-status";
import {
  nocWindowLabel,
  nocWindowToTimeSeriesWindow,
  type NocFilters,
} from "@/lib/noc-filters";
import { NOC, NOC_FONT_MONO } from "@/lib/noc-theme";
import {
  NocCard,
  NocPanelHeader,
  SourceStatusBadge,
} from "./noc-primitives";

interface TimedActivity {
  timestamp: string;
  value: number;
}

function buildHeatmap(activity: TimedActivity[]): {
  data: number[][];
  max: number;
  total: number;
} {
  const grid = Array.from({ length: 7 }, () =>
    Array.from({ length: 24 }, () => 0),
  );

  for (const item of activity) {
    const date = new Date(item.timestamp);
    if (!Number.isFinite(date.getTime())) continue;
    grid[date.getUTCDay()][date.getUTCHours()] += Math.max(0, item.value);
  }

  const max = Math.max(0, ...grid.flat());
  return {
    data: grid.map((row) =>
      row.map((value) => (max ? Math.max(0.08, value / max) : 0)),
    ),
    max,
    total: grid.flat().reduce((sum, value) => sum + value, 0),
  };
}

function memoryTiming(
  points: Array<{ bucket: string; value: number }>,
  window: NocFilters["window"],
): TimedActivity[] {
  const now = new Date();
  return points.flatMap((point) => {
    if (point.value <= 0) return [];

    if (window === "24h" && /^\d{2}:00$/.test(point.bucket)) {
      const hour = Number(point.bucket.slice(0, 2));
      const date = new Date(now);
      date.setUTCMinutes(0, 0, 0);
      date.setUTCHours(hour);
      if (date.getTime() > now.getTime()) {
        date.setUTCDate(date.getUTCDate() - 1);
      }
      return [{ timestamp: date.toISOString(), value: point.value }];
    }

    const date = new Date(`${point.bucket}T12:00:00.000Z`);
    return Number.isFinite(date.getTime())
      ? [{ timestamp: date.toISOString(), value: point.value }]
      : [];
  });
}

export function ActivityHeatmap({ filters }: { filters?: NocFilters }) {
  const effectiveFilters = filters ?? { window: "24h", workspace: "all" };
  const noc = useOperationsNoc(effectiveFilters);
  const writes = useTimeSeries(
    "memory_writes",
    nocWindowToTimeSeriesWindow(effectiveFilters.window),
  );
  const activity = noc.data?.agentActivity;
  const agents = activity?.agents ?? [];
  // Memory-consolidation runs have no workspace key. Do not mix their global
  // timing into a selected local/remote workspace heatmap.
  const writePoints = effectiveFilters.workspace === "all" ? writes.data?.points ?? [] : [];
  const messageActivity = agents.map((agent) => ({
    timestamp: agent.lastMessageAt,
    value: agent.messageCount,
  }));
  const memoryActivity = memoryTiming(writePoints, effectiveFilters.window);
  const observations = [...messageActivity, ...memoryActivity];
  const heat = buildHeatmap(observations);
  const messageCount = agents.reduce(
    (total, agent) => total + agent.messageCount,
    0,
  );
  const writeCount = writePoints.reduce(
    (total, point) => total + point.value,
    0,
  );
  const sourceState =
    activity?.sourceState ?? noc.data?.sourceStates?.agentActivity;
  const sourceFailed = noc.isError || sourceState === "stale_or_error" || (effectiveFilters.workspace === "all" && writes.isError);
  const isLoading = noc.isLoading || (effectiveFilters.workspace === "all" && writes.isLoading);
  const status: MetricStatus = sourceFailed
    ? "error"
    : isLoading
      ? "blocked"
      : heat.total > 0
        ? "live"
        : "empty";

  const emptyCopy = sourceFailed
    ? "Activity timing is stale or unavailable; messages or memory-write timing may be down."
    : sourceState === "window_empty"
      ? `Nothing in ${nocWindowLabel(effectiveFilters.window)} for workspace=${effectiveFilters.workspace}; message history exists outside this window. Widen the window?`
      : `No activity history yet for workspace=${effectiveFilters.workspace}. Agent messages and successful memory consolidation populate this view.`;

  return (
    <NocCard>
      <NocPanelHeader
        title={`Activity timing · ${nocWindowLabel(effectiveFilters.window)}`}
        hint={effectiveFilters.workspace === "all" ? `Message and memory-write activity honors window=${effectiveFilters.window}, workspace=all. Cells show weekday/hour concentration, not fabricated session capture.` : `Message activity honors window=${effectiveFilters.window}, workspace=${effectiveFilters.workspace}. Memory-write timing is withheld because consolidation runs are not workspace-partitioned.`}
        right={<SourceStatusBadge status={status} />}
      />
      {status === "live" ? (
        <>
          <div
            data-heatmap-scroll="horizontal"
            style={{ overflowX: "auto", maxWidth: "100%" }}
          >
            <div style={{ minWidth: 290 }}>
              <Heatmap w={290} h={104} data={heat.data} />
              <div
                style={{
                  color: NOC.soft,
                  display: "flex",
                  fontSize: 10,
                  justifyContent: "space-between",
                  marginTop: 4,
                }}
              >
                <span>00</span>
                <span>06</span>
                <span>12</span>
                <span>18</span>
                <span>24</span>
              </div>
            </div>
          </div>
          <div
            style={{
              borderTop: `1px solid ${NOC.rule}`,
              color: NOC.muted,
              fontFamily: NOC_FONT_MONO,
              fontSize: 11,
              lineHeight: 1.5,
              marginTop: 12,
              paddingTop: 10,
            }}
          >
            {messageCount} message{messageCount === 1 ? "" : "s"}{effectiveFilters.workspace === "all" ? ` · ${writeCount} memory write${writeCount === 1 ? "" : "s"}` : ""} in the selected window
          </div>
        </>
      ) : (
        <div
          data-status-block={isLoading ? "loading" : sourceFailed ? "stale_or_error" : sourceState ?? "no_history"}
          style={{
            background: sourceFailed ? NOC.warnBg : NOC.fog,
            border: `1px solid ${sourceFailed ? NOC.warn : NOC.rule}`,
            color: sourceFailed ? NOC.warn : NOC.soft,
            fontFamily: NOC_FONT_MONO,
            fontSize: 11.5,
            lineHeight: 1.5,
            padding: "12px 10px",
          }}
        >
          {isLoading ? "Loading activity timing…" : emptyCopy}
        </div>
      )}
    </NocCard>
  );
}
