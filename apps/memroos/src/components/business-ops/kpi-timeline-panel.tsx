"use client";

import { useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { useEvalHistory } from "@/lib/api-client";
import type { EvalRunResult } from "@/lib/evals/types";
import { NOC, NOC_FONT_MONO } from "@/lib/noc-theme";
import {
  metricEnvelope,
  describeMetricEnvelope,
  type MetricEnvelope,
} from "@/lib/metric-status";

interface KpiTimelinePanelProps {
  agentId?: string;
  dateRange?: { since: string; until?: string };
}

interface TimelinePoint {
  date: string;
  runId: string;
  traceId: string;
  compositeW: number;
  l1: number;
  l2: number;
  l3: number | null;
  l3Unavailable: boolean;
}

function runToPoint(run: EvalRunResult & { examples?: unknown[] }): TimelinePoint {
  const l3Scorers = run.layers.l3?.scorers ?? [];
  const allL3Unavailable =
    l3Scorers.length > 0 && l3Scorers.every((s) => s.metadata?.unavailable === true);

  return {
    date: new Date(run.completedAt).toLocaleDateString(),
    runId: run.id,
    traceId: run.traceId,
    compositeW: run.compositeW,
    l1: run.layers.l1?.score ?? 0,
    l2: run.layers.l2?.score ?? 0,
    l3: allL3Unavailable ? null : (run.layers.l3?.score ?? null),
    l3Unavailable: allL3Unavailable,
  };
}

type TimelineEnvelope = MetricEnvelope<number>;

function historyEnvelope(
  data: { runs?: (EvalRunResult & { examples?: unknown[] })[]; timestamp?: string } | undefined,
  error: unknown,
  isLoading: boolean,
  filteredRuns: (EvalRunResult & { examples?: unknown[] })[] | undefined
): TimelineEnvelope {
  const source = "/api/evals/history?limit=200";
  if (error) {
    return metricEnvelope<number>({
      value: null,
      status: "error",
      source,
      observedAt: null,
      freshnessMs: null,
      scope: { window: "history", workspace: "all" },
      reason: error instanceof Error ? error.message : `Failed to load ${source}`,
    });
  }
  if (isLoading || !data) {
    return metricEnvelope<number>({
      value: null,
      status: "blocked",
      source,
      observedAt: null,
      freshnessMs: null,
      scope: { window: "history", workspace: "all" },
      reason: `Loading ${source}`,
    });
  }
  const runs = filteredRuns ?? data?.runs ?? [];
  if (runs.length === 0) {
    return metricEnvelope<number>({
      value: null,
      status: "empty",
      source,
      observedAt: data?.timestamp ?? null,
      freshnessMs: null,
      scope: { window: "history", workspace: "all" },
      reason: `Healthy ${source} returned no eval runs matching the current filters`,
    });
  }
  return metricEnvelope<number>({
    value: runs.length,
    status: "live",
    source,
    observedAt: data?.timestamp ?? null,
    freshnessMs: null,
    scope: { window: "history", workspace: "all" },
    reason: `${runs.length} eval runs from ${source}`,
  });
}

function l3Envelope(filteredRuns: (EvalRunResult & { examples?: unknown[] })[] | undefined): TimelineEnvelope {
  const source = "/api/evals/history?layer=l3";
  const runs = filteredRuns ?? [];
  const l3Scorers = runs
    .flatMap((r) => r.layers.l3?.scorers ?? [])
    .filter((s) => s && (s.metadata as { unavailable?: boolean } | undefined)?.unavailable !== true);
  if (runs.length === 0) {
    return metricEnvelope<number>({
      value: null,
      status: "empty",
      source,
      observedAt: null,
      freshnessMs: null,
      scope: { window: "history", workspace: "all" },
      reason: `No eval runs available; L3 cannot be measured`,
    });
  }
  if (l3Scorers.length === 0) {
    return metricEnvelope<number>({
      value: null,
      status: "unavailable",
      source,
      observedAt: null,
      freshnessMs: null,
      scope: { window: "history", workspace: "all" },
      reason: `All ${runs.length} eval runs have L3 scorers marked unavailable; L3 score is N/A, never zero`,
    });
  }
  return metricEnvelope<number>({
    value: l3Scorers.length,
    status: "live",
    source,
    observedAt: null,
    freshnessMs: null,
    scope: { window: "history", workspace: "all" },
    reason: `${l3Scorers.length} available L3 scorers across ${runs.length} eval runs`,
  });
}

function wEnvelope(filteredRuns: (EvalRunResult & { examples?: unknown[] })[] | undefined): TimelineEnvelope {
  const source = "/api/evals/history?layer=w";
  const runs = filteredRuns ?? [];
  if (runs.length === 0) {
    return metricEnvelope<number>({
      value: null,
      status: "empty",
      source,
      observedAt: null,
      freshnessMs: null,
      scope: { window: "history", workspace: "all" },
      reason: `No eval runs available; composite W is N/A, never zero`,
    });
  }
  return metricEnvelope<number>({
    value: runs[0]?.compositeW ?? 0,
    status: "live",
    source,
    observedAt: runs[0]?.completedAt ?? null,
    freshnessMs: null,
    scope: { window: "history", workspace: "all" },
    reason: `Latest composite W from ${runs.length} eval runs`,
  });
}

export function KpiTimelinePanel({ agentId, dateRange }: KpiTimelinePanelProps) {
  const [showL1, setShowL1] = useState(true);
  const [showL2, setShowL2] = useState(true);
  const [showL3, setShowL3] = useState(true);

  const { data, isLoading, error } = useEvalHistory(200);

  const points = useMemo<TimelinePoint[]>(() => {
    if (!data?.runs) return [];
    let runs = data.runs as (EvalRunResult & { examples?: unknown[] })[];

    if (agentId) {
      runs = runs.filter((r) => r.agentId === agentId);
    }
    if (dateRange?.since) {
      const since = new Date(dateRange.since).getTime();
      runs = runs.filter((r) => new Date(r.completedAt).getTime() >= since);
    }
    if (dateRange?.until) {
      const until = new Date(dateRange.until).getTime();
      runs = runs.filter((r) => new Date(r.completedAt).getTime() <= until);
    }

    return runs.map(runToPoint).reverse();
  }, [data, agentId, dateRange]);

  const historyEnv = historyEnvelope(data, error, isLoading, data?.runs as (EvalRunResult & { examples?: unknown[] })[] | undefined);
  const filteredRuns = useMemo<(EvalRunResult & { examples?: unknown[] })[] | undefined>(() => {
    if (!data?.runs) return undefined;
    let runs = data.runs as (EvalRunResult & { examples?: unknown[] })[];
    if (agentId) runs = runs.filter((r) => r.agentId === agentId);
    if (dateRange?.since) {
      const since = new Date(dateRange.since).getTime();
      runs = runs.filter((r) => new Date(r.completedAt).getTime() >= since);
    }
    if (dateRange?.until) {
      const until = new Date(dateRange.until).getTime();
      runs = runs.filter((r) => new Date(r.completedAt).getTime() <= until);
    }
    return runs;
  }, [data, agentId, dateRange]);

  const l3Env = l3Envelope(filteredRuns);
  const wEnv = wEnvelope(filteredRuns);

  if (isLoading) {
    return (
      <div
        className="flex h-64 items-center justify-center text-sm"
        style={{ color: NOC.soft }}
        data-kpi-timeline-loading
      >
        Loading timeline...
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="flex h-64 flex-col items-center justify-center gap-2 text-sm"
        style={{ color: NOC.terra }}
        data-kpi-timeline-error
      >
        <div>Failed to load timeline data.</div>
        <div className="max-w-xl text-center text-xs" style={{ color: NOC.soft }}>
          Source: /api/evals/history. Detail: {error instanceof Error ? error.message : "unknown error"}.
        </div>
      </div>
    );
  }

  if (points.length === 0) {
    return (
      <div
        className="flex h-64 flex-col items-center justify-center gap-2 text-sm"
        style={{ color: NOC.soft }}
        data-kpi-timeline-empty
      >
        <div data-kpi-timeline-empty-message>
          No eval runs found
          {agentId ? ` for agent ${agentId}` : ""}
          {dateRange?.since ? ` since ${dateRange.since.slice(0, 10)}` : ""}.
        </div>
        <div
          className="max-w-xl text-center text-[10px]"
          style={{ color: NOC.terra, fontFamily: NOC_FONT_MONO }}
          data-kpi-timeline-empty-reason
        >
          {historyEnv.reason ?? "Healthy /api/evals/history returned no runs matching the current filter selection."}
        </div>
      </div>
    );
  }

  return (
    <div
      className="rounded-sm border p-4"
      style={{ borderColor: NOC.ruleStrong, background: NOC.paper }}
      data-kpi-timeline-scope={`agentId=${agentId ?? "all"}, since=${dateRange?.since?.slice(0, 10) ?? "all"}`}
    >
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold" style={{ color: NOC.ink }}>W Score Timeline</h3>
          <p
            className="mt-1 text-[10px]"
            style={{ color: NOC.soft, fontFamily: NOC_FONT_MONO }}
            data-kpi-timeline-source
          >
            source: {historyEnv.source}; L3 scorers: {describeMetricEnvelope(l3Env).label}
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <label className="flex items-center gap-1 cursor-pointer">
            <input
              type="checkbox"
              checked={showL1}
              onChange={(e) => setShowL1(e.target.checked)}
              className="h-3 w-3"
              data-kpi-layer-toggle="l1"
            />
            <span style={{ color: NOC.soft }}>L1</span>
          </label>
          <label className="flex items-center gap-1 cursor-pointer">
            <input
              type="checkbox"
              checked={showL2}
              onChange={(e) => setShowL2(e.target.checked)}
              className="h-3 w-3"
              data-kpi-layer-toggle="l2"
            />
            <span style={{ color: NOC.soft }}>L2</span>
          </label>
          <label className="flex items-center gap-1 cursor-pointer">
            <input
              type="checkbox"
              checked={showL3}
              onChange={(e) => setShowL3(e.target.checked)}
              className="h-3 w-3"
              data-kpi-layer-toggle="l3"
            />
            <span style={{ color: NOC.soft }}>L3</span>
          </label>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={points} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={NOC.rule} />
          <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke={NOC.ruleStrong} />
          <YAxis domain={[0, 1]} tick={{ fontSize: 10 }} stroke={NOC.ruleStrong} />
          <Tooltip
            formatter={(value, name) => {
              const num = typeof value === "number" ? value.toFixed(4) : "—";
              return [num, String(name)];
            }}
            contentStyle={{ fontSize: 11, border: `1px solid ${NOC.ruleStrong}` }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Line type="monotone" dataKey="compositeW" stroke={NOC.terra} strokeWidth={2} dot={false} name="W" />
          {showL1 && <Line type="monotone" dataKey="l1" stroke={NOC.info} strokeWidth={1.5} dot={false} name="L1" />}
          {showL2 && <Line type="monotone" dataKey="l2" stroke={NOC.soft} strokeWidth={1.5} dot={false} name="L2" />}
          {showL3 && l3Env.status !== "unavailable" && (
            <Line type="monotone" dataKey="l3" stroke={NOC.success} strokeWidth={1.5} dot={false} name="L3" connectNulls={false} />
          )}
          {showL3 && l3Env.status === "unavailable" && (
            <Line
              type="monotone"
              dataKey={() => null}
              stroke={NOC.success}
              strokeWidth={1.5}
              dot={false}
              name="L3 (N/A — unavailable)"
              connectNulls={false}
              legendType="plainline"
            />
          )}
        </LineChart>
      </ResponsiveContainer>
      <div
        className="mt-2 flex flex-wrap items-center gap-2 text-[10px]"
        style={{ color: NOC.soft, fontFamily: NOC_FONT_MONO }}
        data-kpi-timeline-summary
      >
        <span
          className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
          style={{
            background: historyEnv.status === "live" ? "rgba(16,185,129,0.12)" :
              historyEnv.status === "empty" ? "rgba(148,163,184,0.15)" :
              historyEnv.status === "error" ? "rgba(244,63,94,0.12)" : "rgba(245,158,11,0.12)",
            color: historyEnv.status === "live" ? "#10b981" :
              historyEnv.status === "empty" ? "#64748b" :
              historyEnv.status === "error" ? "#f43f5e" : "#f59e0b",
          }}
          data-kpi-timeline-runs-status={historyEnv.status}
        >
          runs: {describeMetricEnvelope(historyEnv).label} ({points.length})
        </span>
        <span
          className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
          style={{
            background: l3Env.status === "live" ? "rgba(16,185,129,0.12)" :
              l3Env.status === "unavailable" ? "rgba(245,158,11,0.12)" :
              l3Env.status === "empty" ? "rgba(148,163,184,0.15)" :
              l3Env.status === "error" ? "rgba(244,63,94,0.12)" : "rgba(245,158,11,0.12)",
            color: l3Env.status === "live" ? "#10b981" :
              l3Env.status === "unavailable" ? "#f59e0b" :
              l3Env.status === "empty" ? "#64748b" :
              l3Env.status === "error" ? "#f43f5e" : "#f59e0b",
          }}
          data-kpi-timeline-l3-status={l3Env.status}
        >
          l3: {describeMetricEnvelope(l3Env).label}
        </span>
        <span data-kpi-timeline-w-status={wEnv.status}>
          w: {describeMetricEnvelope(wEnv).label}
        </span>
        {historyEnv.reason && (
          <span className="text-rose-400" data-kpi-timeline-reason>{historyEnv.reason}</span>
        )}
        {l3Env.reason && l3Env.status !== "live" && (
          <span className="text-amber-400" data-kpi-timeline-l3-reason>{l3Env.reason}</span>
        )}
      </div>
      <p className="mt-2 text-[10px]" style={{ color: NOC.soft, fontFamily: NOC_FONT_MONO }}>
        {points.length} run{points.length !== 1 ? "s" : ""} shown.
        L3 gaps indicate no business-outcome events yet for those traces; L3 is rendered as N/A when scorers are unavailable (never zero).
        Click a data point to view the eval run.
      </p>
    </div>
  );
}
