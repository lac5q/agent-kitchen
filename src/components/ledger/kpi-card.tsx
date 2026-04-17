import { Card } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";

interface KpiCardProps {
  label: string;
  value: string | number;
  valueColor?: string;
  subtitle?: string;
  tooltip?: string;
}

export function KpiCard({
  label,
  value,
  valueColor = "text-slate-100",
  subtitle,
  tooltip,
}: KpiCardProps) {
  return (
    <Card className="border-slate-800 bg-slate-900/50 p-4">
      <p className="flex items-center text-xs text-slate-500">
        {label}
        {tooltip && <InfoTip text={tooltip} />}
      </p>
      <p className={`text-3xl font-bold mt-1 ${valueColor}`}>{value}</p>
      {subtitle && <p className="text-xs text-slate-400 mt-1">{subtitle}</p>}
    </Card>
  );
}
