import { Card } from "@/components/ui/card";

interface SummaryBarProps {
  total: number;
  active: number;
  tasks: number;
  errors: number;
}

export function SummaryBar({ total, active, tasks, errors }: SummaryBarProps) {
  const stats = [
    { label: "Total Chefs", value: total, color: "text-slate-100" },
    { label: "On Shift", value: active, color: "text-emerald-500" },
    { label: "Orders Active", value: tasks, color: "text-amber-500" },
    { label: "Incidents", value: errors, color: "text-rose-500" },
  ];
  return (
    <div className="grid grid-cols-4 gap-4">
      {stats.map((s) => (
        <Card key={s.label} className="border-slate-800 bg-slate-900/50 p-4">
          <p className="text-xs text-slate-500">{s.label}</p>
          <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
        </Card>
      ))}
    </div>
  );
}
