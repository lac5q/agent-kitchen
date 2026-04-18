"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { KpiCard } from "@/components/ledger/kpi-card";
import { useMemoryStats } from "@/lib/api-client";

// ── helpers ───────────────────────────────────────────────────────────────────

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr = Math.floor(diffMs / 3_600_000);
  if (diffHr >= 24) return new Date(iso).toISOString().slice(0, 10);
  if (diffHr >= 1) return `${diffHr} hr ago`;
  if (diffMin >= 1) return `${diffMin} min ago`;
  return "just now";
}

// ── button state type ─────────────────────────────────────────────────────────

type ButtonState = "idle" | "loading" | "success" | "error";

// ── component ─────────────────────────────────────────────────────────────────

export function MemoryIntelligencePanel() {
  const { data, isLoading } = useMemoryStats();
  const queryClient = useQueryClient();
  const [buttonState, setButtonState] = useState<ButtonState>("idle");

  async function handleRunNow() {
    if (buttonState === "loading") return;
    setButtonState("loading");
    try {
      const res = await fetch("/api/memory-consolidate", { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setButtonState("success");
      await queryClient.invalidateQueries({ queryKey: ["memory-stats"] });
      setTimeout(() => setButtonState("idle"), 2000);
    } catch {
      setButtonState("error");
    }
  }

  // ── derived values ──────────────────────────────────────────────────────────

  const dash = "—";
  const lastRun = data?.lastRun ?? null;
  const pendingUnconsolidated = data?.pendingUnconsolidated ?? 0;
  const tierStats = data?.tierStats ?? [];

  const pendingValue = isLoading ? dash : String(pendingUnconsolidated);

  const lastRunValue = isLoading
    ? dash
    : lastRun
    ? formatRelativeTime(lastRun.completed_at)
    : dash;

  const insightsValue = isLoading
    ? dash
    : lastRun
    ? String(lastRun.insights_written)
    : dash;

  const statusValue = isLoading ? dash : lastRun ? lastRun.status : dash;

  const statusColor =
    lastRun?.status === "completed"
      ? "text-emerald-400"
      : lastRun?.status === "failed"
      ? "text-rose-400"
      : lastRun?.status === "running"
      ? "text-sky-400"
      : "text-slate-400";

  // ── button classes ──────────────────────────────────────────────────────────

  const buttonBase =
    "px-3 py-2 rounded-lg text-xs font-medium border transition-colors";
  const buttonClasses: Record<ButtonState, string> = {
    idle: `${buttonBase} bg-slate-800/60 text-slate-400 border-slate-700/50 hover:text-slate-200`,
    loading: `${buttonBase} bg-slate-800/60 text-slate-400 border-slate-700/50 opacity-60 cursor-not-allowed`,
    success: `${buttonBase} border-emerald-500/30 text-emerald-400 bg-emerald-500/15`,
    error: `${buttonBase} border-red-500/30 text-red-400 bg-red-500/15`,
  };
  const buttonLabel: Record<ButtonState, string> = {
    idle: "Run Now",
    loading: "Running...",
    success: "Run Now",
    error: "Failed — click to retry",
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Section header */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-amber-500">
          Memory Intelligence
        </span>
        <div className="h-px flex-1 bg-amber-900/40" />
        <button
          className={buttonClasses[buttonState]}
          onClick={handleRunNow}
          disabled={buttonState === "loading"}
        >
          {buttonLabel[buttonState]}
        </button>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center py-10">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
        </div>
      )}

      {/* KPI grid */}
      {!isLoading && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <KpiCard
              label="Pending"
              value={pendingValue}
              valueColor="text-sky-400"
              subtitle="unconsolidated memories"
            />
            <KpiCard
              label="Last Run"
              value={lastRunValue}
              valueColor="text-amber-400"
            />
            <KpiCard
              label="Insights"
              value={insightsValue}
              valueColor="text-emerald-400"
              subtitle={lastRun ? `from ${lastRun.batch_size} batch` : undefined}
            />
            <KpiCard
              label="Run Status"
              value={statusValue}
              valueColor={statusColor}
            />
          </div>

          {/* Tier stats */}
          {tierStats.length > 0 && (
            <div className="rounded-lg border border-slate-800 bg-slate-900/30 p-3">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                Memory Tiers
              </p>
              <div className="flex flex-wrap gap-3">
                {tierStats.map((tier) => (
                  <div
                    key={tier.tier}
                    className="flex items-center gap-2 rounded-md border border-slate-700/50 bg-slate-800/40 px-3 py-1.5"
                  >
                    <span className="text-xs font-medium text-slate-300">
                      {tier.tier}
                    </span>
                    <span className="text-xs text-slate-500">
                      {tier.count} ·{" "}
                      <span className="text-slate-400">
                        {Math.round(tier.avg_score * 100)}%
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
