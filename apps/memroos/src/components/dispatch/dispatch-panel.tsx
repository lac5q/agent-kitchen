"use client";

import { useState } from "react";
import { useAgents, useDelegations } from "@/lib/api-client";
import { LineageDrawer } from "./lineage-drawer";
import { PLATFORM_LABELS } from "@/lib/ui-constants";

const STATUS_COLORS: Record<string, string> = {
  pending: "text-stone-500 bg-stone-100",
  active: "text-emerald-400 bg-emerald-900/30",
  paused: "text-amber-400 bg-amber-900/30",
  completed: "text-sky-400 bg-sky-900/30",
  failed: "text-rose-400 bg-rose-900/30",
  canceled: "text-stone-500 bg-white",
};

export function DispatchPanel() {
  const { data: agentsData } = useAgents();
  const { data: delegationsData, isLoading, refetch: refetchDelegations } = useDelegations();
  const [toAgent, setToAgent] = useState("");
  const [taskSummary, setTaskSummary] = useState("");
  const [priority, setPriority] = useState("5");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const agents = agentsData?.agents ?? [];
  const delegations = delegationsData?.delegations ?? [];

  async function handleDispatch() {
    if (!toAgent || !taskSummary.trim()) return;
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to_agent: toAgent, task_summary: taskSummary, priority: Number(priority) }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Dispatch failed");
      } else {
        setTaskSummary("");
        setNotice(
          body.mode === "queued"
            ? "Queued in Hive. This agent must poll for pending delegations; no direct push happened."
            : "Dispatched successfully."
        );
        await refetchDelegations();
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-stone-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-amber-500 mb-4">Dispatch Task</h2>
        <div className="space-y-3">
          <div className="flex gap-3">
            <select
              value={toAgent}
              onChange={(e) => setToAgent(e.target.value)}
              className="flex-1 rounded-md border border-stone-300 bg-stone-100 px-3 py-2 text-sm text-stone-700 focus:outline-none focus:ring-1 focus:ring-amber-500"
            >
              <option value="">Select agent…</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.platform
                    ? `${PLATFORM_LABELS[a.platform as string] ?? a.platform} → ${a.name}`
                    : a.name}
                </option>
              ))}
            </select>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="w-24 rounded-md border border-stone-300 bg-stone-100 px-3 py-2 text-sm text-stone-700 focus:outline-none focus:ring-1 focus:ring-amber-500"
            >
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((p) => (
                <option key={p} value={p}>
                  P{p}
                </option>
              ))}
            </select>
          </div>
          <textarea
            value={taskSummary}
            onChange={(e) => {
              setTaskSummary(e.target.value);
              if (notice) setNotice(null);
            }}
            placeholder="Task summary…"
            rows={3}
            className="w-full rounded-md border border-stone-300 bg-stone-100 px-3 py-2 text-sm text-stone-700 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-amber-500 resize-none"
          />
          {error && <p className="text-xs text-rose-400">{error}</p>}
          {notice && <p className="text-xs text-amber-300">{notice}</p>}
          <button
            onClick={handleDispatch}
            disabled={!toAgent || !taskSummary.trim() || submitting}
            className="w-full rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? "Dispatching…" : "Dispatch"}
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-stone-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-amber-500 mb-4">Live Delegations</h2>
        {isLoading && <p className="text-stone-500 text-sm animate-pulse">Loading…</p>}
        {!isLoading && delegations.length === 0 && (
          <p className="text-stone-600 text-sm">No delegations yet.</p>
        )}
        <div className="space-y-2">
          {delegations.map((d) => (
            <div
              key={d.task_id}
              className="flex items-start justify-between gap-3 rounded-lg border border-stone-200 bg-white px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm text-stone-700 truncate">{d.task_summary}</p>
                <p className="text-xs text-stone-500 mt-0.5">
                  → <span className="text-stone-500">{d.to_agent}</span>
                  <span className="mx-1">·</span>P{d.priority}
                  <span className="mx-1">·</span>
                  {new Date(d.created_at).toLocaleTimeString()}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-mono ${
                    STATUS_COLORS[d.status] ?? "text-stone-500 bg-stone-100"
                  }`}
                >
                  {d.status}
                </span>
                <LineageDrawer taskId={d.task_id} taskSummary={d.task_summary} />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
