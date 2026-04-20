"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { KpiCard } from "@/components/ledger/kpi-card";
import { useRecallStats } from "@/lib/api-client";

// ── helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1_024) return `${(bytes / 1_024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr = Math.floor(diffMs / 3_600_000);
  if (diffHr >= 24) return new Date(iso).toISOString().slice(0, 10);
  if (diffHr >= 1) return `${diffHr} hr ago`;
  if (diffMin >= 1) return `${diffMin} min ago`;
  return "just now";
}

function formatNum(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
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

// ── button state type ─────────────────────────────────────────────────────────

type ButtonState = "idle" | "loading" | "success" | "error";

// ── component ─────────────────────────────────────────────────────────────────

export function SqliteHealthPanel() {
  const { data, isLoading, isError } = useRecallStats();
  const queryClient = useQueryClient();
  const [buttonState, setButtonState] = useState<ButtonState>("idle");

  async function handleIngest() {
    if (buttonState === "loading") return;
    setButtonState("loading");
    try {
      const res = await fetch("/api/recall/ingest", { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setButtonState("success");
      await queryClient.invalidateQueries({ queryKey: ["recall-stats"] });
      setTimeout(() => setButtonState("idle"), 2000);
    } catch {
      setButtonState("error");
    }
  }

  // ── derived values ──────────────────────────────────────────────────────────

  const rowCount = data?.rowCount ?? 0;
  const dbSizeBytes = data?.dbSizeBytes ?? 0;
  const lastIngest = data?.lastIngest ?? null;
  const lastRecallQuery = data?.lastRecallQuery ?? null;

  const dash = "—";

  const conversationsValue = isLoading ? dash : formatNum(rowCount);
  const conversationsSubtitle = isError
    ? "Database unavailable — check data/conversations.db path"
    : rowCount === 0
    ? "No sessions ingested yet"
    : `${formatNum(rowCount)} messages indexed`;

  const dbSizeValue = isLoading ? dash : formatBytes(dbSizeBytes);

  const lastIngestValue = isLoading
    ? dash
    : lastIngest
    ? formatRelativeTime(lastIngest)
    : dash;

  const lastRecallValue = isLoading
    ? dash
    : lastRecallQuery
    ? lastRecallQuery.slice(0, 24) + (lastRecallQuery.length > 24 ? "…" : "")
    : dash;

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
    idle: "Run Ingest",
    loading: "Ingesting...",
    success: "Run Ingest",
    error: "Ingest failed — click to retry",
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Section divider row */}
      <div className="col-span-2 lg:col-span-4 flex items-center gap-2">
        <span className="text-xs font-medium text-amber-500 uppercase tracking-wide">
          SQLite Store — all time
        </span>
        <InfoTooltip text="Local SQLite database storing all agent conversation history. 'Run Ingest' scans Claude, Qwen, Hermes, and Codex session files and indexes them for semantic search and recall." />
        <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">
          Local FTS5
        </span>
        <div className="flex-1 h-px bg-amber-900/40" />
        <button
          className={buttonClasses[buttonState]}
          onClick={handleIngest}
          disabled={buttonState === "loading"}
        >
          {buttonLabel[buttonState]}
        </button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          label="Conversations"
          value={conversationsValue}
          valueColor="text-sky-400"
          subtitle={isLoading ? undefined : conversationsSubtitle}
        />
        <KpiCard
          label="DB Size"
          value={dbSizeValue}
          valueColor="text-violet-400"
          subtitle={isLoading ? undefined : "conversations.db"}
        />
        <KpiCard
          label="Last Ingest"
          value={lastIngestValue}
          valueColor="text-amber-400"
        />
        <KpiCard
          label="Last Recall"
          value={lastRecallValue}
          valueColor="text-slate-100"
        />
      </div>
    </div>
  );
}
