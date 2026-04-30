import { Card } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";

interface SummaryBarProps {
  total: number;
  active: number;
  tasks: number;
  errors: number;
}

export function SummaryBar({ total, active, tasks, errors }: SummaryBarProps) {
  const stats = [
    {
      label: "Total Chefs",
      value: total,
      color: "text-slate-100",
      tooltip: "All agents registered in the system — both local agents on this machine and remote agents connected via the remote-agents API. Counts both active and dormant agents.",
    },
    {
      label: "On Shift",
      value: active,
      color: "text-emerald-500",
      tooltip: "Agents currently in 'active' status. An agent is active when it has sent a heartbeat recently. Remote agents are considered active if the remote-agents API reports them as active.",
    },
    {
      label: "Orders Active",
      value: tasks,
      color: "text-amber-500",
      tooltip: "Local agents currently executing a task (have a non-null currentTask). Remote agents are excluded from this count as their task state is managed on their host machine.",
    },
    {
      label: "Incidents",
      value: errors,
      color: "text-rose-500",
      tooltip: "Agents in 'error' status — either failed their last task or became unreachable. Investigate the affected agent's logs to diagnose the incident.",
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {stats.map((s) => (
        <Card key={s.label} className="border-slate-800 bg-slate-900/50 p-4">
          <p className="flex items-center text-xs text-slate-500">
            {s.label}
            <InfoTip text={s.tooltip} />
          </p>
          <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
        </Card>
      ))}
    </div>
  );
}
