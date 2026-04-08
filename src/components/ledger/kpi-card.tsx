import { Card } from "@/components/ui/card";

interface KpiCardProps {
  label: string;
  value: string | number;
  valueColor?: string;
  subtitle?: string;
}

export function KpiCard({
  label,
  value,
  valueColor = "text-slate-100",
  subtitle,
}: KpiCardProps) {
  return (
    <Card className="border-slate-800 bg-slate-900/50 p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${valueColor}`}>{value}</p>
      {subtitle && <p className="text-xs text-slate-400 mt-1">{subtitle}</p>}
    </Card>
  );
}
