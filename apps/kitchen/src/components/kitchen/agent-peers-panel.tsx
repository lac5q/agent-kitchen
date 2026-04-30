"use client";

import { useAgentPeers } from "@/lib/api-client";

// ── color map ─────────────────────────────────────────────────────────────────
// Reuse same ACTION_COLORS as HiveFeed (status values are action_types from hive_actions)

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

// ── tooltip ───────────────────────────────────────────────────────────────────

function InfoTooltip({ text }: { text: string }) {
  return (
    <div className="group relative inline-flex">
      <span className="cursor-help text-xs text-slate-500 hover:text-slate-300">ⓘ</span>
      <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 w-60 -translate-x-1/2 rounded-md border border-slate-700 bg-slate-800 px-2.5 py-2 text-xs leading-snug text-slate-300 opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100">
        {text}
        <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-slate-700" />
      </div>
    </div>
  );
}

// ── component ─────────────────────────────────────────────────────────────────

export function AgentPeersPanel({ windowMinutes = 60 }: { windowMinutes?: number }) {
  const { data, isLoading } = useAgentPeers(windowMinutes);

  const peers = data?.peers ?? [];

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
      {/* Section header */}
      <div className="mb-4 flex items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-amber-500">
          Agent Peers
        </span>
        <InfoTooltip text="Other Claude Code agents that have checked in via the hive coordination API in the last hour. Shows each agent's ID, current task, last known status, and when it was last seen." />
        <div className="h-px flex-1 bg-amber-900/40" />
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center py-10">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && peers.length === 0 && (
        <p className="py-10 text-center text-sm text-slate-500">
          No active peers in the last {windowMinutes} minutes.
        </p>
      )}

      {/* Peer list */}
      {!isLoading && peers.length > 0 && (
        <ul className="space-y-2">
          {peers.map((peer) => {
            const color = ACTION_COLORS[peer.status] ?? DEFAULT_COLOR;
            return (
              <li
                key={peer.agent_id}
                className="flex items-start gap-3 rounded-md px-2 py-1.5 hover:bg-slate-800/40"
              >
                {/* Agent ID */}
                <span className="w-24 shrink-0 truncate text-xs font-medium text-slate-300">
                  {peer.agent_id}
                </span>

                {/* Status chip */}
                <span
                  className={`shrink-0 rounded border px-1.5 py-0.5 text-xs font-medium ${color.text} ${color.bg} ${color.border}`}
                >
                  {peer.status}
                </span>

                {/* Current task */}
                <span className="min-w-0 flex-1 truncate text-xs text-slate-200">
                  {peer.current_task}
                </span>

                {/* Last seen */}
                <span className="shrink-0 tabular-nums text-xs text-slate-500">
                  {formatRelativeTime(peer.last_seen)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
