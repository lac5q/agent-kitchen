import { Card } from "@/components/ui/card";
import type { ApoCycleStats } from "@/types";

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return "Never";
  return new Date(dateStr).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

interface CycleStatusProps {
  stats: ApoCycleStats;
}

export function CycleStatus({ stats }: CycleStatusProps) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <Card className="border-slate-800 bg-slate-900/50 p-4">
        <p className="text-xs text-slate-500 uppercase tracking-wide">Last Run</p>
        <p className="text-sm font-semibold text-slate-100 mt-1">
          {formatDateTime(stats.lastRun)}
        </p>
      </Card>

      <Card className="border-slate-800 bg-slate-900/50 p-4">
        <p className="text-xs text-slate-500 uppercase tracking-wide">Total Proposals</p>
        <p className="text-3xl font-bold text-slate-100 mt-1">
          {stats.totalProposals}
        </p>
      </Card>

      <Card className="border-slate-800 bg-slate-900/50 p-4">
        <p className="text-xs text-slate-500 uppercase tracking-wide">Pending</p>
        <p className="text-3xl font-bold text-amber-400 mt-1">
          {stats.pendingProposals}
        </p>
      </Card>

      <Card className="border-slate-800 bg-slate-900/50 p-4">
        <p className="text-xs text-slate-500 uppercase tracking-wide">Archived</p>
        <p className="text-3xl font-bold text-slate-400 mt-1">
          {stats.archivedProposals}
        </p>
      </Card>
    </div>
  );
}
