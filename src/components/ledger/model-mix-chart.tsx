"use client";

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface ModelMixDataPoint {
  name: string;
  value: number;
}

interface ModelMixChartProps {
  data: ModelMixDataPoint[];
}

const DONUT_COLORS = ["#f59e0b", "#0ea5e9", "#10b981", "#a855f7"];

function DarkTooltip({ active, payload }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; payload: { percent: number } }>;
}) {
  if (!active || !payload?.length) return null;
  const entry = payload[0];
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs shadow-xl">
      <p className="font-medium text-slate-200">{entry.name}</p>
      <p className="text-slate-400">
        {entry.value.toLocaleString()} calls ({(entry.payload.percent * 100).toFixed(1)}%)
      </p>
    </div>
  );
}

export function ModelMixChart({ data }: ModelMixChartProps) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={100}
          paddingAngle={3}
          dataKey="value"
        >
          {data.map((_, index) => (
            <Cell
              key={`cell-${index}`}
              fill={DONUT_COLORS[index % DONUT_COLORS.length]}
            />
          ))}
        </Pie>
        <Tooltip content={<DarkTooltip />} />
        <Legend
          wrapperStyle={{ fontSize: 12, color: "#94a3b8" }}
          iconType="circle"
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
