"use client";

import { useState } from "react";
import { useApo } from "@/lib/api-client";
import { CycleStatus } from "@/components/apo/cycle-status";
import { ProposalCard } from "@/components/apo/proposal-card";
import { ProposalDetail } from "@/components/apo/proposal-detail";
import { LogViewer } from "@/components/apo/log-viewer";
import type { ApoProposal } from "@/types";

type TabFilter = "all" | "pending" | "archived";

const TABS: { value: TabFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "archived", label: "Archived" },
];

const EMPTY_STATS = {
  lastRun: null,
  totalProposals: 0,
  pendingProposals: 0,
  archivedProposals: 0,
  recentLogLines: [],
};

export default function ApoPage() {
  const { data, isLoading, error } = useApo();
  const [tab, setTab] = useState<TabFilter>("all");
  const [selected, setSelected] = useState<ApoProposal | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const allProposals = data?.proposals ?? [];
  const stats = data?.stats ?? EMPTY_STATS;
  const logLines = stats.recentLogLines;

  const filtered = allProposals.filter((p) => {
    if (tab === "all") return true;
    return p.status === tab;
  });

  // Pending first, then archived within the filtered list
  const sorted = [...filtered].sort((a, b) => {
    if (a.status === b.status) {
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    }
    return a.status === "pending" ? -1 : 1;
  });

  function handleCardClick(proposal: ApoProposal) {
    setSelected(proposal);
    setDrawerOpen(true);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-amber-500">The Sous Vide</h1>
        <p className="text-sm text-slate-400">
          Agent Lightning APO — Self-learning optimization
        </p>
      </div>

      {/* Cycle Stats */}
      <CycleStatus stats={stats} />

      {/* Tab Switcher */}
      <div className="flex items-center gap-1 border-b border-slate-800 pb-0">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={[
              "px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px",
              tab === t.value
                ? "border-amber-500 text-amber-400"
                : "border-transparent text-slate-400 hover:text-slate-200",
            ].join(" ")}
          >
            {t.label}
            {t.value === "pending" && stats.pendingProposals > 0 && (
              <span className="ml-1.5 rounded-full bg-amber-500/20 px-1.5 py-0.5 text-xs text-amber-400">
                {stats.pendingProposals}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Two-column layout: proposals + log */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left: Proposal List */}
        <div className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Proposals
          </h2>

          {isLoading && (
            <p className="text-sm text-slate-500 italic">Loading proposals…</p>
          )}

          {error && (
            <p className="text-sm text-rose-400">
              Failed to load proposals: {String(error)}
            </p>
          )}

          {!isLoading && !error && sorted.length === 0 && (
            <p className="text-sm text-slate-500 italic">
              No proposals in this view.
            </p>
          )}

          {sorted.map((proposal) => (
            <ProposalCard
              key={proposal.id}
              proposal={proposal}
              onClick={handleCardClick}
            />
          ))}
        </div>

        {/* Right: Log Viewer */}
        <div className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Cron Log (last 50 lines)
          </h2>
          <LogViewer lines={logLines} />
        </div>
      </div>

      {/* Proposal Detail Drawer */}
      <ProposalDetail
        proposal={selected}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
      />
    </div>
  );
}
