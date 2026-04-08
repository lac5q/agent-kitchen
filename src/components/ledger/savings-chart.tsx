"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface SavingsDataPoint {
  command: string;
  tokensUsed: number;
  tokensSaved: number;
}

interface SavingsChartProps {
  data: SavingsDataPoint[];
}

function formatK(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
  return String(value);
}

function DarkTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs shadow-xl">
      <p className="mb-1 font-medium text-slate-200">{label}</p>
      {payload.map((entry) => (
        <p key={entry.name} style={{ color: entry.color }}>
          {entry.name}: {formatK(entry.value)}
        </p>
      ))}
    </div>
  );
}

export function SavingsChart({ data }: SavingsChartProps) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart
        layout="vertical"
        data={data}
        margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
      >
        <XAxis
          type="number"
          tickFormatter={formatK}
          tick={{ fill: "#64748b", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="command"
          width={90}
          tick={{ fill: "#94a3b8", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip content={<DarkTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
        <Legend
          wrapperStyle={{ fontSize: 12, color: "#94a3b8" }}
          iconType="square"
        />
        <Bar dataKey="tokensUsed" name="Tokens Used" fill="#0ea5e9" stackId="a" radius={[0, 0, 0, 0]} />
        <Bar dataKey="tokensSaved" name="Tokens Saved" fill="#10b981" stackId="a" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
