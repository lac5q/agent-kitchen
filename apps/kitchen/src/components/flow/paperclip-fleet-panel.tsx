"use client";

import { useState } from "react";
import type { PaperclipFleetResponse, PaperclipAutonomyMode } from "@/types";

export interface PaperclipFleetPanelProps {
  fleet: PaperclipFleetResponse | null;
  isLoading: boolean;
}

// Color map for autonomy mode badges (PAPER-03 vocabulary)
const AUTONOMY_COLORS: Record<PaperclipAutonomyMode, string> = {
  Interactive: "bg-sky-900 text-sky-300 border-sky-700",
  Autonomous:  "bg-emerald-900 text-emerald-300 border-emerald-700",
  Continuous:  "bg-violet-900 text-violet-300 border-violet-700",
  Hybrid:      "bg-amber-900 text-amber-300 border-amber-700",
};

// Status dot colors for agents
const STATUS_DOT: Record<string, string> = {
  active:  "bg-emerald-500",
  idle:    "bg-amber-500",
  dormant: "bg-slate-500",
  error:   "bg-rose-500",
};

function formatRelativeTime(isoString: string | null): string {
  if (!isoString) return "never";
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  return `${diffHr}h ago`;
}

function truncate(s: string, len = 16): string {
  return s.length > len ? s.slice(0, len) + "…" : s;
}

export function PaperclipFleetPanel({ fleet, isLoading }: PaperclipFleetPanelProps) {
  const [taskSummary, setTaskSummary] = useState("");
  const [dispatchStatus, setDispatchStatus] = useState<
    | { state: "idle" }
    | { state: "submitting" }
    | { state: "success"; taskId: string }
    | { state: "error"; message: string }
  >({ state: "idle" });

  async function handleDispatch(e: React.FormEvent) {
    e.preventDefault();
    if (!taskSummary.trim()) return;

    setDispatchStatus({ state: "submitting" });
    try {
      const res = await fetch("/api/paperclip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskSummary: taskSummary.trim(), requestedBy: "dashboard" }),
      });

      if (!res.ok) {
        let errorMessage = `Dispatch failed (${res.status})`;
        try {
          const body = await res.json();
          if (body?.error) errorMessage = body.error;
        } catch { /* ignore */ }
        setDispatchStatus({ state: "error", message: errorMessage });
        return;
      }

      const data = await res.json();
      setDispatchStatus({ state: "success", taskId: data.taskId });
      setTaskSummary("");
    } catch (err) {
      setDispatchStatus({
        state: "error",
        message: err instanceof Error ? err.message : "Network error",
      });
    }
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-600 border-t-amber-500" />
        <span className="ml-2 text-xs text-slate-500">Loading fleet...</span>
      </div>
    );
  }

  // Null / offline state
  if (!fleet) {
    return (
      <div className="py-4 text-center">
        <p className="text-xs text-slate-500">Fleet offline — Paperclip unreachable</p>
      </div>
    );
  }

  const { summary, agents, operations } = fleet;

  return (
    <div className="space-y-3">
      {/* ── Summary cards ── */}
      <div className="grid grid-cols-2 gap-1.5">
        <div className="rounded bg-slate-900 p-2 border border-slate-800">
          <p className="text-xs text-slate-500">Status</p>
          <p className={`text-sm font-bold ${summary.fleetStatus === "active" ? "text-emerald-400" : summary.fleetStatus === "degraded" ? "text-amber-400" : "text-slate-500"}`}>
            {summary.fleetStatus}
          </p>
        </div>
        <div className="rounded bg-slate-900 p-2 border border-slate-800">
          <p className="text-xs text-slate-500">Agents</p>
          <p className="text-sm font-bold text-slate-200">
            {summary.activeAgents}/{summary.totalAgents}
          </p>
        </div>
        <div className="rounded bg-slate-900 p-2 border border-slate-800">
          <p className="text-xs text-slate-500">Active Tasks</p>
          <p className="text-sm font-bold text-slate-200">{summary.activeTasks}</p>
        </div>
        <div className="rounded bg-slate-900 p-2 border border-slate-800">
          <p className="text-xs text-slate-500">Paused</p>
          <p className="text-sm font-bold text-slate-200">{summary.pausedRecoveries}</p>
        </div>
      </div>

      {/* ── Per-agent list (DASH-03) ── */}
      {agents.length > 0 && (
        <div>
          <p className="text-xs font-medium text-slate-500 mb-1.5">Agents</p>
          <div className="space-y-1.5">
            {agents.map(agent => (
              <div key={agent.id} className="flex items-start gap-2 rounded bg-slate-900 border border-slate-800 p-2">
                {/* Status dot */}
                <div className={`mt-1 h-2 w-2 flex-shrink-0 rounded-full ${STATUS_DOT[agent.status] ?? STATUS_DOT.dormant}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-semibold text-slate-200">{agent.name}</span>
                    {/* Autonomy badge (PAPER-03) */}
                    <span className={`inline-block rounded border px-1 py-0.5 text-[9px] font-semibold ${AUTONOMY_COLORS[agent.autonomyMode]}`}>
                      {agent.autonomyMode}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[10px] text-slate-400 truncate">
                    {agent.activeTask ?? "idle"}
                  </p>
                  <p className="text-[9px] text-slate-600">
                    {formatRelativeTime(agent.lastHeartbeat)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Recovery operations (PAPER-04) ── */}
      {operations.length > 0 && (
        <div>
          <p className="text-xs font-medium text-slate-500 mb-1.5">Recovery</p>
          <div className="space-y-1.5">
            {operations.map(op => (
              <div key={op.sessionId} className="rounded bg-slate-900 border border-slate-800 p-2 text-[10px]">
                <div className="flex items-center justify-between gap-1 mb-0.5">
                  <span className="font-mono text-slate-400">{truncate(op.sessionId, 14)}</span>
                  <span className={`rounded px-1 py-0.5 text-[9px] font-semibold border ${
                    op.status === "active"  ? "bg-emerald-900 text-emerald-300 border-emerald-700" :
                    op.status === "paused"  ? "bg-amber-900 text-amber-300 border-amber-700" :
                    op.status === "failed"  ? "bg-rose-900 text-rose-300 border-rose-700" :
                    "bg-slate-800 text-slate-400 border-slate-700"
                  }`}>
                    {op.status}
                  </span>
                </div>
                <p className="text-slate-500">
                  {op.completedSteps.length} step{op.completedSteps.length !== 1 ? "s" : ""} completed
                  {op.resumeFrom ? ` · resume: ${op.resumeFrom}` : ""}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Dispatch form (PAPER-02) ── */}
      <div>
        <p className="text-xs font-medium text-slate-500 mb-1.5">Dispatch Task</p>
        <form onSubmit={handleDispatch} className="space-y-2">
          <input
            type="text"
            value={taskSummary}
            onChange={e => {
              setTaskSummary(e.target.value);
              if (dispatchStatus.state !== "idle") setDispatchStatus({ state: "idle" });
            }}
            placeholder="Task summary to dispatch..."
            className="w-full rounded bg-slate-900 border border-slate-700 px-2 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:border-amber-600 focus:outline-none"
          />
          <button
            type="submit"
            disabled={dispatchStatus.state === "submitting" || !taskSummary.trim()}
            className="w-full rounded bg-amber-600 px-3 py-1.5 text-xs font-semibold text-slate-900 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            aria-label="Dispatch task"
          >
            {dispatchStatus.state === "submitting" ? "Dispatching…" : "Dispatch"}
          </button>
        </form>

        {/* Success feedback */}
        {dispatchStatus.state === "success" && (
          <p className="mt-1.5 text-[10px] text-emerald-400">
            Dispatched: {dispatchStatus.taskId}
          </p>
        )}

        {/* Error feedback */}
        {dispatchStatus.state === "error" && (
          <p className="mt-1.5 text-[10px] text-rose-400">
            Error: {dispatchStatus.message}
          </p>
        )}
      </div>
    </div>
  );
}
