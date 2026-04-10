import { Card } from "@/components/ui/card";

interface SummaryBarProps {
  agentTotal: number;
  onShift: number;
  tasks: number;
  errors: number;
  devToolsConnected: number;
  devToolsPartial: number;
  devToolsTotal: number;
}

export function SummaryBar({
  agentTotal,
  onShift,
  tasks,
  errors,
  devToolsConnected,
  devToolsPartial,
  devToolsTotal,
}: SummaryBarProps) {
  const devToolsGap = devToolsTotal - devToolsConnected - devToolsPartial;

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
      {/* Agentic agents */}
      <Card className="border-slate-800 bg-slate-900/50 p-4">
        <p className="text-xs text-slate-500">Agents</p>
        <p className="text-2xl font-bold text-slate-100">{agentTotal}</p>
      </Card>
      <Card className="border-slate-800 bg-slate-900/50 p-4">
        <p className="text-xs text-slate-500">On Shift</p>
        <p className="text-2xl font-bold text-emerald-500">{onShift}</p>
      </Card>
      <Card className="border-slate-800 bg-slate-900/50 p-4">
        <p className="text-xs text-slate-500">Orders Active</p>
        <p className="text-2xl font-bold text-amber-500">{tasks}</p>
      </Card>
      <Card className="border-slate-800 bg-slate-900/50 p-4">
        <p className="text-xs text-slate-500">Incidents</p>
        <p className="text-2xl font-bold text-rose-500">{errors}</p>
      </Card>

      {/* Dev tools — single card with inline breakdown */}
      <Card className="border-blue-900/50 bg-blue-950/20 p-4">
        <p className="text-xs text-slate-500">Dev Tools</p>
        <div className="flex items-end gap-1 mt-0.5">
          <p className="text-2xl font-bold text-blue-400">{devToolsConnected}</p>
          <p className="text-sm text-slate-500 mb-0.5">/{devToolsTotal}</p>
        </div>
        <div className="flex gap-2 mt-1 text-xs">
          {devToolsPartial > 0 && (
            <span className="text-amber-400">{devToolsPartial} partial</span>
          )}
          {devToolsGap > 0 && (
            <span className="text-slate-500">{devToolsGap} gap</span>
          )}
        </div>
      </Card>
    </div>
  );
}
