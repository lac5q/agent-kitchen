"use client";

import { useAuditLog } from "@/lib/api-client";

// ── color map ─────────────────────────────────────────────────────────────────

const SEVERITY_COLORS: Record<
  string,
  { text: string; bg: string; border: string }
> = {
  info: {
    text: "text-slate-300",
    bg: "bg-slate-500/15",
    border: "border-slate-500/30",
  },
  medium: {
    text: "text-amber-300",
    bg: "bg-amber-500/15",
    border: "border-amber-500/30",
  },
  high: {
    text: "text-rose-300",
    bg: "bg-rose-500/15",
    border: "border-rose-500/30",
  },
};

const DEFAULT_COLOR = {
  text: "text-slate-300",
  bg: "bg-slate-500/15",
  border: "border-slate-500/30",
};

// ── helpers ───────────────────────────────────────────────────────────────────

function formatRelativeTime(iso: string): string {
  try {
    const diffMs = Date.now() - new Date(iso).getTime();
    if (isNaN(diffMs)) return iso.slice(0, 16);
    const diffSec = Math.floor(diffMs / 1_000);
    const diffMin = Math.floor(diffMs / 60_000);
    const diffHr = Math.floor(diffMs / 3_600_000);
    const diffDay = Math.floor(diffMs / 86_400_000);
    if (diffSec < 60) return "just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHr < 24) return `${diffHr}h ago`;
    return `${diffDay}d ago`;
  } catch {
    return iso.slice(0, 16);
  }
}

// ── component ─────────────────────────────────────────────────────────────────

export function AuditLogPanel({ limit = 20 }: { limit?: number }) {
  const { data, isLoading } = useAuditLog(limit);

  const entries = data?.entries ?? [];

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
      {/* Section header */}
      <div className="mb-4 flex items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-amber-500">
          Audit Log
        </span>
        <div className="h-px flex-1 bg-amber-900/40" />
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center py-10">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && entries.length === 0 && (
        <p className="py-10 text-center text-sm text-slate-500">
          No audit events yet.
        </p>
      )}

      {/* Entry list */}
      {!isLoading && entries.length > 0 && (
        <ul className="space-y-2">
          {entries.map((entry) => {
            const color = SEVERITY_COLORS[entry.severity] ?? DEFAULT_COLOR;
            return (
              <li
                key={entry.id}
                className="flex items-start gap-3 rounded-md px-2 py-1.5 hover:bg-slate-800/40"
              >
                {/* Actor */}
                <span className="w-24 shrink-0 truncate text-xs font-medium text-slate-300">
                  {entry.actor}
                </span>

                {/* Action chip */}
                <span
                  className={`shrink-0 rounded border px-1.5 py-0.5 text-xs font-medium ${color.text} ${color.bg} ${color.border}`}
                >
                  {entry.action}
                </span>

                {/* Target */}
                <span className="min-w-0 flex-1 truncate text-xs text-slate-200">
                  {entry.target}
                </span>

                {/* Timestamp */}
                <span className="shrink-0 tabular-nums text-xs text-slate-500">
                  {formatRelativeTime(entry.timestamp)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
