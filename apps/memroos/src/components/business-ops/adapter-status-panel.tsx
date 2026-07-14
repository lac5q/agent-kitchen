"use client";

import type { BusinessOutcomeEventRow } from "@/lib/api-client";
import { useBusinessOutcomeEvents } from "@/lib/api-client";
import { NOC } from "@/lib/noc-theme";

const KNOWN_ADAPTERS = [
  { name: "hubspot", category: "CRM", live: true },
  { name: "intercom", category: "Helpdesk", live: true },
  { name: "quickbooks", category: "Finance", live: true },
  { name: "salesforce", category: "CRM", live: false },
  { name: "zendesk", category: "Helpdesk", live: false },
  { name: "netsuite", category: "Finance", live: false },
] as const;

export function AdapterStatusPanel({ dateRange }: { dateRange?: { since: string; until?: string } }) {
  const { data, isLoading, error } = useBusinessOutcomeEvents({
    since: dateRange?.since,
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

  return (
    <div className="rounded-sm border p-4" style={{ borderColor: NOC.ruleStrong, background: NOC.paper }}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold" style={{ color: NOC.ink }}>Adapter Status</h3>
        <span className="text-[11px]" style={{ color: NOC.soft }}>
          {dateRange?.since ? `Since ${new Date(dateRange.since).toLocaleDateString()}` : "All available events"}
        </span>
      </div>
      {isLoading ? (
        <p className="text-xs" style={{ color: NOC.soft }}>Loading...</p>
      ) : error ? (
        <p className="text-xs" style={{ color: NOC.terra }}>
          Failed to load adapter status from /api/l3/events: {error instanceof Error ? error.message : "unknown error"}.
        </p>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b text-left" style={{ borderColor: NOC.rule, color: NOC.soft }}>
              <th className="pb-1.5 font-medium">Adapter</th>
              <th className="pb-1.5 font-medium">Category</th>
              <th className="pb-1.5 font-medium">Mode</th>
              <th className="pb-1.5 font-medium text-right">Events</th>
              <th className="pb-1.5 font-medium text-right">Last Polled</th>
            </tr>
          </thead>
          <tbody>
            {KNOWN_ADAPTERS.map((adapter) => {
              const stats = eventsByAdapter[adapter.name];
              return (
                <tr key={adapter.name} className="border-b" style={{ borderColor: NOC.fog }}>
                  <td className="py-1.5 font-medium" style={{ color: NOC.ink }}>{adapter.name}</td>
                  <td className="py-1.5" style={{ color: NOC.muted }}>{adapter.category}</td>
                  <td className="py-1.5">
                    <span
                      className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium"
                      style={{
                        background: adapter.live ? NOC.successBg : NOC.warnBg,
                        color: adapter.live ? NOC.success : NOC.warn,
                      }}
                    >
                      {adapter.live ? "live" : "not wired"}
                    </span>
                  </td>

                  <td className="py-1.5 text-right" style={{ color: NOC.muted }} data-adapter-events={adapter.name}>
                    {error
                      ? "—"
                      : isLoading
                        ? "—"
                        : stats
                          ? String(stats.count)
                          : "—"}
                  </td>                  <td className="py-1.5 text-right" style={{ color: NOC.soft }}>
                    {stats?.lastPolled
                      ? new Date(stats.lastPolled).toLocaleString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
