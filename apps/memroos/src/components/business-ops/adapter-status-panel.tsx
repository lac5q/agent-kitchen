"use client";

import { useState } from "react";
import type { BusinessOutcomeEventRow } from "@/lib/api-client";
import { useBusinessOutcomeEvents } from "@/lib/api-client";
import { NOC, NOC_FONT_MONO } from "@/lib/noc-theme";
import {
  metricEnvelope,
  type MetricEnvelope,
} from "@/lib/metric-status";

interface AdapterRow {
  name: string;
  category: string;
  live: boolean;
}

const KNOWN_ADAPTERS: AdapterRow[] = [
  { name: "hubspot", category: "CRM", live: true },
  { name: "intercom", category: "Helpdesk", live: true },
  { name: "quickbooks", category: "Finance", live: true },
  { name: "salesforce", category: "CRM", live: false },
  { name: "zendesk", category: "Helpdesk", live: false },
  { name: "netsuite", category: "Finance", live: false },
];

interface AdapterStatusPanelProps {
  agentId?: string;
  dateRange?: { since: string; until?: string };
}

function eventsEnvelope(
  data: { events?: BusinessOutcomeEventRow[]; timestamp?: string } | undefined,
  error: unknown,
  isLoading: boolean,
  agentId: string | undefined,
  since: string
): MetricEnvelope<number> {
  const source = agentId
    ? `/api/l3/events?agentId=${encodeURIComponent(agentId)}&since=${encodeURIComponent(since)}`
    : `/api/l3/events?since=${encodeURIComponent(since)}`;
  if (error) {
    return metricEnvelope<number>({
      value: null,
      status: "error",
      source,
      observedAt: null,
      freshnessMs: null,
      scope: { window: `since=${since.slice(0, 10)}`, workspace: "all" },
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
      scope: { window: `since=${since.slice(0, 10)}`, workspace: "all" },
      reason: `Loading ${source}`,
    });
  }
  const events = data?.events ?? [];
  if (events.length === 0) {
    return metricEnvelope<number>({
      value: null,
      status: "empty",
      source,
      observedAt: data?.timestamp ?? null,
      freshnessMs: null,
      scope: { window: `since=${since.slice(0, 10)}`, workspace: "all" },
      reason: `Healthy ${source} returned no business-outcome events in the selected window`,
    });
  }
  return metricEnvelope<number>({
    value: events.length,
    status: "live",
    source,
    observedAt: data?.timestamp ?? null,
    freshnessMs: null,
    scope: { window: `since=${since.slice(0, 10)}`, workspace: "all" },
    reason: `${events.length} business-outcome events from ${source}`,
  });
}

function statusBadge(status: MetricEnvelope<number>["status"]): { label: string; background: string; color: string } {
  if (status === "live") return { label: "live", background: "rgba(16,185,129,0.12)", color: "#10b981" };
  if (status === "zero") return { label: "measured zero", background: "rgba(16,185,129,0.12)", color: "#10b981" };
  if (status === "empty") return { label: "no events", background: "rgba(148,163,184,0.15)", color: "#64748b" };
  if (status === "blocked") return { label: "loading", background: "rgba(148,163,184,0.15)", color: "#64748b" };
  if (status === "error") return { label: "error", background: "rgba(244,63,94,0.12)", color: "#f43f5e" };
  return { label: status, background: "rgba(245,158,11,0.12)", color: "#f59e0b" };
}

export function AdapterStatusPanel({ agentId, dateRange }: AdapterStatusPanelProps) {
  // Date.now() is impure; useState initializer is the canonical pattern for
  // capturing a stable "now" once per render so the effect ref does not churn.
  const [defaultSinceIso] = useState(
    () => new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  );
  const since = dateRange?.since ?? defaultSinceIso;
  const { data, isLoading, error } = useBusinessOutcomeEvents({
    since,
    until: dateRange?.until,
    limit: 500,
  });

  const eventsByAdapter = (data?.events ?? []).reduce<Record<string, { count: number; lastPolled: string }>>((acc, event: BusinessOutcomeEventRow) => {
    const adapter = event.adapter;
    if (!acc[adapter]) {
      acc[adapter] = { count: 0, lastPolled: event.polledAt };
    }
    acc[adapter].count++;
    if (event.polledAt > acc[adapter].lastPolled) {
      acc[adapter].lastPolled = event.polledAt;
    }
    return acc;
  }, {});

  const eventsEnv = eventsEnvelope(data, error, isLoading, agentId, since);
  const eventsBadge = statusBadge(eventsEnv.status);

  return (
    <div
      className="rounded-sm border p-4"
      style={{ borderColor: NOC.ruleStrong, background: NOC.paper }}
      data-adapter-panel
      data-adapter-scope={`since=${since.slice(0, 10)}, agentId=${agentId ?? "all"}`}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold" style={{ color: NOC.ink }}>Adapter Status</h3>
          <p
            className="mt-1 text-[10px]"
            style={{ color: NOC.soft, fontFamily: NOC_FONT_MONO }}
            data-adapter-source
          >
            source: {eventsEnv.source}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="text-[11px]" style={{ color: NOC.soft }}>
            {since ? `Since ${new Date(since).toLocaleDateString()}` : "All available events"}
          </span>
          <span
            className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
            style={{ background: eventsBadge.background, color: eventsBadge.color }}
            data-adapter-events-status={eventsEnv.status}
          >
            events: {eventsBadge.label}
          </span>
        </div>
      </div>
      {isLoading ? (
        <p className="text-xs" style={{ color: NOC.soft }} data-adapter-loading>
          Loading...
        </p>
      ) : error ? (
        <p className="text-xs" style={{ color: NOC.terra }} data-adapter-error>
          Failed to load adapter status from /api/l3/events: {error instanceof Error ? error.message : "unknown error"}.
        </p>
      ) : (
        <table className="w-full text-xs" data-adapter-table>
          <thead>
            <tr className="border-b text-left" style={{ borderColor: NOC.rule, color: NOC.soft }}>
              <th className="pb-1.5 font-medium">Adapter</th>
              <th className="pb-1.5 font-medium">Category</th>
              <th className="pb-1.5 font-medium">Mode</th>
              <th className="pb-1.5 font-medium text-right">Events</th>
              <th className="pb-1.5 font-medium text-right">Last Polled</th>
              <th className="pb-1.5 font-medium text-right">State</th>
            </tr>
          </thead>
          <tbody>
            {KNOWN_ADAPTERS.map((adapter) => {
              const stats = eventsByAdapter[adapter.name];
              const adapterStatus: MetricEnvelope<number>["status"] = !adapter.live
                ? "blocked"
                : stats
                  ? "live"
                  : eventsEnv.status === "error"
                    ? "error"
                    : eventsEnv.status === "empty"
                      ? "empty"
                      : "empty";
              const adapterBadge = statusBadge(adapterStatus);
              return (
                <tr
                  key={adapter.name}
                  className="border-b"
                  style={{ borderColor: NOC.fog }}
                  data-adapter-row={adapter.name}
                  data-adapter-row-status={adapterStatus}
                >
                  <td className="py-1.5 font-medium" style={{ color: NOC.ink }}>{adapter.name}</td>
                  <td className="py-1.5" style={{ color: NOC.muted }}>{adapter.category}</td>
                  <td className="py-1.5">
                    <span
                      className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium"
                      style={{
                        background: adapter.live ? NOC.successBg : NOC.warnBg,
                        color: adapter.live ? NOC.success : NOC.warn,
                      }}
                      data-adapter-row-mode={adapter.live ? "live" : "not-wired"}
                    >
                      {adapter.live ? "live" : "not wired"}
                    </span>
                  </td>

                  <td
                    className="py-1.5 text-right"
                    style={{ color: NOC.muted, fontFamily: NOC_FONT_MONO }}
                    data-adapter-events={adapter.name}
                  >
                    {adapter.live
                      ? stats
                        ? String(stats.count)
                        : eventsEnv.status === "empty"
                          ? "0 (no events)"
                          : eventsEnv.status === "error"
                            ? "—"
                            : "—"
                      : "—"}
                  </td>
                  <td
                    className="py-1.5 text-right"
                    style={{ color: NOC.soft, fontFamily: NOC_FONT_MONO }}
                    data-adapter-last-polled={adapter.name}
                  >
                    {stats?.lastPolled
                      ? new Date(stats.lastPolled).toLocaleString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "—"}
                  </td>
                  <td className="py-1.5 text-right">
                    <span
                      className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                      style={{ background: adapterBadge.background, color: adapterBadge.color }}
                      data-adapter-row-state={adapterStatus}
                    >
                      {adapterBadge.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {eventsEnv.reason && eventsEnv.status !== "live" && eventsEnv.status !== "zero" && (
        <p
          className="mt-2 text-[10px]"
          style={{ color: NOC.terra, fontFamily: NOC_FONT_MONO }}
          data-adapter-reason
        >
          {eventsEnv.reason}
        </p>
      )}
    </div>
  );
}
