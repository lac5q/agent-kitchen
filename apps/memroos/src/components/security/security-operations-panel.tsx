"use client";

import { useSecurityReport } from "@/lib/api-client";

const STATUS_STYLES = {
  clear: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  watch: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  attention: "border-rose-500/30 bg-rose-500/10 text-rose-300",
};

function formatRelativeTime(iso: string | null): string {
  if (!iso) return "no events";
  const diffMs = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diffMs)) return iso.slice(0, 16);
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr = Math.floor(diffMs / 3_600_000);
  const diffDay = Math.floor(diffMs / 86_400_000);
  if (diffMin < 1) return "just now";
  if (diffHr < 1) return `${diffMin}m ago`;
  if (diffDay < 1) return `${diffHr}h ago`;
  return `${diffDay}d ago`;
}

export function SecurityOperationsPanel() {
  const { data, isLoading } = useSecurityReport(8);
  const summary = data?.summary;
  const timeline = data?.timeline ?? [];
  const auditActivity = data?.auditActivity ?? [];
  const visibleEvents = timeline.length > 0 ? timeline : auditActivity;
  const showingSecurityEvents = timeline.length > 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
      </div>
    );
  }

  const status = summary?.status ?? "clear";
  const statusStyle = STATUS_STYLES[status];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-amber-500">
          Security Operations
        </span>
        <span className={`rounded border px-2 py-0.5 text-[10px] font-semibold uppercase ${statusStyle}`}>
          {status}
        </span>
        <div className="h-px flex-1 bg-amber-900/40" />
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <div className="border border-stone-200 bg-white p-3">
          <p className="text-xs text-stone-500">Security Events</p>
          <p className="mt-1 text-2xl font-semibold text-stone-950">{summary?.securityEvents ?? 0}</p>
        </div>
        <div className="border border-stone-200 bg-white p-3">
          <p className="text-xs text-stone-500">Blocked</p>
          <p className="mt-1 text-2xl font-semibold text-rose-300">{summary?.blockedAttempts ?? 0}</p>
        </div>
        <div className="border border-stone-200 bg-white p-3">
          <p className="text-xs text-stone-500">High Severity</p>
          <p className="mt-1 text-2xl font-semibold text-amber-300">{summary?.highSeverity ?? 0}</p>
        </div>
        <div className="border border-stone-200 bg-white p-3">
          <p className="text-xs text-stone-500">Last Event</p>
          <p className="mt-2 text-sm font-medium text-stone-700">
            {formatRelativeTime(summary?.lastEventAt ?? summary?.lastAuditAt ?? null)}
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <div className="border border-stone-200 bg-white p-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-stone-500">Controls</p>
          <div className="space-y-2">
            {(data?.controls ?? []).map((control) => (
              <div key={control.id} className="flex items-center justify-between gap-2 text-xs">
                <span className="text-stone-600">{control.label}</span>
                <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-emerald-300">
                  {control.status}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="border border-stone-200 bg-white p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-stone-500">
              {showingSecurityEvents ? "Recent Security Events" : "Recent Audit Activity"}
            </p>
            {!showingSecurityEvents && auditActivity.length > 0 && (
              <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-emerald-300">
                no security events
              </span>
            )}
          </div>
          {visibleEvents.length === 0 ? (
            <p className="py-5 text-center text-sm text-stone-500">No audit events yet.</p>
          ) : (
            <ul className="space-y-2">
              {visibleEvents.map((event) => (
                <li key={event.id} className="grid gap-1 border-b border-stone-200 pb-2 last:border-0 last:pb-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-medium text-stone-700">{event.actor}</span>
                    <span className="rounded border border-stone-300 bg-stone-100 px-1.5 py-0.5 text-stone-600">
                      {event.action}
                    </span>
                    <span className="text-stone-500">{formatRelativeTime(event.timestamp)}</span>
                  </div>
                  <p className="text-xs text-stone-500">{event.target}</p>
                  {event.detail && <p className="line-clamp-2 text-xs text-stone-500">{event.detail}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
