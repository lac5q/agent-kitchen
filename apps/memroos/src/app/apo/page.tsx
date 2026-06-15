"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useApo } from "@/lib/api-client";
import { CycleStatus } from "@/components/apo/cycle-status";
import { ProposalCard } from "@/components/apo/proposal-card";
import { ProposalDetail } from "@/components/apo/proposal-detail";
import { LogViewer } from "@/components/apo/log-viewer";
import { InfoTip } from "@/components/ui/info-tip";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PageHeader } from "@/components/shared/ui";
import { NOC } from "@/lib/noc-theme";
import type { ApoProposal } from "@/types";

type TabFilter = "all" | "pending" | "approved" | "archived";

const TABS: { value: TabFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Queued" },
  { value: "archived", label: "Archived" },
];

const EMPTY_STATS = {
  lastRun: null,
  totalProposals: 0,
  pendingProposals: 0,
  approvedProposals: 0,
  archivedProposals: 0,
  recentLogLines: [],
};

function parseTabFilter(tab: string | null): TabFilter {
  return TABS.some((item) => item.value === tab) ? (tab as TabFilter) : "all";
}

function ApoPageContent() {
  const searchParams = useSearchParams();
  const { data, isLoading, error } = useApo();
  const [tab, setTab] = useState<TabFilter>(() => parseTabFilter(searchParams.get("tab")));
  const [selected, setSelected] = useState<ApoProposal | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const allProposals = data?.proposals ?? [];
  const stats = data?.stats ?? EMPTY_STATS;
  const logLines = stats.recentLogLines;

  const filtered = allProposals.filter((p) => {
    if (tab === "all") return true;
    return p.status === tab;
  });

  // Operator queue first, then completed items within the filtered list.
  const sorted = [...filtered].sort((a, b) => {
    if (a.status === b.status) {
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    }
    const order = { pending: 0, approved: 1, archived: 2 } as const;
    return order[a.status] - order[b.status];
  });

  function handleCardClick(proposal: ApoProposal) {
    setSelected(proposal);
    setDrawerOpen(true);
  }

  return (
    <TooltipProvider>
    <div className="space-y-6">
      <PageHeader
        eyebrow="Improve"
        title={<>Improvements <InfoTip text="APO = Agent Performance Optimizer. A self-learning loop that analyzes agent failures and usage patterns, then proposes improvements to skill files. Runs on a cron schedule and surfaces proposals here for review." /></>}
        hint="Agent performance proposals and self-learning optimization."
      />
      {/* Cycle Stats */}
      <CycleStatus stats={stats} />

      {/* Flow context banner removed — Flow does not generate real APO proposals */}

      {!isLoading && !error && stats.pendingProposals === 0 && stats.totalProposals > 0 && (
        <div className="rounded-md border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-900">
          APO is generating proposals, but none are awaiting review right now. Latest run:{" "}
          <span className="font-semibold">{stats.lastRun ? new Date(stats.lastRun).toLocaleString() : "unknown"}</span>;{" "}
          {stats.archivedProposals} archived proposal{stats.archivedProposals === 1 ? "" : "s"} are available under Archived.
          Approval buttons only appear on Pending proposals; archived proposals are already implemented audit history.
        </div>
      )}

      {!isLoading && !error && stats.totalProposals === 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          No APO proposal files were found at the configured proposal store. Check the cron log and `APO_PROPOSALS_PATH`.
        </div>
      )}

      {/* Tab Switcher */}
      <div className="flex items-center gap-1 pb-0" style={{ borderBottom: `1px solid ${NOC.rule}` }}>
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={[
              "px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px",
              tab === t.value
                ? "border-current"
                : "border-transparent",
            ].join(" ")}
            style={{ color: tab === t.value ? NOC.terraDeep : NOC.muted }}
          >
            {t.label}
            {t.value === "pending" && stats.pendingProposals > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 text-xs" style={{ background: NOC.warnBg, color: NOC.warn }}>
                {stats.pendingProposals}
              </span>
            )}
            {t.value === "approved" && stats.approvedProposals > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 text-xs" style={{ background: NOC.infoBg, color: NOC.info }}>
                {stats.approvedProposals}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Two-column layout: proposals + log */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left: Proposal List */}
        <div className="space-y-3">
          <h2 className="flex items-center text-xs font-semibold uppercase tracking-wide" style={{ color: NOC.soft }}>
            Proposals
            <InfoTip text="Skill improvement proposals generated by the APO cron job. Each proposal suggests a change to an existing skill file based on observed failures or usage patterns. Pending proposals await your review; archived proposals have been accepted or dismissed." />
          </h2>

          {isLoading && (
            <p className="text-sm italic" style={{ color: NOC.soft }}>Loading proposals...</p>
          )}

          {error && (
            <p className="text-sm text-rose-400">
              Failed to load proposals: {String(error)}
            </p>
          )}

          {!isLoading && !error && sorted.length === 0 && (
            <p className="text-sm italic" style={{ color: NOC.soft }}>
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
          <h2 className="text-xs font-semibold uppercase tracking-wide" style={{ color: NOC.soft }}>
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
    </TooltipProvider>
  );
}

export default function ApoPage() {
  return (
    <Suspense fallback={null}>
      <ApoPageContent />
    </Suspense>
  );
}
