"use client";

import { useHiveFeed } from "@/lib/api-client";

// ── color map ─────────────────────────────────────────────────────────────────

const ACTION_COLORS: Record<
  string,
  { text: string; bg: string; border: string }
> = {
  continue: {
    text: "text-sky-300",
    bg: "bg-sky-500/15",
    border: "border-sky-500/30",
  },
  loop: {
    text: "text-violet-300",
    bg: "bg-violet-500/15",
    border: "border-violet-500/30",
  },
  checkpoint: {
    text: "text-emerald-300",
    bg: "bg-emerald-500/15",
    border: "border-emerald-500/30",
  },
  trigger: {
    text: "text-amber-300",
    bg: "bg-amber-500/15",
    border: "border-amber-500/30",
  },
  stop: {
    text: "text-slate-300",
    bg: "bg-slate-500/15",
    border: "border-slate-500/30",
  },
  error: {
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

export function HiveFeed({ limit = 20 }: { limit?: number }) {
  const { data, isLoading } = useHiveFeed(limit);

  const actions = data?.actions ?? [];

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
      {/* Section header */}
      <div className="mb-4 flex items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-amber-500">
          Hive Feed
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
      {!isLoading && actions.length === 0 && (
        <p className="py-10 text-center text-sm text-slate-500">
          No hive activity yet.
        </p>
      )}

      {/* Action list */}
      {!isLoading && actions.length > 0 && (
        <ul className="space-y-2">
          {actions.map((action) => {
            const color = ACTION_COLORS[action.action_type] ?? DEFAULT_COLOR;
            return (
              <li
                key={action.id}
                className="flex items-start gap-3 rounded-md px-2 py-1.5 hover:bg-slate-800/40"
              >
                {/* Agent ID */}
                <span className="w-24 shrink-0 truncate text-xs font-medium text-slate-300">
                  {action.agent_id}
                </span>

                {/* Action type chip */}
                <span
                  className={`shrink-0 rounded border px-1.5 py-0.5 text-xs font-medium ${color.text} ${color.bg} ${color.border}`}
                >
                  {action.action_type}
                </span>

                {/* Summary */}
                <span className="min-w-0 flex-1 truncate text-xs text-slate-200">
                  {action.summary}
                </span>

                {/* Timestamp */}
                <span className="shrink-0 tabular-nums text-xs text-slate-500">
                  {formatRelativeTime(action.timestamp)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
